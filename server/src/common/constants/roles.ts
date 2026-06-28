export const ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  FINANCE: 'FINANCE',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export type RoleName = typeof ROLES[keyof typeof ROLES];
