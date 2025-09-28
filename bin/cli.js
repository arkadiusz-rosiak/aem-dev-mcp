#!/usr/bin/env node
import { McpAemServer } from '../dist/server.js';
import { createLogger } from '../dist/utils/logger.js';
import { extractErrorMessage } from '../dist/utils/errors.js';

async function main() {
  const server = new McpAemServer();
  
  try {
    await server.initialize();
    await server.start();
  } catch (error) {
    const logger = createLogger();
    logger.error('Failed to start MCP AEM Server', { 
      error: extractErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined 
    });
    process.exit(1);
  }
}

main().catch((error) => {
  const logger = createLogger();
  logger.error('Unhandled error in main', { error });
  process.exit(1);
});