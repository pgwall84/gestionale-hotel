'use client';

// Pagina Registro HACCP — modulo 6.1, sessione 4 (16/08/2026): pagina unica
// con un tab per ognuno degli 8 registri del template registri_HACCP_A1_A8.
// xlsx (A.1 ricevimento, A.2 temperature, A.3 cottura, A.4 buffet, A.5
// pulizie, A.6 manutenzioni, A.7 formazione, A.8 infestanti).
// A.5 (tab Pulizie) usa GLI STESSI endpoint di /hr/haccp già in uso dalla
// pagina storica /checklist (non una nuova tabella): quella pagina resta
// raggiungibile com'era, questa è semplicemente un secondo punto d'accesso
// agli stessi dati, arricchito con i campi del template (prodotto usato,
// dosaggio, tempo di contatto, firma responsabile) aggiunti in migration 045.
// Nessuna duplicazione di dati, solo due UI sullo stesso backend durante la
// transizione.

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Thermometer, Flame, Download, Truck, UtensilsCrossed, Wrench, GraduationCap, Bug, Sparkles, CheckSquare, Square } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import CampoData from '@/components/ui/CampoData';
import api, { getApiUrl } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

function oggi() {
  return new Date().toISOString().split('T')[0];
}

export default function PaginaRegistroHaccp() {
  // 'temperature' | 'cottura' | 'ricevimento' | 'buffet' | 'pulizie' | 'manutenzioni' | 'formazione' | 'infestanti'
  const [tab, setTab] = useState('temperature');
  const [data, setData] = useState(oggi());
  const { utente } = useAuth();
  const isTitolare = utente?.ruolo === 'titolare' || utente?.ruolo === 'admin';

  // A.4 buffet e A.6 manutenzioni sono moduli "in forse" (/impostazioni/
  // haccp) — i tab si nascondono se spenti, non si mostra un form che poi il
  // backend rifiuta. GET /impostazioni/haccp/moduli è leggibile da chiunque
  // abbia la sezione haccp (sessione 2, 16/08/2026), non solo dal titolare.
  const [buffetAttivo, setBuffetAttivo] = useState(true);
  const [manutenzioniAttivo, setManutenzioniAttivo] = useState(true);
  useEffect(() => {
    api.get('/impostazioni/haccp/moduli')
      .then(r => {
        const moduli = r.data.moduli || [];
        setBuffetAttivo(moduli.find(m => m.modulo === 'buffet')?.attivo ?? true);
        setManutenzioniAttivo(moduli.find(m => m.modulo === 'manutenzioni_programmate')?.attivo ?? true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { if (tab === 'buffet' && !buffetAttivo) setTab('temperature'); }, [tab, buffetAttivo]);
  useEffect(() => { if (tab === 'manutenzioni' && !manutenzioniAttivo) setTab('temperature'); }, [tab, manutenzioniAttivo]);

  const TAB_STYLE = (attivo) => ({
    background: attivo ? 'var(--hotel-amber)' : 'var(--card)',
    color: attivo ? '#fff' : 'var(--muted-foreground)',
    border: '0.5px solid var(--border)',
  });

  return (
    <AppShell titolo="Registro HACCP" sottotitolo="Registri A.1–A.8: ricevimento, temperature, cottura, buffet, pulizie, manutenzioni, formazione, infestanti">
      <div className="max-w-2xl mx-auto">

        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setTab('temperature')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={TAB_STYLE(tab === 'temperature')}>
              <Thermometer size={13} /> Temperature
            </button>
            <button onClick={() => setTab('cottura')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={TAB_STYLE(tab === 'cottura')}>
              <Flame size={13} /> Scongelamento e cottura
            </button>
            <button onClick={() => setTab('ricevimento')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={TAB_STYLE(tab === 'ricevimento')}>
              <Truck size={13} /> Ricevimento merci
            </button>
            {buffetAttivo && (
              <button onClick={() => setTab('buffet')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={TAB_STYLE(tab === 'buffet')}>
                <UtensilsCrossed size={13} /> Buffet
              </button>
            )}
            <button onClick={() => setTab('pulizie')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={TAB_STYLE(tab === 'pulizie')}>
              <Sparkles size={13} /> Pulizie
            </button>
            {manutenzioniAttivo && (
              <button onClick={() => setTab('manutenzioni')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={TAB_STYLE(tab === 'manutenzioni')}>
                <Wrench size={13} /> Manutenzioni
              </button>
            )}
            <button onClick={() => setTab('formazione')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={TAB_STYLE(tab === 'formazione')}>
              <GraduationCap size={13} /> Formazione
            </button>
            <button onClick={() => setTab('infestanti')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={TAB_STYLE(tab === 'infestanti')}>
              <Bug size={13} /> Infestanti
            </button>
          </div>

          <CampoData value={data} onChange={setData}
                 className="px-3"
                 style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
        </div>

        {tab === 'temperature' && <TabTemperature data={data} />}
        {tab === 'cottura' && <TabCottura data={data} />}
        {tab === 'ricevimento' && <TabRicevimento data={data} />}
        {tab === 'buffet' && buffetAttivo && <TabBuffet data={data} />}
        {tab === 'pulizie' && <TabPulizie data={data} />}
        {tab === 'manutenzioni' && manutenzioniAttivo && <TabManutenzioni data={data} />}
        {tab === 'formazione' && <TabFormazione data={data} />}
        {tab === 'infestanti' && <TabInfestanti data={data} />}

        {/* Export per registro/omnicomprensivo (sessione 4, 16/08/2026) —
            riservato al titolare, stesso livello di riservatezza dello
            storico backend (soloTitolare). */}
        {isTitolare && <BloccoExportRegistri />}
      </div>
    </AppShell>
  );
}

// ── Export per registro / omnicomprensivo (sessione 4, 16/08/2026) ─────────
// Sostituisce il vecchio "Export ispezione" (intestazioni italiane
// inventate, solo 5 registri su 8): ora ogni file — Excel o PDF, singolo
// registro o tutti e 8 insieme — usa le intestazioni ESATTE del template
// (`registri_HACCP_A1_A8.xlsx`), lette dal backend (esportazioneHaccpController.
// js), non tradotte. Elenco qui SOLO per etichette/ordine del selettore: le
// chiavi devono restare uguali a REGISTRI in esportazioneHaccpController.js —
// se in futuro si aggiunge un nono registro, aggiornare in entrambi i posti.
const REGISTRI_EXPORT = [
  { chiave: 'A1_Ricevimento_merci', label: 'A.1 — Ricevimento merci' },
  { chiave: 'A2_Temp_frigo_freezer', label: 'A.2 — Temperature frigo/freezer' },
  { chiave: 'A3_Temp_cottura', label: 'A.3 — Temperature cottura' },
  { chiave: 'A4_Temp_buffet', label: 'A.4 — Temperature buffet' },
  { chiave: 'A5_Pulizie', label: 'A.5 — Pulizie e sanificazione' },
  { chiave: 'A6_Manutenzioni', label: 'A.6 — Manutenzioni programmate' },
  { chiave: 'A7_Formazione', label: 'A.7 — Formazione' },
  { chiave: 'A8_Infestanti', label: 'A.8 — Controllo infestanti' },
];

// Disegna un blocco {label, headers, righe} nel PDF già aperto — riusata sia
// per l'export di un singolo registro sia per ogni sezione dell'omnicomprensivo.
function disegnaBloccoPdf(pdf, stato, blocco) {
  const margine = 14;
  const larghezzaUtile = pdf.internal.pageSize.getWidth() - margine * 2;
  if (stato.y > 275) { pdf.addPage(); stato.y = 18; }
  pdf.setFontSize(13); pdf.setFont(undefined, 'bold');
  pdf.text(blocco.label, margine, stato.y);
  stato.y += 7;
  pdf.setFontSize(8); pdf.setFont(undefined, 'normal');

  if (!blocco.righe.length) {
    if (stato.y > 280) { pdf.addPage(); stato.y = 18; }
    pdf.text('Nessuna registrazione nel periodo.', margine, stato.y);
    stato.y += 6;
    return;
  }

  blocco.righe.forEach(riga => {
    const testo = blocco.headers.map((h, i) => `${h}: ${riga[i] ?? ''}`).join('  ·  ');
    const linee = pdf.splitTextToSize(testo, larghezzaUtile);
    linee.forEach(linea => {
      if (stato.y > 280) { pdf.addPage(); stato.y = 18; }
      pdf.text(linea, margine, stato.y);
      stato.y += 4;
    });
    stato.y += 1.5;
  });
  stato.y += 4;
}

async function scaricaBlobAutenticato(percorso, nomeFile) {
  const Cookies = (await import('js-cookie')).default;
  const token = Cookies.get('token');
  const res = await fetch(`${getApiUrl()}${percorso}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error();
  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = nomeFile;
  link.click();
  URL.revokeObjectURL(link.href);
}

function BloccoExportRegistri() {
  const oggiStr = oggi();
  const primoMese = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const [da, setDa] = useState(primoMese);
  const [a, setA] = useState(oggiStr);
  const [registro, setRegistro] = useState('A1_Ricevimento_merci');
  const [caricoExcel, setCaricoExcel] = useState(false);
  const [caricoPdf, setCaricoPdf] = useState(false);
  const [caricoExcelTutti, setCaricoExcelTutti] = useState(false);
  const [caricoPdfTutti, setCaricoPdfTutti] = useState(false);

  async function esportaRegistroExcel() {
    setCaricoExcel(true);
    try {
      await scaricaBlobAutenticato(`/registro-haccp/export/${registro}/excel?da=${da}&a=${a}`, `${registro}_${da}_${a}.xlsx`);
    } catch { alert('Errore durante l\'export Excel.'); }
    finally { setCaricoExcel(false); }
  }

  async function esportaRegistroPdf() {
    setCaricoPdf(true);
    try {
      const r = await api.get(`/registro-haccp/export/${registro}/dati?da=${da}&a=${a}`);
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
      const stato = { y: 18 };
      pdf.setFontSize(16); pdf.setFont(undefined, 'bold');
      pdf.text(`Registro HACCP — ${r.data.label}`, 14, stato.y);
      stato.y += 6;
      pdf.setFontSize(10); pdf.setFont(undefined, 'normal');
      pdf.text(`Periodo: ${da} — ${a}`, 14, stato.y);
      stato.y += 10;
      disegnaBloccoPdf(pdf, stato, { label: r.data.label, headers: r.data.headers, righe: r.data.righe });
      pdf.save(`${registro}_${da}_${a}.pdf`);
    } catch { alert('Errore durante l\'export PDF.'); }
    finally { setCaricoPdf(false); }
  }

  async function esportaTuttiExcel() {
    setCaricoExcelTutti(true);
    try {
      await scaricaBlobAutenticato(`/registro-haccp/export/omnicomprensivo/excel?da=${da}&a=${a}`, `registri_haccp_${da}_${a}.xlsx`);
    } catch { alert('Errore durante l\'export Excel.'); }
    finally { setCaricoExcelTutti(false); }
  }

  async function esportaTuttiPdf() {
    setCaricoPdfTutti(true);
    try {
      const r = await api.get(`/registro-haccp/export/omnicomprensivo/dati?da=${da}&a=${a}`);
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
      const stato = { y: 18 };
      pdf.setFontSize(16); pdf.setFont(undefined, 'bold');
      pdf.text('Registri HACCP A.1–A.8 — pacchetto ispezione', 14, stato.y);
      stato.y += 6;
      pdf.setFontSize(10); pdf.setFont(undefined, 'normal');
      pdf.text(`Periodo: ${da} — ${a}`, 14, stato.y);
      stato.y += 10;
      r.data.registri.forEach(blocco => disegnaBloccoPdf(pdf, stato, blocco));
      pdf.save(`registri_haccp_${da}_${a}.pdf`);
    } catch { alert('Errore durante l\'export PDF.'); }
    finally { setCaricoPdfTutti(false); }
  }

  return (
    <div className="rounded-xl p-4 mt-6" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
      <p className="text-sm font-medium mb-3" style={{ color: 'var(--foreground)' }}>Export per ispezione</p>
      <p className="text-[12px] mb-3" style={{ color: 'var(--muted-foreground)' }}>
        Formato e intestazioni esattamente come nel template consegnato dall'ASL — un registro alla
        volta, oppure tutti e 8 insieme in un unico file.
      </p>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <CampoData value={da} onChange={setDa} className="px-3"
               style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--background)' }} />
        <span className="text-[12px]" style={{ color: 'var(--muted-foreground)' }}>—</span>
        <CampoData value={a} onChange={setA} className="px-3"
               style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--background)' }} />
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <select value={registro} onChange={e => setRegistro(e.target.value)}
                className="px-2 rounded-lg text-xs outline-none"
                style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}>
          {REGISTRI_EXPORT.map(r => <option key={r.chiave} value={r.chiave}>{r.label}</option>)}
        </select>
        <button onClick={esportaRegistroExcel} disabled={caricoExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60"
                style={{ background: 'var(--background)', border: '0.5px solid var(--border)', color: 'var(--foreground)' }}>
          <Download size={12} /> {caricoExcel ? 'Preparazione...' : 'Excel'}
        </button>
        <button onClick={esportaRegistroPdf} disabled={caricoPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60"
                style={{ background: 'var(--background)', border: '0.5px solid var(--border)', color: 'var(--foreground)' }}>
          <Download size={12} /> {caricoPdf ? 'Preparazione...' : 'PDF'}
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-2" style={{ borderTop: '0.5px solid var(--border)' }}>
        <span className="text-[12px]" style={{ color: 'var(--muted-foreground)' }}>Tutti gli 8 registri:</span>
        <button onClick={esportaTuttiExcel} disabled={caricoExcelTutti}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                style={{ background: 'var(--hotel-amber)' }}>
          <Download size={12} /> {caricoExcelTutti ? 'Preparazione...' : 'Esporta Excel'}
        </button>
        <button onClick={esportaTuttiPdf} disabled={caricoPdfTutti}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                style={{ background: 'var(--hotel-amber)' }}>
          <Download size={12} /> {caricoPdfTutti ? 'Preparazione...' : 'Esporta PDF'}
        </button>
      </div>
    </div>
  );
}

// ── Tab Temperature ──────────────────────────────────────────────────────
function TabTemperature({ data }) {
  const [letture, setLetture] = useState([]);
  const [apparecchiature, setApparecchiature] = useState([]);
  const [puntiMancanti, setPuntiMancanti] = useState([]);
  const [aperto, setAperto] = useState(false);
  const [form, setForm] = useState({ apparecchiatura_id: '', valore: '', note: '', azione_correttiva: '' });
  const [invio, setInvio] = useState(false);

  const carica = useCallback(async () => {
    try {
      const r = await api.get(`/registro-haccp/temperature?data=${data}`);
      setLetture(r.data.letture || []);
      setApparecchiature(r.data.apparecchiature || []);
      setPuntiMancanti(r.data.puntiMancanti || []);
    } catch {}
  }, [data]);

  useEffect(() => { carica(); }, [carica]);

  async function salva(e) {
    e.preventDefault();
    setInvio(true);
    try {
      await api.post('/registro-haccp/temperature', { ...form, data });
      setForm({ apparecchiatura_id: '', valore: '', note: '', azione_correttiva: '' });
      setAperto(false);
      await carica();
    } catch {} finally { setInvio(false); }
  }

  async function elimina(id) {
    if (!confirm('Eliminare questa rilevazione?')) return;
    try { await api.delete(`/registro-haccp/temperature/${id}`); await carica(); } catch {}
  }

  return (
    <div>
      {/* Soglie confermate dal titolare il 16/08/2026 per frigo/freezer
          (CSV allegato) — l'abbattitore non ha un giudizio statico, il suo
          limite è a tempo (registri_HACCP_A1_A8.xlsx), non ancora costruito. */}
      {puntiMancanti.length > 0 && (
        <div className="rounded-lg p-3 mb-3 text-[12px]"
             style={{ background: 'var(--status-amber-bg)', color: 'var(--status-amber-text)' }}>
          Ancora da rilevare oggi: {puntiMancanti.map(a => a.nome).join(', ')}
        </div>
      )}

      <div className="flex justify-end mb-3">
        <button onClick={() => setAperto(!aperto)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--hotel-amber)' }}>
          <Plus size={12} /> Nuova rilevazione
        </button>
      </div>

      {aperto && (
        <form onSubmit={salva} className="rounded-xl p-4 mb-4 grid grid-cols-2 gap-3"
              style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Apparecchio *</label>
            <select required value={form.apparecchiatura_id}
                    onChange={e => setForm({ ...form, apparecchiatura_id: e.target.value })}
                    className="w-full px-2 rounded-lg text-sm outline-none"
                    style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }}>
              <option value="">Seleziona...</option>
              {apparecchiature.map(a => (
                <option key={a.id} value={a.id}>{a.nome}{a.ubicazione ? ` (${a.ubicazione})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Temperatura (°C) *</label>
            <input type="number" step="0.1" required value={form.valore}
                   onChange={e => setForm({ ...form, valore: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Note</label>
            <input type="text" placeholder="Opzionale" value={form.note}
                   onChange={e => setForm({ ...form, note: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Azione correttiva (se fuori soglia)</label>
            <input type="text" placeholder="Es: prodotto scartato, tecnico chiamato" value={form.azione_correttiva}
                   onChange={e => setForm({ ...form, azione_correttiva: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <button type="submit" disabled={invio}
                  className="col-span-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-amber)' }}>
            {invio ? 'Salvataggio...' : 'Salva'}
          </button>
        </form>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        {letture.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessuna rilevazione per questa data.</p>
        ) : letture.map((l, i) => (
          <div key={l.id} className="px-4 py-3 flex items-center justify-between gap-3"
               style={{ borderBottom: i < letture.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {l.apparecchio_nome || '—'} — {parseFloat(l.valore)}°C
                {l.fuoriSoglia === true && (
                  <span className="ml-2 text-[11px] font-semibold" style={{ color: 'var(--status-red-text)' }}>fuori soglia</span>
                )}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                {l.ora?.slice(0, 5)} · {l.operatore_nome ? `${l.operatore_nome} ${l.operatore_cognome}` : '—'}
                {l.note ? ` · ${l.note}` : ''}{l.azione_correttiva ? ` · Azione: ${l.azione_correttiva}` : ''}
              </p>
            </div>
            <button onClick={() => elimina(l.id)} className="p-1 rounded shrink-0" style={{ color: 'var(--status-red-text)' }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab Scongelamento/cottura ────────────────────────────────────────────
function TabCottura({ data }) {
  const [registrazioni, setRegistrazioni] = useState([]);
  const [piatti, setPiatti] = useState([]);
  const [aperto, setAperto] = useState(false);
  const VUOTO_COTTURA = {
    tipo: 'cottura', prodotto: '', menu_piatto_id: '', metodo: '', temperatura_cuore: '',
    lotto_partita: '', limite_critico: '', tempo_cottura_min: '', azione_correttiva: '', note: '',
  };
  const [form, setForm] = useState(VUOTO_COTTURA);
  const [invio, setInvio] = useState(false);

  const carica = useCallback(async () => {
    try {
      const r = await api.get(`/registro-haccp/cottura?data=${data}`);
      setRegistrazioni(r.data.registrazioni || []);
    } catch {}
  }, [data]);

  useEffect(() => { carica(); }, [carica]);

  // Elenco piatti per il collegamento opzionale — stesso endpoint già usato
  // da /menu, nessuna duplicazione backend. Caricato una sola volta.
  useEffect(() => {
    api.get('/menu/piatti').then(r => setPiatti(r.data.piatti || [])).catch(() => {});
  }, []);

  async function salva(e) {
    e.preventDefault();
    setInvio(true);
    try {
      await api.post('/registro-haccp/cottura', {
        ...form,
        menu_piatto_id: form.menu_piatto_id || null,
        temperatura_cuore: form.temperatura_cuore || null,
        tempo_cottura_min: form.tempo_cottura_min || null,
        data,
      });
      setForm(VUOTO_COTTURA);
      setAperto(false);
      await carica();
    } catch {} finally { setInvio(false); }
  }

  async function elimina(id) {
    if (!confirm('Eliminare questa registrazione?')) return;
    try { await api.delete(`/registro-haccp/cottura/${id}`); await carica(); } catch {}
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setAperto(!aperto)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--hotel-amber)' }}>
          <Plus size={12} /> Nuova registrazione
        </button>
      </div>

      {aperto && (
        <form onSubmit={salva} className="rounded-xl p-4 mb-4 grid grid-cols-2 gap-3"
              style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Tipo *</label>
            <select required value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
                    className="w-full px-2 rounded-lg text-sm outline-none"
                    style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }}>
              <option value="cottura">Cottura</option>
              <option value="scongelamento">Scongelamento</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Temperatura al cuore (°C)</label>
            <input type="number" step="0.1" value={form.temperatura_cuore}
                   onChange={e => setForm({ ...form, temperatura_cuore: e.target.value })}
                   placeholder="Se pertinente"
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Prodotto *</label>
            <input type="text" required value={form.prodotto}
                   onChange={e => setForm({ ...form, prodotto: e.target.value })}
                   placeholder="Es: Filetto di branzino"
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Piatto collegato (opzionale)</label>
            <select value={form.menu_piatto_id} onChange={e => setForm({ ...form, menu_piatto_id: e.target.value })}
                    className="w-full px-2 rounded-lg text-sm outline-none"
                    style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }}>
              <option value="">Nessuno</option>
              {piatti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Metodo</label>
            <input type="text" value={form.metodo}
                   onChange={e => setForm({ ...form, metodo: e.target.value })}
                   placeholder="Es: forno, acqua fredda"
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Lotto/partita</label>
            <input type="text" value={form.lotto_partita}
                   onChange={e => setForm({ ...form, lotto_partita: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Limite critico</label>
            <input type="text" value={form.limite_critico}
                   onChange={e => setForm({ ...form, limite_critico: e.target.value })}
                   placeholder="Es: ≥ +70°C (vedi tabella soglie)"
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Tempo cottura (min)</label>
            <input type="number" step="1" value={form.tempo_cottura_min}
                   onChange={e => setForm({ ...form, tempo_cottura_min: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Azione correttiva</label>
            <input type="text" placeholder="Se fuori dal limite critico" value={form.azione_correttiva}
                   onChange={e => setForm({ ...form, azione_correttiva: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Note</label>
            <input type="text" placeholder="Opzionale" value={form.note}
                   onChange={e => setForm({ ...form, note: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <button type="submit" disabled={invio}
                  className="col-span-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-amber)' }}>
            {invio ? 'Salvataggio...' : 'Salva'}
          </button>
        </form>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        {registrazioni.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessuna registrazione per questa data.</p>
        ) : registrazioni.map((r, i) => (
          <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3"
               style={{ borderBottom: i < registrazioni.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {r.tipo === 'cottura' ? 'Cottura' : 'Scongelamento'} — {r.prodotto}
                {r.piatto_nome ? ` (${r.piatto_nome})` : ''}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                {r.ora?.slice(0, 5)}
                {r.temperatura_cuore ? ` · ${parseFloat(r.temperatura_cuore)}°C al cuore` : ''}
                {r.limite_critico ? ` · limite ${r.limite_critico}` : ''}
                {r.metodo ? ` · ${r.metodo}` : ''}
                {' · '}{r.nome ? `${r.nome} ${r.cognome}` : '—'}
                {r.azione_correttiva ? ` · Azione: ${r.azione_correttiva}` : ''}
                {r.note ? ` · ${r.note}` : ''}
              </p>
            </div>
            <button onClick={() => elimina(r.id)} className="p-1 rounded shrink-0" style={{ color: 'var(--status-red-text)' }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab Ricevimento merci (A.1, sessione 2, 16/08/2026) ─────────────────────
// "esito" è una valutazione manuale dell'operatore (conforme/non conforme):
// il template non distingue prodotti refrigerati da congelati, quindi niente
// fuori-soglia automatico — stesso principio già usato per la cottura.
function TabRicevimento({ data }) {
  const [ricevimenti, setRicevimenti] = useState([]);
  const [aperto, setAperto] = useState(false);
  const VUOTO = {
    fornitore: '', prodotto: '', lotto: '', scadenza_tmc: '', quantita: '',
    unita_misura: '', temp_ricevimento: '', integrita_confezione: '',
    esito: 'conforme', azione_correttiva: '', note: '',
  };
  const [form, setForm] = useState(VUOTO);
  const [invio, setInvio] = useState(false);

  const carica = useCallback(async () => {
    try {
      const r = await api.get(`/registro-haccp/ricevimento?data=${data}`);
      setRicevimenti(r.data.ricevimenti || []);
    } catch {}
  }, [data]);

  useEffect(() => { carica(); }, [carica]);

  async function salva(e) {
    e.preventDefault();
    setInvio(true);
    try {
      await api.post('/registro-haccp/ricevimento', {
        ...form,
        scadenza_tmc: form.scadenza_tmc || null,
        quantita: form.quantita || null,
        temp_ricevimento: form.temp_ricevimento === '' ? null : form.temp_ricevimento,
        integrita_confezione: form.integrita_confezione || null,
        data,
      });
      setForm(VUOTO);
      setAperto(false);
      await carica();
    } catch {} finally { setInvio(false); }
  }

  async function elimina(id) {
    if (!confirm('Eliminare questa registrazione?')) return;
    try { await api.delete(`/registro-haccp/ricevimento/${id}`); await carica(); } catch {}
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setAperto(!aperto)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--hotel-amber)' }}>
          <Plus size={12} /> Nuovo ricevimento
        </button>
      </div>

      {aperto && (
        <form onSubmit={salva} className="rounded-xl p-4 mb-4 grid grid-cols-2 gap-3"
              style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Fornitore *</label>
            <input type="text" required value={form.fornitore}
                   onChange={e => setForm({ ...form, fornitore: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Prodotto *</label>
            <input type="text" required value={form.prodotto}
                   onChange={e => setForm({ ...form, prodotto: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Lotto</label>
            <input type="text" value={form.lotto}
                   onChange={e => setForm({ ...form, lotto: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Scadenza (TMC)</label>
            <CampoData value={form.scadenza_tmc} onChange={v => setForm({ ...form, scadenza_tmc: v })}
                   className="w-full px-2"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Quantità</label>
            <input type="number" step="0.01" value={form.quantita}
                   onChange={e => setForm({ ...form, quantita: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Unità di misura</label>
            <input type="text" placeholder="Es: kg, pz, cartone" value={form.unita_misura}
                   onChange={e => setForm({ ...form, unita_misura: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Temperatura al ricevimento (°C)</label>
            <input type="number" step="0.1" placeholder="Se pertinente" value={form.temp_ricevimento}
                   onChange={e => setForm({ ...form, temp_ricevimento: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Integrità confezione</label>
            <select value={form.integrita_confezione}
                    onChange={e => setForm({ ...form, integrita_confezione: e.target.value })}
                    className="w-full px-2 rounded-lg text-sm outline-none"
                    style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }}>
              <option value="">Non rilevante</option>
              <option value="integra">Integra</option>
              <option value="danneggiata">Danneggiata</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Esito *</label>
            <select required value={form.esito}
                    onChange={e => setForm({ ...form, esito: e.target.value })}
                    className="w-full px-2 rounded-lg text-sm outline-none"
                    style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }}>
              <option value="conforme">Conforme</option>
              <option value="non_conforme">Non conforme</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Azione correttiva</label>
            <input type="text" placeholder="Se non conforme" value={form.azione_correttiva}
                   onChange={e => setForm({ ...form, azione_correttiva: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Note</label>
            <input type="text" placeholder="Opzionale" value={form.note}
                   onChange={e => setForm({ ...form, note: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <button type="submit" disabled={invio}
                  className="col-span-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-amber)' }}>
            {invio ? 'Salvataggio...' : 'Salva'}
          </button>
        </form>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        {ricevimenti.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessun ricevimento per questa data.</p>
        ) : ricevimenti.map((r, i) => (
          <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3"
               style={{ borderBottom: i < ricevimenti.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {r.prodotto} — {r.fornitore}
                {r.esito === 'non_conforme' && (
                  <span className="ml-2 text-[11px] font-semibold" style={{ color: 'var(--status-red-text)' }}>non conforme</span>
                )}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                {r.lotto ? `Lotto ${r.lotto} · ` : ''}
                {r.temp_ricevimento !== null ? `${parseFloat(r.temp_ricevimento)}°C · ` : ''}
                {r.quantita ? `${parseFloat(r.quantita)}${r.unita_misura ? ` ${r.unita_misura}` : ''} · ` : ''}
                {r.operatore_nome ? `${r.operatore_nome} ${r.operatore_cognome}` : '—'}
                {r.azione_correttiva ? ` · Azione: ${r.azione_correttiva}` : ''}
                {r.note ? ` · ${r.note}` : ''}
              </p>
            </div>
            <button onClick={() => elimina(r.id)} className="p-1 rounded shrink-0" style={{ color: 'var(--status-red-text)' }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab Buffet (A.4, sessione 2, 16/08/2026) ─────────────────────────────────
// Soglie: freddo ≤ +5°C, caldo ≥ +60°C (CSV soglie 16/08/2026) — stesso
// principio di frigo/freezer, calcolate lato server (fuoriSogliaBuffet).
function TabBuffet({ data }) {
  const [rilevazioni, setRilevazioni] = useState([]);
  const [aperto, setAperto] = useState(false);
  const VUOTO = { tipologia_buffet: 'freddo', prodotto_vaschetta: '', temp_rilevata: '', azione_correttiva: '', note: '' };
  const [form, setForm] = useState(VUOTO);
  const [invio, setInvio] = useState(false);

  const carica = useCallback(async () => {
    try {
      const r = await api.get(`/registro-haccp/buffet?data=${data}`);
      setRilevazioni(r.data.rilevazioni || []);
    } catch {}
  }, [data]);

  useEffect(() => { carica(); }, [carica]);

  async function salva(e) {
    e.preventDefault();
    setInvio(true);
    try {
      await api.post('/registro-haccp/buffet', { ...form, data });
      setForm(VUOTO);
      setAperto(false);
      await carica();
    } catch {} finally { setInvio(false); }
  }

  async function elimina(id) {
    if (!confirm('Eliminare questa rilevazione?')) return;
    try { await api.delete(`/registro-haccp/buffet/${id}`); await carica(); } catch {}
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setAperto(!aperto)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--hotel-amber)' }}>
          <Plus size={12} /> Nuova rilevazione
        </button>
      </div>

      {aperto && (
        <form onSubmit={salva} className="rounded-xl p-4 mb-4 grid grid-cols-2 gap-3"
              style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Tipologia *</label>
            <select required value={form.tipologia_buffet}
                    onChange={e => setForm({ ...form, tipologia_buffet: e.target.value })}
                    className="w-full px-2 rounded-lg text-sm outline-none"
                    style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }}>
              <option value="freddo">Buffet freddo (≤ 5°C)</option>
              <option value="caldo">Buffet caldo (≥ 60°C)</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Temperatura rilevata (°C) *</label>
            <input type="number" step="0.1" required value={form.temp_rilevata}
                   onChange={e => setForm({ ...form, temp_rilevata: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Prodotto / vaschetta *</label>
            <input type="text" required value={form.prodotto_vaschetta}
                   onChange={e => setForm({ ...form, prodotto_vaschetta: e.target.value })}
                   placeholder="Es: Yogurt, uova strapazzate"
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Azione correttiva (se fuori soglia)</label>
            <input type="text" value={form.azione_correttiva}
                   onChange={e => setForm({ ...form, azione_correttiva: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Note</label>
            <input type="text" placeholder="Opzionale" value={form.note}
                   onChange={e => setForm({ ...form, note: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <button type="submit" disabled={invio}
                  className="col-span-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-amber)' }}>
            {invio ? 'Salvataggio...' : 'Salva'}
          </button>
        </form>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        {rilevazioni.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessuna rilevazione per questa data.</p>
        ) : rilevazioni.map((r, i) => (
          <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3"
               style={{ borderBottom: i < rilevazioni.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {r.prodotto_vaschetta} — {parseFloat(r.temp_rilevata)}°C ({r.tipologia_buffet === 'freddo' ? 'freddo' : 'caldo'})
                {r.fuoriSoglia === true && (
                  <span className="ml-2 text-[11px] font-semibold" style={{ color: 'var(--status-red-text)' }}>fuori soglia</span>
                )}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                {r.ora?.slice(0, 5)} · {r.operatore_nome ? `${r.operatore_nome} ${r.operatore_cognome}` : '—'}
                {r.azione_correttiva ? ` · Azione: ${r.azione_correttiva}` : ''}{r.note ? ` · ${r.note}` : ''}
              </p>
            </div>
            <button onClick={() => elimina(r.id)} className="p-1 rounded shrink-0" style={{ color: 'var(--status-red-text)' }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab Pulizie (A.5, sessione 4, 16/08/2026) ───────────────────────────────
// Stessi endpoint di /hr/haccp già usati dalla pagina storica /checklist
// (nessuna tabella nuova) — qui arricchiti con i campi del template
// (prodotto usato, dosaggio, tempo di contatto, firma responsabile, ora)
// aggiunti in migration 045. Il salvataggio resta "tutta la checklist del
// giorno in un colpo solo" (DELETE+INSERT), stesso comportamento di sempre.
function TabPulizie({ data }) {
  const [voci, setVoci] = useState([]);
  const [esistente, setEsistente] = useState(false);
  const [caricamento, setCaricamento] = useState(true);
  const [invio, setInvio] = useState(false);
  const [salvato, setSalvato] = useState(false);

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const r = await api.get(`/hr/haccp?data=${data}`);
      setVoci((r.data.checklist || []).map(v => ({ ...v })));
      setEsistente(r.data.esistente);
    } catch {} finally { setCaricamento(false); }
  }, [data]);

  useEffect(() => { carica(); }, [carica]);

  function aggiorna(i, campo, valore) {
    setVoci(prev => prev.map((v, idx) => idx === i ? { ...v, [campo]: valore } : v));
  }

  async function salva() {
    setInvio(true);
    try {
      await api.post('/hr/haccp', { data, voci });
      setSalvato(true);
      setEsistente(true);
      setTimeout(() => setSalvato(false), 3000);
    } catch {} finally { setInvio(false); }
  }

  const completate = voci.filter(v => v.completata).length;

  if (caricamento) return <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
          {completate}/{voci.length} completate {esistente && '· già compilata oggi'}
        </span>
        <button onClick={salva} disabled={invio}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                style={{ background: 'var(--hotel-amber)' }}>
          {invio ? 'Salvataggio...' : 'Salva checklist'}
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        {voci.map((v, i) => (
          <div key={v.attrezzatura} className="px-4 py-3 flex flex-col gap-2"
               style={{ borderBottom: i < voci.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
            <div className="flex items-center gap-3">
              <button onClick={() => aggiorna(i, 'completata', !v.completata)} className="shrink-0"
                      style={{ color: v.completata ? '#16a34a' : 'var(--muted-foreground)' }}>
                {v.completata ? <CheckSquare size={18} /> : <Square size={18} />}
              </button>
              <span className="text-sm flex-1"
                    style={{ color: v.completata ? 'var(--muted-foreground)' : 'var(--foreground)', textDecoration: v.completata ? 'line-through' : 'none' }}>
                {v.attrezzatura}
              </span>
            </div>
            {v.completata && (
              <div className="ml-8 grid grid-cols-2 gap-2">
                <input type="text" placeholder="Prodotto usato" value={v.prodotto_utilizzato || ''}
                       onChange={e => aggiorna(i, 'prodotto_utilizzato', e.target.value)}
                       className="text-xs px-2 py-1 rounded outline-none"
                       style={{ border: '0.5px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
                <input type="text" placeholder="Dosaggio" value={v.dosaggio || ''}
                       onChange={e => aggiorna(i, 'dosaggio', e.target.value)}
                       className="text-xs px-2 py-1 rounded outline-none"
                       style={{ border: '0.5px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
                <input type="number" step="1" placeholder="Tempo contatto (min)" value={v.tempo_contatto_min || ''}
                       onChange={e => aggiorna(i, 'tempo_contatto_min', e.target.value)}
                       className="text-xs px-2 py-1 rounded outline-none"
                       style={{ border: '0.5px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
                <input type="text" placeholder="Firma responsabile" value={v.firma_responsabile || ''}
                       onChange={e => aggiorna(i, 'firma_responsabile', e.target.value)}
                       className="text-xs px-2 py-1 rounded outline-none"
                       style={{ border: '0.5px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
                <input type="text" placeholder="Note (opzionale)" value={v.note || ''}
                       onChange={e => aggiorna(i, 'note', e.target.value)}
                       className="col-span-2 text-xs px-2 py-1 rounded outline-none"
                       style={{ border: '0.5px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {salvato && (
        <p className="text-[13px] text-center mt-3" style={{ color: 'var(--status-green-text)' }}>
          Checklist pulizie salvata con successo.
        </p>
      )}
    </div>
  );
}

// ── Tab Manutenzioni (A.6, sessione 3, 16/08/2026) ──────────────────────────
// "Attrezzatura"/"ubicazione" arrivano dall'anagrafica condivisa con A.2
// (GET /registro-haccp/apparecchiature, tutti i tipi attivi, non solo
// frigo/freezer come nel tab Temperature).
function TabManutenzioni({ data }) {
  const [manutenzioni, setManutenzioni] = useState([]);
  const [apparecchiature, setApparecchiature] = useState([]);
  const [aperto, setAperto] = useState(false);
  const VUOTO = {
    apparecchiatura_id: '', tipo_intervento: '', descrizione_intervento: '',
    ditta_operatore: '', pezzi_sostituiti: '', esito: 'eseguita',
    prossima_manutenzione: '', firma_responsabile: '', note: '',
  };
  const [form, setForm] = useState(VUOTO);
  const [invio, setInvio] = useState(false);

  const carica = useCallback(async () => {
    try {
      const r = await api.get(`/registro-haccp/manutenzioni?data=${data}`);
      setManutenzioni(r.data.manutenzioni || []);
    } catch {}
  }, [data]);

  useEffect(() => { carica(); }, [carica]);

  useEffect(() => {
    api.get('/registro-haccp/apparecchiature').then(r => setApparecchiature(r.data.apparecchiature || [])).catch(() => {});
  }, []);

  async function salva(e) {
    e.preventDefault();
    setInvio(true);
    try {
      await api.post('/registro-haccp/manutenzioni', {
        ...form,
        prossima_manutenzione: form.prossima_manutenzione || null,
        data,
      });
      setForm(VUOTO);
      setAperto(false);
      await carica();
    } catch {} finally { setInvio(false); }
  }

  async function elimina(id) {
    if (!confirm('Eliminare questa registrazione?')) return;
    try { await api.delete(`/registro-haccp/manutenzioni/${id}`); await carica(); } catch {}
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setAperto(!aperto)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--hotel-amber)' }}>
          <Plus size={12} /> Nuovo intervento
        </button>
      </div>

      {aperto && (
        <form onSubmit={salva} className="rounded-xl p-4 mb-4 grid grid-cols-2 gap-3"
              style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Apparecchiatura *</label>
            <select required value={form.apparecchiatura_id}
                    onChange={e => setForm({ ...form, apparecchiatura_id: e.target.value })}
                    className="w-full px-2 rounded-lg text-sm outline-none"
                    style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }}>
              <option value="">Seleziona...</option>
              {apparecchiature.map(a => (
                <option key={a.id} value={a.id}>{a.nome}{a.ubicazione ? ` (${a.ubicazione})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Tipo intervento</label>
            <input type="text" placeholder="Es: ordinaria, riparazione" value={form.tipo_intervento}
                   onChange={e => setForm({ ...form, tipo_intervento: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Ditta/operatore</label>
            <input type="text" value={form.ditta_operatore}
                   onChange={e => setForm({ ...form, ditta_operatore: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Descrizione intervento</label>
            <input type="text" value={form.descrizione_intervento}
                   onChange={e => setForm({ ...form, descrizione_intervento: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Pezzi sostituiti</label>
            <input type="text" value={form.pezzi_sostituiti}
                   onChange={e => setForm({ ...form, pezzi_sostituiti: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Esito *</label>
            <select required value={form.esito}
                    onChange={e => setForm({ ...form, esito: e.target.value })}
                    className="w-full px-2 rounded-lg text-sm outline-none"
                    style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }}>
              <option value="eseguita">Eseguita</option>
              <option value="non_eseguita">Non eseguita</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Prossima manutenzione</label>
            <CampoData value={form.prossima_manutenzione} onChange={v => setForm({ ...form, prossima_manutenzione: v })}
                   className="w-full px-2"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Firma responsabile</label>
            <input type="text" value={form.firma_responsabile}
                   onChange={e => setForm({ ...form, firma_responsabile: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Note</label>
            <input type="text" placeholder="Opzionale" value={form.note}
                   onChange={e => setForm({ ...form, note: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <button type="submit" disabled={invio}
                  className="col-span-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-amber)' }}>
            {invio ? 'Salvataggio...' : 'Salva'}
          </button>
        </form>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        {manutenzioni.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessun intervento per questa data.</p>
        ) : manutenzioni.map((m, i) => (
          <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3"
               style={{ borderBottom: i < manutenzioni.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {m.apparecchio_nome || '—'}{m.tipo_intervento ? ` — ${m.tipo_intervento}` : ''}
                {m.esito === 'non_eseguita' && (
                  <span className="ml-2 text-[11px] font-semibold" style={{ color: 'var(--status-red-text)' }}>non eseguita</span>
                )}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                {m.ditta_operatore ? `${m.ditta_operatore} · ` : ''}
                {m.operatore_nome ? `${m.operatore_nome} ${m.operatore_cognome}` : '—'}
                {m.prossima_manutenzione ? ` · Prossima: ${m.prossima_manutenzione}` : ''}
                {m.note ? ` · ${m.note}` : ''}
              </p>
            </div>
            <button onClick={() => elimina(m.id)} className="p-1 rounded shrink-0" style={{ color: 'var(--status-red-text)' }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab Formazione (A.7, sessione 3, 16/08/2026) ────────────────────────────
function TabFormazione({ data }) {
  const [formazioni, setFormazioni] = useState([]);
  const [aperto, setAperto] = useState(false);
  const VUOTO = {
    nome_cognome: '', qualifica_ruolo: '', titolo_corso: '', durata_ore: '',
    contenuti: '', docente_ente: '', attestato: false, numero_attestato: '',
    firma_partecipante: false, note: '',
  };
  const [form, setForm] = useState(VUOTO);
  const [invio, setInvio] = useState(false);

  const carica = useCallback(async () => {
    try {
      const r = await api.get(`/registro-haccp/formazione?data=${data}`);
      setFormazioni(r.data.formazioni || []);
    } catch {}
  }, [data]);

  useEffect(() => { carica(); }, [carica]);

  async function salva(e) {
    e.preventDefault();
    setInvio(true);
    try {
      await api.post('/registro-haccp/formazione', { ...form, durata_ore: form.durata_ore || null, data });
      setForm(VUOTO);
      setAperto(false);
      await carica();
    } catch {} finally { setInvio(false); }
  }

  async function elimina(id) {
    if (!confirm('Eliminare questa registrazione?')) return;
    try { await api.delete(`/registro-haccp/formazione/${id}`); await carica(); } catch {}
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setAperto(!aperto)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--hotel-amber)' }}>
          <Plus size={12} /> Nuova formazione
        </button>
      </div>

      {aperto && (
        <form onSubmit={salva} className="rounded-xl p-4 mb-4 grid grid-cols-2 gap-3"
              style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Nome e cognome *</label>
            <input type="text" required value={form.nome_cognome}
                   onChange={e => setForm({ ...form, nome_cognome: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Qualifica/ruolo</label>
            <input type="text" value={form.qualifica_ruolo}
                   onChange={e => setForm({ ...form, qualifica_ruolo: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Titolo corso *</label>
            <input type="text" required value={form.titolo_corso}
                   onChange={e => setForm({ ...form, titolo_corso: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Durata (ore)</label>
            <input type="number" step="0.5" value={form.durata_ore}
                   onChange={e => setForm({ ...form, durata_ore: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Docente/ente</label>
            <input type="text" value={form.docente_ente}
                   onChange={e => setForm({ ...form, docente_ente: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Contenuti</label>
            <input type="text" value={form.contenuti}
                   onChange={e => setForm({ ...form, contenuti: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Numero attestato</label>
            <input type="text" value={form.numero_attestato}
                   onChange={e => setForm({ ...form, numero_attestato: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="flex items-end gap-4 pb-1">
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--foreground)' }}>
              <input type="checkbox" checked={form.attestato}
                     onChange={e => setForm({ ...form, attestato: e.target.checked })} />
              Attestato rilasciato
            </label>
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--foreground)' }}>
              <input type="checkbox" checked={form.firma_partecipante}
                     onChange={e => setForm({ ...form, firma_partecipante: e.target.checked })} />
              Firma partecipante
            </label>
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Note</label>
            <input type="text" placeholder="Opzionale" value={form.note}
                   onChange={e => setForm({ ...form, note: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <button type="submit" disabled={invio}
                  className="col-span-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-amber)' }}>
            {invio ? 'Salvataggio...' : 'Salva'}
          </button>
        </form>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        {formazioni.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessuna formazione per questa data.</p>
        ) : formazioni.map((f, i) => (
          <div key={f.id} className="px-4 py-3 flex items-center justify-between gap-3"
               style={{ borderBottom: i < formazioni.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {f.nome_cognome} — {f.titolo_corso}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                {f.qualifica_ruolo ? `${f.qualifica_ruolo} · ` : ''}
                {f.durata_ore ? `${parseFloat(f.durata_ore)}h · ` : ''}
                {f.attestato ? 'Attestato rilasciato' : 'Senza attestato'}
                {f.note ? ` · ${f.note}` : ''}
              </p>
            </div>
            <button onClick={() => elimina(f.id)} className="p-1 rounded shrink-0" style={{ color: 'var(--status-red-text)' }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab Infestanti (A.8, sessione 3, 16/08/2026) ────────────────────────────
function TabInfestanti({ data }) {
  const [controlli, setControlli] = useState([]);
  const [aperto, setAperto] = useState(false);
  const VUOTO = {
    tipo_controllo: '', punti_controllati: '', esito: 'nessuna_traccia',
    azioni_effettuate: '', prossimo_controllo: '', firma_responsabile: '', note: '',
  };
  const [form, setForm] = useState(VUOTO);
  const [invio, setInvio] = useState(false);

  const carica = useCallback(async () => {
    try {
      const r = await api.get(`/registro-haccp/infestanti?data=${data}`);
      setControlli(r.data.controlli || []);
    } catch {}
  }, [data]);

  useEffect(() => { carica(); }, [carica]);

  async function salva(e) {
    e.preventDefault();
    setInvio(true);
    try {
      await api.post('/registro-haccp/infestanti', {
        ...form, prossimo_controllo: form.prossimo_controllo || null, data,
      });
      setForm(VUOTO);
      setAperto(false);
      await carica();
    } catch {} finally { setInvio(false); }
  }

  async function elimina(id) {
    if (!confirm('Eliminare questa registrazione?')) return;
    try { await api.delete(`/registro-haccp/infestanti/${id}`); await carica(); } catch {}
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setAperto(!aperto)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--hotel-amber)' }}>
          <Plus size={12} /> Nuovo controllo
        </button>
      </div>

      {aperto && (
        <form onSubmit={salva} className="rounded-xl p-4 mb-4 grid grid-cols-2 gap-3"
              style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Tipo controllo</label>
            <input type="text" placeholder="Es: ispezione visiva, trappole" value={form.tipo_controllo}
                   onChange={e => setForm({ ...form, tipo_controllo: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Esito *</label>
            <select required value={form.esito}
                    onChange={e => setForm({ ...form, esito: e.target.value })}
                    className="w-full px-2 rounded-lg text-sm outline-none"
                    style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }}>
              <option value="nessuna_traccia">Nessuna traccia</option>
              <option value="presenza_rilevata">Presenza rilevata</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Punti controllati</label>
            <input type="text" placeholder="Es: cucina, magazzino, zona rifiuti" value={form.punti_controllati}
                   onChange={e => setForm({ ...form, punti_controllati: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Azioni effettuate</label>
            <input type="text" placeholder="Se presenza rilevata" value={form.azioni_effettuate}
                   onChange={e => setForm({ ...form, azioni_effettuate: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Prossimo controllo</label>
            <CampoData value={form.prossimo_controllo} onChange={v => setForm({ ...form, prossimo_controllo: v })}
                   className="w-full px-2"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Firma responsabile</label>
            <input type="text" placeholder="Es: ditta esterna" value={form.firma_responsabile}
                   onChange={e => setForm({ ...form, firma_responsabile: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Note</label>
            <input type="text" placeholder="Opzionale" value={form.note}
                   onChange={e => setForm({ ...form, note: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <button type="submit" disabled={invio}
                  className="col-span-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-amber)' }}>
            {invio ? 'Salvataggio...' : 'Salva'}
          </button>
        </form>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        {controlli.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessun controllo per questa data.</p>
        ) : controlli.map((c, i) => (
          <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3"
               style={{ borderBottom: i < controlli.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {c.tipo_controllo || 'Controllo'}
                {c.esito === 'presenza_rilevata' && (
                  <span className="ml-2 text-[11px] font-semibold" style={{ color: 'var(--status-red-text)' }}>presenza rilevata</span>
                )}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                {c.punti_controllati ? `${c.punti_controllati} · ` : ''}
                {c.operatore_nome ? `${c.operatore_nome} ${c.operatore_cognome}` : '—'}
                {c.azioni_effettuate ? ` · Azioni: ${c.azioni_effettuate}` : ''}
                {c.note ? ` · ${c.note}` : ''}
              </p>
            </div>
            <button onClick={() => elimina(c.id)} className="p-1 rounded shrink-0" style={{ color: 'var(--status-red-text)' }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
