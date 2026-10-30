// Cost codes such as E200 or J110 sort by their number, not as text (E200 before E1000); uncoded items follow by name.
const num = (code?: string | null) => {
  const n = Number(String(code ?? '').replace(/\D/g, ''));
  return code && !Number.isNaN(n) ? n : Number.MAX_SAFE_INTEGER;
};

export function sortByCode<T extends { name: string; code?: string | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const pa = (a.code ?? '').replace(/\d+/g, '');
    const pb = (b.code ?? '').replace(/\d+/g, '');
    if (!!a.code !== !!b.code) return a.code ? -1 : 1;
    return pa.localeCompare(pb) || num(a.code) - num(b.code) || a.name.localeCompare(b.name);
  });
}
