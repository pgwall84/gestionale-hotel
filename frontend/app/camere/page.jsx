'use client';

// Pagina Stato Camere (ex "Camere") — griglia per piano, 5 camere per riga.
// Modulo 5.1 (03/08/2026): fermata/partenza non sono più editabili a mano,
// sono calcolate dal backend in tempo reale da `soggiorni` (vedi commento
// in camereController.js) — qui sono sola lettura per tutti i ruoli.
// Admin/titolare/receptionist/portiere_notte: editano solo le note.
// Admin/titolare/receptionist/cameriere/portiere_notte/dipendente (non
// cuoco): possono marcare "pronta" (shared/ruoli.js sezione 'camere'.'pulizia').

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, Circle } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

// Disposizione per piano: ogni array è una riga
const PIANI = [
  { label: 'Piano 1', numeri: ['1','2','3','4','5'] },
  { label: 'Piano 2', numeri: ['6','7','8','9','10'] },
  { label: 'Piano 3', numeri: ['11','12','13','14','15'] },
  { label: 'Piano 4', numeri: ['16','18','19','20','21'] },
  { label: 'Appartamento', numeri: ['app'] },
];

function fmt(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

// Singola card camera — compatta
function CardCamera({ camera, puoEditare, puoPulire, onAggiorna, salvando }) {
  const [noteAperta, setNoteAperta] = useState(false);
  const isSalvando = salvando === camera.id;

  const haFermata  = camera.arrivo;
  const haPartenza = camera.partenza;
  const haAttivita = haFermata || haPartenza;

  // Colore sfondo in base allo stato
  const bg = camera.pronta
    ? 'var(--status-blue-bg)'
    : haFermata && haPartenza ? 'var(--status-amber-bg)'
    : haFermata   ? 'var(--status-green-bg)'
    : haPartenza  ? 'var(--status-red-bg)'
    : 'var(--card)';

  const borderColor = camera.pronta
    ? 'var(--status-blue-text)'
    : haFermata && haPartenza ? 'var(--status-amber-text)'
    : haFermata   ? 'var(--status-green-text)'
    : haPartenza  ? 'var(--status-red-text)'
    : 'var(--border)';

  return (
    <div className="rounded-xl p-3 flex flex-col gap-2 transition-all"
         style={{ background: bg, border: `1.5px solid ${borderColor}`, opacity: isSalvando ? 0.6 : 1 }}>

      {/* Numero camera */}
      <p className="text-sm font-bold text-center" style={{ color: 'var(--foreground)' }}>
        {camera.numero === 'app' ? 'App.' : camera.numero}
      </p>

      {/* Badge stato */}
      <div className="flex flex-col gap-1 items-center min-h-[40px] justify-center">
        {!haAttivita && !camera.pronta && (
          <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>—</span>
        )}
        {haFermata  && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                             style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>Fermata</span>}
        {haPartenza && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>Partenza</span>}
        {camera.pronta && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                                style={{ background: 'var(--status-blue-bg)', color: 'var(--status-blue-text)' }}>Pronta ✓</span>}
      </div>

      {/* Pulsante pronta — chiunque possa pulire, se c'è attività oggi */}
      {puoPulire && haAttivita && (
        <button onClick={() => onAggiorna(camera, 'pronta', !camera.pronta)}
                className="w-full py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                style={{
                  background: camera.pronta ? 'var(--status-blue-text)' : 'var(--background)',
                  color: camera.pronta ? 'white' : 'var(--muted-foreground)',
                  border: '0.5px solid var(--border)',
                }}>
          {camera.pronta ? <CheckCircle size={9} /> : <Circle size={9} />}
          {camera.pronta ? 'Pronta' : 'Segna'}
        </button>
      )}

      {/* Note — clicca per espandere, solo se ha attività */}
      {puoEditare && haAttivita && (
        <>
          <button onClick={() => setNoteAperta(!noteAperta)}
                  className="text-[10px] text-center"
                  style={{ color: 'var(--muted-foreground)' }}>
            {camera.note ? `📝 ${camera.note.substring(0, 12)}${camera.note.length > 12 ? '…' : ''}` : '+ nota'}
          </button>
          {noteAperta && (
            <input autoFocus type="text" placeholder="Note..." defaultValue={camera.note || ''}
                   onBlur={e => { onAggiorna(camera, 'note', e.target.value); setNoteAperta(false); }}
                   className="w-full px-1.5 py-1 rounded text-[10px] outline-none"
                   style={{ border: '0.5px solid var(--border)', background: 'var(--background)' }} />
          )}
        </>
      )}
      {/* Note in sola lettura per cameriere */}
      {!puoEditare && camera.note && (
        <p className="text-[10px] text-center truncate" style={{ color: 'var(--muted-foreground)' }}
           title={camera.note}>{camera.note}</p>
      )}
    </div>
  );
}

