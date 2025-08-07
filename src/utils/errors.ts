import { MCPToolResult } from '@/types.js';

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
  context?: Record<string, unknown>
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  console.error(`[ERROR] ${errorMessage}`, {
    ...context,
    stack: errorStack,
    timestamp: new Date().toISOString()
  });
}

export function validateEnvironment(): void {
  const requiredEnvs = ['MCP_AEM_CONFIG_PATH'];
  const missingEnvs: string[] = [];
  
  for (const env of requiredEnvs) {
    if (!process.env[env]) {
      missingEnvs.push(env);
    }
  }
  
  if (missingEnvs.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvs.join(', ')}`);
  }
}

export function setupSignalHandlers(cleanup: () => Promise<void>): void {
  const handleShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    try {
      await cleanup();
      console.log('Cleanup completed successfully.');
      process.exit(0);
    } catch (error) {
      console.error('Error during cleanup:', error);
      process.exit(1);
    }
  };
  
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    process.exit(1);
  });
}