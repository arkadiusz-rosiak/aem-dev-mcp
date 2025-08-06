import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import { AEMInstance, InstanceAliasConfig, AliasResolutionResult } from '@/types.js';

export class AliasResolver {
  private configPath: string;
  private config: InstanceAliasConfig | null = null;
  
  constructor(configPath: string) {
    this.configPath = configPath;
  }
  
  private async loadConfig(): Promise<void> {
    if (this.config) return;
    
    try {
      const configContent = await fs.promises.readFile(this.configPath, 'utf-8');
      this.config = yaml.load(configContent) as InstanceAliasConfig;
    } catch (error) {
      throw new Error(`Failed to load configuration from ${this.configPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async resolveAlias(alias: string): Promise<AliasResolutionResult> {
    try {
      await this.loadConfig();
      
      if (!this.config || !this.config[alias]) {
        return {
          alias,
          instances: [],
          resolved: false,
          error: `Alias '${alias}' not found in configuration`
        };
      }
      
      const aliasData = this.config[alias];
      if (!Array.isArray(aliasData)) {
        return {
          alias,
          instances: [],
          resolved: false,
          error: `Alias '${alias}' does not contain instance array`
        };
      }
      
      const instances: AEMInstance[] = aliasData.map((instance: any) => ({
        url: instance.url,
        username: instance.username,
        password: instance.password
      }));
      
      return {
        alias,
        instances,
        resolved: true
      };
    } catch (error) {
      return {
        alias,
        instances: [],
        resolved: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  async resolveMultipleAliases(aliases: string[]): Promise<{ 
    resolved: boolean; 
    instances: AEMInstance[]; 
    error?: string; 
  }> {
    const allInstances: AEMInstance[] = [];
    const errors: string[] = [];
    
    for (const alias of aliases) {
      const result = await this.resolveAlias(alias);
      
      if (result.resolved) {
        allInstances.push(...result.instances);
      } else {
        errors.push(`${alias}: ${result.error}`);
      }
    }
    
    if (errors.length > 0) {
      return {
        resolved: false,
        instances: [],
        error: errors.join(', ')
      };
    }
    
    return {
      resolved: true,
      instances: allInstances
    };
  }
  
  async listAliases(): Promise<string[]> {
    await this.loadConfig();
    
    if (!this.config) {
      return [];
    }
    
    return Object.keys(this.config).filter(key => 
      Array.isArray(this.config![key])
    );
  }
  
  reloadConfig(): void {
    this.config = null;
  }
}