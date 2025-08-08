import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { handleHealthCheck, healthCheckTool } from './health-check.js';
import { getDefaultLogger } from '@/utils/logger.js';
import { extractErrorMessage } from '@/utils/errors.js';

export function registerHandlers(server: Server, configPath: string): void {
  const logger = getDefaultLogger();
  const aliasResolver = new AliasResolver(configPath);
  const parallelExecutor = new ParallelExecutor();
  const httpClient = new AemHttpClient();
  
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [healthCheckTool]
    };
  });
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    if (name === 'aem_health_check') {
      try {
        const result = await handleHealthCheck(
          args,
          aliasResolver,
          parallelExecutor,
          httpClient
        );
        return {
          content: result.content
        };
      } catch (error) {
        logger.error(extractErrorMessage(error), { 
          tool: name, 
          arguments: args,
          stack: error instanceof Error ? error.stack : undefined 
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: extractErrorMessage(error),
              tool: name
            })
          }],
          isError: true
        };
      }
    }
    
    throw new Error(`Unknown tool: ${name}`);
  });
  
  server.onerror = (error) => {
    logger.error(extractErrorMessage(error), { 
      context: 'mcp-server',
      stack: error instanceof Error ? error.stack : undefined 
    });
  };
  
  const cleanup = async () => {
    await httpClient.cleanup();
  };
  
  (server as any).cleanup = cleanup;
}