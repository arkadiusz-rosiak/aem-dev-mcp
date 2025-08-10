import {
  AEMInstance,
  OperationResult,
  OSGiConfiguration,
  ConfigurationOperationResult,
  ConfigurationRequest,
  ConfigProperty,
  OSGiError,
  OSGI_ERROR_CODES,
  isConfigProperty,
  isConfigPropertyType,
} from '@/types/index.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createOSGiSuccessResult, createOSGiFailureResult } from '@/utils/operation-result.js';
import { isOk, isAuthError } from '@/utils/http-status.js';
import { TIMEOUTS } from '@/constants/timeouts.js';
import { BaseOSGiService, BaseOSGiServiceConfig } from '@/utils/base-osgi-service.js';

interface ConfigurationManagementConfig extends BaseOSGiServiceConfig {}

const DEFAULT_CONFIG: ConfigurationManagementConfig = {
  timeout: TIMEOUTS.DEFAULT,
  actionDelayMs: 1000
} as const;

interface ConfigListResponse {
  readonly configurations?: readonly unknown[];
}

export class ConfigurationManagementService extends BaseOSGiService {
  readonly #config: ConfigurationManagementConfig;

  constructor(httpClient: AemHttpClient, config: Partial<ConfigurationManagementConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(httpClient, fullConfig);
    this.#config = fullConfig;
  }

