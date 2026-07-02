'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Car, Camera, Loader2, Upload, Download, Plus, Trash2,
  CheckCircle, Clock, AlertTriangle, XCircle, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

// ─── OCR ──────────────────────────────────────────────────────────────────────
const REGEX_TARGA = /\b([A-Z]{2}\d{3}[A-Z]{2})\b/g;

async function ocrTarga(file) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' });
  const { data: { text } } = await worker.recognize(file);
  await worker.terminate();
  const testo = text.toUpperCase().replace(/[^A-Z0-9]/g, ' ');
  const match = testo.match(REGEX_TARGA);
  return match ? match[0] : testo.replace(/\s+/g, '').substring(0, 10);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

const STATI = {
  mancante:       { label: 'Mancante',       colore: 'red',   Icona: XCircle },
  non_necessaria: { label: 'Non necessaria', colore: 'blue',  Icona: CheckCircle },
  da_inviare:     { label: 'Da inviare',     colore: 'amber', Icona: Clock },
  inviata:        { label: 'Inviata',        colore: 'green', Icona: CheckCircle },
  scaduta:        { label: 'Scaduta',        colore: 'amber', Icona: AlertTriangle },
  conclusa:       { label: 'Conclusa',       colore: 'blue',  Icona: CheckCircle },
};

function StatoBadge({ stato }) {
  const s = STATI[stato] || STATI.mancante;
  const { Icona } = s;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: `var(--status-${s.colore}-bg)`, color: `var(--status-${s.colore}-text)` }}>
      <Icona size={10} /> {s.label}
    </span>
  );
}

// ─── Modal conferma targa dopo OCR ───────────────────────────────────────────
function ModalConfermaOCR({ targaRiconosciuta, prenotazione, onConferma, onAnnulla }) {
  const [targa, setTarga] = useState(targaRiconosciuta);
  const [note, setNote]   = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-sm rounded-2xl p-5 shadow-xl"
           style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>

        <p className="text-base font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
          Conferma targa
        </p>
        <p className="text-[12px] mb-4" style={{ color: 'var(--muted-foreground)' }}>
          Camera {prenotazione.camera_numero} — {prenotazione.ospite_nome || 'Ospite'}
        </p>

        {/* Targa grande e modificabile */}
        <div className="mb-3">
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>
            Targa riconosciuta — correggi se necessario
          </label>
          <input
            value={targa}
            onChange={e => setTarga(e.target.value.toUpperCase())}
            maxLength={10}
            autoFocus
            className="w-full px-4 py-3 rounded-xl text-2xl font-black font-mono tracking-widest text-center uppercase outline-none"
            style={{
              border: '2px solid var(--hotel-amber)',
              background: 'var(--background)',
              color: 'var(--hotel-navy)',
              letterSpacing: '0.2em',
            }}
          />
          <p className="text-[10px] mt-1 text-center" style={{ color: 'var(--muted-foreground)' }}>
            Attenzione agli errori OCR: 0/O, 1/I, B/8
          </p>
        </div>

        <div className="mb-4">
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>
            Note (opzionale)
          </label>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="es. Fiat Panda grigia"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onConferma(targa, note)}
            disabled={!targa || targa.length < 5}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: 'var(--hotel-navy)', color: 'white' }}>
            Conferma e salva
          </button>
          <button onClick={onAnnulla}
                  className="px-4 py-2.5 rounded-xl text-sm"
                  style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal riepilogo import Excel ─────────────────────────────────────────────
function ModalRiepilogoImport({ risultati, onChiudi }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-sm rounded-2xl p-5 shadow-xl"
           style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <p className="text-base font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
          Riepilogo import Excel
        </p>
        <div className="flex flex-col gap-2 mb-4 text-sm">
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted-foreground)' }}>✅ Prenotazioni nuove</span>
            <span className="font-bold" style={{ color: 'var(--status-green-text)' }}>{risultati.nuove}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted-foreground)' }}>🔄 Aggiornate</span>
            <span className="font-bold" style={{ color: 'var(--status-blue-text)' }}>{risultati.aggiornate}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted-foreground)' }}>⏭ Saltate (già complete)</span>
            <span className="font-bold" style={{ color: 'var(--muted-foreground)' }}>{risultati.saltate}</span>
          </div>
          {risultati.camereConflitto?.length > 0 && (
            <div className="mt-2 p-3 rounded-lg" style={{ background: 'var(--status-amber-bg)' }}>
              <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--status-amber-text)' }}>
                ⚠ Date modificate su targhe già inviate
              </p>
              {risultati.camereConflitto.map((c, i) => (
                <p key={i} className="text-[11px]" style={{ color: 'var(--status-amber-text)' }}>
                  Camera {c.camera} ({c.targa}) — partenza {fmt(c.partenzaVecchia)} → {fmt(c.partenzaNuova)}. Verifica su VigiPass.
                </p>
              ))}
            </div>
          )}
          {risultati.errori?.length > 0 && (
            <div className="mt-1 p-2 rounded-lg" style={{ background: 'var(--status-red-bg)' }}>
              {risultati.errori.map((e, i) => (
                <p key={i} className="text-[11px]" style={{ color: 'var(--status-red-text)' }}>{e}</p>
              ))}
            </div>
          )}
        </div>
        <button onClick={onChiudi}
                className="w-full py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'var(--hotel-navy)', color: 'white' }}>
          OK
        </button>
      </div>
    </div>
  );
}

