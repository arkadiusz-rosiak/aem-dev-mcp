import { AEMInstance, InstanceOperationResult, ParallelExecutionOptions } from '@/types.js';
import { Semaphore } from '@/utils/semaphore.js';
import { v4 as uuidv4 } from 'uuid';

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

export class ParallelExecutor {
  private semaphore: Semaphore;
  private pendingRequests: Map<string, PendingRequest<InstanceOperationResult<unknown>>>;
  private readonly requestCacheDuration = 5000; // 5 seconds
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  constructor(maxConcurrency: number = 10) {
    this.semaphore = new Semaphore(maxConcurrency);
    this.pendingRequests = new Map();
    this.startCleanupTimer();
  }
  
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleRequests();
    }, 10000); // Clean up every 10 seconds
  }
  
  private cleanupStaleRequests(): void {
    const now = Date.now();
    const staleKeys: string[] = [];
    
    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > this.requestCacheDuration * 2) {
        staleKeys.push(key);
      }
    }
    
    for (const key of staleKeys) {
      this.pendingRequests.delete(key);
    }
  }
  
  private generateRequestKey(
    instance: AEMInstance,
    operationId?: string
  ): string {
    return `${instance.url}:${operationId || 'default'}`;
  }
  
  async executeOnInstances<T>(
    instances: AEMInstance[],
    operation: (instance: AEMInstance) => Promise<T>,
    options: ParallelExecutionOptions = {}
  ): Promise<InstanceOperationResult<T>[]> {
    const { 
      requestId = uuidv4(),
      deduplicationKey
    } = options;
    
    const operations = instances.map(async (instance): Promise<InstanceOperationResult<T>> => {
      const requestKey = this.generateRequestKey(instance, deduplicationKey);
      
      // Check for existing pending request
      if (deduplicationKey) {
        const existingRequest = this.pendingRequests.get(requestKey);
        if (existingRequest && Date.now() - existingRequest.timestamp < this.requestCacheDuration) {
          // Return the existing promise result
          return existingRequest.promise as Promise<InstanceOperationResult<T>>;
        }
      }
      
      // Create new request promise
      const requestPromise = this.executeOperation(instance, operation, requestId);
      
      // Store for deduplication if key provided
      if (deduplicationKey) {
        this.pendingRequests.set(requestKey, {
          promise: requestPromise as Promise<InstanceOperationResult<unknown>>,
          timestamp: Date.now()
        });
      }
      
      return requestPromise;
    });
    
    const results = await Promise.allSettled(operations);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Handle rejected promises with proper typing
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
  
  private async executeOperation<T>(
    instance: AEMInstance,
    operation: (instance: AEMInstance) => Promise<T>,
    requestId: string
  ): Promise<InstanceOperationResult<T>> {
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
  }
  
  updateConcurrency(newLimit: number): void {
    this.semaphore = new Semaphore(newLimit);
  }
  
  cleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.pendingRequests.clear();
  }
}