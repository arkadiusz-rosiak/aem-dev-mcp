import { handleAemLogsSearch, aemLogsSearchTool } from '@/handlers/aem-logs.handler.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { AEMInstance } from '@/types/index.js';

jest.mock('@/services/alias-resolver.js');
jest.mock('@/services/parallel-executor.js');
jest.mock('@/services/http-client.js');
jest.mock('@/utils/logger.js');

describe('AEM Logs Handler', () => {
  let mockResolver: jest.Mocked<AliasResolver>;
  let mockExecutor: jest.Mocked<ParallelExecutor>;
  let mockClient: jest.Mocked<AemHttpClient>;
  
  const testInstance: AEMInstance = {
    url: 'http://test-author.example.com:4502',
    username: 'testuser',
    password: 'testpass'
  };

  beforeEach(() => {
    mockResolver = new AliasResolver('') as jest.Mocked<AliasResolver>;
    mockExecutor = new ParallelExecutor() as jest.Mocked<ParallelExecutor>;
    mockClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    
    jest.clearAllMocks();
  });

  describe('aemLogsSearchTool', () => {
    it('should have correct tool definition', () => {
      expect(aemLogsSearchTool.name).toBe('aem_logs_search');
      expect(aemLogsSearchTool.description).toContain('Search AEM logs');
      expect(aemLogsSearchTool.inputSchema).toBeDefined();
      expect(aemLogsSearchTool.inputSchema.properties.regex).toBeDefined();
      expect(aemLogsSearchTool.inputSchema.required).toContain('regex');
    });
  });

  describe('handleAemLogsSearch', () => {
    it('should successfully handle log search request', async () => {
      const mockArgs = {
        aliases: ['local'],
        regex: 'ERROR.*',
        log_type: 'application_errors',
        page: 1
      };

      mockResolver.resolveAlias = jest.fn().mockResolvedValue({
        resolved: true,
        instances: [testInstance]
      });

      const mockLogResult = {
        success: true,
        data: {
          success: true,
          result: {
            instance: testInstance.url,
            log_type: 'application_errors',
            entries: ['ERROR: Test error message'],
            pagination: {
              current_page: 1,
              total_pages: 1,
              total_entries: 1,
              entries_on_page: 1
            },
            regex_used: 'ERROR.*'
          },
          message: 'Search completed'
        }
      };

      mockExecutor.executeOnInstances = jest.fn().mockResolvedValue([mockLogResult]);

      const result = await handleAemLogsSearch(mockArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      
      const response = JSON.parse(result.content[0].text);
      expect(response.summary.total_instances).toBe(1);
      expect(response.summary.successful_instances).toBe(1);
      expect(response.summary.failed_instances).toBe(0);
      expect(response.results).toHaveLength(1);
    });

    it('should handle validation errors', async () => {
      const invalidArgs = {
        // Missing required 'regex' field
        log_type: 'application_errors'
      };

      const result = await handleAemLogsSearch(invalidArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should handle no instances after resolution', async () => {
      const mockArgs = {
        aliases: ['nonexistent'],
        regex: 'ERROR.*'
      };

      mockResolver.resolveAlias = jest.fn().mockResolvedValue({
        resolved: false,
        instances: []
      });

      const result = await handleAemLogsSearch(mockArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No instances to check after resolution');
    });

    it('should handle failed log searches', async () => {
      const mockArgs = {
        instances: [testInstance],
        regex: 'ERROR.*'
      };

      const mockFailedResult = {
        success: false,
        error: { message: 'Log file not found' }
      };

      mockExecutor.executeOnInstances = jest.fn().mockResolvedValue([mockFailedResult]);

      const result = await handleAemLogsSearch(mockArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.summary.successful_instances).toBe(0);
      expect(response.summary.failed_instances).toBe(1);
      expect(response.results[0].error).toBe('Log file not found');
    });

    it('should use default values for optional parameters', async () => {
      const mockArgs = {
        instances: [testInstance],
        regex: 'test'
        // No log_type or page specified
      };

      mockExecutor.executeOnInstances = jest.fn().mockResolvedValue([{
        success: true,
        data: {
          success: true,
          result: {
            instance: testInstance.url,
            log_type: 'application_errors', // default
            entries: [],
            pagination: {
              current_page: 1, // default
              total_pages: 1,
              total_entries: 0,
              entries_on_page: 0
            },
            regex_used: 'test'
          }
        }
      }]);

      const result = await handleAemLogsSearch(mockArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.search_parameters.log_type).toBe('application_errors');
      expect(response.metadata.search_parameters.page).toBe(1);
    });

    it('should handle multiple instances', async () => {
      const testInstance2: AEMInstance = {
        url: 'http://test-publish.example.com:4503',
        username: 'testuser',
        password: 'testpass'
      };

      const mockArgs = {
        instances: [testInstance, testInstance2],
        regex: 'ERROR.*'
      };

      const mockResults = [
        {
          success: true,
          data: {
            success: true,
            result: {
              instance: testInstance.url,
              log_type: 'application_errors',
              entries: ['ERROR: Test 1'],
              pagination: { current_page: 1, total_pages: 1, total_entries: 1, entries_on_page: 1 },
              regex_used: 'ERROR.*'
            }
          }
        },
        {
          success: true,
          data: {
            success: true,
            result: {
              instance: testInstance2.url,
              log_type: 'application_errors',
              entries: ['ERROR: Test 2'],
              pagination: { current_page: 1, total_pages: 1, total_entries: 1, entries_on_page: 1 },
              regex_used: 'ERROR.*'
            }
          }
        }
      ];

      mockExecutor.executeOnInstances = jest.fn().mockResolvedValue(mockResults);

      const result = await handleAemLogsSearch(mockArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.summary.total_instances).toBe(2);
      expect(response.summary.successful_instances).toBe(2);
      expect(response.results).toHaveLength(2);
    });
  });
});