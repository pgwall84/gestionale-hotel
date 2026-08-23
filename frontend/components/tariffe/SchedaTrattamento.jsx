'use client';

// Scheda supplemento trattamento (redesign UI Tariffe, terzo tentativo,
// 20/08/2026 — sostituisce PannelloSupplementoTrattamento.jsx +
// TimelinePeriodi.jsx, entrambi superati). Toggle categoria/trattamento in
// alto, poi le stesse etichette periodo (ChipPeriodi) usate nella scheda
// prezzo — la timeline è condivisa dai due trattamenti della stessa
// categoria, non serve raddoppiarla. /api/tariffe-derivate/trattamento fa
// upsert su categoria+periodo+trattamento lato server, quindi qui si usa
// sempre POST.

import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import api from '@/lib/api';
import ChipPeriodi from './ChipPeriodi';

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

function pillModo(attivo) {
  return {
    fontSize: '13px', fontWeight: 500, padding: '6px 14px', borderRadius: 'var(--radius)', cursor: 'pointer',
    border: attivo ? 'none' : '1px solid var(--border)',
    background: attivo ? 'var(--hotel-navy)' : 'transparent',
    color: attivo ? 'white' : 'var(--muted-foreground)',
  };
}

const TRATTAMENTI = [
  { value: 'mezza_pensione', label: 'Mezza pensione' },
  { value: 'pensione_completa', label: 'Pensione completa' },
];

export default function SchedaTrattamento({ periodiStagionali, supplementiTutti, puoScrivere, onCambiato, onErrore }) {
  const [categoria, setCategoria] = useState('doppia');
  const [trattamento, setTrattamento] = useState('mezza_pensione');
  const [periodoAttivoId, setPeriodoAttivoId] = useState(null);
  const [fallbackSelezionato, setFallbackSelezionato] = useState(true);
  const [supplementoAPersona, setSupplementoAPersona] = useState('');
  const [salvataggio, setSalvataggio] = useState(false);

  useEffect(() => {
    setFallbackSelezionato(true);
    setPeriodoAttivoId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria]);

  const supplementiCategoria = supplementiTutti.filter(s => s.categoria === categoria);
  const periodoAttivo = periodoAttivoId ? periodiStagionali.find(p => p.id === periodoAttivoId) || null : null;
  const contestoSelezionato = !!periodoAttivo || fallbackSelezionato;

  const valoreEsistente = supplementiCategoria.find(
    s => (periodoAttivo ? s.periodo_id === periodoAttivo.id : s.periodo_id === null) && s.trattamento === trattamento
  ) || null;

  useEffect(() => {
    setSupplementoAPersona(valoreEsistente ? String(valoreEsistente.supplemento_a_persona) : '');
  }, [valoreEsistente]);

  function selezionaPeriodo(p) { setPeriodoAttivoId(p.id); setFallbackSelezionato(false); }
  function selezionaFallback() { setFallbackSelezionato(true); setPeriodoAttivoId(null); }
  function periodoCreato(p) { onCambiato(); setPeriodoAttivoId(p.id); setFallbackSelezionato(false); }

  async function salva() {
    if (supplementoAPersona === '' || Number(supplementoAPersona) < 0) return onErrore('Il supplemento a persona è obbligatorio.');
    setSalvataggio(true);
    try {
      await api.post('/tariffe-derivate/trattamento', {
        categoria,
        periodo_id: periodoAttivo ? periodoAttivo.id : null,
        trattamento,
        supplemento_a_persona: Number(supplementoAPersona),
      });
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nel salvataggio del supplemento.');
    } finally {
      setSalvataggio(false);
    }
  }

  async function elimina() {
    if (!valoreEsistente) return;
    if (!confirm('Eliminare questo supplemento?')) return;
    try {
      await api.delete(`/tariffe-derivate/trattamento/${valoreEsistente.id}`);
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nell\'eliminazione.');
    }
  }

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--foreground)' }}>Supplemento trattamento</h3>
      <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
        A persona, per notte — sommato al prezzo B&amp;B della camera quando l&apos;ospite sceglie mezza pensione o pensione completa (online o in reception).
      </p>

      <div className="flex gap-2 mb-2">
        <button onClick={() => setCategoria('singola')} style={pillModo(categoria === 'singola')}>Camere singole (capienza 1)</button>
        <button onClick={() => setCategoria('doppia')} style={pillModo(categoria === 'doppia')}>Camere doppie e superiori</button>
      </div>
      <div className="flex gap-2 mb-3">
        {TRATTAMENTI.map(t => (
          <button key={t.value} onClick={() => setTrattamento(t.value)} style={pillModo(trattamento === t.value)}>{t.label}</button>
        ))}
      </div>

      <ChipPeriodi
        periodiStagionali={periodiStagionali}
        periodoAttivoId={periodoAttivoId}
        fallbackSelezionato={fallbackSelezionato}
        allowFallback
        onSelezionaPeriodo={selezionaPeriodo}
        onSelezionaFallback={selezionaFallback}
        onPeriodoCreato={periodoCreato}
        puoScrivere={puoScrivere}
        onErrore={onErrore}
      />

      {!contestoSelezionato ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--muted-foreground)' }}>
          Tocca un&apos;etichetta periodo qui sopra, o crea un nuovo periodo per impostare il supplemento.
        </p>
      ) : (
        <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          {!valoreEsistente && (
            <p className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>Nessun supplemento impostato per questo periodo/trattamento.</p>
          )}
          <input type="number" min={0} step="0.01" placeholder="€ a persona a notte" value={supplementoAPersona}
                 onChange={e => setSupplementoAPersona(e.target.value)} disabled={!puoScrivere}
                 className="w-full mb-2 px-3 rounded-lg text-sm outline-none" style={inputStyle} />
          {puoScrivere && (
            <div className="flex items-center gap-2">
              <button onClick={salva} disabled={salvataggio}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                      style={{ background: 'var(--hotel-navy)' }}>
                {salvataggio ? 'Salvataggio...' : 'Salva'}
              </button>
              {valoreEsistente && (
                <button onClick={elimina} className="p-1.5 rounded-lg hover:bg-gray-100" style={{ color: 'var(--status-red-text)' }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
