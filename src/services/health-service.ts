import { AEMInstance, HealthStatus, HealthCheckResult, ErrorType } from '@/types.js';
import { AemHttpClient } from '@/services/http-client.js';
import { Logger } from '@/utils/logger.js';

export class HealthService {
  private httpClient: AemHttpClient;
  private logger: Logger;
  
  constructor(httpClient: AemHttpClient) {
    this.httpClient = httpClient;
    this.logger = new Logger();
  }
  
  async performHealthCheck(instance: AEMInstance): Promise<HealthStatus> {
    const startTime = Date.now();
    const checks: HealthCheckResult[] = [];
    
    try {
      const reachabilityCheck = await this.checkInstanceReachability(instance);
      checks.push(reachabilityCheck);
      
      if (reachabilityCheck.status !== 'unhealthy') {
        const bundleCheck = await this.checkOSGiBundles(instance);
        checks.push(bundleCheck);
        
        const loginCheck = await this.checkLoginPage(instance);
        checks.push(loginCheck);
        
        const repositoryCheck = await this.checkRepository(instance);
        checks.push(repositoryCheck);
        
        const consoleCheck = await this.checkSystemConsole(instance);
        checks.push(consoleCheck);
      }
      
      return this.aggregateResults(instance, checks);
      
    } catch (error) {
      this.logger.error(`Health check failed for ${instance.url}`, { error });
      
      return {
        instance: instance.url,
        overall: 'unhealthy',
        timestamp: new Date(),
        checks: [{
          component: 'system',
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          responseTime: Date.now() - startTime
        }]
      };
    }
  }
  
  async checkInstanceReachability(instance: AEMInstance): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.httpClient.makeRequest(instance, '/', 'GET', undefined, 15000);
      const responseTime = Date.now() - startTime;
      