// ─── Riga singola prenotazione ────────────────────────────────────────────────
function RigaPrenotazione({ p, isTitolare, onOCR, onSegnaInviata, onNonNecessaria, onElimina }) {
  const [confermando, setConfermando] = useState(false);

  return (
    <div className="rounded-xl p-3.5 transition-all"
         style={{
           background: 'var(--card)',
           border: `1.5px solid ${p.stato === 'mancante'   ? 'var(--status-red-text)'
                                : p.stato === 'da_inviare' ? 'var(--hotel-amber)'
                                : p.stato === 'scaduta'    ? 'var(--status-amber-text)'
                                : 'var(--border)'}`,
         }}>

      <div className="flex items-start justify-between gap-3">
        {/* Info prenotazione */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-bold" style={{ color: 'var(--hotel-navy)' }}>
              Camera {p.camera_numero}
            </span>
            <StatoBadge stato={p.stato} />
          </div>
          <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
            {p.ospite_nome || <span style={{ color: 'var(--muted-foreground)' }}>Ospite non specificato</span>}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            {fmt(p.data_arrivo)} → {fmt(p.data_partenza)}
            {p.import_source === 'excel_ts' && (
              <span className="ml-2 opacity-60">· da TS</span>
            )}
          </p>

          {/* Targa */}
          {p.targa ? (
            <p className="mt-1.5 text-lg font-black font-mono tracking-widest"
               style={{ color: 'var(--hotel-navy)', letterSpacing: '0.15em' }}>
              {p.targa}
            </p>
          ) : (
            <p className="mt-1.5 text-[12px] font-medium" style={{ color: 'var(--status-red-text)' }}>
              ❌ Targa mancante
            </p>
          )}

          {p.note && (
            <p className="text-[11px] mt-0.5 italic" style={{ color: 'var(--muted-foreground)' }}>{p.note}</p>
          )}
        </div>

        {/* Azioni */}
        <div className="flex flex-col gap-1.5 items-end shrink-0">
          {/* Pulsante OCR / aggiungi targa */}
          {p.stato !== 'inviata' && p.stato !== 'conclusa' && (
            <button onClick={() => onOCR(p)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                    style={{ background: 'var(--hotel-navy)', color: 'white' }}>
              <Camera size={12} /> {p.targa ? 'Modifica' : 'Foto targa'}
            </button>
          )}

          {/* Non necessaria — solo se mancante */}
          {p.stato === 'mancante' && (
            <button onClick={() => onNonNecessaria(p.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                    style={{ background: 'var(--status-blue-bg)', color: 'var(--status-blue-text)', border: '1px solid var(--status-blue-text)' }}>
              🚶 Senza auto
            </button>
          )}

          {/* Segna inviata — solo titolare, solo se da_inviare */}
          {isTitolare && p.stato === 'da_inviare' && (
            <button onClick={() => onSegnaInviata(p.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                    style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)', border: '1px solid var(--status-green-text)' }}>
              <CheckCircle size={12} /> Segna inviata
            </button>
          )}

          {/* Elimina — solo titolare */}
          {isTitolare && (
            confermando ? (
              <div className="flex gap-1">
                <button onClick={() => onElimina(p.id)}
                        className="text-[10px] px-2 py-1 rounded font-medium"
                        style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>Sì</button>
                <button onClick={() => setConfermando(false)}
                        className="text-[10px] px-2 py-1 rounded"
                        style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>No</button>
              </div>
            ) : (
              <button onClick={() => setConfermando(true)} className="p-1 opacity-40 hover:opacity-70">
                <Trash2 size={13} />
              </button>
            )
          )}
        </div>
      </div>

      {/* Banner "da copiare su VigiPass" — solo titolare, stato da_inviare */}
      {isTitolare && p.stato === 'da_inviare' && p.targa && (
        <div className="mt-2 pt-2 flex items-center justify-between"
             style={{ borderTop: '0.5px solid var(--border)' }}>
          <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            Dati per VigiPass: <strong>{p.targa}</strong> · {p.ospite_nome} · {fmt(p.data_arrivo)}–{fmt(p.data_partenza)}
          </p>
          <button
            onClick={() => navigator.clipboard.writeText(`${p.targa}\t${p.ospite_nome}\t${p.data_arrivo}\t${p.data_partenza}`)}
            className="text-[10px] px-2 py-0.5 rounded font-medium ml-2 shrink-0"
            style={{ background: 'var(--status-blue-bg)', color: 'var(--status-blue-text)' }}>
            Copia
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Pagina principale ────────────────────────────────────────────────────────
const FILTRI = [
  { key: '',              label: 'Tutte' },
  { key: 'mancante',      label: '❌ Mancanti' },
  { key: 'da_inviare',    label: '⏳ Da inviare' },
  { key: 'inviata',       label: '✅ Inviate' },
  { key: 'scaduta',       label: '⚠ Scadute' },
  { key: 'non_necessaria',label: '🚶 Non necessaria' },
];

export default function PaginaZTL() {
  const { utente } = useAuth();
  const isTitolare = ['admin', 'titolare'].includes(utente?.ruolo);

  const [prenotazioni, setPrenotazioni] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [filtro, setFiltro]             = useState('');

  // OCR state
  const [ocrLoading, setOcrLoading]           = useState(false);
  const [ocrModal, setOcrModal]               = useState(null); // { targaRiconosciuta, prenotazione }
  const [prenotazioneOCR, setPrenotazioneOCR] = useState(null);
  const fileRef = useRef(null);

  // Import Excel state
  const [importLoading, setImportLoading]   = useState(false);
  const [importRisultati, setImportRisultati] = useState(null);
  const importRef = useRef(null);

  // Form manuale (titolare)
  const [mostraFormManuale, setMostraFormManuale] = useState(false);
  const [formManuale, setFormManuale] = useState({ camera_numero: '', ospite_nome: '', data_arrivo: '', data_partenza: '' });

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/ztl?stato=${filtro}`);
      setPrenotazioni(r.data.prenotazioni);
    } catch {} finally { setLoading(false); }
  }, [filtro]);

  useEffect(() => { carica(); }, [carica]);

  // ── OCR flow ──
  async function handleFoto(e) {
    const file = e.target.files?.[0];
    if (!file || !prenotazioneOCR) return;
    setOcrLoading(true);
    try {
      const targa = await ocrTarga(file);
      setOcrModal({ targaRiconosciuta: targa, prenotazione: prenotazioneOCR });
    } catch {
      setOcrModal({ targaRiconosciuta: '', prenotazione: prenotazioneOCR });
    } finally {
      setOcrLoading(false);
      e.target.value = '';
    }
  }

  function avviaOCR(prenotazione) {
    setPrenotazioneOCR(prenotazione);
    setTimeout(() => fileRef.current?.click(), 50);
  }

  async function confermaOCR(targa, note) {
    if (!ocrModal) return;
    try {
      await api.patch(`/ztl/${ocrModal.prenotazione.id}/targa`, { targa, note });
      setOcrModal(null);
      setPrenotazioneOCR(null);
      carica();
    } catch {}
  }

  // ── Non necessaria ──
  async function segnaNonNecessaria(id) {
    try {
      await api.patch(`/ztl/${id}/non-necessaria`, {});
      setPrenotazioni(p => p.map(r => r.id === id ? { ...r, stato: 'non_necessaria' } : r));
    } catch {}
  }

  // ── Segna inviata ──
  async function segnaInviata(id) {
    try {
      await api.patch(`/ztl/${id}/invia`, {});
      setPrenotazioni(p => p.map(r => r.id === id ? { ...r, stato: 'inviata' } : r));
    } catch {}
  }

  // ── Elimina ──
  async function elimina(id) {
    try {
      await api.delete(`/ztl/${id}`);
      setPrenotazioni(p => p.filter(r => r.id !== id));
    } catch {}
  }

  // ── Import Excel ──
  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = (await import('js-cookie')).default.get('token');
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ztl/import`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.errore);
      setImportRisultati(data.risultati);
      carica();
    } catch (err) {
      alert(err.message || 'Errore import Excel');
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  }

  // ── Export CSV VigiPass ──
  async function esportaVigiPass() {
    try {
      const token = (await import('js-cookie')).default.get('token');
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ztl/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) { alert('Nessuna targa da inviare.'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ztl_vigipass_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  // ── Form manuale ──
  async function salvaManuale() {
    try {
      await api.post('/ztl/manuale', formManuale);
      setMostraFormManuale(false);
      setFormManuale({ camera_numero: '', ospite_nome: '', data_arrivo: '', data_partenza: '' });
      carica();
    } catch {}
  }

  const mancanti   = prenotazioni.filter(p => p.stato === 'mancante').length;
  const daInviare  = prenotazioni.filter(p => p.stato === 'da_inviare').length;

  return (
    <AppShell titolo="ZTL Targhe">

      {/* Input nascosti */}
      <input ref={fileRef}   type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFoto} />
      <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />

      {/* Modal OCR */}
      {ocrModal && (
        <ModalConfermaOCR
          targaRiconosciuta={ocrModal.targaRiconosciuta}
          prenotazione={ocrModal.prenotazione}
          onConferma={confermaOCR}
          onAnnulla={() => { setOcrModal(null); setPrenotazioneOCR(null); }}
        />
      )}

      {/* Modal riepilogo import */}
      {importRisultati && (
        <ModalRiepilogoImport
          risultati={importRisultati}
          onChiudi={() => setImportRisultati(null)}
        />
      )}

      {/* Spinner OCR */}
      {ocrLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center"
             style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl px-6 py-4 flex items-center gap-3"
               style={{ background: 'var(--card)' }}>
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--hotel-navy)' }} />
            <p className="text-sm font-medium">Lettura targa in corso...</p>
          </div>
        </div>
      )}

      {/* Header con alert e azioni */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          {mancanti > 0 && (
            <p className="text-[12px] font-medium" style={{ color: 'var(--status-red-text)' }}>
              ❌ {mancanti} {mancanti === 1 ? 'camera senza targa' : 'camere senza targa'}
            </p>
          )}
          {daInviare > 0 && (
            <p className="text-[12px] font-medium" style={{ color: 'var(--status-amber-text)' }}>
              ⏳ {daInviare} {daInviare === 1 ? 'targa da inviare al Comune' : 'targhe da inviare al Comune'}
            </p>
          )}
          {mancanti === 0 && daInviare === 0 && !loading && (
            <p className="text-[12px]" style={{ color: 'var(--status-green-text)' }}>✅ Tutto in ordine</p>
          )}
        </div>

        {/* Azioni titolare */}
        {isTitolare && (
          <div className="flex gap-1.5 flex-wrap justify-end">
            <button onClick={() => importRef.current?.click()} disabled={importLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-50"
                    style={{ border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}>
              {importLoading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
              Import TS
            </button>
            <button onClick={esportaVigiPass}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                    style={{ border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}>
              <Download size={11} /> Export VigiPass
            </button>
            <button onClick={() => setMostraFormManuale(p => !p)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                    style={{ background: 'var(--hotel-navy)', color: 'white' }}>
              <Plus size={11} /> Aggiungi
            </button>
          </div>
        )}
      </div>

      {/* Form inserimento manuale (titolare) */}
      {mostraFormManuale && (
        <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--card)', border: '1.5px solid var(--hotel-amber)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Inserimento manuale prenotazione</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {[
              { k: 'camera_numero', label: 'Camera *', ph: 'es. 7' },
              { k: 'ospite_nome',   label: 'Ospite',   ph: 'Cognome Nome' },
            ].map(({ k, label, ph }) => (
              <div key={k}>
                <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>{label}</label>
                <input value={formManuale[k]} onChange={e => setFormManuale(p => ({ ...p, [k]: e.target.value }))}
                       placeholder={ph} className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                       style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
              </div>
            ))}
            {[
              { k: 'data_arrivo',   label: 'Arrivo *' },
              { k: 'data_partenza', label: 'Partenza *' },
            ].map(({ k, label }) => (
              <div key={k}>
                <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>{label}</label>
                <input type="date" value={formManuale[k]} onChange={e => setFormManuale(p => ({ ...p, [k]: e.target.value }))}
                       className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                       style={{ border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={salvaManuale}
                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--hotel-navy)', color: 'white' }}>Salva</button>
            <button onClick={() => setMostraFormManuale(false)}
                    className="px-4 py-2 rounded-lg text-sm"
                    style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>Annulla</button>
          </div>
        </div>
      )}

      {/* Filtri */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {FILTRI.map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors"
                  style={{
                    background: filtro === f.key ? 'var(--hotel-navy)' : 'var(--card)',
                    color: filtro === f.key ? 'white' : 'var(--muted-foreground)',
                    border: filtro === f.key ? 'none' : '0.5px solid var(--border)',
                  }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista prenotazioni */}
      {loading ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      ) : prenotazioni.length === 0 ? (
        <div className="text-center py-12">
          <Car size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {filtro ? 'Nessuna prenotazione con questo stato.' : 'Nessuna prenotazione attiva oggi.'}
          </p>
          {isTitolare && !filtro && (
            <p className="text-[12px] mt-2" style={{ color: 'var(--muted-foreground)' }}>
              Importa il planning da TeamSystem con il pulsante "Import TS"
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {prenotazioni.map(p => (
            <RigaPrenotazione
              key={p.id}
              p={p}
              isTitolare={isTitolare}
              onOCR={avviaOCR}
              onSegnaInviata={segnaInviata}
              onNonNecessaria={segnaNonNecessaria}
              onElimina={elimina}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
