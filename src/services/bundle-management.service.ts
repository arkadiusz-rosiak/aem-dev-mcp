import {
  AEMInstance,
  OperationResult,
  OSGiBundle,
  BundleOperationResult,
  BulkOperationResult,
  BundleInstallRequest,
  OSGiError,
  OSGI_ERROR_CODES,
  BundleState,
  isBundleState,
  TimeoutMs
} from '@/types/index.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createOSGiSuccessResult, createOSGiFailureResult } from '@/utils/operation-result.js';
import { isOk, isAuthError } from '@/utils/http-status.js';
import { TIMEOUTS } from '@/constants/timeouts.js';
import { createLogger } from '@/utils/logger.js';

interface BundleManagementConfig {
  readonly timeout: TimeoutMs;
  readonly installTimeout: TimeoutMs;
  readonly maxBulkOperations: number;
  readonly maxBundleSize: number;
  readonly actionDelayMs: number;
  readonly installDelayMs: number;
  readonly restartDelayMs: number;
}

const DEFAULT_CONFIG: BundleManagementConfig = {
  timeout: TIMEOUTS.DEFAULT,
  installTimeout: TIMEOUTS.BUNDLE_INSTALL ?? TIMEOUTS.DEFAULT * 3,
  maxBulkOperations: 50,
  maxBundleSize: 100 * 1024 * 1024,
  actionDelayMs: 1000,
  installDelayMs: 2000,
  restartDelayMs: 1000
} as const;

interface BundleListResponse {
  readonly s?: readonly [number, number];
  readonly data?: readonly unknown[];
}

export class BundleManagementService {
  readonly #httpClient: AemHttpClient;
  readonly #config: BundleManagementConfig;
  readonly #logger = createLogger();

  constructor(httpClient: AemHttpClient, config: Partial<BundleManagementConfig> = {}) {
    this.#httpClient = httpClient;
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }

