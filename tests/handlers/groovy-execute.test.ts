import { handleGroovyExecute } from '@/handlers/groovy-execute.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { AEMInstance } from '@/types/index.js';
import { AxiosResponse } from 'axios';

jest.mock('@/services/alias-resolver.js');
jest.mock('@/services/parallel-executor.js');
jest.mock('@/services/http-client.js');
jest.mock('@/utils/logger.js');

describe('handleGroovyExecute', () => {
  let mockResolver: jest.Mocked<AliasResolver>;
  let mockExecutor: jest.Mocked<ParallelExecutor>;
  let mockClient: jest.Mocked<AemHttpClient>;
  
  const testInstance: AEMInstance = {
    url: 'http://author-test:4502',
    username: 'admin',
    password: 'admin'
  };

  const multipleInstances: AEMInstance[] = [
    testInstance,
    { url: 'http://publish-test:4503', username: 'admin', password: 'admin' }
  ];

  beforeEach(() => {
    mockResolver = new AliasResolver('test') as jest.Mocked<AliasResolver>;
    mockExecutor = new ParallelExecutor() as jest.Mocked<ParallelExecutor>;
    mockClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    
    jest.clearAllMocks();
  });

  describe('validation', () => {
    it('should reject when neither script nor scriptPath is provided', async () => {
      const result = await handleGroovyExecute(
        { instanceAlias: 'test' },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should reject when both script and scriptPath are provided', async () => {
      const result = await handleGroovyExecute(
        {
          script: 'println "test"',
          scriptPath: '/test/script.groovy',
          instanceAlias: 'test'
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should reject empty script', async () => {
      const result = await handleGroovyExecute(
        {
          script: '',
          instanceAlias: 'test'
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should reject non-absolute script path', async () => {
      const result = await handleGroovyExecute(
        {
          scriptPath: 'relative/path.groovy',
          instanceAlias: 'test'
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should reject timeout too small', async () => {
      const result = await handleGroovyExecute(
        {
          script: 'println "test"',
          instanceAlias: 'test',
          timeout: 500
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should reject timeout too large', async () => {
      const result = await handleGroovyExecute(
        {
          script: 'println "test"',
          instanceAlias: 'test',
          timeout: 700000
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
    });
  });

  describe('alias resolution', () => {
    it('should handle failed alias resolution', async () => {
      mockResolver.resolveAlias.mockResolvedValue({
        alias: 'nonexistent',
        resolved: false,
        instances: [],
        error: 'Alias not found'
      });

      const result = await handleGroovyExecute(
        {
          script: 'println "test"',
          instanceAlias: 'nonexistent'
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to resolve alias');
    });

    it('should handle empty instances after resolution', async () => {
      mockResolver.resolveAlias.mockResolvedValue({
        alias: 'empty',
        resolved: true,
        instances: [],
        error: undefined
      });

      const result = await handleGroovyExecute(
        {
          script: 'println "test"',
          instanceAlias: 'empty'
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No instances found');
    });
  });

  describe('single instance execution', () => {
    beforeEach(() => {
      mockResolver.resolveAlias.mockResolvedValue({
        alias: 'test',
        resolved: true,
        instances: [testInstance],
        error: undefined
      });
    });

    it('should successfully execute script on single instance', async () => {
      const mockResponse: Partial<AxiosResponse> = {
        status: 200,
        data: {
          output: 'Script executed successfully\n',
          result: { test: 'result' },
          runningTime: '234 ms'
        }
      };

      mockClient.makeRequest.mockResolvedValue(mockResponse as AxiosResponse);

      const result = await handleGroovyExecute(
        {
          script: 'println "test"; return [test: "result"]',
          instanceAlias: 'test'
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.instanceUrl).toBe(testInstance.url);
      expect(parsed.response.success).toBe(true);
      expect(parsed.response.output).toBe('Script executed successfully\n');
      expect(parsed.response.result).toEqual({ test: 'result' });
    });

    it('should handle script execution with scriptPath', async () => {
      const mockResponse: Partial<AxiosResponse> = {
        status: 200,
        data: {
          output: 'Script from path executed\n',
          result: 'path result'
        }
      };

      mockClient.makeRequest.mockResolvedValue(mockResponse as AxiosResponse);

      const result = await handleGroovyExecute(
        {
          scriptPath: '/conf/groovyconsole/scripts/test.groovy',
          instanceAlias: 'test'
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(mockClient.makeRequest).toHaveBeenCalledWith(
        testInstance,
        '/bin/groovyconsole/post.json',
        'POST',
        expect.stringContaining('scriptPath=%2Fconf%2Fgroovyconsole%2Fscripts%2Ftest.groovy'),
        30000
      );

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.response.success).toBe(true);
      expect(parsed.response.result).toBe('path result');
    });

    it('should handle script execution errors', async () => {
      const mockResponse: Partial<AxiosResponse> = {
        status: 200,
        data: {
          output: '',
          exceptionStackTrace: 'groovy.lang.MissingPropertyException: No such property'
        }
      };

      mockClient.makeRequest.mockResolvedValue(mockResponse as AxiosResponse);

      const result = await handleGroovyExecute(
        {
          script: 'println undefinedVariable',
          instanceAlias: 'test'
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.response.success).toBe(false);
      expect(parsed.response.error.message).toBe('Script execution failed');
      expect(parsed.response.error.exceptionStackTrace).toContain('MissingPropertyException');
    });

    it('should handle HTTP errors', async () => {
      const mockResponse: Partial<AxiosResponse> = {
        status: 500,
        statusText: 'Internal Server Error',
        data: { error: 'Server error' }
      };

      mockClient.makeRequest.mockResolvedValue(mockResponse as AxiosResponse);

      const result = await handleGroovyExecute(
        {
          script: 'println "test"',
          instanceAlias: 'test'
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.response.success).toBe(false);
      expect(parsed.response.error.message).toContain('HTTP 500');
    });

    it('should handle network errors', async () => {
      mockClient.makeRequest.mockRejectedValue(new Error('Network error'));

      const result = await handleGroovyExecute(
        {
          script: 'println "test"',
          instanceAlias: 'test'
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.response.success).toBe(false);
      expect(parsed.response.error.message).toBe('Network error');
    });

    it('should use custom timeout', async () => {
      const mockResponse: Partial<AxiosResponse> = {
        status: 200,
        data: { output: 'test', result: null }
      };

      mockClient.makeRequest.mockResolvedValue(mockResponse as AxiosResponse);

      await handleGroovyExecute(
        {
          script: 'println "test"',
          instanceAlias: 'test',
          timeout: 60000
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(mockClient.makeRequest).toHaveBeenCalledWith(
        testInstance,
        '/bin/groovyconsole/post.json',
        'POST',
        expect.any(String),
        60000
      );
    });
  });

  describe('multiple instance execution', () => {
    beforeEach(() => {
      mockResolver.resolveAlias.mockResolvedValue({
        alias: 'all',
        resolved: true,
        instances: multipleInstances,
        error: undefined
      });
    });

    it('should execute on multiple instances in parallel', async () => {
      const mockResults = [
        {
          success: true,
          instanceUrl: 'http://author-test:4502',
          duration: 100,
          data: {
            success: true,
            instanceUrl: 'http://author-test:4502',
            executionTime: 100,
            output: 'Author result\n',
            result: 'author'
          }
        },
        {
          success: true,
          instanceUrl: 'http://publish-test:4503',
          duration: 150,
          data: {
            success: true,
            instanceUrl: 'http://publish-test:4503',
            executionTime: 150,
            output: 'Publish result\n',
            result: 'publish'
          }
        }
      ];

      mockExecutor.executeOnInstances.mockResolvedValue(mockResults);

      const result = await handleGroovyExecute(
        {
          script: 'println "test"',
          instanceAlias: 'all'
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.results.alias).toBe('all');
      expect(parsed.results.results).toHaveLength(2);
      expect(parsed.results.summary.total).toBe(2);
      expect(parsed.results.summary.succeeded).toBe(2);
      expect(parsed.results.summary.failed).toBe(0);
    });

    it('should handle mixed success/failure results', async () => {
      const mockResults = [
        {
          success: true,
          instanceUrl: 'http://author-test:4502',
          duration: 100,
          data: {
            success: true,
            instanceUrl: 'http://author-test:4502',
            executionTime: 100,
            output: 'Success\n',
            result: 'ok'
          }
        },
        {
          success: false,
          instanceUrl: 'http://publish-test:4503',
          duration: 50,
          error: 'Script failed'
        }
      ];

      mockExecutor.executeOnInstances.mockResolvedValue(mockResults);

      const result = await handleGroovyExecute(
        {
          script: 'println "test"',
          instanceAlias: 'all'
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.results.summary.total).toBe(2);
      expect(parsed.results.summary.succeeded).toBe(1);
      expect(parsed.results.summary.failed).toBe(1);
    });

    it('should handle executor returning malformed results', async () => {
      const mockResults = [
        {
          success: false,
          instanceUrl: 'http://author-test:4502',
          error: 'Connection failed',
          duration: 1000
        }
      ];

      mockExecutor.executeOnInstances.mockResolvedValue(mockResults);

      const result = await handleGroovyExecute(
        {
          script: 'println "test"',
          instanceAlias: 'all'
        },
        mockResolver,
        mockExecutor,
        mockClient
      );

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.results.results[0].success).toBe(false);
      expect(parsed.results.results[0].error.message).toBe('Connection failed');
    });
  });
});