'use client';

// Pagina Prenotazioni camere — vista griglia/planning (Fase 2, mockup punto 2).
// Righe = camere raggruppate per piano (l'Appartamento esterno, piano NULL,
// è un gruppo a sé). Colonne = giorni nel range selezionato (7/14/mese).
// Barre colorate per stato prenotazione, drag-and-drop per spostare data/camera
// (aggiornamento ottimistico con rollback su 409), click per il dettaglio.
// Accessibile a: admin, titolare, receptionist (lettura+trascinamento),
// portiere_notte (sola lettura, no trascinamento).

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, X, Loader2, User, CreditCard, Pencil, AlertTriangle, Plus, UserPlus,
} from 'lucide-react';
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const RUOLI_TRASCINA = ['admin', 'titolare', 'receptionist'];
const LARGHEZZA_COLONNA = 56; // px — colonna giorno, fissa (necessaria per il calcolo del delta nel drag)

const STATI_COLORI = {
  opzione:    { bg: 'var(--status-amber-bg)',     text: 'var(--status-amber-text)',     label: 'Opzione' },
  confermata: { bg: 'var(--status-blue-bg)',      text: 'var(--status-blue-text)',      label: 'Confermata' },
  check_in:   { bg: 'var(--status-green-bg)',     text: 'var(--status-green-text)',     label: 'Check-in' },
  check_out:  { bg: 'var(--status-graylight-bg)', text: 'var(--status-graylight-text)', label: 'Check-out' },
  chiusa:     { bg: 'var(--status-graydark-bg)',  text: 'var(--status-graydark-text)',  label: 'Chiusa' },
};

const RANGE_OPZIONI = [
  { chiave: '7',    label: '7 giorni' },
  { chiave: '14',   label: '14 giorni' },
  { chiave: 'mese', label: 'Mese' },
];

const CANALI_ORIGINE = [
  { valore: 'diretta',     label: 'Diretta' },
  { valore: 'telefono',    label: 'Telefono' },
  { valore: 'booking_com', label: 'Booking.com' },
  { valore: 'airbnb',      label: 'Airbnb' },
  { valore: 'wubook',      label: 'WuBook' },
  { valore: 'altro',       label: 'Altro' },
];

// ── Helper date (aritmetica in ora locale, stesso pattern di app/prenotazioni/page.jsx) ──

function oggi() {
  return new Date().toISOString().split('T')[0];
}

