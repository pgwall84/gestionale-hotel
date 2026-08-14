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
  BrushCleaning, StickyNote, Circle, CheckCircle, Mail, Receipt, Search, LayoutGrid, List, Printer, Download,
} from 'lucide-react';
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import CampoData from '@/components/ui/CampoData';

// Larghezza colonna giorno: MINIMA, non fissa (fix 31/07/2026 — la griglia
// deve riempire lo spazio disponibile, non lasciare spazio vuoto a destra
// quando ci sono poche colonne come in vista 7gg). Le colonne usano
// `minmax(LARGHEZZA_COLONNA_MIN, 1fr)` in CSS Grid: si allargano da sole per
// riempire lo spazio disponibile, senza scendere sotto questo minimo — il
// browser gestisce la reattività al resize, nessuna misura JS necessaria.
const LARGHEZZA_COLONNA_MIN = 56;
// Vista "Mese" (fix 31/07/2026, seguito): 28-31 colonne non ci stanno con lo
// stesso minimo delle viste 7gg/14gg — 31 × 56px = 1736px, oltre la larghezza
// utile su quasi tutti gli schermi, quindi si finiva comunque a scorrere in
// orizzontale. Minimo più stretto solo per 'mese' (56px resta invariato per
// 7/14gg, dove le celle contengono anche il testo del giorno settimana).
const LARGHEZZA_COLONNA_MIN_MESE = 32;
const LARGHEZZA_COL_CAMERA = 180; // colonna nome camera, fissa

const RUOLI_TRASCINA = ['admin', 'titolare', 'receptionist'];
// Gestione Stato Camere dalla scopetta (fermata/partenza/pronta/note) —
// stessi ruoli di shared/ruoli.js sezione 'camere'.scrittura: include anche
// portiere_notte (che non trascina prenotazioni, ma gestisce lo stato camere
// durante il turno di notte), esclude cameriere (limitato a "segna pronta"
// nella pagina /camere dedicata, non ha accesso a questa griglia).
const RUOLI_GESTIONE_CAMERE = ['admin', 'titolare', 'receptionist', 'portiere_notte'];

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

// Mai new Date().toISOString() qui: converte in UTC e in Italia (UTC+1/+2)
// fa perdere un giorno per un paio d'ore ogni notte (bug gemello di quello
// corretto il 31/07/2026 in frontend/app/camere/page.jsx — spostaGiorno).
function oggi() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

// soloNumero=true (vista Mese, colonna stretta): solo il numero, niente
// giorno della settimana — a 32px "gio 30" non ci starebbe leggibile.
function formatGiornoBreve(d, soloNumero = false) {
  return new Date(d + 'T00:00:00').toLocaleDateString(
    'it-IT',
    soloNumero ? { day: 'numeric' } : { weekday: 'short', day: 'numeric' }
  );
}

function formatDataEstesa(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Data compatta per le tabelle export PDF (dd/mm/yyyy) — formatDataEstesa
// è troppo lunga per stare nelle colonne strette dell'elenco stampato.
function formatDataBreve(d) {
  if (!d) return '—';
  const [y, m, g] = d.split('-');
  return `${g}/${m}/${y}`;
}

// Slug mese/anno per il nome file dell'export (es. "agosto_2026").
function slugMese(d) {
  return new Date(d + 'T00:00:00')
    .toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function capitalizza(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Etichetta mese/anno del periodo visualizzato (fix 31/07/2026 — in alto non
// c'era da nessuna parte l'indicazione del mese, solo "ven 31 – gio 6" senza
// contesto). "Luglio 2026" se il range sta in un solo mese, "Luglio -
// Agosto 2026" se lo attraversa (anno ripetuto solo se diverso).
function formatMesePeriodo(giorni) {
  if (!giorni.length) return '';
  const primo = new Date(giorni[0] + 'T00:00:00');
  const ultimo = new Date(giorni[giorni.length - 1] + 'T00:00:00');
  const meseAnno = (d) => capitalizza(d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }));
  if (primo.getMonth() === ultimo.getMonth() && primo.getFullYear() === ultimo.getFullYear()) {
    return meseAnno(primo);
  }
  const soloMese = (d) => capitalizza(d.toLocaleDateString('it-IT', { month: 'long' }));
  if (primo.getFullYear() === ultimo.getFullYear()) {
    return `${soloMese(primo)} - ${soloMese(ultimo)} ${primo.getFullYear()}`;
  }
  return `${meseAnno(primo)} - ${meseAnno(ultimo)}`;
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

// Ricerca nella griglia (14/08/2026) — evidenzia/sfuma invece di nascondere,
// per non perdere il contesto visivo della griglia (stesso pattern di
// Cloudbeds). Confronto su nome/cognome ospite e numero camera, tutti dati
// già presenti nella risposta di /griglia — nessuna chiamata in più.
function corrispondeRicerca(soggiorno, cameraNumero, ricerca) {
  const q = ricerca.trim().toLowerCase();
  if (!q) return true;
  return (
    (soggiorno.ospite_nome || '').toLowerCase().includes(q) ||
    (soggiorno.ospite_cognome || '').toLowerCase().includes(q) ||
    (cameraNumero || '').toLowerCase().includes(q)
  );
}

// Export PDF (14/08/2026) — riduce il font finché il testo non entra nella
// larghezza data, come richiesto esplicitamente dal titolare per il
// planning mensile ("si riduca la dimensione del carattere del cognome").
// Oltre il font minimo, troncamento con "..." come rete di sicurezza per
// cognomi molto lunghi in colonne molto strette — non richiesto dal
// titolare, ma evita testo sovrapposto illeggibile nei casi limite.
// Effetto collaterale voluto: imposta pdf.setFontSize() al valore scelto,
// il chiamante deve solo disegnare il testo restituito dopo la chiamata.
function adattaFontATesto(pdf, testo, larghezzaMax, fontMax = 7, fontMin = 4) {
  let font = fontMax;
  pdf.setFontSize(font);
  while (font > fontMin && pdf.getTextWidth(testo) > larghezzaMax) {
    font -= 0.5;
    pdf.setFontSize(font);
  }
  if (pdf.getTextWidth(testo) <= larghezzaMax) return testo;
  let t = testo;
  while (t.length > 2 && pdf.getTextWidth(`${t}...`) > larghezzaMax) {
    t = t.slice(0, -1);
  }
  return t.length < testo.length ? `${t}...` : testo;
}

// ── Barra prenotazione (draggable) ──────────────────────────────────────────

function Barra({ soggiorno, style, puoTrascinare, onApri, attenuata }) {
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
        opacity: isDragging ? 0.6 : (attenuata ? 0.25 : 1),
        cursor: puoTrascinare ? 'grab' : 'pointer',
      }}
      className="rounded-md px-2 py-1 text-[11px] font-medium truncate m-0.5 flex items-center select-none"
      // Tooltip più dettagliato (04/08/2026, richiesto dal titolare) — prima
      // mostrava solo nome/stato, ora anche le date e il numero ospiti/
      // tariffa, tutti dati già presenti nella risposta della griglia
      // (nessuna chiamata in più). \n rende righe separate nel tooltip nativo.
      title={
        `${soggiorno.ospite_nome} ${soggiorno.ospite_cognome}\n` +
        `${formatDataEstesa(soggiorno.data_arrivo)} → ${formatDataEstesa(soggiorno.data_partenza)}\n` +
        `${soggiorno.num_ospiti} ${soggiorno.num_ospiti === 1 ? 'ospite' : 'ospiti'} · Stato: ${colori.label}` +
        (soggiorno.tariffa_totale ? ` · €${Number(soggiorno.tariffa_totale).toFixed(2)}` : '')
      }
    >
      {soggiorno.ospite_cognome}
    </div>
  );
}

// ── Riga camera (droppable) ─────────────────────────────────────────────────

