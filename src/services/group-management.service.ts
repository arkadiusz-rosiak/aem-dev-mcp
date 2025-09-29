import { AemHttpClient } from './http-client.js';
import { ParallelExecutor } from './parallel-executor.js';
import { 
  AEMGroup, 
  ACLEntry,
  GroupOperationResult, 
  PermissionResult,
  MembershipResult,
  GroupSyncResult,
  ValidationResult
} from '@/types/security.types.js';
import { AEMInstance } from '@/types/instance.types.js';
import { getDefaultLogger } from '@/utils/logger.js';
import { extractErrorMessage } from '@/utils/errors.js';
import { AEMGroupSchema } from '@/schemas/security.schemas.js';

export class GroupManagementService {
  private readonly httpClient: AemHttpClient;
  private readonly parallelExecutor: ParallelExecutor;
  private readonly logger = getDefaultLogger();

  constructor(httpClient: AemHttpClient, parallelExecutor: ParallelExecutor) {
    this.httpClient = httpClient;
    this.parallelExecutor = parallelExecutor;
  }

  async createGroup(instance: AEMInstance, group: AEMGroup): Promise<GroupOperationResult> {
    try {
      const validation = this.validateGroupId(group.groupId);
      if (!validation.valid) {
        return {
          groupId: group.groupId,
          success: false,
          instanceUrl: instance.url,
          error: validation.errors.join(', ')
        };
      }

      const exists = await this.checkGroupExists(instance, group.groupId);
      if (exists) {
        return {
          groupId: group.groupId,
          success: false,
          instanceUrl: instance.url,
          error: 'Group already exists'
        };
      }

      if (group.nestedGroups && group.nestedGroups.length > 0) {
        const hasCircular = await this.detectCircularMembership(instance, group.groupId, group.nestedGroups);
        if (hasCircular) {
          return {
            groupId: group.groupId,
            success: false,
            instanceUrl: instance.url,
            error: 'Circular group membership detected'
          };
        }
      }

      const formData = new URLSearchParams();
      formData.append('createGroup', '');
      formData.append('authorizableId', group.groupId);
      if (group.displayName) {
        formData.append('profile/displayName', group.displayName);
      }
      if (group.description) {
        formData.append('profile/aboutMe', group.description);
      }

      const response = await this.httpClient.postForm(
        `${instance.url}/libs/granite/security/post/authorizables`,
        formData,
        {
          username: instance.username,
          password: instance.password
        }
      );

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.data}`);
      }

      if (group.members.length > 0) {
        await this.addMembersToGroup(instance, group.groupId, group.members);
      }

      if (group.nestedGroups && group.nestedGroups.length > 0) {
        await this.addNestedGroupsToGroup(instance, group.groupId, group.nestedGroups);
      }

      this.logger.info(`Group ${group.groupId} created successfully`, { 
        instanceUrl: instance.url,
        groupId: group.groupId 
      });

      return {
        groupId: group.groupId,
        success: true,
        instanceUrl: instance.url
      };

    } catch (error) {
      this.logger.error(`Failed to create group ${group.groupId}`, { 
        instanceUrl: instance.url,
        groupId: group.groupId,
        error: extractErrorMessage(error) 
      });

      return {
        groupId: group.groupId,
        success: false,
        instanceUrl: instance.url,
        error: extractErrorMessage(error)
      };
    }
  }

  async updateGroup(instance: AEMInstance, groupId: string, updates: Partial<AEMGroup>): Promise<GroupOperationResult> {
    try {
      const exists = await this.checkGroupExists(instance, groupId);
      if (!exists) {
        return {
          groupId,
          success: false,
          instanceUrl: instance.url,
          error: 'Group does not exist'
        };
      }

      const groupPath = `/home/groups/${groupId.charAt(0)}/${groupId}`;
      const formData = new URLSearchParams();

      if (updates.displayName !== undefined) {
        formData.append('profile/displayName', updates.displayName);
      }
      if (updates.description !== undefined) {
        formData.append('profile/aboutMe', updates.description);
      }

      const response = await this.httpClient.postForm(
        `${instance.url}${groupPath}.rw.html`,
        formData,
        {
          username: instance.username,
          password: instance.password
        }
      );

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.data}`);
      }

      this.logger.info(`Group ${groupId} updated successfully`, { 
        instanceUrl: instance.url,
        groupId 
      });

      return {
        groupId,
        success: true,
        instanceUrl: instance.url
      };

    } catch (error) {
      this.logger.error(`Failed to update group ${groupId}`, { 
        instanceUrl: instance.url,
        groupId,
        error: extractErrorMessage(error) 
      });

      return {
        groupId,
        success: false,
        instanceUrl: instance.url,
        error: extractErrorMessage(error)
      };
    }
  }

  async deleteGroup(instance: AEMInstance, groupId: string): Promise<GroupOperationResult> {
    try {
      const exists = await this.checkGroupExists(instance, groupId);
      if (!exists) {
        return {
          groupId,
          success: false,
          instanceUrl: instance.url,
          error: 'Group does not exist'
        };
      }

      const formData = new URLSearchParams();
      formData.append('deleteAuthorizable', '');

      const response = await this.httpClient.postForm(
        `${instance.url}/libs/granite/security/post/authorizables`,
        formData,
        {
          username: instance.username,
          password: instance.password
        }
      );

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.data}`);
      }

      this.logger.info(`Group ${groupId} deleted successfully`, { 
        instanceUrl: instance.url,
        groupId 
      });

      return {
        groupId,
        success: true,
        instanceUrl: instance.url
      };

    } catch (error) {
      this.logger.error(`Failed to delete group ${groupId}`, { 
        instanceUrl: instance.url,
        groupId,
        error: extractErrorMessage(error) 
      });

      return {
        groupId,
        success: false,
        instanceUrl: instance.url,
        error: extractErrorMessage(error)
      };
    }
  }

  async setGroupPermissions(instance: AEMInstance, groupId: string, permissions: ACLEntry[]): Promise<PermissionResult> {
    try {
      const exists = await this.checkGroupExists(instance, groupId);
      if (!exists) {
        return {
          groupId,
          path: '',
          success: false,
          instanceUrl: instance.url,
          error: 'Group does not exist'
        };
      }

      for (const permission of permissions) {
        await this.setACLEntry(instance, permission);
      }

      this.logger.info(`Permissions set for group ${groupId}`, { 
        instanceUrl: instance.url,
        groupId,
        permissionCount: permissions.length 
      });

      return {
        groupId,
        path: permissions.length > 0 ? permissions[0].path : '',
        success: true,
        instanceUrl: instance.url
      };

    } catch (error) {
      this.logger.error(`Failed to set permissions for group ${groupId}`, { 
        instanceUrl: instance.url,
        groupId,
        error: extractErrorMessage(error) 
      });

      return {
        groupId,
        path: '',
        success: false,
        instanceUrl: instance.url,
        error: extractErrorMessage(error)
      };
    }
  }

  async getEffectivePermissions(instance: AEMInstance, groupId: string, path: string): Promise<string[]> {
    try {
      const response = await this.httpClient.get(
        `${instance.url}${path}.privileges.json?principal=${encodeURIComponent(groupId)}`,
        {
          username: instance.username,
          password: instance.password
        }
      );

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.data}`);
      }

      const data = response.data;
      return Array.isArray(data.privileges) ? data.privileges : [];

    } catch (error) {
      this.logger.warn(`Failed to get effective permissions for group ${groupId} at path ${path}`, { 
        instanceUrl: instance.url,
        groupId,
        path,
        error: extractErrorMessage(error) 
      });
      return [];
    }
  }

  async syncGroupMembership(instance: AEMInstance, groupId: string, userIds: string[]): Promise<MembershipResult> {
    try {
      const exists = await this.checkGroupExists(instance, groupId);
      if (!exists) {
        return {
          groupId,
          success: false,
          instanceUrl: instance.url,
          addedUsers: [],
          removedUsers: [],
          error: 'Group does not exist'
        };
      }

      const currentMembers = await this.getGroupMembers(instance, groupId);
      const toAdd = userIds.filter(userId => !currentMembers.includes(userId));
      const toRemove = currentMembers.filter(userId => !userIds.includes(userId));

      if (toAdd.length > 0) {
        await this.addMembersToGroup(instance, groupId, toAdd);
      }

      if (toRemove.length > 0) {
        await this.removeMembersFromGroup(instance, groupId, toRemove);
      }

      this.logger.info(`Group membership synchronized for ${groupId}`, { 
        instanceUrl: instance.url,
        groupId,
        addedUsers: toAdd,
        removedUsers: toRemove 
      });

      return {
        groupId,
        success: true,
        instanceUrl: instance.url,
        addedUsers: toAdd,
        removedUsers: toRemove
      };

    } catch (error) {
      this.logger.error(`Failed to sync membership for group ${groupId}`, { 
        instanceUrl: instance.url,
        groupId,
        error: extractErrorMessage(error) 
      });

      return {
        groupId,
        success: false,
        instanceUrl: instance.url,
        addedUsers: [],
        removedUsers: [],
        error: extractErrorMessage(error)
      };
    }
  }

  async detectCircularMembership(instance: AEMInstance, groupId: string, potentialNestedGroups?: string[]): Promise<boolean> {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const checkCircular = async (currentGroupId: string): Promise<boolean> => {
      if (stack.has(currentGroupId)) {
        return true;
      }

      if (visited.has(currentGroupId)) {
        return false;
      }

      visited.add(currentGroupId);
      stack.add(currentGroupId);

      const nestedGroups = potentialNestedGroups && currentGroupId === groupId ? 
        potentialNestedGroups : 
        await this.getNestedGroups(instance, currentGroupId);

      for (const nestedGroupId of nestedGroups) {
        if (await checkCircular(nestedGroupId)) {
          return true;
        }
      }

      stack.delete(currentGroupId);
      return false;
    };

    return checkCircular(groupId);
  }

  async syncGroupsAcrossInstances(sourceInstance: AEMInstance, targetInstances: AEMInstance[], groupIds: string[]): Promise<Record<string, GroupSyncResult>> {
    const operations = targetInstances.map(targetInstance => ({
      key: targetInstance.url,
      operation: async (): Promise<GroupSyncResult> => {
        const results: GroupSyncResult[] = [];

        for (const groupId of groupIds) {
          try {
            const sourceGroup = await this.getGroupDetails(sourceInstance, groupId);
            if (!sourceGroup) {
              results.push({
                groupId,
                success: false,
                sourceInstanceUrl: sourceInstance.url,
                targetInstanceUrl: targetInstance.url,
                syncedMembers: [],
                syncedPermissions: 0,
                error: 'Source group not found'
              });
              continue;
            }

            const targetExists = await this.checkGroupExists(targetInstance, groupId);
            if (!targetExists) {
              await this.createGroup(targetInstance, sourceGroup);
            } else {
              await this.updateGroup(targetInstance, groupId, {
                displayName: sourceGroup.displayName,
                description: sourceGroup.description
              });
            }

            await this.syncGroupMembership(targetInstance, groupId, sourceGroup.members);

            results.push({
              groupId,
              success: true,
              sourceInstanceUrl: sourceInstance.url,
              targetInstanceUrl: targetInstance.url,
              syncedMembers: sourceGroup.members,
              syncedPermissions: sourceGroup.permissions.length
            });

          } catch (error) {
            results.push({
              groupId,
              success: false,
              sourceInstanceUrl: sourceInstance.url,
              targetInstanceUrl: targetInstance.url,
              syncedMembers: [],
              syncedPermissions: 0,
              error: extractErrorMessage(error)
            });
          }
        }

        return results[0] || {
          groupId: '',
          success: false,
          sourceInstanceUrl: sourceInstance.url,
          targetInstanceUrl: targetInstance.url,
          syncedMembers: [],
          syncedPermissions: 0,
          error: 'No groups to sync'
        };
      }
    }));

    return this.parallelExecutor.executeInParallel(operations);
  }

  private validateGroupId(groupId: string): ValidationResult {
    const result = AEMGroupSchema.pick({ groupId: true }).safeParse({ groupId });
    
    if (result.success) {
      return { valid: true, errors: [], warnings: [] };
    }

    return {
      valid: false,
      errors: result.error.issues.map(issue => issue.message),
      warnings: []
    };
  }

  private async checkGroupExists(instance: AEMInstance, groupId: string): Promise<boolean> {
    try {
      const response = await this.httpClient.get(
        `${instance.url}/bin/security/authorizables.json?query=${encodeURIComponent(groupId)}&type=groups`,
        {
          username: instance.username,
          password: instance.password
        }
      );

      if (response.status >= 400) {
        return false;
      }

      const data = response.data;
      return Array.isArray(data.authorizables) && 
             data.authorizables.some((group: any) => group.id === groupId);

    } catch (_error) {
      return false;
    }
  }

  private async getGroupDetails(instance: AEMInstance, groupId: string): Promise<AEMGroup | null> {
    try {
      const response = await this.httpClient.get(
        `${instance.url}/home/groups/${groupId.charAt(0)}/${groupId}.json`,
        {
          username: instance.username,
          password: instance.password
        }
      );

      if (response.status >= 400) {
        return null;
      }

      const data = response.data;
      const members = await this.getGroupMembers(instance, groupId);

      return {
        groupId,
        displayName: data.profile?.displayName,
        description: data.profile?.aboutMe,
        members,
        permissions: [],
        nestedGroups: []
      };

    } catch (_error) {
      return null;
    }
  }

  async getGroupMembers(instance: AEMInstance, groupId: string): Promise<string[]> {
    try {
      const response = await this.httpClient.get(
        `${instance.url}/home/groups/${groupId.charAt(0)}/${groupId}.members.json`,
        {
          username: instance.username,
          password: instance.password
        }
      );

      if (response.status >= 400) {
        return [];
      }

      const data = response.data;
      return Array.isArray(data.members) ? data.members.map((member: any) => member.id) : [];

    } catch (_error) {
      return [];
    }
  }

  private async getNestedGroups(instance: AEMInstance, groupId: string): Promise<string[]> {
    try {
      const response = await this.httpClient.get(
        `${instance.url}/home/groups/${groupId.charAt(0)}/${groupId}.memberOf.json`,
        {
          username: instance.username,
          password: instance.password
        }
      );

      if (response.status >= 400) {
        return [];
      }

      const data = response.data;
      return Array.isArray(data.memberOf) ? 
        data.memberOf.filter((group: any) => group.type === 'group').map((group: any) => group.id) : 
        [];

    } catch (_error) {
      return [];
    }
  }

  private async addMembersToGroup(instance: AEMInstance, groupId: string, userIds: string[]): Promise<void> {
    const formData = new URLSearchParams();
    formData.append('addMembers', userIds.join(','));

    await this.httpClient.postForm(
      `${instance.url}/home/groups/${groupId.charAt(0)}/${groupId}.rw.html`,
      formData,
      {
        username: instance.username,
        password: instance.password
      }
    );
  }

  private async removeMembersFromGroup(instance: AEMInstance, groupId: string, userIds: string[]): Promise<void> {
    const formData = new URLSearchParams();
    formData.append('removeMembers', userIds.join(','));

    await this.httpClient.postForm(
      `${instance.url}/home/groups/${groupId.charAt(0)}/${groupId}.rw.html`,
      formData,
      {
        username: instance.username,
        password: instance.password
      }
    );
  }

  private async addNestedGroupsToGroup(instance: AEMInstance, groupId: string, nestedGroupIds: string[]): Promise<void> {
    for (const nestedGroupId of nestedGroupIds) {
      const formData = new URLSearchParams();
      formData.append('addMembers', nestedGroupId);

      await this.httpClient.postForm(
        `${instance.url}/home/groups/${groupId.charAt(0)}/${groupId}.rw.html`,
        formData,
        {
          username: instance.username,
          password: instance.password
        }
      );
    }
  }

  private async setACLEntry(instance: AEMInstance, aclEntry: ACLEntry): Promise<void> {
    const formData = new URLSearchParams();
    formData.append('principalId', aclEntry.principal);
    
    for (const privilege of aclEntry.privileges) {
      const privilegeKey = `privilege@${privilege}`;
      formData.append(privilegeKey, aclEntry.allow ? 'granted' : 'denied');
    }

    if (aclEntry.restrictions) {
      for (const [key, value] of Object.entries(aclEntry.restrictions)) {
        formData.append(`restriction@${key}`, value);
      }
    }

    await this.httpClient.postForm(
      `${instance.url}${aclEntry.path}.modifyAce.html`,
      formData,
      {
        username: instance.username,
        password: instance.password
      }
    );
  }
}