import type { AEMInstance } from './instance.types';

export type RequestId = string & { readonly __brand: 'RequestId' };
export type TimeoutMs = number & { readonly __brand: 'TimeoutMs' };
export type ConcurrencyLimit = number & { readonly __brand: 'ConcurrencyLimit' };

export const createRequestId = (id: string): RequestId => {
  if (!id.trim()) throw new Error('Request ID cannot be empty');
  return id.trim() as RequestId;
};

export const createTimeout = (ms: number): TimeoutMs => {
  if (ms <= 0) throw new Error('Timeout must be positive');
  return ms as TimeoutMs;
};

export const createConcurrencyLimit = (limit: number): ConcurrencyLimit => {
  if (limit <= 0) throw new Error('Concurrency limit must be positive');
  return limit as ConcurrencyLimit;
};

export interface ParallelExecutionOptions {
  readonly requestId?: RequestId;
  readonly timeout?: TimeoutMs;
  readonly maxConcurrency?: ConcurrencyLimit;
  readonly deduplicationKey?: string;
}

export interface ExecutionContext {
  readonly requestId: RequestId;
  readonly startTime: number;
  readonly instance: AEMInstance;
}