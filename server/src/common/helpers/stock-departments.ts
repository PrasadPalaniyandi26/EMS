// Stock purchases are budgeted against the Store department; count differences are charged to Workshop.
// shortcut: found by name, so renaming either department makes a new one; add a department flag if they need other names.
export const STORE_DEPARTMENT = 'Store';
export const WORKSHOP_DEPARTMENT = 'Workshop';

export async function departmentNamed(db: { department: { upsert: (args: any) => Promise<{ id: number }> } }, name: string): Promise<number> {
  return (await db.department.upsert({ where: { name }, create: { name }, update: {} })).id;
}
