'use client';

// Scheda prezzo per una tipologia camera (redesign UI Tariffe, terzo
// tentativo, 20/08/2026 — sostituisce PannelloPrezzoTipologia.jsx +
// TimelinePeriodi.jsx, entrambi superati). Un'unica card auto-contenuta:
// etichette periodo (ChipPeriodi) + form prezzo, che cambia forma da solo
// in base a se il tipo camera è "madre" (prezzo diretto, tabella tariffe)
// o "derivata" (percentuale + range dichiarato, tabella
// regole_derivazione_tariffe) — dedotto dai dati passati dal genitore, mai
// da un elenco fisso di nomi.
// Salvataggio: 'madre' distingue POST (nuova fascia) da PATCH (fascia
// esistente) perché /api/tariffe non fa upsert lato server; 'derivata' usa
// sempre POST perché /api/tariffe-derivate/derivazione fa upsert su
// tipo+periodo lato server (vedi tariffeDerivateController.js).

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

export default function SchedaPrezzoTipologia({
  tipo,                // {id, nome}
  tipiCamera,           // tutti i tipi (selettore "deriva da", solo modo derivata)
  periodiStagionali,
  isDerivata,
  regolePerTipo,        // righe regole_derivazione_tariffe per questo tipo (solo se isDerivata)
  tariffePerTipo,        // righe tariffe per questo tipo (solo se !isDerivata)
  tariffeTutte,          // tutte le righe tariffe (per l'anteprima calcolo: prezzo del tipo base)
  puoScrivere,
  onCambiato,
  onErrore,
}) {
  const [periodoAttivoId, setPeriodoAttivoId] = useState(null);
  const [fallbackSelezionato, setFallbackSelezionato] = useState(isDerivata);

  // Selezione di default solo quando cambia la tipologia mostrata — non ad
  // ogni refetch dopo un salvataggio, altrimenti si perderebbe la scelta
  // dell'utente subito dopo aver premuto Salva.
  useEffect(() => {
    if (isDerivata) {
      setFallbackSelezionato(true);
      setPeriodoAttivoId(null);
    } else {
      const prima = tariffePerTipo.find(t => t.periodo_id != null);
      setPeriodoAttivoId(prima ? prima.periodo_id : null);
      setFallbackSelezionato(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo.id, isDerivata]);

  const [tipoBaseId, setTipoBaseId] = useState('');
  const [percentuale, setPercentuale] = useState('');
  const [prezzoMinimo, setPrezzoMinimo] = useState('');
  const [prezzoMassimo, setPrezzoMassimo] = useState('');
  const [prezzoNotte, setPrezzoNotte] = useState('');
  const [nomeStagione, setNomeStagione] = useState('');
  const [salvataggio, setSalvataggio] = useState(false);

  const periodoAttivo = periodoAttivoId ? periodiStagionali.find(p => p.id === periodoAttivoId) || null : null;
  const contestoSelezionato = isDerivata ? (!!periodoAttivo || fallbackSelezionato) : !!periodoAttivo;

  const valoreEsistente = isDerivata
    ? (regolePerTipo.find(r => periodoAttivo ? r.periodo_id === periodoAttivo.id : r.periodo_id === null) || null)
    : (periodoAttivo ? tariffePerTipo.find(t => t.periodo_id === periodoAttivo.id) || null : null);

  useEffect(() => {
    if (isDerivata) {
      setTipoBaseId(valoreEsistente ? String(valoreEsistente.tipo_camera_base_id) : '');
      setPercentuale(valoreEsistente ? String(valoreEsistente.percentuale) : '');
      setPrezzoMinimo(valoreEsistente?.prezzo_minimo != null ? String(valoreEsistente.prezzo_minimo) : '');
      setPrezzoMassimo(valoreEsistente?.prezzo_massimo != null ? String(valoreEsistente.prezzo_massimo) : '');
    } else {
      setPrezzoNotte(valoreEsistente ? String(valoreEsistente.prezzo_notte) : '');
      setNomeStagione(valoreEsistente?.nome_stagione ?? (periodoAttivo ? periodoAttivo.nome : ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valoreEsistente, isDerivata]);

  function selezionaPeriodo(p) { setPeriodoAttivoId(p.id); setFallbackSelezionato(false); }
  function selezionaFallback() { setFallbackSelezionato(true); setPeriodoAttivoId(null); }
  function periodoCreato(p) { onCambiato(); setPeriodoAttivoId(p.id); setFallbackSelezionato(false); }

  async function salvaMadre() {
    if (!periodoAttivo) return onErrore('Seleziona o crea un periodo per impostare il prezzo.');
    if (prezzoNotte === '' || Number(prezzoNotte) <= 0) return onErrore('Il prezzo per notte deve essere maggiore di zero.');
    setSalvataggio(true);
    try {
      const body = {
        tipo_camera_id: tipo.id,
        nome_stagione: nomeStagione || periodoAttivo.nome,
        data_inizio: periodoAttivo.data_inizio,
        data_fine: periodoAttivo.data_fine,
        prezzo_notte: Number(prezzoNotte),
        periodo_id: periodoAttivo.id,
      };
      if (valoreEsistente) await api.patch(`/tariffe/${valoreEsistente.id}`, body);
      else await api.post('/tariffe', body);
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nel salvataggio del prezzo.');
    } finally {
      setSalvataggio(false);
    }
  }

  async function salvaDerivata() {
    if (!tipoBaseId) return onErrore('Scegli da quale tipo camera deriva il prezzo.');
    if (percentuale === '') return onErrore('La percentuale è obbligatoria.');
    if (prezzoMinimo !== '' && prezzoMassimo !== '' && Number(prezzoMassimo) < Number(prezzoMinimo)) {
      return onErrore('Il prezzo massimo deve essere maggiore o uguale al minimo.');
    }
    setSalvataggio(true);
    try {
      await api.post('/tariffe-derivate/derivazione', {
        tipo_camera_id: tipo.id,
        tipo_camera_base_id: Number(tipoBaseId),
        periodo_id: periodoAttivo ? periodoAttivo.id : null,
        percentuale: Number(percentuale),
        prezzo_minimo: prezzoMinimo === '' ? null : Number(prezzoMinimo),
        prezzo_massimo: prezzoMassimo === '' ? null : Number(prezzoMassimo),
      });
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nel salvataggio della regola.');
    } finally {
      setSalvataggio(false);
    }
  }

  async function elimina() {
    if (!valoreEsistente) return;
    if (!confirm('Eliminare questo prezzo?')) return;
    try {
      if (isDerivata) await api.delete(`/tariffe-derivate/derivazione/${valoreEsistente.id}`);
      else await api.delete(`/tariffe/${valoreEsistente.id}`);
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nell\'eliminazione.');
    }
  }

  // Anteprima calcolo (solo derivata, solo con un periodo specifico
  // selezionato — con "Tutto l'anno" il prezzo base cambia notte per notte
  // secondo le fasce dirette, non esiste un singolo numero da mostrare).
  let anteprima = null;
  if (isDerivata && periodoAttivo && valoreEsistente && tipoBaseId) {
    const tariffaBase = tariffeTutte.find(t => String(t.tipo_camera_id) === String(tipoBaseId) && t.periodo_id === periodoAttivo.id);
    if (tariffaBase) {
      const prezzoBase = Number(tariffaBase.prezzo_notte);
      let calcolato = Math.round(prezzoBase * (1 + Number(percentuale || 0) / 100) * 100) / 100;
      const min = prezzoMinimo === '' ? null : Number(prezzoMinimo);
      const max = prezzoMassimo === '' ? null : Number(prezzoMassimo);
      let avviso = null;
      if (min !== null && calcolato < min) { avviso = `sotto il minimo, riportato a ${min} €`; calcolato = min; }
      else if (max !== null && calcolato > max) { avviso = `sopra il massimo, riportato a ${max} €`; calcolato = max; }
      anteprima = { prezzoBase, calcolato, avviso };
    }
  }

  return (
    <div>
      <ChipPeriodi
        periodiStagionali={periodiStagionali}
        periodoAttivoId={periodoAttivoId}
        fallbackSelezionato={fallbackSelezionato}
        allowFallback={isDerivata}
        onSelezionaPeriodo={selezionaPeriodo}
        onSelezionaFallback={selezionaFallback}
        onPeriodoCreato={periodoCreato}
        puoScrivere={puoScrivere}
        onErrore={onErrore}
      />

      {!contestoSelezionato ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--muted-foreground)' }}>
          Tocca un&apos;etichetta periodo qui sopra, o crea un nuovo periodo per impostare il prezzo.
        </p>
      ) : (
        <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          {isDerivata ? (
            <>
              {!valoreEsistente && (
                <p className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>Nessuna regola impostata per questo periodo.</p>
              )}
              <select value={tipoBaseId} onChange={e => setTipoBaseId(e.target.value)} disabled={!puoScrivere}
                      className="w-full mb-2 px-3 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="">Deriva da...</option>
                {tipiCamera.filter(t => t.id !== tipo.id).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input type="number" step="0.01" placeholder="% (es. 30 o -20)" value={percentuale}
                       onChange={e => setPercentuale(e.target.value)} disabled={!puoScrivere}
                       className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                <input type="number" min={0} step="0.01" placeholder="Min tariffa" value={prezzoMinimo}
                       onChange={e => setPrezzoMinimo(e.target.value)} disabled={!puoScrivere}
                       className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                <input type="number" min={0} step="0.01" placeholder="Max tariffa" value={prezzoMassimo}
                       onChange={e => setPrezzoMassimo(e.target.value)} disabled={!puoScrivere}
                       className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              {periodoAttivo && !anteprima && (
                <p className="text-xs mb-2" style={{ color: 'var(--status-amber-text)' }}>
                  Prezzo base non ancora impostato per questo periodo — imposta prima il prezzo del tipo da cui deriva.
                </p>
              )}
              {!periodoAttivo && fallbackSelezionato && (
                <p className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>
                  Anteprima disponibile solo per un periodo specifico — con &quot;Tutto l&apos;anno&quot; il prezzo base cambia da fascia a fascia.
                </p>
              )}
              {anteprima && (
                <div className="px-3 py-2 rounded-lg text-xs mb-2" style={{ background: 'var(--background)' }}>
                  Prezzo base in questo periodo: {anteprima.prezzoBase} € → calcolato {anteprima.calcolato} € —{' '}
                  <span style={{ color: anteprima.avviso ? 'var(--status-red-text)' : 'var(--status-green-text)' }}>
                    {anteprima.avviso || 'entro il range dichiarato'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input placeholder="Nome (opzionale)" value={nomeStagione} onChange={e => setNomeStagione(e.target.value)}
                     disabled={!puoScrivere} className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
              <input type="number" min={0} step="0.01" placeholder="€/notte" value={prezzoNotte}
                     onChange={e => setPrezzoNotte(e.target.value)} disabled={!puoScrivere}
                     className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
            </div>
          )}

          {puoScrivere && (
            <div className="flex items-center gap-2">
              <button onClick={isDerivata ? salvaDerivata : salvaMadre} disabled={salvataggio}
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
