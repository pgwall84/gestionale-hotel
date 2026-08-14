// Singola tessera dentro un WidgetGruppo — un numero/stato + click-through
// alla pagina che lo gestisce. Stessa filosofia di KpiCard ma più piccola e
// pensata per stare in griglia 2 colonne dentro un pannello (dashboard 14/08/2026).
//
// Se `sviluppato` è false la tessera passa in modalità placeholder: bordo
// tratteggiato, nessun numero, solo il messaggio spiegato — onesto invece di
// mostrare uno zero finto o nascondere del tutto la voce (richiesta esplicita
// del titolare, 14/08/2026).

import Link from 'next/link';
import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

type Stato = 'verde' | 'ambra' | 'rosso' | 'neutro';

const COLORE_STATO: Record<Stato, string> = {
  verde: 'var(--status-green-text)',
  ambra: 'var(--status-amber-text)',
  rosso: 'var(--status-red-text)',
  neutro: 'var(--muted-foreground)',
};

interface WidgetItemProps {
  label: string;
  valore?: string | number;
  sub?: string;
  stato?: Stato;
  href?: string;
  Icona?: LucideIcon;
  sviluppato?: boolean;   // default true
  messaggio?: string;     // usato quando sviluppato=false
}

function Contenuto({ label, valore, sub, stato, Icona, sviluppato = true, messaggio }: WidgetItemProps) {
  if (!sviluppato) {
    return (
      <div
        className="rounded-lg p-2.5 h-full flex flex-col justify-center"
        style={{ border: '1px dashed var(--border)' }}
      >
        <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
        <p className="text-[11px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>
          {messaggio || 'Modulo non sviluppato'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-2.5 h-full" style={{ background: 'var(--background)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icona && <Icona size={11} style={{ color: 'var(--muted-foreground)' }} />}
        <p className="text-[11px] font-medium" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
        {stato && (
          <span className="w-1.5 h-1.5 rounded-full ml-auto shrink-0" style={{ background: COLORE_STATO[stato] }} />
        )}
      </div>
      {valore !== undefined && (
        <p className="text-lg font-medium leading-none mb-0.5" style={{ color: 'var(--foreground)' }}>{valore}</p>
      )}
      {sub && <p className="text-[10px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>}
    </div>
  );
}

export default function WidgetItem(props: WidgetItemProps) {
  if (props.href && props.sviluppato !== false) {
    return (
      <Link href={props.href} className="block">
        <Contenuto {...props} />
      </Link>
    );
  }
  return <Contenuto {...props} />;
}