function RigaCamera({ camera, giorni, rigaGrid, oggiStr, puoTrascinare, puoGestireCamere, statoOggi, larghezzaColonnaMin, onApriDettaglio, onCellaVuota, onApriStatoCamera, ricerca }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `camera-${camera.camera_id}`,
    data: { cameraId: camera.camera_id },
  });

  const pronta = !!statoOggi?.pronta;
  const haNota = !!statoOggi?.note;

  return (
    <>
      <div
        style={{ gridColumn: 1, gridRow: rigaGrid }}
        // border-r aggiunto il 31/07/2026 — mancava la riga verticale tra la
        // colonna camera e il primo giorno visibile (spesso "oggi", dato che
        // la vista parte da oggi di default): l'header ha border-l su ogni
        // colonna giorno, ma il corpo qui non aveva il border-r equivalente
        // per la prima colonna, unico punto dove i due bordi non combaciano.
        className="flex items-center justify-between gap-1 px-3 text-xs font-medium border-b border-r sticky left-0 bg-white"
      >
        <span className="truncate">{camera.numero !== 'app' ? `Camera ${camera.numero}` : camera.nome}</span>
        {/* Scopetta = stato pulizia di OGGI (non della data del range visibile):
            rossa se non pronta, verde se pronta. Click apre il popup di
            gestione (fermata/partenza/pronta/note) — stesse funzionalità di
            "Stato Camere". Icona nota visibile solo se c'è una nota per oggi. */}
        <div className="flex items-center gap-1 shrink-0">
          {haNota && <StickyNote size={12} style={{ color: 'var(--muted-foreground)' }} title={statoOggi.note} />}
          <button
            type="button"
            onClick={() => onApriStatoCamera(camera)}
            disabled={!puoGestireCamere}
            title={pronta ? 'Camera pronta (oggi) — clicca per gestire' : 'Camera da pulire (oggi) — clicca per gestire'}
            className="p-0.5 rounded"
            style={{ cursor: puoGestireCamere ? 'pointer' : 'default' }}
          >
            <BrushCleaning size={13} style={{ color: pronta ? 'var(--status-green-text)' : 'var(--status-red-text)' }} />
          </button>
        </div>
      </div>

      <div
        ref={setNodeRef}
        style={{
          gridColumn: `2 / ${giorni.length + 2}`,
          gridRow: rigaGrid,
          display: 'grid',
          gridTemplateColumns: `repeat(${giorni.length}, minmax(${larghezzaColonnaMin}px, 1fr))`,
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
          const attenuata = !!ricerca && !corrispondeRicerca(s, camera.numero, ricerca);
          return (
            <Barra
              key={s.soggiorno_id}
              soggiorno={s}
              style={{ gridColumn: `${colStart} / ${colEnd}`, gridRow: 1 }}
              puoTrascinare={puoTrascinare}
              onApri={onApriDettaglio}
              attenuata={attenuata}
            />
          );
        })}
      </div>
    </>
  );
}

