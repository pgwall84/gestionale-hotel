'use client';

// Pagina Monitor Cucina — tablet a parete, sempre aperto.
// Organizza le righe per comanda (tavolo), mostra timer e pulsante "Tutto pronto".
// Usa EventSource nativo (SSE) con token JWT come query param.
// Accessibile a: cuoco, admin, titolare, portiere_notte.

import { useState, useEffect, useRef, useCallback } from 'react';
import Cookies from 'js-cookie';
import AppShell from '@/components/layout/AppShell';
import api from '@/lib/api';

// Soglie timer in minuti
const TIMER_GIALLO = 8;
const TIMER_ROSSO  = 12;

// ── Match allergeni (stessa logica di ristorante/page.jsx) ───────────────────
const KEYWORD_MAP = {
  'glutine':            ['glutine', 'celiaco', 'celiachia', 'grano', 'frumento', 'senza glutine'],
  'lattosio':           ['lattosio', 'latte', 'latticini', 'formaggio', 'burro', 'panna'],
  'uova':               ['uova', 'uovo'],
  'frutta secca':       ['frutta secca', 'noci', 'arachidi', 'mandorle', 'nocciole', 'pistacchi'],
  'pesce':              ['pesce'],
  'crostacei':          ['crostacei', 'gamberi', 'aragoste', 'granchio'],
  'soia':               ['soia'],
  'sedano':             ['sedano'],
  'senape':             ['senape'],
  'sesamo':             ['sesamo'],
  'lupini':             ['lupini'],
  'molluschi':          ['molluschi', 'cozze', 'vongole', 'calamari'],
  'anidride solforosa': ['solfiti', 'solforosa', 'anidride solforosa'],
};

function hasMatch(allergeniPiatto, noteAllergie) {
  if (!noteAllergie || !allergeniPiatto?.length) return [];
  const noteLC = noteAllergie.toLowerCase();
  return allergeniPiatto.filter(all => {
    const keys = KEYWORD_MAP[all.toLowerCase()] || [all.toLowerCase()];
    return keys.some(k => noteLC.includes(k));
  });
}

const PAROLE_ALLERTA = [
  'celiaco', 'celiachia', 'allergi', 'senza glutine',
  'intolleranza', 'lattosio', 'arachidi', 'frutta secca',
  'soia', 'crostacei', 'molluschi',
];
function notaEAllerta(nota) {
  if (!nota) return false;
  return PAROLE_ALLERTA.some(p => nota.toLowerCase().includes(p));
}

function coloreTimer(minuti) {
  if (minuti >= TIMER_ROSSO)  return '#DC2626'; // rosso
  if (minuti >= TIMER_GIALLO) return '#D97706'; // giallo/amber
  return '#16A34A';                              // verde
}

// Raggruppa array di righe in array di comande { comanda_id, tavolo_numero, timestamp_apertura, righe[] }
function raggruppaPerComanda(righe) {
  const mappa = new Map();
  for (const r of righe) {
    if (!mappa.has(r.comanda_id)) {
      mappa.set(r.comanda_id, {
        comanda_id:        r.comanda_id,
        tavolo_numero:     r.tavolo_numero,
        timestamp_apertura: r.timestamp_apertura,
        righe:             [],
      });
    }
    mappa.get(r.comanda_id).righe.push(r);
  }
  // Ordina per timestamp_apertura ASC (comanda più vecchia prima)
  return Array.from(mappa.values()).sort(
    (a, b) => new Date(a.timestamp_apertura) - new Date(b.timestamp_apertura)
  );
}

