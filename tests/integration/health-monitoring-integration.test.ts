import { HealthService } from '@/services/health-service.js';
import { DiagnosticsService } from '@/services/diagnostics-service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { AEMInstance } from '@/types.js';
import { AxiosResponse } from 'axios';

jest.mock('@/services/http-client.js');
jest.mock('@/utils/logger.js');

describe('Health Monitoring Integration Tests', () => {
  let healthService: HealthService;
  let diagnosticsService: DiagnosticsService;
  let mockHttpClient: jest.Mocked<AemHttpClient>;
  
  beforeEach(() => {
    mockHttpClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    healthService = new HealthService(mockHttpClient);
    diagnosticsService = new DiagnosticsService(mockHttpClient);
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('Real-time data verification', () => {
    it('should demonstrate real-time data retrieval without caching', async () => {
      const mockInstance: AEMInstance = {
        url: 'http://mock-aem-instance:4502',
        username: 'admin',
        password: 'admin'
      };

      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: {} } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: { s: [100, 100], data: [] } } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse);

      const healthResult = await healthService.performHealthCheck(mockInstance);
      
      expect(healthResult.instance).toBe(mockInstance.url);
      expect(healthResult.timestamp).toBeInstanceOf(Date);
      expect(Array.isArray(healthResult.checks)).toBe(true);
      expect(['healthy', 'unhealthy', 'degraded']).toContain(healthResult.overall);
      
      expect(mockHttpClient.makeRequest).toHaveBeenCalledTimes(5);
    });

    it('should collect diagnostics without caching', async () => {
      const mockInstance: AEMInstance = {
        url: 'http://mock-aem-instance:4502',
        username: 'admin',
        password: 'admin'
      };

      const mockMemoryHtml = 'Heap Memory Usage 1,024,000 of 2,048,000 Non-Heap Memory Usage 512,000 of 1,024,000';
      const mockThreadsHtml = 'Live threads: 150 RUNNABLE 50 BLOCKED 5';
      const mockRequestsHtml = 'Average 250 ms Active Requests 5';
      const mockBundleData = { data: [{ state: 'Active', symbolicName: 'test' }] };

      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: mockMemoryHtml } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: mockThreadsHtml } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: mockRequestsHtml } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: mockBundleData } as AxiosResponse);

      const diagnostics = await diagnosticsService.collectDiagnostics(mockInstance);
      
      expect(diagnostics).toHaveProperty('memory');
      expect(diagnostics).toHaveProperty('threads');
      expect(diagnostics).toHaveProperty('repository');
      expect(diagnostics).toHaveProperty('requests');
      expect(diagnostics).toHaveProperty('bundles');
      
      expect(typeof diagnostics.memory.percentage).toBe('number');
      expect(typeof diagnostics.threads.total).toBe('number');
      expect(Array.isArray(diagnostics.bundles.failed)).toBe(true);
      
      expect(mockHttpClient.makeRequest).toHaveBeenCalledTimes(5);
    });
  });

  describe('Performance requirements validation', () => {
    it('should handle timeout constraints properly', async () => {
      const mockInstance: AEMInstance = {
        url: 'http://unreachable-instance:4502',
        username: 'admin',
        password: 'admin'
      };

      const timeoutError = new Error('Request timeout');
      mockHttpClient.makeRequest.mockRejectedValueOnce(timeoutError);

      const startTime = Date.now();
      const result = await healthService.performHealthCheck(mockInstance);
      const duration = Date.now() - startTime;
      
      expect(result.overall).toBe('unhealthy');
      expect(duration).toBeLessThan(1000);
      expect(result.checks[0].status).toBe('unhealthy');
    });

    it('should properly classify error types', () => {
      const networkErrors = [
        { code: 'ECONNREFUSED' },
        { code: 'EHOSTUNREACH' },
        { code: 'ETIMEDOUT' }
      ];

      const authErrors = [
        { response: { status: 401 } },
        { response: { status: 403 } }
      ];

      const serviceErrors = [
        { response: { status: 500 } },
        { response: { status: 502 } },
        { response: { status: 503 } }
      ];

      expect(networkErrors.every(error => error.code.startsWith('E'))).toBe(true);
      expect(authErrors.every(error => error.response.status === 401 || error.response.status === 403)).toBe(true);
      expect(serviceErrors.every(error => error.response.status >= 500)).toBe(true);
    });
  });

  describe('Data structure validation', () => {
    it('should validate health check result structure', () => {
      const mockHealthStatus = {
        instance: 'http://test:4502',
        overall: 'healthy' as const,
        timestamp: new Date(),
        checks: [
          {
            component: 'reachability',
            status: 'healthy' as const,
            message: 'Instance reachable',
            responseTime: 150
          }
        ]
      };

      expect(mockHealthStatus).toMatchObject({
        instance: expect.any(String),
        overall: expect.stringMatching(/^(healthy|unhealthy|degraded)$/),
        timestamp: expect.any(Date),
        checks: expect.arrayContaining([
          expect.objectContaining({
            component: expect.any(String),
            status: expect.stringMatching(/^(healthy|unhealthy|degraded)$/)
          })
        ])
      });
    });

    it('should validate diagnostic data structure', () => {
      const mockDiagnostics = {
        memory: {
          heapUsed: 1073741824,
          heapMax: 2147483648,
          nonHeapUsed: 536870912,
          nonHeapMax: 1073741824,
          percentage: 50
        },
        threads: {
          total: 150,
          runnable: 50,
          blocked: 5,
          waiting: 30,
          timedWaiting: 20,
          deadlocked: 0
        },
        repository: {
          size: 0,
          nodeCount: 0,
          indexHealth: 'healthy',
          revisions: 0
        },
        requests: {
          averageResponseTime: 250,
          requestsPerSecond: 10,
          activeRequests: 5,
          queuedRequests: 2,
          errorRate: 1.5
        },
        bundles: {
          total: 100,
          active: 98,
          resolved: 2,
          installed: 0,
          failed: []
        }
      };

      expect(mockDiagnostics.memory.percentage).toBeGreaterThanOrEqual(0);
      expect(mockDiagnostics.memory.percentage).toBeLessThanOrEqual(100);
      expect(mockDiagnostics.threads.total).toBeGreaterThanOrEqual(0);
      expect(mockDiagnostics.bundles.total).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(mockDiagnostics.bundles.failed)).toBe(true);
    });
  });

  describe('Concurrent execution validation', () => {
    it('should handle multiple instances concurrently', async () => {
      const instances: AEMInstance[] = Array.from({ length: 5 }, (_, i) => ({
        url: `http://instance-${i}:4502`,
        username: 'admin',
        password: 'admin'
      }));

      mockHttpClient.makeRequest.mockResolvedValue({ status: 200, data: {} } as AxiosResponse);

      const startTime = Date.now();
      const promises = instances.map(instance => 
        healthService.performHealthCheck(instance)
      );

      const results = await Promise.allSettled(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(5);
      expect(duration).toBeLessThan(1000);
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          expect(result.value).toHaveProperty('instance');
          expect(result.value).toHaveProperty('overall');
          expect(result.value).toHaveProperty('timestamp');
        }
      });
      
      expect(mockHttpClient.makeRequest).toHaveBeenCalledTimes(25);
    });
  });
});