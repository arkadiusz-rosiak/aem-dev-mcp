import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import { AEMInstance, InstanceAliasConfig, AliasResolutionResult } from '@/types.js';

export class AliasResolver {
  private configPath: string;
  private config: InstanceAliasConfig | null = null;
  private configLock: Promise<void> | null = null;
  
  constructor(configPath: string) {
    this.configPath = configPath;
  }
  
  private validateConfig(config: InstanceAliasConfig): void {
    const aliases = new Set<string>();
    
    for (const alias of Object.keys(config)) {
      if (aliases.has(alias.toLowerCase())) {
        throw new Error(`Duplicate alias found (case-insensitive): ${alias}`);
      }
      aliases.add(alias.toLowerCase());
      
      const instances = config[alias];
      if (!Array.isArray(instances)) {
        throw new Error(`Alias '${alias}' must contain an array of instances`);
      }
      
      if (instances.length === 0) {
        throw new Error(`Alias '${alias}' contains empty instance array`);
      }
      
      for (const instance of instances) {
        if (!instance.url || !instance.username || !instance.password) {
          throw new Error(`Invalid instance configuration in alias '${alias}': missing required fields`);
        }
        
        try {
          new URL(instance.url);
        } catch {
          throw new Error(`Invalid URL in alias '${alias}': ${instance.url}`);
        }
      }
    }
  }
  
  private async loadConfig(): Promise<void> {
    if (this.config) return;
    
    // Prevent race conditions during config loading
    if (this.configLock) {
      await this.configLock;
      return;
    }
    
    this.configLock = (async () => {
      try {
        const configContent = await fs.promises.readFile(this.configPath, 'utf-8');
        const loadedConfig = yaml.load(configContent) as InstanceAliasConfig;
        
        this.validateConfig(loadedConfig);
        this.config = loadedConfig;
      } catch (error) {
        throw new Error(`Failed to load configuration from ${this.configPath}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.configLock = null;
      }
    })();
    
    await this.configLock;
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
      
      const instances: AEMInstance[] = aliasData.map((instance: AEMInstance) => ({
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