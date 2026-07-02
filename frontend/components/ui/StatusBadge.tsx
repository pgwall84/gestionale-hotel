// Badge di stato colorato — pill con sfondo e testo semantici.
// Usato in tabelle, card KPI, liste alert.

interface StatusBadgeProps {
  status: 'green' | 'amber' | 'red' | 'blue';
  label: string;
}

// Mappa i colori semantici alle variabili CSS definite in globals.css
const STILI: Record<string, { bg: string; text: string }> = {
  green: { bg: 'var(--status-green-bg)', text: 'var(--status-green-text)' },
  amber: { bg: 'var(--status-amber-bg)', text: 'var(--status-amber-text)' },
  red:   { bg: 'var(--status-red-bg)',   text: 'var(--status-red-text)'   },
  blue:  { bg: 'var(--status-blue-bg)',  text: 'var(--status-blue-text)'  },
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const stile = STILI[status] ?? STILI.blue;
  return (
    <span
      className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: stile.bg, color: stile.text }}
    >
      {label}
    </span>
  );
}
