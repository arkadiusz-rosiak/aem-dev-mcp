import { 
  MCPToolResult, 
  AEMInstance, 
  RequestId,
  TimeoutMs,
  ConcurrencyLimit,
  isNonEmptyArray,
  NonEmptyArray
} from '@/types/index.js';
import {
  createConcurrencyLimit,
  createRequestId,
  createTimeout
} from '@/utils/type-factories.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createErrorResponse } from '@/utils/errors.js';
import { createLogger } from '@/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { 
  GroovyExecuteSchema, 
  DEFAULT_TIMEOUT,
  type GroovyExecuteInput 
} from '@/schemas/groovy-execute.schema.js';
import { AxiosResponse } from 'axios';

const DEFAULT_CONCURRENCY = 20;

interface GroovyExecuteConfig {
  readonly timeout: TimeoutMs;
  readonly maxConcurrency: ConcurrencyLimit;
}

const createGroovyExecuteConfig = (timeout?: number): GroovyExecuteConfig => ({
  timeout: createTimeout(timeout || DEFAULT_TIMEOUT),
  maxConcurrency: createConcurrencyLimit(DEFAULT_CONCURRENCY)
});

interface GroovyConsoleResponse {
  output?: string;
  result?: unknown;
  runningTime?: string;
  exceptionStackTrace?: string;
}

interface GroovyExecutionResponse {
  readonly success: boolean;
  readonly instanceUrl: string;
  readonly executionTime: number;
  readonly output: string;
  readonly result?: unknown;
  readonly runningTime?: string;
  readonly error?: {
    message: string;
    stackTrace?: string;
    exceptionStackTrace?: string;
  };
}

interface GroovyExecutionResults {
  readonly alias: string;
  readonly results: readonly GroovyExecutionResponse[];
  readonly summary: {
    readonly total: number;
    readonly succeeded: number;
    readonly failed: number;
  };
}

interface SingleInstanceResult {
  readonly requestId: string;
  readonly instanceUrl: string;
  readonly response: GroovyExecutionResponse;
}

interface MultipleInstanceResult {
  readonly requestId: string;
  readonly results: GroovyExecutionResults;
}

type GroovyExecuteResult = SingleInstanceResult | MultipleInstanceResult;

async function executeGroovyScript(
  instance: AEMInstance,
  input: GroovyExecuteInput,
  client: AemHttpClient,
  timeout: TimeoutMs
): Promise<GroovyExecutionResponse> {
  const startTime = Date.now();
  
  try {
    const formData = new URLSearchParams();
    
    if (input.script) {
      formData.append('script', input.script);
    } else if (input.scriptPath) {
      formData.append('scriptPath', input.scriptPath);
    }
    
    // Send form data to AEM Groovy Console endpoint
    // Note: Content-Type header is automatically set by axios for URLSearchParams
    const response: AxiosResponse = await client.makeRequest(
      instance,
      '/bin/groovyconsole/post.json',
      'POST',
      formData.toString(),
      timeout
    );
    
    const executionTime = Date.now() - startTime;
    
    if (response.status !== 200) {
      return {
        success: false,
        instanceUrl: instance.url,
        executionTime,
        output: '',
        error: {
          message: `HTTP ${response.status}: ${response.statusText}`,
          stackTrace: response.data ? JSON.stringify(response.data) : undefined
        }
      };
    }
    
    const data: GroovyConsoleResponse = response.data;
    
    if (data.exceptionStackTrace) {
      return {
        success: false,
        instanceUrl: instance.url,
        executionTime,
        output: data.output || '',
        error: {
          message: 'Script execution failed',
          exceptionStackTrace: data.exceptionStackTrace
        }
      };
    }
    
    return {
      success: true,
      instanceUrl: instance.url,
      executionTime,
      output: data.output || '',
      result: data.result,
      runningTime: data.runningTime
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return {
      success: false,
      instanceUrl: instance.url,
      executionTime,
      output: '',
      error: {
        message: errorMessage,
        stackTrace: error instanceof Error ? error.stack : undefined
      }
    };
  }
}

async function executeOnMultipleInstances(
  instances: NonEmptyArray<AEMInstance>,
  input: GroovyExecuteInput,
  executor: ParallelExecutor,
  client: AemHttpClient,
  requestId: RequestId,
  config: GroovyExecuteConfig
): Promise<GroovyExecutionResults> {
  const results = await executor.executeOnInstances(
    instances,
    async (instance) => {
      return await executeGroovyScript(instance, input, client, config.timeout);
    },
    { 
      requestId,
      timeout: config.timeout,
      maxConcurrency: config.maxConcurrency
    }
  );
  
  const createFailureResponse = (result: any): GroovyExecutionResponse => ({
    success: false,
    instanceUrl: result.instanceUrl || 'unknown',
    executionTime: result.duration || 0,
    output: '',
    error: {
      message: result.error || 'Unknown error'
    }
  });

  const groovyResults: GroovyExecutionResponse[] = results.map(result => 
    result.success && result.data 
      ? result.data as GroovyExecutionResponse
      : createFailureResponse(result)
  );
  
  const summary = groovyResults.reduce(
    (acc, result) => ({
      total: acc.total + 1,
      succeeded: acc.succeeded + (result.success ? 1 : 0),
      failed: acc.failed + (result.success ? 0 : 1)
    }),
    { total: 0, succeeded: 0, failed: 0 }
  );
  
  return {
    alias: input.instanceAlias,
    results: groovyResults,
    summary
  };
}

export async function handleGroovyExecute(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = GroovyExecuteSchema.parse(args);
    const config = createGroovyExecuteConfig(validatedInput.timeout);
    
    const aliasResult = await resolver.resolveAlias(validatedInput.instanceAlias);
    
    if (!aliasResult.resolved) {
      throw new Error(`Failed to resolve alias: ${validatedInput.instanceAlias}. ${aliasResult.error || ''}`);
    }
    
    const instances = [...aliasResult.instances];
    
    if (!isNonEmptyArray(instances)) {
      throw new Error(`No instances found for alias: ${validatedInput.instanceAlias}`);
    }
    
    let result: GroovyExecuteResult;
    
    if (instances.length === 1) {
      const response = await executeGroovyScript(
        instances[0],
        validatedInput,
        client,
        config.timeout
      );
      
      result = {
        requestId,
        instanceUrl: instances[0].url,
        response
      };
    } else {
      const results = await executeOnMultipleInstances(
        instances,
        validatedInput,
        executor,
        client,
        requestId,
        config
      );
      
      result = {
        requestId,
        results
      };
    }
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger?.error?.('Groovy execution failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Groovy execution failed: ${errorMessage}`,
      requestId
    );
  }
}

export const groovyExecuteTool = {
  name: 'aem_groovy_execute',
  description: 'Execute Groovy scripts on AEM instances via Groovy Console for maintenance and automation tasks',
  inputSchema: {
    type: 'object',
    properties: {
      script: {
        type: 'string',
        description: 'Groovy script content to execute directly'
      },
      scriptPath: {
        type: 'string',
        description: 'Path to existing script on AEM instance (e.g., /conf/groovyconsole/scripts/example.groovy)'
      },
      instanceAlias: {
        type: 'string',
        description: 'AEM instance alias or URL from configuration'
      },
      timeout: {
        type: 'number',
        description: 'Execution timeout in milliseconds (optional, default 30000)'
      }
    },
    required: ['instanceAlias'],
    oneOf: [
      { required: ['script'] },
      { required: ['scriptPath'] }
    ]
  } as const
} as const;