function CardRiga({ riga, noteAllergie, onAvanza }) {
  const labelStato = {
    in_attesa:       'In attesa',
    in_preparazione: 'In prep.',
    pronto:          'Pronto ✓',
  }[riga.stato] ?? riga.stato;

  const coloreTesto = {
    in_attesa:       'var(--muted-foreground)',
    in_preparazione: 'var(--status-amber-text)',
    pronto:          'var(--status-green-text)',
  }[riga.stato] ?? 'var(--foreground)';

  const match       = hasMatch(riga.allergeni, noteAllergie);
  const haMatch     = match.length > 0;
  const notaAllerta = notaEAllerta(riga.note);

  return (
    <div className="flex flex-col gap-1 py-1.5"
         style={{
           borderBottom: '1px solid var(--border)',
           background: haMatch ? '#FFF8F8' : 'transparent',
           borderRadius: haMatch ? 4 : 0,
           padding: haMatch ? '6px 4px' : undefined,
         }}>
      {/* Riga nome + stato + pulsante */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm flex-1 min-w-0 truncate"
              style={{ color: 'var(--foreground)' }}>
          {riga.quantita}× {riga.piatto_nome}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium" style={{ color: coloreTesto }}>{labelStato}</span>
          {riga.stato === 'in_attesa' && (
            <button onClick={() => onAvanza(riga.id, 'in_preparazione')}
                    data-testid="btn-avanza-cucina"
                    data-stato-corrente={riga.stato}
                    className="px-2 py-1 rounded text-xs font-bold"
                    style={{ background: 'var(--hotel-amber)', color: '#fff' }}>
              ▶ Inizia
            </button>
          )}
          {riga.stato === 'in_preparazione' && (
            <button onClick={() => onAvanza(riga.id, 'pronto')}
                    data-testid="btn-avanza-cucina"
                    data-stato-corrente={riga.stato}
                    className="px-2 py-1 rounded text-xs font-bold"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              ✓ Pronto
            </button>
          )}
        </div>
      </div>

      {/* Allergeni piatto */}
      {riga.allergeni?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {riga.allergeni.map(all => (
            <span key={all} className="text-xs px-1.5 py-0.5 rounded-full"
                  style={match.includes(all)
                    ? { background: '#FCEBEB', border: '1px solid #F09595', color: '#A32D2D' }
                    : { background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }
                  }>
              {all}
            </span>
          ))}
        </div>
      )}

      {/* Nota cameriere */}
      {riga.note && (
        notaAllerta ? (
          <div className="flex items-center gap-1 rounded px-2 py-1"
               style={{ background: '#FCEBEB', border: '1px solid #F09595' }}>
            <span style={{ fontSize: 12 }}>⚠</span>
            <span className="text-xs font-medium" style={{ color: '#A32D2D' }}>{riga.note}</span>
          </div>
        ) : (
          <span className="text-xs italic" style={{ color: 'var(--muted-foreground)' }}>
            📝 {riga.note}
          </span>
        )
      )}
    </div>
  );
}

function CardComanda({ comanda, minuti, noteAllergie, onAvanza, onTuttoProonto }) {
  const tCol = coloreTimer(minuti);
  const haRigheDaFare = comanda.righe.some(
    r => r.stato === 'in_attesa' || r.stato === 'in_preparazione'
  );

  return (
    <div data-testid="comanda-card"
         data-comanda-id={comanda.comanda_id}
         className="rounded-xl overflow-hidden"
         style={{ background: 'var(--card)', border: '2px solid var(--border)' }}>

      {/* Header comanda */}
      <div className="flex items-center justify-between px-3 py-2"
           style={{ background: tCol + '1A', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="font-bold text-base" style={{ color: 'var(--foreground)' }}>
            Tavolo {comanda.tavolo_numero}
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: tCol + '33', color: tCol }}>
            ⏱ {minuti}min
          </span>
        </div>
        {haRigheDaFare && (
          <button
            onClick={() => onTuttoProonto(comanda.comanda_id)}
            data-testid="btn-tutto-pronto"
            className="text-xs font-bold px-3 py-1 rounded-lg"
            style={{ background: 'var(--status-green-text)', color: '#fff' }}>
            Tutto pronto
          </button>
        )}
      </div>

      {/* Elenco righe */}
      <div className="px-3 py-1">
        {comanda.righe.map(r => (
          <CardRiga key={r.id} riga={r} noteAllergie={noteAllergie} onAvanza={onAvanza} />
        ))}
      </div>
    </div>
  );
}

