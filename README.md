# AEM DEV MCP Server

A TypeScript-based Model Context Protocol (MCP) server that provides connectivity tools for Adobe Experience Manager (AEM) instances. This server enables AI agents to interact with AEM systems, manage OSGi bundles and configurations, monitor health, and troubleshoot common issues.

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
- npm
- Access to AEM instance(s)

### Setup

#### From npm (Recommended)

1. Install the package globally:
```bash
npm install -g aem-dev-mcp-server
```

2. During installation, an example configuration file will be automatically created at `~/aem-instances.yaml` if it doesn't already exist

3. Configure your AEM instances in `~/aem-instances.yaml` with your actual server details (see configuration example below, or check `examples/aem-instances.example.yaml` in the installed package)

#### From sources

1. Clone the repository:
```bash
git clone https://github.com/arkadiusz-rosiak/aem-dev-mcp.git
cd aem-dev-mcp
```

2. Install dependencies:
```bash
npm install
```

3. During installation, an example configuration file will be automatically created at `~/aem-instances.yaml` if it doesn't already exist

4. Build the project:
```bash
npm run build
```

5. Configure your AEM instances in `~/aem-instances.yaml` with your actual server details (you can also check `examples/aem-instances.example.yaml` for reference):
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

### First-Run Setup

When you install the AEM MCP Server (either via npm or from sources), a postinstall script automatically runs to improve your setup experience:

- **Automatic Configuration**: If `~/aem-instances.yaml` doesn't exist, the script automatically copies the example configuration from `examples/aem-instances.example.yaml` 
- **Safe Setup**: Existing configurations are never overwritten - your settings are always preserved
- **Clear Feedback**: The script provides clear console output about what actions were taken
- **Ready to Use**: After installation, you can immediately start using the server by updating the configuration with your AEM credentials

**Example output during fresh installation:**
```
🔧 AEM MCP Server - First-run setup...
✓ Created default configuration at ~/aem-instances.yaml
  Please update it with your AEM instance credentials.

📖 Next steps:
  1. Edit ~/aem-instances.yaml with your AEM server details
  2. Replace "changeme" passwords with actual credentials
  3. Remove or comment out environments you don't need
```

## Usage


### Configuring AI Agents

#### Claude Code Configuration

For Claude Code users, you can configure this MCP server using these commands:

**Using npm installation (Recommended):**
```bash
# Add the AEM MCP server to Claude Code
claude mcp add aem-dev-mcp npx aem-dev-mcp-server

# Set environment variable for configuration file location
claude mcp env aem-dev-mcp AEM_INSTANCES_CONFIG_PATH=/path/to/aem-instances.yaml
```

**Using local build:**
```bash
# Add the AEM MCP server to Claude Code
claude mcp add aem-dev-mcp node /path/to/aem-dev-mcp/dist/server.js

# Set environment variable for configuration file location
claude mcp env aem-dev-mcp AEM_INSTANCES_CONFIG_PATH=/path/to/aem-instances.yaml
```

**Common commands:**
```bash
# List configured MCP servers
claude mcp list

# Remove the server if needed
claude- mcp remove aem-dev-mcp
```

#### Claude Desktop Configuration

To use with Claude Desktop or other MCP-compatible AI assistants, add the server to your MCP configuration:

**Using npm installation (Recommended):**
```json
{
  "mcpServers": {
    "aem-dev-mcp": {
      "command": "npx",
      "args": ["aem-dev-mcp-server"],
      "env": {
        "AEM_INSTANCES_CONFIG_PATH": "/path/to/aem-instances.yaml"
      }
    }
  }
}
```

**Using local build:**
```json
{
  "mcpServers": {
    "aem-dev-mcp": {
      "command": "node",
      "args": ["/path/to/aem-dev-mcp/dist/server.js"],
      "env": {
        "AEM_INSTANCES_CONFIG_PATH": "/path/to/aem-instances.yaml"
      }
    }
  }
}
```

#### Warp Terminal Configuration

For Warp terminal users, you can configure the MCP server through the Warp settings:

1. Open Warp terminal
2. Press `Cmd/Ctrl + ,` to open settings
3. Navigate to "Features" → "AI Assistant"
4. Add MCP server configuration:

