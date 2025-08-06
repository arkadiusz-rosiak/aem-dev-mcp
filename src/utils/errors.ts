import { MCPToolResult } from '../types.js';

export function createErrorResponse(
  error: unknown,
  requestId?: string
): MCPToolResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: errorMessage,
        requestId,
        timestamp: new Date().toISOString()
      }, null, 2)
    }],
    isError: true
  };
}

export function logError(
  error: unknown,
  context: Record<string, any> = {}
): void {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  
  console.error(JSON.stringify({
    timestamp,
    level: 'error',
    message: errorMessage,
    stack,
    context
  }));
}

export async function validateEnvironment(): Promise<void> {
  const configPath = process.env.MCP_AEM_CONFIG_PATH || './config/aem-instances.yml';
  
  try {
    const fs = await import('node:fs');
    await fs.promises.access(configPath);
  } catch (error) {
    throw new Error(`Configuration file not found: ${configPath}. Please set MCP_AEM_CONFIG_PATH environment variable or create config file.`);
  }
  
  const maxConcurrency = parseInt(process.env.MCP_AEM_MAX_CONCURRENCY || '10');
  if (isNaN(maxConcurrency) || maxConcurrency < 1) {
    throw new Error('Invalid MCP_AEM_MAX_CONCURRENCY value. Must be a positive integer.');
  }
  
  const requestTimeout = parseInt(process.env.MCP_AEM_REQUEST_TIMEOUT || '30000');
  if (isNaN(requestTimeout) || requestTimeout < 1000) {
    throw new Error('Invalid MCP_AEM_REQUEST_TIMEOUT value. Must be at least 1000ms.');
  }
}

export function setupSignalHandlers(shutdownFn: () => Promise<void>): void {
  let isShuttingDown = false;
  
  const handleSignal = async (signal: string) => {
    if (!isShuttingDown) {
      isShuttingDown = true;
      console.log(`Received ${signal}, initiating graceful shutdown...`);
      try {
        await shutdownFn();
        process.exit(0);
      } catch (error) {
        logError(error, { signal, phase: 'shutdown' });
        process.exit(1);
      }
    }
  };
  
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  
  process.on('uncaughtException', (error) => {
    logError(error, { type: 'uncaughtException' });
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logError(reason, { type: 'unhandledRejection', promise: promise.toString() });
    process.exit(1);
  });
}