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
//
// Redesign 20/08/2026 — TRE tentativi (dettaglio in docs/EVOLUTIVE.md e
// docs/DIARIO_SESSIONI.md): (1) tendine separate per Periodi/Regole di
// derivazione/Supplemento trattamento, bocciata ("non riesco a capire come
// utilizzare tutte queste tendine"); (2) timeline dell'anno con
// trascinamento (TimelinePeriodi.jsx, ora superata), bocciata anche questa
// appena vista, mai arrivata a un test reale; (3) versione attuale — ogni
// tipologia è una scheda auto-contenuta (SchedaPrezzoTipologia /
// SchedaTrattamento) con i periodi come ETICHETTE cliccabili (ChipPeriodi),
// "+ nuovo periodo" apre un piccolo form inline (nome + due date) invece di
// un calendario da trascinare. Le tipologie camera sono una fila di
// etichette in alto (non più una tendina): si vede UNA scheda alla volta,
// non tutte impilate, per non tornare al problema di leggibilità della
// prima versione da un'altra porta. La sezione "Periodi" resta come CRUD
// esplicito (rinomina/elimina) ma secondaria, collassata di default — il
// periodo nasce normalmente dall'uso delle schede, non da qui.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import CampoData from '@/components/ui/CampoData';
import SchedaPrezzoTipologia from '@/components/tariffe/SchedaPrezzoTipologia';
import SchedaTrattamento from '@/components/tariffe/SchedaTrattamento';

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
  const [canaliOta, setCanaliOta] = useState([]);
  // Periodi stagionali — entità condivisa tra listino, regole di derivazione
  // e supplementi trattamento: caricata una volta qui e passata giù, così
  // cambiare le date di un periodo si riflette ovunque senza reinserirle.
  const [periodiStagionali, setPeriodiStagionali] = useState([]);
  // Tariffe (listino diretto), regole di derivazione e supplementi
  // trattamento caricati SENZA filtro (redesign 20/08/2026): la timeline
  // deve poter colorare i blocchi per qualunque tipologia/categoria si scelga
  // senza un giro di rete ad ogni cambio di selezione nella tendina.
  const [tariffeTutte, setTariffeTutte] = useState([]);
  const [regoleTutte, setRegoleTutte] = useState([]);
  const [supplementiTutti, setSupplementiTutti] = useState([]);
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
      const [resTipi, resCanali, resPeriodi, resTariffe, resRegole, resSupplementi] = await Promise.all([
        api.get('/tipi-camera'),
        api.get('/canali-ota'),
        api.get('/periodi-stagionali'),
        api.get('/tariffe'),
        api.get('/tariffe-derivate/derivazione'),
        api.get('/tariffe-derivate/trattamento'),
      ]);
      setTipiCamera(resTipi.data);
      setCanaliOta(resCanali.data);
      setPeriodiStagionali(resPeriodi.data);
      setTariffeTutte(resTariffe.data);
      setRegoleTutte(resRegole.data);
      setSupplementiTutti(resSupplementi.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento.');
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => {
    if (utente && RUOLI_LETTURA.includes(utente.ruolo)) caricaBase();
  }, [utente, caricaBase]);

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
          <SezionePrezziTipologia
            tipiCamera={tipiCamera}
            periodiStagionali={periodiStagionali}
            tariffeTutte={tariffeTutte}
            regoleTutte={regoleTutte}
            tipoSelezionato={tipoSelezionato}
            setTipoSelezionato={setTipoSelezionato}
            puoScrivere={puoScrivere}
            onCambiato={caricaBase}
            onErrore={setErrore}
          />

          <SchedaTrattamento
            periodiStagionali={periodiStagionali}
            supplementiTutti={supplementiTutti}
            puoScrivere={puoScrivere}
            onCambiato={caricaBase}
            onErrore={setErrore}
          />

          <SezioneBambini
            puoScrivere={puoScrivere}
            onErrore={setErrore}
            onSuccesso={setSuccesso}
          />

          <SezioneCanaliOta
            canaliOta={canaliOta}
            puoScrivere={puoScrivere}
            onCambiato={caricaBase}
            onErrore={setErrore}
            onSuccesso={setSuccesso}
          />

          <SezionePeriodi
            periodiStagionali={periodiStagionali}
            puoScrivere={puoScrivere}
            onCambiato={caricaBase}
            onErrore={setErrore}
          />
        </div>
      )}
    </AppShell>
  );
}