  async listBundles(instance: AEMInstance, stateFilter?: BundleState, nameFilter?: string): Promise<OperationResult<OSGiBundle[], OSGiError>> {
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
          return createOSGiFailureResult(
            this.#createError(OSGI_ERROR_CODES.PERMISSION_DENIED, `Authentication required for bundle console (HTTP ${response.status})`),
            Date.now() - startTime
          );
        }
        return createOSGiFailureResult(
          this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, `Bundle console unavailable (HTTP ${response.status})`),
          Date.now() - startTime
        );
      }

      const bundleData = response.data as BundleListResponse;
      if (!bundleData.data) {
        return createOSGiFailureResult(
          this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'Invalid bundle data received'),
          Date.now() - startTime
        );
      }

      const bundles = this.#parseBundles(bundleData.data);
      const filteredBundles = this.#filterBundles(bundles, stateFilter, nameFilter);

      return createOSGiSuccessResult(filteredBundles, Date.now() - startTime);
    } catch (error) {
      return createOSGiFailureResult(
        this.#classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async startBundle(instance: AEMInstance, bundleId: number): Promise<OperationResult<BundleOperationResult, OSGiError>> {
    return this.#performBundleAction(instance, bundleId, 'start');
  }

  async stopBundle(instance: AEMInstance, bundleId: number): Promise<OperationResult<BundleOperationResult, OSGiError>> {
    return this.#performBundleAction(instance, bundleId, 'stop');
  }

  async restartBundle(instance: AEMInstance, bundleId: number): Promise<OperationResult<BundleOperationResult, OSGiError>> {
    const startTime = Date.now();
    
    const stopResult = await this.#performBundleAction(instance, bundleId, 'stop');
    if (!stopResult.success) {
      return createOSGiFailureResult(stopResult.error, Date.now() - startTime);
    }

    await new Promise(resolve => setTimeout(resolve, this.#config.restartDelayMs));

    const startResult = await this.#performBundleAction(instance, bundleId, 'start');
    if (!startResult.success) {
      return createOSGiFailureResult(startResult.error, Date.now() - startTime);
    }

    return createOSGiSuccessResult({
      success: true,
      bundle: startResult.data.bundle,
      message: 'Bundle restarted successfully'
    }, Date.now() - startTime);
  }

  async uninstallBundle(instance: AEMInstance, bundleId: number): Promise<OperationResult<BundleOperationResult, OSGiError>> {
    return this.#performBundleAction(instance, bundleId, 'uninstall');
  }

  async refreshBundle(instance: AEMInstance, bundleId: number): Promise<OperationResult<BundleOperationResult, OSGiError>> {
    return this.#performBundleAction(instance, bundleId, 'refresh');
  }

  async installBundle(instance: AEMInstance, request: Omit<BundleInstallRequest, 'instanceAlias'>): Promise<OperationResult<BundleOperationResult, OSGiError>> {
    const startTime = Date.now();
    
    try {
      if (!request.bundleUrl && !request.bundleFile) {
        return createOSGiFailureResult(
          this.#createError(OSGI_ERROR_CODES.INVALID_BUNDLE_FORMAT, 'Either bundleUrl or bundleFile must be provided'),
          Date.now() - startTime
        );
      }

      let formData: FormData | string;
      const headers: Record<string, string> = {};

      if (request.bundleFile) {
        const validationResult = this.#validateBundleFile(request.bundleFile);
        if (!validationResult.valid) {
          return createOSGiFailureResult(
            this.#createError(OSGI_ERROR_CODES.INVALID_BUNDLE_FORMAT, validationResult.error || 'Invalid bundle file'),
            Date.now() - startTime
          );
        }

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
        return createOSGiFailureResult(
          this.#createError(OSGI_ERROR_CODES.INVALID_BUNDLE_FORMAT, 'Invalid bundle installation request'),
          Date.now() - startTime
        );
      }

      const response = await this.#httpClient.makeRequest(
        instance,
        '/system/console/bundles',
        'POST',
        formData,
        this.#config.installTimeout
      );

      if (!isOk(response.status)) {
        if (isAuthError(response.status)) {
          return createOSGiFailureResult(
            this.#createError(OSGI_ERROR_CODES.PERMISSION_DENIED, `Authentication required (HTTP ${response.status})`),
            Date.now() - startTime
          );
        }
        return createOSGiFailureResult(
          this.#createError(OSGI_ERROR_CODES.BUNDLE_RESOLUTION_FAILED, `Bundle installation failed (HTTP ${response.status})`),
          Date.now() - startTime
        );
      }

      await new Promise(resolve => setTimeout(resolve, this.#config.installDelayMs));

      const bundleListResult = await this.listBundles(instance);
      if (!bundleListResult.success) {
        return createOSGiFailureResult(bundleListResult.error, Date.now() - startTime);
      }

      const installedBundle = bundleListResult.data
        .reduce((latest, current) => 
          !latest || current.id > latest.id ? current : latest, 
          undefined as OSGiBundle | undefined
        );

      // Check if bundle is in Installed state (missing dependencies)
      if (installedBundle && installedBundle.state === 'Installed') {
        return createOSGiFailureResult(
          this.#createError(OSGI_ERROR_CODES.MISSING_DEPENDENCY, `Bundle installed but has missing dependencies: ${installedBundle.symbolicName}`),
          Date.now() - startTime
        );
      }

      return createOSGiSuccessResult({
        success: true,
        bundle: installedBundle,
        message: 'Bundle installed successfully'
      }, Date.now() - startTime);

    } catch (error) {
      return createOSGiFailureResult(
        this.#classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async performBulkOperation(
    instance: AEMInstance,
    bundleIds: readonly number[],
    action: 'start' | 'stop' | 'restart' | 'uninstall' | 'refresh'
  ): Promise<OperationResult<BulkOperationResult<BundleOperationResult>, OSGiError>> {
    const startTime = Date.now();

    if (bundleIds.length === 0) {
      return createOSGiFailureResult(
        this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'No bundle IDs provided'),
        Date.now() - startTime
      );
    }

    if (bundleIds.length > this.#config.maxBulkOperations) {
      return createOSGiFailureResult(
        this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, `Too many bundles. Maximum ${this.#config.maxBulkOperations} allowed`),
        Date.now() - startTime
      );
    }

    const operations = bundleIds.map(bundleId => this.#executeBundleOperation(instance, bundleId, action));
    const operationResults = await Promise.allSettled(operations);

    const results: BundleOperationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < operationResults.length; i++) {
      const result = operationResults[i];
      const bundleId = bundleIds[i];

      if (result.status === 'fulfilled' && result.value.success) {
        results.push(result.value.data);
        successCount++;
      } else {
        const error = result.status === 'rejected' 
          ? this.#classifyError(result.reason)
          : result.status === 'fulfilled' && !result.value.success
            ? result.value.error
            : this.#classifyError(new Error('Unknown operation failure'));
        
        results.push({
          success: false,
          message: `Failed to ${action} bundle ${bundleId}`,
          error
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

    return createOSGiSuccessResult(bulkResult, Date.now() - startTime);
  }

  async #executeBundleOperation(
    instance: AEMInstance,
    bundleId: number,
    action: 'start' | 'stop' | 'restart' | 'uninstall' | 'refresh'
  ): Promise<OperationResult<BundleOperationResult, OSGiError>> {
    switch (action) {
      case 'start':
        return this.startBundle(instance, bundleId);
      case 'stop':
        return this.stopBundle(instance, bundleId);
      case 'restart':
        return this.restartBundle(instance, bundleId);
      case 'uninstall':
        return this.uninstallBundle(instance, bundleId);
      case 'refresh':
        return this.refreshBundle(instance, bundleId);
    }
  }

  async #performBundleAction(
    instance: AEMInstance,
    bundleId: number,
    action: 'start' | 'stop' | 'uninstall' | 'refresh'
  ): Promise<OperationResult<BundleOperationResult, OSGiError>> {
    const startTime = Date.now();
    
    try {
      const formData = new URLSearchParams();
      formData.append('action', action);

      const response = await this.#httpClient.makeRequest(
        instance,
        `/system/console/bundles/${bundleId}`,
        'POST',
        formData.toString(),
        this.#config.timeout
      );

      if (!isOk(response.status)) {
        if (isAuthError(response.status)) {
          return createOSGiFailureResult(
            this.#createError(OSGI_ERROR_CODES.PERMISSION_DENIED, `Authentication required (HTTP ${response.status})`),
            Date.now() - startTime
          );
        }
        if (response.status === 404) {
          return createOSGiFailureResult(
            this.#createError(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND, `Bundle ${bundleId} not found`),
            Date.now() - startTime
          );
        }
        return createOSGiFailureResult(
          this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, `Bundle ${action} failed (HTTP ${response.status})`),
          Date.now() - startTime
        );
      }

      await new Promise(resolve => setTimeout(resolve, this.#config.actionDelayMs));

      const bundleResult = await this.#getBundleById(instance, bundleId);
      if (!bundleResult.success) {
        return createOSGiFailureResult(bundleResult.error, Date.now() - startTime);
      }

      return createOSGiSuccessResult({
        success: true,
        bundle: bundleResult.data,
        message: `Bundle ${action} completed successfully`
      }, Date.now() - startTime);

    } catch (error) {
      return createOSGiFailureResult(
        this.#classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async #getBundleById(instance: AEMInstance, bundleId: number): Promise<OperationResult<OSGiBundle, OSGiError>> {
    const listResult = await this.listBundles(instance);
    if (!listResult.success) {
      return createOSGiFailureResult(listResult.error, 0);
    }

    const bundle = listResult.data.find(b => b.id === bundleId);
    if (!bundle) {
      return createOSGiFailureResult(
        this.#createError(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND, `Bundle ${bundleId} not found`),
        0
      );
    }

    return createOSGiSuccessResult(bundle, 0);
  }

  #parseBundles(bundleData: readonly unknown[]): OSGiBundle[] {
    const bundles: OSGiBundle[] = [];

    for (const item of bundleData) {
      try {
        if (this.#isValidBundleData(item)) {
          const bundle: OSGiBundle = {
            id: item.id,
            name: item.name || '',
            symbolicName: item.symbolicName || '',
            version: item.version || '',
            state: item.state && isBundleState(item.state) ? item.state : 'Installed',
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

  #isValidBundleData(item: unknown): item is { id: number; symbolicName: string; name?: string; version?: string; state?: string; category?: string; stateRaw?: number; fragment?: boolean; imported?: boolean } {
    return (
      typeof item === 'object' &&
      item !== null &&
      'id' in item &&
      'symbolicName' in item &&
      typeof (item as Record<string, unknown>).id === 'number' &&
      typeof (item as Record<string, unknown>).symbolicName === 'string'
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

  #createError(code: OSGI_ERROR_CODES, message: string, details?: unknown): OSGiError {
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

  #validateBundleFile(bundleFile: Buffer): { valid: boolean; error?: string } {
    if (bundleFile.length === 0) {
      return { valid: false, error: 'Bundle file is empty' };
    }

    if (bundleFile.length > this.#config.maxBundleSize) {
      return { 
        valid: false, 
        error: `Bundle file too large: ${bundleFile.length} bytes (max: ${this.#config.maxBundleSize} bytes)` 
      };
    }

    const header = bundleFile.subarray(0, 4);
    const zipSignature = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
    const jarSignature = Buffer.from([0x50, 0x4B, 0x07, 0x08]);
    
    if (!header.equals(zipSignature) && !header.equals(jarSignature) && !header.subarray(0, 2).equals(Buffer.from([0x50, 0x4B]))) {
      return { valid: false, error: 'Bundle file must be a valid JAR/ZIP archive' };
    }

    return { valid: true };
  }
}