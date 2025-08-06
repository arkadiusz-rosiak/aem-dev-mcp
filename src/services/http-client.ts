import { Agent } from 'node:https';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { AEMInstance, HealthStatus } from '../types.js';

export class AemHttpClient {
  private agents: Map<string, Agent>;
  private clients: Map<string, AxiosInstance>;
  
  constructor() {
    this.agents = new Map();
    this.clients = new Map();
  }
  
  private getOrCreateClient(instance: AEMInstance): AxiosInstance {
    const key = instance.url;
    
    if (!this.clients.has(key)) {
      const agent = new Agent({
        keepAlive: true,
        maxSockets: 10,
        keepAliveMsecs: 1000,
        timeout: 30000
      });
      
      const client = axios.create({
        baseURL: instance.url,
        auth: {
          username: instance.username,
          password: instance.password
        },
        httpsAgent: agent,
        timeout: 30000,
        validateStatus: () => true // Handle all status codes
      });
      
      this.agents.set(key, agent);
      this.clients.set(key, client);
    }
    
    return this.clients.get(key)!;
  }
  
  async checkHealth(instance: AEMInstance): Promise<HealthStatus> {
    const client = this.getOrCreateClient(instance);
    const startTime = Date.now();
    const checks: Record<string, boolean> = {};
    
    try {
      // Check system health endpoint
      const healthResponse = await client.get('/system/health');
      checks.systemHealth = healthResponse.status === 200;
      
      // Check login page accessibility
      const loginResponse = await client.get('/libs/granite/core/content/login.html');
      checks.loginPage = loginResponse.status === 200;
      
      // Check bundle status
      const bundleResponse = await client.get('/system/console/bundles.json');
      checks.bundleStatus = bundleResponse.status === 200;
      
      const duration = Date.now() - startTime;
      const overallHealthy = Object.values(checks).every(check => check);
      
      return {
        status: overallHealthy ? (duration > 5000 ? 'degraded' : 'healthy') : 'unhealthy',
        timestamp: Date.now(),
        checks
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: Date.now(),
        checks: {
          ...checks,
          error: false
        }
      };
    }
  }
  
  async makeRequest(
    instance: AEMInstance, 
    path: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: any
  ): Promise<AxiosResponse> {
    const client = this.getOrCreateClient(instance);
    
    switch (method) {
      case 'GET':
        return await client.get(path);
      case 'POST':
        return await client.post(path, data);
      case 'PUT':
        return await client.put(path, data);
      case 'DELETE':
        return await client.delete(path);
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  }
  
  async cleanup(): Promise<void> {
    for (const agent of this.agents.values()) {
      agent.destroy();
    }
    this.agents.clear();
    this.clients.clear();
  }
}