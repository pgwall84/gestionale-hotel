'use client';

// Pagina segnaposto per le sezioni non ancora sviluppate.
import AppShell from '@/components/layout/AppShell';

export default function PaginaInCostruzione({ titolo, icona, step }) {
  return (
    <AppShell titolo={titolo}>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-6xl mb-4">{icona || '🔧'}</div>
        <h2 className="text-lg font-medium mb-1" style={{ color: 'var(--foreground)' }}>
          {titolo}
        </h2>
        <p className="text-sm mb-3" style={{ color: 'var(--muted-foreground)' }}>
          Questa sezione è in sviluppo.
        </p>
        {step && (
          <span
            className="inline-block text-xs font-medium px-3 py-1 rounded-full"
            style={{ background: 'var(--status-blue-bg)', color: 'var(--status-blue-text)' }}
          >
            Prevista nello Step {step}
          </span>
        )}
      </div>
    </AppShell>
  );
}
