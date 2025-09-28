import { GroupManagementService } from '@/services/group-management.service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { AEMInstance, AEMGroup, ACLEntry } from '@/types/index.js';
import { createAEMGroup, createACLEntry } from '@/types/security.types.js';

jest.mock('@/services/http-client.js');
jest.mock('@/utils/logger.js');

describe('GroupManagementService', () => {
  let groupService: GroupManagementService;
  let mockHttpClient: jest.Mocked<AemHttpClient>;
  let testInstance: AEMInstance;

  beforeEach(() => {
    mockHttpClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    groupService = new GroupManagementService(mockHttpClient);
    testInstance = {
      url: 'http://test-author.example.com:4502',
      username: 'admin',
      password: 'admin'
    } as const;

    jest.clearAllMocks();
  });

  describe('createGroup', () => {
    const testGroup: AEMGroup = createAEMGroup({
      groupId: 'content-authors',
      displayName: 'Content Authors',
      description: 'Authors who can create content',
      members: [],
      permissions: []
    });

    it('should create group successfully', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [] }
      });

      mockHttpClient.postForm = jest.fn().mockResolvedValue({
        status: 200,
        data: 'OK'
      });

      const result = await groupService.createGroup(testInstance, testGroup);

      expect(result.success).toBe(true);
      expect(result.groupId).toBe('content-authors');
    });

    it('should return error when group already exists', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'content-authors' }] }
      });

      const result = await groupService.createGroup(testInstance, testGroup);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Group already exists');
    });

    it('should validate groupId format', async () => {
      const invalidGroup = createAEMGroup({
        groupId: 'INVALID GROUP',
        displayName: 'Invalid',
        members: [],
        permissions: []
      });

      const result = await groupService.createGroup(testInstance, invalidGroup);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('updateGroup', () => {
    it('should update group successfully', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'content-authors' }] }
      });

      mockHttpClient.postForm = jest.fn().mockResolvedValue({
        status: 200,
        data: 'OK'
      });

      const result = await groupService.updateGroup(testInstance, 'content-authors', {
        displayName: 'Updated Authors'
      });

      expect(result.success).toBe(true);
    });

    it('should return error when group does not exist', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [] }
      });

      const result = await groupService.updateGroup(testInstance, 'nonexistent', {
        displayName: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Group does not exist');
    });
  });

  describe('deleteGroup', () => {
    it('should delete group successfully', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'content-authors' }] }
      });

      mockHttpClient.postForm = jest.fn().mockResolvedValue({
        status: 200,
        data: 'OK'
      });

      const result = await groupService.deleteGroup(testInstance, 'content-authors');

      expect(result.success).toBe(true);
    });
  });

  describe('setGroupPermissions', () => {
    const testACLEntry: ACLEntry = createACLEntry({
      principal: 'content-authors',
      path: '/content/site',
      privileges: ['read', 'write'],
      allow: true
    });

    it('should set permissions successfully', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'content-authors' }] }
      });

      mockHttpClient.postForm = jest.fn().mockResolvedValue({
        status: 200,
        data: 'OK'
      });

      const result = await groupService.setGroupPermissions(testInstance, 'content-authors', [testACLEntry]);

      expect(result.success).toBe(true);
    });

    it('should handle permission setting failure', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'content-authors' }] }
      });

      mockHttpClient.postForm = jest.fn().mockRejectedValue(new Error('Permission denied'));

      const result = await groupService.setGroupPermissions(testInstance, 'content-authors', [testACLEntry]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('syncGroupMembership', () => {
    it('should sync members successfully', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'content-authors' }] }
      });

      mockHttpClient.postForm = jest.fn().mockResolvedValue({
        status: 200,
        data: 'OK'
      });

      const result = await groupService.syncGroupMembership(testInstance, 'content-authors', ['user1', 'user2']);

      expect(result.success).toBe(true);
    });
  });

  describe('detectCircularMembership', () => {
    it('should detect no circular dependency', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: {
          authorizables: [{
            id: 'group-a',
            memberOf: []
          }]
        }
      });

      const hasCircular = await groupService.detectCircularMembership(testInstance, 'group-a');
      expect(hasCircular).toBe(false);
    });

    it('should detect circular dependency', async () => {
      mockHttpClient.get = jest.fn()
        .mockResolvedValueOnce({
          status: 200,
          data: {
            authorizables: [{
              id: 'group-a',
              memberOf: ['group-b']
            }]
          }
        })
        .mockResolvedValueOnce({
          status: 200,
          data: {
            authorizables: [{
              id: 'group-b',
              memberOf: ['group-a']
            }]
          }
        });

      const hasCircular = await groupService.detectCircularMembership(testInstance, 'group-a');
      expect(hasCircular).toBe(true);
    });

    it('should handle self-referencing group', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: {
          authorizables: [{
            id: 'group-a',
            memberOf: ['group-a']
          }]
        }
      });

      const hasCircular = await groupService.detectCircularMembership(testInstance, 'group-a');
      expect(hasCircular).toBe(true);
    });
  });

  describe('checkGroupExists', () => {
    it('should return true when group exists', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [{ id: 'content-authors' }] }
      });

      const exists = await groupService.checkGroupExists(testInstance, 'content-authors');
      expect(exists).toBe(true);
    });

    it('should return false when group does not exist', async () => {
      mockHttpClient.get = jest.fn().mockResolvedValue({
        status: 200,
        data: { authorizables: [] }
      });

      const exists = await groupService.checkGroupExists(testInstance, 'nonexistent');
      expect(exists).toBe(false);
    });
  });

  describe('validateGroupId', () => {
    it('should validate correct groupId', () => {
      const result = groupService.validateGroupId('content-authors');
      expect(result.valid).toBe(true);
    });

    it('should reject groupId with uppercase', () => {
      const result = groupService.validateGroupId('Content-Authors');
      expect(result.valid).toBe(false);
    });

    it('should reject groupId too short', () => {
      const result = groupService.validateGroupId('ab');
      expect(result.valid).toBe(false);
    });

    it('should reject groupId with invalid characters', () => {
      const result = groupService.validateGroupId('group@test');
      expect(result.valid).toBe(false);
    });
  });
});