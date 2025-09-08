import { AemLogsService } from '@/services/aem-logs.service.js';
import { AemHttpClient } from '@/services/http-client.js';
import {
  AEMInstance,
  AEM_LOGS_ERROR_CODES
} from '@/types/index.js';

jest.mock('@/services/http-client.js');
jest.mock('@/utils/logger.js');
jest.mock('@/utils/pagination.utils.js', () => ({
  paginateLogLines: jest.fn(() => ({
    paginatedLines: ['Log line 1', 'Log line 2'],
    totalPages: 1,
    currentPage: 1,
    totalEntries: 2,
    entriesOnPage: 2
  })),
  TokenCountError: class TokenCountError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TokenCountError';
    }
  }
}));

describe('AemLogsService', () => {
  let logsService: AemLogsService;
  let mockHttpClient: jest.Mocked<AemHttpClient>;
  let testInstance: AEMInstance;

  beforeEach(() => {
    mockHttpClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    logsService = new AemLogsService(mockHttpClient);
    testInstance = {
      url: 'http://test-author.example.com:4502',
      username: 'testuser',
      password: 'testpass'
    } as const;
    
    jest.clearAllMocks();
  });

  describe('searchLogs', () => {
    it('should successfully search logs', async () => {
      const mockLogData = 'Error log line 1\nError log line 2\n';
      
      mockHttpClient.makeRequest = jest.fn().mockResolvedValue({
        status: 200,
        data: mockLogData,
        headers: {}
      });

      const result = await logsService.searchLogs(
        testInstance,
        'Error.*',
        'application_errors',
        1
      );

      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
      expect(result.data.result?.instance).toBe(testInstance.url);
      expect(result.data.result?.log_type).toBe('application_errors');
      expect(result.data.result?.regex_used).toBe('Error.*');
      expect(result.data.result?.entries).toEqual(['Log line 1', 'Log line 2']);
    });

    it('should handle invalid regex pattern', async () => {
      const result = await logsService.searchLogs(
        testInstance,
        '[invalid regex',
        'application_errors',
        1
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(AEM_LOGS_ERROR_CODES.INVALID_REGEX_PATTERN);
    });

    it('should handle unsupported log type', async () => {
      const result = await logsService.searchLogs(
        testInstance,
        'test',
        'unsupported_log' as any,
        1
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(AEM_LOGS_ERROR_CODES.UNSUPPORTED_LOG_TYPE);
    });

    it('should handle HTTP errors from AEM', async () => {
      mockHttpClient.makeRequest = jest.fn().mockResolvedValue({
        status: 404,
        data: null,
        headers: {}
      });

      const result = await logsService.searchLogs(
        testInstance,
        'test',
        'application_errors',
        1
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(AEM_LOGS_ERROR_CODES.LOG_FILE_NOT_FOUND);
    });

    it('should handle authentication errors', async () => {
      mockHttpClient.makeRequest = jest.fn().mockResolvedValue({
        status: 403,
        data: null,
        headers: {}
      });

      const result = await logsService.searchLogs(
        testInstance,
        'test',
        'application_errors',
        1
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(AEM_LOGS_ERROR_CODES.LOG_ACCESS_DENIED);
    });

    it('should handle invalid page numbers', async () => {
      const mockLogData = 'Log line 1\nLog line 2\n';
      
      mockHttpClient.makeRequest = jest.fn().mockResolvedValue({
        status: 200,
        data: mockLogData,
        headers: {}
      });

      const result = await logsService.searchLogs(
        testInstance,
        'test',
        'application_errors',
        0
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(AEM_LOGS_ERROR_CODES.INVALID_PAGE_NUMBER);
    });

    it('should handle empty log response', async () => {
      mockHttpClient.makeRequest = jest.fn().mockResolvedValue({
        status: 200,
        data: '',
        headers: {}
      });

      const result = await logsService.searchLogs(
        testInstance,
        'test',
        'application_errors',
        1
      );

      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
      expect(result.data.result?.entries).toEqual(['Log line 1', 'Log line 2']);
    });

    it('should use correct AEM endpoint and parameters', async () => {
      mockHttpClient.makeRequest = jest.fn().mockResolvedValue({
        status: 200,
        data: 'test log',
        headers: {}
      });

      await logsService.searchLogs(
        testInstance,
        'ERROR.*',
        'http_requests',
        2
      );

      expect(mockHttpClient.makeRequest).toHaveBeenCalledWith(
        testInstance,
        expect.stringContaining('/system/console/slinglog/tailer.txt'),
        'GET',
        undefined,
        expect.any(Number)
      );

      const calledUrl = (mockHttpClient.makeRequest as jest.Mock).mock.calls[0][1];
      expect(calledUrl).toContain('name=/logs/request.log');
      expect(calledUrl).toContain('grep=ERROR.*');
      expect(calledUrl).toContain('tail=-1');
    });
  });
});