import {
  AEMInstance,
  OperationResult,
  OSGiBundle,
  BundleOperationResult,
  BulkOperationResult,
  BundleInstallRequest,
  BundleOperationRequest,
  OSGiError,
  OSGI_ERROR_CODES,
  BundleState,
  isBundleState,
  isOSGiBundle,
  TimeoutMs
} from '@/types/index.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createSuccessResult, createFailureResult } from '@/utils/operation-result.js';
import { isOk, isAuthError } from '@/utils/http-status.js';
import { TIMEOUTS } from '@/constants/timeouts.js';
import { createLogger } from '@/utils/logger.js';

interface BundleManagementConfig {
  readonly timeout: TimeoutMs;
  readonly installTimeout: TimeoutMs;
  readonly maxBulkOperations: number;
}

const DEFAULT_CONFIG: BundleManagementConfig = {
  timeout: TIMEOUTS.DEFAULT,
  installTimeout: TIMEOUTS.BUNDLE_INSTALL || TIMEOUTS.DEFAULT * 3,
  maxBulkOperations: 50
} as const;

interface BundleListResponse {
  readonly s?: readonly [number, number];
  readonly data?: readonly any[];
}

export class BundleManagementService {
  readonly #httpClient: AemHttpClient;
  readonly #config: BundleManagementConfig;
  readonly #logger = createLogger();

  constructor(httpClient: AemHttpClient, config: Partial<BundleManagementConfig> = {}) {
    this.#httpClient = httpClient;
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }

  async listBundles(instance: AEMInstance, stateFilter?: BundleState, nameFilter?: string): Promise<OperationResult<OSGiBundle[]>> {
    const startTime = Date.now();
    
    try {
      const response = await this.#httpClient.makeRequest(
        instance,
        '/system/console/bundles.json',
        'GET',
        undefined,
        this.#config.timeout
      );

      if (!isOk(response.status)) {
        if (isAuthError(response.status)) {
          return createFailureResult(
            this.#createError(OSGI_ERROR_CODES.PERMISSION_DENIED, `Authentication required for bundle console (HTTP ${response.status})`),
            Date.now() - startTime
          );
        }
        return createFailureResult(
          this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, `Bundle console unavailable (HTTP ${response.status})`),
          Date.now() - startTime
        );
      }

