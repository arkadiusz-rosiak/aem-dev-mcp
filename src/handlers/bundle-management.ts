import { 
  MCPToolResult, 
  AEMInstance, 
  BundleOperationResult,
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
import { BundleManagementService } from '@/services/bundle-management.service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createErrorResponse } from '@/utils/errors.js';
import { createLogger } from '@/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { 
  BundleListSchema, 
  BundleIdentifierSchema,
  BundleDetailsSchema,
  type BundleListInput,
  type BundleIdentifierInput,
  type BundleDetailsInput
} from '@/schemas/osgi.schemas.js';
import { TIMEOUTS } from '@/constants/timeouts.js';

const DEFAULT_CONCURRENCY = 10;

interface BundleConfig {
  readonly timeout: TimeoutMs;
  readonly maxConcurrency: ConcurrencyLimit;
}

const createBundleConfig = (overrides: Partial<BundleConfig> = {}): BundleConfig => ({
  timeout: TIMEOUTS.DEFAULT,
  maxConcurrency: createConcurrencyLimit(DEFAULT_CONCURRENCY),
  ...overrides
});

export const bundleListTool = {
  name: 'aem_bundle_list',
  description: 'List OSGi bundles from AEM instances',
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
        enum: ['Active', 'Resolved', 'Installed', 'Starting', 'Stopping', 'Uninstalled', 'Fragment'],
        description: 'Filter bundles by state'
      },
      nameFilter: {
        type: 'string',
        description: 'Filter bundles by name or symbolic name'
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 1000,
        default: 100,
        description: 'Maximum number of bundles to return per instance'
      },
      offset: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'Number of bundles to skip for pagination'
      }
    }
  }
};

const baseBundleOperationSchema = {
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
    bundleId: {
      type: 'integer',
      description: 'Bundle ID to operate on'
    },
    symbolicName: {
      type: 'string',
      description: 'Bundle symbolic name to operate on'
    }
  }
};

export const bundleStartTool = {
  name: 'aem_bundle_start',
  description: 'Start OSGi bundles on AEM instances',
  inputSchema: baseBundleOperationSchema
};

export const bundleStopTool = {
  name: 'aem_bundle_stop',
  description: 'Stop OSGi bundles on AEM instances',
  inputSchema: baseBundleOperationSchema
};

export const bundleRefreshTool = {
  name: 'aem_bundle_refresh',
  description: 'Refresh OSGi bundles on AEM instances',
  inputSchema: baseBundleOperationSchema
};

export const bundleUninstallTool = {
  name: 'aem_bundle_uninstall',
  description: 'Uninstall OSGi bundles on AEM instances',
  inputSchema: baseBundleOperationSchema
};

export const bundleRestartTool = {
  name: 'aem_bundle_restart',
  description: 'Restart OSGi bundles on AEM instances',
  inputSchema: baseBundleOperationSchema
};

export const bundleDetailsTool = {
  name: 'aem_bundle_details',
  description: 'Get detailed information about OSGi bundles from AEM instances',
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
      bundleId: {
        type: 'integer',
        description: 'Bundle ID to get details for'
      },
      symbolicName: {
        type: 'string',
        description: 'Bundle symbolic name to get details for'
      }
    }
  }
};

export async function handleBundleList(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = BundleListSchema.parse(args);
    const config = createBundleConfig();
    
    const bundleService = new BundleManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        return await bundleService.listBundles(
          instance,
          validatedInput.stateFilter,
          validatedInput.nameFilter,
          validatedInput.limit ?? 100,
          validatedInput.offset ?? 0
        );
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildBundleListResponse(requestId, results, instances);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error('Bundle list failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Bundle list failed: ${errorMessage}`,
      requestId
    );
  }
}

export async function handleBundleStart(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  return await handleSpecificBundleOperation(args, resolver, executor, client, 'start');
}

export async function handleBundleStop(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  return await handleSpecificBundleOperation(args, resolver, executor, client, 'stop');
}

export async function handleBundleRefresh(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  return await handleSpecificBundleOperation(args, resolver, executor, client, 'refresh');
}

export async function handleBundleUninstall(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  return await handleSpecificBundleOperation(args, resolver, executor, client, 'uninstall');
}

export async function handleBundleRestart(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = BundleIdentifierSchema.parse(args);
    const config = createBundleConfig();
    
    const bundleService = new BundleManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        if (validatedInput.bundleId) {
          return await bundleService.restartBundle(instance, validatedInput.bundleId);
        } else if (validatedInput.symbolicName) {
          return await executeBundleRestartByName(bundleService, instance, validatedInput.symbolicName);
        } else {
          throw new Error('Either bundleId or symbolicName must be provided');
        }
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildBundleOperationResponse(requestId, results, instances, 'restart');
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error('Bundle restart failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Bundle restart failed: ${errorMessage}`,
      requestId
    );
  }
}

