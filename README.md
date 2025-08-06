# MCP Server for CMS Management

Independent Model Context Protocol (MCP) server providing connectivity and automation tools for content management systems, with specific support for Adobe Experience Manager® instances.

## Legal Notice

**This software is not affiliated with, endorsed by, or sponsored by Adobe Inc.**

Adobe®, Adobe Experience Manager®, and AEM® are registered trademarks of Adobe Inc. in the United States and/or other countries. The use of these trademarks is solely for identification of compatibility and does not imply any affiliation or endorsement.

Users must have valid licenses for Adobe Experience Manager to use this tool with AEM instances.

## Overview

This MCP server enables automated management of CMS instances through a standardized protocol, providing:

- Multi-instance management through configuration aliases
- Parallel execution with configurable concurrency
- Health monitoring and diagnostics
- Secure credential management
- Request tracking and audit trails

## Features

### Core Capabilities
- **Instance Management**: Connect to multiple CMS instances through YAML configuration
- **Parallel Operations**: Execute operations concurrently with semaphore-based limiting
- **Connection Pooling**: Optimized HTTP connections with keep-alive agents
- **Health Monitoring**: Real-time health checks and system diagnostics
- **Type Safety**: Full TypeScript support with strict type checking

### Security
- Credentials stored in configuration files, never in code
- No credential exposure in logs or error messages
- Support for file permission validation
- Request isolation with unique tracking IDs

## Installation

```bash
npm install
npm run build
```

## Configuration

Create a configuration file with your instance details:

```yaml
# config/cms-instances.yml
local:
  - url: http://localhost:4502
    username: admin
    password: admin

production:
  - url: https://prod-author.example.com
    username: admin
    password: secure-password
```

### Environment Variables

- `MCP_AEM_CONFIG_PATH`: Path to instance configuration file
- `MCP_AEM_LOG_LEVEL`: Logging level (debug, info, warn, error)
- `MCP_AEM_MAX_CONCURRENCY`: Maximum concurrent operations (default: 10)
- `MCP_AEM_REQUEST_TIMEOUT`: Request timeout in milliseconds (default: 30000)

## Usage

### Starting the Server

```bash
npm start
```

### MCP Tools Available

#### Health Check
Check the health status of configured instances:

```json
{
  "tool": "aem_health_check",
  "arguments": {
    "aliases": ["local", "production"]
  }
}
```

## Development

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type checking
npm run typecheck
```

### Building

```bash
npm run build
```

## Architecture

The server follows MCP (Model Context Protocol) standards with:

- Service-based architecture separating concerns
- Handler pattern for tool implementations
- Comprehensive error handling and logging
- Request tracking for debugging and audit

## Performance

- Response time < 2 seconds for health checks
- Memory usage < 100MB during normal operation
- Support for 10+ concurrent instance connections
- Connection pooling with keep-alive for efficiency

## Requirements

- Node.js 18.0.0 or higher
- Valid CMS instance credentials
- Network access to target instances

## License

MIT License - See LICENSE file for details

## Disclaimer

This is an independent open-source project. All trademarks mentioned are the property of their respective owners. Use of third-party trademarks does not indicate affiliation or endorsement.

## Support

This tool is provided as-is for the community. For issues, please use the GitHub issue tracker.