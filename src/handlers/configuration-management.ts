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
import { ConfigurationManagementService } from '@/services/configuration-management.service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createErrorResponse } from '@/utils/errors.js';
import { createLogger } from '@/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { 
  ConfigurationListSchema, 
  ConfigurationGetSchema,
  ConfigurationCreateSchema,
  ConfigurationUpdateSchema,
  ConfigurationDeleteSchema,
  ConfigurationUnbindSchema,
  type ConfigurationListInput,
  type ConfigurationGetInput,
  type ConfigurationCreateInput,
  type ConfigurationUpdateInput,
  type ConfigurationDeleteInput,
  type ConfigurationUnbindInput
} from '@/schemas/osgi.schemas.js';
import { TIMEOUTS } from '@/constants/timeouts.js';

const DEFAULT_CONCURRENCY = 10;

interface ConfigurationConfig {
  readonly timeout: TimeoutMs;
  readonly maxConcurrency: ConcurrencyLimit;
}

const createConfigurationConfig = (overrides: Partial<ConfigurationConfig> = {}): ConfigurationConfig => ({
  timeout: TIMEOUTS.DEFAULT,
  maxConcurrency: createConcurrencyLimit(DEFAULT_CONCURRENCY),
  ...overrides
});

export const configurationListTool = {
  name: 'aem_configuration_list',
  description: 'List OSGi configurations from AEM instances',
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
      pidFilter: {
        type: 'string',
        description: 'Filter configurations by PID'
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 1000,
        default: 100,
        description: 'Maximum number of configurations to return per instance'
      },
      offset: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'Number of configurations to skip for pagination'
      }
    }
  }
};

export const configurationGetTool = {
  name: 'aem_configuration_get',
  description: 'Get a specific OSGi configuration',
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
      pid: {
        type: 'string',
        description: 'Configuration PID to retrieve'
      }
    },
    required: ['pid']
  }
};

export const configurationCreateTool = {
  name: 'aem_configuration_create',
  description: 'Create a new OSGi configuration',
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
      pid: {
        type: 'string',
        description: 'Configuration PID'
      },
      properties: {
        type: 'object',
        description: 'Configuration properties'
      },
      factoryPid: {
        type: 'string',
        description: 'Factory PID for factory configurations'
      },
      bundleLocation: {
        type: 'string',
        description: 'Bundle location'
      }
    },
    required: ['pid', 'properties']
  }
};

export const configurationUpdateTool = {
  name: 'aem_configuration_update',
  description: 'Update an existing OSGi configuration',
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
      pid: {
        type: 'string',
        description: 'Configuration PID'
      },
      properties: {
        type: 'object',
        description: 'Configuration properties'
      },
      factoryPid: {
        type: 'string',
        description: 'Factory PID for factory configurations'
      },
      bundleLocation: {
        type: 'string',
        description: 'Bundle location'
      }
    },
    required: ['pid', 'properties']
  }
};

export const configurationDeleteTool = {
  name: 'aem_configuration_delete',
  description: 'Delete an OSGi configuration',
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
      pid: {
        type: 'string',
        description: 'Configuration PID to delete'
      }
    },
    required: ['pid']
  }
};

export const configurationUnbindTool = {
  name: 'aem_configuration_unbind',
  description: 'Unbind an OSGi configuration from a bundle',
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
      pid: {
        type: 'string',
        description: 'Configuration PID to unbind'
      },
      bundleLocation: {
        type: 'string',
        description: 'Bundle location to unbind from'
      }
    },
    required: ['pid']
  }
};

export async function handleConfigurationList(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = ConfigurationListSchema.parse(args);
    const config = createConfigurationConfig();
    
    const configService = new ConfigurationManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        return await configService.listConfigurations(
          instance,
          validatedInput.pidFilter,
          validatedInput.limit ?? 100,
          validatedInput.offset ?? 0
        );
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildConfigurationListResponse(requestId, results, instances);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error('Configuration list failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Configuration list failed: ${errorMessage}`,
      requestId
    );
  }
}

export async function handleConfigurationGet(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = ConfigurationGetSchema.parse(args);
    const config = createConfigurationConfig();
    
    const configService = new ConfigurationManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        return await configService.getConfiguration(
          instance,
          validatedInput.pid
        );
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildConfigurationGetResponse(requestId, results, instances, validatedInput.pid);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error('Configuration get failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Configuration get failed: ${errorMessage}`,
      requestId
    );
  }
}

export async function handleConfigurationCreate(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = ConfigurationCreateSchema.parse(args);
    const config = createConfigurationConfig();
    
    const configService = new ConfigurationManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        return await configService.createConfiguration(instance, {
          pid: validatedInput.pid,
          properties: validatedInput.properties,
          factoryPid: validatedInput.factoryPid,
          bundleLocation: validatedInput.bundleLocation
        });
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildConfigurationOperationResponse(requestId, results, instances, 'create');
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error('Configuration create failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Configuration create failed: ${errorMessage}`,
      requestId
    );
  }
}

export async function handleConfigurationUpdate(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = ConfigurationUpdateSchema.parse(args);
    const config = createConfigurationConfig();
    
    const configService = new ConfigurationManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        return await configService.updateConfiguration(instance, {
          pid: validatedInput.pid,
          properties: validatedInput.properties,
          factoryPid: validatedInput.factoryPid,
          bundleLocation: validatedInput.bundleLocation
        });
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildConfigurationOperationResponse(requestId, results, instances, 'update');
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error('Configuration update failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Configuration update failed: ${errorMessage}`,
      requestId
    );
  }
}

export async function handleConfigurationDelete(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = ConfigurationDeleteSchema.parse(args);
    const config = createConfigurationConfig();
    
    const configService = new ConfigurationManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        return await configService.deleteConfiguration(
          instance,
          validatedInput.pid
        );
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildConfigurationOperationResponse(requestId, results, instances, 'delete');
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error('Configuration delete failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Configuration delete failed: ${errorMessage}`,
      requestId
    );
  }
}

export async function handleConfigurationUnbind(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = ConfigurationUnbindSchema.parse(args);
    const config = createConfigurationConfig();
    
    const configService = new ConfigurationManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        return await configService.unbindConfiguration(
          instance,
          validatedInput.pid,
          validatedInput.bundleLocation
        );
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildConfigurationOperationResponse(requestId, results, instances, 'unbind');
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error('Configuration unbind failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Configuration unbind failed: ${errorMessage}`,
      requestId
    );
  }
}

async function resolveInstances(
  input: ConfigurationListInput | ConfigurationGetInput | ConfigurationCreateInput | ConfigurationUpdateInput | ConfigurationDeleteInput | ConfigurationUnbindInput,
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

function buildConfigurationListResponse(requestId: RequestId, results: any[], instances: AEMInstance[]) {
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
        configurations: result.data,
        configurationCount: result.data.length
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

function buildConfigurationGetResponse(requestId: RequestId, results: any[], instances: AEMInstance[], pid: string) {
  const response = {
    requestId,
    pid,
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
        configuration: result.data
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

function buildConfigurationOperationResponse(requestId: RequestId, results: any[], instances: AEMInstance[], operation: string) {
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