// Card KPI — usata nella dashboard per mostrare i numeri chiave.
// Props: label, value, sub (testo secondario), badge opzionale con variante colore.

import StatusBadge from './StatusBadge';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  badge?: string;
  badgeVariante?: 'green' | 'amber' | 'red' | 'blue';
  Icona?: LucideIcon;
}

export default function KpiCard({ label, value, sub, badge, badgeVariante, Icona }: KpiCardProps) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: 'var(--card)',
        border: '0.5px solid var(--border)',
      }}
    >
      {/* Label con icona opzionale */}
      <div className="flex items-center gap-1.5 mb-2">
        {Icona && <Icona size={12} style={{ color: 'var(--muted-foreground)' }} />}
        <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
          {label}
        </p>
      </div>

      {/* Valore principale — grande e leggibile */}
      <p className="text-[22px] font-medium leading-none mb-1.5" style={{ color: 'var(--foreground)' }}>
        {value}
      </p>

      {/* Testo secondario e badge */}
      <div className="flex items-center justify-between gap-2">
        {sub && (
          <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>
        )}
        {badge && badgeVariante && (
          <StatusBadge status={badgeVariante} label={badge} />
        )}
      </div>
    </div>
  );
}
