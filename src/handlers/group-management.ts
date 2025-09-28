import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { GroupManagementService } from '@/services/group-management.service.js';
import {
  GroupSyncRequestSchema,
  PermissionGrantRequestSchema,
  MembershipUpdateRequestSchema
} from '@/schemas/security.schemas.js';
import {
  GroupSyncRequest,
  PermissionGrantRequest,
  MembershipUpdateRequest,
  PermissionResult,
  MembershipResult
} from '@/types/security.types.js';
import { MCPToolResult, AEMInstance } from '@/types/index.js';
import { getDefaultLogger } from '@/utils/logger.js';
import { extractErrorMessage } from '@/utils/errors.js';

const logger = getDefaultLogger();

async function resolveInstances(
  instances: string[],
  resolver: AliasResolver
): Promise<AEMInstance[]> {
  const resolvedInstances: AEMInstance[] = [];

  for (const instance of instances) {
    // Try to parse as URL (direct instance)
    try {
      new URL(instance);
      // If it's a valid URL, treat as direct instance - but we need credentials
      // For now, assume it's an alias if it's just a string
      const result = await resolver.resolveAlias(instance);
      if (result.resolved) {
        resolvedInstances.push(...result.instances);
      }
    } catch {
      // Not a valid URL, treat as alias
      const result = await resolver.resolveAlias(instance);
      if (result.resolved) {
        resolvedInstances.push(...result.instances);
      }
    }
  }

  return resolvedInstances;
}

export async function handleGroupSync(
  args: unknown, 
  aliasResolver: AliasResolver, 
  parallelExecutor: ParallelExecutor, 
  httpClient: AemHttpClient
): Promise<MCPToolResult> {
  try {
    const request = GroupSyncRequestSchema.parse(args) as GroupSyncRequest;
    const groupService = new GroupManagementService(httpClient, parallelExecutor);

    const sourceInstances = await resolveInstances([request.sourceInstance], aliasResolver);
    const targetInstances = await resolveInstances(request.targetInstances, aliasResolver);
    
    if (sourceInstances.length === 0) {
      throw new Error('Source instance not found');
    }
    
    const sourceInstance = sourceInstances[0];
    
    const results = await groupService.syncGroupsAcrossInstances(
      sourceInstance, 
      targetInstances, 
      request.groupIds
    );

    const totalSyncs = Object.values(results).length;
    const successfulSyncs = Object.values(results).filter(r => r.success).length;

    logger.info('Group sync completed', { 
      sourceInstance: sourceInstance.url,
      targetInstances: targetInstances.length,
      groupCount: request.groupIds.length,
      totalSyncs,
      successfulSyncs,
      failedSyncs: totalSyncs - successfulSyncs
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          results,
          summary: {
            sourceInstance: sourceInstance.url,
            targetInstances: targetInstances.length,
            groupCount: request.groupIds.length,
            totalSyncs,
            successfulSyncs,
            failedSyncs: totalSyncs - successfulSyncs
          }
        }, null, 2)
      }],
      isError: false
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    logger.error('Group sync failed', { error: errorMessage });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: errorMessage
        })
      }],
      isError: true
    };
  }
}

export async function handlePermissionGrant(
  args: unknown, 
  aliasResolver: AliasResolver, 
  parallelExecutor: ParallelExecutor, 
  httpClient: AemHttpClient
): Promise<MCPToolResult> {
  try {
    const request = PermissionGrantRequestSchema.parse(args) as PermissionGrantRequest;
    const groupService = new GroupManagementService(httpClient, parallelExecutor);

    const instances = await resolveInstances(request.instances, aliasResolver);
    const results: Record<string, PermissionResult[]> = {};

    const operations = instances.map((instance: AEMInstance) => ({
      key: instance.url,
      operation: async () => {
        const permissionResults: PermissionResult[] = [];
        
        for (const permission of request.permissions) {
          const aclEntries = [{
            principal: permission.groupId,
            path: permission.path,
            privileges: permission.privileges,
            allow: permission.allow
          }];
          
          const result = await groupService.setGroupPermissions(instance, permission.groupId, aclEntries);
          permissionResults.push(result);
        }
        
        return permissionResults;
      }
    }));

    const parallelResults = await parallelExecutor.executeInParallel(operations);

    for (const [instanceUrl, permissionResults] of Object.entries(parallelResults)) {
      results[instanceUrl] = permissionResults as PermissionResult[];
    }

    const totalPermissions = Object.values(results).flat().length;
    const successfulPermissions = Object.values(results).flat().filter(r => r.success).length;

    logger.info('Permission grant completed', { 
      totalInstances: instances.length,
      totalPermissions,
      successfulPermissions,
      failedPermissions: totalPermissions - successfulPermissions
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          results,
          summary: {
            totalInstances: instances.length,
            totalPermissions,
            successfulPermissions,
            failedPermissions: totalPermissions - successfulPermissions
          }
        }, null, 2)
      }],
      isError: false
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    logger.error('Permission grant failed', { error: errorMessage });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: errorMessage
        })
      }],
      isError: true
    };
  }
}

