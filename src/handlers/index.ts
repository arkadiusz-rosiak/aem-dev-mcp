import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { handleHealthCheck, healthCheckTool } from './health-check.js';
import { handleGroovyExecute, groovyExecuteTool } from './groovy-execute.js';
import { 
  handleBundleList, 
  handleBundleStart,
  handleBundleStop,
  handleBundleRefresh,
  handleBundleUninstall,
  handleBundleRestart,
  handleBundleDetails,
  bundleListTool,
  bundleStartTool,
  bundleStopTool,
  bundleRefreshTool,
  bundleUninstallTool,
  bundleRestartTool,
  bundleDetailsTool
} from './bundle-management.js';
import { 
  handleComponentList, 
  handleComponentEnable,
  handleComponentDisable,
  handleComponentDetails,
  componentListTool,
  componentEnableTool,
  componentDisableTool,
  componentDetailsTool
} from './component-management.js';
import { 
  handleConfigurationList, 
  handleConfigurationGet, 
  handleConfigurationCreate,
  handleConfigurationUpdate,
  handleConfigurationDelete,
  handleConfigurationUnbind,
  configurationListTool,
  configurationGetTool,
  configurationCreateTool,
  configurationUpdateTool,
  configurationDeleteTool,
  configurationUnbindTool
} from './configuration-management.js';
import {
  handleUserProvisioning,
  handleUserDeprovisioning,
  handlePasswordReset,
  handleBulkUserUpdate,
  userProvisioningTool,
  userDeprovisioningTool,
  passwordResetTool,
  bulkUserUpdateTool
} from './user-management.js';
import {
  handleGroupSync,
  handlePermissionGrant,
  handleMembershipUpdate,
  groupSyncTool,
  permissionGrantTool,
  membershipUpdateTool
} from './group-management.js';
import {
  handleTrustStoreList,
  handleTrustStoreExport,
  handleTrustStoreSync,
  trustStoreListTool,
  trustStoreExportTool,
  trustStoreSyncTool
} from './trust-store-management.js';
import {
  handleAemLogsSearch,
  aemLogsSearchTool
} from './aem-logs.handler.js';
import { getDefaultLogger } from '@/utils/logger.js';
import { extractErrorMessage } from '@/utils/errors.js';

export function registerHandlers(server: Server, configPath: string): void {
  const logger = getDefaultLogger();
  const aliasResolver = new AliasResolver(configPath);
  const parallelExecutor = new ParallelExecutor();
  const httpClient = new AemHttpClient();
  
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        healthCheckTool,
        groovyExecuteTool,
        bundleListTool,
        bundleStartTool,
        bundleStopTool,
        bundleRefreshTool,
        bundleUninstallTool,
        bundleRestartTool,
        bundleDetailsTool,
        componentListTool,
        componentEnableTool,
        componentDisableTool,
        componentDetailsTool,
        configurationListTool,
        configurationGetTool,
        configurationCreateTool,
        configurationUpdateTool,
        configurationDeleteTool,
        configurationUnbindTool,
        userProvisioningTool,
        userDeprovisioningTool,
        passwordResetTool,
        bulkUserUpdateTool,
        groupSyncTool,
        permissionGrantTool,
        membershipUpdateTool,
        trustStoreListTool,
        trustStoreExportTool,
        trustStoreSyncTool,
        aemLogsSearchTool
      ]
    };
  });
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      let result;
      
      switch (name) {
        case 'aem_health_check':
          result = await handleHealthCheck(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_groovy_execute':
          result = await handleGroovyExecute(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_bundle_list':
          result = await handleBundleList(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_bundle_start':
          result = await handleBundleStart(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_bundle_stop':
          result = await handleBundleStop(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_bundle_refresh':
          result = await handleBundleRefresh(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_bundle_uninstall':
          result = await handleBundleUninstall(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_bundle_restart':
          result = await handleBundleRestart(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_bundle_details':
          result = await handleBundleDetails(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_component_list':
          result = await handleComponentList(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_component_enable':
          result = await handleComponentEnable(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_component_disable':
          result = await handleComponentDisable(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_component_details':
          result = await handleComponentDetails(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_configuration_list':
          result = await handleConfigurationList(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_configuration_get':
          result = await handleConfigurationGet(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_configuration_create':
          result = await handleConfigurationCreate(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_configuration_update':
          result = await handleConfigurationUpdate(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_configuration_delete':
          result = await handleConfigurationDelete(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_configuration_unbind':
          result = await handleConfigurationUnbind(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_user_provisioning':
          result = await handleUserProvisioning(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_user_deprovisioning':
          result = await handleUserDeprovisioning(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_password_reset':
          result = await handlePasswordReset(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_bulk_user_update':
          result = await handleBulkUserUpdate(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_group_sync':
          result = await handleGroupSync(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_permission_grant':
          result = await handlePermissionGrant(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_membership_update':
          result = await handleMembershipUpdate(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_trust_store_list':
          result = await handleTrustStoreList(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_trust_store_export':
          result = await handleTrustStoreExport(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_trust_store_sync':
          result = await handleTrustStoreSync(args, aliasResolver, parallelExecutor, httpClient);
          break;
        case 'aem_logs_search':
          result = await handleAemLogsSearch(args, aliasResolver, parallelExecutor, httpClient);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      
      return {
        content: result.content,
        isError: result.isError
      };
      
    } catch (error) {
      logger.error(extractErrorMessage(error), { 
        tool: name, 
        arguments: args,
        stack: error instanceof Error ? error.stack : undefined 
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: extractErrorMessage(error),
            tool: name
          })
        }],
        isError: true
      };
    }
  });
  
  server.onerror = (error) => {
    logger.error(extractErrorMessage(error), { 
      context: 'mcp-server',
      stack: error instanceof Error ? error.stack : undefined 
    });
  };
  
  const cleanup = async () => {
    await httpClient.cleanup();
  };
  
  (server as any).cleanup = cleanup;
}