import { MCPToolResult, HealthStatus, AEMInstance } from '@/types.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { HealthService } from '@/services/health-service.js';
import { DiagnosticsService } from '@/services/diagnostics-service.js';
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
  detailed: z.boolean().optional()
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
    const healthService = new HealthService(client);
    const diagnosticsService = new DiagnosticsService(client);
    
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
    
    if (instances.length > 20) {
      throw new Error('Maximum 20 instances supported for parallel health checks');
    }
    
    const results = await executor.executeOnInstances(
      instances,
      async (instance) => {
        const healthStatus = await healthService.performHealthCheck(instance);
        
        if (validatedInput.detailed && healthStatus.overall !== 'unhealthy') {
          try {
            const diagnostics = await diagnosticsService.collectDiagnostics(instance);
            healthStatus.diagnostics = diagnostics;
          } catch (error) {
            logger.warn(`Failed to collect diagnostics for ${instance.url}`, { error });
          }
        }
        
        return healthStatus;
      },
      { 
        requestId,
        timeout: 15000,
        maxConcurrency: 20
      }
    );
    
    const healthResults: Record<string, HealthStatus> = {};
    let summary = {
      total: results.length,
      healthy: 0,
      unhealthy: 0,
      degraded: 0
    };
    
    for (const result of results) {
      if (result.success && result.data) {
        const instanceAlias = instances.find(i => i.url === result.instanceUrl)?.url || result.instanceUrl;
        healthResults[instanceAlias] = result.data;
        
        if (result.data.overall === 'healthy') {
          summary.healthy++;
        } else if (result.data.overall === 'unhealthy') {
          summary.unhealthy++;
        } else if (result.data.overall === 'degraded') {
          summary.degraded++;
        }
      } else {
        summary.unhealthy++;
        healthResults[result.instanceUrl] = {
          instance: result.instanceUrl,
          overall: 'unhealthy',
          timestamp: new Date(),
          checks: [{
            component: 'system',
            status: 'unhealthy',
            message: result.error || 'Unknown error'
          }]
        };
      }
    }
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          requestId,
          summary,
          results: healthResults,
          metadata: {
            timestamp: new Date().toISOString(),
            detailed: validatedInput.detailed || false,
            totalInstances: instances.length,
            averageResponseTime: results
              .filter(r => r.duration)
              .reduce((sum, r) => sum + (r.duration || 0), 0) / Math.max(results.length, 1)
          }
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
  description: 'Performs comprehensive health checks on AEM instances with detailed diagnostics',
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
      },
      detailed: {
        type: 'boolean',
        description: 'Include detailed diagnostic information (memory, threads, bundles, etc.)',
        default: false
      }
    },
    oneOf: [
      { required: ['aliases'] },
      { required: ['instances'] }
    ]
  }
};