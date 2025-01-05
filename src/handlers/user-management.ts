import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { UserManagementService } from '@/services/user-management.service.js';
import { 
  UserProvisioningRequestSchema, 
  UserDeprovisioningRequestSchema,
  PasswordResetRequestSchema,
  BulkUserUpdateRequestSchema
} from '@/schemas/security.schemas.js';
import { 
  UserProvisioningRequest, 
  UserDeprovisioningRequest,
  PasswordResetRequest,
  BulkUserUpdateRequest,
  UserOperationResult,
  PasswordResetResult
} from '@/types/security.types.js';
import { McpToolResponse } from '@/types/mcp.types.js';
import { getDefaultLogger } from '@/utils/logger.js';
import { extractErrorMessage } from '@/utils/errors.js';

const logger = getDefaultLogger();

export async function handleUserProvisioning(
  args: unknown, 
  aliasResolver: AliasResolver, 
  parallelExecutor: ParallelExecutor, 
  httpClient: AemHttpClient
): Promise<McpToolResponse> {
  try {
    const request = UserProvisioningRequestSchema.parse(args) as UserProvisioningRequest;
    const userService = new UserManagementService(httpClient, parallelExecutor);
    
    const instances = await aliasResolver.resolveInstances(request.instances);
    const results: Record<string, UserOperationResult[]> = {};

    const operations = instances.map(instance => ({
      key: instance.url,
      operation: async () => {
        const userResults: UserOperationResult[] = [];
        
        for (const user of request.users) {
          const password = request.generatePasswords ? 
            userService.generateSecurePassword(request.passwordPolicy || userService.createPasswordPolicy()) : 
            undefined;
            
          const result = await userService.createUser(instance, user, password);
          userResults.push(result);
        }
        
        return userResults;
      }
    }));

    const parallelResults = await parallelExecutor.executeInParallel(operations);
    
    for (const [instanceUrl, userResults] of Object.entries(parallelResults)) {
      results[instanceUrl] = userResults;
    }

    const totalUsers = Object.values(results).flat().length;
    const successfulUsers = Object.values(results).flat().filter(r => r.success).length;

    logger.info('User provisioning completed', { 
      totalInstances: instances.length,
      totalUsers,
      successfulUsers,
      failedUsers: totalUsers - successfulUsers
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          results,
          summary: {
            totalInstances: instances.length,
            totalUsers,
            successfulUsers,
            failedUsers: totalUsers - successfulUsers
          }
        }, null, 2)
      }],
      isError: false
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    logger.error('User provisioning failed', { error: errorMessage });

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

export async function handleUserDeprovisioning(
  args: unknown, 
  aliasResolver: AliasResolver, 
  parallelExecutor: ParallelExecutor, 
  httpClient: AemHttpClient
): Promise<McpToolResponse> {
  try {
    const request = UserDeprovisioningRequestSchema.parse(args) as UserDeprovisioningRequest;
    const userService = new UserManagementService(httpClient, parallelExecutor);
    
    const instances = await aliasResolver.resolveInstances(request.instances);
    const results: Record<string, UserOperationResult[]> = {};

    const operations = instances.map(instance => ({
      key: instance.url,
      operation: async () => {
        const userResults: UserOperationResult[] = [];
        
        for (const userId of request.userIds) {
          const result = request.disableOnly ? 
            await userService.disableUser(instance, userId) :
            await userService.deleteUser(instance, userId);
          userResults.push(result);
        }
        
        return userResults;
      }
    }));

    const parallelResults = await parallelExecutor.executeInParallel(operations);
    
    for (const [instanceUrl, userResults] of Object.entries(parallelResults)) {
      results[instanceUrl] = userResults;
    }

    const totalUsers = Object.values(results).flat().length;
    const successfulUsers = Object.values(results).flat().filter(r => r.success).length;

    logger.info('User deprovisioning completed', { 
      totalInstances: instances.length,
      totalUsers,
      successfulUsers,
      failedUsers: totalUsers - successfulUsers,
      disableOnly: request.disableOnly
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          results,
          summary: {
            totalInstances: instances.length,
            totalUsers,
            successfulUsers,
            failedUsers: totalUsers - successfulUsers,
            action: request.disableOnly ? 'disabled' : 'deleted'
          }
        }, null, 2)
      }],
      isError: false
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    logger.error('User deprovisioning failed', { error: errorMessage });

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

export async function handlePasswordReset(
  args: unknown, 
  aliasResolver: AliasResolver, 
  parallelExecutor: ParallelExecutor, 
  httpClient: AemHttpClient
): Promise<McpToolResponse> {
  try {
    const request = PasswordResetRequestSchema.parse(args) as PasswordResetRequest;
    const userService = new UserManagementService(httpClient, parallelExecutor);
    
    const instances = await aliasResolver.resolveInstances(request.instances);
    const results: Record<string, PasswordResetResult[]> = {};

    const operations = instances.map(instance => ({
      key: instance.url,
      operation: async () => {
        const resetResults: PasswordResetResult[] = [];
        
        for (const userId of request.userIds) {
          const result = await userService.resetPassword(
            instance, 
            userId, 
            undefined, 
            request.passwordPolicy
          );
          
          if (result.success && request.forceChange) {
            await userService.enforcePasswordChange(instance, userId);
          }
          
          resetResults.push(result);
        }
        
        return resetResults;
      }
    }));

    const parallelResults = await parallelExecutor.executeInParallel(operations);
    
    for (const [instanceUrl, resetResults] of Object.entries(parallelResults)) {
      results[instanceUrl] = resetResults;
    }

    const totalResets = Object.values(results).flat().length;
    const successfulResets = Object.values(results).flat().filter(r => r.success).length;

    logger.info('Password reset completed', { 
      totalInstances: instances.length,
      totalResets,
      successfulResets,
      failedResets: totalResets - successfulResets
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          results,
          summary: {
            totalInstances: instances.length,
            totalResets,
            successfulResets,
            failedResets: totalResets - successfulResets,
            forceChange: request.forceChange || false
          }
        }, null, 2)
      }],
      isError: false
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    logger.error('Password reset failed', { error: errorMessage });

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

