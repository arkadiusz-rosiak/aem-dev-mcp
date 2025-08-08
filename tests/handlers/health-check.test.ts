import { handleHealthCheck } from '@/handlers/health-check.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { 
  AEMInstance, 
  HealthStatus, 
  HEALTH_STATUS, 
  HEALTH_COMPONENTS,
  createByteSize,
  createPercentage,
  createThreadCount,
  createMilliseconds,
  createRequestCount,
  createRequestsPerSecond,
  createBundleCount,
  REPOSITORY_HEALTH
} from '@/types.js';

jest.mock('@/services/alias-resolver.js');
jest.mock('@/services/parallel-executor.js');
jest.mock('@/services/http-client.js');
jest.mock('@/services/health-service.js');
jest.mock('@/utils/logger.js');

describe('handleHealthCheck', () => {
  let mockResolver: jest.Mocked<AliasResolver>;
  let mockExecutor: jest.Mocked<ParallelExecutor>;
  let mockClient: jest.Mocked<AemHttpClient>;
  
  const testInstances: AEMInstance[] = [
    { url: 'http://author-prod:4502', username: 'admin', password: 'admin' },
    { url: 'http://publish-prod:4503', username: 'admin', password: 'admin' }
  ] as const;

  const mockMetrics = {
    memory: {
      heapUsed: createByteSize(1073741824),
      heapMax: createByteSize(2147483648),
      nonHeapUsed: createByteSize(536870912),
      nonHeapMax: createByteSize(1073741824),
      percentage: createPercentage(50)
    },
    threads: {
      total: createThreadCount(150),
      runnable: createThreadCount(50),
      blocked: createThreadCount(5),
      waiting: createThreadCount(40),
      timedWaiting: createThreadCount(30),
      deadlocked: createThreadCount(0)
    },
    repository: {
      size: createByteSize(0),
      nodeCount: 0,
      indexHealth: REPOSITORY_HEALTH.HEALTHY,
      revisions: 0
    },
    requests: {
      averageResponseTime: createMilliseconds(250),
      requestsPerSecond: createRequestsPerSecond(10),
      activeRequests: createRequestCount(5),
      queuedRequests: createRequestCount(2),
      errorRate: createPercentage(1)
    },
    bundles: {
      total: createBundleCount(100),
      active: createBundleCount(98),
      resolved: createBundleCount(2),
      installed: createBundleCount(0),
      failed: []
    }
  };

  const mockHealthStatus: HealthStatus = {
    instance: 'http://author-prod:4502',
    overall: HEALTH_STATUS.HEALTHY,
    timestamp: new Date(),
    checks: [
      {
        component: HEALTH_COMPONENTS.REACHABILITY,
        status: HEALTH_STATUS.HEALTHY,
        message: 'Instance reachable',
        responseTime: createMilliseconds(150)
      }
    ],
    metrics: mockMetrics
  };


  beforeEach(() => {
    mockResolver = new AliasResolver('') as jest.Mocked<AliasResolver>;
    mockExecutor = new ParallelExecutor() as jest.Mocked<ParallelExecutor>;
    mockClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    
    jest.clearAllMocks();
  });

  describe('basic health checks', () => {
    it('should handle instances parameter correctly', async () => {
      const args = { instances: testInstances };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://author-prod:4502',
          success: true,
          data: mockHealthStatus,
          duration: 200
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.total).toBe(1);
      expect(responseData.summary.healthy).toBe(1);
      expect(responseData.results).toHaveProperty('http://author-prod:4502');
    });

    it('should handle aliases parameter correctly', async () => {
      const args = { aliases: ['author-prod'] };
      
      mockResolver.resolveAlias.mockResolvedValueOnce({
        alias: 'author-prod',
        instances: [testInstances[0]],
        resolved: true
      });

      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://author-prod:4502',
          success: true,
          data: mockHealthStatus,
          duration: 200
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      expect(mockResolver.resolveAlias).toHaveBeenCalledWith('author-prod');
    });

    it('should always include metrics in response', async () => {
      const args = { instances: [testInstances[0]] };

      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://author-prod:4502',
          success: true,
          data: mockHealthStatus,
          duration: 200
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.results['http://author-prod:4502']).toHaveProperty('metrics');
      expect(responseData.results['http://author-prod:4502'].metrics).toHaveProperty('memory');
      expect(responseData.results['http://author-prod:4502'].metrics).toHaveProperty('threads');
      expect(responseData.results['http://author-prod:4502'].metrics).toHaveProperty('repository');
      expect(responseData.results['http://author-prod:4502'].metrics).toHaveProperty('requests');
      expect(responseData.results['http://author-prod:4502'].metrics).toHaveProperty('bundles');
    });

    it('should handle validation errors correctly', async () => {
      const invalidArgs = {}; // Missing both aliases and instances

      const result = await handleHealthCheck(invalidArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Health check failed');
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should handle executor failures gracefully', async () => {
      const args = { instances: [testInstances[0]] };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://author-prod:4502',
          success: false,
          error: 'Connection failed',
          duration: 5000
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.unhealthy).toBe(1);
      expect(responseData.results['http://author-prod:4502'].overall).toBe(HEALTH_STATUS.UNHEALTHY);
    });

    it('should respect maximum instance limit', async () => {
      const tooManyInstances = Array.from({ length: 25 }, (_, i) => ({
        url: `http://instance-${i}:4502`,
        username: 'admin',
        password: 'admin'
      }));

      const args = { instances: tooManyInstances };

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Maximum 20 instances supported');
    });

    it('should handle empty instances after resolution', async () => {
      const args = { aliases: ['nonexistent-alias'] };
      
      mockResolver.resolveAlias.mockResolvedValueOnce({
        alias: 'nonexistent-alias',
        instances: [],
        resolved: false,
        error: 'Alias not found'
      });

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No instances to check after resolution');
    });
  });
});