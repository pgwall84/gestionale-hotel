'use client';

// Pagina Planning tariffe giorno-per-giorno (Piano 3, 24/08/2026).
// RISCRITTURA 24/08/2026 (stesso giorno, dopo la prima verifica a video di
// Marco): la prima versione usava un selettore "una tipologia alla volta"
// (fila di chip in alto) — deviazione dal mockup dichiarata come scelta di
// scope nel piano originale, ma bocciata da Marco appena vista: "perché
// questa scelta?" — con 6 conseguenze concrete (niente sigla giorno
// settimana, popover restrizioni tagliato dallo scroll orizzontale della
// tabella, min stay che sembrava non valorizzarsi, sparito il tasto
// propagazione riga/colonna, sparito il tasto "Modifica" per il bulk-edit
// dalla toolbar, sparite le frecce per comprimere tipologia/trattamento).
// Questa versione segue `mockup_matrice_tariffe_v4.html` (riletto per
// intero, non a memoria) molto più da vicino: TUTTE le tipologie camera
// impilate in un'unica tabella, righe Prezzo+Restrizioni per ciascun
// trattamento sotto ciascuna tipologia, frecce ▾ per comprimere
// tipologia/trattamento (default: tutto espanso — Marco vuole vedere tutto
// insieme, non click multipli per navigare), bottone ⚡ per propagare
// l'ultima modifica di una riga prezzo a tutta la riga o alla colonna,
// bottone "✎ Modifica" in toolbar per aprire lo stesso drawer di
// bulk-edit anche senza passare dal trascinamento.
// FUORI SCOPE ancora (vedi piano, invariato): riga "Disponibilità" del
// mockup (richiede dati di occupazione reale, non ancora integrati qui) e
// conteggio "camere totali" per tipologia — Marco non li ha richiesti nei
// 6 punti di feedback; integrazione con il motore di prezzo reale delle
// prenotazioni; wiring delle restrizioni nella disponibilità booking.

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const RUOLI_LETTURA = ['admin', 'titolare', 'receptionist'];
const TRATTAMENTI = [
  { id: 'bb', nome: 'Camera e colazione' },
  { id: 'mezza_pensione', nome: 'Mezza pensione' },
  { id: 'pensione_completa', nome: 'Pensione completa' },
];