function spostaData(d, giorni) {
  const [y, m, g] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, g + giorni);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function spostaMese(ancora, delta) {
  const [y, m] = ancora.split('-').map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-01`;
}

function primoGiornoMese(d) {
  const [y, m] = d.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function diffGiorni(a, b) {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}

function calcolaGiorni(ancora, rangeModo) {
  if (rangeModo === 'mese') {
    const [y, m] = ancora.split('-').map(Number);
    const numGiorni = new Date(y, m, 0).getDate();
    return Array.from({ length: numGiorni }, (_, i) => spostaData(ancora, i));
  }
  const n = rangeModo === '14' ? 14 : 7;
  return Array.from({ length: n }, (_, i) => spostaData(ancora, i));
}

function formatGiornoBreve(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
}

function formatDataEstesa(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Colonna (1-indexed, relativa alla riga giorni) coperta dalla barra,
// con clamp ai bordi del range visibile — una prenotazione che inizia
// prima o finisce dopo il range resta comunque visibile, tagliata ai bordi.
function calcolaBarra(giorni, arrivo, partenza) {
  let startIdx = diffGiorni(giorni[0], arrivo);
  let endIdx = diffGiorni(giorni[0], partenza);
  startIdx = Math.max(startIdx, 0);
  endIdx = Math.min(endIdx, giorni.length);
  return { colStart: startIdx + 1, colEnd: Math.max(endIdx, startIdx + 1) + 1 };
}

// ── Barra prenotazione (draggable) ──────────────────────────────────────────

function Barra({ soggiorno, style, puoTrascinare, onApri }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `soggiorno-${soggiorno.soggiorno_id}`,
    data: { soggiorno },
    disabled: !puoTrascinare,
  });
  const colori = STATI_COLORI[soggiorno.prenotazione_stato] || STATI_COLORI.opzione;
  const trasformStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 30, boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }
    : {};

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onApri(soggiorno.prenotazione_id)}
      style={{
        ...style,
        ...trasformStyle,
        background: colori.bg,
        color: colori.text,
        opacity: isDragging ? 0.6 : 1,
        cursor: puoTrascinare ? 'grab' : 'pointer',
      }}
      className="rounded-md px-2 py-1 text-[11px] font-medium truncate m-0.5 flex items-center select-none"
      title={`${soggiorno.ospite_nome} ${soggiorno.ospite_cognome} — ${colori.label}`}
    >
      {soggiorno.ospite_cognome}
    </div>
  );
}

// ── Riga camera (droppable) ─────────────────────────────────────────────────

function RigaCamera({ camera, giorni, rigaGrid, oggiStr, puoTrascinare, onApriDettaglio, onCellaVuota }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `camera-${camera.camera_id}`,
    data: { cameraId: camera.camera_id },
  });

  return (
    <>
      <div
        style={{ gridColumn: 1, gridRow: rigaGrid }}
        className="flex items-center px-3 text-xs font-medium border-b sticky left-0"
      >
        {camera.numero !== 'app' ? `Camera ${camera.numero}` : camera.nome}
      </div>

      <div
        ref={setNodeRef}
        style={{
          gridColumn: `2 / ${giorni.length + 2}`,
          gridRow: rigaGrid,
          display: 'grid',
          gridTemplateColumns: `repeat(${giorni.length}, ${LARGHEZZA_COLONNA}px)`,
          gridTemplateRows: '40px',
          background: isOver ? 'var(--status-blue-bg)' : undefined,
        }}
      >
        {giorni.map((g, i) => {
          // Cella "vuota" = nessun soggiorno di questa camera copre il giorno g
          // (confronto tra stringhe ISO YYYY-MM-DD, ordinamento cronologico corretto).
          const coperta = camera.soggiorni.some(s => g >= s.data_arrivo && g < s.data_partenza);
          const cliccabile = puoTrascinare && !coperta;
          return (
            <div
              key={g}
              style={{ gridColumn: i + 1, gridRow: 1, cursor: cliccabile ? 'pointer' : undefined }}
              className="border-r border-b"
              onClick={cliccabile ? () => onCellaVuota(camera.camera_id, g) : undefined}
            />
          );
        })}
        {camera.soggiorni.map((s) => {
          const { colStart, colEnd } = calcolaBarra(giorni, s.data_arrivo, s.data_partenza);
          return (
            <Barra
              key={s.soggiorno_id}
              soggiorno={s}
              style={{ gridColumn: `${colStart} / ${colEnd}`, gridRow: 1 }}
              puoTrascinare={puoTrascinare}
              onApri={onApriDettaglio}
            />
          );
        })}
      </div>
    </>
  );
}

// ── Pannello dettaglio ──────────────────────────────────────────────────────

function PannelloDettaglio({ prenotazioneId, elencoCamere, onChiudi, onCambiato }) {
  const { utente } = useAuth();
  const [dati, setDati] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [inModifica, setInModifica] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [form, setForm] = useState(null);

  const carica = useCallback(async () => {
    try {
      setLoading(true);
      setErrore(null);
      const risposta = await api.get(`/prenotazioni/${prenotazioneId}`);
      setDati(risposta.data);
    } catch (err) {
      setErrore('Errore nel caricamento del dettaglio');
    } finally {
      setLoading(false);
    }
  }, [prenotazioneId]);

  useEffect(() => { carica(); }, [carica]);

  function apriModifica() {
    const primoSoggiorno = dati.soggiorni?.[0];
    setForm({
      note: dati.note || '',
      canale_origine: dati.canale_origine || '',
      camera_id: primoSoggiorno?.camera_id ?? '',
      data_arrivo: primoSoggiorno?.data_arrivo ?? '',
      data_partenza: primoSoggiorno?.data_partenza ?? '',
      soggiorno_id: primoSoggiorno?.id,
    });
    setInModifica(true);
  }

  async function salvaModifica() {
    setSalvataggio(true);
    setErrore(null);
    try {
      await api.patch(`/prenotazioni/${prenotazioneId}`, {
        note: form.note,
        canale_origine: form.canale_origine,
      });
      if (form.soggiorno_id) {
        await api.patch(`/soggiorni/${form.soggiorno_id}`, {
          camera_id: form.camera_id,
          data_arrivo: form.data_arrivo,
          data_partenza: form.data_partenza,
        });
      }
      setInModifica(false);
      await carica();
      onCambiato();
    } catch (err) {
      setErrore(err.message || 'Errore nel salvataggio');
    } finally {
      setSalvataggio(false);
    }
  }

  // Conferma prenotazione (→ 'confermata') — solo da 'opzione'. Nessuna
  // validazione di prerequisiti (caparra/documento): controllo professionale
  // manuale da parte della reception, vedi CLAUDE.md Sezione 14.
  async function confermaPrenotazione() {
    setSalvataggio(true);
    setErrore(null);
    try {
      await api.patch(`/prenotazioni/${prenotazioneId}/stato`, { stato: 'confermata' });
      await carica();
      onCambiato();
    } catch (err) {
      setErrore(err.message || 'Errore nella conferma');
    } finally {
      setSalvataggio(false);
    }
  }

  async function fasiCheckIn() {
    setSalvataggio(true);
    setErrore(null);
    try {
      await api.patch(`/prenotazioni/${prenotazioneId}/stato`, { stato: 'check_in' });
      await carica();
      onCambiato();
    } catch (err) {
      setErrore(err.message || 'Errore nel check-in');
    } finally {
      setSalvataggio(false);
    }
  }

  // Check-out (→ 'check_out') — solo da 'check_in' (unica transizione valida).
  // A differenza del check-in, portiere_notte NON è autorizzato: vedi puoCheckOut.
  async function fasiCheckOut() {
    setSalvataggio(true);
    setErrore(null);
    try {
      await api.patch(`/prenotazioni/${prenotazioneId}/stato`, { stato: 'check_out' });
      onChiudi();
      onCambiato();
    } catch (err) {
      setErrore(err.message || 'Errore nel check-out');
      setSalvataggio(false);
    }
  }

  // Annulla prenotazione (→ 'interrotta') — solo da 'opzione'/'confermata'
  // (uniche transizioni valide, vedi state machine). Il backend sincronizza
  // soggiorni.cancellato in transazione: nessuna logica aggiuntiva qui.
  async function annullaPrenotazione() {
    if (!window.confirm('Sei sicuro di voler annullare questa prenotazione? La camera tornerà disponibile.')) {
      return;
    }
    setSalvataggio(true);
    setErrore(null);
    try {
      await api.patch(`/prenotazioni/${prenotazioneId}/stato`, { stato: 'interrotta' });
      onChiudi();
      onCambiato();
    } catch (err) {
      setErrore(err.message || 'Errore nell\'annullamento');
      setSalvataggio(false);
    }
  }

  const puoScrivere = ['admin', 'titolare', 'receptionist'].includes(utente?.ruolo);
  const puoConfermare = puoScrivere && dati?.stato === 'opzione';
  const puoCheckIn = puoScrivere || utente?.ruolo === 'portiere_notte';
  const puoCheckOut = puoScrivere && dati?.stato === 'check_in';
  const puoAnnullare = puoScrivere && ['opzione', 'confermata'].includes(dati?.stato);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onChiudi}>
      <div
        className="h-full w-full max-w-md bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white z-10">
          <p className="font-semibold text-sm">Dettaglio prenotazione</p>
          <button onClick={onChiudi} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-10 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <Loader2 size={18} className="animate-spin mr-2" /> Caricamento...
            </div>
          )}

          {errore && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3 text-xs"
                 style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
              <AlertTriangle size={14} /> {errore}
            </div>
          )}

          {dati && !loading && !inModifica && (
            <div className="space-y-4">
              <div>
                <span
                  className="inline-block text-xs font-medium rounded-full px-2.5 py-1"
                  style={{
                    background: (STATI_COLORI[dati.stato] || STATI_COLORI.opzione).bg,
                    color: (STATI_COLORI[dati.stato] || STATI_COLORI.opzione).text,
                  }}
                >
                  {(STATI_COLORI[dati.stato] || STATI_COLORI.opzione).label}
                </span>
              </div>

              {dati.soggiorni?.map((s) => {
                const intestatario = s.ospiti?.find(o => ['16', '17', '18'].includes(o.tipo_alloggiato)) || s.ospiti?.[0];
                return (
                  <div key={s.id} className="rounded-lg border p-3 space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <User size={14} /> {intestatario ? `${intestatario.nome} ${intestatario.cognome}` : 'Ospite non indicato'}
                    </div>
                    <p style={{ color: 'var(--muted-foreground)' }}>
                      Camera {s.camera_numero}{s.piano != null ? ` — piano ${s.piano}` : ' — appartamento esterno'}
                    </p>
                    <p style={{ color: 'var(--muted-foreground)' }}>
                      {formatDataEstesa(s.data_arrivo)} → {formatDataEstesa(s.data_partenza)}
                    </p>
                    <p style={{ color: 'var(--muted-foreground)' }}>{s.num_ospiti} ospiti</p>
                  </div>
                );
              })}

              <div className="text-sm">
                <p className="font-medium mb-1">Canale</p>
                <p style={{ color: 'var(--muted-foreground)' }}>{dati.canale_origine || '—'}</p>
              </div>

              {dati.note && (
                <div className="text-sm">
                  <p className="font-medium mb-1">Note</p>
                  <p style={{ color: 'var(--muted-foreground)' }}>{dati.note}</p>
                </div>
              )}

              <div className="text-sm">
                <p className="font-medium mb-1 flex items-center gap-1.5"><CreditCard size={14} /> Pagamenti</p>
                {dati.pagamenti?.length ? (
                  <ul className="space-y-1">
                    {dati.pagamenti.map(p => (
                      <li key={p.id} style={{ color: 'var(--muted-foreground)' }}>
                        {p.importo} € — {p.metodo} ({p.tipo})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ color: 'var(--muted-foreground)' }}>Nessun pagamento registrato.</p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                {puoConfermare && (
                  <button
                    onClick={confermaPrenotazione}
                    disabled={salvataggio}
                    className="flex-1 rounded-lg py-2 text-sm font-medium text-white"
                    style={{ background: 'var(--hotel-navy)' }}
                  >
                    Conferma prenotazione
                  </button>
                )}
                {dati.stato === 'confermata' && puoCheckIn && (
                  <button
                    onClick={fasiCheckIn}
                    disabled={salvataggio}
                    className="flex-1 rounded-lg py-2 text-sm font-medium text-white"
                    style={{ background: 'var(--hotel-navy)' }}
                  >
                    Check-in
                  </button>
                )}
                {puoCheckOut && (
                  <button
                    onClick={fasiCheckOut}
                    disabled={salvataggio}
                    className="flex-1 rounded-lg py-2 text-sm font-medium text-white"
                    style={{ background: 'var(--hotel-navy)' }}
                  >
                    Check-out
                  </button>
                )}
                {puoScrivere && (
                  <button
                    onClick={apriModifica}
                    className="flex-1 rounded-lg py-2 text-sm font-medium border flex items-center justify-center gap-1.5"
                  >
                    <Pencil size={14} /> Modifica
                  </button>
                )}
              </div>

              {puoAnnullare && (
                <button
                  onClick={annullaPrenotazione}
                  disabled={salvataggio}
                  className="w-full rounded-lg py-2 text-sm font-medium border flex items-center justify-center gap-1.5"
                  style={{ color: 'var(--status-red-text)', borderColor: 'var(--status-red-text)' }}
                >
                  <X size={14} /> Annulla prenotazione
                </button>
              )}
            </div>
          )}

          {dati && inModifica && form && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1">Camera</label>
                <select
                  value={form.camera_id}
                  onChange={(e) => setForm(f => ({ ...f, camera_id: Number(e.target.value) }))}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                >
                  {elencoCamere.map(c => (
                    <option key={c.camera_id} value={c.camera_id}>
                      {c.numero !== 'app' ? `Camera ${c.numero}` : c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium block mb-1">Arrivo</label>
                  <input type="date" value={form.data_arrivo}
                         onChange={(e) => setForm(f => ({ ...f, data_arrivo: e.target.value }))}
                         className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Partenza</label>
                  <input type="date" value={form.data_partenza}
                         onChange={(e) => setForm(f => ({ ...f, data_partenza: e.target.value }))}
                         className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Canale</label>
                <input type="text" value={form.canale_origine}
                       onChange={(e) => setForm(f => ({ ...f, canale_origine: e.target.value }))}
                       className="w-full border rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Note</label>
                <textarea value={form.note} rows={3}
                          onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={salvaModifica}
                  disabled={salvataggio}
                  className="flex-1 rounded-lg py-2 text-sm font-medium text-white"
                  style={{ background: 'var(--hotel-amber)' }}
                >
                  {salvataggio ? 'Salvataggio...' : 'Salva'}
                </button>
                <button onClick={() => setInModifica(false)} className="flex-1 rounded-lg py-2 text-sm font-medium border">
                  Annulla
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Form nuova prenotazione ──────────────────────────────────────────────────
// Stesso componente per i due punti d'ingresso (pulsante in alto / click cella
// vuota): cambia solo `iniziale` con cui viene aperto. Su 409/400 il form
// resta aperto (dati inseriti intatti) — solo su successo si chiude.

function FormNuovaPrenotazione({ iniziale, elencoCamere, onChiudi, onCreato }) {
  const [cameraId, setCameraId] = useState(iniziale.camera_id ?? '');
  const [dataArrivo, setDataArrivo] = useState(iniziale.data_arrivo ?? '');
  const [dataPartenza, setDataPartenza] = useState(iniziale.data_partenza ?? '');
  const [numOspiti, setNumOspiti] = useState(1);
  const [tariffaTotale, setTariffaTotale] = useState('');
  const [canaleOrigine, setCanaleOrigine] = useState('diretta');
  const [note, setNote] = useState('');

  const [ospiteSelezionato, setOspiteSelezionato] = useState(null);
  const [ricercaOspite, setRicercaOspite] = useState('');
  const [risultatiOspiti, setRisultatiOspiti] = useState([]);
  const [cercandoOspiti, setCercandoOspiti] = useState(false);

  const [nuovoOspiteAperto, setNuovoOspiteAperto] = useState(false);
  const [nuovoOspiteNome, setNuovoOspiteNome] = useState('');
  const [nuovoOspiteCognome, setNuovoOspiteCognome] = useState('');
  const [erroreNuovoOspite, setErroreNuovoOspite] = useState(null);
  const [creandoOspite, setCreandoOspite] = useState(false);

  const [erroreDate, setErroreDate] = useState(null);
  const [erroreGenerale, setErroreGenerale] = useState(null);
  const [salvataggio, setSalvataggio] = useState(false);

  // Ricerca ospiti con debounce — non cerca se un ospite è già selezionato.
  useEffect(() => {
    if (ospiteSelezionato || ricercaOspite.trim().length < 2) {
      setRisultatiOspiti([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        setCercandoOspiti(true);
        const risposta = await api.get(`/ospiti?search=${encodeURIComponent(ricercaOspite.trim())}`);
        setRisultatiOspiti(risposta.data);
      } catch {
        setRisultatiOspiti([]);
      } finally {
        setCercandoOspiti(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [ricercaOspite, ospiteSelezionato]);

  function validaDate(arrivo, partenza) {
    setErroreDate(arrivo && partenza && partenza <= arrivo ? 'La partenza deve essere successiva all\'arrivo.' : null);
  }

  async function creaNuovoOspite() {
    setErroreNuovoOspite(null);
    if (!nuovoOspiteNome.trim() || !nuovoOspiteCognome.trim()) {
      setErroreNuovoOspite('Nome e cognome sono obbligatori.');
      return;
    }
    setCreandoOspite(true);
    try {
      const risposta = await api.post('/ospiti', {
        nome: nuovoOspiteNome.trim(),
        cognome: nuovoOspiteCognome.trim(),
      });
      setOspiteSelezionato(risposta.data);
      setNuovoOspiteAperto(false);
      setNuovoOspiteNome('');
      setNuovoOspiteCognome('');
    } catch (err) {
      setErroreNuovoOspite(err.response?.data?.error || err.message || 'Errore nella creazione ospite.');
    } finally {
      setCreandoOspite(false);
    }
  }

  async function invia() {
    setErroreGenerale(null);
    if (!cameraId) return setErroreGenerale('Seleziona una camera.');
    if (!ospiteSelezionato) return setErroreGenerale('Seleziona o crea un ospite.');
    if (!dataArrivo || !dataPartenza) return setErroreGenerale('Inserisci le date di arrivo e partenza.');
    if (dataPartenza <= dataArrivo) return setErroreDate('La partenza deve essere successiva all\'arrivo.');

    setSalvataggio(true);
    try {
      await api.post('/prenotazioni', {
        canale_origine: canaleOrigine,
        external_booking_id: null,
        gruppo_id: null,
        note: note || '',
        soggiorno: {
          camera_id: Number(cameraId),
          ospite_id: ospiteSelezionato.id,
          data_arrivo: dataArrivo,
          data_partenza: dataPartenza,
          num_ospiti: Number(numOspiti) || 1,
          tariffa_totale: tariffaTotale === '' ? null : Number(tariffaTotale),
        },
      });
      onCreato();
    } catch (err) {
      if (err.response?.status === 409) {
        setErroreGenerale(err.message || 'Camera già occupata in queste date.');
      } else {
        setErroreGenerale(err.response?.data?.error || err.message || 'Errore nella creazione della prenotazione.');
      }
    } finally {
      setSalvataggio(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onChiudi}>
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white z-10">
          <p className="font-semibold text-sm">Nuova prenotazione</p>
          <button onClick={onChiudi} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {erroreGenerale && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                 style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
              <AlertTriangle size={14} /> {erroreGenerale}
            </div>
          )}

          <div>
            <label className="text-xs font-medium block mb-1">Camera</label>
            <select
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">Seleziona camera...</option>
              {elencoCamere.map(c => (
                <option key={c.camera_id} value={c.camera_id}>
                  {c.numero !== 'app' ? `Camera ${c.numero}` : c.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1">Ospite</label>
            {ospiteSelezionato ? (
              <div className="flex items-center justify-between border rounded-lg px-2 py-1.5 text-sm">
                <span className="flex items-center gap-1.5"><User size={14} /> {ospiteSelezionato.nome} {ospiteSelezionato.cognome}</span>
                <button type="button" onClick={() => setOspiteSelezionato(null)} className="text-xs underline" style={{ color: 'var(--muted-foreground)' }}>
                  Cambia
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={ricercaOspite}
                  onChange={(e) => setRicercaOspite(e.target.value)}
                  placeholder="Cerca per nome o cognome..."
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                />
                {cercandoOspiti && (
                  <div className="absolute right-2 top-1.5"><Loader2 size={14} className="animate-spin" /></div>
                )}
                {risultatiOspiti.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {risultatiOspiti.map(o => (
                      <button
                        type="button"
                        key={o.id}
                        onClick={() => { setOspiteSelezionato(o); setRicercaOspite(''); setRisultatiOspiti([]); }}
                        className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50"
                      >
                        {o.nome} {o.cognome}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setNuovoOspiteAperto(v => !v)}
                  className="mt-1.5 text-xs font-medium flex items-center gap-1"
                  style={{ color: 'var(--hotel-navy)' }}
                >
                  <UserPlus size={13} /> Nuovo ospite
                </button>

                {nuovoOspiteAperto && (
                  <div className="mt-2 border rounded-lg p-2.5 space-y-2" style={{ background: 'var(--background)' }}>
                    {erroreNuovoOspite && (
                      <p className="text-xs" style={{ color: 'var(--status-red-text)' }}>{erroreNuovoOspite}</p>
                    )}
                    <input
                      type="text"
                      value={nuovoOspiteNome}
                      onChange={(e) => setNuovoOspiteNome(e.target.value)}
                      placeholder="Nome"
                      className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    />
                    <input
                      type="text"
                      value={nuovoOspiteCognome}
                      onChange={(e) => setNuovoOspiteCognome(e.target.value)}
                      placeholder="Cognome"
                      className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={creaNuovoOspite}
                        disabled={creandoOspite}
                        className="flex-1 rounded-lg py-1.5 text-xs font-medium text-white"
                        style={{ background: 'var(--hotel-navy)' }}
                      >
                        {creandoOspite ? 'Creazione...' : 'Crea e usa'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setNuovoOspiteAperto(false); setErroreNuovoOspite(null); }}
                        className="flex-1 rounded-lg py-1.5 text-xs font-medium border"
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium block mb-1">Arrivo</label>
              <input
                type="date"
                value={dataArrivo}
                onChange={(e) => { setDataArrivo(e.target.value); validaDate(e.target.value, dataPartenza); }}
                className="w-full border rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Partenza</label>
              <input
                type="date"
                value={dataPartenza}
                onChange={(e) => { setDataPartenza(e.target.value); validaDate(dataArrivo, e.target.value); }}
                className="w-full border rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          {erroreDate && <p className="text-xs" style={{ color: 'var(--status-red-text)' }}>{erroreDate}</p>}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium block mb-1">Numero ospiti</label>
              <input
                type="number"
                min={1}
                value={numOspiti}
                onChange={(e) => setNumOspiti(e.target.value)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Tariffa totale (€)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={tariffaTotale}
                onChange={(e) => setTariffaTotale(e.target.value)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1">Canale origine</label>
            <select
              value={canaleOrigine}
              onChange={(e) => setCanaleOrigine(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
            >
              {CANALI_ORIGINE.map(c => <option key={c.valore} value={c.valore}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1">Note</label>
            <textarea
              value={note}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={invia}
              disabled={salvataggio}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white"
              style={{ background: 'var(--hotel-amber)' }}
            >
              {salvataggio ? 'Creazione...' : 'Crea prenotazione'}
            </button>
            <button onClick={onChiudi} className="flex-1 rounded-lg py-2 text-sm font-medium border">
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pagina principale ────────────────────────────────────────────────────────

export default function PaginaPlanningCamere() {
  const { utente } = useAuth();
  const [rangeModo, setRangeModo] = useState('7');
  const [ancora, setAncora] = useState(oggi());
  const [righe, setRighe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [dragErrore, setDragErrore] = useState(null);
  const [prenotazioneApertaId, setPrenotazioneApertaId] = useState(null);
  const [formNuovaPrenotazione, setFormNuovaPrenotazione] = useState(null);

  const puoTrascinare = RUOLI_TRASCINA.includes(utente?.ruolo);
  const giorni = useMemo(() => calcolaGiorni(ancora, rangeModo), [ancora, rangeModo]);
  const oggiStr = oggi();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Guardia difensiva: evita che un click "residuo" dopo il rilascio di un
  // drag-and-drop apra per errore il form da cella vuota. useDroppable non
  // registra listener sulla cella (solo il ref), quindi in condizioni normali
  // non c'è conflitto — questo ref è solo una rete di sicurezza aggiuntiva.
  const dragInCorsoRef = useRef(false);

  function apriFormDaCella(cameraId, giorno) {
    if (dragInCorsoRef.current) return;
    setFormNuovaPrenotazione({ camera_id: cameraId, data_arrivo: giorno, data_partenza: spostaData(giorno, 1) });
  }

  const caricaGriglia = useCallback(async () => {
    try {
      setLoading(true);
      setErrore(null);
      const dataInizio = giorni[0];
      const dataFine = spostaData(giorni[giorni.length - 1], 1); // esclusivo, coerente col backend
      const risposta = await api.get(`/prenotazioni/griglia?data_inizio=${dataInizio}&data_fine=${dataFine}`);
      setRighe(risposta.data);
    } catch (err) {
      setErrore('Errore nel caricamento della griglia');
    } finally {
      setLoading(false);
    }
  }, [giorni]);

  useEffect(() => { caricaGriglia(); }, [caricaGriglia]);

  function cambiaRange(nuovoModo) {
    if (nuovoModo === 'mese' && rangeModo !== 'mese') {
      setAncora(a => primoGiornoMese(a));
    }
    setRangeModo(nuovoModo);
  }

  function vaiIndietro() {
    if (rangeModo === 'mese') setAncora(a => spostaMese(a, -1));
    else setAncora(a => spostaData(a, -(rangeModo === '14' ? 14 : 7)));
  }

  function vaiAvanti() {
    if (rangeModo === 'mese') setAncora(a => spostaMese(a, 1));
    else setAncora(a => spostaData(a, rangeModo === '14' ? 14 : 7));
  }

  // Righe camera raggruppate per piano — l'ordine arriva già corretto dal
  // backend (piano NULLS LAST, numero), la Map preserva l'ordine di prima
  // apparizione. Ogni camera è presente anche se non ha soggiorni nel range
  // (LEFT JOIN lato backend) — riga vuota, nessuna barra.
  const gruppiPiano = useMemo(() => {
    const cameraMap = new Map();
    righe.forEach((r) => {
      if (!cameraMap.has(r.camera_id)) {
        cameraMap.set(r.camera_id, {
          camera_id: r.camera_id, numero: r.camera_numero, nome: r.camera_nome, piano: r.piano, soggiorni: [],
        });
      }
      if (r.soggiorno_id) {
        cameraMap.get(r.camera_id).soggiorni.push(r);
      }
    });

    const gruppi = [];
    cameraMap.forEach((camera) => {
      const chiave = camera.piano === null ? 'esterno' : camera.piano;
      let gruppo = gruppi.find(g => g.chiave === chiave);
      if (!gruppo) {
        gruppo = { chiave, etichetta: camera.piano === null ? 'Appartamento esterno' : `Piano ${camera.piano}`, camere: [] };
        gruppi.push(gruppo);
      }
      gruppo.camere.push(camera);
    });
    return gruppi;
  }, [righe]);

  const elencoCamere = useMemo(() => {
    const mappa = new Map();
    righe.forEach(r => {
      if (!mappa.has(r.camera_id)) mappa.set(r.camera_id, { camera_id: r.camera_id, numero: r.camera_numero, nome: r.camera_nome });
    });
    return [...mappa.values()];
  }, [righe]);

  async function eseguiSpostamento(soggiorno, nuovaCameraId, nuovaDataArrivo, nuovaDataPartenza) {
    const backup = righe;
    setDragErrore(null);

    const cameraDestinazione = righe.find(r => r.camera_id === nuovaCameraId);
    setRighe(prev => prev.map(r => (
      r.soggiorno_id === soggiorno.soggiorno_id
        ? {
            ...r,
            camera_id: nuovaCameraId,
            camera_numero: cameraDestinazione?.camera_numero ?? r.camera_numero,
            camera_nome: cameraDestinazione?.camera_nome ?? r.camera_nome,
            piano: cameraDestinazione?.piano ?? r.piano,
            data_arrivo: nuovaDataArrivo,
            data_partenza: nuovaDataPartenza,
          }
        : r
    )));

    try {
      await api.patch(`/soggiorni/${soggiorno.soggiorno_id}`, {
        camera_id: nuovaCameraId,
        data_arrivo: nuovaDataArrivo,
        data_partenza: nuovaDataPartenza,
      });
      await caricaGriglia();
    } catch (err) {
      setRighe(backup);
      setDragErrore(err.response?.status === 409
        ? (err.message || 'Camera già occupata in queste date.')
        : 'Errore durante lo spostamento.');
      setTimeout(() => setDragErrore(null), 5000);
    }
  }

  function handleDragEnd(event) {
    // Reset del ref rimandato di un tick: lascia esaurire un eventuale click
    // sintetico generato dal browser sullo stesso rilascio del puntatore.
    setTimeout(() => { dragInCorsoRef.current = false; }, 0);

    const { active, over, delta } = event;
    if (!over) return;
    const soggiorno = active.data.current.soggiorno;
    const nuovaCameraId = over.data.current.cameraId;
    const deltaGiorni = Math.round(delta.x / LARGHEZZA_COLONNA);

    if (deltaGiorni === 0 && nuovaCameraId === soggiorno.camera_id) return;

    const nuovaDataArrivo = spostaData(soggiorno.data_arrivo, deltaGiorni);
    const nuovaDataPartenza = spostaData(soggiorno.data_partenza, deltaGiorni);
    eseguiSpostamento(soggiorno, nuovaCameraId, nuovaDataArrivo, nuovaDataPartenza);
  }

  const numRighe = gruppiPiano.reduce((tot, g) => tot + 1 + g.camere.length, 0);

  return (
    <AppShell titolo="Prenotazioni camere" sottotitolo="Vista griglia / planning">
      <div className="space-y-3">
        {/* Selettore range + navigazione */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 rounded-lg border p-0.5 bg-white">
            {RANGE_OPZIONI.map(opt => (
              <button
                key={opt.chiave}
                onClick={() => cambiaRange(opt.chiave)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: rangeModo === opt.chiave ? 'var(--hotel-navy)' : 'transparent',
                  color: rangeModo === opt.chiave ? '#fff' : 'var(--foreground)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={vaiIndietro} className="p-1.5 rounded-lg border bg-white"><ChevronLeft size={16} /></button>
            <p className="text-xs font-medium min-w-32 text-center">
              {formatGiornoBreve(giorni[0])} – {formatGiornoBreve(giorni[giorni.length - 1])}
            </p>
            <button onClick={vaiAvanti} className="p-1.5 rounded-lg border bg-white"><ChevronRight size={16} /></button>
          </div>

          {/* Legenda stati */}
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(STATI_COLORI).map(([chiave, c]) => (
              <div key={chiave} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.bg, border: `1px solid ${c.text}` }} />
                {c.label}
              </div>
            ))}
          </div>

          {puoTrascinare && (
            <button
              onClick={() => setFormNuovaPrenotazione({})}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
              style={{ background: 'var(--hotel-amber)' }}
            >
              <Plus size={14} /> Nuova prenotazione
            </button>
          )}
        </div>

        {dragErrore && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
               style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
            <AlertTriangle size={14} /> {dragErrore}
          </div>
        )}

        {errore && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
               style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
            <AlertTriangle size={14} /> {errore}
          </div>
        )}

        {loading && righe.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            <Loader2 size={18} className="animate-spin mr-2" /> Caricamento griglia...
          </div>
        ) : (
          <div className="rounded-lg border bg-white overflow-x-auto">
            <DndContext sensors={sensors} onDragStart={() => { dragInCorsoRef.current = true; }} onDragEnd={handleDragEnd}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `180px repeat(${giorni.length}, ${LARGHEZZA_COLONNA}px)`,
                  gridTemplateRows: `36px repeat(${numRighe}, auto)`,
                }}
              >
                {/* Header: colonna camera */}
                <div style={{ gridColumn: 1, gridRow: 1 }} className="border-b bg-gray-50 sticky left-0 z-10" />
                {/* Header: giorni */}
                {giorni.map((g, i) => (
                  <div
                    key={g}
                    style={{ gridColumn: i + 2, gridRow: 1 }}
                    className="flex items-center justify-center text-[10px] font-medium border-b border-l"
                  >
                    <span style={{ color: g === oggiStr ? 'var(--hotel-amber)' : 'var(--muted-foreground)' }}>
                      {formatGiornoBreve(g)}
                    </span>
                  </div>
                ))}

                {(() => {
                  let riga = 2;
                  const elementi = [];
                  gruppiPiano.forEach((gruppo) => {
                    elementi.push(
                      <div
                        key={`g-${gruppo.chiave}`}
                        style={{ gridColumn: `1 / ${giorni.length + 2}`, gridRow: riga, background: 'var(--background)' }}
                        className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide border-b"
                      >
                        {gruppo.etichetta}
                      </div>
                    );
                    riga++;
                    gruppo.camere.forEach((camera) => {
                      elementi.push(
                        <RigaCamera
                          key={camera.camera_id}
                          camera={camera}
                          giorni={giorni}
                          rigaGrid={riga}
                          oggiStr={oggiStr}
                          puoTrascinare={puoTrascinare}
                          onApriDettaglio={setPrenotazioneApertaId}
                          onCellaVuota={apriFormDaCella}
                        />
                      );
                      riga++;
                    });
                  });
                  return elementi;
                })()}
              </div>
            </DndContext>
          </div>
        )}
      </div>

      {prenotazioneApertaId && (
        <PannelloDettaglio
          prenotazioneId={prenotazioneApertaId}
          elencoCamere={elencoCamere}
          onChiudi={() => setPrenotazioneApertaId(null)}
          onCambiato={caricaGriglia}
        />
      )}

      {formNuovaPrenotazione && (
        <FormNuovaPrenotazione
          iniziale={formNuovaPrenotazione}
          elencoCamere={elencoCamere}
          onChiudi={() => setFormNuovaPrenotazione(null)}
          onCreato={async () => {
            setFormNuovaPrenotazione(null);
            await caricaGriglia();
          }}
        />
      )}
    </AppShell>
  );
}
