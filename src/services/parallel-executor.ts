import { AEMInstance, InstanceOperationResult, ParallelExecutionOptions } from '@/types.js';
import { Semaphore } from '@/utils/semaphore.js';

export class ParallelExecutor {
  private semaphore: Semaphore;
  
  constructor(maxConcurrency: number = 10) {
    this.semaphore = new Semaphore(maxConcurrency);
  }
  
  async executeOnInstances<T>(
    instances: AEMInstance[],
    operation: (instance: AEMInstance) => Promise<T>,
    options: ParallelExecutionOptions = {}
  ): Promise<InstanceOperationResult<T>[]> {
    const { requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` } = options;
    
    const operations = instances.map(async (instance): Promise<InstanceOperationResult<T>> => {
      await this.semaphore.acquire();
      
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
          error: error instanceof Error ? error.message : String(error),
          duration,
          requestId
        };
      } finally {
        this.semaphore.release();
      }
    });
    
    return await Promise.allSettled(operations).then(results =>
      results.map(result =>
        result.status === 'fulfilled' 
          ? result.value 
          : {
              instanceUrl: 'unknown',
              success: false,
              error: 'Promise rejected',
              requestId
            }
      )
    );
  }
  
  updateConcurrency(newLimit: number): void {
    this.semaphore = new Semaphore(newLimit);
  }
}