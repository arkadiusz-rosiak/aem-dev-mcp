
import { OperationResult } from './mcp.types.js';

export interface AEMUser {
  userId: string;
  profile: {
    givenName?: string;
    familyName?: string;
    email?: string;
    jobTitle?: string;
  };
  groups: string[];
  disabled?: boolean;
  passwordChangeRequired?: boolean;
}

export interface AEMGroup {
  groupId: string;
  displayName?: string;
  description?: string;
  members: string[];
  permissions: string[];
  nestedGroups?: string[];
}

export interface ACLEntry {
  principal: string;
  path: string;
  privileges: ('read' | 'write' | 'delete' | 'acl_read' | 'acl_edit' | 'replicate')[];
  allow: boolean;
  restrictions?: Record<string, string>;
  inheritance?: 'allow' | 'deny' | 'break';
}

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  specialChars: string;
  forbiddenWords: string[];
}

export interface UserProvisioningRequest {
  instances: string[];
  users: AEMUser[];
  generatePasswords?: boolean;
  notifyUsers?: boolean;
  passwordPolicy?: PasswordPolicy;
}

export interface UserDeprovisioningRequest {
  instances: string[];
  userIds: string[];
  disableOnly?: boolean;
}

export interface PasswordResetRequest {
  instances: string[];
  userIds: string[];
  generatePasswords?: boolean;
  passwordPolicy?: PasswordPolicy;
  forceChange?: boolean;
}

export interface BulkUserUpdateRequest {
  instances: string[];
  updates: Array<{
    userId: string;
    changes: Partial<AEMUser>;
  }>;
}

export interface GroupSyncRequest {
  sourceInstance: string;
  targetInstances: string[];
  groupIds: string[];
  syncMembers?: boolean;
  syncPermissions?: boolean;
}

export interface PermissionGrantRequest {
  instances: string[];
  permissions: Array<{
    groupId: string;
    path: string;
    privileges: ACLEntry['privileges'];
    allow: boolean;
  }>;
}

export interface MembershipUpdateRequest {
  instances: string[];
  operations: Array<{
    groupId: string;
    userIds: string[];
    action: 'add' | 'remove';
  }>;
}

export interface TrustStoreCertificate {
  alias: string;
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  fingerprint: string;
  keyUsage?: string[];
  extendedKeyUsage?: string[];
  subjectAlternativeNames?: string[];
}

export interface TrustStoreListRequest {
  instances: string[];
  aliasFilter?: string;
}

export interface TrustStoreExportRequest {
  instances: string[];
  aliases?: string[];
  format: 'PEM' | 'DER';
}

export interface UserOperationResult {
  userId: string;
  success: boolean;
  instanceUrl: string;
  error?: string;
  generatedPassword?: string;
  groupAssignmentFailures?: Array<{
    groupId: string;
    error: string;
  }>;
}

export interface GroupOperationResult {
  groupId: string;
  success: boolean;
  instanceUrl: string;
  error?: string;
}

export interface PermissionResult {
  groupId: string;
  path: string;
  success: boolean;
  instanceUrl: string;
  error?: string;
}

export interface MembershipResult {
  groupId: string;
  success: boolean;
  instanceUrl: string;
  addedUsers: string[];
  removedUsers: string[];
  error?: string;
}

export interface GroupSyncResult {
  groupId: string;
  success: boolean;
  sourceInstanceUrl: string;
  targetInstanceUrl: string;
  syncedMembers: string[];
  syncedPermissions: number;
  error?: string;
}

export interface PasswordResetResult {
  userId: string;
  success: boolean;
  instanceUrl: string;
  newPassword?: string;
  error?: string;
}

export interface TrustStoreCertificateResult {
  instanceUrl: string;
  certificates: TrustStoreCertificate[];
  error?: string;
}

export interface TrustStoreExportResult {
  instanceUrl: string;
  alias: string;
  certificateData: string;
  format: 'PEM' | 'DER';
  success: boolean;
  error?: string;
}

export interface UserSyncOptions {
  overwriteExisting: boolean;
  syncGroups: boolean;
  generatePasswords: boolean;
  passwordPolicy?: PasswordPolicy;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export type SecurityOperationResult<T> = OperationResult<T, string>;

export function createAEMUser(data: Partial<AEMUser>): AEMUser {
  return {
    userId: data.userId || '',
    profile: data.profile || {},
    groups: data.groups || [],
    disabled: data.disabled || false,
    passwordChangeRequired: data.passwordChangeRequired || false
  };
}

export function createAEMGroup(data: Partial<AEMGroup>): AEMGroup {
  return {
    groupId: data.groupId || '',
    displayName: data.displayName,
    description: data.description,
    members: data.members || [],
    permissions: data.permissions || [],
    nestedGroups: data.nestedGroups || []
  };
}

export function createACLEntry(data: Partial<ACLEntry>): ACLEntry {
  return {
    principal: data.principal || '',
    path: data.path || '',
    privileges: data.privileges || [],
    allow: data.allow || false,
    restrictions: data.restrictions,
    inheritance: data.inheritance
  };
}

export function createPasswordPolicy(): PasswordPolicy {
  return {
    minLength: 12,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    forbiddenWords: ['password', 'admin', 'user', '123456', 'qwerty']
  };
}