  async listConfigurations(instance: AEMInstance, pidFilter?: string): Promise<OperationResult<OSGiConfiguration[], OSGiError>> {
    const startTime = Date.now();
    
    try {
      const response = await this.makeAuthenticatedRequest<ConfigListResponse>(
        instance,
        '/system/console/configMgr.json',
        'GET',
        undefined,
        this.#config.timeout,
        'Configuration console unavailable',
        'Authentication required for configuration console'
      );

      if (!response.success) {
        return createOSGiFailureResult(response.error, Date.now() - startTime);
      }

      const configData = response.data;
      if (!configData.configurations) {
        return createOSGiFailureResult(
          this.createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'Invalid configuration data received'),
          Date.now() - startTime
        );
      }

      const configurations = this.#parseConfigurations(configData.configurations);
      const filteredConfigurations = this.#filterConfigurations(configurations, pidFilter);

      return createOSGiSuccessResult(filteredConfigurations, Date.now() - startTime);
    } catch (error) {
      return createOSGiFailureResult(
        this.classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async getConfiguration(instance: AEMInstance, pid: string): Promise<OperationResult<OSGiConfiguration, OSGiError>> {
    const startTime = Date.now();
    
    try {
      const response = await this.makeAuthenticatedRequest(
        instance,
        `/system/console/configMgr/${encodeURIComponent(pid)}.json`,
        'GET',
        undefined,
        this.#config.timeout,
        'Configuration unavailable',
        'Authentication required'
      );

      if (!response.success) {
        if (response.error.code === OSGI_ERROR_CODES.BUNDLE_NOT_FOUND) {
          return createOSGiFailureResult(
            this.createError(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND, `Configuration ${pid} not found`),
            Date.now() - startTime
          );
        }
        return createOSGiFailureResult(response.error, Date.now() - startTime);
      }

      const configData = response.data;
      const configuration = this.#parseConfiguration(configData);
      
      if (!configuration) {
        return createOSGiFailureResult(
          this.createError(OSGI_ERROR_CODES.OPERATION_FAILED, 'Failed to parse configuration data'),
          Date.now() - startTime
        );
      }

      return createOSGiSuccessResult(configuration, Date.now() - startTime);
    } catch (error) {
      return createOSGiFailureResult(
        this.classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async createConfiguration(instance: AEMInstance, request: Omit<ConfigurationRequest, 'instanceAlias'>): Promise<OperationResult<ConfigurationOperationResult, OSGiError>> {
    const startTime = Date.now();
    
    try {
      const validationResult = this.#validateConfigurationRequest(request);
      if (!validationResult.valid) {
        return createOSGiFailureResult(
          this.createError(OSGI_ERROR_CODES.CONFIGURATION_TYPE_MISMATCH, validationResult.error || 'Invalid configuration request'),
          Date.now() - startTime
        );
      }

      const formData = this.#buildConfigurationFormData(request);

      const response = await this.httpClient.makeRequest(
        instance,
        '/system/console/configMgr/[Temporary PID replaced by real PID upon save]',
        'POST',
        formData,
        this.#config.timeout
      );

      if (!isOk(response.status)) {
        if (isAuthError(response.status)) {
          return createOSGiFailureResult(
            this.createError(OSGI_ERROR_CODES.PERMISSION_DENIED, `Authentication required (HTTP ${response.status})`),
            Date.now() - startTime
          );
        }
        return createOSGiFailureResult(
          this.createError(OSGI_ERROR_CODES.CONFIGURATION_CONFLICT, `Configuration creation failed (HTTP ${response.status})`),
          Date.now() - startTime
        );
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const createdConfig = await this.getConfiguration(instance, request.pid);
      if (!createdConfig.success) {
        return createOSGiFailureResult(createdConfig.error, Date.now() - startTime);
      }

      return createOSGiSuccessResult({
        success: true,
        configuration: createdConfig.data,
        message: 'Configuration created successfully'
      }, Date.now() - startTime);

    } catch (error) {
      return createOSGiFailureResult(
        this.classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async updateConfiguration(instance: AEMInstance, request: Omit<ConfigurationRequest, 'instanceAlias'>): Promise<OperationResult<ConfigurationOperationResult, OSGiError>> {
    const startTime = Date.now();
    
    try {
      const validationResult = this.#validateConfigurationRequest(request);
      if (!validationResult.valid) {
        return createOSGiFailureResult(
          this.createError(OSGI_ERROR_CODES.CONFIGURATION_TYPE_MISMATCH, validationResult.error || 'Invalid configuration request'),
          Date.now() - startTime
        );
      }

      const existingConfig = await this.getConfiguration(instance, request.pid);
      if (!existingConfig.success) {
        return createOSGiFailureResult(existingConfig.error, Date.now() - startTime);
      }

      const formData = this.#buildConfigurationFormData(request);

      const response = await this.httpClient.makeRequest(
        instance,
        `/system/console/configMgr/${encodeURIComponent(request.pid)}`,
        'POST',
        formData,
        this.#config.timeout
      );

      if (!isOk(response.status)) {
        if (isAuthError(response.status)) {
          return createOSGiFailureResult(
            this.createError(OSGI_ERROR_CODES.PERMISSION_DENIED, `Authentication required (HTTP ${response.status})`),
            Date.now() - startTime
          );
        }
        return createOSGiFailureResult(
          this.createError(OSGI_ERROR_CODES.CONFIGURATION_CONFLICT, `Configuration update failed (HTTP ${response.status})`),
          Date.now() - startTime
        );
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const updatedConfig = await this.getConfiguration(instance, request.pid);
      if (!updatedConfig.success) {
        return createOSGiFailureResult(updatedConfig.error, Date.now() - startTime);
      }

      return createOSGiSuccessResult({
        success: true,
        configuration: updatedConfig.data,
        message: 'Configuration updated successfully'
      }, Date.now() - startTime);

    } catch (error) {
      return createOSGiFailureResult(
        this.classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async deleteConfiguration(instance: AEMInstance, pid: string): Promise<OperationResult<ConfigurationOperationResult, OSGiError>> {
    const startTime = Date.now();
    
    try {
      const existingConfig = await this.getConfiguration(instance, pid);
      if (!existingConfig.success) {
        return createOSGiFailureResult(existingConfig.error, Date.now() - startTime);
      }

      const formData = new URLSearchParams();
      formData.append('delete', 'true');

      const response = await this.httpClient.makeRequest(
        instance,
        `/system/console/configMgr/${encodeURIComponent(pid)}`,
        'POST',
        formData.toString(),
        this.#config.timeout
      );

      if (!isOk(response.status)) {
        if (isAuthError(response.status)) {
          return createOSGiFailureResult(
            this.createError(OSGI_ERROR_CODES.PERMISSION_DENIED, `Authentication required (HTTP ${response.status})`),
            Date.now() - startTime
          );
        }
        return createOSGiFailureResult(
          this.createError(OSGI_ERROR_CODES.OPERATION_FAILED, `Configuration deletion failed (HTTP ${response.status})`),
          Date.now() - startTime
        );
      }

      return createOSGiSuccessResult({
        success: true,
        message: 'Configuration deleted successfully'
      }, Date.now() - startTime);

    } catch (error) {
      return createOSGiFailureResult(
        this.classifyError(error),
        Date.now() - startTime
      );
    }
  }

  async unbindConfiguration(instance: AEMInstance, pid: string, bundleLocation?: string): Promise<OperationResult<ConfigurationOperationResult, OSGiError>> {
    const startTime = Date.now();
    
    try {
      const existingConfig = await this.getConfiguration(instance, pid);
      if (!existingConfig.success) {
        return createOSGiFailureResult(existingConfig.error, Date.now() - startTime);
      }

      const formData = new URLSearchParams();
      formData.append('unbind', 'true');
      
      if (bundleLocation) {
        formData.append('bundleLocation', bundleLocation);
      }

      const response = await this.httpClient.makeRequest(
        instance,
        `/system/console/configMgr/${encodeURIComponent(pid)}`,
        'POST',
        formData.toString(),
        this.#config.timeout
      );

      if (!isOk(response.status)) {
        if (isAuthError(response.status)) {
          return createOSGiFailureResult(
            this.createError(OSGI_ERROR_CODES.PERMISSION_DENIED, `Authentication required (HTTP ${response.status})`),
            Date.now() - startTime
          );
        }
        return createOSGiFailureResult(
          this.createError(OSGI_ERROR_CODES.OPERATION_FAILED, `Configuration unbind failed (HTTP ${response.status})`),
          Date.now() - startTime
        );
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      const updatedConfig = await this.getConfiguration(instance, pid);
      if (!updatedConfig.success) {
        return createOSGiFailureResult(updatedConfig.error, Date.now() - startTime);
      }

      return createOSGiSuccessResult({
        success: true,
        configuration: updatedConfig.data,
        message: 'Configuration unbound successfully'
      }, Date.now() - startTime);

    } catch (error) {
      return createOSGiFailureResult(
        this.classifyError(error),
        Date.now() - startTime
      );
    }
  }

  #parseConfigurations(configData: readonly unknown[]): OSGiConfiguration[] {
    const configurations: OSGiConfiguration[] = [];

    for (const item of configData) {
      try {
        const configuration = this.#parseConfiguration(item);
        if (configuration) {
          configurations.push(configuration);
        }
      } catch (error) {
        this.logger.warn('Failed to parse configuration data', { item, error });
      }
    }

    return configurations;
  }

  #parseConfiguration(item: unknown): OSGiConfiguration | null {
    if (!this.#isValidConfigurationData(item)) {
      return null;
    }

    const typedItem = item as { 
      pid: string; 
      title?: string; 
      description?: string; 
      properties?: Record<string, unknown>; 
      factoryPid?: string; 
      bundleLocation?: string 
    };
    
    const properties: Record<string, ConfigProperty> = {};

    if (typedItem.properties && typeof typedItem.properties === 'object') {
      for (const [key, propData] of Object.entries(typedItem.properties)) {
        if (this.#isValidPropertyData(propData)) {
          const typedProp = propData as { value: unknown; type?: string; cardinality?: number; description?: string };
          properties[key] = {
            name: key,
            value: typedProp.value,
            type: (typedProp.type && isConfigPropertyType(typedProp.type)) ? typedProp.type : 'String',
            cardinality: typedProp.cardinality,
            description: typedProp.description
          };
        }
      }
    }

    return {
      pid: typedItem.pid,
      title: typedItem.title,
      description: typedItem.description,
      properties,
      factoryPid: typedItem.factoryPid,
      bundleLocation: typedItem.bundleLocation
    };
  }

  #isValidConfigurationData(item: unknown): item is { pid: string; title?: string; description?: string; properties?: Record<string, unknown>; factoryPid?: string; bundleLocation?: string } {
    return (
      typeof item === 'object' &&
      item !== null &&
      'pid' in item &&
      typeof (item as Record<string, unknown>).pid === 'string'
    );
  }

  #isValidPropertyData(prop: unknown): boolean {
    return (
      typeof prop === 'object' &&
      prop !== null &&
      'value' in prop
    );
  }

  #filterConfigurations(configurations: OSGiConfiguration[], pidFilter?: string): OSGiConfiguration[] {
    if (!pidFilter) {
      return configurations;
    }

    const filter = pidFilter.toLowerCase();
    return configurations.filter(config => 
      config.pid.toLowerCase().includes(filter) ||
      (config.title && config.title.toLowerCase().includes(filter))
    );
  }

  #validateConfigurationRequest(request: Omit<ConfigurationRequest, 'instanceAlias'>): { valid: boolean; error?: string } {
    if (!request.pid || typeof request.pid !== 'string') {
      return { valid: false, error: 'PID is required and must be a string' };
    }

    if (!request.properties || typeof request.properties !== 'object') {
      return { valid: false, error: 'Properties are required and must be an object' };
    }

    for (const [key, property] of Object.entries(request.properties)) {
      if (!isConfigProperty(property)) {
        return { valid: false, error: `Invalid property: ${key}` };
      }

      if (!this.#validatePropertyValue(property)) {
        return { valid: false, error: `Invalid value for property: ${key}` };
      }
    }

    return { valid: true };
  }

  #validatePropertyValue(property: ConfigProperty): boolean {
    try {
      switch (property.type) {
        case 'String':
          return typeof property.value === 'string';
        case 'Long':
        case 'Integer':
        case 'Short':
          return typeof property.value === 'number' && Number.isInteger(property.value);
        case 'Double':
        case 'Float':
          return typeof property.value === 'number';
        case 'Boolean':
          return typeof property.value === 'boolean';
        case 'Character':
          return typeof property.value === 'string' && property.value.length === 1;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  #buildConfigurationFormData(request: Omit<ConfigurationRequest, 'instanceAlias'>): URLSearchParams {
    const formData = new URLSearchParams();
    
    formData.append('apply', 'true');
    
    if (request.factoryPid) {
      formData.append('factoryPid', request.factoryPid);
    }
    
    if (request.bundleLocation) {
      formData.append('bundleLocation', request.bundleLocation);
    }

    for (const [key, property] of Object.entries(request.properties)) {
      const value = this.#convertPropertyValue(property);
      formData.append(key, value);
      
      if (property.type && property.type !== 'String') {
        formData.append(`${key}$type`, property.type);
      }
      
      if (property.cardinality !== undefined) {
        formData.append(`${key}$cardinality`, property.cardinality.toString());
      }
    }

    return formData;
  }

  #convertPropertyValue(property: ConfigProperty): string {
    switch (property.type) {
      case 'Boolean':
        return property.value ? 'true' : 'false';
      case 'String':
      case 'Character':
        return String(property.value);
      case 'Long':
      case 'Integer':
      case 'Short':
      case 'Double':
      case 'Float':
        return property.value.toString();
      default:
        return String(property.value);
    }
  }

}