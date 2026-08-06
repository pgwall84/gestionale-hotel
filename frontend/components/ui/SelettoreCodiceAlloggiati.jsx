'use client';

// Campo testo libero + suggerimenti per i dati documento/nazionalità
// (Modulo 2.5). NON blocca mai l'inserimento: la reception può sempre
// scrivere un valore a testo libero leggendolo dal documento del cliente,
// anche se le tabelle di codifica Alloggiati Web non sono mai state
// sincronizzate (correzione del 01/08/2026 — la versione precedente
// obbligava a scegliere da una tendina alimentata solo da alloggiati_codici,
// bloccando la registrazione di un ospite se quella tabella era vuota).
// Se il testo digitato corrisponde a un suggerimento (da GET
// /api/alloggiati/codici, sincronizzato da Impostazioni ▸ Alloggiati Web),
// selezionandolo si abbina anche il codice ufficiale — serve solo più avanti
// per l'invio della schedina (modulo 2.5, Fase 2), non per registrare
// l'ospite oggi.
//
// Controllato dal genitore: testo e codice sono entrambi prop, non stato
// interno — onCambiamento(nuovoTesto, nuovoCodice) viene chiamato sia
// quando l'utente digita (codice sempre azzerato: un testo modificato a
// mano non è più garantito corrispondere al codice già abbinato) sia
// quando sceglie un suggerimento (testo e codice aggiornati insieme).

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';

const inputStyleDefault = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

// endpoint (04/08/2026): di norma '/alloggiati/codici' (autenticato), ma il
// form pubblico di pre check-in (/pre-checkin/[token], nessun login) passa
// '/pre-checkin-pubblico/codici' — stesso dato (tabelle di codifica
// ufficiali, non informazioni personali), esposto anche senza token lì.
export default function SelettoreCodiceAlloggiati({ tabella, testo, codice, onCambiamento, placeholder, disabled, endpoint = '/alloggiati/codici' }) {
  const [risultati, setRisultati] = useState([]);
  const [aperto, setAperto] = useState(false);
  const [caricamento, setCaricamento] = useState(false);
  const containerRef = useRef(null);

  const cerca = useCallback(async (termine) => {
    if (!termine || termine.length < 2) { setRisultati([]); return; }
    setCaricamento(true);
    try {
      const res = await api.get(`${endpoint}?tabella=${tabella}&search=${encodeURIComponent(termine)}`);
      setRisultati(res.data);
    } catch {
      setRisultati([]);
    } finally {
      setCaricamento(false);
    }
  }, [tabella, endpoint]);

  useEffect(() => {
    const timer = setTimeout(() => cerca(testo), 300);
    return () => clearTimeout(timer);
  }, [testo, cerca]);

  useEffect(() => {
    function chiudiSeFuori(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setAperto(false);
    }
    document.addEventListener('mousedown', chiudiSeFuori);
    return () => document.removeEventListener('mousedown', chiudiSeFuori);
  }, []);

  function seleziona(riga) {
    setAperto(false);
    onCambiamento(riga.descrizione, riga.codice);
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        value={testo || ''}
        onChange={e => {
          // Testo modificato a mano: azzera il codice già abbinato (se
          // c'era) — un testo che non coincide più con il suggerimento
          // scelto non va salvato come se fosse ancora quel codice.
          onCambiamento(e.target.value, null);
          setAperto(true);
        }}
        onFocus={() => setAperto(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 rounded-lg text-sm outline-none"
        style={{ ...inputStyleDefault, paddingRight: codice ? '28px' : undefined }}
      />
      {codice && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px]"
              style={{ color: 'var(--status-green-text)' }}
              title="Abbinato a un codice ufficiale Alloggiati Web">
          ✓
        </span>
      )}
      {aperto && !disabled && (risultati.length > 0 || caricamento) && (
        <div className="absolute z-10 w-full mt-1 rounded-lg shadow-lg max-h-48 overflow-y-auto"
             style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          {caricamento ? (
            <p className="px-3 py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>Ricerca...</p>
          ) : (
            risultati.map(r => (
              <button key={r.codice} type="button" onClick={() => seleziona(r)}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      style={{ color: 'var(--foreground)' }}>
                {r.descrizione}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
