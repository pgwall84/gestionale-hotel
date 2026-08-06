'use client';

// Campo testo libero + suggerimenti per la sigla provincia di nascita
// (04/08/2026). Stesso concetto di SelettoreCodiceAlloggiati.jsx (testo
// libero, mai bloccante — l'utente può sempre digitare una sigla che non è
// in elenco) ma completamente lato client: la sigla provincia NON è una
// tabella ufficiale WS_ALLOGGIATI, è solo l'elenco fisso delle sigle
// automobilistiche (frontend/lib/provinceItaliane.js) — nessuna chiamata
// di rete, funziona anche nel form pubblico di pre check-in senza login.
//
// Controllato dal genitore: valore (sigla, es. "SP") è una prop, non stato
// interno — onCambiamento(nuovaSigla) viene chiamato sia digitando sia
// scegliendo un suggerimento.

import { useState, useMemo, useRef, useEffect } from 'react';
import { PROVINCE_ITALIANE } from '@/lib/provinceItaliane';

const inputStyleDefault = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

export default function SelettoreProvincia({ valore, onCambiamento, placeholder, disabled }) {
  const [aperto, setAperto] = useState(false);
  const containerRef = useRef(null);

  const risultati = useMemo(() => {
    const termine = (valore || '').trim().toUpperCase();
    if (!termine) return [];
    return PROVINCE_ITALIANE
      .filter(p => p.sigla.startsWith(termine) || p.nome.toUpperCase().includes(termine))
      .slice(0, 8);
  }, [valore]);

  useEffect(() => {
    function chiudiSeFuori(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setAperto(false);
    }
    document.addEventListener('mousedown', chiudiSeFuori);
    return () => document.removeEventListener('mousedown', chiudiSeFuori);
  }, []);

  function seleziona(p) {
    setAperto(false);
    onCambiamento(p.sigla);
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        value={valore || ''}
        onChange={e => { onCambiamento(e.target.value.toUpperCase()); setAperto(true); }}
        onFocus={() => setAperto(true)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={2}
        className="w-full px-3 rounded-lg text-sm outline-none"
        style={inputStyleDefault}
      />
      {aperto && !disabled && risultati.length > 0 && (
        <div className="absolute z-10 w-full mt-1 rounded-lg shadow-lg max-h-48 overflow-y-auto"
             style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          {risultati.map(p => (
            <button key={p.sigla} type="button" onClick={() => seleziona(p)}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    style={{ color: 'var(--foreground)' }}>
              {p.sigla} — {p.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
