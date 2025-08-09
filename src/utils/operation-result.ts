import { OperationResult } from '@/types/index.js';

export const createSuccessResult = <T>(
  data: T, 
  duration: number = 0
): OperationResult<T> => ({
  success: true,
  data,
  duration
});

export const createFailureResult = <E extends Error>(
  error: E, 
  duration: number = 0
): OperationResult<never, E> => ({
  success: false,
  error,
  duration
});