export default function CucinaPage() {
  const [righe, setRighe]               = useState([]);
  const [noteAllergie, setNoteAllergie] = useState(null);
  const [connesso, setConnesso]         = useState(false);
  const [errore, setErrore]             = useState(null);
  const [tick, setTick]                 = useState(0); // forza re-render ogni minuto per timer
  const esRef = useRef(null);

  // Aggiorna i timer ogni minuto
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const avanzaStato = useCallback(async (rigaId, nuovoStato) => {
    try {
      await api.patch(`/ristorante/comande/righe/${rigaId}/stato`, { stato: nuovoStato });
    } catch (err) {
      alert(err.message || 'Errore aggiornamento stato');
    }
  }, []);

  const tuttoProonto = useCallback(async (comandaId) => {
    try {
      await api.post(`/ristorante/comande/${comandaId}/tutto-pronto`, {});
    } catch (err) {
      alert(err.message || 'Errore tutto pronto');
    }
  }, []);

  const connetti = useCallback(() => {
    const token = Cookies.get('token');
    if (!token) {
      setErrore('Token non trovato — effettua il login.');
      return;
    }
    if (esRef.current) esRef.current.close();

    // URL calcolato a runtime per funzionare su IP locale e ngrok
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const url = `${protocol}//${hostname}:7001/api/ristorante/cucina/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => { setConnesso(true); setErrore(null); };

    es.onmessage = (e) => {
      try {
        const dati = JSON.parse(e.data);
        switch (dati.evento) {
          case 'stato_iniziale':
            setRighe(dati.righe || []);
            if (dati.note_allergie_oggi !== undefined) setNoteAllergie(dati.note_allergie_oggi);
            break;
          case 'nuova_riga':
            setRighe(prev => [...prev, dati.riga]);
            break;
          case 'stato_riga_aggiornato':
            setRighe(prev => prev.map(r => r.id === dati.riga.id ? { ...r, ...dati.riga } : r));
            break;
          case 'riga_rimossa':
            setRighe(prev => prev.filter(r => r.id !== parseInt(dati.riga_id)));
            break;
          case 'comanda_chiusa':
            setRighe(prev => prev.filter(r => r.comanda_id !== parseInt(dati.comanda_id)));
            break;
        }
      } catch (_) {}
    };

    es.onerror = () => {
      setConnesso(false);
      es.close();
      setTimeout(connetti, 5000);
    };
  }, []);

  useEffect(() => {
    connetti();
    return () => esRef.current?.close();
  }, [connetti]);

  // Filtra righe per sezione
  const righeAttive  = righe.filter(r => r.stato !== 'servito');
  const comandeDaFare = raggruppaPerComanda(
    righeAttive.filter(r => r.stato === 'in_attesa' || r.stato === 'in_preparazione')
  );
  // Comande dove TUTTE le righe attive sono pronte (nessuna in_attesa/in_preparazione)
  const comandePronteIds = new Set(
    righeAttive
      .filter(r => r.stato === 'pronto')
      .map(r => r.comanda_id)
      .filter(id => !righeAttive.some(r => r.comanda_id === id && r.stato !== 'pronto'))
  );
  const comandePronteArr = raggruppaPerComanda(
    righeAttive.filter(r => comandePronteIds.has(r.comanda_id))
  );

  const now = Date.now();
  const minutiPerComanda = (ts) =>
    ts ? Math.floor((now - new Date(ts).getTime()) / 60000) : 0;

  return (
    <AppShell>
      <div className="p-4 flex flex-col gap-4 max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="font-bold text-xl" style={{ color: 'var(--foreground)' }}>Monitor Cucina</h1>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full"
                 style={{ background: connesso ? 'var(--status-green-text)' : 'var(--status-red-text)' }} />
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {connesso ? 'In diretta' : 'Disconnesso...'}
            </span>
            {!connesso && (
              <button onClick={connetti} className="text-xs px-2 py-1 rounded"
                      style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                Riconnetti
              </button>
            )}
          </div>
        </div>

        {errore && (
          <div className="rounded-lg p-3 text-sm text-center"
               style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
            {errore}
          </div>
        )}

        {/* Da preparare */}
        {comandeDaFare.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-wider"
               style={{ color: 'var(--muted-foreground)' }}>
              Da preparare ({comandeDaFare.length} {comandeDaFare.length === 1 ? 'tavolo' : 'tavoli'})
            </p>
            {comandeDaFare.map(c => (
              <CardComanda
                key={c.comanda_id}
                comanda={c}
                minuti={minutiPerComanda(c.timestamp_apertura)}
                noteAllergie={noteAllergie}
                onAvanza={avanzaStato}
                onTuttoProonto={tuttoProonto}
              />
            ))}
          </div>
        )}

        {/* Pronti */}
        {comandePronteArr.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-wider"
               style={{ color: 'var(--status-green-text)' }}>
              Pronti — attendono il cameriere ({comandePronteArr.length})
            </p>
            {comandePronteArr.map(c => (
              <CardComanda
                key={c.comanda_id}
                comanda={c}
                minuti={minutiPerComanda(c.timestamp_apertura)}
                noteAllergie={noteAllergie}
                onAvanza={avanzaStato}
                onTuttoProonto={tuttoProonto}
              />
            ))}
          </div>
        )}

        {connesso && comandeDaFare.length === 0 && comandePronteArr.length === 0 && (
          <div className="text-center py-20 flex flex-col gap-2">
            <p className="text-4xl">✓</p>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Nessun piatto in coda
            </p>
          </div>
        )}

        {!connesso && comandeDaFare.length === 0 && comandePronteArr.length === 0 && (
          <p className="text-center py-16 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Connessione in corso...
          </p>
        )}
      </div>
    </AppShell>
  );
}
