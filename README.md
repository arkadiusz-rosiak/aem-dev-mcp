# AEM MCP Server

MCP (Model Context Protocol) Server for Adobe Experience Manager instance management with TypeScript foundation.

## Features

- **Multi-Instance Management**: Manage multiple AEM instances through alias-based configuration
- **Parallel Execution**: Configurable concurrency limits for efficient operations
- **Connection Pooling**: HTTP client with keep-alive agents for optimal performance
- **Health Monitoring**: Comprehensive health checks with detailed diagnostics
- **Secure Credential Management**: Instance alias system with encrypted configuration support
- **Request Tracking**: Unique request IDs for debugging and audit trails
- **Graceful Shutdown**: Proper cleanup of resources and connections

## Architecture

### Core Components

- **McpAemServer**: Main server class with environment validation and lifecycle management
- **AemHttpClient**: HTTP client with connection pooling and keep-alive agents
- **ParallelExecutor**: Concurrent operation execution with semaphore-based limiting
- **AliasResolver**: YAML-based instance configuration management
- **Health Check Handler**: MCP tool for instance health monitoring

### Directory Structure

```
src/
├── index.ts           # Main entry point with McpAemServer class
├── types.ts           # TypeScript type definitions and interfaces
├── handlers/          # MCP tool handlers following standard pattern
│   ├── health-check.ts
│   └── index.ts       # Handler registration
├── services/          # Business logic separated from MCP
│   ├── http-client.ts
│   ├── parallel-executor.ts
│   └── alias-resolver.ts
└── utils/             # Helper functions
    ├── errors.ts      # Standard error handling
    ├── semaphore.ts   # Concurrency control
    └── logger.ts      # Logging utilities
```

## Configuration

### Environment Variables

- `MCP_AEM_CONFIG_PATH`: Path to instance configuration file (default: ./config/aem-instances.yml)
- `MCP_AEM_LOG_LEVEL`: Logging level (debug, info, warn, error)
- `MCP_AEM_MAX_CONCURRENCY`: Maximum concurrent operations (default: 10)
- `MCP_AEM_REQUEST_TIMEOUT`: HTTP request timeout in milliseconds (default: 30000)

### Instance Configuration

Create `config/aem-instances.yml` based on the provided example:

```yaml
version: "1.0"

local:
  - url: http://localhost:4502
    username: admin
    password: admin

production:
  - url: https://prod-author.company.com
    username: admin
    password: prod-password
```

## Usage

### Installation

```bash
npm install
npm run build
```

### Development

```bash
npm run dev
```

### Testing

```bash
npm test
npm run test:coverage
```

### MCP Tools

#### Health Check

Check the health status of AEM instances:

```json
{
  "tool": "aem_health_check",
  "arguments": {
    "aliases": ["local", "staging"]
  }
}
```

Response:
```json
{
  "requestId": "req_1705744800000_abc123def",
  "timestamp": "2024-01-20T10:00:00.000Z",
  "results": [
    {
      "instanceUrl": "http://localhost:4502",
      "status": "healthy",
      "duration": 523,
      "checks": {
        "systemHealth": true,
        "loginPage": true,
        "bundleStatus": true
      }
    }
  ]
}
```

## Performance

- **Health Check Response Time**: < 2 seconds for up to 20 instances
- **Memory Usage**: < 100MB during operation
- **Concurrent Connections**: Up to 10 connections per instance with keep-alive
- **Request Timeout**: 30-second default with configurable override

## Security

- **Credential Protection**: No credential exposure in logs or error messages
- **Configuration Security**: Support for file permissions validation (600)
- **Request Isolation**: Each request has unique tracking ID
- **Error Sanitization**: Sensitive data stripped from error responses

## Development

### Type Safety

All components are fully typed with TypeScript strict mode enabled.

### Error Handling

Comprehensive error handling with:
- Request-level error isolation
- Structured error responses
- Detailed logging with context
- Graceful degradation

### Testing

Jest-based testing with:
- Unit tests for all services and utilities
- Integration tests for MCP handlers
- Coverage thresholds (80% minimum)
- ES module support

## License

MIT