export const ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  FINANCE: 'FINANCE',
  EMPLOYEE: 'EMPLOYEE',
  CONFIGURATOR: 'CONFIGURATOR',
  OPERATIONS: 'OPERATIONS',
} as const;

export type RoleName = typeof ROLES[keyof typeof ROLES];
