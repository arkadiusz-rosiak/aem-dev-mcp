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
} from '@/types/index.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createOSGiSuccessResult, createOSGiFailureResult } from '@/utils/operation-result.js';
import { TIMEOUTS } from '@/constants/timeouts.js';
import { BaseOSGiService, BaseOSGiServiceConfig } from '@/utils/base-osgi-service.js';
import { performBulkOperation, BulkOperationConfig } from '@/utils/bulk-operations.js';

interface ComponentManagementConfig extends BaseOSGiServiceConfig, BulkOperationConfig {}

const DEFAULT_CONFIG: ComponentManagementConfig = {
  timeout: TIMEOUTS.DEFAULT,
  maxBulkOperations: 50,
  actionDelayMs: 1000
} as const;

interface ComponentListResponse {
  readonly data?: readonly unknown[];
}

export class ComponentManagementService extends BaseOSGiService {
  readonly #config: ComponentManagementConfig;

  constructor(httpClient: AemHttpClient, config: Partial<ComponentManagementConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(httpClient, fullConfig);
    this.#config = fullConfig;
  }

  async listComponents(instance: AEMInstance, stateFilter?: ComponentState, nameFilter?: string): Promise<OperationResult<OSGiComponent[], OSGiError>> {
    const startTime = Date.now();
    
    try {
      const response = await this.makeAuthenticatedRequest<ComponentListResponse>(
        instance,
        '/system/console/components.json',
        'GET',
        undefined,
        this.#config.timeout,
        'Component console unavailable',
        'Authentication required for component console'
      );

      if (!response.success) {
        return createOSGiFailureResult(response.error, Date.now() - startTime);
      }

      const componentData = response.data;
      if (!componentData.data) {
        return createOSGiFailureResult(
          this.createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'Invalid component data received'),
          Date.now() - startTime
        );
      }

      const components = this.#parseComponents(componentData.data);
      const filteredComponents = this.#filterComponents(components, stateFilter, nameFilter);

      return createOSGiSuccessResult(filteredComponents, Date.now() - startTime);
    } catch (error) {
      return createOSGiFailureResult(
        this.classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async enableComponent(instance: AEMInstance, componentId: number): Promise<OperationResult<ComponentOperationResult, OSGiError>> {
    return this.#performComponentAction(instance, componentId, 'enable');
  }

  async disableComponent(instance: AEMInstance, componentId: number): Promise<OperationResult<ComponentOperationResult, OSGiError>> {
    return this.#performComponentAction(instance, componentId, 'disable');
  }

  async getComponentDetails(instance: AEMInstance, componentId: number): Promise<OperationResult<OSGiComponent, OSGiError>> {
    const startTime = Date.now();
    
    try {
      const response = await this.makeAuthenticatedRequest(
        instance,
        `/system/console/components/${componentId}.json`,
        'GET',
        undefined,
        this.#config.timeout,
        'Component details unavailable',
        'Authentication required'
      );

      if (!response.success) {
        if (response.error.code === OSGI_ERROR_CODES.BUNDLE_NOT_FOUND) {
          return createOSGiFailureResult(
            this.createError(OSGI_ERROR_CODES.COMPONENT_NOT_FOUND, `Component ${componentId} not found`),
            Date.now() - startTime
          );
        }
        return createOSGiFailureResult(response.error, Date.now() - startTime);
      }

      const componentData = response.data;
      if (!this.#isValidComponentData(componentData)) {
        return createOSGiFailureResult(
          this.createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'Invalid component data received'),
          Date.now() - startTime
        );
      }

      const component = this.#parseComponent(componentData);
      if (!component) {
        return createOSGiFailureResult(
          this.createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'Failed to parse component data'),
          Date.now() - startTime
        );
      }

      return createOSGiSuccessResult(component, Date.now() - startTime);
    } catch (error) {
      return createOSGiFailureResult(
        this.classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async performBulkComponentOperation(
    instance: AEMInstance,
    componentIds: readonly number[],
    action: 'enable' | 'disable'
  ): Promise<OperationResult<BulkOperationResult<ComponentOperationResult>, OSGiError>> {
    return performBulkOperation(
      instance,
      componentIds,
      action,
      (inst, componentId) => action === 'enable' 
        ? this.enableComponent(inst, componentId)
        : this.disableComponent(inst, componentId),
      this.#config
    );
  }

  async findComponentsByName(instance: AEMInstance, componentNames: readonly string[]): Promise<OperationResult<OSGiComponent[], OSGiError>> {
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

    return createOSGiSuccessResult(foundComponents, 0);
  }

  async #performComponentAction(
    instance: AEMInstance,
    componentId: number,
    action: 'enable' | 'disable'
  ): Promise<OperationResult<ComponentOperationResult, OSGiError>> {
    const startTime = Date.now();
    
    try {
      const currentComponent = await this.#getComponentById(instance, componentId);
      if (!currentComponent.success) {
        return createOSGiFailureResult(currentComponent.error, Date.now() - startTime);
      }

      if (action === 'disable' && currentComponent.data.state === 'active') {
        const dependencyCheck = await this.#checkComponentDependencies(instance, componentId);
        if (!dependencyCheck.canDisable) {
          return createOSGiFailureResult(
            this.createError(
              OSGI_ERROR_CODES.COMPONENT_DEPENDENCY_ACTIVE,
              `Cannot disable component: ${dependencyCheck.reason}`
            ),
            Date.now() - startTime
          );
        }
      }

      const formData = new URLSearchParams();
      formData.append('action', action);

      const response = await this.makeAuthenticatedRequest(
        instance,
        `/system/console/components/${componentId}`,
        'POST',
        formData.toString(),
        this.#config.timeout,
        `Component ${action} failed`,
        'Authentication required'
      );

      if (!response.success) {
        if (response.error.code === OSGI_ERROR_CODES.BUNDLE_NOT_FOUND) {
          return createOSGiFailureResult(
            this.createError(OSGI_ERROR_CODES.COMPONENT_NOT_FOUND, `Component ${componentId} not found`),
            Date.now() - startTime
          );
        }
        return createOSGiFailureResult(response.error, Date.now() - startTime);
      }

      await this.actionDelay();

      const updatedComponent = await this.#getComponentById(instance, componentId);
      if (!updatedComponent.success) {
        return createOSGiFailureResult(updatedComponent.error, Date.now() - startTime);
      }

      return createOSGiSuccessResult({
        success: true,
        component: updatedComponent.data,
        message: `Component ${action} completed successfully`
      }, Date.now() - startTime);

    } catch (error) {
      return createOSGiFailureResult(
        this.classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async #getComponentById(instance: AEMInstance, componentId: number): Promise<OperationResult<OSGiComponent, OSGiError>> {
    const listResult = await this.listComponents(instance);
    if (!listResult.success) {
      return createOSGiFailureResult(listResult.error, 0);
    }

    const component = listResult.data.find(c => c.id === componentId);
    if (!component) {
      return createOSGiFailureResult(
        this.createError(OSGI_ERROR_CODES.COMPONENT_NOT_FOUND, `Component ${componentId} not found`),
        0
      );
    }

    return createOSGiSuccessResult(component, 0);
  }

  async #checkComponentDependencies(instance: AEMInstance, componentId: number): Promise<{ canDisable: boolean; reason?: string }> {
    try {
      const detailsResult = await this.getComponentDetails(instance, componentId);
      if (!detailsResult.success) {
        return { canDisable: true };
      }

      return { canDisable: true };
    } catch (error) {
      this.logger.warn('Failed to check component dependencies', { componentId, error });
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
        this.logger.warn('Failed to parse component data', { item, error });
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
      state: item.state && isComponentState(item.state) ? item.state : 'unsatisfied',
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

}