export interface GroovyConsoleResponse {
  output?: string;
  result?: unknown;
  runningTime?: string;
  exceptionStackTrace?: string;
}

export interface GroovyExecutionResponse {
  readonly success: boolean;
  readonly instanceUrl: string;
  readonly executionTime: number;
  readonly output: string;
  readonly result?: unknown;
  readonly runningTime?: string;
  readonly error?: {
    message: string;
    stackTrace?: string;
    exceptionStackTrace?: string;
  };
}

export interface GroovyExecutionResults {
  readonly alias: string;
  readonly results: readonly GroovyExecutionResponse[];
  readonly summary: {
    readonly total: number;
    readonly succeeded: number;
    readonly failed: number;
  };
}

export interface SingleInstanceGroovyResult {
  readonly requestId: string;
  readonly instanceUrl: string;
  readonly response: GroovyExecutionResponse;
}

export interface MultipleInstanceGroovyResult {
  readonly requestId: string;
  readonly results: GroovyExecutionResults;
}

export type GroovyExecuteResult = SingleInstanceGroovyResult | MultipleInstanceGroovyResult;