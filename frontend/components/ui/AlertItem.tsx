// Riga alert nella sezione "Alert del giorno" della dashboard.
// Dot colorato + testo + categoria + ora opzionale.

interface AlertItemProps {
  type: 'red' | 'amber' | 'blue';
  text: string;        // Testo principale dell'alert
  category: string;    // Categoria (es. "ZTL", "Magazzino", "HR")
  time?: string;       // Ora opzionale (es. "09:30")
}

const COLORI_DOT: Record<string, string> = {
  red:   'var(--status-red-text)',
  amber: 'var(--status-amber-text)',
  blue:  'var(--status-blue-text)',
};

export default function AlertItem({ type, text, category, time }: AlertItemProps) {
  return (
    <div
      className="flex items-start gap-3 py-3"
      style={{ borderBottom: '0.5px solid var(--border)' }}
    >
      {/* Dot colorato */}
      <div
        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
        style={{ background: COLORI_DOT[type] }}
      />

      {/* Testo e categoria */}
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: 'var(--foreground)' }}>{text}</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{category}</p>
      </div>

      {/* Ora opzionale */}
      {time && (
        <p className="text-[11px] shrink-0" style={{ color: 'var(--muted-foreground)' }}>{time}</p>
      )}
    </div>
  );
}
