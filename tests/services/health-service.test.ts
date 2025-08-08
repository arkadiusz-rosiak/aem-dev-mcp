import { HealthService } from '@/services/health-service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { 
  AEMInstance, 
  ERROR_TYPES, 
  HEALTH_STATUS, 
  HEALTH_COMPONENTS,
  createTimeout,
  createMilliseconds
} from '@/types.js';
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
      url: 'http://localhost:4502',
      username: 'admin',
      password: 'admin'
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
        { status: 200, data: {} },
        { status: 200, data: { s: [100, 100], data: [] } },
        { status: 200, data: '' },
        { status: 200, data: '' },
        { status: 200, data: '' }
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
    });

    it('should return degraded status when response is slow', async () => {
      mockHttpClient.makeRequest
        .mockImplementation(() => {
          jest.advanceTimersByTime(6000); // Slow response > 5000ms
          return Promise.resolve({ status: 200, data: {} } as AxiosResponse);
        });

      const resultPromise = healthService.performHealthCheck(testInstance);
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.overall).toBe(HEALTH_STATUS.DEGRADED);
      expect(result.checks[0].status).toBe(HEALTH_STATUS.DEGRADED);
      expect(result.checks[0].message).toBe('Slow response time');
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
    });

    it('should stop checking after reachability fails', async () => {
      mockHttpClient.makeRequest
        .mockRejectedValueOnce(new Error('Connection refused'));

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.overall).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks).toHaveLength(1);
      expect(mockHttpClient.makeRequest).toHaveBeenCalledTimes(1);
    });

    it('should handle bundle check with failed bundles', async () => {
      const bundleResponse = {
        status: 200,
        data: {
          s: [90, 100],
          data: [
            { state: 'Active', symbolicName: 'bundle1' },
            { state: 'Installed', symbolicName: 'failed-bundle' },
            { state: 'Resolved', symbolicName: 'another-failed-bundle' }
          ]
        }
      };

      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: {} } as AxiosResponse)
        .mockResolvedValueOnce(bundleResponse as AxiosResponse);

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.overall).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks[1].status).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.checks[1].message).toBe('2 bundles failed');
      expect(result.checks[1].details).toEqual({
        total: 100,
        active: 90,
        failed: ['failed-bundle', 'another-failed-bundle']
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

    it('should handle console check authentication as degraded', async () => {
      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: {} } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: { s: [100, 100], data: [] } } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 403, data: '' } as AxiosResponse);

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.checks[4].component).toBe(HEALTH_COMPONENTS.CONSOLE);
      expect(result.checks[4].status).toBe(HEALTH_STATUS.DEGRADED);
      expect(result.checks[4].message).toBe('Console authentication required');
    });

    it('should aggregate status correctly with mixed results', async () => {
      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: {} } as AxiosResponse) // healthy
        .mockResolvedValueOnce({ status: 200, data: { s: [100, 100], data: [] } } as AxiosResponse) // healthy
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse) // healthy
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse) // healthy
        .mockResolvedValueOnce({ status: 403, data: '' } as AxiosResponse); // degraded

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.overall).toBe(HEALTH_STATUS.DEGRADED);
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