export async function handleMembershipUpdate(
  args: unknown, 
  aliasResolver: AliasResolver, 
  parallelExecutor: ParallelExecutor, 
  httpClient: AemHttpClient
): Promise<MCPToolResult> {
  try {
    const request = MembershipUpdateRequestSchema.parse(args) as MembershipUpdateRequest;
    const groupService = new GroupManagementService(httpClient, parallelExecutor);

    const instances = await resolveInstances(request.instances, aliasResolver);
    const results: Record<string, MembershipResult[]> = {};

    const operations = instances.map((instance: AEMInstance) => ({
      key: instance.url,
      operation: async () => {
        const membershipResults: MembershipResult[] = [];
        
        for (const operation of request.operations) {
          let result: MembershipResult;
          
          if (operation.action === 'add') {
            const currentMembers = await groupService.getGroupMembers(instance, operation.groupId) || [];
            const newMembers = [...new Set([...currentMembers, ...operation.userIds])];
            result = await groupService.syncGroupMembership(instance, operation.groupId, newMembers);
          } else {
            const currentMembers = await groupService.getGroupMembers(instance, operation.groupId) || [];
            const filteredMembers = currentMembers.filter(userId => !operation.userIds.includes(userId));
            result = await groupService.syncGroupMembership(instance, operation.groupId, filteredMembers);
          }
          
          membershipResults.push(result);
        }
        
        return membershipResults;
      }
    }));

    const parallelResults = await parallelExecutor.executeInParallel(operations);

    for (const [instanceUrl, membershipResults] of Object.entries(parallelResults)) {
      results[instanceUrl] = membershipResults as MembershipResult[];
    }

    const totalOperations = Object.values(results).flat().length;
    const successfulOperations = Object.values(results).flat().filter(r => r.success).length;

    logger.info('Membership update completed', { 
      totalInstances: instances.length,
      totalOperations,
      successfulOperations,
      failedOperations: totalOperations - successfulOperations
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          results,
          summary: {
            totalInstances: instances.length,
            totalOperations,
            successfulOperations,
            failedOperations: totalOperations - successfulOperations
          }
        }, null, 2)
      }],
      isError: false
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    logger.error('Membership update failed', { error: errorMessage });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: errorMessage
        })
      }],
      isError: true
    };
  }
}

export const groupSyncTool = {
  name: 'aem_group_sync',
  description: 'Synchronize groups from source instance to target instances',
  inputSchema: {
    type: 'object',
    properties: {
      sourceInstance: { type: 'string', description: 'Source AEM instance URL or alias' },
      targetInstances: {
        type: 'array',
        items: { type: 'string' },
        description: 'Target AEM instance URLs or aliases'
      },
      groupIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Group IDs to synchronize'
      },
      syncMembers: { type: 'boolean', description: 'Whether to sync group members' },
      syncPermissions: { type: 'boolean', description: 'Whether to sync group permissions' }
    },
    required: ['sourceInstance', 'targetInstances', 'groupIds']
  }
} as const;

export const permissionGrantTool = {
  name: 'aem_permission_grant',
  description: 'Grant permissions to groups across multiple AEM instances',
  inputSchema: {
    type: 'object',
    properties: {
      instances: {
        type: 'array',
        items: { type: 'string' },
        description: 'AEM instance URLs or aliases'
      },
      permissions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            groupId: { type: 'string', description: 'Group ID to grant permissions to' },
            path: { type: 'string', description: 'Content path for permissions' },
            privileges: {
              type: 'array',
              items: { 
                type: 'string',
                enum: ['read', 'write', 'delete', 'acl_read', 'acl_edit', 'replicate']
              },
              description: 'Privileges to grant'
            },
            allow: { type: 'boolean', description: 'Whether to allow or deny the privileges' }
          },
          required: ['groupId', 'path', 'privileges', 'allow']
        },
        description: 'Permissions to grant'
      }
    },
    required: ['instances', 'permissions']
  }
} as const;

export const membershipUpdateTool = {
  name: 'aem_membership_update',
  description: 'Update group memberships across multiple AEM instances',
  inputSchema: {
    type: 'object',
    properties: {
      instances: {
        type: 'array',
        items: { type: 'string' },
        description: 'AEM instance URLs or aliases'
      },
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            groupId: { type: 'string', description: 'Group ID to update membership for' },
            userIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'User IDs to add or remove'
            },
            action: {
              type: 'string',
              enum: ['add', 'remove'],
              description: 'Whether to add or remove users from group'
            }
          },
          required: ['groupId', 'userIds', 'action']
        },
        description: 'Membership operations to perform'
      }
    },
    required: ['instances', 'operations']
  }
} as const;