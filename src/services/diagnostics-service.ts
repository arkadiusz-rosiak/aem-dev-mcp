import { 
  AEMInstance, 
  SystemDiagnostics, 
  MemoryDiagnostics, 
  ThreadDiagnostics, 
  RepositoryDiagnostics, 
  RequestDiagnostics, 
  BundleDiagnostics 
} from '@/types.js';
import { AemHttpClient } from '@/services/http-client.js';
import { Logger } from '@/utils/logger.js';

export class DiagnosticsService {
  private httpClient: AemHttpClient;
  private logger: Logger;
  
  constructor(httpClient: AemHttpClient) {
    this.httpClient = httpClient;
    this.logger = new Logger();
  }
  
  async collectDiagnostics(instance: AEMInstance): Promise<SystemDiagnostics> {
    const [memory, threads, repository, requests, bundles] = await Promise.allSettled([
      this.getMemoryInfo(instance),
      this.getThreadInfo(instance),
      this.getRepositoryInfo(instance),
      this.getRequestInfo(instance),
      this.getBundleInfo(instance)
    ]);
    
    return {
      memory: memory.status === 'fulfilled' ? memory.value : this.getDefaultMemoryDiagnostics(),
      threads: threads.status === 'fulfilled' ? threads.value : this.getDefaultThreadDiagnostics(),
      repository: repository.status === 'fulfilled' ? repository.value : this.getDefaultRepositoryDiagnostics(),
      requests: requests.status === 'fulfilled' ? requests.value : this.getDefaultRequestDiagnostics(),
      bundles: bundles.status === 'fulfilled' ? bundles.value : this.getDefaultBundleDiagnostics()
    };
  }
  
  async getMemoryInfo(instance: AEMInstance): Promise<MemoryDiagnostics> {
    try {
      const response = await this.httpClient.makeRequest(
        instance,
        '/system/console/memoryusage',
        'GET',
        undefined,
        15000
      );
      
      if (response.status === 200) {
        const html = response.data as string;
        
        const heapMatch = html.match(/Heap Memory Usage.*?(\d+(?:,\d+)*)\s*of\s*(\d+(?:,\d+)*)/s);
        const nonHeapMatch = html.match(/Non-Heap Memory Usage.*?(\d+(?:,\d+)*)\s*of\s*(\d+(?:,\d+)*)/s);
        
        const heapUsed = heapMatch ? parseInt(heapMatch[1].replace(/,/g, '')) * 1024 : 0;
        const heapMax = heapMatch ? parseInt(heapMatch[2].replace(/,/g, '')) * 1024 : 0;
        const nonHeapUsed = nonHeapMatch ? parseInt(nonHeapMatch[1].replace(/,/g, '')) * 1024 : 0;
        const nonHeapMax = nonHeapMatch ? parseInt(nonHeapMatch[2].replace(/,/g, '')) * 1024 : 0;
        
        return {
          heapUsed,
          heapMax,
          nonHeapUsed,
          nonHeapMax,
          percentage: heapMax > 0 ? Math.round((heapUsed / heapMax) * 100) : 0
        };
      }
      
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      this.logger.error(`Failed to get memory info for ${instance.url}`, { error });
      throw error;
    }
  }
  
  async getThreadInfo(instance: AEMInstance): Promise<ThreadDiagnostics> {
    try {
      const response = await this.httpClient.makeRequest(
        instance,
        '/system/console/threads',
        'GET',
        undefined,
        15000
      );
      
      if (response.status === 200) {
        const html = response.data as string;
        
        const totalMatch = html.match(/Live threads:\s*(\d+)/);
        const runnableMatch = html.match(/RUNNABLE.*?(\d+)/);
        const blockedMatch = html.match(/BLOCKED.*?(\d+)/);
        const waitingMatch = html.match(/WAITING.*?(\d+)/);
        const timedWaitingMatch = html.match(/TIMED_WAITING.*?(\d+)/);
        const deadlockMatch = html.match(/Deadlocked threads:\s*(\d+)/);
        
        return {
          total: totalMatch ? parseInt(totalMatch[1]) : 0,
          runnable: runnableMatch ? parseInt(runnableMatch[1]) : 0,
          blocked: blockedMatch ? parseInt(blockedMatch[1]) : 0,
          waiting: waitingMatch ? parseInt(waitingMatch[1]) : 0,
          timedWaiting: timedWaitingMatch ? parseInt(timedWaitingMatch[1]) : 0,
          deadlocked: deadlockMatch ? parseInt(deadlockMatch[1]) : 0
        };
      }
      
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      this.logger.error(`Failed to get thread info for ${instance.url}`, { error });
      throw error;
    }
  }
  
