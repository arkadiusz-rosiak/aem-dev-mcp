import { MCPToolResult, AEMInstance } from '@/types.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createErrorResponse } from '@/utils/errors.js';
import { Logger } from '@/utils/logger.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const HealthCheckSchema = z.object({
  aliases: z.array(z.string()).optional(),
  instances: z.array(z.object({
    url: z.string().url(),
    username: z.string().min(1),
    password: z.string().min(1),
  })).optional(),
}).refine(
  data => data.aliases || data.instances,
  { message: "Either 'aliases' or 'instances' must be provided" }
);

export async function handleHealthCheck(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = new Logger();
  const requestId = uuidv4();
  
  try {
    const validatedInput = HealthCheckSchema.parse(args);
    
    let instances: AEMInstance[] = [];
    if (validatedInput.aliases) {
      const resolution = await resolver.resolveMultipleAliases(validatedInput.aliases);
      if (!resolution.resolved) {
        throw new Error(`Failed to resolve aliases: ${resolution.error}`);
      }
      instances = resolution.instances;
    } else if (validatedInput.instances) {
      instances = validatedInput.instances;
    }
    
    const results = await executor.executeOnInstances(
      instances,
      async (instance) => {
        return await client.checkHealth(instance);
      },
      { requestId }
    );
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          requestId,
          results: results.map(result => ({
            instanceUrl: result.instanceUrl,
            success: result.success,
            data: result.data,
            error: result.error,
            duration: result.duration
          })),
          summary: {
            total: results.length,
            healthy: results.filter(r => r.success && r.data?.status === 'healthy').length,
            unhealthy: results.filter(r => !r.success || r.data?.status === 'unhealthy').length,
            degraded: results.filter(r => r.success && r.data?.status === 'degraded').length
          },
          timestamp: Date.now()
        }, null, 2)
      }],
      isError: false
    };
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error), { 
      requestId, 
      handler: 'health-check', 
      args,
      stack: error instanceof Error ? error.stack : undefined 
    });
    
    return createErrorResponse(error, requestId);
  }
}

export const healthCheckTool = {
  name: 'aem_health_check',
  description: 'Performs health checks on specified AEM instances to verify system status and connectivity',
  inputSchema: {
    type: 'object',
    properties: {
      aliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Instance aliases from configuration to check'
      },
      instances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            username: { type: 'string' },
            password: { type: 'string' }
          },
          required: ['url', 'username', 'password']
        },
        description: 'Direct instance configuration (overrides aliases)'
      }
    },
    oneOf: [
      { required: ['aliases'] },
      { required: ['instances'] }
    ]
  }
};