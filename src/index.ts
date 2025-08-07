import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { validateEnvironment, setupSignalHandlers } from '@/utils/errors.js';
import { registerHandlers } from '@/handlers/index.js';
import { Logger } from '@/utils/logger.js';

export class McpAemServer {
  private server: Server;
  private logger: Logger;
  private configPath!: string;
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
    validateEnvironment();
    
    this.configPath = process.env.MCP_AEM_CONFIG_PATH!;
    this.logger.info('Initializing MCP AEM Server', {
      configPath: this.configPath,
      version: '1.0.0'
    });

    registerHandlers(this.server, this.configPath);

    setupSignalHandlers(async () => {
      await this.shutdown();
    });

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
      this.logger.error('Failed to start server', { error });
      throw error;
    }
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
    console.error('Failed to start MCP AEM Server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}