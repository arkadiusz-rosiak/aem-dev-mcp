import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getConfigPath } from '@/utils/config.js';
import { registerHandlers } from '@/handlers/index.js';
import { Logger } from '@/utils/logger.js';

export class McpAemServer {
  private server: Server;
  private logger: Logger;
  private configPath: string | null = null;
  private isShuttingDown: boolean = false;

  constructor() {
    this.logger = new Logger();
    this.server = new Server(
      {
        name: 'aem-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
  }

  async initialize(): Promise<void> {
    this.configPath = getConfigPath(this.logger);
    this.logger.info('Initializing MCP AEM Server', {
      configPath: this.configPath,
      version: '1.0.0'
    });

    if (this.configPath) {
      registerHandlers(this.server, this.configPath);
    } else {
      registerHandlers(this.server, '');
    }

    this.setupSignalHandlers();

    this.logger.info('MCP AEM Server initialized successfully');
  }

  async start(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      this.logger.info('MCP AEM Server started and listening');
    } catch (error) {
      this.logger.error('Failed to start server', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined 
      });
      throw error;
    }
  }

  private setupSignalHandlers(): void {
    const handleShutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}. Shutting down gracefully...`);
      try {
        await this.shutdown();
        this.logger.info('Cleanup completed successfully.');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during cleanup', { error });
        process.exit(1);
      }
    };
    
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception', { error });
      process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
      this.logger.error('Unhandled Rejection', { reason });
      process.exit(1);
    });
  }

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Shutting down MCP AEM Server');

    try {
      const serverCleanup = (this.server as any).cleanup;
      if (serverCleanup) {
        await serverCleanup();
      }

      await this.server.close();
      this.logger.info('MCP AEM Server shutdown completed');
    } catch (error) {
      this.logger.error('Error during server shutdown', { error });
      throw error;
    }
  }
}

async function main(): Promise<void> {
  const server = new McpAemServer();
  
  try {
    await server.initialize();
    await server.start();
  } catch (error) {
    const logger = new Logger();
    logger.error('Failed to start MCP AEM Server', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined 
    });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const logger = new Logger();
    logger.error('Unhandled error in main', { error });
  });
}