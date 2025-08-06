import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { handleHealthCheck, healthCheckTool } from './health-check.js';
import { logError } from '@/utils/errors.js';

export function registerHandlers(server: Server, configPath: string): void {
  // Initialize shared services
  const aliasResolver = new AliasResolver(configPath);
  const maxConcurrency = parseInt(process.env.MCP_AEM_MAX_CONCURRENCY || '10');
  const parallelExecutor = new ParallelExecutor(maxConcurrency);
  const httpClient = new AemHttpClient();
  
  // Register health check handler
  server.setRequestHandler({ method: 'tools/call' } as any, async (request: any) => {
    try {
      if (request.params.name === 'aem_health_check') {
        return await handleHealthCheck(
          request.params.arguments,
          aliasResolver,
          parallelExecutor,
          httpClient
        );
      }
      
      throw new Error(`Unknown tool: ${request.params.name}`);
    } catch (error) {
      logError(error, { 
        tool: request.params.name, 
        arguments: request.params.arguments 
      });
      throw error;
    }
  });
  
  // Register tool listing
  server.setRequestHandler({ method: 'tools/list' } as any, async () => {
    return {
      tools: [
        healthCheckTool
      ]
    };
  });
  
  // Store clients for cleanup
  server.onerror = (error) => {
    logError(error, { context: 'mcp-server' });
  };
  
  // Cleanup function (to be called on shutdown)
  const cleanup = async () => {
    await httpClient.cleanup();
  };
  
  // Store cleanup function for later use
  (server as any).cleanup = cleanup;
}