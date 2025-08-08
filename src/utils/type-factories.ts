import type {
  ByteSize,
  Percentage,
  ThreadCount,
  Milliseconds,
  RequestsPerSecond,
  RequestCount,
  BundleCount,
  BundleName,
  RequestId,
  TimeoutMs,
  ConcurrencyLimit,
  ErrorType,
  HealthCheckError
} from '@/types/index.js';

export const createByteSize = (bytes: number): ByteSize => {
  if (bytes < 0) throw new Error('Byte size cannot be negative');
  return bytes as ByteSize;
};

export const createPercentage = (value: number): Percentage => {
  if (value < 0 || value > 100) throw new Error('Percentage must be between 0 and 100');
  return Math.round(value) as Percentage;
};

export const createThreadCount = (count: number): ThreadCount => {
  if (count < 0) throw new Error('Thread count cannot be negative');
  return count as ThreadCount;
};

export const createMilliseconds = (ms: number): Milliseconds => {
  if (ms < 0) throw new Error('Milliseconds cannot be negative');
  return ms as Milliseconds;
};

export const createRequestsPerSecond = (rps: number): RequestsPerSecond => {
  if (rps < 0) throw new Error('Requests per second cannot be negative');
  return rps as RequestsPerSecond;
};

export const createRequestCount = (count: number): RequestCount => {
  if (count < 0) throw new Error('Request count cannot be negative');
  return count as RequestCount;
};

export const createBundleCount = (count: number): BundleCount => {
  if (count < 0) throw new Error('Bundle count cannot be negative');
  return count as BundleCount;
};

export const createBundleName = (name: string): BundleName => {
  if (!name.trim()) throw new Error('Bundle name cannot be empty');
  return name.trim() as BundleName;
};

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

export const createHealthCheckError = (
  type: ErrorType,
  message: string,
  options: { code?: string; statusCode?: number } = {}
): HealthCheckError => ({
  type,
  message,
  ...options
});