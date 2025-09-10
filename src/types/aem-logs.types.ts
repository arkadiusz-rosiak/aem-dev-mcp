export enum AEM_LOGS_ERROR_CODES {
  INVALID_REGEX_PATTERN = 'AEM_LOGS_001',
  UNSUPPORTED_LOG_TYPE = 'AEM_LOGS_002',
  LOG_FILE_NOT_FOUND = 'AEM_LOGS_003',
  INVALID_PAGE_NUMBER = 'AEM_LOGS_004',
  PAGINATION_ERROR = 'AEM_LOGS_005',
  TOKEN_COUNT_ERROR = 'AEM_LOGS_006',
  LOG_ACCESS_DENIED = 'AEM_LOGS_007',
  LOG_PARSING_ERROR = 'AEM_LOGS_008'
}

export interface AemLogsError {
  readonly code: AEM_LOGS_ERROR_CODES;
  readonly message: string;
  readonly details?: any;
  readonly retry?: boolean;
}

export type LogType = 
  | 'application_errors'
  | 'http_requests'
  | 'web_access'
  | 'audit'
  | 'startup_messages'
  | 'system_errors'
  | 'bundle_lifecycle'
  | 'history'
  | 'upgrade_operations';

export interface PaginationMetadata {
  readonly current_page: number;
  readonly total_pages: number;
  readonly total_entries: number;
  readonly entries_on_page: number;
}

export interface LogSearchResult {
  readonly instance: string;
  readonly log_type: LogType;
  readonly entries: readonly string[];
  readonly pagination: PaginationMetadata;
}

export interface AemLogsSearchOutput {
  readonly results: readonly LogSearchResult[];
  readonly summary: {
    readonly total_instances: number;
    readonly successful_instances: number;
    readonly failed_instances: number;
  };
}

export interface LogSearchRequest {
  readonly instance: string;
  readonly regex: string;
  readonly log_type: LogType;
  readonly page: number;
}

export interface PaginationResult {
  readonly paginatedLines: readonly string[];
  readonly totalPages: number;
  readonly currentPage: number;
  readonly totalEntries: number;
  readonly entriesOnPage: number;
}

export interface LogOperationResult {
  readonly success: boolean;
  readonly result?: LogSearchResult;
  readonly message: string;
  readonly error?: AemLogsError;
}

export const LOG_TYPE_PATHS: Record<LogType, string> = {
  application_errors: '/logs/error.log',
  http_requests: '/logs/request.log',
  web_access: '/logs/access.log',
  audit: '/logs/audit.log',
  startup_messages: '/logs/stdout.log',
  system_errors: '/logs/stderr.log',
  bundle_lifecycle: '/logs/bundle.log',
  history: '/logs/history.log',
  upgrade_operations: '/logs/upgrade.log'
};

export const isLogType = (value: string): value is LogType => {
  return Object.keys(LOG_TYPE_PATHS).includes(value);
};

export const isLogSearchResult = (value: unknown): value is LogSearchResult => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'instance' in value &&
    'log_type' in value &&
    'entries' in value &&
    'pagination' in value &&
    typeof (value as any).instance === 'string' &&
    isLogType((value as any).log_type) &&
    Array.isArray((value as any).entries)
  );
};

export const isPaginationMetadata = (value: unknown): value is PaginationMetadata => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'current_page' in value &&
    'total_pages' in value &&
    'total_entries' in value &&
    'entries_on_page' in value &&
    typeof (value as any).current_page === 'number' &&
    typeof (value as any).total_pages === 'number' &&
    typeof (value as any).total_entries === 'number' &&
    typeof (value as any).entries_on_page === 'number'
  );
};