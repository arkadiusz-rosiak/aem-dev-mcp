import {
  AEMInstance,
  OperationResult,
  OSGiComponent,
  ComponentOperationResult,
  OSGiError,
  OSGI_ERROR_CODES,
  ComponentState,
} from '@/types/index.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createOSGiSuccessResult, createOSGiFailureResult } from '@/utils/operation-result.js';
import { TIMEOUTS } from '@/constants/timeouts.js';
import { BaseOSGiService, BaseOSGiServiceConfig } from '@/utils/base-osgi-service.js';

interface ComponentManagementConfig extends BaseOSGiServiceConfig {}

const DEFAULT_CONFIG: ComponentManagementConfig = {
  timeout: TIMEOUTS.DEFAULT,
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

  async enableComponent(instance: AEMInstance, componentName: string): Promise<OperationResult<ComponentOperationResult, OSGiError>> {
    return this.#performComponentAction(instance, 'enable', componentName);
  }

  async disableComponent(instance: AEMInstance, componentName: string): Promise<OperationResult<ComponentOperationResult, OSGiError>> {
    return this.#performComponentAction(instance, 'disable', componentName);
  }

  async getComponentDetails(instance: AEMInstance, componentName: string): Promise<OperationResult<OSGiComponent, OSGiError>> {
    const startTime = Date.now();
    
    try {
      const componentResult = await this.#findComponentByName(instance, componentName);
      if (!componentResult.success) {
        return createOSGiFailureResult(componentResult.error, Date.now() - startTime);
      }
      
      return createOSGiSuccessResult(componentResult.data, Date.now() - startTime);
    } catch (error) {
      return createOSGiFailureResult(
        this.classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async #performComponentAction(
    instance: AEMInstance,
    action: 'enable' | 'disable',
    componentName: string
  ): Promise<OperationResult<ComponentOperationResult, OSGiError>> {
    const startTime = Date.now();
    
    try {
      const formData = new URLSearchParams();
      formData.append('action', action);

      const response = await this.makeAuthenticatedRequest(
        instance,
        `/system/console/components/${encodeURIComponent(componentName)}`,
        'POST',
        formData.toString(),
        this.#config.timeout,
        `Component ${action} failed`,
        'Authentication required'
      );

      if (!response.success) {
        if (response.error.code === OSGI_ERROR_CODES.BUNDLE_NOT_FOUND) {
          return createOSGiFailureResult(
            this.createError(OSGI_ERROR_CODES.COMPONENT_NOT_FOUND, `Component ${componentName} not found`),
            Date.now() - startTime
          );
        }
        return createOSGiFailureResult(response.error, Date.now() - startTime);
      }

      await this.actionDelay();

      const updatedComponent = await this.#getComponentAfterOperation(instance, componentName);
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

  async #findComponentByName(instance: AEMInstance, componentName: string): Promise<OperationResult<OSGiComponent, OSGiError>> {
    const listResult = await this.listComponents(instance);
    if (!listResult.success) {
      return createOSGiFailureResult(listResult.error, 0);
    }

    const component = listResult.data.find(c => 
      c.name === componentName || (c.pid && c.pid === componentName)
    );
    
    if (!component) {
      return createOSGiFailureResult(
        this.createError(OSGI_ERROR_CODES.COMPONENT_NOT_FOUND, `Component '${componentName}' not found`),
        0
      );
    }

    return createOSGiSuccessResult(component, 0);
  }

  async #getComponentAfterOperation(instance: AEMInstance, componentName: string): Promise<OperationResult<OSGiComponent, OSGiError>> {
    const listResult = await this.listComponents(instance);
    if (!listResult.success) {
      return createOSGiFailureResult(listResult.error, 0);
    }

    const component = listResult.data.find(c => c.name === componentName || (c.pid && c.pid === componentName));
    
    if (!component) {
      return createOSGiFailureResult(
        this.createError(OSGI_ERROR_CODES.COMPONENT_NOT_FOUND, `Component '${componentName}' not found after operation`),
        0
      );
    }

    return createOSGiSuccessResult(component, 0);
  }

  #parseComponents(componentData: readonly unknown[]): OSGiComponent[] {
    return this.parseItems(componentData, (item) => {
      if (this.#isValidComponentData(item)) {
        const mappedState = this.#mapComponentState(item.state);
        
        const originalProps: Record<string, unknown> = {};
        if (item.configurable) originalProps['configurable'] = item.configurable;
        if (item.stateRaw !== undefined) originalProps['stateRaw'] = item.stateRaw;
        if (item.bundleId) originalProps['bundleId'] = item.bundleId;
        
        const hasComponentId = (typeof item.id === 'string' && item.id !== '') || 
                              (typeof item.id === 'number' && item.id > 0);
        
        const component: any = {
          name: item.name || '',
          state: mappedState,
          pid: item.pid,
          properties: Object.keys(originalProps).length > 0 ? originalProps : {}
        };

        if (hasComponentId && item.id) {
          component.id = typeof item.id === 'number' ? item.id : parseInt(item.id, 10);
        }

        return component as OSGiComponent;
      }
      return null;
    });
  }


  #isValidComponentData(item: unknown): item is { id?: string | number; bundleId: number; name: string; state?: string; pid?: string; [key: string]: unknown } {
    return (
      typeof item === 'object' &&
      item !== null &&
      'name' in item &&
      'bundleId' in item &&
      typeof (item as Record<string, unknown>).name === 'string' &&
      typeof (item as Record<string, unknown>).bundleId === 'number'
    );
  }

  #mapComponentState(state?: string): ComponentState {
    if (!state) return 'unsatisfied';
    
    switch (state.toLowerCase()) {
      case 'active':
        return 'active';
      case 'satisfied':
        return 'satisfied';
      case 'disabled':
        return 'disabled';
      case 'unsatisfied':
      case 'unsatisfied (reference)':
        return 'unsatisfied';
      default:
        return 'unsatisfied';
    }
  }

  #filterComponents(components: OSGiComponent[], stateFilter?: ComponentState, nameFilter?: string): OSGiComponent[] {
    let filtered = components;

    if (stateFilter) {
      filtered = filtered.filter(component => component.state === stateFilter);
    }

    return this.filterByName(filtered, nameFilter);
  }
}