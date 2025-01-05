import crypto from 'crypto';
import { AemHttpClient } from './http-client.js';
import { ParallelExecutor } from './parallel-executor.js';
import { 
  AEMUser, 
  UserOperationResult, 
  PasswordPolicy, 
  UserSyncOptions, 
  ValidationResult,
  PasswordResetResult,
  createPasswordPolicy
} from '@/types/security.types.js';
import { AEMInstance } from '@/types/instance.types.js';
import { getDefaultLogger } from '@/utils/logger.js';
import { extractErrorMessage } from '@/utils/errors.js';
import { AEMUserSchema } from '@/schemas/security.schemas.js';

export class UserManagementService {
  private readonly httpClient: AemHttpClient;
  private readonly parallelExecutor: ParallelExecutor;
  private readonly logger = getDefaultLogger();

  constructor(httpClient: AemHttpClient, parallelExecutor: ParallelExecutor) {
    this.httpClient = httpClient;
    this.parallelExecutor = parallelExecutor;
  }

  async createUser(instance: AEMInstance, user: AEMUser, password?: string): Promise<UserOperationResult> {
    try {
      const validation = this.validateUsername(user.userId);
      if (!validation.valid) {
        return {
          userId: user.userId,
          success: false,
          instanceUrl: instance.url,
          error: validation.errors.join(', ')
        };
      }

      const exists = await this.checkUserExists(instance, user.userId);
      if (exists) {
        return {
          userId: user.userId,
          success: false,
          instanceUrl: instance.url,
          error: 'User already exists'
        };
      }

      const userPassword = password || this.generateSecurePassword(createPasswordPolicy());
      
      const formData = new URLSearchParams();
      formData.append('createUser', '');
      formData.append('authorizableId', user.userId);
      formData.append('profile/givenName', user.profile.givenName || '');
      formData.append('profile/familyName', user.profile.familyName || '');
      formData.append('profile/email', user.profile.email || '');
      formData.append('profile/jobTitle', user.profile.jobTitle || '');
      formData.append('pwd', userPassword);
      formData.append('pwdConfirm', userPassword);

      if (user.disabled) {
        formData.append('profile/disabledReason', 'Created as disabled');
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

      if (user.groups.length > 0) {
        await this.addUserToGroups(instance, user.userId, user.groups);
      }

      this.logger.info(`User ${user.userId} created successfully`, { 
        instanceUrl: instance.url,
        userId: user.userId 
      });

      return {
        userId: user.userId,
        success: true,
        instanceUrl: instance.url,
        generatedPassword: password ? undefined : userPassword
      };

    } catch (error) {
      this.logger.error(`Failed to create user ${user.userId}`, { 
        instanceUrl: instance.url,
        userId: user.userId,
        error: extractErrorMessage(error) 
      });

      return {
        userId: user.userId,
        success: false,
        instanceUrl: instance.url,
        error: extractErrorMessage(error)
      };
    }
  }

  async updateUser(instance: AEMInstance, userId: string, updates: Partial<AEMUser>): Promise<UserOperationResult> {
    try {
      const exists = await this.checkUserExists(instance, userId);
      if (!exists) {
        return {
          userId,
          success: false,
          instanceUrl: instance.url,
          error: 'User does not exist'
        };
      }

      const userPath = `/home/users/${userId.charAt(0)}/${userId}`;
      const formData = new URLSearchParams();

      if (updates.profile) {
        if (updates.profile.givenName !== undefined) {
          formData.append('profile/givenName', updates.profile.givenName);
        }
        if (updates.profile.familyName !== undefined) {
          formData.append('profile/familyName', updates.profile.familyName);
        }
        if (updates.profile.email !== undefined) {
          formData.append('profile/email', updates.profile.email);
        }
        if (updates.profile.jobTitle !== undefined) {
          formData.append('profile/jobTitle', updates.profile.jobTitle);
        }
      }

      if (updates.disabled !== undefined) {
        if (updates.disabled) {
          formData.append('profile/disabledReason', 'Disabled by admin');
        } else {
          formData.append('profile/disabledReason@Delete', '');
        }
      }

      const response = await this.httpClient.postForm(
        `${instance.url}${userPath}.rw.userprops.html`,
        formData,
        {
          username: instance.username,
          password: instance.password
        }
      );

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.data}`);
      }

      this.logger.info(`User ${userId} updated successfully`, { 
        instanceUrl: instance.url,
        userId 
      });

      return {
        userId,
        success: true,
        instanceUrl: instance.url
      };

    } catch (error) {
      this.logger.error(`Failed to update user ${userId}`, { 
        instanceUrl: instance.url,
        userId,
        error: extractErrorMessage(error) 
      });

      return {
        userId,
        success: false,
        instanceUrl: instance.url,
        error: extractErrorMessage(error)
      };
    }
  }

  async deleteUser(instance: AEMInstance, userId: string): Promise<UserOperationResult> {
    try {
      const exists = await this.checkUserExists(instance, userId);
      if (!exists) {
        return {
          userId,
          success: false,
          instanceUrl: instance.url,
          error: 'User does not exist'
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

      this.logger.info(`User ${userId} deleted successfully`, { 
        instanceUrl: instance.url,
        userId 
      });

      return {
        userId,
        success: true,
        instanceUrl: instance.url
      };

    } catch (error) {
      this.logger.error(`Failed to delete user ${userId}`, { 
        instanceUrl: instance.url,
        userId,
        error: extractErrorMessage(error) 
      });

      return {
        userId,
        success: false,
        instanceUrl: instance.url,
        error: extractErrorMessage(error)
      };
    }
  }

  async disableUser(instance: AEMInstance, userId: string): Promise<UserOperationResult> {
    return this.updateUser(instance, userId, { disabled: true });
  }

  async enableUser(instance: AEMInstance, userId: string): Promise<UserOperationResult> {
    return this.updateUser(instance, userId, { disabled: false });
  }

  async syncUserToInstances(user: AEMUser, targetInstances: AEMInstance[], options: UserSyncOptions): Promise<Record<string, UserOperationResult>> {
    const operations = targetInstances.map(instance => ({
      key: instance.url,
      operation: async () => {
        if (options.overwriteExisting) {
          const exists = await this.checkUserExists(instance, user.userId);
          if (exists) {
            await this.deleteUser(instance, user.userId);
          }
        }

        const password = options.generatePasswords ? 
          this.generateSecurePassword(options.passwordPolicy || createPasswordPolicy()) : 
          undefined;

        return this.createUser(instance, user, password);
      }
    }));

    return this.parallelExecutor.executeInParallel(operations);
  }

  generateSecurePassword(policy: PasswordPolicy): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const specialChars = policy.specialChars;

    let charset = '';
    let password = '';

    if (policy.requireLowercase) {
      charset += lowercase;
      password += lowercase[crypto.randomInt(lowercase.length)];
    }

    if (policy.requireUppercase) {
      charset += uppercase;
      password += uppercase[crypto.randomInt(uppercase.length)];
    }

    if (policy.requireNumbers) {
      charset += numbers;
      password += numbers[crypto.randomInt(numbers.length)];
    }

    if (policy.requireSpecialChars) {
      charset += specialChars;
      password += specialChars[crypto.randomInt(specialChars.length)];
    }

    const remainingLength = policy.minLength - password.length;
    for (let i = 0; i < remainingLength; i++) {
      password += charset[crypto.randomInt(charset.length)];
    }

    const passwordArray = password.split('');
    for (let i = passwordArray.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
    }

    const finalPassword = passwordArray.join('');

    if (policy.forbiddenWords.some(word => finalPassword.toLowerCase().includes(word.toLowerCase()))) {
      return this.generateSecurePassword(policy);
    }

    return finalPassword;
  }

  createPasswordPolicy(): PasswordPolicy {
    return createPasswordPolicy();
  }

  async enforcePasswordChange(instance: AEMInstance, userId: string): Promise<UserOperationResult> {
    return this.updateUser(instance, userId, { passwordChangeRequired: true });
  }

  async resetPassword(instance: AEMInstance, userId: string, newPassword?: string, policy?: PasswordPolicy): Promise<PasswordResetResult> {
    try {
      const exists = await this.checkUserExists(instance, userId);
      if (!exists) {
        return {
          userId,
          success: false,
          instanceUrl: instance.url,
          error: 'User does not exist'
        };
      }

      const password = newPassword || this.generateSecurePassword(policy || createPasswordPolicy());
      const userPath = `/home/users/${userId.charAt(0)}/${userId}`;
      
      const formData = new URLSearchParams();
      formData.append('pwd', password);
      formData.append('pwdConfirm', password);

      const response = await this.httpClient.postForm(
        `${instance.url}${userPath}.rw.userprops.html`,
        formData,
        {
          username: instance.username,
          password: instance.password
        }
      );

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.data}`);
      }

