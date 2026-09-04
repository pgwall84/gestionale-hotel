'use client';

// Pagina Impostazioni ▸ Beds24 — Modulo 2.3, Fase 2/3 (04/09/2026).
// Configurazione per l'invio automatico di disponibilità/tariffe/restrizioni
// verso Beds24 (il gestionale resta sempre l'unica fonte di verità, mai il
// contrario — vedi docs/superpowers/specs/2026-09-03-invio-tariffe-beds24-design.md):
// - per tipologia camera: unità esposte (tetto separato dalla disponibilità
//   fisica reale, per limitare il costo per-unità fatturato da Beds24) e
//   maggiorazione percentuale (applicata SOLO al prezzo calcolato dal
//   motore diretto — mai a un prezzo già impostato a mano in
//   planning-tariffe, vedi beds24PrezziDisponibilita.js);
// - orizzonte di invio tariffe: data di fine fino a cui il job periodico
//   (beds24InvioTariffe.js) sincronizza prezzi/restrizioni, aggiornata a
//   mano (nessun avanzamento automatico in questa fase, vedi spec).
// Pattern di stile/data-fetching ripreso da
// frontend/app/impostazioni/tassa-soggiorno/page.jsx (letto per intero
// prima di scrivere questa pagina) e dal pattern "riga con salvataggio
// indipendente" già in uso in frontend/app/impostazioni/camere.jsx
// (sezione assegnazione camera→tipologia) e in
// frontend/app/tariffe/page.jsx (sezione Codici canale OTA).
//
// codice_esterno NON è editabile qui — resta la sezione "Codici canale
// OTA" di /tariffe (Modulo 2.3, Fase 1). Ogni salvataggio qui lo include
// comunque INVARIATO nel PUT (letto dalla riga già caricata): l'endpoint
// fa un upsert completo, un campo omesso verrebbe scritto null (vedi
// canaliOtaController.upsert) — stessa cautela applicata in senso inverso
// nel fix a tariffe/page.jsx fatto insieme a questa pagina (la sezione
// Codici canale OTA salvava senza includere unita_esposte/
// maggiorazione_percentuale, azzerandoli ad ogni salvataggio di un codice).

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import CampoData from '@/components/ui/CampoData';

const RUOLI_CONFIGURAZIONE = ['admin', 'titolare'];

