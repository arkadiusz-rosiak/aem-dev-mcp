# AEM MCP Server

A TypeScript-based Model Context Protocol (MCP) server that provides connectivity tools for Adobe Experience Manager (AEM) instances. This server enables AI agents to interact with AEM systems, manage OSGi bundles and configurations, monitor health, and troubleshoot common issues.

## What is MCP?

Model Context Protocol (MCP) is an open protocol that enables seamless communication between AI assistants and external systems. By implementing MCP, this server allows AI agents like Claude to directly interact with your AEM instances, automating routine tasks and providing intelligent troubleshooting capabilities.

## Features

- **Multi-Instance Management**: Connect to multiple AEM instances simultaneously with alias-based grouping
- **OSGi Bundle Operations**: List, start, stop, refresh, restart, and uninstall bundles
- **Component Management**: Enable, disable, and inspect OSGi components
- **Configuration CRUD**: Create, read, update, and delete OSGi configurations
- **Health Monitoring**: Comprehensive system health checks across instances
- **Log Analysis**: Search and analyze AEM logs with regex patterns and pagination
- **Groovy Script Execution**: Run custom Groovy scripts for advanced operations
- **Parallel Execution**: Perform operations across multiple instances concurrently (up to 20)

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Access to AEM instance(s)

### Setup


#### From sources 

1. Clone the repository:
```bash
git clone https://github.com/arkadiusz-rosiak/aem-mcp.git
cd aem-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Create configuration file for your AEM instances:
```bash
touch ~/aem-instances.yaml
```

5. Configure your AEM instances in `~/aem-instances.yaml`:
```yaml

# Instance groups for different environments
local:
  - url: "http://localhost:4502"
    username: "admin"
    password: "admin"
  - url: "http://localhost:4503"
    username: "admin"
    password: "admin"

dev:
  - url: https://dev-author.example.com
    username: admin
    password: secretpass
  - url: https://dev-publish.example.com
    username: admin
    password: secretpass

prod:
  - url: https://prod-author.example.com
    username: admin
    password: prodpass
  - url: https://prod-publish.example.com
    username: admin
    password: prodpass
```

## Usage


### Configuring AI Agents

To use with Claude Desktop or other MCP-compatible AI assistants, add the server to your MCP configuration:

```json
{
  "mcpServers": {
    "aem-mcp": {
      "command": "node",
      "args": ["/path/to/aem-mcp/dist/server.js"],
      "env": {
        "AEM_INSTANCES_CONFIG_PATH": "/path/to/aem-instances.yaml"
      }
    }
  }
}
```

## Real-World Examples

### Example 1: Troubleshooting Inactive OSGi Bundles

**Problem**: After deployment, several OSGi bundles remain in "Installed" or "Resolved" state instead of "Active", causing features to be unavailable.

**AI Agent Interaction**:
```
User: "Several bundles are not active on my AEM author instance. Can you investigate?"

AI: "I'll check the bundle status and identify any issues. Let me start by listing all non-active bundles."
[Uses aem_bundle_list with status filter]

AI: "Found 5 bundles in 'Installed' state. Let me check their details for missing dependencies."
[Uses aem_bundle_details for each problematic bundle]

AI: "The com.company.core bundle has unsatisfied dependencies on com.adobe.cq.social.commons. Let me try to start the dependency first."
[Uses aem_bundle_start on dependency bundle]

AI: "Dependency started successfully. Now attempting to start your core bundle."
[Uses aem_bundle_start on the main bundle]

AI: "All bundles are now active. The issue was a missing dependency that needed to be started first."
```

### Example 2: Memory Issues Due to Unclosed JCR Sessions

**Problem**: AEM instance is experiencing memory issues and slowdowns, logs show "CacheManager: resizeAll" warnings.

**AI Agent Interaction**:
```
User: "My AEM instance is running slowly and I'm seeing memory warnings in the logs."

AI: "Let me analyze your logs for memory-related issues and check system health."
[Uses aem_logs_search with pattern "CacheManager|OutOfMemory|heap"]

AI: "I see multiple 'CacheManager: resizeAll' entries indicating unclosed JCR sessions. Let me check the system health."
[Uses aem_health_check]

AI: "Memory usage is at 89%. Let me search for the components that might be leaking sessions."
[Uses aem_groovy_execute with a script to find unclosed sessions]

AI: "Found that the custom SearchService component has 1,247 unclosed sessions. Let me restart it to clear the leaked sessions."
[Uses aem_component_disable then aem_component_enable]

AI: "Component restarted. Memory usage dropping to 45%. I recommend reviewing the SearchService code to ensure sessions are properly closed in finally blocks."
```

### Example 3: Bulk Operations Across Multiple Instances

**Problem**: Need to disable a problematic component across all environments quickly to prevent service disruption.

**AI Agent Interaction**:
```
User: "The NewsletterService component is causing issues. Can you disable it on all our instances immediately?"

AI: "I'll disable the NewsletterService component across all configured instances in parallel."
[Uses aem_component_disable with alias "all" for parallel execution]

AI: "Component disabled on all 6 instances:
- dev-author: Success
- dev-publish: Success  
- staging-author: Success
- staging-publish: Success
- prod-author: Success
- prod-publish: Success

All instances processed in 2.3 seconds. The problematic component is now safely disabled across your entire infrastructure."
```

## Available MCP Tools

### System & Monitoring
- `aem_health_check` - Comprehensive system health monitoring
- `aem_logs_search` - Search and analyze AEM logs with regex patterns
- `aem_groovy_execute` - Execute Groovy scripts for advanced operations

### OSGi Bundle Management
- `aem_bundle_list` - List all OSGi bundles with filtering
- `aem_bundle_start` - Start stopped bundles
- `aem_bundle_stop` - Stop running bundles
- `aem_bundle_refresh` - Refresh bundle packages
- `aem_bundle_restart` - Restart bundles
- `aem_bundle_uninstall` - Uninstall bundles
- `aem_bundle_details` - Get detailed bundle information

### OSGi Component Management
- `aem_component_list` - List all OSGi components
- `aem_component_enable` - Enable disabled components
- `aem_component_disable` - Disable active components
- `aem_component_details` - Get detailed component information

### OSGi Configuration Management
- `aem_configuration_list` - List all OSGi configurations
- `aem_configuration_get` - Retrieve specific configuration
- `aem_configuration_create` - Create new configurations
- `aem_configuration_update` - Update existing configurations
- `aem_configuration_delete` - Delete configurations
- `aem_configuration_unbind` - Unbind factory configurations

## Development

### Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript with path aliases
- `npm run typecheck` - Type check without building
- `npm run lint` - Run ESLint
- `npm run test` - Run Jest tests
- `npm run test:coverage` - Run tests with coverage report

### Architecture

The project follows a layered architecture:
- **Handlers**: MCP tool entry points (`src/handlers/`)
- **Services**: Business logic and AEM API communication (`src/services/`)
- **Types**: TypeScript definitions with factory functions (`src/types/`)
- **Schemas**: Zod validation schemas (`src/schemas/`)
- **Utils**: Shared utilities (`src/utils/`)

## Configuration

### Environment Variables

- `AEM_INSTANCES_CONFIG_PATH` - Path to AEM instances configuration file (default: `~/aem-instances.yaml`)

### Instance Configuration

The configuration file supports:
- Direct instance definitions with URL, username, and password
- Instance groups (aliases) for managing multiple instances
- Environment-based grouping (dev, staging, prod)


## License

MIT

## Author

[Arkadiusz Rosiak](https://www.linkedin.com/in/arkadiusz-rosiak-aem/)