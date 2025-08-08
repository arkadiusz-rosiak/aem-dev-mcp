import { HealthService } from '@/services/health-service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { AEMInstance, ErrorType } from '@/types.js';
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
    };
    
    jest.clearAllMocks();
  });

  describe('performHealthCheck', () => {
    it('should return healthy status when all checks pass', async () => {
      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: {} } as AxiosResponse)
        .mockResolvedValueOnce({ 
          status: 200, 
          data: { s: [100, 100], data: [] } 
        } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse);

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.overall).toBe('healthy');
      expect(result.instance).toBe(testInstance.url);
      expect(result.checks).toHaveLength(5);
      expect(result.checks[0].component).toBe('reachability');
      expect(result.checks[1].component).toBe('bundles');
    });

    it('should return unhealthy status when reachability fails', async () => {
      mockHttpClient.makeRequest
        .mockRejectedValueOnce(new Error('Connection refused'));

      const result = await healthService.performHealthCheck(testInstance);

      expect(result.overall).toBe('unhealthy');
      expect(result.checks).toHaveLength(1);
      expect(result.checks[0].component).toBe('reachability');
      expect(result.checks[0].status).toBe('unhealthy');
    });

    it('should return degraded status for slow response', async () => {
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(0)      // Start time
        .mockReturnValueOnce(6000);  // End time (6 seconds later)
      
      mockHttpClient.makeRequest.mockResolvedValueOnce({ status: 200, data: {} } as AxiosResponse);

      const result = await healthService.checkInstanceReachability(testInstance);

      expect(result.status).toBe('degraded');
      expect(result.message).toContain('Slow response time');
    });

    it('should detect failed bundles', async () => {
      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: {} } as AxiosResponse)
        .mockResolvedValueOnce({ 
          status: 200, 
          data: { 
            s: [97, 100], 
            data: [
              { symbolicName: 'com.example.bundle1', state: 'Installed' },
              { symbolicName: 'com.example.bundle2', state: 'Resolved' },
              { symbolicName: 'com.example.bundle3', state: 'Active' }
            ] 
          } 
        } as AxiosResponse);

      const result = await healthService.performHealthCheck(testInstance);

      const bundleCheck = result.checks.find(c => c.component === 'bundles');
      expect(bundleCheck?.status).toBe('unhealthy');
      expect(bundleCheck?.message).toContain('2 bundles failed');
      expect(bundleCheck?.details?.failed).toEqual(['com.example.bundle1', 'com.example.bundle2']);
    });
  });

  describe('checkInstanceReachability', () => {
    it('should return healthy for 200 response', async () => {
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(0)    // Start time
        .mockReturnValueOnce(150); // End time
        
      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 200, 
        data: {} 
      } as AxiosResponse);

      const result = await healthService.checkInstanceReachability(testInstance);

      expect(result.component).toBe('reachability');
      expect(result.status).toBe('healthy');
      expect(result.responseTime).toBe(150);
    });

    it('should return unhealthy for 500 response', async () => {
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(200);
        
      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 500, 
        data: {} 
      } as AxiosResponse);

      const result = await healthService.checkInstanceReachability(testInstance);

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('HTTP 500');
    });

    it('should classify network errors correctly', async () => {
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(100);
        
      const networkError = { code: 'ECONNREFUSED' };
      mockHttpClient.makeRequest.mockRejectedValueOnce(networkError);

      const result = await healthService.checkInstanceReachability(testInstance);

      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain(ErrorType.NETWORK_ERROR);
    });
  });

  describe('checkOSGiBundles', () => {
    it('should return healthy when all bundles are active', async () => {
      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 200, 
        data: { s: [100, 100], data: [] } 
      } as AxiosResponse);

      const result = await healthService.checkOSGiBundles(testInstance);

      expect(result.status).toBe('healthy');
      expect(result.message).toBe('All 100 bundles active');
    });

    it('should return unhealthy for authentication failure', async () => {
      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 401, 
        data: {} 
      } as AxiosResponse);

      const result = await healthService.checkOSGiBundles(testInstance);

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('Authentication required for bundle console');
    });
  });

  describe('checkLoginPage', () => {
    it('should return healthy for accessible login page', async () => {
      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 200, 
        data: '<html></html>' 
      } as AxiosResponse);

      const result = await healthService.checkLoginPage(testInstance);

      expect(result.status).toBe('healthy');
      expect(result.message).toBe('Login page accessible');
    });
  });

  describe('checkRepository', () => {
    it('should return healthy for auth-protected repository', async () => {
      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 401, 
        data: {} 
      } as AxiosResponse);

      const result = await healthService.checkRepository(testInstance);

      expect(result.status).toBe('healthy');
      expect(result.message).toBe('Repository requires authentication (normal)');
    });
  });

  describe('checkSystemConsole', () => {
    it('should return degraded for auth-required console', async () => {
      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 403, 
        data: {} 
      } as AxiosResponse);

      const result = await healthService.checkSystemConsole(testInstance);

      expect(result.status).toBe('degraded');
      expect(result.message).toBe('Console authentication required');
    });
  });

  describe('aggregateResults', () => {
    it('should return unhealthy if any check is unhealthy', async () => {
      const checks = [
        { component: 'test1', status: 'healthy' as const },
        { component: 'test2', status: 'unhealthy' as const },
        { component: 'test3', status: 'healthy' as const }
      ];

      const result = healthService.aggregateResults(testInstance, checks);

      expect(result.overall).toBe('unhealthy');
    });

    it('should return degraded if no unhealthy but has degraded', async () => {
      const checks = [
        { component: 'test1', status: 'healthy' as const },
        { component: 'test2', status: 'degraded' as const },
        { component: 'test3', status: 'healthy' as const }
      ];

      const result = healthService.aggregateResults(testInstance, checks);

      expect(result.overall).toBe('degraded');
    });

    it('should return healthy if all checks are healthy', async () => {
      const checks = [
        { component: 'test1', status: 'healthy' as const },
        { component: 'test2', status: 'healthy' as const }
      ];

      const result = healthService.aggregateResults(testInstance, checks);

      expect(result.overall).toBe('healthy');
    });
  });
});