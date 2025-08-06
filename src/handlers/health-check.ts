import { MCPToolResult, AEMInstance } from '@/types.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createErrorResponse, logError } from '@/utils/errors.js';
import { z } from 'zod';

// Input validation schema
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
  // Generate unique request ID for tracking
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // 1. Validate arguments
    const validatedInput = HealthCheckSchema.parse(args);
    
    // 2. Resolve instances
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
    
    // 3. Execute health checks in parallel
    const results = await executor.executeOnInstances(
      instances,
      async (instance) => {
        return await client.checkHealth(instance);
      },
      { requestId }
    );
    
    // 4. Return MCP format result
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          requestId,
          timestamp: new Date().toISOString(),
          results: results.map(r => ({
            instanceUrl: r.instanceUrl,
            status: r.success ? r.data?.status || 'unknown' : 'unhealthy',
            duration: r.duration,
            error: r.error,
            checks: r.success ? r.data?.checks : undefined
          }))
        }, null, 2)
      }]
    };
    
  } catch (error) {
    logError(error, { requestId, handler: 'health-check' });
    return createErrorResponse(error, requestId);
  }
}

// Handler registration
export const healthCheckTool = {
  name: 'aem_health_check',
  description: 'Check health status of AEM instances using aliases or direct configuration',
  inputSchema: {
    type: 'object',
    properties: {
      aliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Instance aliases to check (e.g., ["local", "staging"])'
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