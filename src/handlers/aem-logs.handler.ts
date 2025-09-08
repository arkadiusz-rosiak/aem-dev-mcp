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
import { AemLogsService } from '@/services/aem-logs.service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createErrorResponse } from '@/utils/errors.js';
import { createLogger } from '@/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { 
  AemLogsSearchInputSchema,
  type AemLogsSearchInput
} from '@/schemas/aem-logs.schemas.js';
import { 
  AemLogsSearchOutput 
} from '@/types/aem-logs.types.js';
import { TIMEOUTS } from '@/constants/timeouts.js';

const DEFAULT_CONCURRENCY = 10;

interface LogsConfig {
  readonly timeout: TimeoutMs;
  readonly maxConcurrency: ConcurrencyLimit;
}

const createLogsConfig = (overrides: Partial<LogsConfig> = {}): LogsConfig => ({
  timeout: (TIMEOUTS.DEFAULT * 2) as TimeoutMs,
  maxConcurrency: createConcurrencyLimit(DEFAULT_CONCURRENCY),
  ...overrides
});

export const aemLogsSearchTool = {
  name: 'aem_logs_search',
  description: 'Search AEM logs with regex patterns across different log types and navigate through paginated results',
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
      regex: {
        type: 'string',
        description: 'Pattern for filtering log entries (supports full regex syntax)'
      },
      log_type: {
        type: 'string',
        enum: [
          'application_errors',
          'http_requests', 
          'web_access',
          'audit',
          'startup_messages',
          'system_errors',
          'bundle_lifecycle',
          'history',
          'upgrade_operations'
        ],
        default: 'application_errors',
        description: 'Type of log to search'
      },
      page: {
        type: 'integer',
        minimum: 1,
        default: 1,
        description: 'Page number for navigation'
      }
    },
    required: ['regex']
  }
};

export async function handleAemLogsSearch(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = AemLogsSearchInputSchema.parse(args);
    const config = createLogsConfig();
    
    const logsService = new AemLogsService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executor.executeOnInstances(
      instances,
      async (instance: AEMInstance) => {
        return await logsService.searchLogs(
          instance,
          validatedInput.regex,
          validatedInput.log_type,
          validatedInput.page
        );
      },
      {
        maxConcurrency: config.maxConcurrency,
        timeout: config.timeout
      }
    );
    
    const response = buildLogsSearchResponse(requestId, results, instances, validatedInput);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger.error('AEM logs search failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `AEM logs search failed: ${errorMessage}`,
      requestId
    );
  }
}

async function resolveInstances(
  input: AemLogsSearchInput,
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

function buildLogsSearchResponse(
  requestId: RequestId, 
  results: unknown[], 
  instances: AEMInstance[],
  input: AemLogsSearchInput
): AemLogsSearchOutput & { requestId: RequestId; metadata: { timestamp: string; search_parameters: { regex: string; log_type: string; page: number }; totalInstances: number } } {
  const searchResults: unknown[] = [];
  let successfulInstances = 0;
  let failedInstances = 0;

  results.forEach((result, index) => {
    const instance = instances[index];
    
    if (result.success && result.data.success) {
      successfulInstances++;
      searchResults.push(result.data.result);
    } else {
      failedInstances++;
      // Add failed instance with empty results
      searchResults.push({
        instance: instance.url,
        log_type: input.log_type,
        entries: [],
        pagination: {
          current_page: input.page,
          total_pages: 1,
          total_entries: 0,
          entries_on_page: 0
        },
        regex_used: input.regex,
        error: result.error?.message || result.data?.error?.message || 'Unknown error'
      });
    }
  });

  return {
    requestId,
    results: searchResults,
    summary: {
      total_instances: instances.length,
      successful_instances: successfulInstances,
      failed_instances: failedInstances
    },
    metadata: {
      timestamp: new Date().toISOString(),
      search_parameters: {
        regex: input.regex,
        log_type: input.log_type,
        page: input.page
      },
      totalInstances: instances.length
    }
  };
}