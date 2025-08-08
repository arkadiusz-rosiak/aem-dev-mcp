import type { AEMInstance } from './instance.types';

export type RequestId = string & { readonly __brand: 'RequestId' };
export type TimeoutMs = number & { readonly __brand: 'TimeoutMs' };
export type ConcurrencyLimit = number & { readonly __brand: 'ConcurrencyLimit' };

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