**Using npm installation (Recommended):**
```json
{
  "mcpServers": {
    "aem-dev-mcp": {
      "command": "npx",
      "args": ["aem-dev-mcp-server"],
      "env": {
        "AEM_INSTANCES_CONFIG_PATH": "/absolute/path/to/aem-instances.yaml"
      }
    }
  }
}
```

**Using local build:**
```json
{
  "mcpServers": {
    "aem-dev-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/aem-dev-mcp/dist/server.js"],
      "env": {
        "AEM_INSTANCES_CONFIG_PATH": "/absolute/path/to/aem-instances.yaml"
      }
    }
  }
}
```

**Note**: Make sure to use absolute paths in Warp configuration.

## Security & Privacy

### Credential Handling

**Important for developers**: Understanding credential visibility in this MCP server:

- **Direct Instances**: When you provide instance configuration directly in tool calls (with URL, username, password), the LLM **CAN SEE** these credentials as they are part of the tool call parameters
- **Aliases (Recommended)**: When using aliases from your configuration file, the LLM only sees alias names (e.g., "local", "dev") - actual credentials are read directly by the MCP server from your local configuration file, keeping them invisible to the LLM
- **Local Storage**: All credentials are stored locally in your `~/aem-instances.yaml` file and never transmitted to external services
- **Secure Communication**: The MCP server runs locally and communicates directly with your AEM instances using HTTPS

**Security Recommendations**:
- **Always use aliases instead of direct instance configuration** to keep credentials invisible to the LLM
- Store configuration file outside of version control
- Use service accounts with minimal required permissions
- Regularly rotate passwords for AEM service accounts

## Configuration

### Automatic Setup

The AEM MCP Server includes automatic first-run setup:
- Example configuration is automatically copied to `~/aem-instances.yaml` during installation
- No manual file creation needed - just install and configure your credentials
- Example configuration template available at `examples/aem-instances.example.yaml`

### Environment Variables

- `AEM_INSTANCES_CONFIG_PATH` - Path to AEM instances configuration file (default: `~/aem-instances.yaml`)

### Instance Configuration

The configuration file supports:
- Direct instance definitions with URL, username, and password
- Instance groups (aliases) for managing multiple instances
- Environment-based grouping (dev, staging, prod)

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

### Example 2: Memory Issues and Code Fix for Unclosed JCR Sessions

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

AI: "Found that the custom SearchService component has 1,247 unclosed sessions. Let me examine the code to identify the root cause."
[Reads the SearchService.java file]

AI: "I found the problem in your SearchService code. Here are the issues:

**Issues Found:**
1. Line 34: JCR Session opened but never closed in finally block
2. Line 52: ResourceResolver not properly closed
3. Line 78: Exception handling doesn't close sessions on error

Let me fix these issues:

// BEFORE (problematic code):
public void searchContent(String query) {
    Session session = repository.loginService("searchservice", null);
    ResourceResolver resolver = resolverFactory.getResourceResolver(authInfo);
    
    // Search logic here...
    QueryManager qm = session.getWorkspace().getQueryManager();
    Query q = qm.createQuery(query, Query.XPATH);
    // Sessions never closed - MEMORY LEAK!
}

// AFTER (fixed code):
public void searchContent(String query) {
    Session session = null;
    ResourceResolver resolver = null;
    
    try {
        session = repository.loginService("searchservice", null);
        resolver = resolverFactory.getResourceResolver(authInfo);
        
        // Search logic here...
        QueryManager qm = session.getWorkspace().getQueryManager();
        Query q = qm.createQuery(query, Query.JCR_SQL2); // Also improved query type
        
    } catch (Exception e) {
        log.error("Search failed", e);
    } finally {
        if (resolver != null && resolver.isLive()) {
            resolver.close();
        }
        if (session != null && session.isLive()) {
            session.logout();
        }
    }
}


Now let me restart the component to apply these changes and clear existing leaked sessions."
[Uses aem_component_disable then aem_component_enable]

AI: "Component restarted successfully. Let me monitor the system to confirm the fix worked."
[Uses aem_health_check and aem_logs_search to verify improvements]

AI: "Excellent! Memory usage dropped from 89% to 42%. No more 'CacheManager: resizeAll' warnings appearing. Your SearchService now properly manages JCR resources and won't leak memory."
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

## License

MIT

## Author

[Arkadiusz Rosiak](https://www.linkedin.com/in/arkadiusz-rosiak-aem/)