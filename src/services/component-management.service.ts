import {
  AEMInstance,
  OperationResult,
  OSGiComponent,
  ComponentOperationResult,
  BulkOperationResult,
  OSGiError,
  OSGI_ERROR_CODES,
  ComponentState,
  isComponentState,
  TimeoutMs
} from '@/types/index.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createSuccessResult, createFailureResult } from '@/utils/operation-result.js';
import { isOk, isAuthError } from '@/utils/http-status.js';
import { TIMEOUTS } from '@/constants/timeouts.js';
import { createLogger } from '@/utils/logger.js';

interface ComponentManagementConfig {
  readonly timeout: TimeoutMs;
  readonly maxBulkOperations: number;
}

const DEFAULT_CONFIG: ComponentManagementConfig = {
  timeout: TIMEOUTS.DEFAULT,
  maxBulkOperations: 50
} as const;

interface ComponentListResponse {
  readonly data?: readonly unknown[];
}

export class ComponentManagementService {
  readonly #httpClient: AemHttpClient;
  readonly #config: ComponentManagementConfig;
  readonly #logger = createLogger();

  constructor(httpClient: AemHttpClient, config: Partial<ComponentManagementConfig> = {}) {
    this.#httpClient = httpClient;
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }

  async listComponents(instance: AEMInstance, stateFilter?: ComponentState, nameFilter?: string): Promise<OperationResult<OSGiComponent[]>> {
    const startTime = Date.now();
    
    try {
      const response = await this.#httpClient.makeRequest(
        instance,
        '/system/console/components.json',
        'GET',
        undefined,
        this.#config.timeout
      );

      if (!isOk(response.status)) {
        if (isAuthError(response.status)) {
          return createFailureResult(
            this.#createError(OSGI_ERROR_CODES.PERMISSION_DENIED, `Authentication required for component console (HTTP ${response.status})`),
            Date.now() - startTime
          );
        }
        return createFailureResult(
          this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, `Component console unavailable (HTTP ${response.status})`),
          Date.now() - startTime
        );
      }

