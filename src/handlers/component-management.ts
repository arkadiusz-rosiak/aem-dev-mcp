import { 
  MCPToolResult, 
  AEMInstance, 
  ComponentOperationResult,
  BulkOperationResult,
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
import { 
  ComponentListSchema, 
  ComponentIdentifierSchema,
  ComponentBulkOperationSchema,
  MAX_BULK_OPERATIONS,
  type ComponentListInput,
  type ComponentIdentifierInput,
  type ComponentBulkOperationInput
} from '@/schemas/osgi.schemas.js';
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

export const componentListTool = {
  name: 'aem_component_list',
  description: 'List OSGi components from AEM instances',
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

const baseComponentOperationSchema = {
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
    componentId: {
      type: 'integer',
      description: 'Component ID to operate on'
    },
    componentName: {
      type: 'string',
      description: 'Component name to operate on'
    }
  }
};

export const componentEnableTool = {
  name: 'aem_component_enable',
  description: 'Enable OSGi components on AEM instances',
  inputSchema: baseComponentOperationSchema
};

export const componentDisableTool = {
  name: 'aem_component_disable',
  description: 'Disable OSGi components on AEM instances',
  inputSchema: baseComponentOperationSchema
};

export const componentBulkOperationTool = {
  name: 'aem_component_bulk_operation',
  description: 'Perform bulk operations on multiple OSGi components',
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
      componentIds: {
        type: 'array',
        items: { type: 'integer' },
        description: `Array of component IDs (max ${MAX_BULK_OPERATIONS})`
      },
      componentNames: {
        type: 'array',
        items: { type: 'string' },
        description: `Array of component names (max ${MAX_BULK_OPERATIONS})`
      },
      action: {
        type: 'string',
        enum: ['enable', 'disable'],
        description: 'Action to perform on the components'
      }
    },
    required: ['action']
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
  return await handleSpecificComponentOperation(args, resolver, executor, client, 'enable');
}

export async function handleComponentDisable(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  return await handleSpecificComponentOperation(args, resolver, executor, client, 'disable');
}

async function handleSpecificComponentOperation(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient,
  action: 'enable' | 'disable'
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = ComponentIdentifierSchema.parse(args);
    const config = createComponentConfig();
    
    const componentService = new ComponentManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        if (validatedInput.componentId) {
          return await executeComponentAction(componentService, instance, validatedInput.componentId, action);
        } else if (validatedInput.componentName) {
          return await executeComponentActionByName(componentService, instance, validatedInput.componentName, action);
        } else {
          throw new Error('Either componentId or componentName must be provided');
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

export async function handleComponentBulkOperation(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = ComponentBulkOperationSchema.parse(args);
    const config = createComponentConfig();
    
    const componentService = new ComponentManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        if (validatedInput.componentIds && validatedInput.componentIds.length > 0) {
          return await componentService.performBulkComponentOperation(
            instance, 
            validatedInput.componentIds, 
            validatedInput.action
          );
        } else if (validatedInput.componentNames && validatedInput.componentNames.length > 0) {
          return await executeComponentBulkActionByName(
            componentService, 
            instance, 
            validatedInput.componentNames, 
            validatedInput.action
          );
        } else {
          throw new Error('Either componentIds or componentNames must be provided');
        }
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildComponentBulkOperationResponse(requestId, results, instances, validatedInput.action);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error('Component bulk operation failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Component bulk operation failed: ${errorMessage}`,
      requestId
    );
  }
}

async function resolveInstances(
  input: ComponentListInput | ComponentIdentifierInput | ComponentBulkOperationInput,
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

async function executeComponentAction(
  service: ComponentManagementService,
  instance: AEMInstance,
  componentId: number,
  action: 'enable' | 'disable'
): Promise<ComponentOperationResult> {
  switch (action) {
    case 'enable':
      const enableResult = await service.enableComponent(instance, componentId);
      return enableResult.success ? enableResult.data : { success: false, message: enableResult.error.message };
    case 'disable':
      const disableResult = await service.disableComponent(instance, componentId);
      return disableResult.success ? disableResult.data : { success: false, message: disableResult.error.message };
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}

async function executeComponentActionByName(
  service: ComponentManagementService,
  instance: AEMInstance,
  componentName: string,
  action: 'enable' | 'disable'
): Promise<ComponentOperationResult> {
  // First find the component by name
  const listResult = await service.listComponents(instance);
  if (!listResult.success) {
    return { success: false, message: `Failed to list components: ${listResult.error.message}` };
  }
  
  const component = listResult.data.find(c => c.name === componentName || c.pid === componentName);
  if (!component) {
    return { success: false, message: `Component with name '${componentName}' not found` };
  }
  
  return await executeComponentAction(service, instance, component.id, action);
}

async function executeComponentBulkActionByName(
  service: ComponentManagementService,
  instance: AEMInstance,
  componentNames: string[],
  action: 'enable' | 'disable'
): Promise<BulkOperationResult<ComponentOperationResult>> {
  // First find all components by names
  const listResult = await service.listComponents(instance);
  if (!listResult.success) {
    return {
      success: false,
      results: [],
      message: `Failed to list components: ${listResult.error.message}`,
      totalCount: componentNames.length,
      successCount: 0,
      failureCount: componentNames.length
    };
  }
  
  const componentIds: number[] = [];
  const notFound: string[] = [];
  
  for (const name of componentNames) {
    const component = listResult.data.find(c => c.name === name || c.pid === name);
    if (component) {
      componentIds.push(component.id);
    } else {
      notFound.push(name);
    }
  }
  
  if (componentIds.length === 0) {
    return {
      success: false,
      results: [],
      message: `No components found: ${notFound.join(', ')}`,
      totalCount: componentNames.length,
      successCount: 0,
      failureCount: componentNames.length
    };
  }
  
  const bulkResult = await service.performBulkComponentOperation(instance, componentIds, action);
  
  if (bulkResult.success) {
    return bulkResult.data;
  } else {
    return {
      success: false,
      results: [],
      message: bulkResult.error.message,
      totalCount: componentNames.length,
      successCount: 0,
      failureCount: componentNames.length
    };
  }
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

function buildComponentOperationResponse(requestId: RequestId, results: any[], instances: AEMInstance[], action: string) {
  const response = {
    requestId,
    operation: action,
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

function buildComponentBulkOperationResponse(requestId: RequestId, results: any[], instances: AEMInstance[], action: string) {
  const response = {
    requestId,
    operation: action,
    summary: {
      total: instances.length,
      successful: 0,
      failed: 0,
      totalComponentOperations: 0,
      successfulComponentOperations: 0,
      failedComponentOperations: 0
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
      response.summary.totalComponentOperations += result.data.totalCount || 0;
      response.summary.successfulComponentOperations += result.data.successCount || 0;
      response.summary.failedComponentOperations += result.data.failureCount || 0;
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