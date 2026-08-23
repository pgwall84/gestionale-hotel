'use client';

// Topbar — barra superiore con titolo pagina, data e azione primaria contestuale.
// Altezza fissa 60px. Su mobile è nascosta (sostituita dalla bottom nav).

import { Bell, Search } from 'lucide-react';

interface TopbarProps {
  titolo: string;          // Titolo della sezione corrente (es. "Personale")
  sottotitolo?: string;    // Data o descrizione aggiuntiva
  azioneLabel?: string;    // Testo del pulsante primario (es. "Nuovo dipendente")
  onAzione?: () => void;   // Callback del pulsante primario
  alertCount?: number;     // Numero alert da mostrare sul campanellino
  onCercaClick?: () => void; // Apre RicercaGlobale (CMD+K, 23/08/2026)
}

export default function Topbar({ titolo, sottotitolo, azioneLabel, onAzione, alertCount = 0, onCercaClick }: TopbarProps) {
  // Data dinamica in italiano
  const oggi = new Date().toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <header
      className="hidden md:flex items-center justify-between px-6 shrink-0 relative"
      style={{
        height: 'var(--topbar-height)',
        background: 'var(--card)',
        borderBottom: '0.5px solid var(--border)',
      }}
    >
      {/* Sinistra: titolo + data */}
      <div>
        <h1 className="text-base font-medium" style={{ color: 'var(--foreground)' }}>
          {titolo}
        </h1>
        <p className="text-xs capitalize" style={{ color: 'var(--muted-foreground)' }}>
          {sottotitolo ?? oggi}
        </p>
      </div>

      {/* Centro: ricerca universale (CMD+K, 23/08/2026) — posizionata in
          assoluto per restare davvero centrata rispetto all'intera barra,
          indipendentemente da quanto sono larghi i blocchi sinistra/destra. */}
      {onCercaClick && (
        <button
          onClick={onCercaClick}
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors hover:bg-gray-50"
          style={{ color: 'var(--muted-foreground)', width: '280px' }}
          title="Ricerca universale"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Cerca ospite, camera, prenotazione...</span>
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border shrink-0">⌘K</kbd>
        </button>
      )}

      {/* Destra: campanella + pulsante azione primaria */}
      <div className="flex items-center gap-3">
        {/* Campanella notifiche con badge rosso se ci sono alert */}
        <button
          className="relative p-2 rounded-lg transition-colors hover:bg-gray-100"
          title="Notifiche"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <Bell size={18} />
          {alertCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full"
                  style={{ background: 'var(--status-red-text)' }} />
          )}
        </button>

        {/* Pulsante azione primario — ambra, mostrato solo se passato come prop */}
        {azioneLabel && onAzione && (
          <button
            onClick={onAzione}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--hotel-amber)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hotel-amber-dark)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--hotel-amber)')}
          >
            {azioneLabel}
          </button>
        )}
      </div>
    </header>
  );
}
