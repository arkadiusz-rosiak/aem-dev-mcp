import { handleHealthCheck } from '@/handlers/health-check.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { AEMInstance, HealthStatus, SystemDiagnostics } from '@/types.js';

jest.mock('@/services/alias-resolver.js');
jest.mock('@/services/parallel-executor.js');
jest.mock('@/services/http-client.js');
jest.mock('@/services/health-service.js');
jest.mock('@/services/diagnostics-service.js');
jest.mock('@/utils/logger.js');

describe('handleHealthCheck', () => {
  let mockResolver: jest.Mocked<AliasResolver>;
  let mockExecutor: jest.Mocked<ParallelExecutor>;
  let mockClient: jest.Mocked<AemHttpClient>;
  
  const testInstances: AEMInstance[] = [
    { url: 'http://author-prod:4502', username: 'admin', password: 'admin' },
    { url: 'http://publish-prod:4503', username: 'admin', password: 'admin' }
  ];

  const mockHealthStatus: HealthStatus = {
    instance: 'http://author-prod:4502',
    overall: 'healthy',
    timestamp: new Date(),
    checks: [
      {
        component: 'reachability',
        status: 'healthy',
        message: 'Instance reachable',
        responseTime: 150
      }
    ]
  };

  beforeEach(() => {
    mockResolver = new AliasResolver('') as jest.Mocked<AliasResolver>;
    mockExecutor = new ParallelExecutor() as jest.Mocked<ParallelExecutor>;
    mockClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    
    jest.clearAllMocks();
  });

  describe('basic health checks', () => {
    it('should handle instances parameter correctly', async () => {
      const args = { instances: ['author-prod', 'publish-prod'] };
      
      mockResolver.resolveMultipleAliases.mockResolvedValueOnce({
        resolved: true,
        instances: testInstances
      });

      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: testInstances[0].url,
          success: true,
          data: mockHealthStatus,
          duration: 150
        },
        {
          instanceUrl: testInstances[1].url,
          success: true,
          data: { ...mockHealthStatus, instance: testInstances[1].url },
          duration: 200
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      expect(mockResolver.resolveMultipleAliases).toHaveBeenCalledWith(['author-prod', 'publish-prod']);
      expect(mockExecutor.executeOnInstances).toHaveBeenCalledWith(
        testInstances,
        expect.any(Function),
        expect.objectContaining({
          timeout: 15000,
          maxConcurrency: 20
        })
      );

      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.total).toBe(2);
      expect(responseData.summary.healthy).toBe(2);
      expect(responseData.results).toHaveProperty(testInstances[0].url);
    });

    it('should handle direct instances parameter', async () => {
      const args = { directInstances: testInstances };

      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: testInstances[0].url,
          success: true,
          data: mockHealthStatus,
          duration: 150
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      expect(mockResolver.resolveMultipleAliases).not.toHaveBeenCalled();

      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.total).toBe(1);
    });

    it('should handle legacy aliases parameter', async () => {
      const args = { aliases: ['author-prod'] };
      
      mockResolver.resolveMultipleAliases.mockResolvedValueOnce({
        resolved: true,
        instances: [testInstances[0]],
      });

      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: testInstances[0].url,
          success: true,
          data: mockHealthStatus,
          duration: 150
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      expect(mockResolver.resolveMultipleAliases).toHaveBeenCalledWith(['author-prod']);
    });
  });

  describe('detailed diagnostics', () => {
    it('should include diagnostics when detailed=true', async () => {
      const args = { 
        instances: ['author-prod'], 
        detailed: true 
      };
      
      const mockDiagnostics: SystemDiagnostics = {
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

      const healthStatusWithDiagnostics: HealthStatus = {
        ...mockHealthStatus,
        diagnostics: mockDiagnostics
      };

      mockResolver.resolveMultipleAliases.mockResolvedValueOnce({
        resolved: true,
        instances: [testInstances[0]],
      });

      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: testInstances[0].url,
          success: true,
          data: healthStatusWithDiagnostics,
          duration: 300
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.metadata.detailed).toBe(true);
      expect(responseData.results[testInstances[0].url].diagnostics).toBeDefined();
      expect(responseData.results[testInstances[0].url].diagnostics.memory.percentage).toBe(50);
    });

    it('should not include diagnostics when detailed=false', async () => {
      const args = { 
        instances: ['author-prod'], 
        detailed: false 
      };
      
      mockResolver.resolveMultipleAliases.mockResolvedValueOnce({
        resolved: true,
        instances: [testInstances[0]],
      });

      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: testInstances[0].url,
          success: true,
          data: mockHealthStatus,
          duration: 150
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.metadata.detailed).toBe(false);
      expect(responseData.results[testInstances[0].url].diagnostics).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle alias resolution failure', async () => {
      const args = { instances: ['nonexistent-instance'] };
      
      mockResolver.resolveMultipleAliases.mockResolvedValueOnce({
        resolved: false,
        instances: [],
        error: 'Instance not found'
      });

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to resolve aliases');
    });

    it('should handle too many instances', async () => {
      const tooManyInstances = Array.from({ length: 25 }, (_, i) => ({
        url: `http://instance-${i}:4502`,
        username: 'admin',
        password: 'admin'
      }));

      const args = { directInstances: tooManyInstances };

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Maximum 20 instances supported');
    });

    it('should handle execution failures gracefully', async () => {
      const args = { instances: ['author-prod'] };
      
      mockResolver.resolveMultipleAliases.mockResolvedValueOnce({
        resolved: true,
        instances: [testInstances[0]],
      });

      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: testInstances[0].url,
          success: false,
          error: 'Connection timeout',
          duration: 15000
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.unhealthy).toBe(1);
      expect(responseData.results[testInstances[0].url].overall).toBe('unhealthy');
    });

    it('should validate input schema', async () => {
      const args = {}; // Missing required parameters

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
    });
  });

  describe('response format', () => {
    it('should include correct metadata', async () => {
      const args = { instances: ['author-prod'] };
      
      mockResolver.resolveMultipleAliases.mockResolvedValueOnce({
        resolved: true,
        instances: [testInstances[0]],
      });

      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: testInstances[0].url,
          success: true,
          data: mockHealthStatus,
          duration: 150
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.requestId).toBeDefined();
      expect(responseData.metadata.timestamp).toBeDefined();
      expect(responseData.metadata.totalInstances).toBe(1);
      expect(responseData.metadata.averageResponseTime).toBe(150);
      expect(responseData.summary).toEqual({
        total: 1,
        healthy: 1,
        unhealthy: 0,
        degraded: 0
      });
    });

    it('should calculate summary statistics correctly', async () => {
      const args = { instances: ['author-prod', 'publish-prod', 'broken-instance'] };
      
      mockResolver.resolveMultipleAliases.mockResolvedValueOnce({
        resolved: true,
        instances: testInstances.concat({ url: 'http://broken:4502', username: 'admin', password: 'admin' }),
      });

      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: testInstances[0].url,
          success: true,
          data: mockHealthStatus,
          duration: 150
        },
        {
          instanceUrl: testInstances[1].url,
          success: true,
          data: { ...mockHealthStatus, overall: 'degraded' as const },
          duration: 200
        },
        {
          instanceUrl: 'http://broken:4502',
          success: false,
          error: 'Connection refused',
          duration: 15000
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary).toEqual({
        total: 3,
        healthy: 1,
        unhealthy: 1,
        degraded: 1
      });
    });
  });
});