// Whose records a person may see in reports and analytics: everyone, only their own, or their reporting tree.
export type DataScope = 'All' | 'Self' | 'Department';

// 'Own' and 'Own Records' were saved by earlier seeds and the permissions dialog. Any other stored value reads as
// Department, which never widens what someone sees.
export function toDataScope(value: string): DataScope {
  if (value === 'All') return 'All';
  return ['Self', 'Own', 'Own Records'].includes(value) ? 'Self' : 'Department';
}

export const SAVEABLE_SCOPES = ['All', 'Self', 'Department', 'Own', 'Own Records'];
