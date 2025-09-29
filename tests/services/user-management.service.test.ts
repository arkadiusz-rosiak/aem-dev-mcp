import { UserManagementService } from '@/services/user-management.service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { AEMInstance, AEMUser, PasswordPolicy } from '@/types/index.js';
import { createAEMUser, createPasswordPolicy } from '@/types/security.types.js';

jest.mock('@/services/http-client.js');
jest.mock('@/utils/logger.js');

describe('UserManagementService', () => {
  let userService: UserManagementService;
  let mockHttpClient: jest.Mocked<AemHttpClient>;
  let testInstance: AEMInstance;

  beforeEach(() => {
    mockHttpClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    userService = new UserManagementService(mockHttpClient);
    testInstance = {
      url: 'http://test-author.example.com:4502',
      username: 'admin',
      password: 'admin'
    } as const;

    jest.clearAllMocks();
  });

  describe('createUser', () => {
    const testUser: AEMUser = createAEMUser({
      userId: 'john.doe',
      profile: {
        givenName: 'John',
        familyName: 'Doe',
        email: 'john.doe@example.com',
        jobTitle: 'Developer'
      },
      groups: ['content-authors'],
      disabled: false
    });

    it('should create user successfully without password', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [] }
      });

      mockHttpClient.postForm = jest.fn().mockResolvedValue({
        status: 200,
        data: 'OK'
      });

      const result = await userService.createUser(testInstance, testUser);

      expect(result.success).toBe(true);
      expect(result.userId).toBe('john.doe');
      expect(result.generatedPassword).toBeDefined();
      expect(result.generatedPassword!.length).toBeGreaterThanOrEqual(12);
      expect(mockHttpClient.postForm).toHaveBeenCalledTimes(2);
    });

    it('should create user successfully with provided password', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [] }
      });

      mockHttpClient.postForm = jest.fn().mockResolvedValue({
        status: 200,
        data: 'OK'
      });

      const result = await userService.createUser(testInstance, testUser, 'CustomPass123!');

      expect(result.success).toBe(true);
      expect(result.generatedPassword).toBeUndefined();
    });

    it('should return error when user already exists', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'john.doe' }] }
      });

      const result = await userService.createUser(testInstance, testUser);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User already exists');
    });

    it('should validate username format', async () => {
      const invalidUser = createAEMUser({
        userId: 'INVALID USER',
        profile: {},
        groups: []
      });

      const result = await userService.createUser(testInstance, invalidUser);

      expect(result.success).toBe(false);
      expect(result.error).toContain('lowercase');
    });

    it('should report group assignment failures', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [] }
      });

      mockHttpClient.postForm = jest.fn()
        .mockResolvedValueOnce({ status: 200, data: 'OK' })
        .mockRejectedValueOnce(new Error('Group not found'));

      const result = await userService.createUser(testInstance, testUser);

      expect(result.success).toBe(true);
      expect(result.groupAssignmentFailures).toBeDefined();
      expect(result.groupAssignmentFailures).toHaveLength(1);
      expect(result.groupAssignmentFailures![0].groupId).toBe('content-authors');
    });

    it('should handle user creation failure', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [] }
      });

      mockHttpClient.postForm = jest.fn().mockResolvedValue({
        status: 500,
        data: 'Internal Server Error'
      });

      const result = await userService.createUser(testInstance, testUser);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'john.doe' }] }
      });

      mockHttpClient.postForm = jest.fn().mockResolvedValue({
        status: 200,
        data: 'OK'
      });

      const result = await userService.updateUser(testInstance, 'john.doe', {
        profile: { jobTitle: 'Senior Developer' }
      });

      expect(result.success).toBe(true);
      expect(result.userId).toBe('john.doe');
    });

    it('should return error when user does not exist', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [] }
      });

      const result = await userService.updateUser(testInstance, 'nonexistent', {
        profile: { jobTitle: 'Developer' }
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User does not exist');
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'john.doe' }] }
      });

      mockHttpClient.postForm = jest.fn().mockResolvedValue({
        status: 200,
        data: 'OK'
      });

      const result = await userService.deleteUser(testInstance, 'john.doe');

      expect(result.success).toBe(true);
      expect(mockHttpClient.postForm).toHaveBeenCalled();
    });

    it('should return error when user does not exist', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [] }
      });

      const result = await userService.deleteUser(testInstance, 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User does not exist');
    });
  });

  describe('disableUser', () => {
    it('should disable user successfully', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'john.doe' }] }
      });

      mockHttpClient.postForm = jest.fn().mockResolvedValue({
        status: 200,
        data: 'OK'
      });

      const result = await userService.disableUser(testInstance, 'john.doe');

      expect(result.success).toBe(true);
    });
  });

  describe('resetPassword', () => {
    it('should reset password with generated password', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'john.doe' }] }
      });

      mockHttpClient.postForm = jest.fn().mockResolvedValue({
        status: 200,
        data: 'OK'
      });

      const result = await userService.resetPassword(testInstance, 'john.doe');

      expect(result.success).toBe(true);
      expect(result.newPassword).toBeDefined();
      expect(result.newPassword!.length).toBeGreaterThanOrEqual(12);
    });

    it('should reset password with provided password', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'john.doe' }] }
      });

      mockHttpClient.postForm = jest.fn().mockResolvedValue({
        status: 200,
        data: 'OK'
      });

      const result = await userService.resetPassword(testInstance, 'john.doe', 'NewPass123!');

      expect(result.success).toBe(true);
      expect(result.newPassword).toBe('NewPass123!');
    });
  });

  describe('generateSecurePassword', () => {
    it('should generate password meeting default policy', () => {
      const policy = createPasswordPolicy();
      const password = userService.generateSecurePassword(policy);

      expect(password.length).toBeGreaterThanOrEqual(policy.minLength);
      expect(password.length).toBeLessThanOrEqual(policy.maxLength);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
      expect(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)).toBe(true);
    });

    it('should generate password with custom policy', () => {
      const policy: PasswordPolicy = {
        minLength: 8,
        maxLength: 16,
        requireUppercase: false,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false,
        specialChars: '',
        forbiddenWords: []
      };

      const password = userService.generateSecurePassword(policy);

      expect(password.length).toBeGreaterThanOrEqual(8);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
    });

    it('should avoid forbidden words', () => {
      const policy: PasswordPolicy = {
        minLength: 12,
        maxLength: 32,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        specialChars: '!@#$%^&*',
        forbiddenWords: ['password', 'admin', 'test']
      };

      const password = userService.generateSecurePassword(policy);

      expect(password.toLowerCase()).not.toContain('password');
      expect(password.toLowerCase()).not.toContain('admin');
      expect(password.toLowerCase()).not.toContain('test');
    });

    it('should throw error when policy is too restrictive', () => {
      const impossiblePolicy: PasswordPolicy = {
        minLength: 8,
        maxLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        specialChars: '!',
        forbiddenWords: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f']
      };

      expect(() => userService.generateSecurePassword(impossiblePolicy)).toThrow('too restrictive');
    });

    it('should generate different passwords on each call', () => {
      const policy = createPasswordPolicy();
      const passwords = new Set();

      for (let i = 0; i < 10; i++) {
        passwords.add(userService.generateSecurePassword(policy));
      }

      expect(passwords.size).toBe(10);
    });
  });

  describe('validateUsername', () => {
    it('should validate correct username', () => {
      const result = userService.validateUsername('john.doe');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject username with uppercase', () => {
      const result = userService.validateUsername('John.Doe');
      expect(result.valid).toBe(false);
    });

    it('should reject username too short', () => {
      const result = userService.validateUsername('ab');
      expect(result.valid).toBe(false);
    });

    it('should reject username with invalid characters', () => {
      const result = userService.validateUsername('john@doe');
      expect(result.valid).toBe(false);
    });
  });

  describe('checkUserExists', () => {
    it('should return true when user exists', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'john.doe' }] }
      });

      const exists = await userService.checkUserExists(testInstance, 'john.doe');
      expect(exists).toBe(true);
    });

    it('should return false when user does not exist', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [] }
      });

      const exists = await userService.checkUserExists(testInstance, 'nonexistent');
      expect(exists).toBe(false);
    });

    it('should return false on error', async () => {
      mockHttpClient.get = jest.fn().mockRejectedValue(new Error('Network error'));

      const exists = await userService.checkUserExists(testInstance, 'john.doe');
      expect(exists).toBe(false);
    });
  });
});