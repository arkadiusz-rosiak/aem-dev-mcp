export interface AEMInstance {
  readonly url: string;
  readonly username: string;
  readonly password: string;
}

export interface InstanceOperationResult<T> {
  readonly instanceUrl: string;
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly duration?: number;
  readonly requestId?: string;
}

export interface InstanceAliasConfig {
  readonly [alias: string]: readonly AEMInstance[];
}

export interface AliasResolutionResult {
  readonly alias: string;
  readonly instances: readonly AEMInstance[];
  readonly resolved: boolean;
  readonly error?: string;
}

export const isAEMInstance = (value: unknown): value is AEMInstance => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    'username' in value &&
    'password' in value &&
    typeof (value as any).url === 'string' &&
    typeof (value as any).username === 'string' &&
    typeof (value as any).password === 'string'
  );
};