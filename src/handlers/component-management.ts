import { 
  MCPToolResult, 
  AEMInstance, 
  RequestId,
  TimeoutMs,
  ConcurrencyLimit,
  isNonEmptyArray
} from '@/types/index.js';
import {
  createConcurrencyLimit,
  createRequestId
} from '@/utils/type-factories.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { ComponentManagementService } from '@/services/component-management.service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createErrorResponse } from '@/utils/errors.js';
import { createLogger } from '@/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { TIMEOUTS } from '@/constants/timeouts.js';

const DEFAULT_CONCURRENCY = 10;

interface ComponentConfig {
  readonly timeout: TimeoutMs;
  readonly maxConcurrency: ConcurrencyLimit;
}

const createComponentConfig = (overrides: Partial<ComponentConfig> = {}): ComponentConfig => ({
  timeout: TIMEOUTS.DEFAULT,
  maxConcurrency: createConcurrencyLimit(DEFAULT_CONCURRENCY),
  ...overrides
});

const ComponentListSchema = z.object({
  aliases: z.array(z.string()).optional(),
  instances: z.array(z.object({
    url: z.string(),
    username: z.string(),
    password: z.string()
  })).optional(),
  stateFilter: z.enum(['active', 'satisfied', 'unsatisfied', 'disabled']).optional(),
  nameFilter: z.string().optional()
}).refine(data => data.aliases || data.instances, {
  message: "Either aliases or instances must be provided"
});

const ComponentNameSchema = z.object({
  aliases: z.array(z.string()).optional(),
  instances: z.array(z.object({
    url: z.string(),
    username: z.string(),
    password: z.string()
  })).optional(),
  componentName: z.string().min(1, "Component name is required").refine(val => val.trim().length > 0, "Component name cannot be empty or whitespace")
}).refine(data => data.aliases || data.instances, {
  message: "Either aliases or instances must be provided"
});

export const componentListTool = {
  name: 'aem_component_list',
  description: 'List OSGi components from AEM instances with optional state and name filtering',
  inputSchema: {
    type: 'object',
    properties: {
      aliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of instance aliases to check'
      },
      instances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            username: { type: 'string' },
            password: { type: 'string' }
          },
          required: ['url', 'username', 'password']
        },
        description: 'Array of AEM instances'
      },
      stateFilter: {
        type: 'string',
        enum: ['active', 'satisfied', 'unsatisfied', 'disabled'],
        description: 'Filter components by state'
      },
      nameFilter: {
        type: 'string',
        description: 'Filter components by name or PID'
      }
    }
  }
};

export const componentEnableTool = {
  name: 'aem_component_enable',
  description: 'Enable OSGi components on AEM instances by component name',
  inputSchema: {
    type: 'object',
    properties: {
      aliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of instance aliases'
      },
      instances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            username: { type: 'string' },
            password: { type: 'string' }
          },
          required: ['url', 'username', 'password']
        },
        description: 'Array of AEM instances'
      },
      componentName: {
        type: 'string',
        description: 'Component name to enable'
      }
    },
    required: ['componentName']
  }
};

export const componentDisableTool = {
  name: 'aem_component_disable',
  description: 'Disable OSGi components on AEM instances by component name',
  inputSchema: {
    type: 'object',
    properties: {
      aliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of instance aliases'
      },
      instances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            username: { type: 'string' },
            password: { type: 'string' }
          },
          required: ['url', 'username', 'password']
        },
        description: 'Array of AEM instances'
      },
      componentName: {
        type: 'string',
        description: 'Component name to disable'
      }
    },
    required: ['componentName']
  }
};

export const componentDetailsTool = {
  name: 'aem_component_details',
  description: 'Get detailed information about a specific OSGi component by name',
  inputSchema: {
    type: 'object',
    properties: {
      aliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of instance aliases'
      },
      instances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            username: { type: 'string' },
            password: { type: 'string' }
          },
          required: ['url', 'username', 'password']
        },
        description: 'Array of AEM instances'
      },
      componentName: {
        type: 'string',
        description: 'Component name to get details for'
      }
    },
    required: ['componentName']
  }
};