const inputStyle = {
  height: '32px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

export default function PaginaImpostazioniBeds24() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const [righe, setRighe] = useState([]);
  // bozze: valori in modifica, indipendenti dalla riga caricata finché non
  // si salva — stesso principio del form di tassa-soggiorno (non si scrive
  // ad ogni tasto, solo al click su Salva).
  const [bozze, setBozze] = useState({}); // { [tipoCameraId]: { unita_esposte, maggiorazione_percentuale } }
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [successo, setSuccesso] = useState('');
  const [salvataggioRiga, setSalvataggioRiga] = useState(null); // tipo_camera_id in salvataggio

  const [orizzonte, setOrizzonte] = useState('');
  const [ultimaSincronizzazione, setUltimaSincronizzazione] = useState(null);
  const [salvataggioOrizzonte, setSalvataggioOrizzonte] = useState(false);

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_CONFIGURAZIONE.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const [resRighe, resConfig] = await Promise.all([
        api.get('/canali-ota?canale=beds24'),
        api.get('/beds24/config'),
      ]);
      setRighe(resRighe.data);
      setBozze(Object.fromEntries(resRighe.data.map(r => [
        r.tipo_camera_id,
        { unita_esposte: r.unita_esposte ?? '', maggiorazione_percentuale: r.maggiorazione_percentuale ?? 0 },
      ])));
      setOrizzonte(resConfig.data.orizzonte_invio_tariffe_fino_a || '');
      setUltimaSincronizzazione(resConfig.data.ultima_sincronizzazione_at);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento della configurazione Beds24.');
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => {
    if (utente && RUOLI_CONFIGURAZIONE.includes(utente.ruolo)) carica();
  }, [utente, carica]);

  function aggiornaBozza(tipoCameraId, campo, valore) {
    setBozze(b => ({ ...b, [tipoCameraId]: { ...b[tipoCameraId], [campo]: valore } }));
  }

  async function salvaRiga(riga) {
    const bozza = bozze[riga.tipo_camera_id] || { unita_esposte: '', maggiorazione_percentuale: 0 };
    const unitaEsposteNum = bozza.unita_esposte === '' ? null : Number(bozza.unita_esposte);
    if (unitaEsposteNum !== null && (Number.isNaN(unitaEsposteNum) || unitaEsposteNum < 0)) {
      setErrore('Unità esposte deve essere un intero non negativo o vuoto.');
      return;
    }
    const maggiorazioneNum = bozza.maggiorazione_percentuale === '' ? 0 : Number(bozza.maggiorazione_percentuale);
    if (Number.isNaN(maggiorazioneNum) || maggiorazioneNum < 0) {
      setErrore('Maggiorazione percentuale deve essere un numero non negativo.');
      return;
    }
    setSalvataggioRiga(riga.tipo_camera_id);
    setErrore('');
    setSuccesso('');
    try {
      // codice_esterno invariato — letto dalla riga già caricata, mai
      // omesso: vedi commento in cima al file.
      await api.put(`/canali-ota/${riga.tipo_camera_id}`, {
        canale: 'beds24',
        codice_esterno: riga.codice_esterno,
        unita_esposte: unitaEsposteNum,
        maggiorazione_percentuale: maggiorazioneNum,
      });
      setSuccesso(`Configurazione salvata per ${riga.tipo_camera_nome}.`);
      carica();
    } catch (err) {
      setErrore(err.message || 'Errore nel salvataggio.');
    } finally {
      setSalvataggioRiga(null);
    }
  }

  async function salvaOrizzonte() {
    if (!orizzonte) {
      setErrore("L'orizzonte di invio tariffe è obbligatorio.");
      return;
    }
    setSalvataggioOrizzonte(true);
    setErrore('');
    setSuccesso('');
    try {
      await api.put('/beds24/config', { orizzonte_invio_tariffe_fino_a: orizzonte });
      setSuccesso('Orizzonte di invio tariffe salvato.');
      carica();
    } catch (err) {
      setErrore(err.message || "Errore nel salvataggio dell'orizzonte.");
    } finally {
      setSalvataggioOrizzonte(false);
    }
  }

  if (loading || !utente) return null;

  return (
    <AppShell titolo="Impostazioni Beds24">
      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}
      {successo && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
          {successo}
        </div>
      )}

      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--foreground)' }}>Orizzonte invio tariffe</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
          Data fino a cui il job periodico sincronizza prezzi e restrizioni su Beds24. Va aggiornata a mano, non avanza da sola.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <CampoData value={orizzonte} onChange={setOrizzonte} disabled={salvataggioOrizzonte}
                     className="px-3" style={inputStyle} />
          <button onClick={salvaOrizzonte} disabled={salvataggioOrizzonte}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-navy)' }}>
            {salvataggioOrizzonte ? 'Salvataggio...' : 'Salva'}
          </button>
          {ultimaSincronizzazione && (
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Ultima sincronizzazione prenotazioni: {new Date(ultimaSincronizzazione).toLocaleString('it-IT')}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--foreground)' }}>Unità esposte e maggiorazione per tipologia</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
          Unità esposte: tetto massimo mostrato a Beds24, indipendente dalla disponibilità fisica reale (vuoto = nessun tetto, espone tutta la disponibilità libera). Maggiorazione: applicata solo al prezzo calcolato dal motore diretto, mai a un prezzo già impostato a mano in planning-tariffe.
        </p>
        {caricamento ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : righe.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--muted-foreground)' }}>Nessuna tipologia camera configurata (vedi Impostazioni ▸ Camere).</p>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ border: '0.5px solid var(--border)' }}>
            {righe.map((r, idx) => {
              const bozza = bozze[r.tipo_camera_id] || { unita_esposte: '', maggiorazione_percentuale: 0 };
              const inSalvataggio = salvataggioRiga === r.tipo_camera_id;
              return (
                <div key={r.tipo_camera_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm flex-wrap"
                     style={{
                       background: idx % 2 === 0 ? 'var(--card)' : 'var(--background)',
                       borderBottom: idx < righe.length - 1 ? '0.5px solid var(--border)' : 'none',
                     }}>
                  <span className="font-medium shrink-0">{r.tipo_camera_nome}</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      Unità esposte
                      <input type="number" min={0} step="1" placeholder="—" value={bozza.unita_esposte}
                             disabled={inSalvataggio}
                             onChange={e => aggiornaBozza(r.tipo_camera_id, 'unita_esposte', e.target.value)}
                             className="w-16 px-2 rounded-lg text-xs outline-none" style={inputStyle} />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      Maggiorazione %
                      <input type="number" min={0} step="0.1" value={bozza.maggiorazione_percentuale}
                             disabled={inSalvataggio}
                             onChange={e => aggiornaBozza(r.tipo_camera_id, 'maggiorazione_percentuale', e.target.value)}
                             className="w-16 px-2 rounded-lg text-xs outline-none" style={inputStyle} />
                    </label>
                    <button onClick={() => salvaRiga(r)} disabled={inSalvataggio}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                            style={{ background: 'var(--hotel-navy)' }}>
                      {inSalvataggio ? 'Salvataggio...' : 'Salva'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
