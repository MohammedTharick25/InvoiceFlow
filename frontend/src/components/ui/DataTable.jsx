export function DataTable({
  caption,
  headers,
  rows = [],
  emptyMessage = "No records yet.",
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line dark:border-slate-800">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          <tr>
            {headers.map((header) => (
              <th
                className="px-4 py-3 font-semibold"
                key={header.key}
                scope="col"
              >
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-white dark:divide-slate-800 dark:bg-slate-950">
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={row.id ?? index}>
                {headers.map((header) => (
                  <td
                    className="px-4 py-3 text-ink dark:text-slate-100"
                    key={header.key}
                  >
                    {row[header.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                className="px-4 py-6 text-center text-muted"
                colSpan={headers.length}
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
