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
  
  // Register available tools list
  (server as any).setRequestHandler({ method: 'tools/list' }, async () => {
    return {
      tools: [healthCheckTool]
    };
  });
  
  // Register tool call handler
  (server as any).setRequestHandler({ method: 'tools/call' }, async (request: any) => {
    const { name, arguments: args } = request.params;
    
    if (name === 'aem_health_check') {
      try {
        const result = await handleHealthCheck(
          args,
          aliasResolver,
          parallelExecutor,
          httpClient
        );
        return result;
      } catch (error) {
        logError(error, { tool: name, arguments: args });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              tool: name
            })
          }],
          isError: true
        };
      }
    }
    
    throw new Error(`Unknown tool: ${name}`);
  });
  
  // Store clients for cleanup
  server.onerror = (error) => {
    logError(error, { context: 'mcp-server' });
  };
  
  // Cleanup function (to be called on shutdown)
  const cleanup = async () => {
    await httpClient.cleanup();
    parallelExecutor.cleanup();
  };
  
  // Store cleanup function for later use
  (server as any).cleanup = cleanup;
}