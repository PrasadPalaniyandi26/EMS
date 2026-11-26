// What a sign-in name points to: an Employee ID (NT10001, any case or leading zeros) or a login name.
// The sign-in limit uses the same rule, so every spelling of one account is counted together.
export function loginWhere(username: string): { id: number } | { loginName: string } {
  const nt = username.match(/^NT(\d{1,9})$/i);
  return nt ? { id: Number(nt[1]) - 10000 } : { loginName: username };
}
