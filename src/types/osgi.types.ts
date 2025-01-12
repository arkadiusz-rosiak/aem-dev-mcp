export enum OSGI_ERROR_CODES {
  BUNDLE_RESOLUTION_FAILED = 'OSGI_001',
  MISSING_DEPENDENCY = 'OSGI_002',
  CONFIGURATION_CONFLICT = 'OSGI_003',
  PERMISSION_DENIED = 'OSGI_004',
  NETWORK_TIMEOUT = 'OSGI_005',
  INVALID_BUNDLE_FORMAT = 'OSGI_006',
  COMPONENT_DEPENDENCY_ACTIVE = 'OSGI_007',
  CONFIGURATION_TYPE_MISMATCH = 'OSGI_008',
  BUNDLE_NOT_FOUND = 'OSGI_009',
  OPERATION_FAILED = 'OSGI_010',
  COMPONENT_NOT_FOUND = 'OSGI_011'
}

export interface OSGiError {
  readonly code: OSGI_ERROR_CODES;
  readonly message: string;
  readonly details?: any;
  readonly retry?: boolean;
}

export type BundleState = 
  | 'Active' 
  | 'Resolved' 
  | 'Installed' 
  | 'Starting' 
  | 'Stopping' 
  | 'Uninstalled' 
  | 'Fragment';

export type ComponentState = 
  | 'active' 
  | 'satisfied' 
  | 'unsatisfied' 
  | 'disabled';

export type ConfigPropertyType = 
  | 'String' 
  | 'Long' 
  | 'Integer' 
  | 'Short' 
  | 'Character' 
  | 'Boolean' 
  | 'Double' 
  | 'Float';

export interface OSGiBundle {
  readonly id: number;
  readonly name: string;
  readonly symbolicName: string;
  readonly version: string;
  readonly state: BundleState;
  readonly category?: string;
  readonly stateRaw: number;
  readonly fragment: boolean;
  readonly imported?: boolean;
}

export interface OSGiBundleDetails extends OSGiBundle {
  readonly description?: string;
  readonly vendor?: string;
  readonly location?: string;
  readonly lastModified?: number;
  readonly stateHistory?: {
    readonly timestamp: number;
    readonly previousState: BundleState;
    readonly currentState: BundleState;
    readonly reason?: string;
  }[];
  readonly exportedPackages?: {
    readonly name: string;
    readonly version: string;
    readonly used: boolean;
  }[];
  readonly importedPackages?: {
    readonly name: string;
    readonly version: string;
    readonly optional: boolean;
    readonly resolved: boolean;
    readonly exportingBundle?: number;
  }[];
  readonly requiredBundles?: {
    readonly symbolicName: string;
    readonly version: string;
    readonly optional: boolean;
    readonly resolved: boolean;
  }[];
  readonly providedServices?: {
    readonly id: number;
    readonly interfaces: string[];
    readonly properties: Record<string, any>;
  }[];
  readonly usedServices?: {
    readonly id: number;
    readonly interfaces: string[];
    readonly providingBundle: number;
  }[];
  readonly bundleHeaders?: Record<string, string>;
  readonly startLevel?: number;
}

export interface OSGiComponent {
  readonly id: number;
  readonly name: string;
  readonly state: ComponentState;
  readonly pid?: string;
  readonly properties?: Record<string, any>;
}

export interface ConfigProperty {
  readonly name: string;
  readonly value: any;
  readonly type: ConfigPropertyType;
  readonly cardinality?: number;
  readonly description?: string;
}

export interface OSGiConfiguration {
  readonly pid: string;
  readonly title?: string;
  readonly description?: string;
  readonly properties: Record<string, ConfigProperty>;
  readonly factoryPid?: string;
  readonly bundleLocation?: string;
}

export interface BundleInstallRequest {
  readonly instanceAlias: string;
  readonly bundleFile?: Buffer;
  readonly bundleUrl?: string;
  readonly startLevel?: number;
  readonly start?: boolean;
  readonly refresh?: boolean;
}

export interface BundleOperationRequest {
  readonly instanceAlias: string;
  readonly bundleId?: number;
  readonly symbolicName?: string;
  readonly action: 'start' | 'stop' | 'uninstall' | 'refresh';
}

export interface ComponentOperationRequest {
  readonly instanceAlias: string;
  readonly componentId?: number;
  readonly componentName?: string;
  readonly action: 'enable' | 'disable';
}

export interface ConfigurationRequest {
  readonly instanceAlias: string;
  readonly pid: string;
  readonly properties: Record<string, ConfigProperty>;
  readonly factoryPid?: string;
  readonly bundleLocation?: string;
}

export interface ConfigurationUnbindRequest {
  readonly instanceAlias: string;
  readonly pid: string;
  readonly bundleLocation?: string;
}

export interface BundleOperationResult {
  readonly success: boolean;
  readonly bundle?: OSGiBundle;
  readonly message: string;
  readonly error?: OSGiError;
}

export interface BundleDetailsResult {
  readonly success: boolean;
  readonly bundleDetails?: OSGiBundleDetails;
  readonly message: string;
  readonly error?: OSGiError;
}

export interface ComponentOperationResult {
  readonly success: boolean;
  readonly component?: OSGiComponent;
  readonly message: string;
  readonly error?: OSGiError;
}

export interface ConfigurationOperationResult {
  readonly success: boolean;
  readonly configuration?: OSGiConfiguration;
  readonly message: string;
  readonly error?: OSGiError;
}


export const isBundleState = (value: string): value is BundleState => {
  return ['Active', 'Resolved', 'Installed', 'Starting', 'Stopping', 'Uninstalled', 'Fragment'].includes(value);
};

export const isComponentState = (value: string): value is ComponentState => {
  return ['active', 'satisfied', 'unsatisfied', 'disabled'].includes(value);
};

export const isConfigPropertyType = (value: string): value is ConfigPropertyType => {
  return ['String', 'Long', 'Integer', 'Short', 'Character', 'Boolean', 'Double', 'Float'].includes(value);
};

export const isOSGiBundle = (value: unknown): value is OSGiBundle => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'symbolicName' in value &&
    'version' in value &&
    'state' in value &&
    'stateRaw' in value &&
    'fragment' in value &&
    typeof (value as any).id === 'number' &&
    typeof (value as any).name === 'string' &&
    typeof (value as any).symbolicName === 'string' &&
    typeof (value as any).version === 'string' &&
    isBundleState((value as any).state) &&
    typeof (value as any).stateRaw === 'number' &&
    typeof (value as any).fragment === 'boolean'
  );
};

export const isOSGiComponent = (value: unknown): value is OSGiComponent => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'state' in value &&
    typeof (value as any).id === 'number' &&
    typeof (value as any).name === 'string' &&
    isComponentState((value as any).state)
  );
};

export const isConfigProperty = (value: unknown): value is ConfigProperty => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'value' in value &&
    'type' in value &&
    typeof (value as any).name === 'string' &&
    isConfigPropertyType((value as any).type)
  );
};