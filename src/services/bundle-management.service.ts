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
import { TIMEOUTS } from '@/constants/timeouts.js';
import { BaseOSGiService, BaseOSGiServiceConfig } from '@/utils/base-osgi-service.js';
import { performBulkOperation, BulkOperationConfig } from '@/utils/bulk-operations.js';

interface BundleManagementConfig extends BaseOSGiServiceConfig, BulkOperationConfig {
  readonly installTimeout: TimeoutMs;
  readonly maxBundleSize: number;
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

export class BundleManagementService extends BaseOSGiService {
  readonly #config: BundleManagementConfig;

  constructor(httpClient: AemHttpClient, config: Partial<BundleManagementConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(httpClient, fullConfig);
    this.#config = fullConfig;
  }

  async listBundles(instance: AEMInstance, stateFilter?: BundleState, nameFilter?: string): Promise<OperationResult<OSGiBundle[], OSGiError>> {
    const startTime = Date.now();
    
    try {
      const response = await this.makeAuthenticatedRequest<BundleListResponse>(
        instance,
        '/system/console/bundles.json',
        'GET',
        undefined,
        this.#config.timeout,
        'Bundle console unavailable',
        'Authentication required for bundle console'
      );

      if (!response.success) {
        return createOSGiFailureResult(response.error, Date.now() - startTime);
      }

      const bundleData = response.data;
      if (!bundleData.data) {
        return createOSGiFailureResult(
          this.createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'Invalid bundle data received'),
          Date.now() - startTime
        );
      }

      const bundles = this.#parseBundles(bundleData.data);
      const filteredBundles = this.#filterBundles(bundles, stateFilter, nameFilter);

      return createOSGiSuccessResult(filteredBundles, Date.now() - startTime);
    } catch (error) {
      return createOSGiFailureResult(
        this.classifyError(error),
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
          this.createError(OSGI_ERROR_CODES.INVALID_BUNDLE_FORMAT, 'Either bundleUrl or bundleFile must be provided'),
          Date.now() - startTime
        );
      }

      let formData: FormData | string;
      const headers: Record<string, string> = {};

      if (request.bundleFile) {
        const validationResult = this.#validateBundleFile(request.bundleFile);
        if (!validationResult.valid) {
          return createOSGiFailureResult(
            this.createError(OSGI_ERROR_CODES.INVALID_BUNDLE_FORMAT, validationResult.error || 'Invalid bundle file'),
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
          this.createError(OSGI_ERROR_CODES.INVALID_BUNDLE_FORMAT, 'Invalid bundle installation request'),
          Date.now() - startTime
        );
      }

      const response = await this.makeAuthenticatedRequest(
        instance,
        '/system/console/bundles',
        'POST',
        formData,
        this.#config.installTimeout,
        'Bundle installation failed',
        'Authentication required'
      );

      if (!response.success) {
        if (response.error.code === OSGI_ERROR_CODES.PERMISSION_DENIED) {
          return createOSGiFailureResult(response.error, Date.now() - startTime);
        }
        return createOSGiFailureResult(
          this.createError(OSGI_ERROR_CODES.BUNDLE_RESOLUTION_FAILED, response.error.message),
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
          this.createError(OSGI_ERROR_CODES.MISSING_DEPENDENCY, `Bundle installed but has missing dependencies: ${installedBundle.symbolicName}`),
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
        this.classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async performBulkOperation(
    instance: AEMInstance,
    bundleIds: readonly number[],
    action: 'start' | 'stop' | 'restart' | 'uninstall' | 'refresh'
  ): Promise<OperationResult<BulkOperationResult<BundleOperationResult>, OSGiError>> {
    return performBulkOperation(
      instance,
      bundleIds,
      action,
      (inst, bundleId) => this.#executeBundleOperation(inst, bundleId, action),
      this.#config
    );
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

      const response = await this.makeAuthenticatedRequest(
        instance,
        `/system/console/bundles/${bundleId}`,
        'POST',
        formData.toString(),
        this.#config.timeout,
        `Bundle ${action} failed`,
        'Authentication required'
      );

      if (!response.success) {
        if (response.error.code === OSGI_ERROR_CODES.BUNDLE_NOT_FOUND) {
          return createOSGiFailureResult(
            this.createError(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND, `Bundle ${bundleId} not found`),
            Date.now() - startTime
          );
        }
        return createOSGiFailureResult(response.error, Date.now() - startTime);
      }

      await this.actionDelay();

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
        this.classifyError(error),
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
        this.createError(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND, `Bundle ${bundleId} not found`),
        0
      );
    }

    return createOSGiSuccessResult(bundle, 0);
  }

  #parseBundles(bundleData: readonly unknown[]): OSGiBundle[] {
    return this.parseItems(bundleData, (item) => {
      if (this.#isValidBundleData(item)) {
        return {
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
      }
      return null;
    });
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

    return this.filterByName(filtered, nameFilter);
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