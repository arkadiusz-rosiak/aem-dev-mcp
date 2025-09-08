import {
  AEMInstance,
  OperationResult,
  OSGiError,
  OSGI_ERROR_CODES,
  TimeoutMs
} from '@/types/index.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createOSGiSuccessResult, createOSGiFailureResult } from '@/utils/operation-result.js';
import { isOk, isAuthError } from '@/utils/http-status.js';
import { createOSGiError, classifyOSGiError } from '@/utils/osgi-errors.js';
import { createLogger } from '@/utils/logger.js';

export interface BaseOSGiServiceConfig {
  readonly timeout: TimeoutMs;
  readonly actionDelayMs: number;
}

export abstract class BaseOSGiService {
  protected readonly httpClient: AemHttpClient;
  protected readonly config: BaseOSGiServiceConfig;
  protected readonly logger = createLogger();

  constructor(httpClient: AemHttpClient, config: BaseOSGiServiceConfig) {
    this.httpClient = httpClient;
    this.config = config;
  }

  protected createError(
    code: OSGI_ERROR_CODES,
    message: string,
    details?: unknown
  ): OSGiError {
    return createOSGiError(code, message, details);
  }

  protected classifyError(error: unknown): OSGiError {
    return classifyOSGiError(error);
  }

  protected async makeAuthenticatedRequest<T>(
    instance: AEMInstance,
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: unknown,
    timeout?: number,
    unavailableMessage = 'Service unavailable',
    authRequiredMessage = 'Authentication required'
  ): Promise<OperationResult<T, OSGiError>> {
    const startTime = Date.now();
    
    try {
      const response = await this.httpClient.makeRequest(
        instance,
        path,
        method,
        data,
        timeout || this.config.timeout
      );

      if (!isOk(response.status)) {
        if (isAuthError(response.status)) {
          return createOSGiFailureResult(
            this.createError(
              OSGI_ERROR_CODES.PERMISSION_DENIED,
              `${authRequiredMessage} (HTTP ${response.status})`
            ),
            Date.now() - startTime
          );
        }
        if (response.status === 404) {
          return createOSGiFailureResult(
            this.createError(
              OSGI_ERROR_CODES.BUNDLE_NOT_FOUND,
              `Resource not found (HTTP ${response.status})`
            ),
            Date.now() - startTime
          );
        }
        return createOSGiFailureResult(
          this.createError(
            OSGI_ERROR_CODES.OPERATION_FAILED,
            `${unavailableMessage} (HTTP ${response.status})`
          ),
          Date.now() - startTime
        );
      }

      return createOSGiSuccessResult(response.data as T, Date.now() - startTime);
    } catch (error) {
      return createOSGiFailureResult(
        this.classifyError(error),
        Date.now() - startTime
      );
    }
  }

  protected async actionDelay(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, this.config.actionDelayMs));
  }

  protected filterByName<T extends { name?: string; symbolicName?: string; pid?: string }>(
    items: T[],
    nameFilter?: string
  ): T[] {
    if (!nameFilter) {
      return items;
    }

    const filter = nameFilter.toLowerCase();
    return items.filter(item => 
      (item.name && item.name.toLowerCase().includes(filter)) ||
      (item.symbolicName && item.symbolicName.toLowerCase().includes(filter)) ||
      (item.pid && item.pid.toLowerCase().includes(filter))
    );
  }

  protected parseItems<TOutput>(
    data: readonly unknown[],
    parseItem: (item: unknown) => TOutput | null
  ): TOutput[] {
    const items: TOutput[] = [];

    for (const item of data) {
      try {
        const parsed = parseItem(item);
        if (parsed) {
          items.push(parsed);
        }
      } catch (error) {
        this.logger.warn('Failed to parse item data', { item, error });
      }
    }

    return items;
  }
}