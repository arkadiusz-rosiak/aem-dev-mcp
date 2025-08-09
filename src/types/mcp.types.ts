export interface MCPToolContent {
  readonly type: 'text' | 'image';
  readonly text?: string;
  readonly data?: string;
  readonly mimeType?: string;
}

export interface MCPToolResult {
  readonly content: readonly MCPToolContent[];
  readonly isError?: boolean;
}

export interface EnvConfig {
  readonly AEM_INSTANCES_CONFIG_PATH?: string;
}

export type OperationResult<T, E = Error> = 
  | { readonly success: true; readonly data: T; readonly duration: number }
  | { readonly success: false; readonly error: E; readonly duration: number };