export async function handleComponentList(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = ComponentListSchema.parse(args);
    const config = createComponentConfig();
    
    const componentService = new ComponentManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        return await componentService.listComponents(
          instance,
          validatedInput.stateFilter,
          validatedInput.nameFilter
        );
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildComponentListResponse(requestId, results, instances);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error('Component list failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Component list failed: ${errorMessage}`,
      requestId
    );
  }
}

export async function handleComponentEnable(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  return await handleComponentOperation(args, resolver, executor, client, 'enable');
}

export async function handleComponentDisable(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  return await handleComponentOperation(args, resolver, executor, client, 'disable');
}

export async function handleComponentDetails(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = ComponentNameSchema.parse(args);
    const config = createComponentConfig();
    
    const componentService = new ComponentManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        return await componentService.getComponentDetails(
          instance,
          validatedInput.componentName
        );
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildComponentDetailsResponse(requestId, results, instances);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error('Component details failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Component details failed: ${errorMessage}`,
      requestId
    );
  }
}

async function handleComponentOperation(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient,
  action: 'enable' | 'disable'
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = ComponentNameSchema.parse(args);
    const config = createComponentConfig();
    
    const componentService = new ComponentManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        if (action === 'enable') {
          return await componentService.enableComponent(
            instance,
            validatedInput.componentName
          );
        } else {
          return await componentService.disableComponent(
            instance,
            validatedInput.componentName
          );
        }
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildComponentOperationResponse(requestId, results, instances, action);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error(`Component ${action} failed`, { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Component ${action} failed: ${errorMessage}`,
      requestId
    );
  }
}

async function resolveInstances(
  input: z.infer<typeof ComponentListSchema> | z.infer<typeof ComponentNameSchema>,
  resolver: AliasResolver
): Promise<AEMInstance[]> {
  const instances: AEMInstance[] = [];
  
  if (input.instances) {
    instances.push(...input.instances);
  }
  
  if (input.aliases) {
    for (const alias of input.aliases) {
      const resolution = await resolver.resolveAlias(alias);
      if (resolution.resolved) {
        instances.push(...resolution.instances);
      }
    }
  }
  
  return instances;
}

function buildComponentListResponse(requestId: RequestId, results: any[], instances: AEMInstance[]) {
  const response = {
    requestId,
    summary: {
      total: instances.length,
      successful: 0,
      failed: 0
    },
    results: {} as Record<string, any>,
    metadata: {
      timestamp: new Date().toISOString(),
      totalInstances: instances.length
    }
  };

  results.forEach((result, index) => {
    const instance = instances[index];
    if (result.success) {
      response.summary.successful++;
      response.results[instance.url] = {
        success: true,
        components: result.data,
        componentCount: result.data.length
      };
    } else {
      response.summary.failed++;
      response.results[instance.url] = {
        success: false,
        error: result.error || 'Unknown error'
      };
    }
  });

  return response;
}

function buildComponentOperationResponse(requestId: RequestId, results: any[], instances: AEMInstance[], operation: string) {
  const response = {
    requestId,
    operation,
    summary: {
      total: instances.length,
      successful: 0,
      failed: 0
    },
    results: {} as Record<string, any>,
    metadata: {
      timestamp: new Date().toISOString(),
      totalInstances: instances.length
    }
  };

  results.forEach((result, index) => {
    const instance = instances[index];
    if (result.success) {
      response.summary.successful++;
      response.results[instance.url] = result.data;
    } else {
      response.summary.failed++;
      response.results[instance.url] = {
        success: false,
        error: result.error || 'Unknown error'
      };
    }
  });

  return response;
}

function buildComponentDetailsResponse(requestId: RequestId, results: any[], instances: AEMInstance[]) {
  const response = {
    requestId,
    operation: 'details',
    summary: {
      total: instances.length,
      successful: 0,
      failed: 0
    },
    results: {} as Record<string, any>,
    metadata: {
      timestamp: new Date().toISOString(),
      totalInstances: instances.length
    }
  };

  results.forEach((result, index) => {
    const instance = instances[index];
    if (result.success) {
      response.summary.successful++;
      response.results[instance.url] = {
        success: true,
        component: result.data
      };
    } else {
      response.summary.failed++;
      response.results[instance.url] = {
        success: false,
        error: result.error || 'Unknown error'
      };
    }
  });

  return response;
}