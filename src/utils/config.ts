import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { Logger } from '@/utils/logger.js';

export function getConfigPath(logger: Logger): string | null {
  const envPath = process.env.AEM_INSTANCES_CONFIG_PATH;
  if (envPath) {
    if (existsSync(envPath)) {
      return envPath;
    } else {
      logger.warn('AEM_INSTANCES_CONFIG_PATH points to non-existent file', { path: envPath });
    }
  }
  
  const defaultPath = resolve(homedir(), 'aem-instances.yaml');
  if (existsSync(defaultPath)) {
    return defaultPath;
  }
  
  logger.warn('No AEM instances configuration found', { 
    checkedPaths: [envPath, defaultPath].filter(Boolean),
    suggestion: 'Set AEM_INSTANCES_CONFIG_PATH or create ~/aem-instances.yaml'
  });
  return null;
}