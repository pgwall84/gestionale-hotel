'use client';

// Etichette periodo cliccabili (redesign UI Tariffe, terzo tentativo,
// 20/08/2026 — sostituisce TimelinePeriodi.jsx, bocciata). Ogni periodo
// stagionale diventa un'etichetta: toccarla lo seleziona, "+ nuovo periodo"
// apre un piccolo form inline (nome + due date) invece di un calendario da
// trascinare. Il periodo creato qui è sempre condiviso (stessa tabella
// periodi_stagionali usata da tariffe/regole di derivazione/supplementi
// trattamento) — comparirà come etichetta anche nelle altre schede, ma
// vuoto finché non gli si imposta un valore lì.
// Se le date inserite si sovrappongono a un periodo già esistente, il
// backend risponde 409 e l'errore viene mostrato così com'è: qui non c'è
// più un trascinamento da agganciare in automatico (quella era una
// decisione specifica del gesto di trascinamento, non più valida con un
// form scritto a mano).

import { useState } from 'react';
import api from '@/lib/api';
import CampoData from '@/components/ui/CampoData';

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

function chipStyle(attivo) {
  return {
    fontSize: '13px', padding: '6px 14px', borderRadius: '999px', cursor: 'pointer',
    border: attivo ? '1px solid var(--hotel-navy)' : '1px solid var(--border)',
    background: attivo ? 'var(--hotel-amber-light)' : 'var(--background)',
    color: attivo ? 'var(--hotel-navy)' : 'var(--muted-foreground)',
  };
}

export default function ChipPeriodi({
  periodiStagionali,
  periodoAttivoId,       // id del periodo selezionato, o null
  fallbackSelezionato,   // true se è selezionata l'etichetta "Tutto l'anno"
  allowFallback,         // se false, niente etichetta "Tutto l'anno" (caso madre: nessun concetto di fallback)
  onSelezionaPeriodo,    // (periodo) => void
  onSelezionaFallback,   // () => void
  onPeriodoCreato,       // (periodo) => void — dopo la creazione riuscita
  puoScrivere,
  onErrore,
}) {
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [nome, setNome] = useState('');
  const [dataInizio, setDataInizio] = useState('');
  const [dataFine, setDataFine] = useState('');
  const [salvataggio, setSalvataggio] = useState(false);

  function apriNuovo() {
    setNome(''); setDataInizio(''); setDataFine(''); setNuovoAperto(true); onErrore('');
  }

  async function crea() {
    if (!nome || !dataInizio || !dataFine) return onErrore('Nome e date sono obbligatori per il nuovo periodo.');
    setSalvataggio(true);
    try {
      const res = await api.post('/periodi-stagionali', { nome, data_inizio: dataInizio, data_fine: dataFine });
      setNuovoAperto(false);
      onPeriodoCreato(res.data);
    } catch (err) {
      onErrore(err.message || 'Errore nella creazione del periodo.');
    } finally {
      setSalvataggio(false);
    }
  }

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        {allowFallback && (
          <button type="button" onClick={onSelezionaFallback} style={chipStyle(fallbackSelezionato)}>
            Tutto l&apos;anno
          </button>
        )}
        {periodiStagionali.map(p => (
          <button key={p.id} type="button" onClick={() => onSelezionaPeriodo(p)} style={chipStyle(periodoAttivoId === p.id)}>
            {p.nome}
          </button>
        ))}
        {puoScrivere && !nuovoAperto && (
          <button type="button" onClick={apriNuovo}
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{ border: '1px dashed var(--border)', color: 'var(--muted-foreground)', background: 'transparent' }}>
            + nuovo periodo
          </button>
        )}
      </div>

      {nuovoAperto && (
        <div className="flex items-center gap-2 mt-2 p-2 rounded-lg" style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <input placeholder="Nome periodo" value={nome} onChange={e => setNome(e.target.value)}
                 className="flex-1 px-3 rounded-lg text-sm outline-none" style={inputStyle} />
          <CampoData value={dataInizio} onChange={v => setDataInizio(v)} className="px-3" style={{ ...inputStyle, width: '150px' }} />
          <CampoData value={dataFine} onChange={v => setDataFine(v)} className="px-3" style={{ ...inputStyle, width: '150px' }} />
          <button onClick={crea} disabled={salvataggio}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60 shrink-0"
                  style={{ background: 'var(--hotel-navy)' }}>
            {salvataggio ? '...' : 'Crea'}
          </button>
          <button onClick={() => setNuovoAperto(false)} className="text-xs font-medium px-3 py-1.5 rounded-lg border shrink-0">
            Annulla
          </button>
        </div>
      )}
    </div>
  );
}
