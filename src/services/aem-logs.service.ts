import {
  AEMInstance,
  OperationResult,
  TimeoutMs
} from '@/types/index.js';
import { AemHttpClient } from '@/services/http-client.js';
import { BaseOSGiService, BaseOSGiServiceConfig } from '@/utils/base-osgi-service.js';
import { createAemLogsSuccessResult, createAemLogsFailureResult } from '@/utils/aem-logs-result.js';
import { TIMEOUTS } from '@/constants/timeouts.js';
import {
  LogType,
  LogOperationResult,
  LogSearchResult,
  AemLogsError,
  AEM_LOGS_ERROR_CODES,
  LOG_TYPE_PATHS
} from '@/types/aem-logs.types.js';
import { paginateLogLines, TokenCountError } from '@/utils/pagination.utils.js';

interface AemLogsServiceConfig extends BaseOSGiServiceConfig {
  readonly logTimeout: TimeoutMs;
  readonly maxLogLines: number;
}

const DEFAULT_CONFIG: AemLogsServiceConfig = {
  timeout: TIMEOUTS.DEFAULT,
  logTimeout: (TIMEOUTS.DEFAULT * 2) as TimeoutMs,
  actionDelayMs: 500,
  maxLogLines: 50000 // Warning: Processing large logs may impact performance
} as const;

export class AemLogsService extends BaseOSGiService {
  readonly #config: AemLogsServiceConfig;

  constructor(httpClient: AemHttpClient, config: Partial<AemLogsServiceConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(httpClient, fullConfig);
    this.#config = fullConfig;
  }

  async searchLogs(
    instance: AEMInstance,
    regex: string,
    logType: LogType,
    page: number
  ): Promise<OperationResult<LogOperationResult, AemLogsError>> {
    const startTime = Date.now();

    try {
      // Validate regex pattern
      const regexValidation = this.#validateRegexPattern(regex);
      if (!regexValidation.valid) {
        return createAemLogsFailureResult(
          this.#createAemLogsError(
            AEM_LOGS_ERROR_CODES.INVALID_REGEX_PATTERN,
            regexValidation.error || 'Invalid regex pattern'
          ),
          Date.now() - startTime
        );
      }

      // Get log file path
      const logPath = LOG_TYPE_PATHS[logType];
      if (!logPath) {
        return createAemLogsFailureResult(
          this.#createAemLogsError(
            AEM_LOGS_ERROR_CODES.UNSUPPORTED_LOG_TYPE,
            `Unsupported log type: ${logType}`
          ),
          Date.now() - startTime
        );
      }

      // Fetch logs from AEM
      const logsResult = await this.#fetchLogsFromAem(instance, logPath, regex);
      if (!logsResult.success) {
        return createAemLogsFailureResult(logsResult.error, Date.now() - startTime);
      }

      const rawLogs = logsResult.data;
      
      // Split into lines and filter empty lines
      const allLines = rawLogs
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      // Log performance warning for very large log files
      if (allLines.length > this.#config.maxLogLines) {
        this.logger.warn(`Processing large log file with ${allLines.length} lines (max recommended: ${this.#config.maxLogLines}). This may impact performance.`, {
          instance: instance.url,
          logType,
          totalLines: allLines.length
        });
      }

      // Apply client-side pagination
      const paginationResult = this.#paginateLogs(allLines, page);
      if (!paginationResult.success) {
        return createAemLogsFailureResult(paginationResult.error, Date.now() - startTime);
      }

      const logSearchResult: LogSearchResult = {
        instance: instance.url,
        log_type: logType,
        entries: paginationResult.data.paginatedLines,
        pagination: {
          current_page: paginationResult.data.currentPage,
          total_pages: paginationResult.data.totalPages,
          total_entries: paginationResult.data.totalEntries,
          entries_on_page: paginationResult.data.entriesOnPage
        },
        regex_used: regex
      };

      const result: LogOperationResult = {
        success: true,
        result: logSearchResult,
        message: `Found ${paginationResult.data.totalEntries} log entries matching pattern`
      };

