export const permissionKeys = [
  'patients:read',
  'patients:write',
  'encounters:read',
  'encounters:write',
  'imports:read',
  'imports:write',
  'users:manage',
] as const;

export type PermissionKey = typeof permissionKeys[number];

export interface AuthenticatedUser {
  id: string;
  username: string;
  permissions: PermissionKey[];
}
