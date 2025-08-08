import { DiagnosticsService } from '@/services/diagnostics-service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { 
  AEMInstance, 
  REPOSITORY_HEALTH,
  createByteSize,
  createPercentage,
  createThreadCount,
  createMilliseconds,
  createRequestCount,
  createBundleCount,
  createTimeout
} from '@/types.js';
import { AxiosResponse } from 'axios';

jest.mock('@/services/http-client.js');
jest.mock('@/utils/logger.js');

describe('DiagnosticsService', () => {
  let diagnosticsService: DiagnosticsService;
  let mockHttpClient: jest.Mocked<AemHttpClient>;
  let testInstance: AEMInstance;

  beforeEach(() => {
    mockHttpClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    diagnosticsService = new DiagnosticsService(mockHttpClient);
    testInstance = {
      url: 'http://localhost:4502',
      username: 'admin',
      password: 'admin'
    } as const;
    
    jest.clearAllMocks();
  });

  describe('collectDiagnostics', () => {
    it('should collect all diagnostic data successfully with concurrent checks', async () => {
      const mockMemoryHtml = 'Heap Memory Usage 512,000 of 1,024,000 Non-Heap Memory Usage 256,000 of 512,000';
      const mockThreadsHtml = 'Live threads: 150 RUNNABLE 50 BLOCKED 10 WAITING 40 TIMED_WAITING 30 Deadlocked threads: 0';
      const mockRequestsHtml = 'Average 250.5 ms Active Requests 5 Queued Requests 2 Error Rate 1.2%';
      const mockBundleData = {
        data: [
          { state: 'Active', symbolicName: 'bundle1' },
          { state: 'Active', symbolicName: 'bundle2' },
          { state: 'Installed', symbolicName: 'failed-bundle' }
        ]
      };

      mockHttpClient.makeRequest
        .mockImplementation((_instance, path) => {
          if (path === '/system/console/memoryusage') {
            return Promise.resolve({ status: 200, data: mockMemoryHtml } as AxiosResponse);
          } else if (path === '/system/console/threads') {
            return Promise.resolve({ status: 200, data: mockThreadsHtml } as AxiosResponse);
          } else if (path === '/oak:index') {
            return Promise.resolve({ status: 200, data: '' } as AxiosResponse);
          } else if (path === '/system/console/requests') {
            return Promise.resolve({ status: 200, data: mockRequestsHtml } as AxiosResponse);
          } else if (path === '/system/console/bundles.json') {
            return Promise.resolve({ status: 200, data: mockBundleData } as AxiosResponse);
          }
          return Promise.reject(new Error('Unknown path'));
        });

      const result = await diagnosticsService.collectDiagnostics(testInstance);

      expect(result.memory.heapUsed).toBe(createByteSize(512000 * 1024));
      expect(result.memory.heapMax).toBe(createByteSize(1024000 * 1024));
      expect(result.memory.nonHeapUsed).toBe(createByteSize(256000 * 1024));
      expect(result.memory.nonHeapMax).toBe(createByteSize(512000 * 1024));
      expect(result.memory.percentage).toBe(createPercentage(50));

      expect(result.threads.total).toBe(createThreadCount(150));
      expect(result.threads.runnable).toBe(createThreadCount(50));
      expect(result.threads.blocked).toBe(createThreadCount(10));
      expect(result.threads.waiting).toBe(createThreadCount(40));
      expect(result.threads.timedWaiting).toBe(createThreadCount(30));
      expect(result.threads.deadlocked).toBe(createThreadCount(0));

      expect(result.repository.indexHealth).toBe(REPOSITORY_HEALTH.HEALTHY);

      expect(result.requests.averageResponseTime).toBe(createMilliseconds(250.5));
      expect(result.requests.activeRequests).toBe(createRequestCount(5));
      expect(result.requests.queuedRequests).toBe(createRequestCount(2));
      expect(result.requests.errorRate).toBe(createPercentage(1));

      expect(result.bundles.total).toBe(createBundleCount(3));
      expect(result.bundles.active).toBe(createBundleCount(2));
      expect(result.bundles.installed).toBe(createBundleCount(1));
      expect(result.bundles.failed).toHaveLength(1);
    });

    it('should handle memory collection failure gracefully', async () => {
      mockHttpClient.makeRequest
        .mockImplementation((_instance, path) => {
          if (path === '/system/console/memoryusage') {
            return Promise.reject(new Error('Memory endpoint failed'));
          }
          return Promise.resolve({ status: 200, data: '' } as AxiosResponse);
        });

      const result = await diagnosticsService.collectDiagnostics(testInstance);

      expect(result.memory.heapUsed).toBe(createByteSize(0));
      expect(result.memory.heapMax).toBe(createByteSize(0));
      expect(result.memory.percentage).toBe(createPercentage(0));
    });

    it('should handle thread collection failure gracefully', async () => {
      mockHttpClient.makeRequest
        .mockImplementation((_instance, path) => {
          if (path === '/system/console/threads') {
            return Promise.resolve({ status: 500, data: '' } as AxiosResponse);
          }
          return Promise.resolve({ status: 200, data: '' } as AxiosResponse);
        });

      const result = await diagnosticsService.collectDiagnostics(testInstance);

      expect(result.threads.total).toBe(createThreadCount(0));
      expect(result.threads.runnable).toBe(createThreadCount(0));
      expect(result.threads.deadlocked).toBe(createThreadCount(0));
    });

    it('should handle repository index check failure as degraded', async () => {
      mockHttpClient.makeRequest
        .mockImplementation((_instance, path) => {
          if (path === '/oak:index') {
            return Promise.reject(new Error('Index check failed'));
          }
          return Promise.resolve({ status: 200, data: '' } as AxiosResponse);
        });

      const result = await diagnosticsService.collectDiagnostics(testInstance);

      expect(result.repository.indexHealth).toBe(REPOSITORY_HEALTH.DEGRADED);
    });

    it('should handle bundle collection with no data gracefully', async () => {
      mockHttpClient.makeRequest
        .mockImplementation((_instance, path) => {
          if (path === '/system/console/bundles.json') {
            return Promise.resolve({ status: 200, data: {} } as AxiosResponse);
          }
          return Promise.resolve({ status: 200, data: '' } as AxiosResponse);
        });

      const result = await diagnosticsService.collectDiagnostics(testInstance);

      expect(result.bundles.total).toBe(createBundleCount(0));
      expect(result.bundles.active).toBe(createBundleCount(0));
      expect(result.bundles.failed).toEqual([]);
    });

    it('should handle malformed HTML responses', async () => {
      const malformedHtml = 'This is not the expected format';

      mockHttpClient.makeRequest
        .mockResolvedValue({ status: 200, data: malformedHtml } as AxiosResponse);

      const result = await diagnosticsService.collectDiagnostics(testInstance);

      expect(result.memory.heapUsed).toBe(createByteSize(0));
      expect(result.threads.total).toBe(createThreadCount(0));
      expect(result.requests.averageResponseTime).toBe(createMilliseconds(0));
    });

    it('should use custom configuration when provided', () => {
      const customConfig = {
        timeout: createTimeout(10000),
        concurrentChecks: false
      };

      const customService = new DiagnosticsService(mockHttpClient, customConfig);
      expect(customService).toBeInstanceOf(DiagnosticsService);
    });

    it('should handle sequential execution when concurrentChecks is false', async () => {
      const customService = new DiagnosticsService(mockHttpClient, { concurrentChecks: false });
      
      mockHttpClient.makeRequest
        .mockResolvedValue({ status: 200, data: '' } as AxiosResponse);

      const result = await customService.collectDiagnostics(testInstance);

      expect(result).toHaveProperty('memory');
      expect(result).toHaveProperty('threads');
      expect(result).toHaveProperty('repository');
      expect(result).toHaveProperty('requests');
      expect(result).toHaveProperty('bundles');
    });

    it('should properly parse comma-separated numbers in memory usage', async () => {
      const memoryHtmlWithCommas = 'Heap Memory Usage 1,234,567 of 2,048,000 Non-Heap Memory Usage 500,000 of 1,000,000';

      mockHttpClient.makeRequest
        .mockImplementation((_instance, path) => {
          if (path === '/system/console/memoryusage') {
            return Promise.resolve({ status: 200, data: memoryHtmlWithCommas } as AxiosResponse);
          }
          return Promise.resolve({ status: 200, data: '' } as AxiosResponse);
        });

      const result = await diagnosticsService.collectDiagnostics(testInstance);

      expect(result.memory.heapUsed).toBe(createByteSize(1234567 * 1024));
      expect(result.memory.heapMax).toBe(createByteSize(2048000 * 1024));
      expect(result.memory.percentage).toBe(createPercentage(60));
    });

    it('should calculate zero percentage when heap max is zero', async () => {
      const memoryHtmlZeroMax = 'Heap Memory Usage 0 of 0 Non-Heap Memory Usage 0 of 0';

      mockHttpClient.makeRequest
        .mockImplementation((_instance, path) => {
          if (path === '/system/console/memoryusage') {
            return Promise.resolve({ status: 200, data: memoryHtmlZeroMax } as AxiosResponse);
          }
          return Promise.resolve({ status: 200, data: '' } as AxiosResponse);
        });

      const result = await diagnosticsService.collectDiagnostics(testInstance);

      expect(result.memory.percentage).toBe(createPercentage(0));
    });
  });
});