import { handleHealthCheck } from '@/handlers/health-check.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { 
  AEMInstance, 
  HealthStatus, 
  HEALTH_STATUS, 
  HEALTH_COMPONENTS
} from '@/types/index.js';
import {
  createByteSize,
  createPercentage,
  createThreadCount,
  createMilliseconds,
  createBundleCount
} from '@/utils/type-factories.js';

jest.mock('@/services/alias-resolver.js');
jest.mock('@/services/parallel-executor.js');
jest.mock('@/services/http-client.js');
jest.mock('@/services/health-service.js');
jest.mock('@/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('handleHealthCheck', () => {
  let mockResolver: jest.Mocked<AliasResolver>;
  let mockExecutor: jest.Mocked<ParallelExecutor>;
  let mockClient: jest.Mocked<AemHttpClient>;
  
  const testInstances: AEMInstance[] = [
    { url: 'http://test-author.example.com:4502', username: 'testuser', password: 'testpass' },
    { url: 'http://test-publish.example.com:4503', username: 'testuser', password: 'testpass' }
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
      size: createByteSize(1073741824),
      nodes: 50000,
      errors: 0,
      properties: 150000
    },
    bundles: {
      total: createBundleCount(100),
      active: createBundleCount(95),
      resolved: createBundleCount(2),
      installed: createBundleCount(1),
      fragments: createBundleCount(2)
    }
  };

  const mockHealthStatus: HealthStatus = {
    instance: 'http://test-author.example.com:4502',
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
          instanceUrl: 'http://test-author.example.com:4502',
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
      expect(Object.keys(responseData.results)).toContain('http://test-author.example.com:4502');
    });

    it('should handle aliases parameter correctly', async () => {
      const args = { aliases: ['test-author'] };
      
      mockResolver.resolveAlias.mockResolvedValueOnce({
        alias: 'test-author',
        instances: [testInstances[0]],
        resolved: true
      });

      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockHealthStatus,
          duration: 200
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      expect(mockResolver.resolveAlias).toHaveBeenCalledWith('test-author');
    });

    it('should always include metrics in response', async () => {
      const args = { instances: [testInstances[0]] };

      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockHealthStatus,
          duration: 200
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.results['http://test-author.example.com:4502']).toHaveProperty('metrics');
      expect(responseData.results['http://test-author.example.com:4502'].metrics).toHaveProperty('memory');
      expect(responseData.results['http://test-author.example.com:4502'].metrics).toHaveProperty('threads');
      expect(responseData.results['http://test-author.example.com:4502'].metrics).toHaveProperty('repository');
      expect(responseData.results['http://test-author.example.com:4502'].metrics).toHaveProperty('bundles');
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
          instanceUrl: 'http://test-author.example.com:4502',
          success: false,
          error: 'Connection failed',
          duration: 5000
        }
      ]);

      const result = await handleHealthCheck(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.unhealthy).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].overall).toBe(HEALTH_STATUS.UNHEALTHY);
    });

    it('should respect maximum instance limit', async () => {
      const tooManyInstances = Array.from({ length: 25 }, (_, i) => ({
        url: `http://instance-${i}:4502`,
        username: 'testuser',
        password: 'testpass'
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