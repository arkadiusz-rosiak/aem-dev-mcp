import { HealthService } from '@/services/health-service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { 
  AEMInstance, 
  ERROR_TYPES, 
  HEALTH_STATUS, 
  HEALTH_COMPONENTS
} from '@/types/index.js';
import {
  createTimeout,
  createMilliseconds
} from '@/utils/type-factories.js';
import { AxiosResponse } from 'axios';

jest.mock('@/services/http-client.js');
jest.mock('@/utils/logger.js');

describe('HealthService', () => {
  let healthService: HealthService;
  let mockHttpClient: jest.Mocked<AemHttpClient>;
  let testInstance: AEMInstance;

  beforeEach(() => {
    mockHttpClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    healthService = new HealthService(mockHttpClient);
    testInstance = {
      url: 'http://test.example.com:4502',
      username: 'testuser',
      password: 'testpass'
    } as const;
    
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('performHealthCheck', () => {
    it('should return healthy status when all checks pass quickly', async () => {
      let callCount = 0;
      const mockResponses = [
        // Reachability check
        { status: 200, data: {} },
        // Bundle check 
        { status: 200, data: { s: [100, 100], data: [] } },
        // Login check
        { status: 200, data: '' },
        // Repository check
        { status: 200, data: '' },
        // Console check
        { status: 200, data: '' },
        // Memory metrics
        { status: 200, data: "var __overall__ = {'Overall Heap Memory Usage':'init = 268435456(262144K) used = 1073741824(1048576K) committed = 2147483648(2097152K) max = 4294967296(4194304K)','Overall Non-Heap Memory Usage':'init = 7667712(7488K) used = 134217728(131072K) committed = 268435456(262144K) max = -1(-1K)',};" },
        // Thread metrics
        { status: 200, data: '<pre>Status:&nbsp;150&nbsp;threads&nbsp;(150&nbsp;alive/50&nbsp;daemon/0&nbsp;interrupted)&nbsp;in&nbsp;5&nbsp;groups&nbsp;(0&nbsp;destroyed).</pre>' },
        // Repository metrics  
        { status: 200, data: '<div class="results"><p>Traversed 100000 nodes, 500000 properties in 1000 ms</p><p>1073741824 bytes</p><p>Traversed 100000 nodes, 0 errors found</p></div>' },
        // Bundle metrics
        { status: 200, data: { s: [100, 100], data: [] } }
      ];

      mockHttpClient.makeRequest
        .mockImplementation(() => {
          jest.advanceTimersByTime(100);
          return Promise.resolve(mockResponses[callCount++] as AxiosResponse);
        });

      const resultPromise = healthService.performHealthCheck(testInstance);
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.overall).toBe(HEALTH_STATUS.HEALTHY);
      expect(result.instance).toBe(testInstance.url);
      expect(result.checks).toHaveLength(5);
      expect(result.checks[0].component).toBe(HEALTH_COMPONENTS.REACHABILITY);
      expect(result.checks[1].component).toBe(HEALTH_COMPONENTS.BUNDLES);
      expect(result.checks[0].status).toBe(HEALTH_STATUS.HEALTHY);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.memory).toBeDefined();
      expect(result.metrics.threads).toBeDefined();
      expect(result.metrics.repository).toBeDefined();
      expect(result.metrics.bundles).toBeDefined();
    });

    it('should return unhealthy status when response is slow', async () => {
      mockHttpClient.makeRequest
        .mockImplementation(() => {
          jest.advanceTimersByTime(6000); // Slow response > 5000ms
          return Promise.resolve({ status: 200, data: {} } as AxiosResponse);
        });

      const resultPromise = healthService.performHealthCheck(testInstance);
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.overall).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks[0].status).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks[0].message).toBe('Slow response time');
      expect(result.metrics).toBeDefined();
    });

    it('should return unhealthy status when reachability fails', async () => {
      const networkError = { code: 'ECONNREFUSED' };
      mockHttpClient.makeRequest
        .mockRejectedValueOnce(networkError);

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.overall).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks).toHaveLength(1);
      expect(result.checks[0].component).toBe(HEALTH_COMPONENTS.REACHABILITY);
      expect(result.checks[0].status).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks[0].message).toContain(ERROR_TYPES.NETWORK_ERROR);
      expect(result.metrics).toBeDefined();
    });

    it('should stop checking after reachability fails', async () => {
      mockHttpClient.makeRequest
        .mockRejectedValueOnce(new Error('Connection refused'));

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.overall).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks).toHaveLength(1);
      expect(mockHttpClient.makeRequest).toHaveBeenCalledWith(
        testInstance, '/', 'GET', undefined, expect.any(Number)
      );
    });

    it('should handle bundle check with failed bundles', async () => {
      const bundleResponse = {
        status: 200,
        data: {
          s: [90, 100],
          data: [
            { state: 'Active', symbolicName: 'bundle1' },
            { state: 'Installed', symbolicName: 'failed-bundle' },
            { state: 'Resolved', symbolicName: 'another-failed-bundle' },
            { state: 'Fragment', symbolicName: 'fragment-bundle' }
          ]
        }
      };

      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: {} } as AxiosResponse)
        .mockResolvedValueOnce(bundleResponse as AxiosResponse);

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.overall).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks[1].status).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks[1].message).toBe('2 bundles not active (1 resolved, 1 installed)');
      expect(result.checks[1].details).toEqual({
        total: 100,
        active: 90,
        resolved: ['another-failed-bundle'],
        installed: ['failed-bundle'],
        fragments: 1
      });
    });

    it('should handle authentication errors correctly', async () => {
      const authError = { 
        response: { status: 401 } 
      };

      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: {} } as AxiosResponse)
        .mockRejectedValueOnce(authError);

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.overall).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks[1].message).toContain(ERROR_TYPES.AUTH_ERROR);
    });

    it('should handle service errors correctly', async () => {
      const serviceError = { 
        response: { status: 500 } 
      };

      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: {} } as AxiosResponse)
        .mockRejectedValueOnce(serviceError);

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.overall).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks[1].message).toContain(ERROR_TYPES.SERVICE_ERROR);
    });

    it('should handle repository check with authentication as healthy', async () => {
      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: {} } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: { s: [100, 100], data: [] } } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 401, data: '' } as AxiosResponse);

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.checks[3].component).toBe(HEALTH_COMPONENTS.REPOSITORY);
      expect(result.checks[3].status).toBe(HEALTH_STATUS.HEALTHY);
      expect(result.checks[3].message).toBe('Repository requires authentication (normal)');
    });

    it('should handle console check authentication as unhealthy', async () => {
      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: {} } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: { s: [100, 100], data: [] } } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 403, data: '' } as AxiosResponse);

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.checks[4].component).toBe(HEALTH_COMPONENTS.CONSOLE);
      expect(result.checks[4].status).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks[4].message).toBe('Console authentication required');
    });

    it('should aggregate status correctly with mixed results', async () => {
      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: {} } as AxiosResponse) // healthy
        .mockResolvedValueOnce({ status: 200, data: { s: [100, 100], data: [] } } as AxiosResponse) // healthy
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse) // healthy
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse) // healthy
        .mockResolvedValueOnce({ status: 403, data: '' } as AxiosResponse); // unhealthy

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.overall).toBe(HEALTH_STATUS.UNHEALTHY);
    });

    it('should use custom configuration when provided', () => {
      const customConfig = {
        timeout: createTimeout(10000),
        slowResponseThreshold: createMilliseconds(3000)
      };

      const customHealthService = new HealthService(mockHttpClient, customConfig);
      expect(customHealthService).toBeInstanceOf(HealthService);
    });

    it('should handle unexpected errors gracefully', async () => {
      const weirdError = { someUnexpectedProperty: 'value' };
      
      mockHttpClient.makeRequest
        .mockRejectedValueOnce(weirdError);

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.overall).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks).toHaveLength(1);
      expect(result.checks[0].status).toBe(HEALTH_STATUS.UNHEALTHY);
    });
  });
});