      this.logger.info(`Password reset for user ${userId}`, { 
        instanceUrl: instance.url,
        userId 
      });

      return {
        userId,
        success: true,
        instanceUrl: instance.url,
        newPassword: newPassword ? undefined : password
      };

    } catch (error) {
      this.logger.error(`Failed to reset password for user ${userId}`, { 
        instanceUrl: instance.url,
        userId,
        error: extractErrorMessage(error) 
      });

      return {
        userId,
        success: false,
        instanceUrl: instance.url,
        error: extractErrorMessage(error)
      };
    }
  }

  validateUsername(username: string): ValidationResult {
    const result = AEMUserSchema.pick({ userId: true }).safeParse({ userId: username });
    
    if (result.success) {
      return { valid: true, errors: [], warnings: [] };
    }

    return {
      valid: false,
      errors: result.error.issues.map(issue => issue.message),
      warnings: []
    };
  }

  async checkUserExists(instance: AEMInstance, userId: string): Promise<boolean> {
    try {
      const response = await this.httpClient.get(
        `${instance.url}/bin/security/authorizables.json?query=${encodeURIComponent(userId)}&type=users`,
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
             data.authorizables.some((user: any) => user.id === userId);

    } catch (error) {
      this.logger.warn(`Failed to check user existence for ${userId}`, { 
        instanceUrl: instance.url,
        userId,
        error: extractErrorMessage(error) 
      });
      return false;
    }
  }

  private async addUserToGroups(instance: AEMInstance, userId: string, groupIds: string[]): Promise<void> {
    for (const groupId of groupIds) {
      try {
        const formData = new URLSearchParams();
        formData.append('addMembers', userId);

        await this.httpClient.postForm(
          `${instance.url}/home/groups/${groupId.charAt(0)}/${groupId}.rw.html`,
          formData,
          {
            username: instance.username,
            password: instance.password
          }
        );
      } catch (error) {
        this.logger.warn(`Failed to add user ${userId} to group ${groupId}`, { 
          instanceUrl: instance.url,
          userId,
          groupId,
          error: extractErrorMessage(error) 
        });
      }
    }
  }
}