'use client';

// Pagina Tariffe — Modulo 2.2, Fase 2A.
// Dal 31/07/2026 (riordino Impostazioni, task preliminare al modulo 2.3):
// questa pagina contiene il listino tariffe per categoria (stagionalità) e,
// dal modulo 2.3 Fase 1, la mappatura camere↔canale OTA. Le categorie
// camera (tipi_camera) e l'assegnazione categoria→camera sono state
// spostate in /impostazioni/camere — sono configurazione strutturale, non
// prezzo/distribuzione. La gestione WuBook resta qui per decisione esplicita
// del titolare (prezzo e distribuzione restano vicini).
// Lettura: admin, titolare, receptionist. Scrittura: solo admin/titolare —
// coerente con shared/ruoli.js sezioni 'tariffe'/'canali_ota'. tipi_camera
// resta necessario qui solo in lettura, per popolare i selettori categoria.
// Vedi docs/PRENOTAZIONI_FASE2.md per il contratto API completo del listino.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import CampoData from '@/components/ui/CampoData';

const RUOLI_LETTURA = ['admin', 'titolare', 'receptionist'];

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

export default function PaginaTariffe() {
  const { utente, loading } = useAuth();
  const router = useRouter();
  const puoScrivere = utente && ['admin', 'titolare'].includes(utente.ruolo);

  const [tipiCamera, setTipiCamera] = useState([]);
  const [tariffe, setTariffe] = useState([]);
  const [canaliOta, setCanaliOta] = useState([]);
  const [tipoSelezionato, setTipoSelezionato] = useState(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [successo, setSuccesso] = useState('');

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_LETTURA.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const caricaBase = useCallback(async () => {
    setCaricamento(true);
    try {
      const [resTipi, resCanali] = await Promise.all([
        api.get('/tipi-camera'),
        api.get('/canali-ota'),
      ]);
      setTipiCamera(resTipi.data);
      setCanaliOta(resCanali.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento.');
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => {
    if (utente && RUOLI_LETTURA.includes(utente.ruolo)) caricaBase();
  }, [utente, caricaBase]);

  const caricaTariffe = useCallback(async (tipoCameraId) => {
    if (!tipoCameraId) { setTariffe([]); return; }
    try {
      const res = await api.get(`/tariffe?tipo_camera_id=${tipoCameraId}`);
      setTariffe(res.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento del listino.');
    }
  }, []);

  useEffect(() => { caricaTariffe(tipoSelezionato); }, [tipoSelezionato, caricaTariffe]);

  if (loading || !utente) return null;

  return (
    <AppShell titolo="Tariffe">
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

      {caricamento ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      ) : (
        <div className="flex flex-col gap-6">
          <SezioneListino
            tipiCamera={tipiCamera}
            tariffe={tariffe}
            tipoSelezionato={tipoSelezionato}
            setTipoSelezionato={setTipoSelezionato}
            puoScrivere={puoScrivere}
            onCambiato={() => caricaTariffe(tipoSelezionato)}
            onErrore={setErrore}
          />

          <SezioneCanaliOta
            canaliOta={canaliOta}
            puoScrivere={puoScrivere}
            onCambiato={caricaBase}
            onErrore={setErrore}
            onSuccesso={setSuccesso}
          />
        </div>
      )}
    </AppShell>
  );
}

// ── Listino tariffe (stagionalità) ───────────────────────────────────────────

function SezioneListino({ tipiCamera, tariffe, tipoSelezionato, setTipoSelezionato, puoScrivere, onCambiato, onErrore }) {
  const [form, setForm] = useState(null); // null | 'nuovo' | {tariffa}
  const [nomeStagione, setNomeStagione] = useState('');
  const [dataInizio, setDataInizio] = useState('');
  const [dataFine, setDataFine] = useState('');
  const [prezzoNotte, setPrezzoNotte] = useState('');
  const [salvataggio, setSalvataggio] = useState(false);

  function apriNuovo() {
    setNomeStagione(''); setDataInizio(''); setDataFine(''); setPrezzoNotte(''); setForm('nuovo'); onErrore('');
  }
  function apriModifica(t) {
    setNomeStagione(t.nome_stagione ?? ''); setDataInizio(t.data_inizio); setDataFine(t.data_fine);
    setPrezzoNotte(t.prezzo_notte); setForm(t); onErrore('');
  }

  async function salva() {
    if (!dataInizio || !dataFine || !prezzoNotte) return onErrore('Date e prezzo per notte sono obbligatori.');
    setSalvataggio(true);
    try {
      const body = {
        tipo_camera_id: Number(tipoSelezionato),
        nome_stagione: nomeStagione || null,
        data_inizio: dataInizio,
        data_fine: dataFine,
        prezzo_notte: Number(prezzoNotte),
      };
      if (form === 'nuovo') await api.post('/tariffe', body);
      else await api.patch(`/tariffe/${form.id}`, body);
      setForm(null);
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nel salvataggio della fascia tariffaria.');
    } finally {
      setSalvataggio(false);
    }
  }

  async function elimina(t) {
    if (!confirm('Eliminare questa fascia tariffaria?')) return;
    try {
      await api.delete(`/tariffe/${t.id}`);
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nell\'eliminazione.');
    }
  }

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Listino e stagionalità</h3>
        {puoScrivere && tipoSelezionato && (
          <button onClick={apriNuovo} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-white"
                  style={{ background: 'var(--hotel-amber)' }}>
            <Plus size={13} /> Nuova fascia
          </button>
        )}
      </div>

      <select value={tipoSelezionato ?? ''} onChange={e => setTipoSelezionato(e.target.value || null)}
              className="w-full mb-3 px-3 rounded-lg text-sm outline-none" style={inputStyle}>
        <option value="">Seleziona una categoria camera...</option>
        {tipiCamera.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
      </select>

      {tipoSelezionato && form !== null && (
        <div className="mb-3 p-3 rounded-lg space-y-2" style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <input placeholder="Nome stagione (es. Alta stagione estate 2026)" value={nomeStagione}
                 onChange={e => setNomeStagione(e.target.value)}
                 className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />
          <div className="grid grid-cols-3 gap-2">
            <CampoData value={dataInizio} onChange={v => setDataInizio(v)}
                   className="px-3" style={inputStyle} />
            <CampoData value={dataFine} onChange={v => setDataFine(v)}
                   className="px-3" style={inputStyle} />
            <input type="number" min={0} step="0.01" placeholder="€/notte" value={prezzoNotte}
                   onChange={e => setPrezzoNotte(e.target.value)}
                   className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
          </div>
          <div className="flex gap-2">
            <button onClick={salva} disabled={salvataggio}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                    style={{ background: 'var(--hotel-navy)' }}>
              {salvataggio ? 'Salvataggio...' : 'Salva'}
            </button>
            <button onClick={() => setForm(null)} className="text-xs font-medium px-3 py-1.5 rounded-lg border">Annulla</button>
          </div>
        </div>
      )}

      {!tipoSelezionato ? (
        <p className="text-xs text-center py-4" style={{ color: 'var(--muted-foreground)' }}>Seleziona una categoria per vedere il listino.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {tariffe.map(t => (
            <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                 style={{ background: 'var(--background)' }}>
              <div>
                <span className="font-medium">{t.nome_stagione || 'Fascia senza nome'}</span>
                <span className="ml-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {t.data_inizio} → {t.data_fine} · €{Number(t.prezzo_notte).toFixed(2)}/notte
                </span>
              </div>
              {puoScrivere && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => apriModifica(t)} className="p-1.5 rounded-lg hover:bg-gray-100" style={{ color: 'var(--muted-foreground)' }}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => elimina(t)} className="p-1.5 rounded-lg hover:bg-gray-100" style={{ color: 'var(--status-red-text)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {tariffe.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: 'var(--muted-foreground)' }}>Nessuna fascia tariffaria per questa categoria.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Codici canale OTA (Modulo 2.3, Fase 1) ───────────────────────────────────
// Una riga per categoria camera, un solo canale oggi (WuBook — badge fisso
// in intestazione, non un selettore: non ha senso mostrare una scelta con
// una sola opzione). Salvataggio per riga, non un form unico, come
// l'assegnazione categoria→camera in /impostazioni/camere.

function SezioneCanaliOta({ canaliOta, puoScrivere, onCambiato, onErrore, onSuccesso }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Codici canale OTA</h3>
        <span className="text-xs px-2.5 py-1 rounded-full"
              style={{ background: 'var(--hotel-amber-light)', color: 'var(--hotel-amber-dark)' }}>
          Canale: WuBook / WooDoo
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
        Codice della camera così come appare nell'estranet WuBook, per ogni categoria. Serve alla mappatura del modulo 2.3, non ancora attiva (in attesa dell'account WuBook).
      </p>

      <div className="rounded-lg overflow-hidden" style={{ border: '0.5px solid var(--border)' }}>
        {canaliOta.map((c, idx) => (
          <RigaCanaleOta
            key={c.tipo_camera_id}
            riga={c}
            pari={idx % 2 === 0}
            ultima={idx === canaliOta.length - 1}
            puoScrivere={puoScrivere}
            onCambiato={onCambiato}
            onErrore={onErrore}
            onSuccesso={onSuccesso}
          />
        ))}
        {canaliOta.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--muted-foreground)' }}>Nessuna categoria camera configurata (vedi Impostazioni ▸ Camere).</p>
        )}
      </div>
    </div>
  );
}

function RigaCanaleOta({ riga, pari, ultima, puoScrivere, onCambiato, onErrore, onSuccesso }) {
  const [codice, setCodice] = useState(riga.codice_esterno ?? '');
  const [salvataggio, setSalvataggio] = useState(false);
  const configurato = !!riga.codice_esterno;

  async function salva() {
    setSalvataggio(true);
    try {
      await api.put(`/canali-ota/${riga.tipo_camera_id}`, { canale: 'wubook', codice_esterno: codice || null });
      onSuccesso('Codice canale salvato.');
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nel salvataggio.');
    } finally {
      setSalvataggio(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
         style={{ background: pari ? 'var(--card)' : 'var(--background)', borderBottom: ultima ? 'none' : '0.5px solid var(--border)' }}>
      <span className="shrink-0">{riga.tipo_camera_nome}</span>
      <div className="flex items-center gap-2">
        {puoScrivere ? (
          <>
            <input placeholder="es. 104521" value={codice} onChange={e => setCodice(e.target.value)}
                   className="px-2 rounded-lg text-xs outline-none w-32" style={{ ...inputStyle, height: '30px' }} />
            <button onClick={salva} disabled={salvataggio}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg disabled:opacity-60"
                    style={{ background: 'var(--hotel-amber-light)', color: 'var(--hotel-amber-dark)', border: '1px solid var(--hotel-amber)' }}>
              {salvataggio ? '...' : 'Salva'}
            </button>
          </>
        ) : (
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{riga.codice_esterno || '—'}</span>
        )}
        <span className="text-[11px] px-1.5 py-0.5 rounded shrink-0"
              style={{
                background: configurato ? 'var(--status-green-bg)' : 'var(--status-amber-bg)',
                color: configurato ? 'var(--status-green-text)' : 'var(--status-amber-text)',
              }}>
          {configurato ? 'Configurato' : 'Da configurare'}
        </span>
      </div>
    </div>
  );
}