      return createAemLogsSuccessResult(result, Date.now() - startTime);

    } catch (error) {
      return createAemLogsFailureResult(
        this.#createAemLogsError(
          AEM_LOGS_ERROR_CODES.LOG_PARSING_ERROR,
          `Failed to search logs: ${error instanceof Error ? error.message : 'Unknown error'}`
        ),
        Date.now() - startTime
      );
    }
  }

  async #fetchLogsFromAem(
    instance: AEMInstance,
    logPath: string,
    regex: string
  ): Promise<OperationResult<string, AemLogsError>> {
    const startTime = Date.now();

    try {
      const queryParams = new URLSearchParams({
        name: logPath,
        grep: regex,
        tail: '-1'
      });

      const response = await this.makeAuthenticatedRequest<string>(
        instance,
        `/system/console/slinglog/tailer.txt?${queryParams}`,
        'GET',
        undefined,
        this.#config.logTimeout,
        'Log tailer service unavailable',
        'Authentication required for log access'
      );

      if (!response.success) {
        let aemLogsError: AemLogsError;
        
        if (response.error.message.includes('not found') || response.error.message.includes('404')) {
          aemLogsError = this.#createAemLogsError(
            AEM_LOGS_ERROR_CODES.LOG_FILE_NOT_FOUND,
            `Log file not found: ${logPath}`
          );
        } else if (response.error.message.includes('Authentication') || response.error.message.includes('403')) {
          aemLogsError = this.#createAemLogsError(
            AEM_LOGS_ERROR_CODES.LOG_ACCESS_DENIED,
            'Access denied to log file'
          );
        } else {
          aemLogsError = this.#createAemLogsError(
            AEM_LOGS_ERROR_CODES.LOG_PARSING_ERROR,
            response.error.message
          );
        }
        
        return createAemLogsFailureResult(aemLogsError, Date.now() - startTime);
      }

      return createAemLogsSuccessResult(response.data || '', Date.now() - startTime);
    } catch (error) {
      return createAemLogsFailureResult(
        this.#createAemLogsError(
          AEM_LOGS_ERROR_CODES.LOG_PARSING_ERROR,
          `Failed to fetch logs: ${error instanceof Error ? error.message : 'Unknown error'}`
        ),
        Date.now() - startTime
      );
    }
  }

  #paginateLogs(lines: readonly string[], page: number): OperationResult<{
    paginatedLines: readonly string[];
    totalPages: number;
    currentPage: number;
    totalEntries: number;
    entriesOnPage: number;
  }, AemLogsError> {
    try {
      if (page < 1) {
        return createAemLogsFailureResult(
          this.#createAemLogsError(
            AEM_LOGS_ERROR_CODES.INVALID_PAGE_NUMBER,
            'Page number must be at least 1'
          ),
          0
        );
      }

      const paginationResult = paginateLogLines(lines, page);

      if (page > paginationResult.totalPages && paginationResult.totalPages > 0) {
        return createAemLogsFailureResult(
          this.#createAemLogsError(
            AEM_LOGS_ERROR_CODES.INVALID_PAGE_NUMBER,
            `Requested page ${page} exceeds total pages ${paginationResult.totalPages}`
          ),
          0
        );
      }

      return createAemLogsSuccessResult(paginationResult, 0);
    } catch (error) {
      let errorCode = AEM_LOGS_ERROR_CODES.PAGINATION_ERROR;
      let message = 'Failed to paginate logs';

      if (error instanceof TokenCountError) {
        errorCode = AEM_LOGS_ERROR_CODES.TOKEN_COUNT_ERROR;
        message = `Token counting failed: ${error.message}`;
      } else if (error instanceof Error) {
        message = `Pagination failed: ${error.message}`;
      }

      return createAemLogsFailureResult(
        this.#createAemLogsError(errorCode, message, error),
        0
      );
    }
  }

  #validateRegexPattern(pattern: string): { valid: boolean; error?: string } {
    try {
      new RegExp(pattern);
      
      if (pattern.length === 0) {
        return { valid: false, error: 'Regex pattern cannot be empty' };
      }
      
      if (pattern.length > 1000) {
        return { valid: false, error: 'Regex pattern too long (max 1000 characters)' };
      }
      
      return { valid: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        valid: false,
        error: `Invalid regex pattern '${pattern}': ${errorMsg}. Examples of valid patterns: 'ERROR.*', '\\d{4}-\\d{2}-\\d{2}', 'Exception|Error'`
      };
    }
  }

  #createAemLogsError(
    code: AEM_LOGS_ERROR_CODES,
    message: string,
    details?: unknown,
    retry?: boolean
  ): AemLogsError {
    return {
      code,
      message,
      details,
      retry: retry ?? false
    };
  }
}