      if (response.status >= 200 && response.status < 400) {
        return {
          component: 'reachability',
          status: responseTime > 5000 ? 'degraded' : 'healthy',
          message: responseTime > 5000 ? 'Slow response time' : 'Instance reachable',
          responseTime
        };
      } else {
        return {
          component: 'reachability',
          status: 'unhealthy',
          message: `HTTP ${response.status}`,
          responseTime
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        component: 'reachability',
        status: 'unhealthy',
        message: this.classifyError(error),
        responseTime
      };
    }
  }
  
  async checkOSGiBundles(instance: AEMInstance): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.httpClient.makeRequest(
        instance, 
        '/system/console/bundles.json', 
        'GET', 
        undefined, 
        15000
      );
      const responseTime = Date.now() - startTime;
      
      if (response.status === 200) {
        const bundleData = response.data;
        const totalBundles = bundleData.s?.[1] || 0;
        const activeBundles = bundleData.s?.[0] || 0;
        const failedBundles = bundleData.data?.filter((bundle: any) => 
          bundle.state === 'Installed' || bundle.state === 'Resolved'
        ) || [];
        
        if (failedBundles.length > 0) {
          return {
            component: 'bundles',
            status: 'unhealthy',
            message: `${failedBundles.length} bundles failed`,
            responseTime,
            details: {
              total: totalBundles,
              active: activeBundles,
              failed: failedBundles.map((b: any) => b.symbolicName)
            }
          };
        }
        
        return {
          component: 'bundles',
          status: 'healthy',
          message: `All ${totalBundles} bundles active`,
          responseTime,
          details: {
            total: totalBundles,
            active: activeBundles
          }
        };
      } else if (response.status === 401 || response.status === 403) {
        return {
          component: 'bundles',
          status: 'unhealthy',
          message: 'Authentication required for bundle console',
          responseTime
        };
      } else {
        return {
          component: 'bundles',
          status: 'unhealthy',
          message: `Bundle console unavailable (HTTP ${response.status})`,
          responseTime
        };
      }
    } catch (error) {
      return {
        component: 'bundles',
        status: 'unhealthy',
        message: this.classifyError(error),
        responseTime: Date.now() - startTime
      };
    }
  }
  
  async checkLoginPage(instance: AEMInstance): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.httpClient.makeRequest(
        instance,
        '/libs/granite/core/content/login.html',
        'GET',
        undefined,
        15000
      );
      const responseTime = Date.now() - startTime;
      
      if (response.status === 200) {
        return {
          component: 'login',
          status: 'healthy',
          message: 'Login page accessible',
          responseTime
        };
      } else {
        return {
          component: 'login',
          status: 'unhealthy',
          message: `Login page unavailable (HTTP ${response.status})`,
          responseTime
        };
      }
    } catch (error) {
      return {
        component: 'login',
        status: 'unhealthy',
        message: this.classifyError(error),
        responseTime: Date.now() - startTime
      };
    }
  }
  
  async checkRepository(instance: AEMInstance): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.httpClient.makeRequest(
        instance,
        '/crx/de/index.jsp',
        'GET',
        undefined,
        15000
      );
      const responseTime = Date.now() - startTime;
      
      if (response.status === 200) {
        return {
          component: 'repository',
          status: 'healthy',
          message: 'Repository accessible',
          responseTime
        };
      } else if (response.status === 401 || response.status === 403) {
        return {
          component: 'repository',
          status: 'healthy',
          message: 'Repository requires authentication (normal)',
          responseTime
        };
      } else {
        return {
          component: 'repository',
          status: 'unhealthy',
          message: `Repository unavailable (HTTP ${response.status})`,
          responseTime
        };
      }
    } catch (error) {
      return {
        component: 'repository',
        status: 'unhealthy',
        message: this.classifyError(error),
        responseTime: Date.now() - startTime
      };
    }
  }
  
  async checkSystemConsole(instance: AEMInstance): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.httpClient.makeRequest(
        instance,
        '/system/console/memoryusage',
        'GET',
        undefined,
        15000
      );
      const responseTime = Date.now() - startTime;
      
      if (response.status === 200) {
        return {
          component: 'console',
          status: 'healthy',
          message: 'System console accessible',
          responseTime
        };
      } else if (response.status === 401 || response.status === 403) {
        return {
          component: 'console',
          status: 'degraded',
          message: 'Console authentication required',
          responseTime
        };
      } else {
        return {
          component: 'console',
          status: 'unhealthy',
          message: `System console unavailable (HTTP ${response.status})`,
          responseTime
        };
      }
    } catch (error) {
      return {
        component: 'console',
        status: 'unhealthy',
        message: this.classifyError(error),
        responseTime: Date.now() - startTime
      };
    }
  }
  
  aggregateResults(instance: AEMInstance, checks: HealthCheckResult[]): HealthStatus {
    const hasUnhealthy = checks.some(check => check.status === 'unhealthy');
    const hasDegraded = checks.some(check => check.status === 'degraded');
    
    let overall: 'healthy' | 'unhealthy' | 'degraded';
    
    if (hasUnhealthy) {
      overall = 'unhealthy';
    } else if (hasDegraded) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }
    
    return {
      instance: instance.url,
      overall,
      timestamp: new Date(),
      checks
    };
  }
  
  private classifyError(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      const errorCode = (error as any).code;
      
      if (errorCode === 'ECONNREFUSED' || errorCode === 'EHOSTUNREACH' || errorCode === 'ETIMEDOUT') {
        return `${ErrorType.NETWORK_ERROR}: ${errorCode}`;
      }
    }
    
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as any).response;
      if (response?.status === 401 || response?.status === 403) {
        return `${ErrorType.AUTH_ERROR}: HTTP ${response.status}`;
      }
      if (response?.status >= 500) {
        return `${ErrorType.SERVICE_ERROR}: HTTP ${response.status}`;
      }
    }
    
    return error instanceof Error ? error.message : String(error);
  }
}