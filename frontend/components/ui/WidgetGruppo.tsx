// Pannello che raggruppa più WidgetItem sotto uno stesso tema operativo
// (Clienti, Adempimenti, Hotel, Costi, Ristorante — dashboard 14/08/2026).
// Puramente di layout: il contenuto/i dati restano nella pagina chiamante,
// così aggiungere o togliere un widget da un gruppo è una modifica isolata
// al JSX della pagina, non a questo componente.

import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

interface WidgetGruppoProps {
  titolo: string;
  Icona?: LucideIcon;
  children: ReactNode;
  className?: string; // per span di griglia (es. "md:col-span-2") deciso dalla pagina
  azione?: ReactNode;  // link/bottone opzionale a destra del titolo (es. "Registra incasso")
}

export default function WidgetGruppo({ titolo, Icona, children, className = '', azione }: WidgetGruppoProps) {
  return (
    <div
      className={`rounded-xl p-4 ${className}`}
      style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {Icona && <Icona size={15} style={{ color: 'var(--hotel-amber)' }} />}
          <p className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>{titolo}</p>
        </div>
        {azione}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {children}
      </div>
    </div>
  );
}