// ── Prezzi per tipologia (madre + derivate, timeline unificata) ───────────
// Un tipo camera è "madre" se non ha righe in regole_derivazione_tariffe
// (prezzo diretto, tabella tariffe), altrimenti "derivata" (percentuale sul
// tipo base + range, tabella regole_derivazione_tariffe) — dedotto dai dati,
// mai da un elenco fisso di nomi.

// Un tipo camera diventa un'etichetta nella fila in alto (non più una
// tendina): tocchi "Singola" e vedi SOLO la sua scheda, stessa card di
// Matrimoniale — evita di avere 5 schede (madre + 4 derivate) una sotto
// l'altra sulla stessa pagina, che avrebbe ricreato il problema di
// leggibilità della prima versione da un'altra porta (chiesto
// esplicitamente dal titolare, 20/08/2026).

function SezionePrezziTipologia({ tipiCamera, periodiStagionali, tariffeTutte, regoleTutte, tipoSelezionato, setTipoSelezionato, puoScrivere, onCambiato, onErrore }) {
  const tipo = tipiCamera.find(t => String(t.id) === String(tipoSelezionato)) || null;
  const regolePerTipo = tipoSelezionato ? regoleTutte.filter(r => String(r.tipo_camera_id) === String(tipoSelezionato)) : [];
  const isDerivata = regolePerTipo.length > 0;
  const tariffePerTipo = tipoSelezionato ? tariffeTutte.filter(t => String(t.tipo_camera_id) === String(tipoSelezionato)) : [];

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Prezzi per tipologia</h3>

      <div className="flex gap-2 mb-4 flex-wrap">
        {tipiCamera.map(t => (
          <button key={t.id} onClick={() => setTipoSelezionato(String(t.id))}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg"
                  style={String(tipoSelezionato) === String(t.id)
                    ? { background: 'var(--hotel-navy)', color: 'white' }
                    : { border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
            {t.nome}
          </button>
        ))}
      </div>

      {!tipo ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--muted-foreground)' }}>Scegli una tipologia qui sopra per vedere e modificare i prezzi.</p>
      ) : (
        <>
          <span className="inline-block text-xs px-2 py-0.5 rounded-full mb-3"
                style={{ background: 'var(--hotel-amber-light)', color: 'var(--hotel-amber-dark)' }}>
            {isDerivata ? 'Tipo derivato' : 'Tipo madre — prezzo diretto'}
          </span>

          <SchedaPrezzoTipologia
            tipo={tipo}
            tipiCamera={tipiCamera}
            periodiStagionali={periodiStagionali}
            isDerivata={isDerivata}
            regolePerTipo={regolePerTipo}
            tariffePerTipo={tariffePerTipo}
            tariffeTutte={tariffeTutte}
            puoScrivere={puoScrivere}
            onCambiato={onCambiato}
            onErrore={onErrore}
          />
        </>
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

// ── Periodi stagionali — CRUD secondario (rinomina/elimina) ────────────────
// Il periodo nasce normalmente dalla timeline delle sezioni sopra; questa
// sezione resta solo per rinominare/eliminare un periodo o vedere l'elenco
// completo — collassata di default per non competere con le sezioni
// principali (bocciatura della prima versione a tendine, 20/08/2026).

function SezionePeriodi({ periodiStagionali, puoScrivere, onCambiato, onErrore }) {
  const [form, setForm] = useState(null); // null | 'nuovo' | {periodo}
  const [nome, setNome] = useState('');
  const [dataInizio, setDataInizio] = useState('');
  const [dataFine, setDataFine] = useState('');
  const [salvataggio, setSalvataggio] = useState(false);

  function apriNuovo() {
    setNome(''); setDataInizio(''); setDataFine(''); setForm('nuovo'); onErrore('');
  }
  function apriModifica(p) {
    setNome(p.nome); setDataInizio(p.data_inizio); setDataFine(p.data_fine); setForm(p); onErrore('');
  }

  async function salva() {
    if (!nome || !dataInizio || !dataFine) return onErrore('Nome e date sono obbligatori.');
    setSalvataggio(true);
    try {
      const body = { nome, data_inizio: dataInizio, data_fine: dataFine };
      if (form === 'nuovo') await api.post('/periodi-stagionali', body);
      else await api.patch(`/periodi-stagionali/${form.id}`, body);
      setForm(null);
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nel salvataggio del periodo.');
    } finally {
      setSalvataggio(false);
    }
  }

  async function elimina(p) {
    if (!confirm(`Eliminare il periodo "${p.nome}"?`)) return;
    try {
      await api.delete(`/periodi-stagionali/${p.id}`);
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nell\'eliminazione — verificare che non sia in uso.');
    }
  }

  return (
    <details className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
      <summary className="text-sm font-semibold cursor-pointer" style={{ color: 'var(--foreground)' }}>
        Periodi stagionali — elenco, rinomina, elimina
      </summary>

      <div className="flex items-center justify-between mt-3 mb-1">
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          Un periodo nasce di solito trascinando sulla timeline delle sezioni sopra. Qui puoi solo rinominarlo o eliminarlo.
        </p>
        {puoScrivere && (
          <button onClick={apriNuovo} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-white shrink-0 ml-3"
                  style={{ background: 'var(--hotel-amber)' }}>
            <Plus size={13} /> Nuovo periodo
          </button>
        )}
      </div>

      {form !== null && (
        <div className="mb-3 p-3 rounded-lg space-y-2" style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <input placeholder="Nome periodo (es. Alta stagione)" value={nome}
                 onChange={e => setNome(e.target.value)}
                 className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />
          <div className="grid grid-cols-2 gap-2">
            <CampoData value={dataInizio} onChange={v => setDataInizio(v)} className="px-3" style={inputStyle} />
            <CampoData value={dataFine} onChange={v => setDataFine(v)} className="px-3" style={inputStyle} />
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

      <div className="flex flex-col gap-1.5">
        {periodiStagionali.map(p => (
          <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
               style={{ background: 'var(--background)' }}>
            <div>
              <span className="font-medium">{p.nome}</span>
              <span className="ml-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {p.data_inizio} → {p.data_fine}
              </span>
            </div>
            {puoScrivere && (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => apriModifica(p)} className="p-1.5 rounded-lg hover:bg-gray-100" style={{ color: 'var(--muted-foreground)' }}>
                  <Pencil size={13} />
                </button>
                <button onClick={() => elimina(p)} className="p-1.5 rounded-lg hover:bg-gray-100" style={{ color: 'var(--status-red-text)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        ))}
        {periodiStagionali.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--muted-foreground)' }}>Nessun periodo stagionale definito.</p>
        )}
      </div>
    </details>
  );
}

// ── Configurazione bambini (sconto 3-11 anni, fisso tutto l'anno) ─────────

function SezioneBambini({ puoScrivere, onErrore, onSuccesso }) {
  const [sconto, setSconto] = useState('');
  const [note, setNote] = useState('');
  const [caricato, setCaricato] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);

  useEffect(() => {
    api.get('/tariffe-derivate/configurazione-bambini')
      .then(res => {
        setSconto(String(res.data.sconto_mezza_pensione_percentuale ?? 0));
        setNote(res.data.note || '');
      })
      .catch(err => onErrore(err.message || 'Errore nel caricamento della configurazione bambini.'))
      .finally(() => setCaricato(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salva() {
    setSalvataggio(true);
    try {
      const res = await api.patch('/tariffe-derivate/configurazione-bambini', {
        sconto_mezza_pensione_percentuale: Number(sconto),
        note: note || null,
      });
      setNote(res.data.note || '');
      onSuccesso('Configurazione bambini salvata.');
    } catch (err) {
      onErrore(err.message || 'Errore nel salvataggio.');
    } finally {
      setSalvataggio(false);
    }
  }

  if (!caricato) return null;

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--foreground)' }}>Bambini</h3>
      <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
        0-2 anni: sempre gratis, nessuna camera più grande richiesta. 3-11 anni: contano come un adulto per la scelta della camera, ma hanno lo sconto qui sotto sul supplemento mezza/pensione completa — fisso tutto l&apos;anno, non per periodo. 12-17 anni: trattati come un adulto a tutti gli effetti.
      </p>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Sconto 3-11 anni sul supplemento (%)</span>
          <input type="number" min={0} max={100} step="1" value={sconto}
                 onChange={e => setSconto(e.target.value)}
                 disabled={!puoScrivere}
                 className="px-3 rounded-lg text-sm outline-none w-40" style={inputStyle} />
        </label>
        {puoScrivere && (
          <button onClick={salva} disabled={salvataggio}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-navy)' }}>
            {salvataggio ? 'Salvataggio...' : 'Salva'}
          </button>
        )}
      </div>
      {note && <p className="mt-2 text-xs" style={{ color: 'var(--status-amber-text)' }}>{note}</p>}
    </div>
  );
}