      const componentData = response.data as ComponentListResponse;
      if (!componentData.data) {
        return createFailureResult(
          this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'Invalid component data received'),
          Date.now() - startTime
        );
      }

      const components = this.#parseComponents(componentData.data);
      const filteredComponents = this.#filterComponents(components, stateFilter, nameFilter);

      return createSuccessResult(filteredComponents, Date.now() - startTime);
    } catch (error) {
      return createFailureResult(
        this.#classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async enableComponent(instance: AEMInstance, componentId: number): Promise<OperationResult<ComponentOperationResult>> {
    return this.#performComponentAction(instance, componentId, 'enable');
  }

  async disableComponent(instance: AEMInstance, componentId: number): Promise<OperationResult<ComponentOperationResult>> {
    return this.#performComponentAction(instance, componentId, 'disable');
  }

  async getComponentDetails(instance: AEMInstance, componentId: number): Promise<OperationResult<OSGiComponent>> {
    const startTime = Date.now();
    
    try {
      const response = await this.#httpClient.makeRequest(
        instance,
        `/system/console/components/${componentId}.json`,
        'GET',
        undefined,
        this.#config.timeout
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
            this.#createError(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND, `Component ${componentId} not found`),
            Date.now() - startTime
          );
        }
        return createFailureResult(
          this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, `Component details unavailable (HTTP ${response.status})`),
          Date.now() - startTime
        );
      }

      const componentData = response.data;
      if (!this.#isValidComponentData(componentData)) {
        return createFailureResult(
          this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'Invalid component data received'),
          Date.now() - startTime
        );
      }

      const component = this.#parseComponent(componentData);
      if (!component) {
        return createFailureResult(
          this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'Failed to parse component data'),
          Date.now() - startTime
        );
      }

      return createSuccessResult(component, Date.now() - startTime);
    } catch (error) {
      return createFailureResult(
        this.#classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async performBulkComponentOperation(
    instance: AEMInstance,
    componentIds: readonly number[],
    action: 'enable' | 'disable'
  ): Promise<OperationResult<BulkOperationResult<ComponentOperationResult>>> {
    const startTime = Date.now();

    if (componentIds.length === 0) {
      return createFailureResult(
        this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'No component IDs provided'),
        Date.now() - startTime
      );
    }

    if (componentIds.length > this.#config.maxBulkOperations) {
      return createFailureResult(
        this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, `Too many components. Maximum ${this.#config.maxBulkOperations} allowed`),
        Date.now() - startTime
      );
    }

    const results: ComponentOperationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const componentId of componentIds) {
      try {
        const operationResult = action === 'enable' 
          ? await this.enableComponent(instance, componentId)
          : await this.disableComponent(instance, componentId);

        if (operationResult.success) {
          results.push(operationResult.data);
          successCount++;
        } else {
          results.push({
            success: false,
            message: `Failed to ${action} component ${componentId}`,
            error: operationResult.error as OSGiError
          });
          failureCount++;
        }
      } catch (error) {
        results.push({
          success: false,
          message: `Failed to ${action} component ${componentId}`,
          error: this.#classifyError(error)
        });
        failureCount++;
      }
    }

    const bulkResult: BulkOperationResult<ComponentOperationResult> = {
      success: successCount > 0,
      results,
      message: `${action} operation completed: ${successCount} successful, ${failureCount} failed`,
      totalCount: componentIds.length,
      successCount,
      failureCount
    };

    return createSuccessResult(bulkResult, Date.now() - startTime);
  }

  async findComponentsByName(instance: AEMInstance, componentNames: readonly string[]): Promise<OperationResult<OSGiComponent[]>> {
    const listResult = await this.listComponents(instance);
    if (!listResult.success) {
      return listResult;
    }

    const foundComponents = listResult.data.filter(component =>
      componentNames.some(name => 
        component.name.includes(name) || 
        (component.pid && component.pid.includes(name))
      )
    );

    return createSuccessResult(foundComponents, 0);
  }

  async #performComponentAction(
    instance: AEMInstance,
    componentId: number,
    action: 'enable' | 'disable'
  ): Promise<OperationResult<ComponentOperationResult>> {
    const startTime = Date.now();
    
    try {
      const currentComponent = await this.#getComponentById(instance, componentId);
      if (!currentComponent.success) {
        return createFailureResult(currentComponent.error, Date.now() - startTime);
      }

      if (action === 'disable' && currentComponent.data.state === 'active') {
        const dependencyCheck = await this.#checkComponentDependencies(instance, componentId);
        if (!dependencyCheck.canDisable) {
          return createFailureResult(
            this.#createError(
              OSGI_ERROR_CODES.COMPONENT_DEPENDENCY_ACTIVE,
              `Cannot disable component: ${dependencyCheck.reason}`
            ),
            Date.now() - startTime
          );
        }
      }

      const formData = new URLSearchParams();
      formData.append('action', action);

      const response = await this.#httpClient.makeRequest(
        instance,
        `/system/console/components/${componentId}`,
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
            this.#createError(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND, `Component ${componentId} not found`),
            Date.now() - startTime
          );
        }
        return createFailureResult(
          this.#createError(OSGI_ERROR_CODES.OPERATION_FAILED, `Component ${action} failed (HTTP ${response.status})`),
          Date.now() - startTime
        );
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const updatedComponent = await this.#getComponentById(instance, componentId);
      if (!updatedComponent.success) {
        return createFailureResult(updatedComponent.error, Date.now() - startTime);
      }

      return createSuccessResult({
        success: true,
        component: updatedComponent.data,
        message: `Component ${action} completed successfully`
      }, Date.now() - startTime);

    } catch (error) {
      return createFailureResult(
        this.#classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async #getComponentById(instance: AEMInstance, componentId: number): Promise<OperationResult<OSGiComponent>> {
    const listResult = await this.listComponents(instance);
    if (!listResult.success) {
      return createFailureResult(listResult.error, 0);
    }

    const component = listResult.data.find(c => c.id === componentId);
    if (!component) {
      return createFailureResult(
        this.#createError(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND, `Component ${componentId} not found`),
        0
      );
    }

    return createSuccessResult(component, 0);
  }

  async #checkComponentDependencies(instance: AEMInstance, componentId: number): Promise<{ canDisable: boolean; reason?: string }> {
    try {
      const detailsResult = await this.getComponentDetails(instance, componentId);
      if (!detailsResult.success) {
        return { canDisable: true };
      }

      return { canDisable: true };
    } catch (error) {
      this.#logger.warn?.('Failed to check component dependencies', { componentId, error });
      return { canDisable: true };
    }
  }

  #parseComponents(componentData: readonly unknown[]): OSGiComponent[] {
    const components: OSGiComponent[] = [];

    for (const item of componentData) {
      try {
        const component = this.#parseComponent(item);
        if (component) {
          components.push(component);
        }
      } catch (error) {
        this.#logger.warn?.('Failed to parse component data', { item, error });
      }
    }

    return components;
  }

  #parseComponent(item: unknown): OSGiComponent | null {
    if (!this.#isValidComponentData(item)) {
      return null;
    }

    return {
      id: item.id,
      name: item.name || '',
      state: isComponentState(item.state) ? item.state : 'unsatisfied',
      pid: item.pid,
      properties: item.props || {}
    };
  }

  #isValidComponentData(item: unknown): item is { id: number; name: string; state?: string; pid?: string; props?: Record<string, unknown> } {
    return (
      typeof item === 'object' &&
      item !== null &&
      'id' in item &&
      'name' in item &&
      typeof (item as Record<string, unknown>).id === 'number' &&
      typeof (item as Record<string, unknown>).name === 'string'
    );
  }

  #filterComponents(components: OSGiComponent[], stateFilter?: ComponentState, nameFilter?: string): OSGiComponent[] {
    let filtered = components;

    if (stateFilter) {
      filtered = filtered.filter(component => component.state === stateFilter);
    }

    if (nameFilter) {
      const filter = nameFilter.toLowerCase();
      filtered = filtered.filter(component => 
        component.name.toLowerCase().includes(filter) ||
        (component.pid && component.pid.toLowerCase().includes(filter))
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
}