import type { ReactNode } from 'react';

// Wraps a chart so it has a text alternative: the picture is labelled for screen readers, and the same numbers
// are available as a visually hidden table (the SVG itself cannot be read cell by cell).
export function ChartFrame({
  label, columns, rows, children,
}: {
  label: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  children: ReactNode;
}) {
  return (
    <>
      <div role="img" aria-label={label}>{children}</div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((v, j) => (j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j}>{v}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
