import {
  AEMInstance,
  OperationResult,
  BulkOperationResult,
  OSGiError,
  OSGI_ERROR_CODES
} from '@/types/index.js';
import { createOSGiError, classifyOSGiError } from '@/utils/osgi-errors.js';

export interface BulkOperationConfig {
  maxBulkOperations: number;
}

export async function performBulkOperation<TResult extends { success: boolean; error?: OSGiError }>(
  instance: AEMInstance,
  ids: readonly number[],
  action: string,
  executeOperation: (instance: AEMInstance, id: number) => Promise<OperationResult<TResult, OSGiError>>,
  config: BulkOperationConfig
): Promise<OperationResult<BulkOperationResult<TResult>, OSGiError>> {
  const startTime = Date.now();

  if (ids.length === 0) {
    return {
      success: false,
      error: createOSGiError(OSGI_ERROR_CODES.OPERATION_FAILED, 'No IDs provided'),
      duration: Date.now() - startTime
    };
  }

  if (ids.length > config.maxBulkOperations) {
    return {
      success: false,
      error: createOSGiError(
        OSGI_ERROR_CODES.OPERATION_FAILED,
        `Too many items. Maximum ${config.maxBulkOperations} allowed`
      ),
      duration: Date.now() - startTime
    };
  }

  const operations = ids.map(id => executeOperation(instance, id));
  const operationResults = await Promise.allSettled(operations);

  const results: TResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < operationResults.length; i++) {
    const result = operationResults[i];
    const id = ids[i];

    if (result.status === 'fulfilled' && result.value.success) {
      results.push(result.value.data);
      successCount++;
    } else {
      const error = result.status === 'rejected' 
        ? classifyOSGiError(result.reason)
        : result.status === 'fulfilled' && !result.value.success
          ? result.value.error
          : classifyOSGiError(new Error('Unknown operation failure'));
      
      results.push({
        success: false,
        message: `Failed to ${action} item ${id}`,
        error
      } as any);
      failureCount++;
    }
  }

  const bulkResult: BulkOperationResult<TResult> = {
    success: successCount > 0,
    results,
    message: `${action} operation completed: ${successCount} successful, ${failureCount} failed`,
    totalCount: ids.length,
    successCount,
    failureCount
  };

  return {
    success: true,
    data: bulkResult,
    duration: Date.now() - startTime
  };
}