export async function handleBundleDetails(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = BundleDetailsSchema.parse(args);
    const config = createBundleConfig();
    
    const bundleService = new BundleManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        return await bundleService.getBundleDetails(
          instance,
          validatedInput.bundleId,
          validatedInput.symbolicName
        );
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildBundleDetailsResponse(requestId, results, instances);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error('Bundle details retrieval failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Bundle details retrieval failed: ${errorMessage}`,
      requestId
    );
  }
}

async function handleSpecificBundleOperation(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient,
  action: 'start' | 'stop' | 'refresh' | 'uninstall'
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = BundleIdentifierSchema.parse(args);
    const config = createBundleConfig();
    
    const bundleService = new BundleManagementService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        if (validatedInput.bundleId) {
          return await executeBundleAction(bundleService, instance, validatedInput.bundleId, action);
        } else if (validatedInput.symbolicName) {
          return await executeBundleActionByName(bundleService, instance, validatedInput.symbolicName, action);
        } else {
          throw new Error('Either bundleId or symbolicName must be provided');
        }
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildBundleOperationResponse(requestId, results, instances, action);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error(`Bundle ${action} failed`, { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Bundle ${action} failed: ${errorMessage}`,
      requestId
    );
  }
}


async function resolveInstances(
  input: BundleListInput | BundleIdentifierInput | BundleDetailsInput,
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

async function executeBundleAction(
  service: BundleManagementService,
  instance: AEMInstance,
  bundleId: number,
  action: 'start' | 'stop' | 'uninstall' | 'refresh'
): Promise<BundleOperationResult> {
  switch (action) {
    case 'start':
      const startResult = await service.startBundle(instance, bundleId);
      return startResult.success ? startResult.data : { success: false, message: startResult.error.message };
    case 'stop':
      const stopResult = await service.stopBundle(instance, bundleId);
      return stopResult.success ? stopResult.data : { success: false, message: stopResult.error.message };
    case 'uninstall':
      const uninstallResult = await service.uninstallBundle(instance, bundleId);
      return uninstallResult.success ? uninstallResult.data : { success: false, message: uninstallResult.error.message };
    case 'refresh':
      const refreshResult = await service.refreshBundle(instance, bundleId);
      return refreshResult.success ? refreshResult.data : { success: false, message: refreshResult.error.message };
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}

async function executeBundleActionByName(
  service: BundleManagementService,
  instance: AEMInstance,
  symbolicName: string,
  action: 'start' | 'stop' | 'uninstall' | 'refresh'
): Promise<BundleOperationResult> {
  // First find the bundle by symbolic name
  const listResult = await service.listBundles(instance);
  if (!listResult.success) {
    return { success: false, message: `Failed to list bundles: ${listResult.error.message}` };
  }
  
  const bundle = listResult.data.find(b => b.symbolicName === symbolicName);
  if (!bundle) {
    return { success: false, message: `Bundle with symbolic name '${symbolicName}' not found` };
  }
  
  return await executeBundleAction(service, instance, bundle.id, action);
}

async function executeBundleRestartByName(
  service: BundleManagementService,
  instance: AEMInstance,
  symbolicName: string
): Promise<BundleOperationResult> {
  // First find the bundle by symbolic name
  const listResult = await service.listBundles(instance);
  if (!listResult.success) {
    return { success: false, message: `Failed to list bundles: ${listResult.error.message}` };
  }
  
  const bundle = listResult.data.find(b => b.symbolicName === symbolicName);
  if (!bundle) {
    return { success: false, message: `Bundle with symbolic name '${symbolicName}' not found` };
  }
  
  const restartResult = await service.restartBundle(instance, bundle.id);
  return restartResult.success ? restartResult.data : { success: false, message: restartResult.error.message };
}

function buildBundleListResponse(requestId: RequestId, results: any[], instances: AEMInstance[]) {
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
        bundles: {
          success: true,
          data: result.data,
          duration: result.duration
        }
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

function buildBundleOperationResponse(requestId: RequestId, results: any[], instances: AEMInstance[], action: string) {
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

function buildBundleDetailsResponse(requestId: RequestId, results: any[], instances: AEMInstance[]) {
  const response = {
    requestId,
    operation: 'bundle_details',
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
    if (result.success && result.data) {
      response.summary.successful++;
      response.results[instance.url] = {
        success: true,
        bundleDetails: result.data.data.bundleDetails,
        message: result.data.data.message || 'Bundle details retrieved successfully'
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