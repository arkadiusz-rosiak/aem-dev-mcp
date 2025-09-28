import {
  UserProvisioningRequestSchema,
  UserDeprovisioningRequestSchema,
  PasswordResetRequestSchema,
  BulkUserUpdateRequestSchema,
  GroupSyncRequestSchema,
  PermissionGrantRequestSchema,
  MembershipUpdateRequestSchema,
  TrustStoreListRequestSchema,
  TrustStoreExportRequestSchema,
  TrustStoreSyncRequestSchema
} from '@/schemas/security.schemas.js';

describe('Security Schemas', () => {
  describe('UserProvisioningRequestSchema', () => {
    it('should validate valid user provisioning request', () => {
      const validRequest = {
        instances: ['local'],
        users: [{
          userId: 'john.doe',
          profile: {
            givenName: 'John',
            familyName: 'Doe',
            email: 'john.doe@example.com'
          },
          groups: []
        }],
        generatePasswords: true
      };

      const result = UserProvisioningRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid userId format', () => {
      const invalidRequest = {
        instances: ['local'],
        users: [{
          userId: 'JOHN.DOE',
          profile: {},
          groups: []
        }]
      };

      const result = UserProvisioningRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should reject invalid email format', () => {
      const invalidRequest = {
        instances: ['local'],
        users: [{
          userId: 'john.doe',
          profile: {
            email: 'invalid-email'
          },
          groups: []
        }]
      };

      const result = UserProvisioningRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should validate password policy', () => {
      const validRequest = {
        instances: ['local'],
        users: [{
          userId: 'john.doe',
          profile: {},
          groups: []
        }],
        passwordPolicy: {
          minLength: 12,
          maxLength: 32,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          specialChars: '!@#$%',
          forbiddenWords: ['password', 'admin']
        }
      };

      const result = UserProvisioningRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid password policy (minLength > maxLength)', () => {
      const invalidRequest = {
        instances: ['local'],
        users: [{
          userId: 'john.doe',
          profile: {},
          groups: []
        }],
        passwordPolicy: {
          minLength: 32,
          maxLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: false,
          specialChars: '',
          forbiddenWords: []
        }
      };

      const result = UserProvisioningRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('UserDeprovisioningRequestSchema', () => {
    it('should validate valid deprovisioning request', () => {
      const validRequest = {
        instances: ['local'],
        userIds: ['john.doe', 'jane.smith'],
        disableOnly: true
      };

      const result = UserDeprovisioningRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject empty userIds array', () => {
      const invalidRequest = {
        instances: ['local'],
        userIds: []
      };

      const result = UserDeprovisioningRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('PasswordResetRequestSchema', () => {
    it('should validate valid password reset request', () => {
      const validRequest = {
        instances: ['local'],
        userIds: ['john.doe'],
        generatePasswords: true,
        forceChange: true
      };

      const result = PasswordResetRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('BulkUserUpdateRequestSchema', () => {
    it('should validate valid bulk update request', () => {
      const validRequest = {
        instances: ['local'],
        updates: [
          {
            userId: 'john.doe',
            changes: {
              profile: {
                jobTitle: 'Senior Developer'
              }
            }
          }
        ]
      };

      const result = BulkUserUpdateRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject empty updates array', () => {
      const invalidRequest = {
        instances: ['local'],
        updates: []
      };

      const result = BulkUserUpdateRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('GroupSyncRequestSchema', () => {
    it('should validate valid group sync request', () => {
      const validRequest = {
        sourceInstance: 'prod-author',
        targetInstances: ['stage-author', 'dev-author'],
        groupIds: ['content-authors'],
        syncMembers: true,
        syncPermissions: true
      };

      const result = GroupSyncRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject empty groupIds', () => {
      const invalidRequest = {
        sourceInstance: 'prod-author',
        targetInstances: ['stage-author'],
        groupIds: []
      };

      const result = GroupSyncRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('PermissionGrantRequestSchema', () => {
    it('should validate valid permission grant request', () => {
      const validRequest = {
        instances: ['local'],
        groupId: 'content-authors',
        permissions: [
          {
            principal: 'content-authors',
            path: '/content/site',
            privileges: ['read', 'write'],
            allow: true
          }
        ]
      };

      const result = PermissionGrantRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should validate all privilege types', () => {
      const validRequest = {
        instances: ['local'],
        groupId: 'admins',
        permissions: [
          {
            principal: 'admins',
            path: '/content',
            privileges: ['read', 'write', 'delete', 'acl_read', 'acl_edit', 'replicate'],
            allow: true
          }
        ]
      };

      const result = PermissionGrantRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid privilege', () => {
      const invalidRequest = {
        instances: ['local'],
        groupId: 'test',
        permissions: [
          {
            principal: 'test',
            path: '/content',
            privileges: ['invalid'],
            allow: true
          }
        ]
      };

      const result = PermissionGrantRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should validate ACL inheritance options', () => {
      const validRequest = {
        instances: ['local'],
        groupId: 'test',
        permissions: [
          {
            principal: 'test',
            path: '/content',
            privileges: ['read'],
            allow: true,
            inheritance: 'break'
          }
        ]
      };

      const result = PermissionGrantRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('MembershipUpdateRequestSchema', () => {
    it('should validate valid membership update request', () => {
      const validRequest = {
        instances: ['local'],
        groupId: 'content-authors',
        addMembers: ['john.doe', 'jane.smith'],
        removeMembers: ['old.user']
      };

      const result = MembershipUpdateRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should require at least one operation', () => {
      const invalidRequest = {
        instances: ['local'],
        groupId: 'content-authors'
      };

      const result = MembershipUpdateRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('TrustStoreListRequestSchema', () => {
    it('should validate valid trust store list request', () => {
      const validRequest = {
        instances: ['local'],
        aliases: ['cert1', 'cert2']
      };

      const result = TrustStoreListRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should validate with expiry filter', () => {
      const validRequest = {
        instances: ['local'],
        expiringBefore: new Date('2025-12-31')
      };

      const result = TrustStoreListRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('TrustStoreExportRequestSchema', () => {
    it('should validate PEM format export', () => {
      const validRequest = {
        instances: ['local'],
        aliases: ['cert1'],
        format: 'PEM'
      };

      const result = TrustStoreExportRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should validate DER format export', () => {
      const validRequest = {
        instances: ['local'],
        format: 'DER'
      };

      const result = TrustStoreExportRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid format', () => {
      const invalidRequest = {
        instances: ['local'],
        format: 'INVALID'
      };

      const result = TrustStoreExportRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('TrustStoreSyncRequestSchema', () => {
    it('should validate valid trust store sync request', () => {
      const validRequest = {
        sourceInstance: 'prod-author',
        targetInstances: ['stage-author', 'dev-author'],
        aliases: ['cert1']
      };

      const result = TrustStoreSyncRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should validate without aliases (sync all)', () => {
      const validRequest = {
        sourceInstance: 'prod-author',
        targetInstances: ['stage-author']
      };

      const result = TrustStoreSyncRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });
  });
});