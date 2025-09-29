import { AEMInstance, InstanceOperationResult, ParallelExecutionOptions } from '@/types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { extractErrorMessage } from '@/utils/errors.js';

export class ParallelExecutor {

  async executeOnInstances<T>(
    instances: AEMInstance[],
    operation: (instance: AEMInstance) => Promise<T>,
    options: ParallelExecutionOptions = {}
  ): Promise<InstanceOperationResult<T>[]> {
    const { 
      requestId = uuidv4()
    } = options;
    
    const operations = instances.map(async (instance): Promise<InstanceOperationResult<T>> => {
      return this.executeOperation(instance, operation, requestId);
    });
    
    const results = await Promise.allSettled(operations);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const instance = instances[index];
        return {
          instanceUrl: instance?.url || 'unknown',
          success: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          duration: 0,
          requestId
        } as InstanceOperationResult<T>;
      }
    });
  }

  async executeInParallel<T>(
    operations: Array<{ key: string; operation: () => Promise<T> }>
  ): Promise<Record<string, T>> {
    const promises = operations.map(async ({ key, operation }) => {
      try {
        const result = await operation();
        return { key, result };
      } catch (error) {
        throw new Error(`Operation failed for key ${key}: ${extractErrorMessage(error)}`);
      }
    });

    const results = await Promise.allSettled(promises);
    const successfulResults: Record<string, T> = {};

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successfulResults[result.value.key] = result.value.result;
      }
    }

    return successfulResults;
  }
  
  private async executeOperation<T>(
    instance: AEMInstance,
    operation: (instance: AEMInstance) => Promise<T>,
    requestId: string
  ): Promise<InstanceOperationResult<T>> {
    const startTime = Date.now();
    try {
      const data = await operation(instance);
      const duration = Date.now() - startTime;
      
      return {
        instanceUrl: instance.url,
        success: true,
        data,
        duration,
        requestId
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        instanceUrl: instance.url,
        success: false,
        error: extractErrorMessage(error),
        duration,
        requestId
      };
    }
  }
}