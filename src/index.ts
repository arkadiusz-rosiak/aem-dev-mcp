import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { validateEnvironment, setupSignalHandlers } from './utils/errors.js';
import { registerHandlers } from './handlers/index.js';
import { Logger } from './utils/logger.js';

export class McpAemServer {
  private server: Server;
  private logger: Logger;
  private configPath: string;
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
          tools: {},
        },
      }
    );
  }

  private async validateEnvironment(): Promise<void> {
    this.logger.info('Validating environment configuration...');
    
    // Check required environment variables and configuration
    this.configPath = process.env.MCP_AEM_CONFIG_PATH || './config/aem-instances.yml';
    
    // Validate environment using utility function
    await validateEnvironment();
    
    this.logger.info('Environment validation successful', { 
      configPath: this.configPath,
      maxConcurrency: process.env.MCP_AEM_MAX_CONCURRENCY || '10',
      logLevel: process.env.MCP_AEM_LOG_LEVEL || 'info'
    });
  }

  private setupSignalHandlers(): void {
    setupSignalHandlers(async () => {
      await this.shutdown();
    });
  }

  private async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    this.logger.info('Shutting down Mcp Aem Server...');
    
    try {
      // Call cleanup function if available
      if ((this.server as any).cleanup) {
        await (this.server as any).cleanup();
      }
      
      this.logger.info('Shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown', { error: error.message });
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      // Validate environment on startup
      await this.validateEnvironment();
      
      // Setup signal handlers for graceful shutdown
      this.setupSignalHandlers();
      
      // Register all handlers
      registerHandlers(this.server, this.configPath);
      
      // Setup transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      this.logger.info('Mcp Aem Server started successfully', {
        serverName: 'aem-mcp-server',
        version: '1.0.0',
        configPath: this.configPath
      });
    } catch (error) {
      this.logger.error('Failed to start server', { error: error.message });
      process.exit(1);
    }
  }
}

// Entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new McpAemServer();
  server.start().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}