import { OperationResult } from '@/types/index.js';
import { AemLogsError } from '@/types/aem-logs.types.js';

export function createAemLogsSuccessResult<T>(
  data: T,
  duration: number
): OperationResult<T, AemLogsError> {
  return {
    success: true,
    data,
    duration
  } as const;
}

export function createAemLogsFailureResult<T>(
  error: AemLogsError,
  duration: number
): OperationResult<T, AemLogsError> {
  return {
    success: false,
    error,
    duration
  } as const;
}