  async getRepositoryInfo(instance: AEMInstance): Promise<RepositoryDiagnostics> {
    try {
      const indexResponse = await Promise.allSettled([
        this.httpClient.makeRequest(instance, '/oak:index', 'GET', undefined, 15000)
      ]);
      
      let indexHealth = 'unknown';
      if (indexResponse[0].status === 'fulfilled' && indexResponse[0].value.status === 200) {
        indexHealth = 'healthy';
      } else {
        indexHealth = 'degraded';
      }
      
      return {
        size: 0,
        nodeCount: 0,
        indexHealth,
        revisions: 0
      };
    } catch (error) {
      this.logger.error(`Failed to get repository info for ${instance.url}`, { error });
      throw error;
    }
  }
  
  async getRequestInfo(instance: AEMInstance): Promise<RequestDiagnostics> {
    try {
      const response = await this.httpClient.makeRequest(
        instance,
        '/system/console/requests',
        'GET',
        undefined,
        15000
      );
      
      if (response.status === 200) {
        const html = response.data as string;
        
        const avgResponseMatch = html.match(/Average.*?(\d+(?:\.\d+)?)\s*ms/);
        const activeMatch = html.match(/Active Requests.*?(\d+)/);
        const queuedMatch = html.match(/Queued Requests.*?(\d+)/);
        const errorRateMatch = html.match(/Error Rate.*?(\d+(?:\.\d+)?)%/);
        
        return {
          averageResponseTime: avgResponseMatch ? parseFloat(avgResponseMatch[1]) : 0,
          requestsPerSecond: 0,
          activeRequests: activeMatch ? parseInt(activeMatch[1]) : 0,
          queuedRequests: queuedMatch ? parseInt(queuedMatch[1]) : 0,
          errorRate: errorRateMatch ? parseFloat(errorRateMatch[1]) : 0
        };
      }
      
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      this.logger.error(`Failed to get request info for ${instance.url}`, { error });
      throw error;
    }
  }
  
  async getBundleInfo(instance: AEMInstance): Promise<BundleDiagnostics> {
    try {
      const response = await this.httpClient.makeRequest(
        instance,
        '/system/console/bundles.json',
        'GET',
        undefined,
        15000
      );
      
      if (response.status === 200) {
        const bundleData = response.data;
        const bundles = bundleData.data || [];
        
        const active = bundles.filter((b: any) => b.state === 'Active').length;
        const resolved = bundles.filter((b: any) => b.state === 'Resolved').length;
        const installed = bundles.filter((b: any) => b.state === 'Installed').length;
        const failed = bundles
          .filter((b: any) => b.state === 'Installed' || b.state === 'Resolved')
          .map((b: any) => b.symbolicName);
        
        return {
          total: bundles.length,
          active,
          resolved,
          installed,
          failed
        };
      }
      
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      this.logger.error(`Failed to get bundle info for ${instance.url}`, { error });
      throw error;
    }
  }
  
  private getDefaultMemoryDiagnostics(): MemoryDiagnostics {
    return {
      heapUsed: 0,
      heapMax: 0,
      nonHeapUsed: 0,
      nonHeapMax: 0,
      percentage: 0
    };
  }
  
  private getDefaultThreadDiagnostics(): ThreadDiagnostics {
    return {
      total: 0,
      runnable: 0,
      blocked: 0,
      waiting: 0,
      timedWaiting: 0,
      deadlocked: 0
    };
  }
  
  private getDefaultRepositoryDiagnostics(): RepositoryDiagnostics {
    return {
      size: 0,
      nodeCount: 0,
      indexHealth: 'unknown',
      revisions: 0
    };
  }
  
  private getDefaultRequestDiagnostics(): RequestDiagnostics {
    return {
      averageResponseTime: 0,
      requestsPerSecond: 0,
      activeRequests: 0,
      queuedRequests: 0,
      errorRate: 0
    };
  }
  
  private getDefaultBundleDiagnostics(): BundleDiagnostics {
    return {
      total: 0,
      active: 0,
      resolved: 0,
      installed: 0,
      failed: []
    };
  }
}