// Ordine di visualizzazione richiesto dal titolare (24/08/2026), non
// l'ordine restituito da GET /tipi-camera (che non garantisce un ordine
// stabile). Nomi dedotti dalle migration 048/050 (consolidamento
// Singola/Doppia uso singola in un unico tipo attivo rinominato
// "Matrimoniale Piccola") — NON verificati contro l'elenco live che
// Marco vede oggi: se un nome non combacia esattamente, quella tipologia
// resta comunque visibile, solo in coda invece che nella posizione
// giusta (fallback sicuro, ordinamento stabile — mai un crash o una
// tipologia che sparisce).
const ORDINE_TIPOLOGIE = [
  ['matrimoniale'],
  ['matrimoniale piccola', 'matrimoniale uso singola'],
  ['tripla'],
  ['quadrupla'],
  ['doppia uso singola', 'doppio uso singola'],
  ['singola'],
];
function prioritaTipologia(nome) {
  const n = (nome || '').trim().toLowerCase();
  const idx = ORDINE_TIPOLOGIE.findIndex(candidati => candidati.includes(n));
  return idx === -1 ? ORDINE_TIPOLOGIE.length : idx;
}
const CAMPI_DRAWER = [
  { id: 'prezzo', nome: 'Prezzo (€)', tipo: 'numero' },
  { id: 'min_stay', nome: 'Min. stay (notti)', tipo: 'numero' },
  { id: 'chiuso_arrivo', nome: "Chiusa all'arrivo (CTA)", tipo: 'toggle' },
  { id: 'chiuso_partenza', nome: 'Chiusa alla partenza (CTD)', tipo: 'toggle' },
  { id: 'stop_sell', nome: 'Stop-sell', tipo: 'toggle' },
];
const GIORNI_LABEL = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function pad(n) { return String(n).padStart(2, '0'); }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function aggiungiGiorni(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
// Giorno settimana calcolato da mezzogiorno locale (non mezzanotte UTC) per
// evitare che un fuso orario negativo faccia scivolare la data al giorno
// prima — stessa cautela già presa altrove nel progetto sulle date.
function indiceGiorno(dataIso) { const d = new Date(dataIso + 'T12:00:00'); return (d.getDay() + 6) % 7; }
function siglaGiorno(dataIso) { return GIORNI_LABEL[indiceGiorno(dataIso)]; }
function weekend(dataIso) { return indiceGiorno(dataIso) >= 5; }

function colonneVisibili(modo, ancora) {
  if (modo === '14gg') {
    const arr = [];
    for (let i = 0; i < 14; i++) arr.push(aggiungiGiorni(ancora, i));
    return arr;
  }
  const anno = ancora.getFullYear(), mese = ancora.getMonth();
  const n = new Date(anno, mese + 1, 0).getDate();
  const arr = [];
  for (let g = 1; g <= n; g++) arr.push(new Date(anno, mese, g));
  return arr;
}

function chiaveRiga(tipoId, trattamento) { return `${tipoId}|${trattamento}`; }

export default function PaginaPlanningTariffe() {
  const { utente, loading } = useAuth();
  const router = useRouter();
  const puoScrivere = utente && ['admin', 'titolare'].includes(utente.ruolo);

  const [tipiCamera, setTipiCamera] = useState([]);
  const [modo, setModo] = useState('14gg');
  const [ancora, setAncora] = useState(() => new Date());
  // griglie: { [tipoCameraId]: { giorni, righe } } — una chiamata per
  // tipologia, in parallelo, stesso endpoint per-tipologia di prima
  // (nessuna modifica al backend: il merge "tutte le tipologie insieme" è
  // solo lato frontend).
  const [griglie, setGriglie] = useState({});
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');

  // Frecce ▾ comprimi/espandi (default: tutto espanso, per scelta di Marco
  // — "voluto far vedere tutto in una schermata, uno ha tutto
  // sottocontrollo").
  const [collassatiTipologia, setCollassatiTipologia] = useState(() => new Set());
  const [collassatiTrattamento, setCollassatiTrattamento] = useState(() => new Set());

  // Ultima modifica prezzo per riga (tipoId|trattamento) — alimenta il
  // bottone ⚡ "propaga a riga/colonna".
  const [ultimaModifica, setUltimaModifica] = useState({});
  const [menuPropaga, setMenuPropaga] = useState(null); // {tipoId, trattamento, top, left} | null

  // Doppio click prezzo — edit inline
  const [cellaInModifica, setCellaInModifica] = useState(null); // {tipoId, trattamento, data} | null
  const [valoreInModifica, setValoreInModifica] = useState('');

  // Click singolo restrizioni — popover del giorno. position:fixed con
  // coordinate catturate al click (getBoundingClientRect), NON position
  // relative alla cella: nested dentro un contenitore overflow-x-auto
  // (tabella larga, molte colonne/tipologie) un popover position:absolute
  // veniva tagliato dallo scroll — bug reale segnalato da Marco ("la
  // schermata delle restrizioni è tagliata fuori, non sta dentro la
  // tabella"). position:fixed esce dal clipping dell'antenato overflow
  // indipendentemente da dove sta nel DOM, purché nessun antenato imposti
  // transform/filter/will-change (non è il caso qui).
  const [popoverRestrizioni, setPopoverRestrizioni] = useState(null); // {tipoId, trattamento, data, top, left} | null
  const [formRestrizioni, setFormRestrizioni] = useState({ min_stay: '', chiuso_arrivo: false, chiuso_partenza: false, stop_sell: false });

  // Trascinamento su una riga (Prezzo o Restrizioni) di UNA tipologia+
  // trattamento — stesso vincolo del mockup: il trascinamento non può
  // "saltare" riga.
  const [selezione, setSelezione] = useState(null); // {tipoId, trattamento, campo, colInizio, colCorrente} | null
  const [trascinando, setTrascinando] = useState(false);
  const [dragMosso, setDragMosso] = useState(false);

  // Drawer bulk-edit — multi-selezione tipologia/trattamento/campi (un
  // blocco valore per ciascun campo scelto, tutti applicati insieme),
  // aperto sia dal bottone "✎ Modifica" in toolbar (nessuna preselezione)
  // sia dal rilascio di un trascinamento (preselezionato sulla singola
  // riga trascinata).
  const [drawerAperto, setDrawerAperto] = useState(false);
  const [drawerForm, setDrawerForm] = useState(null);

  // Frecce laterali "scorri 15gg" (24/08/2026) — in vista Mese fino a 31
  // colonne non stanno nella larghezza dello schermo, normale (il
  // titolare lo ha detto esplicitamente). Queste frecce scorrono
  // ORIZZONTALMENTE il contenitore già caricato (scrollBy), NON cambiano
  // l'intervallo di date caricato — a differenza di ‹/› in toolbar, che
  // invece cambiano la finestra e rifanno la chiamata al backend.
  const contenitoreGrigliaRef = useRef(null);
  function scorriGiorni(direzione) {
    const contenitore = contenitoreGrigliaRef.current;
    if (!contenitore) return;
    const th = contenitore.querySelector('thead th:nth-child(2)');
    const larghezzaColonna = th ? th.getBoundingClientRect().width : 46;
    contenitore.scrollBy({ left: direzione * 15 * larghezzaColonna, behavior: 'smooth' });
  }

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_LETTURA.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  useEffect(() => {
    if (!utente || !RUOLI_LETTURA.includes(utente.ruolo)) return;
    api.get('/tipi-camera').then(res => setTipiCamera(res.data))
      .catch(err => setErrore(err.message || 'Errore nel caricamento delle tipologie.'));
  }, [utente]);

  const cols = colonneVisibili(modo, ancora);
  const giorniIso = cols.map(iso);
  const dataDa = giorniIso[0];
  const dataA = giorniIso[giorniIso.length - 1];

  const caricaGriglie = useCallback(async () => {
    if (tipiCamera.length === 0) return;
    setCaricamento(true);
    try {
      const parametri = new URLSearchParams({ data_da: dataDa, data_a: dataA });
      const risultati = await Promise.all(tipiCamera.map(async t => {
        const p = new URLSearchParams(parametri);
        p.set('tipo_camera_id', String(t.id));
        const res = await api.get(`/planning-tariffe/griglia?${p.toString()}`);
        return [String(t.id), res.data];
      }));
      setGriglie(Object.fromEntries(risultati));
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento della griglia.');
    } finally {
      setCaricamento(false);
    }
  }, [tipiCamera, dataDa, dataA]);

  useEffect(() => { caricaGriglie(); }, [caricaGriglie]);

  function cellaDati(tipoId, trattamento, di) {
    return griglie[tipoId]?.righe?.[trattamento]?.[di]
      || { prezzo: null, sovrascritto: false, min_stay: null, chiuso_arrivo: false, chiuso_partenza: false, stop_sell: false };
  }

  // ── Salvataggio con gestione 409 (alert bloccante-superabile, come nei
  //    Piani 1-2) — helper unico riusato da edit singolo, propagazione
  //    riga/colonna e drawer bulk-edit, per non ripetere 4 volte lo stesso
  //    confirm/retry. ────────────────────────────────────────────────────
  async function salvaConConferma(body, messaggioConferma) {
    try {
      await api.patch('/planning-tariffe', body);
      return true;
    } catch (err) {
      if (err.response?.status === 409) {
        const violazioni = err.response.data.violazioni || [];
        const msg = messaggioConferma
          ? messaggioConferma(violazioni)
          : `${violazioni.length} giorno/i esce/escono dal range dichiarato per il cartellino. Confermi comunque?`;
        if (confirm(msg)) {
          await api.patch('/planning-tariffe', { ...body, confermato: true });
          return true;
        }
        return false;
      }
      setErrore(err.message || 'Errore nel salvataggio.');
      return false;
    }
  }

  // ── Doppio click prezzo ─────────────────────────────────────────────
  async function salvaPrezzoGiorno(tipoId, trattamento, data, prezzo) {
    const ok = await salvaConConferma(
      { tipo_camera_id: tipoId, trattamento, data_da: data, data_a: data, prezzo_notte: prezzo },
      v => `Il prezzo ${prezzo}€ esce dal range dichiarato (${v[0]?.minimo ?? '—'}–${v[0]?.massimo ?? '—'}€). Confermi comunque?`
    );
    if (ok) {
      setUltimaModifica(u => ({ ...u, [chiaveRiga(tipoId, trattamento)]: { dataIso: data, valore: prezzo } }));
      setCellaInModifica(null);
      caricaGriglie();
    }
  }

  // ── Click singolo restrizioni — popover del giorno ─────────────────
  async function salvaRestrizioniGiorno() {
    if (!popoverRestrizioni) return;
    const { tipoId, trattamento, data } = popoverRestrizioni;
    const ok = await salvaConConferma({
      tipo_camera_id: tipoId, trattamento, data_da: data, data_a: data,
      min_stay: formRestrizioni.min_stay === '' ? null : Number(formRestrizioni.min_stay),
      chiuso_arrivo: formRestrizioni.chiuso_arrivo,
      chiuso_partenza: formRestrizioni.chiuso_partenza,
      stop_sell: formRestrizioni.stop_sell,
    });
    if (ok) { setPopoverRestrizioni(null); caricaGriglie(); }
  }

  // ── Bottone ⚡ — propaga l'ultima modifica prezzo a riga o colonna ──
  async function propagaRiga(tipoId, trattamento) {
    const ultima = ultimaModifica[chiaveRiga(tipoId, trattamento)];
    if (!ultima) return;
    const ok = await salvaConConferma(
      { tipo_camera_id: tipoId, trattamento, data_da: dataDa, data_a: dataA, prezzo_notte: ultima.valore },
      v => `${v.length} giorno/i su questa riga escono dal range dichiarato per il cartellino. Confermi comunque?`
    );
    setMenuPropaga(null);
    if (ok) caricaGriglie();
  }
  async function propagaColonna(tipoId, trattamento) {
    const ultima = ultimaModifica[chiaveRiga(tipoId, trattamento)];
    if (!ultima) return;
    const esiti = [];
    for (const tr of TRATTAMENTI) {
      try {
        await api.patch('/planning-tariffe', {
          tipo_camera_id: tipoId, trattamento: tr.id, data_da: ultima.dataIso, data_a: ultima.dataIso, prezzo_notte: ultima.valore,
        });
      } catch (err) {
        if (err.response?.status === 409) esiti.push(tr.id);
        else { setErrore(err.message || 'Errore nel salvataggio.'); setMenuPropaga(null); return; }
      }
    }
    if (esiti.length > 0) {
      if (confirm(`${esiti.length} trattamento/i escono dal range dichiarato per il cartellino in questo giorno. Confermi comunque?`)) {
        for (const trId of esiti) {
          await api.patch('/planning-tariffe', {
            tipo_camera_id: tipoId, trattamento: trId, data_da: ultima.dataIso, data_a: ultima.dataIso,
            prezzo_notte: ultima.valore, confermato: true,
          });
        }
      }
    }
    setMenuPropaga(null);
    caricaGriglie();
  }

  // ── Trascinamento ───────────────────────────────────────────────────
  function iniziaTrascinamento(tipoId, trattamento, campo, colIdx) {
    if (!puoScrivere) return;
    setTrascinando(true); setDragMosso(false);
    setSelezione({ tipoId, trattamento, campo, colInizio: colIdx, colCorrente: colIdx });
  }
  function continuaTrascinamento(tipoId, trattamento, campo, colIdx) {
    if (!trascinando || !selezione || selezione.tipoId !== tipoId || selezione.trattamento !== trattamento || selezione.campo !== campo) return;
    if (colIdx !== selezione.colCorrente) setDragMosso(true);
    setSelezione(s => ({ ...s, colCorrente: colIdx }));
  }
  useEffect(() => {
    function fine() {
      if (!trascinando) return;
      setTrascinando(false);
      if (!dragMosso || !selezione) { setSelezione(null); return; }
      const min = Math.min(selezione.colInizio, selezione.colCorrente);
      const max = Math.max(selezione.colInizio, selezione.colCorrente);
      setDrawerForm({
        tipologie: new Set([selezione.tipoId]),
        trattamenti: new Set([selezione.trattamento]),
        campi: new Set([selezione.campo === 'restrizioni' ? 'min_stay' : 'prezzo']),
        dataInizio: giorniIso[min], dataFine: giorniIso[max],
        valori: {},
      });
      setDrawerAperto(true);
    }
    window.addEventListener('pointerup', fine);
    return () => window.removeEventListener('pointerup', fine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trascinando, dragMosso, selezione]);

  function cellaSelezionata(tipoId, trattamento, campo, colIdx) {
    if (!selezione || selezione.tipoId !== tipoId || selezione.trattamento !== trattamento || selezione.campo !== campo) return false;
    const min = Math.min(selezione.colInizio, selezione.colCorrente);
    const max = Math.max(selezione.colInizio, selezione.colCorrente);
    return colIdx >= min && colIdx <= max;
  }

  // ── Bottone "✎ Modifica" in toolbar — drawer senza preselezione ────
  function apriDrawerVuoto() {
    setDrawerForm({
      tipologie: new Set(tipiCamera.length ? [String(tipiCamera[0].id)] : []),
      trattamenti: new Set(['bb']),
      campi: new Set(['prezzo']),
      dataInizio: dataDa, dataFine: dataA,
      valori: {},
    });
    setDrawerAperto(true);
  }

  function toggleDrawerSet(chiave, valore) {
    setDrawerForm(f => {
      const s = new Set(f[chiave]);
      if (s.has(valore)) { if (s.size > 1) s.delete(valore); } else s.add(valore);
      return { ...f, [chiave]: s };
    });
  }

  async function applicaDrawer() {
    if (!drawerForm) return;
    const campiSelezionati = [...drawerForm.campi];
    for (const campoId of campiSelezionati) {
      const c = CAMPI_DRAWER.find(x => x.id === campoId);
      if (c.tipo === 'numero' && (drawerForm.valori[campoId] === undefined || drawerForm.valori[campoId] === '')) {
        setErrore(`Inserisci un valore per "${c.nome}".`);
        return;
      }
    }
    const combinazioni = [];
    for (const tipoId of drawerForm.tipologie) for (const trattamento of drawerForm.trattamenti) combinazioni.push({ tipoId, trattamento });

    const conViolazioni = [];
    for (const { tipoId, trattamento } of combinazioni) {
      const body = { tipo_camera_id: tipoId, trattamento, data_da: drawerForm.dataInizio, data_a: drawerForm.dataFine, confermato: false };
      if (campiSelezionati.includes('prezzo')) body.prezzo_notte = Number(drawerForm.valori.prezzo);
      if (campiSelezionati.includes('min_stay')) body.min_stay = drawerForm.valori.min_stay === '' || drawerForm.valori.min_stay == null ? null : Number(drawerForm.valori.min_stay);
      if (campiSelezionati.includes('chiuso_arrivo')) body.chiuso_arrivo = !!drawerForm.valori.chiuso_arrivo;
      if (campiSelezionati.includes('chiuso_partenza')) body.chiuso_partenza = !!drawerForm.valori.chiuso_partenza;
      if (campiSelezionati.includes('stop_sell')) body.stop_sell = !!drawerForm.valori.stop_sell;
      try {
        await api.patch('/planning-tariffe', body);
      } catch (err) {
        if (err.response?.status === 409) conViolazioni.push({ body, violazioni: err.response.data.violazioni || [] });
        else { setErrore(err.message || 'Errore nel salvataggio.'); return; }
      }
    }
    if (conViolazioni.length > 0) {
      const totaleGiorni = conViolazioni.reduce((s, v) => s + v.violazioni.length, 0);
      if (confirm(`${totaleGiorni} giorno/i su ${conViolazioni.length} combinazione/i tipologia+trattamento escono dal range dichiarato per il cartellino. Confermi comunque?`)) {
        for (const v of conViolazioni) await api.patch('/planning-tariffe', { ...v.body, confermato: true });
      }
    }
    setDrawerAperto(false); setSelezione(null);
    caricaGriglie();
  }

  if (loading || !utente) return null;

  const menuPropagaUltima = menuPropaga ? ultimaModifica[chiaveRiga(menuPropaga.tipoId, menuPropaga.trattamento)] : null;

  return (
    <AppShell titolo="Planning tariffe">
      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg p-0.5" style={{ background: '#EDEFF2' }}>
            <button onClick={() => setModo('14gg')}
                    className="text-xs font-medium px-3 py-1.5 rounded-md"
                    style={modo === '14gg' ? { background: 'white', color: 'var(--hotel-navy)' } : { color: 'var(--muted-foreground)' }}>
              14 giorni
            </button>
            <button onClick={() => setModo('mese')}
                    className="text-xs font-medium px-3 py-1.5 rounded-md"
                    style={modo === 'mese' ? { background: 'white', color: 'var(--hotel-navy)' } : { color: 'var(--muted-foreground)' }}>
              Mese
            </button>
          </div>
          <button onClick={() => setAncora(a => aggiungiGiorni(a, modo === '14gg' ? -14 : -30))}
                  className="w-7 h-7 rounded-lg text-sm" style={{ border: '1px solid var(--border)' }}>‹</button>
          <span className="text-xs font-semibold min-w-[140px] text-center">{dataDa} – {dataA}</span>
          <button onClick={() => setAncora(a => aggiungiGiorni(a, modo === '14gg' ? 14 : 30))}
                  className="w-7 h-7 rounded-lg text-sm" style={{ border: '1px solid var(--border)' }}>›</button>
        </div>
        {puoScrivere && (
          <button onClick={apriDrawerVuoto}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                  style={{ background: 'var(--hotel-navy)' }}>
            ✎ Modifica
          </button>
        )}
      </div>

      {caricamento && Object.keys(griglie).length === 0 ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      ) : tipiCamera.length === 0 ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessuna tipologia camera configurata.</p>
      ) : (
        <div className="relative">
          {/* Frecce "scorri 15gg" (24/08/2026) — scrollano il contenitore
              già caricato, utili in vista Mese dove non tutte le colonne
              stanno nella larghezza dello schermo (normale, confermato dal
              titolare). Non cambiano l'intervallo caricato: per quello
              restano le ‹/› della toolbar sopra. */}
          <button type="button" onClick={() => scorriGiorni(-1)} title="Scorri 15 giorni indietro"
                  className="absolute z-10 w-7 h-7 rounded-full flex items-center justify-center text-sm"
                  style={{ top: '50%', left: '-4px', transform: 'translateY(-50%)', background: 'white', border: '1px solid var(--border)', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
            ‹
          </button>
          <button type="button" onClick={() => scorriGiorni(1)} title="Scorri 15 giorni avanti"
                  className="absolute z-10 w-7 h-7 rounded-full flex items-center justify-center text-sm"
                  style={{ top: '50%', right: '-4px', transform: 'translateY(-50%)', background: 'white', border: '1px solid var(--border)', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
            ›
          </button>
          <div ref={contenitoreGrigliaRef} className="rounded-xl overflow-x-auto" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          <table className="text-xs" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th className="text-left px-2 py-1.5" style={{ borderBottom: '1px solid var(--border)', minWidth: '190px', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 2 }} />
                {giorniIso.map(di => {
                  const we = weekend(di);
                  return (
                    <th key={di} className="text-center px-1 py-1.5 font-medium"
                        style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted-foreground)', minWidth: '44px', background: we ? '#FAFBFC' : 'var(--card)' }}>
                      <span className="block">{siglaGiorno(di)}</span>
                      <span className="block font-semibold" style={{ color: we ? 'var(--hotel-amber-dark)' : 'var(--foreground)' }}>
                        {di.slice(8, 10)}/{di.slice(5, 7)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {[...tipiCamera].sort((a, b) => prioritaTipologia(a.nome) - prioritaTipologia(b.nome)).map(t => {
                const tipoId = String(t.id);
                const tipChiusa = collassatiTipologia.has(tipoId);
                return (
                  <Fragment key={tipoId}>
                    <tr onClick={() => setCollassatiTipologia(s => { const n = new Set(s); n.has(tipoId) ? n.delete(tipoId) : n.add(tipoId); return n; })}
                        style={{ cursor: 'pointer' }}>
                      <td colSpan={giorniIso.length + 1} className="px-2 py-2 font-semibold"
                          style={{ background: '#F8F9FA', borderTop: '1px solid var(--border)', borderBottom: '0.5px solid var(--border)', position: 'sticky', left: 0 }}>
                        <span className="inline-block mr-1.5" style={{ display: 'inline-block', transform: tipChiusa ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s ease' }}>▾</span>
                        {t.nome}
                      </td>
                    </tr>
                    {!tipChiusa && TRATTAMENTI.map(tr => {
                      const chiave = chiaveRiga(tipoId, tr.id);
                      const trattChiuso = collassatiTrattamento.has(chiave);
                      return (
                        <Fragment key={chiave}>
                          <tr onClick={() => setCollassatiTrattamento(s => { const n = new Set(s); n.has(chiave) ? n.delete(chiave) : n.add(chiave); return n; })}
                              style={{ cursor: 'pointer' }}>
                            <td colSpan={giorniIso.length + 1} className="px-2 py-1 text-[11px] italic"
                                style={{ background: '#FCFCFD', color: 'var(--muted-foreground)', paddingLeft: '20px', borderBottom: '0.5px solid var(--border)', position: 'sticky', left: 0 }}>
                              <span className="inline-block mr-1.5" style={{ display: 'inline-block', transform: trattChiuso ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s ease' }}>▾</span>
                              {tr.nome}
                            </td>
                          </tr>
                          {!trattChiuso && (
                            <>
                              <tr>
                                <td className="px-2 py-1.5" style={{ borderBottom: '0.5px solid var(--border)', position: 'sticky', left: 0, background: 'var(--card)' }}>
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium">Prezzo (€)</span>
                                    {puoScrivere && (
                                      <button type="button" onClick={e => { const rect = e.currentTarget.getBoundingClientRect(); setMenuPropaga({ tipoId, trattamento: tr.id, top: rect.bottom + 4, left: Math.max(8, rect.right - 260) }); }}
                                              title="Propaga l'ultima modifica di questa riga"
                                              className="w-5 h-5 rounded flex items-center justify-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
                                        ⚡
                                      </button>
                                    )}
                                  </div>
                                </td>
                                {giorniIso.map((di, colIdx) => {
                                  const cella = cellaDati(tipoId, tr.id, di);
                                  const inModifica = cellaInModifica && cellaInModifica.tipoId === tipoId && cellaInModifica.trattamento === tr.id && cellaInModifica.data === di;
                                  const we = weekend(di);
                                  return (
                                    <td key={di} className="text-center px-1 py-1.5"
                                        style={{ borderBottom: '0.5px solid var(--border)', background: cellaSelezionata(tipoId, tr.id, 'prezzo', colIdx) ? 'rgba(24,95,165,0.13)' : (we ? '#FAFBFC' : undefined) }}
                                        onPointerDown={() => iniziaTrascinamento(tipoId, tr.id, 'prezzo', colIdx)}
                                        onPointerEnter={() => continuaTrascinamento(tipoId, tr.id, 'prezzo', colIdx)}
                                        onDoubleClick={() => {
                                          if (!puoScrivere) return;
                                          setCellaInModifica({ tipoId, trattamento: tr.id, data: di });
                                          setValoreInModifica(cella.prezzo != null ? String(cella.prezzo) : '');
                                        }}>
                                      {inModifica ? (
                                        <input type="number" min={0} step="0.01" autoFocus value={valoreInModifica}
                                               onChange={e => setValoreInModifica(e.target.value)}
                                               onBlur={() => {
                                                 const v = valoreInModifica.trim();
                                                 if (v === '' || Number(v) === cella.prezzo) { setCellaInModifica(null); return; }
                                                 salvaPrezzoGiorno(tipoId, tr.id, di, Number(v));
                                               }}
                                               onKeyDown={e => {
                                                 if (e.key === 'Enter') e.target.blur();
                                                 if (e.key === 'Escape') setCellaInModifica(null);
                                               }}
                                               style={{ width: '44px', textAlign: 'center', border: '1.5px solid var(--status-blue-text)', borderRadius: '4px', fontSize: '12.5px' }} />
                                      ) : (
                                        <span style={{ color: cella.sovrascritto ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                                          {cella.prezzo != null ? `${cella.prezzo} €` : '—'}
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                              <tr>
                                <td className="px-2 py-1.5 text-[11px]" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted-foreground)', paddingLeft: '20px', position: 'sticky', left: 0, background: 'var(--card)' }}>
                                  Restrizioni
                                </td>
                                {giorniIso.map((di, colIdx) => {
                                  const cella = cellaDati(tipoId, tr.id, di);
                                  const we = weekend(di);
                                  return (
                                    <td key={di} className="text-center px-1 py-1.5"
                                        style={{
                                          borderBottom: '1px solid var(--border)',
                                          background: cella.stop_sell ? 'var(--status-red-bg)' : (cellaSelezionata(tipoId, tr.id, 'restrizioni', colIdx) ? 'rgba(24,95,165,0.13)' : (we ? '#FAFBFC' : undefined)),
                                          cursor: puoScrivere ? 'pointer' : 'default',
                                        }}
                                        onPointerDown={() => iniziaTrascinamento(tipoId, tr.id, 'restrizioni', colIdx)}
                                        onPointerEnter={() => continuaTrascinamento(tipoId, tr.id, 'restrizioni', colIdx)}
                                        onClick={e => {
                                          if (dragMosso) return; // il rilascio del drag non deve aprire anche il popover
                                          if (!puoScrivere) return;
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          setFormRestrizioni({
                                            min_stay: cella.min_stay != null ? String(cella.min_stay) : '',
                                            chiuso_arrivo: cella.chiuso_arrivo, chiuso_partenza: cella.chiuso_partenza, stop_sell: cella.stop_sell,
                                          });
                                          setPopoverRestrizioni({ tipoId, trattamento: tr.id, data: di, top: rect.bottom + 4, left: Math.max(8, rect.left - 90) });
                                        }}>
                                      {cella.stop_sell ? (
                                        <span className="text-[9.5px] font-bold" style={{ color: 'var(--status-red-text)' }}>chiusa</span>
                                      ) : (
                                        /* Badge colorati come la legenda sotto la griglia (24/08/2026,
                                           richiesta del titolare: "ora è tutto color grigio") — stessi
                                           valori background/color della legenda, non un'approssimazione. */
                                        <span className="inline-flex gap-0.5 flex-wrap justify-center">
                                          {cella.min_stay > 1 && (
                                            <span className="text-[9.5px] font-bold px-1 py-0.5 rounded" style={{ background: 'var(--status-blue-bg)', color: 'var(--status-blue-text)' }}>
                                              {cella.min_stay}n
                                            </span>
                                          )}
                                          {cella.chiuso_arrivo && (
                                            <span className="text-[9.5px] font-bold px-1 py-0.5 rounded" style={{ background: 'var(--hotel-amber-light)', color: 'var(--hotel-amber-dark)' }}>
                                              CTA
                                            </span>
                                          )}
                                          {cella.chiuso_partenza && (
                                            <span className="text-[9.5px] font-bold px-1 py-0.5 rounded" style={{ background: '#F1EAFB', color: '#6B3FA0' }}>
                                              CTD
                                            </span>
                                          )}
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            </>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-3.5 text-[11.5px] flex-wrap" style={{ color: 'var(--muted-foreground)' }}>
        <span><span className="text-[9.5px] font-bold px-1 py-0.5 rounded" style={{ background: 'var(--status-blue-bg)', color: 'var(--status-blue-text)' }}>3n</span> min stay 3 notti</span>
        <span><span className="text-[9.5px] font-bold px-1 py-0.5 rounded" style={{ background: 'var(--hotel-amber-light)', color: 'var(--hotel-amber-dark)' }}>CTA</span> chiusa all&apos;arrivo</span>
        <span><span className="text-[9.5px] font-bold px-1 py-0.5 rounded" style={{ background: '#F1EAFB', color: '#6B3FA0' }}>CTD</span> chiusa alla partenza</span>
        <span className="flex items-center gap-1.5">
          <i style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--status-red-bg)', display: 'inline-block' }} /> stop-sell (chiusa alla vendita)
        </span>
      </div>

      {/* Popover restrizioni — position:fixed, esce dal clipping della tabella */}
      {popoverRestrizioni && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPopoverRestrizioni(null)} />
          <div className="fixed z-50 p-2.5 rounded-lg text-left"
               style={{ top: popoverRestrizioni.top, left: popoverRestrizioni.left, width: '220px', background: 'white', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
               onClick={e => e.stopPropagation()}>
            <p className="text-[11.5px] font-semibold mb-2">
              {popoverRestrizioni.data.slice(8, 10)}/{popoverRestrizioni.data.slice(5, 7)}/{popoverRestrizioni.data.slice(0, 4)}
            </p>
            <label className="flex items-center justify-between text-[11px] mb-1.5">
              Min. stay (notti)
              <input type="number" min={1} value={formRestrizioni.min_stay}
                     onChange={e => setFormRestrizioni(f => ({ ...f, min_stay: e.target.value }))}
                     style={{ width: '50px', border: '1px solid var(--border)', borderRadius: '5px', fontSize: '12px', marginLeft: 'auto', padding: '3px 5px' }} />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] mb-1.5">
              <input type="checkbox" checked={formRestrizioni.chiuso_arrivo}
                     onChange={e => setFormRestrizioni(f => ({ ...f, chiuso_arrivo: e.target.checked }))} />
              Chiusa all&apos;arrivo (CTA)
            </label>
            <label className="flex items-center gap-1.5 text-[11px] mb-1.5">
              <input type="checkbox" checked={formRestrizioni.chiuso_partenza}
                     onChange={e => setFormRestrizioni(f => ({ ...f, chiuso_partenza: e.target.checked }))} />
              Chiusa alla partenza (CTD)
            </label>
            <label className="flex items-center gap-1.5 text-[11px] mb-2">
              <input type="checkbox" checked={formRestrizioni.stop_sell}
                     onChange={e => setFormRestrizioni(f => ({ ...f, stop_sell: e.target.checked }))} />
              Stop-sell
            </label>
            <div className="flex justify-end gap-1.5">
              <button onClick={() => setPopoverRestrizioni(null)} className="text-[11px] px-2 py-1 rounded border">Annulla</button>
              <button onClick={salvaRestrizioniGiorno}
                      className="text-[11px] px-2 py-1 rounded text-white" style={{ background: 'var(--hotel-navy)' }}>Salva</button>
            </div>
          </div>
        </>
      )}

      {/* Menu propagazione ⚡ — anche questo position:fixed */}
      {menuPropaga && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuPropaga(null)} />
          <div className="fixed z-50 rounded-lg py-1"
               style={{ top: menuPropaga.top, left: menuPropaga.left, width: '260px', background: 'white', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
               onClick={e => e.stopPropagation()}>
            {!menuPropagaUltima ? (
              <p className="text-[11.5px] px-2.5 py-2" style={{ color: 'var(--muted-foreground)' }}>Modifica prima una cella prezzo in questa riga (doppio click).</p>
            ) : (
              <>
                <p className="text-[10.5px] uppercase tracking-wide px-2.5 pt-1 pb-1" style={{ color: 'var(--muted-foreground)' }}>Propaga prezzo = {menuPropagaUltima.valore}€</p>
                <button onClick={() => propagaRiga(menuPropaga.tipoId, menuPropaga.trattamento)}
                        className="block w-full text-left px-2.5 py-2 text-xs hover:bg-gray-50">
                  Applica a tutta la riga ({modo === '14gg' ? '14 giorni visibili' : 'tutto il mese'})
                </button>
                <button onClick={() => propagaColonna(menuPropaga.tipoId, menuPropaga.trattamento)}
                        className="block w-full text-left px-2.5 py-2 text-xs hover:bg-gray-50">
                  Applica alla colonna — stesso giorno, altri trattamenti
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Drawer bulk-edit — multi tipologia × multi trattamento × multi campo */}
      {drawerAperto && drawerForm && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setDrawerAperto(false)}>
          <div className="h-full w-full max-w-md flex flex-col" style={{ background: 'white' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="font-semibold text-[13.5px]">Modifica</p>
              <button onClick={() => setDrawerAperto(false)} className="text-lg" style={{ color: 'var(--muted-foreground)' }}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm">
              <div className="mb-4">
                <label className="block text-xs font-medium mb-1.5">Tipologia camera</label>
                <div className="flex gap-1.5 flex-wrap">
                  {tipiCamera.map(t => (
                    <button key={t.id} onClick={() => toggleDrawerSet('tipologie', String(t.id))}
                            className="text-xs px-3 py-1.5 rounded-full"
                            style={drawerForm.tipologie.has(String(t.id)) ? { background: 'var(--hotel-navy)', color: 'white' } : { border: '1px solid var(--border)' }}>
                      {t.nome}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium mb-1.5">Trattamento</label>
                <div className="flex gap-1.5 flex-wrap">
                  {TRATTAMENTI.map(tr => (
                    <button key={tr.id} onClick={() => toggleDrawerSet('trattamenti', tr.id)}
                            className="text-xs px-3 py-1.5 rounded-full"
                            style={drawerForm.trattamenti.has(tr.id) ? { background: 'var(--hotel-navy)', color: 'white' } : { border: '1px solid var(--border)' }}>
                      {tr.nome}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium mb-1.5">Cosa modificare</label>
                <div className="flex gap-1.5 flex-wrap">
                  {CAMPI_DRAWER.map(c => (
                    <button key={c.id} onClick={() => toggleDrawerSet('campi', c.id)}
                            className="text-xs px-3 py-1.5 rounded-full"
                            style={drawerForm.campi.has(c.id) ? { background: 'var(--hotel-navy)', color: 'white' } : { border: '1px solid var(--border)' }}>
                      {c.nome}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5 mb-4">
                <label className="text-xs font-medium">Dal
                  <input type="date" value={drawerForm.dataInizio} onChange={e => setDrawerForm(f => ({ ...f, dataInizio: e.target.value }))}
                         className="block w-full mt-1 px-2.5 py-1.5 rounded-lg text-sm" style={{ border: '1px solid var(--border)' }} />
                </label>
                <label className="text-xs font-medium">Al
                  <input type="date" value={drawerForm.dataFine} onChange={e => setDrawerForm(f => ({ ...f, dataFine: e.target.value }))}
                         className="block w-full mt-1 px-2.5 py-1.5 rounded-lg text-sm" style={{ border: '1px solid var(--border)' }} />
                </label>
              </div>
              {CAMPI_DRAWER.filter(c => drawerForm.campi.has(c.id)).map(c => (
                <div key={c.id} className="mb-3">
                  <label className="block text-xs font-medium mb-1.5">{c.nome}</label>
                  {c.tipo === 'numero' ? (
                    <input type="number" value={drawerForm.valori[c.id] ?? ''}
                           onChange={e => setDrawerForm(f => ({ ...f, valori: { ...f.valori, [c.id]: e.target.value } }))}
                           className="block w-full px-2.5 py-1.5 rounded-lg text-sm" style={{ border: '1px solid var(--border)' }} />
                  ) : (
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setDrawerForm(f => ({ ...f, valori: { ...f.valori, [c.id]: false } }))}
                              className="text-xs px-3 py-1.5 rounded-full"
                              style={!drawerForm.valori[c.id] ? { background: 'var(--hotel-navy)', color: 'white' } : { border: '1px solid var(--border)' }}>
                        Disattiva
                      </button>
                      <button type="button" onClick={() => setDrawerForm(f => ({ ...f, valori: { ...f.valori, [c.id]: true } }))}
                              className="text-xs px-3 py-1.5 rounded-full"
                              style={drawerForm.valori[c.id] ? { background: 'var(--hotel-navy)', color: 'white' } : { border: '1px solid var(--border)' }}>
                        Attiva
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setDrawerAperto(false)} className="text-sm px-4 py-2 rounded-lg" style={{ border: '1px solid var(--border)' }}>Annulla</button>
              <button onClick={applicaDrawer} className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: 'var(--hotel-navy)' }}>Applica</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
