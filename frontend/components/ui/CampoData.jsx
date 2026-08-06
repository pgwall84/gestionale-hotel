'use client';

// Campo data — input nativo type="date" + selettore anno separato (05/08/2026,
// segnalato dal titolare: il calendario nativo del browser costringe a
// tornare indietro mese per mese per cambiare anno, molto lento per date di
// nascita che possono risalire a 70-100 anni fa). Il selettore anno permette
// di saltare subito all'anno giusto; giorno/mese restano modificabili sia
// digitando nei segmenti dell'input nativo sia con il calendario visuale,
// che dopo la scelta dell'anno si apre già sul mese giusto.
//
// Il range di anni è puramente una comodità per il salto rapido — l'input
// nativo sotto accetta comunque qualunque data digitata direttamente, anche
// fuori dal range del selettore.

const ANNO_CORRENTE = new Date().getFullYear();

// Range di default per campi generici (prenotazioni, report, scadenze
// magazzino/tariffe ecc.): qualche anno indietro e qualche anno avanti.
const DEFAULT_MIN_ANNO = ANNO_CORRENTE - 10;
const DEFAULT_MAX_ANNO = ANNO_CORRENTE + 10;

export default function CampoData({
  value,
  onChange,
  minAnno = DEFAULT_MIN_ANNO,
  maxAnno = DEFAULT_MAX_ANNO,
  disabled,
  required,
  placeholder,
  className = '',
  style,
  id,
}) {
  const anni = [];
  for (let a = maxAnno; a >= minAnno; a--) anni.push(a);

  const annoValore = value ? value.slice(0, 4) : '';

  function cambiaAnno(e) {
    const nuovoAnno = e.target.value;
    if (!nuovoAnno) return;
    const meseGiorno = value ? value.slice(5) : '01-01';
    onChange(`${nuovoAnno}-${meseGiorno}`);
  }

  return (
    <div className="flex gap-1">
      <select
        value={annoValore}
        onChange={cambiaAnno}
        disabled={disabled}
        aria-label="Anno"
        className="rounded-lg text-sm outline-none px-1"
        style={style}
      >
        <option value="">Anno</option>
        {anni.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      <input
        type="date"
        id={id}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        className={`flex-1 min-w-0 rounded-lg text-sm outline-none ${className}`}
        style={style}
      />
    </div>
  );
}

export { ANNO_CORRENTE };
