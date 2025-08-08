import { Agent } from 'node:https';
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { AEMInstance } from '@/types.js';
import { TIMEOUTS } from '@/constants/timeouts.js';

interface RetryConfig {
  maxRetries: number;
  retryDelay: (retryCount: number) => number;
  shouldRetry: (error: AxiosError) => boolean;
}

export class AemHttpClient {
  private agents: Map<string, Agent>;
  private clients: Map<string, AxiosInstance>;
  private agentTimestamps: Map<string, number>;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly maxAgentAge = 5 * 60 * 1000;
  private readonly cleanupInterval = 60 * 1000;
  private readonly defaultTimeout: number;
  private readonly retryConfig: RetryConfig;
  
  constructor() {
    this.agents = new Map();
    this.clients = new Map();
    this.agentTimestamps = new Map();
    this.defaultTimeout = TIMEOUTS.HTTP_CLIENT;
    
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: (retryCount: number) => Math.min(1000 * Math.pow(2, retryCount), 10000),
      shouldRetry: (error: AxiosError) => {
        if (!error.response) {
          return true;
        }
        return error.response.status >= 500 || error.response.status === 429 || error.response.status === 408;
      }
    };
    
    this.startCleanupTimer();
  }
  
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleAgents();
    }, this.cleanupInterval);
  }
  
  private cleanupStaleAgents(): void {
    const now = Date.now();
    const staleKeys: string[] = [];
    
    for (const [key, timestamp] of this.agentTimestamps.entries()) {
      if (now - timestamp > this.maxAgentAge) {
        staleKeys.push(key);
      }
    }
    
    for (const key of staleKeys) {
      const agent = this.agents.get(key);
      if (agent) {
        agent.destroy();
      }
      this.agents.delete(key);
      this.clients.delete(key);
      this.agentTimestamps.delete(key);
    }
  }
  
  private async retryRequest<T>(
    fn: () => Promise<T>,
    config: RetryConfig = this.retryConfig
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === config.maxRetries) {
          break;
        }
        
        if (error instanceof AxiosError && !config.shouldRetry(error)) {
          break;
        }
        
        const delay = config.retryDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
  
  private getOrCreateClient(instance: AEMInstance, timeout?: number): AxiosInstance {
    const key = instance.url;
    const now = Date.now();
    
    if (!this.clients.has(key)) {
      const agent = new Agent({
        keepAlive: true,
        maxSockets: 10,
        keepAliveMsecs: 1000,
        timeout: timeout || this.defaultTimeout
      });
      
      const client = axios.create({
        baseURL: instance.url,
        auth: {
          username: instance.username,
          password: instance.password
        },
        httpsAgent: agent,
        timeout: timeout || this.defaultTimeout,
        validateStatus: () => true
      });
      
      this.agents.set(key, agent);
      this.clients.set(key, client);
    }
    
    this.agentTimestamps.set(key, now);
    return this.clients.get(key)!;
  }
  
  
  async makeRequest(
    instance: AEMInstance, 
    path: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: unknown,
    timeout?: number
  ): Promise<AxiosResponse> {
    const client = this.getOrCreateClient(instance, timeout);
    
    return await this.retryRequest(async () => {
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
    });
  }
  
  async cleanup(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    for (const agent of this.agents.values()) {
      agent.destroy();
    }
    this.agents.clear();
    this.clients.clear();
    this.agentTimestamps.clear();
  }
}