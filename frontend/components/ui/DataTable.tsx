'use client';

// Tabella dati riutilizzabile con zebrastripe, hover riga e scroll orizzontale su mobile.
// Usata per presenze, dipendenti, prenotazioni, ecc.

interface Colonna<T> {
  header: string;                         // Intestazione colonna
  accessor: keyof T | ((row: T) => React.ReactNode); // Campo o funzione render
}

interface DataTableProps<T> {
  colonne: Colonna<T>[];
  dati: T[];
  onRowClick?: (row: T) => void;  // Click su riga (opzionale)
  emptyText?: string;             // Testo se nessun dato
}

export default function DataTable<T extends { id?: number | string }>({
  colonne, dati, onRowClick, emptyText = 'Nessun dato disponibile',
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto" style={{ borderRadius: '8px', border: '0.5px solid var(--border)' }}>
      <table className="w-full text-sm border-collapse min-w-[400px]">
        <thead>
          <tr style={{ background: 'var(--card)', borderBottom: '0.5px solid var(--border)' }}>
            {colonne.map((col, i) => (
              <th
                key={i}
                className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dati.length === 0 ? (
            <tr>
              <td
                colSpan={colonne.length}
                className="text-center py-8 text-sm"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            dati.map((riga, idx) => (
              <tr
                key={riga.id ?? idx}
                onClick={() => onRowClick?.(riga)}
                className="transition-colors"
                style={{
                  background: idx % 2 === 1 ? 'var(--background)' : 'var(--card)', // zebrastripe
                  cursor: onRowClick ? 'pointer' : 'default',
                  borderBottom: '0.5px solid var(--border)',
                }}
                onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.background = '#EFF6FF'; }}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = idx % 2 === 1 ? 'var(--background)' : 'var(--card)'}
              >
                {colonne.map((col, i) => (
                  <td key={i} className="px-4 py-2.5" style={{ color: 'var(--foreground)' }}>
                    {typeof col.accessor === 'function'
                      ? col.accessor(riga)
                      : String(riga[col.accessor] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
