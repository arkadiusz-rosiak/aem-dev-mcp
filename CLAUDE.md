# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AEM MCP Server is a TypeScript-based Model Context Protocol (MCP) server that provides connectivity tools for Adobe Experience Manager (AEM) instances. It enables management of OSGi bundles, components, configurations, and health monitoring across multiple AEM instances.

## Common Commands

### Development
- `npm run dev` - Start development server with hot reload using tsx
- `npm run build` - Build TypeScript with path aliases resolution
- `npm start` - Run production build
- `npm run typecheck` - Type check without building

### Code Quality
- `npm run lint` - Run ESLint on TypeScript files
- `npm run lint:fix` - Auto-fix linting issues

### Testing
- `npm test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report (80% threshold required)

## Architecture

### Core Structure
```
src/
├── handlers/           # MCP tool handlers (entry points for tool calls)
├── services/           # Business logic and AEM API communication  
├── types/             # TypeScript type definitions with factory functions
├── schemas/           # Zod validation schemas
├── utils/             # Shared utilities and HTTP helpers
└── constants/         # Application constants
```

### Key Patterns
- **Layered Architecture**: Handlers → Services → HTTP Client
- **Type Safety**: Zod schemas with TypeScript inference, branded types
- **Parallel Execution**: `ParallelExecutor` for concurrent AEM operations (max 20 instances)
- **Error Handling**: `OperationResult<T, E>` pattern with structured error types
- **Configuration**: YAML-based AEM instance configuration with alias resolution

### Main Entry Points
- **Server**: `src/server.ts` - Main MCP server implementation
- **Handler Registration**: `src/handlers/index.ts` - Central tool registration
- **Service Base**: `src/services/osgi-base.service.ts` - Abstract OSGi operations

## Configuration

### AEM Instance Configuration
Configuration file locations (in order of precedence):
1. `$AEM_INSTANCES_CONFIG_PATH` environment variable
2. `~/aem-instances.yaml` default location

Example structure:
```yaml
local:
  - url: http://localhost:4502
    username: admin
    password: admin
```

### TypeScript Setup
- ES2022 target with ESNext modules
- Path aliases: `@/*` maps to `src/*` 
- Strict mode enabled with comprehensive type checking

### ESLint Configuration
- Flat config (ESLint v9) with TypeScript integration
- Relaxed rules for test files (allow `any`, `require`)
- Unused variable pattern: prefix with `_` to ignore

## MCP Tools Available

The server provides these MCP tools for AEM management:
- `aem_health_check` - Comprehensive system health monitoring
- `aem_bundle_*` - OSGi bundle operations (list, start, stop, refresh, etc.)
- `aem_component_*` - OSGi component management
- `aem_configuration_*` - OSGi configuration CRUD operations

All tools support both direct instance configuration and alias-based instance groups, with parallel execution across multiple AEM instances.

## Testing

- Jest with full ESM support using `ts-jest`
- Path alias resolution in tests 
- Coverage thresholds: 80% across all metrics
- Test files: `*.test.ts` or `*.spec.ts`
- CI runs on Node.js 18.x, 20.x, 22.x

## Important Notes

- Never commit configuration files with credentials
- The project uses ESM modules exclusively - imports must use `.js` extensions
- Build process uses `tsc-alias` for path alias resolution
- Timeout constants are defined in `src/constants/timeouts.ts`
- HTTP utilities and status codes are centralized in `src/utils/`