      const bundleData = response.data as BundleListResponse;
      if (!bundleData.data) {
        return createFailureResult(
          this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'Invalid bundle data received'),
          Date.now() - startTime
        );
      }

      const bundles = this.#parseBundles(bundleData.data);
      const filteredBundles = this.#filterBundles(bundles, stateFilter, nameFilter);

      return createSuccessResult(filteredBundles, Date.now() - startTime);
    } catch (error) {
      return createFailureResult(
        this.#classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async startBundle(instance: AEMInstance, bundleId: number): Promise<OperationResult<BundleOperationResult>> {
    return this.#performBundleAction(instance, bundleId, 'start');
  }

  async stopBundle(instance: AEMInstance, bundleId: number): Promise<OperationResult<BundleOperationResult>> {
    return this.#performBundleAction(instance, bundleId, 'stop');
  }

  async restartBundle(instance: AEMInstance, bundleId: number): Promise<OperationResult<BundleOperationResult>> {
    const startTime = Date.now();
    
    const stopResult = await this.#performBundleAction(instance, bundleId, 'stop');
    if (!stopResult.success) {
      return createFailureResult(stopResult.error, Date.now() - startTime);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    const startResult = await this.#performBundleAction(instance, bundleId, 'start');
    if (!startResult.success) {
      return createFailureResult(startResult.error, Date.now() - startTime);
    }

    return createSuccessResult({
      success: true,
      bundle: startResult.data.bundle,
      message: 'Bundle restarted successfully'
    }, Date.now() - startTime);
  }

  async uninstallBundle(instance: AEMInstance, bundleId: number): Promise<OperationResult<BundleOperationResult>> {
    return this.#performBundleAction(instance, bundleId, 'uninstall');
  }

  async refreshBundle(instance: AEMInstance, bundleId: number): Promise<OperationResult<BundleOperationResult>> {
    return this.#performBundleAction(instance, bundleId, 'refresh');
  }

  async installBundle(instance: AEMInstance, request: Omit<BundleInstallRequest, 'instanceAlias'>): Promise<OperationResult<BundleOperationResult>> {
    const startTime = Date.now();
    
    try {
      if (!request.bundleUrl && !request.bundleFile) {
        return createFailureResult(
          this.#createError(OSGI_ERROR_CODES.INVALID_BUNDLE_FORMAT, 'Either bundleUrl or bundleFile must be provided'),
          Date.now() - startTime
        );
      }

      let formData: FormData | string;
      let headers: Record<string, string> = {};

      if (request.bundleFile) {
        formData = new FormData();
        formData.append('bundlefile', new Blob([request.bundleFile]), 'bundle.jar');
        if (request.startLevel) {
          formData.append('bundlestartlevel', request.startLevel.toString());
        }
        if (request.start) {
          formData.append('bundlestart', 'start');
        }
        if (request.refresh) {
          formData.append('refresh', 'Refresh Packages');
        }
      } else if (request.bundleUrl) {
        const params = new URLSearchParams();
        params.append('action', 'install');
        params.append('bundleUrl', request.bundleUrl);
        if (request.startLevel) {
          params.append('bundlestartlevel', request.startLevel.toString());
        }
        if (request.start) {
          params.append('bundlestart', 'start');
        }
        if (request.refresh) {
          params.append('refresh', 'Refresh Packages');
        }
        formData = params.toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        return createFailureResult(
          this.#createError(OSGI_ERROR_CODES.INVALID_BUNDLE_FORMAT, 'Invalid bundle installation request'),
          Date.now() - startTime
        );
      }

      const response = await this.#httpClient.makeRequest(
        instance,
        '/system/console/bundles',
        'POST',
        formData,
        this.#config.installTimeout,
        headers
      );

      if (!isOk(response.status)) {
        if (isAuthError(response.status)) {
          return createFailureResult(
            this.#createError(OSGI_ERROR_CODES.PERMISSION_DENIED, `Authentication required (HTTP ${response.status})`),
            Date.now() - startTime
          );
        }
        return createFailureResult(
          this.#createError(OSGI_ERROR_CODES.BUNDLE_RESOLUTION_FAILED, `Bundle installation failed (HTTP ${response.status})`),
          Date.now() - startTime
        );
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const bundleListResult = await this.listBundles(instance);
      if (!bundleListResult.success) {
        return createFailureResult(bundleListResult.error, Date.now() - startTime);
      }

      const installedBundle = bundleListResult.data
        .sort((a, b) => b.id - a.id)[0];

      return createSuccessResult({
        success: true,
        bundle: installedBundle,
        message: 'Bundle installed successfully'
      }, Date.now() - startTime);

    } catch (error) {
      return createFailureResult(
        this.#classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async performBulkOperation(
    instance: AEMInstance,
    bundleIds: readonly number[],
    action: 'start' | 'stop' | 'restart' | 'uninstall' | 'refresh'
  ): Promise<OperationResult<BulkOperationResult<BundleOperationResult>>> {
    const startTime = Date.now();

    if (bundleIds.length === 0) {
      return createFailureResult(
        this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'No bundle IDs provided'),
        Date.now() - startTime
      );
    }

    if (bundleIds.length > this.#config.maxBulkOperations) {
      return createFailureResult(
        this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, `Too many bundles. Maximum ${this.#config.maxBulkOperations} allowed`),
        Date.now() - startTime
      );
    }

    const results: BundleOperationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const bundleId of bundleIds) {
      try {
        let operationResult: OperationResult<BundleOperationResult>;
        
        switch (action) {
          case 'start':
            operationResult = await this.startBundle(instance, bundleId);
            break;
          case 'stop':
            operationResult = await this.stopBundle(instance, bundleId);
            break;
          case 'restart':
            operationResult = await this.restartBundle(instance, bundleId);
            break;
          case 'uninstall':
            operationResult = await this.uninstallBundle(instance, bundleId);
            break;
          case 'refresh':
            operationResult = await this.refreshBundle(instance, bundleId);
            break;
        }

        if (operationResult.success) {
          results.push(operationResult.data);
          successCount++;
        } else {
          results.push({
            success: false,
            message: `Failed to ${action} bundle ${bundleId}`,
            error: operationResult.error as OSGiError
          });
          failureCount++;
        }
      } catch (error) {
        results.push({
          success: false,
          message: `Failed to ${action} bundle ${bundleId}`,
          error: this.#classifyError(error)
        });
        failureCount++;
      }
    }

    const bulkResult: BulkOperationResult<BundleOperationResult> = {
      success: successCount > 0,
      results,
      message: `${action} operation completed: ${successCount} successful, ${failureCount} failed`,
      totalCount: bundleIds.length,
      successCount,
      failureCount
    };

    return createSuccessResult(bulkResult, Date.now() - startTime);
  }

  async #performBundleAction(
    instance: AEMInstance,
    bundleId: number,
    action: 'start' | 'stop' | 'uninstall' | 'refresh'
  ): Promise<OperationResult<BundleOperationResult>> {
    const startTime = Date.now();
    
    try {
      const formData = new URLSearchParams();
      formData.append('action', action);

      const response = await this.#httpClient.makeRequest(
        instance,
        `/system/console/bundles/${bundleId}`,
        'POST',
        formData.toString(),
        this.#config.timeout,
        { 'Content-Type': 'application/x-www-form-urlencoded' }
      );

      if (!isOk(response.status)) {
        if (isAuthError(response.status)) {
          return createFailureResult(
            this.#createError(OSGI_ERROR_CODES.PERMISSION_DENIED, `Authentication required (HTTP ${response.status})`),
            Date.now() - startTime
          );
        }
        if (response.status === 404) {
          return createFailureResult(
            this.#createError(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND, `Bundle ${bundleId} not found`),
            Date.now() - startTime
          );
        }
        return createFailureResult(
          this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, `Bundle ${action} failed (HTTP ${response.status})`),
          Date.now() - startTime
        );
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const bundleResult = await this.#getBundleById(instance, bundleId);
      if (!bundleResult.success) {
        return createFailureResult(bundleResult.error, Date.now() - startTime);
      }

      return createSuccessResult({
        success: true,
        bundle: bundleResult.data,
        message: `Bundle ${action} completed successfully`
      }, Date.now() - startTime);

    } catch (error) {
      return createFailureResult(
        this.#classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async #getBundleById(instance: AEMInstance, bundleId: number): Promise<OperationResult<OSGiBundle>> {
    const listResult = await this.listBundles(instance);
    if (!listResult.success) {
      return createFailureResult(listResult.error, 0);
    }

    const bundle = listResult.data.find(b => b.id === bundleId);
    if (!bundle) {
      return createFailureResult(
        this.#createError(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND, `Bundle ${bundleId} not found`),
        0
      );
    }

    return createSuccessResult(bundle, 0);
  }

  #parseBundles(bundleData: readonly any[]): OSGiBundle[] {
    const bundles: OSGiBundle[] = [];

    for (const item of bundleData) {
      try {
        if (this.#isValidBundleData(item)) {
          const bundle: OSGiBundle = {
            id: item.id,
            name: item.name || '',
            symbolicName: item.symbolicName || '',
            version: item.version || '',
            state: isBundleState(item.state) ? item.state : 'Installed',
            category: item.category,
            stateRaw: item.stateRaw || 0,
            fragment: Boolean(item.fragment),
            imported: Boolean(item.imported)
          };
          bundles.push(bundle);
        }
      } catch (error) {
        this.#logger.warn?.('Failed to parse bundle data', { item, error });
      }
    }

    return bundles;
  }

  #isValidBundleData(item: any): boolean {
    return (
      typeof item === 'object' &&
      item !== null &&
      typeof item.id === 'number' &&
      typeof item.symbolicName === 'string'
    );
  }

  #filterBundles(bundles: OSGiBundle[], stateFilter?: BundleState, nameFilter?: string): OSGiBundle[] {
    let filtered = bundles;

    if (stateFilter) {
      filtered = filtered.filter(bundle => bundle.state === stateFilter);
    }

    if (nameFilter) {
      const filter = nameFilter.toLowerCase();
      filtered = filtered.filter(bundle => 
        bundle.name.toLowerCase().includes(filter) ||
        bundle.symbolicName.toLowerCase().includes(filter)
      );
    }

    return filtered;
  }

  #createError(code: OSGI_ERROR_CODES, message: string, details?: any): OSGiError {
    return {
      code,
      message,
      details,
      retry: code === OSGI_ERROR_CODES.NETWORK_TIMEOUT
    };
  }

  #classifyError(error: unknown): OSGiError {
    if (error && typeof error === 'object') {
      if ('code' in error) {
        const errorCode = (error as { code: string }).code;
        
        if (['ECONNREFUSED', 'EHOSTUNREACH', 'ETIMEDOUT'].includes(errorCode)) {
          return this.#createError(OSGI_ERROR_CODES.NETWORK_TIMEOUT, `Network error: ${errorCode}`, { originalError: error });
        }
      }
      
      if ('response' in error) {
        const response = (error as { response: { status?: number } }).response;
        if (response?.status === 401 || response?.status === 403) {
          return this.#createError(OSGI_ERROR_CODES.PERMISSION_DENIED, `Authentication error: HTTP ${response.status}`, { originalError: error });
        }
        if (response?.status && response.status >= 500) {
          return this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, `Server error: HTTP ${response.status}`, { originalError: error });
        }
      }
    }
    
    const message = error instanceof Error ? error.message : String(error);
    return this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, message, { originalError: error });
  }
}