// Data odierna in formato locale YYYY-MM-DD — MAI new Date().toISOString(),
// che converte in UTC e in Italia (UTC+1/+2) fa perdere un giorno (bug
// scoperto il 31/07/2026: il pulsante "avanti" non cambiava nulla e
// "indietro" saltava di 2 giorni — vedi spostaGiorno sotto, stesso bug).
function oggiLocale() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PaginaCamere() {
  const { utente } = useAuth();
  const oggi = oggiLocale();
  const [data, setData] = useState(oggi);
  const [camereMap, setCamereMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(null);

  // Stato Camere (rinominata da "Camere" il 31/07/2026, spostata in sidebar
  // sotto OSPITALITÀ). Modulo 5.1 (03/08/2026): fermata/partenza sono ora
  // sola lettura per tutti (calcolate da soggiorni) — puoEditare resta solo
  // per le note (shared/ruoli.js sezione 'camere'.'scrittura').
  // puoPulire (sezione 'camere'.'pulizia'): tutti tranne cuoco, decisione
  // esplicita del titolare — prima "segna pronta" era senza restrizioni.
  const puoEditare = ['admin', 'titolare', 'receptionist', 'portiere_notte'].includes(utente?.ruolo);
  const puoPulire = ['admin', 'titolare', 'receptionist', 'cameriere', 'portiere_notte', 'dipendente'].includes(utente?.ruolo);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/camere?data=${data}`);
      // Indicizza per numero per accesso rapido
      const map = {};
      r.data.camere.forEach(c => { map[c.numero] = c; });
      setCamereMap(map);
    } catch {} finally { setLoading(false); }
  }, [data]);

  useEffect(() => { carica(); }, [carica]);

  // Aritmetica su anno/mese/giorno locali, mai toISOString() — stesso
  // pattern sicuro di spostaData() in frontend/app/planning-camere/page.jsx.
  function spostaGiorno(delta) {
    const [y, m, g] = data.split('-').map(Number);
    const d = new Date(y, m - 1, g + delta);
    setData(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }

  // campo qui è solo 'pronta' o 'note' — arrivo/partenza non sono più
  // scrivibili da questa pagina (modulo 5.1, calcolati da soggiorni).
  async function aggiorna(camera, campo, valore) {
    if (campo === 'pronta' ? !puoPulire : !puoEditare) return;
    setCamereMap(prev => ({ ...prev, [camera.numero]: { ...prev[camera.numero], [campo]: valore } }));
    setSalvando(camera.id);
    try {
      if (campo === 'pronta') {
        await api.post('/camere/pronta', { camera_id: camera.id, data, pronta: valore });
      } else {
        await api.post('/camere/stato', { camera_id: camera.id, data, note: valore });
      }
    } catch { carica(); }
    finally { setSalvando(null); }
  }

  // Contatori riepilogo
  const camere = Object.values(camereMap);
  const fermate  = camere.filter(c => c.arrivo).length;
  const partenze = camere.filter(c => c.partenza).length;
  const pronte   = camere.filter(c => c.pronta && (c.arrivo || c.partenza)).length;
  const totAttive = camere.filter(c => c.arrivo || c.partenza).length;

  return (
    <AppShell titolo="Stato Camere">

      {/* Navigazione data */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => spostaGiorno(-1)} className="p-2 rounded-lg"
                style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className="text-sm font-medium capitalize" style={{ color: 'var(--foreground)' }}>{fmt(data)}</p>
          {data === oggi && (
            <span className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--status-blue-bg)', color: 'var(--status-blue-text)' }}>Oggi</span>
          )}
        </div>
        <button onClick={() => spostaGiorno(1)} className="p-2 rounded-lg"
                style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Riepilogo — pillole compatte */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { label: 'Fermate',  val: fermate,  color: 'green' },
          { label: 'Partenze', val: partenze, color: 'red' },
          { label: 'Pronte',   val: `${pronte}/${totAttive}`, color: 'blue' },
        ].map(({ label, val, color }) => (
          <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
               style={{ background: `var(--status-${color}-bg)`, color: `var(--status-${color}-text)` }}>
            <span className="font-bold">{val}</span> {label}
          </div>
        ))}
      </div>

      {/* Griglia per piano */}
      {loading ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      ) : (
        <div className="flex flex-col gap-5">
          {PIANI.map(piano => (
            <div key={piano.label}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                 style={{ color: 'var(--muted-foreground)' }}>
                {piano.label}
              </p>
              <div className={`grid gap-2 ${piano.numeri.length === 1 ? 'grid-cols-1 max-w-[calc(20%-4px)]' : 'grid-cols-5'}`}>
                {piano.numeri.map(num => {
                  const camera = camereMap[num];
                  if (!camera) return <div key={num} />;
                  return (
                    <CardCamera
                      key={num}
                      camera={camera}
                      puoEditare={puoEditare}
                      puoPulire={puoPulire}
                      onAggiorna={aggiorna}
                      salvando={salvando}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