// ── Riepilogo economico (estratto il 14/08/2026, seguito) ──────────────────
// Usato sia nel pannello dettaglio sia nella nuova schermata di check-out
// (PannelloCheckOut) — stesso contenuto, stessa fonte dati
// (GET /api/prenotazioni/:id/conto), nessuna duplicazione di JSX.
function RiepilogoEconomico({ conto, contoErrore }) {
  return (
    <div className="text-sm rounded-lg border p-3 space-y-2">
      <p className="font-medium flex items-center gap-1.5"><CreditCard size={14} /> Riepilogo economico</p>
      {contoErrore && (
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Riepilogo non disponibile.</p>
      )}
      {conto && (
        <>
          <div className="space-y-1" style={{ color: 'var(--muted-foreground)' }}>
            <div className="flex justify-between">
              <span>Camera</span><span>€{conto.camera.totale.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Addebiti extra</span><span>€{conto.addebiti_extra.totale.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>
                Tassa di soggiorno
                {conto.tassa_soggiorno.soggiorni.some(t => !t.calcolata) && (
                  <span className="italic"> (non ancora calcolata su tutte le camere)</span>
                )}
              </span>
              <span>€{conto.tassa_soggiorno.dovuta.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Già pagato</span><span>− €{conto.pagamenti.totale.toFixed(2)}</span>
            </div>
            {conto.tassa_soggiorno.riscossa > 0 && (
              <div className="flex justify-between">
                <span>Tassa già riscossa</span><span>− €{conto.tassa_soggiorno.riscossa.toFixed(2)}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between pt-2 border-t font-semibold">
            <span>Saldo da incassare</span>
            <span style={{ color: conto.saldo_da_incassare > 0 ? 'var(--status-red-text)' : 'var(--status-green-text)' }}>
              €{conto.saldo_da_incassare.toFixed(2)}
            </span>
          </div>
          {conto.pagamenti.voci.length > 0 && (
            <details className="text-xs pt-1">
              <summary className="cursor-pointer" style={{ color: 'var(--muted-foreground)' }}>
                Dettaglio pagamenti ({conto.pagamenti.voci.length})
              </summary>
              <ul className="mt-1 space-y-0.5">
                {conto.pagamenti.voci.map(p => (
                  <li key={p.id} style={{ color: 'var(--muted-foreground)' }}>
                    {Number(p.importo).toFixed(2)} € — {p.metodo || '—'} ({p.tipo})
                  </li>
                ))}
              </ul>
            </details>
          )}
          {conto.addebiti_extra.voci.length > 0 && (
            <details className="text-xs pt-1">
              <summary className="cursor-pointer" style={{ color: 'var(--muted-foreground)' }}>
                Dettaglio addebiti extra ({conto.addebiti_extra.voci.length})
              </summary>
              <ul className="mt-1 space-y-0.5">
                {conto.addebiti_extra.voci.map(a => (
                  <li key={a.id} style={{ color: 'var(--muted-foreground)' }}>
                    {Number(a.importo).toFixed(2)} € — {a.descrizione}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
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
  const [testEmailInCorso, setTestEmailInCorso] = useState(null); // 'conferma' | 'promemoria' | 'recensione' | null
  const [testEmailEsito, setTestEmailEsito] = useState(null); // { tipo, ok, motivo?, destinatario? }
  const [preCheckinInCorso, setPreCheckinInCorso] = useState(false);
  const [preCheckinEsito, setPreCheckinEsito] = useState(null);
  // Riepilogo economico (14/08/2026) — endpoint separato da /prenotazioni/:id
  // perché aggrega tabelle diverse (soggiorni, addebiti_extra, tasse_soggiorno,
  // pagamenti); caricato in parallelo, un suo errore non deve bloccare il
  // resto del pannello (contoErrore mostra solo un avviso locale).
  const [conto, setConto] = useState(null);
  const [contoErrore, setContoErrore] = useState(false);

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

  const caricaConto = useCallback(async () => {
    // Stessi ruoli di 'pagamenti'/'addebiti_extra' lettura (shared/ruoli.js):
    // niente portiere_notte — evita una chiamata destinata comunque a un 403.
    if (!['admin', 'titolare', 'receptionist'].includes(utente?.ruolo)) return;
    try {
      setContoErrore(false);
      const risposta = await api.get(`/prenotazioni/${prenotazioneId}/conto`);
      setConto(risposta.data);
    } catch (err) {
      setConto(null);
      setContoErrore(true);
    }
  }, [prenotazioneId, utente?.ruolo]);

  useEffect(() => { carica(); caricaConto(); }, [carica, caricaConto]);

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
  // 14/08/2026: non più un PATCH diretto da qui — apre PannelloCheckOut
  // (riepilogo economico + pagamento rapido + stampa ricevuta di cortesia),
  // che esegue il PATCH solo dopo la conferma esplicita dell'operatore.
  const [mostraCheckOut, setMostraCheckOut] = useState(false);

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
  // Stesso set di ruoli di puoScrivere per coincidenza di oggi (pagamenti/
  // addebiti_extra lettura = admin/titolare/receptionist) — tenuto come
  // costante a sé, non un riuso di puoScrivere, perché le due permission
  // potrebbero divergere in futuro senza che sia lo stesso concetto.
  const puoVedereConto = ['admin', 'titolare', 'receptionist'].includes(utente?.ruolo);
  const puoConfermare = puoScrivere && dati?.stato === 'opzione';
  const puoCheckIn = puoScrivere || utente?.ruolo === 'portiere_notte';
  const puoCheckOut = puoScrivere && dati?.stato === 'check_in';
  const puoAnnullare = puoScrivere && ['opzione', 'confermata'].includes(dati?.stato);
  // Pulsante di test email (modulo 5.3, 04/08/2026) — riservato ad
  // admin/titolare, vedi shared/ruoli.js 'prenotazioni'.test_email. Bypassa
  // stato/date reali della prenotazione, serve solo a verificare l'invio.
  const puoTestEmail = ['admin', 'titolare'].includes(utente?.ruolo);

  async function inviaTestEmail(tipo) {
    setTestEmailInCorso(tipo);
    setTestEmailEsito(null);
    try {
      const risposta = await api.post(`/prenotazioni/${prenotazioneId}/test-email`, { tipo });
      setTestEmailEsito({ tipo, ...risposta.data });
    } catch (err) {
      setTestEmailEsito({ tipo, ok: false, motivo: err.message || 'Errore nella richiesta' });
    } finally {
      setTestEmailInCorso(null);
    }
  }

  // Invio manuale (reale) del link di pre check-in (modulo 5.2 Fase B,
  // 04/08/2026) — a differenza del test email qui l'invito è registrato
  // (prenotazioni.pre_checkin_inviato_at): il job del promemoria non lo
  // includerà una seconda volta.
  // Segnalato dal titolare (04/08/2026): ogni invio genera un token nuovo e
  // invalida subito il link precedente (voluto, vedi backend/lib/preCheckin.js)
  // — se si reinvia mentre l'ospite ha ancora aperto il vecchio link, quello
  // smette di funzionare. Se pre_checkin_inviato_at è già valorizzato, il
  // bottone diventa "Invia di nuovo" con conferma esplicita, per non farlo
  // scattare per sbaglio.
  async function inviaPreCheckin() {
    if (dati?.pre_checkin_inviato_at) {
      const conferma = window.confirm(
        'Il pre check-in era già stato inviato per questa prenotazione. Inviarlo di nuovo genera un nuovo link e rende subito non valido quello precedente (se l\'ospite lo ha ancora aperto, smetterà di funzionare). Procedere?'
      );
      if (!conferma) return;
    }
    setPreCheckinInCorso(true);
    setPreCheckinEsito(null);
    try {
      const risposta = await api.post(`/prenotazioni/${prenotazioneId}/invia-pre-checkin`);
      setPreCheckinEsito(risposta.data);
      if (risposta.data?.ok) setDati(d => ({ ...d, pre_checkin_inviato_at: new Date().toISOString() }));
    } catch (err) {
      setPreCheckinEsito({ ok: false, motivo: err.message || 'Errore nella richiesta' });
    } finally {
      setPreCheckinInCorso(false);
    }
  }

  return (
    <>
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
                    {/* Addebiti extra (10/08/2026): apre la griglia rapida bar/camera
                        già con il soggiorno risolto — nessun passaggio "seleziona
                        camera" quando si arriva da qui. */}
                    <Link
                      href={`/addebiti-extra?soggiorno_id=${s.id}&camera=${encodeURIComponent(s.camera_numero ?? '')}&ospite=${encodeURIComponent(intestatario ? `${intestatario.nome} ${intestatario.cognome}` : '')}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 mt-1"
                      style={{ background: 'var(--status-blue-bg)', color: 'var(--status-blue-text)' }}
                    >
                      <Receipt size={13} /> Addebiti extra
                    </Link>
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

              {/* Riepilogo economico (14/08/2026) — sostituisce la vecchia
                  lista pagamenti grezza: camera + addebiti extra + tassa di
                  soggiorno, al netto di quanto già incassato. Non visibile a
                  portiere_notte (stessi permessi di pagamenti/addebiti_extra
                  lettura), coerente con puoVedereConto lato fetch. Componente
                  condiviso con PannelloCheckOut — vedi RiepilogoEconomico. */}
              {puoVedereConto && <RiepilogoEconomico conto={conto} contoErrore={contoErrore} />}

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
                    onClick={() => setMostraCheckOut(true)}
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

              {puoScrivere && (
                <div className="space-y-1.5">
                  {dati.pre_checkin_inviato_at && !preCheckinEsito && (
                    <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                      Pre check-in già inviato il {new Date(dati.pre_checkin_inviato_at).toLocaleString('it-IT')}
                    </p>
                  )}
                  <button
                    onClick={inviaPreCheckin}
                    disabled={preCheckinInCorso}
                    className="w-full rounded-lg py-2 text-sm font-medium border disabled:opacity-60"
                  >
                    {preCheckinInCorso ? 'Invio in corso...' : dati.pre_checkin_inviato_at ? 'Invia di nuovo il link pre check-in' : 'Invia link pre check-in'}
                  </button>
                  {preCheckinEsito && (
                    <p className="text-xs rounded-md px-2 py-1.5"
                       style={{
                         background: preCheckinEsito.ok ? 'var(--status-green-bg)' : 'var(--status-red-bg)',
                         color: preCheckinEsito.ok ? 'var(--status-green-text)' : 'var(--status-red-text)',
                       }}>
                      {preCheckinEsito.ok ? `Inviato a ${preCheckinEsito.destinatario}` : `Non inviato: ${preCheckinEsito.motivo}`}
                    </p>
                  )}
                </div>
              )}

              {puoTestEmail && (
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-xs font-medium flex items-center gap-1.5">
                    <Mail size={13} /> Invio di test (solo admin/titolare)
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    Bypassa stato e date reali — invia subito l'email indicata, per verificare che il flusso funzioni.
                  </p>
                  <div className="flex gap-2">
                    {[
                      { tipo: 'conferma', label: 'Conferma' },
                      { tipo: 'promemoria', label: 'Promemoria' },
                      { tipo: 'recensione', label: 'Recensione' },
                    ].map(({ tipo, label }) => (
                      <button
                        key={tipo}
                        onClick={() => inviaTestEmail(tipo)}
                        disabled={testEmailInCorso !== null}
                        className="flex-1 rounded-lg py-1.5 text-xs font-medium border"
                      >
                        {testEmailInCorso === tipo ? '...' : label}
                      </button>
                    ))}
                  </div>
                  {testEmailEsito && (
                    <p
                      className="text-xs rounded-md px-2 py-1.5"
                      style={{
                        background: testEmailEsito.ok ? 'var(--status-green-bg)' : 'var(--status-red-bg)',
                        color: testEmailEsito.ok ? 'var(--status-green-text)' : 'var(--status-red-text)',
                      }}
                    >
                      {testEmailEsito.ok
                        ? `Inviata (${testEmailEsito.tipo}) a ${testEmailEsito.destinatario}`
                        : `Non inviata (${testEmailEsito.tipo}): ${testEmailEsito.motivo || 'errore sconosciuto'}`}
                    </p>
                  )}
                </div>
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
                  <CampoData value={form.data_arrivo}
                         onChange={(v) => setForm(f => ({ ...f, data_arrivo: v }))}
                         className="border px-2 py-1.5" />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Partenza</label>
                  <CampoData value={form.data_partenza}
                         onChange={(v) => setForm(f => ({ ...f, data_partenza: v }))}
                         className="border px-2 py-1.5" />
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

    {/* Check-out (14/08/2026) — z-50 sopra, sopra il pannello dettaglio
        (anch'esso z-50): livello di stacking identico ma renderizzato dopo
        nel DOM vince, coerente con l'ordine visivo atteso (modal in primo
        piano sul pannello). */}
    {mostraCheckOut && (
      <PannelloCheckOut
        prenotazioneId={prenotazioneId}
        onChiudi={() => setMostraCheckOut(false)}
        onCompletato={() => { setMostraCheckOut(false); onChiudi(); onCambiato(); }}
      />
    )}
    </>
  );
}

// ── Pannello check-out ───────────────────────────────────────────────────────
// Nasce dal confronto competitivo del 14/08/2026: fino a oggi il check-out
// era un semplice PATCH stato='check_out' senza nessuna schermata dedicata,
// nessun riepilogo, nessuna possibilità di stampare una ricevuta —
// segnalato dal titolare come gap reale. Riusa RiepilogoEconomico (stessa
// fonte dati del pannello dettaglio) + un mini-form per registrare un
// pagamento al volo se il saldo non è ancora incassato + un link alla
// ricevuta di cortesia stampabile (NON fiscale — il collegamento
// all'emissione fiscale reale arriverà col modulo 3.1/A-Cube, fuori scope
// qui). Non blocca il check-out se il saldo è ancora positivo: la reception
// può aver incassato altrove (es. contanti già consegnati fuori sistema),
// resta una scelta professionale sua, non un vincolo del software.
function PannelloCheckOut({ prenotazioneId, onChiudi, onCompletato }) {
  const [dati, setDati] = useState(null);
  const [conto, setConto] = useState(null);
  const [contoErrore, setContoErrore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [formPagamento, setFormPagamento] = useState({ importo: '', metodo: 'contanti' });
  const [pagamentoInCorso, setPagamentoInCorso] = useState(false);
  const [pagamentoErrore, setPagamentoErrore] = useState(null);
  // Conferma visibile dopo un pagamento riuscito (14/08/2026, seguito —
  // segnalato dal titolare: se l'importo azzera il saldo, il box con
  // form+pulsante sparisce di scatto perché è condizionato a
  // saldo_da_incassare > 0, senza nessun messaggio — sembrava che il click
  // non avesse fatto nulla). Tenuta visibile ~2.5s anche quando il box del
  // form sta per sparire, poi si cancella da sola.
  const [pagamentoEsito, setPagamentoEsito] = useState(null); // { importo } | null

  const carica = useCallback(async () => {
    try {
      setLoading(true);
      setErrore(null);
      const risDati = await api.get(`/prenotazioni/${prenotazioneId}`);
      setDati(risDati.data);
      try {
        const risConto = await api.get(`/prenotazioni/${prenotazioneId}/conto`);
        setConto(risConto.data);
        setContoErrore(false);
      } catch {
        setContoErrore(true);
      }
    } catch (err) {
      setErrore('Errore nel caricamento');
    } finally {
      setLoading(false);
    }
  }, [prenotazioneId]);

  useEffect(() => { carica(); }, [carica]);

  async function ricaricaConto() {
    try {
      const risConto = await api.get(`/prenotazioni/${prenotazioneId}/conto`);
      setConto(risConto.data);
      setContoErrore(false);
    } catch {
      setContoErrore(true);
    }
  }

  async function registraPagamento(e) {
    e.preventDefault();
    const importo = Number(formPagamento.importo);
    if (!formPagamento.importo || isNaN(importo) || importo <= 0) {
      setPagamentoErrore('Importo non valido.');
      return;
    }
    setPagamentoInCorso(true);
    setPagamentoErrore(null);
    try {
      await api.post(`/prenotazioni/${prenotazioneId}/pagamenti`, {
        importo, metodo: formPagamento.metodo, tipo: 'saldo',
      });
      setFormPagamento(f => ({ ...f, importo: '' }));
      await ricaricaConto();
      setPagamentoEsito({ importo });
      setTimeout(() => setPagamentoEsito(null), 2500);
    } catch (err) {
      setPagamentoErrore(err.message || 'Errore nella registrazione del pagamento');
    } finally {
      setPagamentoInCorso(false);
    }
  }

  async function confermaCheckOut() {
    setSalvataggio(true);
    setErrore(null);
    try {
      await api.patch(`/prenotazioni/${prenotazioneId}/stato`, { stato: 'check_out' });
      onCompletato();
    } catch (err) {
      setErrore(err.message || 'Errore nel check-out');
      setSalvataggio(false);
    }
  }

  function apriRicevuta() {
    // Nuova scheda, così il modal di check-out resta aperto — stesso
    // pattern d'apertura di /menu-stampa (link diretto, non window.open per
    // quello, ma qui serve restare sul modal quindi window.open).
    window.open(`/ricevuta-cortesia/${prenotazioneId}`, '_blank');
  }

  const soggiorno = dati?.soggiorni?.[0];
  const intestatario = soggiorno?.ospiti?.find(o => ['16', '17', '18'].includes(o.tipo_alloggiato)) || soggiorno?.ospiti?.[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white z-10">
          <p className="font-semibold text-sm">Check-out</p>
          <button onClick={onChiudi} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-10 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <Loader2 size={18} className="animate-spin mr-2" /> Caricamento...
            </div>
          )}

          {errore && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                 style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
              <AlertTriangle size={14} /> {errore}
            </div>
          )}

          {dati && !loading && (
            <>
              <div className="text-sm">
                <p className="font-medium flex items-center gap-1.5">
                  <User size={14} /> {intestatario ? `${intestatario.nome} ${intestatario.cognome}` : 'Ospite non indicato'}
                </p>
                {soggiorno && (
                  <p style={{ color: 'var(--muted-foreground)' }}>
                    Camera {soggiorno.camera_numero} · {formatDataEstesa(soggiorno.data_arrivo)} → {formatDataEstesa(soggiorno.data_partenza)}
                  </p>
                )}
              </div>

              <RiepilogoEconomico conto={conto} contoErrore={contoErrore} />

              {conto && conto.saldo_da_incassare > 0 && (
                <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--status-red-text)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--status-red-text)' }}>
                    Saldo non ancora incassato — registra un pagamento, oppure procedi comunque se già saldato fuori sistema.
                  </p>
                  {/* Conferma dopo un pagamento parziale (14/08/2026, seguito)
                      — il saldo resta > 0 quindi il form sotto non sparisce,
                      ma senza questa riga non c'era comunque nessun segnale
                      che il click avesse funzionato. */}
                  {pagamentoEsito && (
                    <p className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--status-green-text)' }}>
                      <CheckCircle size={13} /> Pagamento di €{pagamentoEsito.importo.toFixed(2)} registrato.
                    </p>
                  )}
                  <form onSubmit={registraPagamento} className="flex items-end gap-2 flex-wrap">
                    <div>
                      <label className="text-xs block mb-1">Importo (€)</label>
                      <input
                        type="number" step="0.01" min="0" value={formPagamento.importo}
                        onChange={(e) => setFormPagamento(f => ({ ...f, importo: e.target.value }))}
                        className="w-24 border rounded-lg px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs block mb-1">Metodo</label>
                      <select
                        value={formPagamento.metodo}
                        onChange={(e) => setFormPagamento(f => ({ ...f, metodo: e.target.value }))}
                        className="border rounded-lg px-2 py-1.5 text-sm"
                      >
                        <option value="contanti">Contanti</option>
                        <option value="pos">POS</option>
                        <option value="bonifico">Bonifico</option>
                        <option value="altro">Altro</option>
                      </select>
                    </div>
                    <button
                      type="submit" disabled={pagamentoInCorso}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                      style={{ background: 'var(--hotel-navy)' }}
                    >
                      {pagamentoInCorso ? '...' : 'Registra'}
                    </button>
                  </form>
                  {pagamentoErrore && (
                    <p className="text-xs" style={{ color: 'var(--status-red-text)' }}>{pagamentoErrore}</p>
                  )}
                </div>
              )}

              {/* Saldo azzerato da un pagamento appena registrato
                  (14/08/2026, seguito) — senza questo il box sopra sparisce
                  di scatto non appena saldo_da_incassare tocca 0, senza
                  nessuna conferma visibile. Si cancella da sola dopo ~2.5s
                  (stesso timer di pagamentoEsito). */}
              {conto && conto.saldo_da_incassare <= 0 && pagamentoEsito && (
                <div className="rounded-lg border p-3" style={{ borderColor: 'var(--status-green-text)' }}>
                  <p className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--status-green-text)' }}>
                    <CheckCircle size={13} /> Pagamento di €{pagamentoEsito.importo.toFixed(2)} registrato — saldo azzerato.
                  </p>
                </div>
              )}

              <button
                onClick={apriRicevuta}
                className="w-full rounded-lg py-2 text-sm font-medium border flex items-center justify-center gap-1.5"
              >
                <Printer size={14} /> Stampa ricevuta di cortesia
              </button>

              <div className="flex gap-2">
                <button
                  onClick={confermaCheckOut} disabled={salvataggio}
                  className="flex-1 rounded-lg py-2 text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-navy)' }}
                >
                  {salvataggio ? 'Conferma in corso...' : 'Conferma check-out'}
                </button>
                <button onClick={onChiudi} className="flex-1 rounded-lg py-2 text-sm font-medium border">
                  Annulla
                </button>
              </div>
            </>
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

  // Modulo 2.2 — pacchetto opzionale (prezzo fisso, ha priorità) e
  // auto-calcolo tariffa dal listino quando non c'è un pacchetto selezionato.
  // tariffaAutoValore tiene traccia dell'ultimo valore proposto in automatico:
  // se l'utente lo modifica a mano, il ricalcolo successivo non lo sovrascrive.
  const [pacchetti, setPacchetti] = useState([]);
  const [pacchettoId, setPacchettoId] = useState('');
  const [tariffaAutoValore, setTariffaAutoValore] = useState(null);
  const [avvisoTariffa, setAvvisoTariffa] = useState(null);

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

  // Carica i pacchetti attivi una sola volta all'apertura del form.
  useEffect(() => {
    api.get('/pacchetti?attivo=true').then(res => setPacchetti(res.data)).catch(() => setPacchetti([]));
  }, []);

  function selezionaPacchetto(id) {
    setPacchettoId(id);
    setAvvisoTariffa(null);
    if (id) {
      const pacchetto = pacchetti.find(p => String(p.id) === String(id));
      if (pacchetto) {
        setTariffaTotale(String(pacchetto.prezzo_totale));
        setTariffaAutoValore(Number(pacchetto.prezzo_totale));
      }
    }
  }

  // Auto-calcolo tariffa dal listino (modulo 2.2): solo se non è stato
  // selezionato un pacchetto (ha priorità) e la camera scelta ha una
  // categoria assegnata. Sovrascrive il campo solo se vuoto o se coincide
  // ancora con l'ultimo valore proposto in automatico — se l'utente lo ha
  // modificato a mano, resta come l'ha lasciato.
  useEffect(() => {
    if (pacchettoId) return;
    if (!cameraId || !dataArrivo || !dataPartenza || dataPartenza <= dataArrivo) return;
    const camera = elencoCamere.find(c => String(c.camera_id) === String(cameraId));
    if (!camera?.tipo_camera_id) { setAvvisoTariffa(null); return; }

    let annullato = false;
    (async () => {
      try {
        const res = await api.get(
          `/tariffe/calcola?tipo_camera_id=${camera.tipo_camera_id}&data_arrivo=${dataArrivo}&data_partenza=${dataPartenza}`
        );
        if (annullato) return;
        if (res.data.prezzo_totale !== null) {
          setTariffaTotale(prev => (prev === '' || Number(prev) === tariffaAutoValore ? String(res.data.prezzo_totale) : prev));
          setTariffaAutoValore(res.data.prezzo_totale);
          setAvvisoTariffa(null);
        } else {
          setAvvisoTariffa(`Tariffa non configurata per ${res.data.notti_scoperte.length} notte/i del periodo — inserisci il totale a mano.`);
        }
      } catch {
        setAvvisoTariffa(null);
      }
    })();
    return () => { annullato = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, dataArrivo, dataPartenza, pacchettoId, elencoCamere]);

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
          pacchetto_id: pacchettoId ? Number(pacchettoId) : null,
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
              <CampoData
                value={dataArrivo}
                onChange={(v) => { setDataArrivo(v); validaDate(v, dataPartenza); }}
                className="border px-2 py-1.5"
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Partenza</label>
              <CampoData
                value={dataPartenza}
                onChange={(v) => { setDataPartenza(v); validaDate(dataArrivo, v); }}
                className="border px-2 py-1.5"
              />
            </div>
          </div>
          {erroreDate && <p className="text-xs" style={{ color: 'var(--status-red-text)' }}>{erroreDate}</p>}

          <div>
            <label className="text-xs font-medium block mb-1">Pacchetto (opzionale)</label>
            <select
              value={pacchettoId}
              onChange={(e) => selezionaPacchetto(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">Nessun pacchetto — tariffa da listino</option>
              {pacchetti.map(p => (
                <option key={p.id} value={p.id}>{p.nome} — €{Number(p.prezzo_totale).toFixed(2)} ({p.num_notti} notti)</option>
              ))}
            </select>
          </div>

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
          {avvisoTariffa && (
            <p className="text-xs" style={{ color: 'var(--hotel-amber)' }}>{avvisoTariffa}</p>
          )}

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

// ── Popup Stato Camera (scopetta) ───────────────────────────────────────────
// Stesse funzionalità della pagina "Stato Camere" (/camere) ma per la camera
// cliccata nel planning, sempre riferite a OGGI (non alla data del range
// visualizzato) — la pulizia è un'operazione giornaliera, non legata al
// giorno che si sta guardando in griglia.
// Modulo 5.1 (03/08/2026): fermata/partenza non sono più toggle manuali qui
// — sono calcolate dal backend da `soggiorni` (vedi camereController.js),
// mostrate in sola lettura. Note: shared/ruoli.js sezione 'camere'.scrittura.
// Pronta: sezione 'camere'.pulizia (invariato per questa griglia, dato che
// RUOLI_GESTIONE_CAMERE non include cameriere/dipendente — quei ruoli non
// hanno comunque accesso a /planning-camere, usano /camere per "pronta").

function PopupStatoCamera({ camera, statoOggi, onChiudi, onSalvato }) {
  const arrivo = !!statoOggi?.arrivo;
  const partenza = !!statoOggi?.partenza;
  const [pronta, setPronta] = useState(!!statoOggi?.pronta);
  const [note, setNote] = useState(statoOggi?.note || '');
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState(null);

  async function salva() {
    setSalvataggio(true);
    setErrore(null);
    const dataOggi = oggi();
    try {
      await api.post('/camere/stato', { camera_id: camera.camera_id, data: dataOggi, note });
      await api.post('/camere/pronta', { camera_id: camera.camera_id, data: dataOggi, pronta });
      await onSalvato();
      onChiudi();
    } catch (err) {
      setErrore(err.message || 'Errore nel salvataggio.');
    } finally {
      setSalvataggio(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onChiudi}>
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="font-semibold text-sm">
            Stato camera — {camera.numero !== 'app' ? `Camera ${camera.numero}` : camera.nome}
          </p>
          <button onClick={onChiudi} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Riferito a oggi, {formatDataEstesa(oggi())}</p>

          {errore && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                 style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
              <AlertTriangle size={14} /> {errore}
            </div>
          )}

          {/* Sola lettura — calcolate da soggiorni (modulo 5.1), non più toggle */}
          <div className="flex gap-2">
            <div className="flex-1 py-2 rounded-lg text-xs font-medium border text-center"
                 style={{
                   background: arrivo ? 'var(--status-green-text)' : 'var(--background)',
                   color: arrivo ? 'white' : 'var(--muted-foreground)',
                 }}>
              Fermata
            </div>
            <div className="flex-1 py-2 rounded-lg text-xs font-medium border text-center"
                 style={{
                   background: partenza ? 'var(--status-red-text)' : 'var(--background)',
                   color: partenza ? 'white' : 'var(--muted-foreground)',
                 }}>
              Partenza
            </div>
          </div>

          <button type="button" onClick={() => setPronta(p => !p)}
                  className="w-full py-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5"
                  style={{
                    background: pronta ? 'var(--status-blue-text)' : 'var(--background)',
                    color: pronta ? 'white' : 'var(--muted-foreground)',
                  }}>
            {pronta ? <CheckCircle size={13} /> : <Circle size={13} />}
            {pronta ? 'Pronta' : 'Segna come pronta'}
          </button>

          <div>
            <label className="text-xs font-medium block mb-1">Note</label>
            <textarea value={note} rows={2} onChange={(e) => setNote(e.target.value)}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm" />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={salva} disabled={salvataggio}
                    className="flex-1 rounded-lg py-2 text-sm font-medium text-white disabled:opacity-60"
                    style={{ background: 'var(--hotel-amber)' }}>
              {salvataggio ? 'Salvataggio...' : 'Salva'}
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

// ── Vista elenco (lista filtrabile) ─────────────────────────────────────────
// Alternativa alla griglia per la ricerca libera su tutto lo storico
// (14/08/2026, confronto con la pagina "Reservations" di Cloudbeds) — la
// griglia resta la vista operativa quotidiana (range di date visibili),
// questa risponde a "trovami questa prenotazione", una riga per soggiorno/
// camera (non per prenotazione — un gruppo multi-camera compare su più
// righe, stessa scelta di granularità già motivata in prenotazioniController.lista).
function VistaElenco({ onApriPrenotazione, onFiltriCambiati }) {
  const [filtri, setFiltri] = useState({ ricerca: '', data_da: '', data_a: '', stato: '' });
  const [pagina, setPagina] = useState(1);
  const [risultati, setRisultati] = useState([]);
  const [totale, setTotale] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const PER_PAGINA = 30;

  const carica = useCallback(async () => {
    try {
      setLoading(true);
      setErrore(null);
      const parametri = new URLSearchParams({ pagina: String(pagina), per_pagina: String(PER_PAGINA) });
      if (filtri.ricerca) parametri.set('ricerca', filtri.ricerca);
      if (filtri.data_da) parametri.set('data_da', filtri.data_da);
      if (filtri.data_a) parametri.set('data_a', filtri.data_a);
      if (filtri.stato) parametri.set('stato', filtri.stato);
      const risposta = await api.get(`/prenotazioni?${parametri.toString()}`);
      setRisultati(risposta.data.risultati);
      setTotale(risposta.data.totale);
    } catch (err) {
      setErrore('Errore nel caricamento dell\'elenco');
    } finally {
      setLoading(false);
    }
  }, [filtri, pagina]);

  useEffect(() => { carica(); }, [carica]);

  // Espone i filtri correnti al genitore (14/08/2026, export PDF) — il
  // pulsante "Esporta" vive nel toolbar della pagina principale, non qui,
  // ma l'export dell'elenco deve rispettare gli stessi filtri attivi a
  // schermo. Nessun sollevamento di stato: solo un callback, VistaElenco
  // resta proprietaria del proprio stato come prima.
  useEffect(() => { onFiltriCambiati?.(filtri); }, [filtri, onFiltriCambiati]);

  // Ogni cambio filtro riparte da pagina 1 — evita di restare su una pagina
  // che risulta vuota dopo aver ristretto la ricerca.
  function aggiornaFiltro(campo, valore) {
    setFiltri(f => ({ ...f, [campo]: valore }));
    setPagina(1);
  }

  function azzeraFiltri() {
    setFiltri({ ricerca: '', data_da: '', data_a: '', stato: '' });
    setPagina(1);
  }

  const filtriAttivi = !!(filtri.ricerca || filtri.data_da || filtri.data_a || filtri.stato);
  const numPagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const campoDataStyle = { border: '1px solid var(--border)', background: 'var(--background)', padding: '5px 6px' };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 flex-wrap rounded-lg border bg-white p-3">
        <div>
          <label className="text-xs font-medium block mb-1">Ospite o camera</label>
          <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5">
            <Search size={14} style={{ color: 'var(--muted-foreground)' }} />
            <input
              type="text"
              value={filtri.ricerca}
              onChange={(e) => aggiornaFiltro('ricerca', e.target.value)}
              placeholder="Nome, cognome, numero camera..."
              className="text-xs outline-none w-48"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Arrivo dal</label>
          <CampoData value={filtri.data_da} onChange={(v) => aggiornaFiltro('data_da', v)} className="rounded-lg" style={campoDataStyle} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">al</label>
          <CampoData value={filtri.data_a} onChange={(v) => aggiornaFiltro('data_a', v)} className="rounded-lg" style={campoDataStyle} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Stato</label>
          <select
            value={filtri.stato}
            onChange={(e) => aggiornaFiltro('stato', e.target.value)}
            className="text-xs border rounded-lg px-2 py-2"
          >
            <option value="">Tutti</option>
            {Object.entries(STATI_COLORI).map(([chiave, c]) => (
              <option key={chiave} value={chiave}>{c.label}</option>
            ))}
          </select>
        </div>
        {filtriAttivi && (
          <button onClick={azzeraFiltri} className="text-xs font-medium rounded-lg px-3 py-2 border">
            Azzera filtri
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--muted-foreground)' }}>
          {totale} {totale === 1 ? 'risultato' : 'risultati'}
        </span>
      </div>

      {errore && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          <AlertTriangle size={14} /> {errore}
        </div>
      )}

      <div className="rounded-lg border bg-white overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            <Loader2 size={18} className="animate-spin mr-2" /> Caricamento...
          </div>
        ) : risultati.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: 'var(--muted-foreground)' }}>
            Nessuna prenotazione trovata{filtriAttivi ? ' con questi filtri.' : '.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                <th className="px-3 py-2">Ospite</th>
                <th className="px-3 py-2">Camera</th>
                <th className="px-3 py-2">Arrivo</th>
                <th className="px-3 py-2">Partenza</th>
                <th className="px-3 py-2">Ospiti</th>
                <th className="px-3 py-2">Canale</th>
                <th className="px-3 py-2">Stato</th>
              </tr>
            </thead>
            <tbody>
              {risultati.map((r) => {
                const colori = STATI_COLORI[r.stato] || STATI_COLORI.opzione;
                return (
                  <tr
                    key={r.soggiorno_id}
                    onClick={() => onApriPrenotazione(r.prenotazione_id)}
                    className="border-b cursor-pointer hover:bg-gray-50"
                  >
                    <td className="px-3 py-2">{r.ospite_nome ? `${r.ospite_nome} ${r.ospite_cognome}` : '—'}</td>
                    <td className="px-3 py-2">{r.camera_numero}</td>
                    <td className="px-3 py-2">{formatDataEstesa(r.data_arrivo)}</td>
                    <td className="px-3 py-2">{formatDataEstesa(r.data_partenza)}</td>
                    <td className="px-3 py-2">{r.num_ospiti}</td>
                    <td className="px-3 py-2">{r.canale_origine || '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block text-xs font-medium rounded-full px-2 py-0.5"
                        style={{ background: colori.bg, color: colori.text }}
                      >
                        {colori.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {numPagine > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPagina(p => Math.max(1, p - 1))}
            disabled={pagina === 1}
            className="p-1.5 rounded-lg border bg-white disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Pagina {pagina} di {numPagine}
          </span>
          <button
            onClick={() => setPagina(p => Math.min(numPagine, p + 1))}
            disabled={pagina === numPagine}
            className="p-1.5 rounded-lg border bg-white disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Pagina principale ────────────────────────────────────────────────────────

export default function PaginaPlanningCamere() {
  const { utente } = useAuth();
  // Default 14 giorni (era 7) — richiesto dal titolare 04/08/2026.
  // Toggle Griglia/Elenco (14/08/2026) — stessa voce di sidebar, due modi di
  // consultare la stessa realtà: griglia per l'operatività quotidiana,
  // elenco per la ricerca libera su tutto lo storico (vedi VistaElenco).
  const [vista, setVista] = useState('griglia');
  // Ricerca nella griglia (14/08/2026) — evidenzia/sfuma le barre, non le
  // nasconde: vedi corrispondeRicerca.
  const [ricercaGriglia, setRicercaGriglia] = useState('');
  const [rangeModo, setRangeModo] = useState('14');
  const [ancora, setAncora] = useState(oggi());
  const [righe, setRighe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [dragErrore, setDragErrore] = useState(null);
  const [prenotazioneApertaId, setPrenotazioneApertaId] = useState(null);
  const [formNuovaPrenotazione, setFormNuovaPrenotazione] = useState(null);
  const [statoOggiMap, setStatoOggiMap] = useState({}); // camera_id → {arrivo,partenza,pronta,note} di OGGI
  const [cameraStatoAperta, setCameraStatoAperta] = useState(null); // camera su cui è aperto il popup scopetta

  // Export PDF (14/08/2026) — pulsante "Esporta" nel toolbar, prima di
  // "Nuova prenotazione". Due contenuti diversi (vedi docs/EVOLUTIVE.md):
  // planning mensile (griglia camere × giorni del mese corrente) ed elenco
  // prenotazioni (rispetta i filtri attivi in VistaElenco). filtriElencoRef
  // riceve i filtri correnti da VistaElenco via callback, senza sollevarne
  // lo stato — vedi onFiltriCambiati lì sopra.
  const [menuEsportaAperto, setMenuEsportaAperto] = useState(false);
  const [esportando, setEsportando] = useState(null); // 'planning' | 'elenco' | null
  const [erroreExport, setErroreExport] = useState(null);
  const filtriElencoRef = useRef({ ricerca: '', data_da: '', data_a: '', stato: '' });
  const setFiltriElencoRef = useCallback((f) => { filtriElencoRef.current = f; }, []);

  const puoTrascinare = RUOLI_TRASCINA.includes(utente?.ruolo);
  const puoGestireCamere = RUOLI_GESTIONE_CAMERE.includes(utente?.ruolo);
  const giorni = useMemo(() => calcolaGiorni(ancora, rangeModo), [ancora, rangeModo]);
  const oggiStr = oggi();

  // Larghezza colonna dinamica (fix 31/07/2026, rivisto dopo verifica in UI:
  // il primo tentativo con ResizeObserver + larghezza calcolata in px non
  // riempiva lo spazio reale). Soluzione più robusta: `minmax(MIN, 1fr)`
  // nativo di CSS Grid — ogni colonna giorno non scende mai sotto
  // LARGHEZZA_COLONNA_MIN, ma si allarga automaticamente per riempire lo
  // spazio disponibile (vista 7gg/14gg su schermi larghi); se lo spazio non
  // basta nonostante il minimo, scrolla come prima (vedi però il minimo
  // ridotto per 'mese' subito sotto, per ridurre i casi in cui questo serve)
  // — nessuna misurazione JS necessaria, il browser lo fa da solo e reagisce
  // subito al resize della finestra. Per il drag-and-drop (che deve
  // convertire un delta in pixel in un numero di giorni) la larghezza
  // effettiva viene letta dal DOM al momento del rilascio — vedi
  // primaColonnaRef e handleDragEnd più sotto, non da uno stato calcolato,
  // per restare sempre allineata al valore realmente disegnato dal browser.
  const primaColonnaRef = useRef(null);
  // Minimo colonna dipendente dalla vista: 'mese' usa un minimo più stretto
  // (fix 31/07/2026, seguito) per far stare le 28-31 colonne senza scroll
  // orizzontale — vedi LARGHEZZA_COLONNA_MIN_MESE in cima al file.
  const larghezzaColonnaMin = rangeModo === 'mese' ? LARGHEZZA_COLONNA_MIN_MESE : LARGHEZZA_COLONNA_MIN;

  // Stato pulizia/note di oggi per tutte le camere, per colorare la scopetta
  // nella riga camera — indipendente dal range di date visualizzato.
  const caricaStatoOggi = useCallback(async () => {
    try {
      const risposta = await api.get(`/camere?data=${oggiStr}`);
      const map = {};
      risposta.data.camere.forEach(c => { map[c.id] = c; });
      setStatoOggiMap(map);
    } catch {
      // non bloccante: la scopetta resta semplicemente grigia/rossa di default
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { caricaStatoOggi(); }, [caricaStatoOggi]);

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
      if (!mappa.has(r.camera_id)) {
        mappa.set(r.camera_id, {
          camera_id: r.camera_id, numero: r.camera_numero, nome: r.camera_nome,
          tipo_camera_id: r.tipo_camera_id, // modulo 2.2 — usato per l'auto-calcolo tariffa nel form
        });
      }
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
    // Larghezza reale letta dal DOM (colonne fluide con minmax(...,1fr) —
    // non c'è più un valore fisso calcolato in JS da tenere sincronizzato).
    const larghezzaColonnaAttuale = primaColonnaRef.current?.offsetWidth || larghezzaColonnaMin;
    const deltaGiorni = Math.round(delta.x / larghezzaColonnaAttuale);

    if (deltaGiorni === 0 && nuovaCameraId === soggiorno.camera_id) return;

    const nuovaDataArrivo = spostaData(soggiorno.data_arrivo, deltaGiorni);
    const nuovaDataPartenza = spostaData(soggiorno.data_partenza, deltaGiorni);
    eseguiSpostamento(soggiorno, nuovaCameraId, nuovaDataArrivo, nuovaDataPartenza);
  }

  const numRighe = gruppiPiano.reduce((tot, g) => tot + 1 + g.camere.length, 0);

  // ── Export planning mensile (PDF, 14/08/2026) ─────────────────────────────
  // Sempre il mese di "ancora" (indipendente dal range di vista 7/14gg/mese
  // a schermo) — è il concetto "planning mensile" richiesto dal titolare,
  // non "l'export di qualunque range si stia guardando". Fetch dedicato,
  // non riusa `righe`/`gruppiPiano` dello stato pagina: quelli riflettono
  // il range visualizzato, che può non coincidere col mese intero.
  // Layout: A4 orizzontale, riga per camera, colonna per giorno, cognome
  // dentro una barra unica per soggiorno (stessa geometria di calcolaBarra
  // usata a schermo) — non una cella per ogni giorno separatamente.
  async function esportaPlanningMensile() {
    setErroreExport(null);
    setEsportando('planning');
    try {
      const mese = primoGiornoMese(ancora);
      const giorniMese = calcolaGiorni(mese, 'mese');
      const dataFineEsclusiva = spostaData(giorniMese[giorniMese.length - 1], 1);
      const risposta = await api.get(`/prenotazioni/griglia?data_inizio=${mese}&data_fine=${dataFineEsclusiva}`);
      const righeMese = risposta.data;

      // Raggruppamento camere/piano identico a gruppiPiano sopra, ma
      // calcolato qui su dati del mese intero appena scaricati.
      const cameraMap = new Map();
      righeMese.forEach((r) => {
        if (!cameraMap.has(r.camera_id)) {
          cameraMap.set(r.camera_id, { camera_id: r.camera_id, numero: r.camera_numero, nome: r.camera_nome, piano: r.piano, soggiorni: [] });
        }
        if (r.soggiorno_id) cameraMap.get(r.camera_id).soggiorni.push(r);
      });
      const gruppiMese = [];
      cameraMap.forEach((camera) => {
        const chiave = camera.piano === null ? 'esterno' : camera.piano;
        let gruppo = gruppiMese.find(g => g.chiave === chiave);
        if (!gruppo) {
          gruppo = { chiave, etichetta: camera.piano === null ? 'Appartamento esterno' : `Piano ${camera.piano}`, camere: [] };
          gruppiMese.push(gruppo);
        }
        gruppo.camere.push(camera);
      });

      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margine = 10;
      const colCamera = 26;
      const larghezzaUtile = pw - margine * 2 - colCamera;
      const colGiorno = larghezzaUtile / giorniMese.length;
      const altezzaRiga = 6;
      let y = margine;

      function disegnaIntestazione() {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        pdf.setTextColor(27, 58, 92);
        pdf.text('Hotel del Golfo — Planning camere', margine, y);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(100);
        pdf.text(formatMesePeriodo(giorniMese), margine, y + 6);
        y += 12;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(27, 58, 92);
        pdf.setDrawColor(200);
        pdf.rect(margine, y, colCamera, altezzaRiga);
        pdf.text('Camera', margine + 2, y + altezzaRiga - 2);
        giorniMese.forEach((g, i) => {
          const x = margine + colCamera + i * colGiorno;
          pdf.rect(x, y, colGiorno, altezzaRiga);
          const numGiorno = String(new Date(g + 'T00:00:00').getDate());
          pdf.text(numGiorno, x + colGiorno / 2, y + altezzaRiga - 2, { align: 'center' });
        });
        y += altezzaRiga;
      }

      function nuovaPagina() {
        pdf.addPage();
        y = margine;
        disegnaIntestazione();
      }

      disegnaIntestazione();

      gruppiMese.forEach((gruppo) => {
        if (y + altezzaRiga > ph - margine) nuovaPagina();
        pdf.setFillColor(240, 240, 240);
        pdf.rect(margine, y, colCamera + larghezzaUtile, altezzaRiga - 1, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(27, 58, 92);
        pdf.text(gruppo.etichetta, margine + 2, y + altezzaRiga - 2.3);
        y += altezzaRiga;

        gruppo.camere.forEach((camera) => {
          if (y + altezzaRiga > ph - margine) nuovaPagina();
          const nomeCamera = camera.numero !== 'app' ? `Camera ${camera.numero}` : camera.nome;

          pdf.setDrawColor(220);
          pdf.rect(margine, y, colCamera, altezzaRiga);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(50);
          const testoCamera = adattaFontATesto(pdf, nomeCamera, colCamera - 4, 7, 5);
          pdf.text(testoCamera, margine + 2, y + altezzaRiga - 2);

          giorniMese.forEach((g, i) => {
            const x = margine + colCamera + i * colGiorno;
            pdf.rect(x, y, colGiorno, altezzaRiga);
          });

          // Una barra per soggiorno (non una cella per giorno) — stessa
          // geometria di calcolaBarra usata a schermo, applicata ai giorni
          // del mese intero invece che al range di vista.
          camera.soggiorni.forEach((s) => {
            const { colStart, colEnd } = calcolaBarra(giorniMese, s.data_arrivo, s.data_partenza);
            const xStart = margine + colCamera + (colStart - 1) * colGiorno;
            const larghezzaBarra = (colEnd - colStart) * colGiorno;
            pdf.setFillColor(230, 238, 245);
            pdf.setDrawColor(27, 58, 92);
            pdf.rect(xStart, y, larghezzaBarra, altezzaRiga, 'FD');
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(27, 58, 92);
            const cognome = s.ospite_cognome || '—';
            // Font ridotto finché il cognome non entra nella barra —
            // richiesto esplicitamente dal titolare, vedi adattaFontATesto.
            const testoAdattato = adattaFontATesto(pdf, cognome, larghezzaBarra - 2, 6, 4);
            pdf.text(testoAdattato, xStart + larghezzaBarra / 2, y + altezzaRiga - 2, { align: 'center' });
          });

          y += altezzaRiga;
        });
      });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(150);
      pdf.text(`Esportato il ${new Date().toLocaleString('it-IT')}`, margine, ph - 4);

      pdf.save(`planning_${slugMese(giorniMese[0])}.pdf`);
    } catch (err) {
      setErroreExport(err.message || 'Errore nell\'esportazione del planning');
    } finally {
      setEsportando(null);
    }
  }

  // ── Export elenco prenotazioni (PDF, 14/08/2026) ──────────────────────────
  // Rispetta i filtri attivi in VistaElenco (via filtriElencoRef), ma non la
  // paginazione a schermo: riparte da pagina 1 con per_pagina al massimo
  // consentito dal backend (200, vedi prenotazioniController.lista) per
  // esportare il set filtrato più ampio possibile in una sola chiamata.
  async function esportaElencoPdf() {
    setErroreExport(null);
    setEsportando('elenco');
    try {
      const f = filtriElencoRef.current;
      const parametri = new URLSearchParams({ pagina: '1', per_pagina: '200' });
      if (f.ricerca) parametri.set('ricerca', f.ricerca);
      if (f.data_da) parametri.set('data_da', f.data_da);
      if (f.data_a) parametri.set('data_a', f.data_a);
      if (f.stato) parametri.set('stato', f.stato);
      const risposta = await api.get(`/prenotazioni?${parametri.toString()}`);
      const { risultati, totale } = risposta.data;

      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const ph = pdf.internal.pageSize.getHeight();
      const margine = 14;
      let y = margine;

      const colonne = [
        { chiave: 'ospite', label: 'Ospite', larghezza: 40 },
        { chiave: 'camera', label: 'Camera', larghezza: 20 },
        { chiave: 'arrivo', label: 'Arrivo', larghezza: 24 },
        { chiave: 'partenza', label: 'Partenza', larghezza: 24 },
        { chiave: 'ospiti', label: 'Ospiti', larghezza: 16 },
        { chiave: 'canale', label: 'Canale', larghezza: 28 },
        { chiave: 'stato', label: 'Stato', larghezza: 28 },
      ];
      const larghezzaTabella = colonne.reduce((s, c) => s + c.larghezza, 0);

      function descrizioneFiltri() {
        const parti = [];
        if (f.ricerca) parti.push(`ricerca "${f.ricerca}"`);
        if (f.data_da) parti.push(`arrivo dal ${formatDataBreve(f.data_da)}`);
        if (f.data_a) parti.push(`al ${formatDataBreve(f.data_a)}`);
        if (f.stato) parti.push(`stato: ${(STATI_COLORI[f.stato] || {}).label || f.stato}`);
        return parti.length ? parti.join(' · ') : 'Nessun filtro attivo';
      }

      function disegnaIntestazione() {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        pdf.setTextColor(27, 58, 92);
        pdf.text('Hotel del Golfo — Elenco prenotazioni', margine, y);
        y += 6;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(100);
        pdf.text(descrizioneFiltri(), margine, y);
        y += 5;
        pdf.text(
          `${totale} risultat${totale === 1 ? 'o' : 'i'}` +
          `${totale > risultati.length ? ` (esportati i primi ${risultati.length})` : ''}` +
          ` — esportato il ${new Date().toLocaleString('it-IT')}`,
          margine, y
        );
        y += 7;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(27, 58, 92);
        let x = margine;
        colonne.forEach(c => { pdf.text(c.label, x, y); x += c.larghezza; });
        y += 2;
        pdf.setDrawColor(27, 58, 92);
        pdf.line(margine, y, margine + larghezzaTabella, y);
        y += 5;
      }

      function nuovaPagina() {
        pdf.addPage();
        y = margine;
        disegnaIntestazione();
      }

      disegnaIntestazione();

      risultati.forEach((r) => {
        if (y > ph - margine) nuovaPagina();
        const colori = STATI_COLORI[r.stato] || STATI_COLORI.opzione;
        const valori = {
          ospite: r.ospite_nome ? `${r.ospite_nome} ${r.ospite_cognome}` : '—',
          camera: r.camera_numero != null ? String(r.camera_numero) : '—',
          arrivo: formatDataBreve(r.data_arrivo),
          partenza: formatDataBreve(r.data_partenza),
          ospiti: String(r.num_ospiti ?? '—'),
          canale: r.canale_origine || '—',
          stato: colori.label,
        };
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(50);
        let x = margine;
        colonne.forEach(c => {
          const testo = adattaFontATesto(pdf, valori[c.chiave], c.larghezza - 2, 8, 6);
          pdf.text(testo, x, y);
          x += c.larghezza;
        });
        pdf.setDrawColor(230);
        pdf.line(margine, y + 2, margine + larghezzaTabella, y + 2);
        y += 6;
      });

      pdf.save(`elenco_prenotazioni_${oggi()}.pdf`);
    } catch (err) {
      setErroreExport(err.message || 'Errore nell\'esportazione dell\'elenco');
    } finally {
      setEsportando(null);
    }
  }

  return (
    <AppShell titolo="Prenotazioni camere" sottotitolo="Vista griglia / planning">
      <div className="space-y-3">
        {/* Toggle vista + selettore range + navigazione */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Griglia/Elenco (14/08/2026) — stessa voce di sidebar, due modi
                di consultare la stessa realtà, non una pagina nuova. */}
            <div className="flex items-center gap-1 rounded-lg border p-0.5 bg-white">
              <button
                onClick={() => setVista('griglia')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: vista === 'griglia' ? 'var(--hotel-navy)' : 'transparent',
                  color: vista === 'griglia' ? '#fff' : 'var(--foreground)',
                }}
              >
                <LayoutGrid size={13} /> Griglia
              </button>
              <button
                onClick={() => setVista('elenco')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: vista === 'elenco' ? 'var(--hotel-navy)' : 'transparent',
                  color: vista === 'elenco' ? '#fff' : 'var(--foreground)',
                }}
              >
                <List size={13} /> Elenco
              </button>
            </div>

            {vista === 'griglia' && (
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
            )}

            {/* Ricerca nella griglia (14/08/2026) — evidenzia/sfuma le barre,
                vedi corrispondeRicerca. Ambito diverso dalla lente globale
                della Sidebar (navigazione, non filtro sui dati di questa pagina). */}
            {vista === 'griglia' && (
              <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 bg-white">
                <Search size={14} style={{ color: 'var(--muted-foreground)' }} />
                <input
                  type="text"
                  value={ricercaGriglia}
                  onChange={(e) => setRicercaGriglia(e.target.value)}
                  placeholder="Cerca ospite o camera..."
                  className="text-xs outline-none w-40"
                />
                {ricercaGriglia && (
                  <button onClick={() => setRicercaGriglia('')} style={{ color: 'var(--muted-foreground)' }}>
                    <X size={12} />
                  </button>
                )}
              </div>
            )}
          </div>

          {vista === 'griglia' && (
            <div className="flex items-center gap-2">
              <button onClick={vaiIndietro} className="p-1.5 rounded-lg border bg-white"><ChevronLeft size={16} /></button>
              <div className="min-w-32 text-center">
                {/* Mese/anno aggiunto il 31/07/2026 — prima non c'era da nessuna
                    parte un'indicazione del mese, solo il range giorno/giorno. */}
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  {formatMesePeriodo(giorni)}
                </p>
                <p className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                  {formatGiornoBreve(giorni[0])} – {formatGiornoBreve(giorni[giorni.length - 1])}
                </p>
              </div>
              <button onClick={vaiAvanti} className="p-1.5 rounded-lg border bg-white"><ChevronRight size={16} /></button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Esporta PDF (14/08/2026) — planning mensile o elenco
                prenotazioni, indipendente dalla vista attiva (Griglia/
                Elenco): un titolare in griglia può comunque voler
                l'elenco stampato e viceversa. Nessuna nuova dipendenza,
                jsPDF già in uso per il QR del menu. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuEsportaAperto(v => !v)}
                disabled={!!esportando}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border bg-white disabled:opacity-60"
              >
                <Download size={14} /> {esportando ? 'Esportazione...' : 'Esporta'}
              </button>
              {menuEsportaAperto && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuEsportaAperto(false)} />
                  <div className="absolute right-0 mt-1 w-56 bg-white border rounded-lg shadow-lg z-20 py-1">
                    <button
                      type="button"
                      onClick={() => { setMenuEsportaAperto(false); esportaPlanningMensile(); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                    >
                      Planning mensile (PDF)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMenuEsportaAperto(false); esportaElencoPdf(); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                    >
                      Elenco prenotazioni (PDF)
                    </button>
                  </div>
                </>
              )}
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
        </div>

        {/* Legenda stati (14/08/2026, seguito: spostata su una riga propria
            centrata, prima condivideva la riga toolbar con justify-between e
            finiva schiacciata/non centrata a seconda della larghezza degli
            altri gruppi). */}
        {vista === 'griglia' && (
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {Object.entries(STATI_COLORI).map(([chiave, c]) => (
              <div key={chiave} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.bg, border: `1px solid ${c.text}` }} />
                {c.label}
              </div>
            ))}
          </div>
        )}

        {vista === 'griglia' && dragErrore && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
               style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
            <AlertTriangle size={14} /> {dragErrore}
          </div>
        )}

        {vista === 'griglia' && errore && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
               style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
            <AlertTriangle size={14} /> {errore}
          </div>
        )}

        {/* Export PDF (14/08/2026) — indipendente dalla vista attiva. */}
        {erroreExport && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
               style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
            <AlertTriangle size={14} /> {erroreExport}
          </div>
        )}

        {vista === 'elenco' && (
          <VistaElenco onApriPrenotazione={setPrenotazioneApertaId} onFiltriCambiati={setFiltriElencoRef} />
        )}

        {vista === 'griglia' && (loading && righe.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            <Loader2 size={18} className="animate-spin mr-2" /> Caricamento griglia...
          </div>
        ) : (
          <div className="rounded-lg border bg-white overflow-x-auto">
            <DndContext sensors={sensors} onDragStart={() => { dragInCorsoRef.current = true; }} onDragEnd={handleDragEnd}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `${LARGHEZZA_COL_CAMERA}px repeat(${giorni.length}, minmax(${larghezzaColonnaMin}px, 1fr))`,
                  gridTemplateRows: `36px repeat(${numRighe}, auto)`,
                }}
              >
                {/* Header: colonna camera */}
                <div style={{ gridColumn: 1, gridRow: 1 }} className="border-b border-r bg-gray-50 sticky left-0 z-10" />
                {/* Header: giorni */}
                {giorni.map((g, i) => (
                  <div
                    key={g}
                    ref={i === 0 ? primaColonnaRef : undefined}
                    style={{ gridColumn: i + 2, gridRow: 1 }}
                    className="flex items-center justify-center text-[10px] font-medium border-b border-l"
                  >
                    <span style={{ color: g === oggiStr ? 'var(--hotel-amber)' : 'var(--muted-foreground)' }}>
                      {formatGiornoBreve(g, rangeModo === 'mese')}
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
                          puoGestireCamere={puoGestireCamere}
                          statoOggi={statoOggiMap[camera.camera_id]}
                          larghezzaColonnaMin={larghezzaColonnaMin}
                          onApriDettaglio={setPrenotazioneApertaId}
                          onCellaVuota={apriFormDaCella}
                          onApriStatoCamera={setCameraStatoAperta}
                          ricerca={ricercaGriglia}
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
        ))}
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

      {cameraStatoAperta && (
        <PopupStatoCamera
          camera={cameraStatoAperta}
          statoOggi={statoOggiMap[cameraStatoAperta.camera_id]}
          onChiudi={() => setCameraStatoAperta(null)}
          onSalvato={caricaStatoOggi}
        />
      )}
    </AppShell>
  );
}
