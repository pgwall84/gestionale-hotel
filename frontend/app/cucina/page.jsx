'use client';

// Pagina Monitor Cucina — tablet a parete, sempre aperto.
// Usa EventSource nativo (SSE) passando il token JWT come query param,
// perché il browser non supporta header personalizzati su EventSource.
// Accessibile a: cuoco, admin, titolare, portiere_notte.

import { useState, useEffect, useRef, useCallback } from 'react';
import Cookies from 'js-cookie';
import AppShell from '@/components/layout/AppShell';
import api from '@/lib/api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';

const STATI = {
  in_attesa:       { label: 'In attesa',       color: 'var(--muted-foreground)', btnBg: 'var(--status-amber-bg)',  btnColor: 'var(--status-amber-text)', btnLabel: 'Inizia' },
  in_preparazione: { label: 'In preparazione', color: 'var(--status-amber-text)', btnBg: 'var(--status-green-bg)', btnColor: 'var(--status-green-text)', btnLabel: 'Pronto ✓' },
  pronto:          { label: 'Pronto',           color: 'var(--status-green-text)', btnBg: null, btnLabel: null },
};

const BORDI = {
  in_attesa:       'var(--border)',
  in_preparazione: 'var(--status-amber-text)',
  pronto:          'var(--status-green-text)',
};

function CardPiatto({ riga, onAvanza }) {
  const s = STATI[riga.stato] || STATI.in_attesa;
  const border = BORDI[riga.stato] || 'var(--border)';

  // Minuti da quando è arrivato il piatto
  const apertura = riga.comanda_apertura || riga.timestamp_apertura;
  const minuti = apertura
    ? Math.round((Date.now() - new Date(apertura).getTime()) / 60000)
    : null;

  return (
    <div data-testid="comanda-card"
         data-riga-id={riga.id}
         data-stato={riga.stato}
         className="rounded-xl p-3 flex flex-col gap-2"
         style={{ background: 'var(--card)', border: `2px solid ${border}` }}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <p className="font-bold" style={{ color: 'var(--foreground)' }}>
            {riga.quantita}× {riga.piatto_nome}
          </p>
          <p className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>
            Tavolo {riga.tavolo_numero}
          </p>
          {riga.note && (
            <p className="text-xs italic mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              📝 {riga.note}
            </p>
          )}
        </div>
        <div className="text-right">
          <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>
          {minuti !== null && minuti >= 15 && (
            <p className="text-xs font-bold" style={{ color: 'var(--status-red-text)' }}>⚠️ {minuti}min</p>
          )}
          {minuti !== null && minuti > 0 && minuti < 15 && (
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{minuti}min</p>
          )}
        </div>
      </div>
      {s.btnLabel && (
        <button
          onClick={() => onAvanza(riga.id, riga.stato === 'in_attesa' ? 'in_preparazione' : 'pronto')}
          data-testid="btn-avanza-cucina"
          data-stato-corrente={riga.stato}
          className="w-full py-2 rounded-lg text-sm font-bold"
          style={{ background: s.btnBg, color: s.btnColor }}
        >
          {s.btnLabel}
        </button>
      )}
    </div>
  );
}

export default function CucinaPage() {
  const [righe, setRighe] = useState([]);
  const [connesso, setConnesso] = useState(false);
  const [errore, setErrore] = useState(null);
  const esRef = useRef(null);

  const avanzaStato = useCallback(async (rigaId, nuovoStato) => {
    try {
      await api.patch(`/ristorante/comande/righe/${rigaId}/stato`, { stato: nuovoStato });
      // L'aggiornamento torna via SSE — non serve setState manuale
    } catch (err) {
      alert(err.message || 'Errore aggiornamento stato');
    }
  }, []);

  const connetti = useCallback(() => {
    const token = Cookies.get('token');
    if (!token) {
      setErrore('Token non trovato — effettua il login.');
      return;
    }

    // Chiudi connessione precedente se esiste
    if (esRef.current) {
      esRef.current.close();
    }

    // EventSource nativo — URL calcolato a runtime per funzionare su IP locale e ngrok
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const url = `${protocol}//${hostname}:7001/api/ristorante/cucina/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setConnesso(true);
      setErrore(null);
    };

    es.onmessage = (e) => {
      try {
        const dati = JSON.parse(e.data);
        switch (dati.evento) {
          case 'stato_iniziale':
            setRighe(dati.righe || []);
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
      // Riconnette dopo 5 secondi
      setTimeout(connetti, 5000);
    };
  }, []);

  useEffect(() => {
    connetti();
    return () => {
      esRef.current?.close();
    };
  }, [connetti]);

  const daFare = righe.filter(r => r.stato === 'in_attesa' || r.stato === 'in_preparazione');
  const pronti = righe.filter(r => r.stato === 'pronto');

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
        {daFare.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-wider"
               style={{ color: 'var(--muted-foreground)' }}>
              Da preparare ({daFare.length})
            </p>
            <div className="grid grid-cols-2 gap-2">
              {daFare.map(r => (
                <CardPiatto key={r.id} riga={r} onAvanza={avanzaStato} />
              ))}
            </div>
          </div>
        )}

        {/* Pronti da servire */}
        {pronti.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-wider"
               style={{ color: 'var(--status-green-text)' }}>
              Pronti — attendono il cameriere ({pronti.length})
            </p>
            <div className="grid grid-cols-2 gap-2">
              {pronti.map(r => (
                <CardPiatto key={r.id} riga={r} onAvanza={avanzaStato} />
              ))}
            </div>
          </div>
        )}

        {connesso && daFare.length === 0 && pronti.length === 0 && (
          <div className="text-center py-20 flex flex-col gap-2">
            <p className="text-4xl">✓</p>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Nessun piatto in coda
            </p>
          </div>
        )}

        {!connesso && daFare.length === 0 && pronti.length === 0 && (
          <p className="text-center py-16 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Connessione in corso...
          </p>
        )}
      </div>
    </AppShell>
  );
}
