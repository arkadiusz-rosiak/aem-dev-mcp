import { z } from 'zod';

export const MAX_CONCURRENT_INSTANCES = 20;
export const DEFAULT_TIMEOUT = 30000;

export const GroovyExecuteSchema = z.object({
  script: z.string()
    .min(1, 'Script content cannot be empty')
    .optional(),
  
  scriptPath: z.string()
    .min(1, 'Script path cannot be empty')
    .regex(/^\//, 'Script path must be absolute (start with /)')
    .optional(),
  
  instanceAlias: z.string()
    .min(1, 'Instance alias cannot be empty'),
  
  timeout: z.number()
    .min(1000, 'Timeout must be at least 1000ms')
    .max(600000, 'Timeout cannot exceed 600000ms (10 minutes)')
    .default(DEFAULT_TIMEOUT)
    .optional()
}).refine(
  (data) => {
    const hasScript = data.script !== undefined;
    const hasScriptPath = data.scriptPath !== undefined;
    
    if (hasScript && hasScriptPath) {
      return false;
    }
    
    return hasScript || hasScriptPath;
  },
  {
    message: 'Must provide either script or scriptPath, but not both'
  }
);

export type GroovyExecuteInput = z.infer<typeof GroovyExecuteSchema>;