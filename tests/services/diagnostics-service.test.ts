import { DiagnosticsService } from '@/services/diagnostics-service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { AEMInstance } from '@/types.js';
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
    };
    
    jest.clearAllMocks();
  });

  describe('collectDiagnostics', () => {
    it('should collect all diagnostic data successfully', async () => {
      const mockMemoryHtml = 'Heap Memory Usage 512,000 of 1,024,000 Non-Heap Memory Usage 256,000 of 512,000';
      const mockThreadsHtml = 'Live threads: 150 RUNNABLE 50 BLOCKED 10 WAITING 40 TIMED_WAITING 30 Deadlocked threads: 0';
      const mockRequestsHtml = 'Average 250.5 ms Active Requests 5 Queued Requests 2 Error Rate 1.2%';
      const mockBundleData = {
        data: [
          { state: 'Active', symbolicName: 'bundle1' },
          { state: 'Active', symbolicName: 'bundle2' },
          { state: 'Resolved', symbolicName: 'bundle3' }
        ]
      };

      mockHttpClient.makeRequest
        .mockResolvedValueOnce({ status: 200, data: mockMemoryHtml } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: mockThreadsHtml } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: mockRequestsHtml } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: mockBundleData } as AxiosResponse);

      const result = await diagnosticsService.collectDiagnostics(testInstance);

      expect(result.memory.heapUsed).toBeGreaterThan(0);
      expect(result.memory.percentage).toBeGreaterThan(0);
      expect(result.threads.total).toBe(150);
      expect(result.requests.averageResponseTime).toBe(250.5);
      expect(result.bundles.total).toBe(3);
      expect(result.bundles.active).toBe(2);
      expect(result.bundles.failed).toEqual(['bundle3']);
    });

    it('should handle partial failures gracefully', async () => {
      mockHttpClient.makeRequest
        .mockRejectedValueOnce(new Error('Memory endpoint failed'))
        .mockResolvedValueOnce({ status: 200, data: 'Live threads: 100' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: '' } as AxiosResponse)
        .mockResolvedValueOnce({ status: 200, data: { data: [] } } as AxiosResponse);

      const result = await diagnosticsService.collectDiagnostics(testInstance);

      expect(result.memory.heapUsed).toBe(0);
      expect(result.threads.total).toBe(100);
      expect(result.bundles.total).toBe(0);
    });
  });

  describe('getMemoryInfo', () => {
    it('should parse memory usage correctly', async () => {
      const mockHtml = `
        <html>
          <body>
            <h2>Memory Usage</h2>
            <p>Heap Memory Usage: 1,048,576 of 2,097,152 KB</p>
            <p>Non-Heap Memory Usage: 524,288 of 1,048,576 KB</p>
          </body>
        </html>
      `;

      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 200, 
        data: mockHtml 
      } as AxiosResponse);

      const result = await diagnosticsService.getMemoryInfo(testInstance);

      expect(result.heapUsed).toBe(1073741824);
      expect(result.heapMax).toBe(2147483648);
      expect(result.nonHeapUsed).toBe(536870912);
      expect(result.nonHeapMax).toBe(1073741824);
      expect(result.percentage).toBe(50);
    });

    it('should handle malformed memory data', async () => {
      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 200, 
        data: '<html>Invalid memory data</html>' 
      } as AxiosResponse);

      const result = await diagnosticsService.getMemoryInfo(testInstance);

      expect(result.heapUsed).toBe(0);
      expect(result.heapMax).toBe(0);
      expect(result.percentage).toBe(0);
    });

    it('should throw error for non-200 response', async () => {
      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 500, 
        data: 'Server Error' 
      } as AxiosResponse);

      await expect(diagnosticsService.getMemoryInfo(testInstance)).rejects.toThrow();
    });
  });

  describe('getThreadInfo', () => {
    it('should parse thread information correctly', async () => {
      const mockHtml = `
        <html>
          <body>
            <p>Live threads: 200</p>
            <p>RUNNABLE: 80</p>
            <p>BLOCKED: 5</p>
            <p>WAITING: 60</p>
            <p>TIMED_WAITING: 45</p>
            <p>Deadlocked threads: 2</p>
          </body>
        </html>
      `;

      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 200, 
        data: mockHtml 
      } as AxiosResponse);

      const result = await diagnosticsService.getThreadInfo(testInstance);

      expect(result.total).toBe(200);
      expect(result.runnable).toBe(80);
      expect(result.blocked).toBe(5);
      expect(result.waiting).toBe(60);
      expect(result.timedWaiting).toBe(45);
      expect(result.deadlocked).toBe(2);
    });
  });

  describe('getRepositoryInfo', () => {
    it('should return healthy index status for accessible oak index', async () => {
      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 200, 
        data: {} 
      } as AxiosResponse);

      const result = await diagnosticsService.getRepositoryInfo(testInstance);

      expect(result.indexHealth).toBe('healthy');
      expect(result.size).toBe(0);
      expect(result.nodeCount).toBe(0);
      expect(result.revisions).toBe(0);
    });

    it('should return degraded status for inaccessible index', async () => {
      mockHttpClient.makeRequest.mockRejectedValueOnce(new Error('Index not accessible'));

      const result = await diagnosticsService.getRepositoryInfo(testInstance);

      expect(result.indexHealth).toBe('degraded');
    });
  });

  describe('getRequestInfo', () => {
    it('should parse request statistics correctly', async () => {
      const mockHtml = `
        <html>
          <body>
            <p>Average Response Time: 125.75 ms</p>
            <p>Active Requests: 8</p>
            <p>Queued Requests: 3</p>
            <p>Error Rate: 2.5%</p>
          </body>
        </html>
      `;

      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 200, 
        data: mockHtml 
      } as AxiosResponse);

      const result = await diagnosticsService.getRequestInfo(testInstance);

      expect(result.averageResponseTime).toBe(125.75);
      expect(result.activeRequests).toBe(8);
      expect(result.queuedRequests).toBe(3);
      expect(result.errorRate).toBe(2.5);
      expect(result.requestsPerSecond).toBe(0);
    });
  });

  describe('getBundleInfo', () => {
    it('should analyze bundle states correctly', async () => {
      const mockBundleData = {
        data: [
          { state: 'Active', symbolicName: 'com.day.cq.cq-authoring' },
          { state: 'Active', symbolicName: 'com.day.cq.cq-personalization' },
          { state: 'Resolved', symbolicName: 'com.example.test-bundle' },
          { state: 'Installed', symbolicName: 'com.example.failed-bundle' },
          { state: 'Active', symbolicName: 'org.apache.sling.api' }
        ]
      };

      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 200, 
        data: mockBundleData 
      } as AxiosResponse);

      const result = await diagnosticsService.getBundleInfo(testInstance);

      expect(result.total).toBe(5);
      expect(result.active).toBe(3);
      expect(result.resolved).toBe(1);
      expect(result.installed).toBe(1);
      expect(result.failed).toEqual(['com.example.test-bundle', 'com.example.failed-bundle']);
    });

    it('should handle empty bundle response', async () => {
      mockHttpClient.makeRequest.mockResolvedValueOnce({ 
        status: 200, 
        data: { data: [] } 
      } as AxiosResponse);

      const result = await diagnosticsService.getBundleInfo(testInstance);

      expect(result.total).toBe(0);
      expect(result.active).toBe(0);
      expect(result.failed).toEqual([]);
    });
  });
});