export async function handleBulkUserUpdate(
  args: unknown, 
  aliasResolver: AliasResolver, 
  parallelExecutor: ParallelExecutor, 
  httpClient: AemHttpClient
): Promise<McpToolResponse> {
  try {
    const request = BulkUserUpdateRequestSchema.parse(args) as BulkUserUpdateRequest;
    const userService = new UserManagementService(httpClient, parallelExecutor);
    
    const instances = await aliasResolver.resolveInstances(request.instances);
    const results: Record<string, UserOperationResult[]> = {};

    const operations = instances.map(instance => ({
      key: instance.url,
      operation: async () => {
        const updateResults: UserOperationResult[] = [];
        
        for (const update of request.updates) {
          const result = await userService.updateUser(instance, update.userId, update.changes);
          updateResults.push(result);
        }
        
        return updateResults;
      }
    }));

    const parallelResults = await parallelExecutor.executeInParallel(operations);
    
    for (const [instanceUrl, updateResults] of Object.entries(parallelResults)) {
      results[instanceUrl] = updateResults;
    }

    const totalUpdates = Object.values(results).flat().length;
    const successfulUpdates = Object.values(results).flat().filter(r => r.success).length;

    logger.info('Bulk user update completed', { 
      totalInstances: instances.length,
      totalUpdates,
      successfulUpdates,
      failedUpdates: totalUpdates - successfulUpdates
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          results,
          summary: {
            totalInstances: instances.length,
            totalUpdates,
            successfulUpdates,
            failedUpdates: totalUpdates - successfulUpdates
          }
        }, null, 2)
      }],
      isError: false
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    logger.error('Bulk user update failed', { error: errorMessage });

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

export const userProvisioningTool = {
  name: 'aem_user_provisioning',
  description: 'Provision users across multiple AEM instances with parallel execution',
  inputSchema: {
    type: 'object',
    properties: {
      instances: {
        type: 'array',
        items: { type: 'string' },
        description: 'AEM instance URLs or aliases'
      },
      users: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'Unique user identifier' },
            profile: {
              type: 'object',
              properties: {
                givenName: { type: 'string' },
                familyName: { type: 'string' },
                email: { type: 'string' },
                jobTitle: { type: 'string' }
              }
            },
            groups: {
              type: 'array',
              items: { type: 'string' },
              description: 'Group IDs to assign to user'
            },
            disabled: { type: 'boolean', description: 'Whether user should be created as disabled' },
            passwordChangeRequired: { type: 'boolean', description: 'Whether user must change password on first login' }
          },
          required: ['userId']
        },
        description: 'Users to provision'
      },
      generatePasswords: { type: 'boolean', description: 'Whether to generate secure passwords' },
      notifyUsers: { type: 'boolean', description: 'Whether to notify users (not implemented)' },
      passwordPolicy: {
        type: 'object',
        description: 'Password policy to apply when generating passwords'
      }
    },
    required: ['instances', 'users']
  }
} as const;

export const userDeprovisioningTool = {
  name: 'aem_user_deprovisioning',
  description: 'Deprovision users from multiple AEM instances',
  inputSchema: {
    type: 'object',
    properties: {
      instances: {
        type: 'array',
        items: { type: 'string' },
        description: 'AEM instance URLs or aliases'
      },
      userIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'User IDs to deprovision'
      },
      disableOnly: { type: 'boolean', description: 'Whether to only disable users instead of deleting them' }
    },
    required: ['instances', 'userIds']
  }
} as const;

export const passwordResetTool = {
  name: 'aem_password_reset',
  description: 'Reset user passwords across multiple AEM instances',
  inputSchema: {
    type: 'object',
    properties: {
      instances: {
        type: 'array',
        items: { type: 'string' },
        description: 'AEM instance URLs or aliases'
      },
      userIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'User IDs to reset passwords for'
      },
      generatePasswords: { type: 'boolean', description: 'Whether to generate new passwords' },
      passwordPolicy: {
        type: 'object',
        description: 'Password policy to apply when generating passwords'
      },
      forceChange: { type: 'boolean', description: 'Whether to force password change on next login' }
    },
    required: ['instances', 'userIds']
  }
} as const;

export const bulkUserUpdateTool = {
  name: 'aem_bulk_user_update',
  description: 'Update multiple users across multiple AEM instances',
  inputSchema: {
    type: 'object',
    properties: {
      instances: {
        type: 'array',
        items: { type: 'string' },
        description: 'AEM instance URLs or aliases'
      },
      updates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User ID to update' },
            changes: {
              type: 'object',
              description: 'Changes to apply to the user'
            }
          },
          required: ['userId', 'changes']
        },
        description: 'User updates to apply'
      }
    },
    required: ['instances', 'updates']
  }
} as const;