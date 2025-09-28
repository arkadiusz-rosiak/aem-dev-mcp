import { z } from 'zod';

const UserProfileSchema = z.object({
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  email: z.string().email().optional(),
  jobTitle: z.string().optional()
});

const AEMUserSchema = z.object({
  userId: z.string()
    .min(3, 'User ID must be at least 3 characters')
    .max(64, 'User ID must not exceed 64 characters')
    .regex(/^[a-z][a-z0-9\-_.]*$/, 'User ID must start with lowercase letter and contain only lowercase letters, numbers, hyphens, underscores, and dots'),
  profile: UserProfileSchema,
  groups: z.array(z.string()),
  disabled: z.boolean().optional(),
  passwordChangeRequired: z.boolean().optional()
});

const AEMGroupSchema = z.object({
  groupId: z.string()
    .min(3, 'Group ID must be at least 3 characters')
    .max(64, 'Group ID must not exceed 64 characters')
    .regex(/^[a-z][a-z0-9\-_]*$/, 'Group ID must start with lowercase letter and contain only lowercase letters, numbers, hyphens, and underscores'),
  displayName: z.string().optional(),
  description: z.string().optional(),
  members: z.array(z.string()),
  permissions: z.array(z.string()),
  nestedGroups: z.array(z.string()).optional()
});

const PrivilegeSchema = z.enum(['read', 'write', 'delete', 'acl_read', 'acl_edit', 'replicate']);

const ACLEntrySchema = z.object({
  principal: z.string().min(1, 'Principal is required'),
  path: z.string().min(1, 'Path is required').startsWith('/', 'Path must start with /'),
  privileges: z.array(PrivilegeSchema).min(1, 'At least one privilege is required'),
  allow: z.boolean(),
  restrictions: z.record(z.string(), z.string()).optional(),
  inheritance: z.enum(['allow', 'deny', 'break']).optional()
});

const PasswordPolicySchema = z.object({
  minLength: z.number().min(1).max(256),
  maxLength: z.number().min(1).max(256),
  requireUppercase: z.boolean(),
  requireLowercase: z.boolean(),
  requireNumbers: z.boolean(),
  requireSpecialChars: z.boolean(),
  specialChars: z.string(),
  forbiddenWords: z.array(z.string())
}).refine(
  (data) => data.minLength <= data.maxLength,
  {
    message: 'Minimum length cannot be greater than maximum length',
    path: ['minLength']
  }
);

const UserProvisioningRequestSchema = z.object({
  instances: z.array(z.string()).min(1, 'At least one instance is required'),
  users: z.array(AEMUserSchema).min(1, 'At least one user is required'),
  generatePasswords: z.boolean().optional(),
  notifyUsers: z.boolean().optional(),
  passwordPolicy: PasswordPolicySchema.optional()
});

const UserDeprovisioningRequestSchema = z.object({
  instances: z.array(z.string()).min(1, 'At least one instance is required'),
  userIds: z.array(z.string()).min(1, 'At least one user ID is required'),
  disableOnly: z.boolean().optional()
});

const PasswordResetRequestSchema = z.object({
  instances: z.array(z.string()).min(1, 'At least one instance is required'),
  userIds: z.array(z.string()).min(1, 'At least one user ID is required'),
  generatePasswords: z.boolean().optional(),
  passwordPolicy: PasswordPolicySchema.optional(),
  forceChange: z.boolean().optional()
});

const BulkUserUpdateRequestSchema = z.object({
  instances: z.array(z.string()).min(1, 'At least one instance is required'),
  updates: z.array(z.object({
    userId: z.string().min(1, 'User ID is required'),
    changes: AEMUserSchema.partial()
  })).min(1, 'At least one update is required')
});

const GroupSyncRequestSchema = z.object({
  sourceInstance: z.string().min(1, 'Source instance is required'),
  targetInstances: z.array(z.string()).min(1, 'At least one target instance is required'),
  groupIds: z.array(z.string()).min(1, 'At least one group ID is required'),
  syncMembers: z.boolean().optional(),
  syncPermissions: z.boolean().optional()
});

const PermissionGrantRequestSchema = z.object({
  instances: z.array(z.string()).min(1, 'At least one instance is required'),
  permissions: z.array(z.object({
    groupId: z.string().min(1, 'Group ID is required'),
    path: z.string().min(1, 'Path is required').startsWith('/', 'Path must start with /'),
    privileges: z.array(PrivilegeSchema).min(1, 'At least one privilege is required'),
    allow: z.boolean()
  })).min(1, 'At least one permission is required')
});

const MembershipUpdateRequestSchema = z.object({
  instances: z.array(z.string()).min(1, 'At least one instance is required'),
  operations: z.array(z.object({
    groupId: z.string().min(1, 'Group ID is required'),
    userIds: z.array(z.string()).min(1, 'At least one user ID is required'),
    action: z.enum(['add', 'remove'])
  })).min(1, 'At least one operation is required')
});

const TrustStoreListRequestSchema = z.object({
  instances: z.array(z.string()).min(1, 'At least one instance is required'),
  aliasFilter: z.string().optional()
});

const TrustStoreExportRequestSchema = z.object({
  instances: z.array(z.string()).min(1, 'At least one instance is required'),
  aliases: z.array(z.string()).optional(),
  format: z.enum(['PEM', 'DER'])
});

export {
  AEMUserSchema,
  AEMGroupSchema,
  ACLEntrySchema,
  PasswordPolicySchema,
  UserProvisioningRequestSchema,
  UserDeprovisioningRequestSchema,
  PasswordResetRequestSchema,
  BulkUserUpdateRequestSchema,
  GroupSyncRequestSchema,
  PermissionGrantRequestSchema,
  MembershipUpdateRequestSchema,
  TrustStoreListRequestSchema,
  TrustStoreExportRequestSchema
};