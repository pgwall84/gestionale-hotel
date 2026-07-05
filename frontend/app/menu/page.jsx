'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { Plus, Trash2, X, ChevronUp, ChevronDown, Pencil, Upload, ToggleLeft, ToggleRight, QrCode, Download } from 'lucide-react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';

const ALLERGENI_LISTA = [
  'glutine','crostacei','uova','pesce','arachidi','soia',
  'latte','frutta a guscio','sedano','senape','sesamo',
  'anidride solforosa','lupini','molluschi','vegano','vegetariano',
];

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';
const IMG_BASE = BASE_URL.replace('/api', '');

// ── Helpers ───────────────────────────────────────────────────────────────────

function Badge({ label, color = 'default' }) {
  const stili = {
    default: { background: 'var(--muted)', color: 'var(--muted-foreground)' },
    green:   { background: 'var(--status-green-bg)', color: 'var(--status-green-text)' },
    red:     { background: 'var(--status-red-bg)', color: 'var(--status-red-text)' },
  };
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={stili[color] || stili.default}>
      {label}
    </span>
  );
}

// ── Modal categoria ────────────────────────────────────────────────────────────
function ModalCategoria({ cat, onSalva, onChiudi }) {
  const [form, setForm] = useState({ titolo: cat?.titolo || '', ordine: cat?.ordine ?? 0, emoji: cat?.emoji || '' });
  const [inv, setInv] = useState(false);

  async function salva(e) {
    e.preventDefault();
    setInv(true);
    try {
      if (cat) await api.put(`/menu/categorie/${cat.id}`, form);
      else await api.post('/menu/categorie', form);
      onSalva();
    } catch {} finally { setInv(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onChiudi}>
      <div className="rounded-2xl w-full max-w-sm" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 pb-3" style={{ borderBottom: '0.5px solid var(--border)' }}>
          <p className="font-semibold text-sm">{cat ? 'Modifica categoria' : 'Nuova categoria'}</p>
          <button onClick={onChiudi}><X size={16} /></button>
        </div>
        <form onSubmit={salva} className="p-5 flex flex-col gap-3">
          <input required placeholder="Nome categoria (es. Primi Piatti)" value={form.titolo}
                 onChange={e => setForm({ ...form, titolo: e.target.value })}
                 className="w-full px-3 rounded-lg text-sm outline-none"
                 style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--background)' }} />
          <div className="flex gap-3 items-end">
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Emoji categoria</label>
              <input type="text" placeholder="🍽️" value={form.emoji}
                     onChange={e => setForm({ ...form, emoji: e.target.value })}
                     className="px-3 rounded-lg text-lg outline-none text-center"
                     style={{ width: 80, height: '36px', border: '0.5px solid var(--border)', background: 'var(--background)' }} />
            </div>
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Ordine</label>
              <input type="number" value={form.ordine} onChange={e => setForm({ ...form, ordine: Number(e.target.value) })}
                     className="w-24 px-3 rounded-lg text-sm outline-none"
                     style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--background)' }} />
            </div>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--muted-foreground)', marginTop: -8 }}>
            Inserisci una emoji per identificare la categoria nella vista cameriere
          </p>
          <button type="submit" disabled={inv} className="py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-navy)' }}>
            {inv ? 'Salvataggio...' : 'Salva'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Modal piatto ───────────────────────────────────────────────────────────────
function ModalPiatto({ piatto, categorie, onSalva, onChiudi }) {
  const [form, setForm] = useState({
    categoria_id: piatto?.categoria_id || categorie[0]?.id || '',
    nome: piatto?.nome || '',
    descrizione: piatto?.descrizione || '',
    prezzo: piatto?.prezzo || '',
    allergeni: piatto?.allergeni || [],
    ordine: piatto?.ordine ?? 0,
  });
  const [file, setFile] = useState(null);
  const [inv, setInv] = useState(false);
  const fileRef = useRef(null);

  function toggleAllergene(a) {
    setForm(f => ({ ...f, allergeni: f.allergeni.includes(a) ? f.allergeni.filter(x => x !== a) : [...f.allergeni, a] }));
  }

  async function salva(e) {
    e.preventDefault();
    setInv(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'allergeni') fd.append(k, JSON.stringify(v));
        else fd.append(k, v);
      });
      if (file) fd.append('immagine', file);
      if (piatto) await api.put(`/menu/piatti/${piatto.id}`, fd);
      else await api.post('/menu/piatti', fd);
      onSalva();
    } catch {} finally { setInv(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onChiudi}>
      <div className="rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 pb-3" style={{ borderBottom: '0.5px solid var(--border)' }}>
          <p className="font-semibold text-sm">{piatto ? 'Modifica piatto' : 'Nuovo piatto'}</p>
          <button onClick={onChiudi}><X size={16} /></button>
        </div>
        <form onSubmit={salva} className="p-5 flex flex-col gap-3 overflow-y-auto">
          <select required value={form.categoria_id} onChange={e => setForm({ ...form, categoria_id: e.target.value })}
                  className="w-full px-3 rounded-lg text-sm outline-none"
                  style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--background)' }}>
            {categorie.map(c => <option key={c.id} value={c.id}>{c.titolo}</option>)}
          </select>
          <input required placeholder="Nome piatto" value={form.nome}
                 onChange={e => setForm({ ...form, nome: e.target.value })}
                 className="w-full px-3 rounded-lg text-sm outline-none"
                 style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--background)' }} />
          <textarea placeholder="Descrizione, ingredienti, provenienza..." value={form.descrizione}
                    onChange={e => setForm({ ...form, descrizione: e.target.value })} rows={3}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                    style={{ border: '0.5px solid var(--border)', background: 'var(--background)' }} />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Prezzo €</label>
              <input type="number" step="0.01" placeholder="0.00" value={form.prezzo}
                     onChange={e => setForm({ ...form, prezzo: e.target.value })}
                     className="w-full px-3 rounded-lg text-sm outline-none"
                     style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--background)' }} />
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Ordine</label>
              <input type="number" value={form.ordine} onChange={e => setForm({ ...form, ordine: Number(e.target.value) })}
                     className="w-full px-3 rounded-lg text-sm outline-none"
                     style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--background)' }} />
            </div>
          </div>

          {/* Allergeni */}
          <div>
            <label className="text-[11px] font-medium mb-2 block" style={{ color: 'var(--muted-foreground)' }}>Allergeni / Caratteristiche</label>
            <div className="flex flex-wrap gap-1.5">
              {ALLERGENI_LISTA.map(a => {
                const sel = form.allergeni.includes(a);
                return (
                  <button key={a} type="button" onClick={() => toggleAllergene(a)}
                          className="text-[11px] px-2 py-1 rounded-md capitalize"
                          style={{ background: sel ? 'var(--hotel-amber)' : 'var(--muted)', color: sel ? '#fff' : 'var(--muted-foreground)', fontWeight: sel ? 600 : 400 }}>
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Immagine */}
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Immagine (opzionale)</label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => setFile(e.target.files[0])} />
            <button type="button" onClick={() => fileRef.current?.click()}
                    className="w-full py-2 rounded-lg text-sm px-3 text-left"
                    style={{ border: '0.5px dashed var(--border)', color: file ? 'var(--foreground)' : 'var(--muted-foreground)', background: 'var(--background)' }}>
              {file ? `📷 ${file.name}` : piatto?.immagine_url ? '📷 Immagine caricata — clicca per cambiare' : '📷 Clicca per aggiungere una foto'}
            </button>
          </div>

          <button type="submit" disabled={inv} className="py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-navy)' }}>
            {inv ? 'Salvataggio...' : 'Salva piatto'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Pannello QR + logo + stampa ───────────────────────────────────────────────
function PannelloQr({ urlPubblico, isTitolare, imgBase }) {
  const [logoUrl, setLogoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const logoRef = useRef(null);
  const canvasRef = useRef(null);
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';

  useEffect(() => {
    fetch(`${BASE_URL}/menu/logo`).then(r => {
      if (r.ok) setLogoUrl(`${BASE_URL}/menu/logo?t=${Date.now()}`);
    }).catch(() => {});
  }, []);

  async function caricaLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const Cookies = (await import('js-cookie')).default;
      const token = Cookies.get('token');
      const fd = new FormData();
      fd.append('logo', file);
      const r = await fetch(`${BASE_URL}/menu/logo`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (r.ok) setLogoUrl(`${BASE_URL}/menu/logo?t=${Date.now()}`);
    } catch {} finally { setUploading(false); }
  }

  function getQrPng() {
    const canvas = canvasRef.current?.querySelector('canvas');
    return canvas ? canvas.toDataURL('image/png') : null;
  }

  function scaricaSvg() {
    const png = getQrPng();
    if (!png) return;
    // Converte PNG in download diretto
    const a = document.createElement('a');
    a.href = png;
    a.download = 'menu-qrcode.png';
    a.click();
  }

  async function logoBase64() {
    try {
      const r = await fetch(`${BASE_URL}/menu/logo`);
      if (!r.ok) return null;
      const blob = await r.blob();
      return await new Promise(res => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  async function scaricaPdfQr() {
    const png = getQrPng();
    if (!png) return;
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a5' });
    const pw = pdf.internal.pageSize.getWidth();
    let y = 10;

    // Logo — caricato direttamente come base64, proporzioni preservate
    if (logoUrl) {
      const b64 = await logoBase64();
      if (b64) {
        const logoImg = document.querySelector('#qr-logo-img');
        const nw = logoImg?.naturalWidth || 200;
        const nh = logoImg?.naturalHeight || 80;
        const maxW = 60; const maxH = 25;
        const ratio = Math.min(maxW / nw, maxH / nh);
        const w = nw * ratio; const h = nh * ratio;
        const fmt = b64.includes('image/png') ? 'PNG' : b64.includes('image/svg') ? 'SVG' : 'JPEG';
        try { pdf.addImage(b64, fmt, pw/2 - w/2, y, w, h); } catch {}
        y += h + 6;
      }
    }

    // Titolo
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15); pdf.setTextColor(27, 58, 92);
    pdf.text('Hotel del Golfo', pw / 2, y + 8, { align: 'center' });
    pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100);
    pdf.text('Scannerizza per vedere il menu', pw / 2, y + 16, { align: 'center' });
    y += 22;

    // QR
    pdf.addImage(png, 'PNG', pw/2 - 32, y, 64, 64);
    y += 70;

    // URL
    pdf.setFontSize(8); pdf.setTextColor(150);
    pdf.text(urlPubblico, pw / 2, y, { align: 'center' });
    pdf.save('menu-qrcode.pdf');
  }

  return (
    <div className="mb-5 p-5 rounded-xl flex flex-col sm:flex-row items-start gap-5" style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
      <div className="flex flex-col items-center gap-3 flex-shrink-0">
        <div className="p-3 rounded-xl bg-white">
          <QRCodeSVG value={urlPubblico} size={140} fgColor="#1B3A5C" />
        </div>
        {/* Canvas nascosto per generare PNG */}
        <div ref={canvasRef} style={{ display: 'none' }}>
          <QRCodeCanvas value={urlPubblico} size={400} fgColor="#1B3A5C" />
        </div>
        <div className="flex gap-2">
          <button onClick={scaricaSvg} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                  style={{ border: '0.5px solid var(--border)', color: 'var(--foreground)' }}>
            <Download size={12} /> PNG
          </button>
          <button onClick={scaricaPdfQr} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: 'var(--hotel-navy)' }}>
            <Download size={12} /> PDF
          </button>
        </div>
      </div>

      <div className="flex-1">
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--foreground)' }}>QR Code menu ospiti</p>
        <p className="text-[12px] font-mono break-all mb-3" style={{ color: 'var(--hotel-amber)' }}>{urlPubblico}</p>

        {/* Logo */}
        <div className="mb-3">
          <p className="text-[11px] font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>Logo hotel</p>
          {logoUrl ? (
            <div className="flex items-center gap-3">
              <img id="qr-logo-img" src={logoUrl} alt="Logo" className="h-12 object-contain rounded" crossOrigin="anonymous" />
              {isTitolare && (
                <button onClick={() => logoRef.current?.click()} disabled={uploading}
                        className="text-xs px-2.5 py-1 rounded-lg"
                        style={{ border: '0.5px solid var(--border)', color: 'var(--muted-foreground)' }}>
                  {uploading ? 'Caricamento...' : 'Cambia'}
                </button>
              )}
            </div>
          ) : isTitolare ? (
            <button onClick={() => logoRef.current?.click()} disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
                    style={{ border: '0.5px dashed var(--border)', color: 'var(--muted-foreground)' }}>
              <Upload size={13} /> {uploading ? 'Caricamento...' : 'Carica logo hotel (PNG, SVG)'}
            </button>
          ) : (
            <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Nessun logo caricato</p>
          )}
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={caricaLogo} />
        </div>

        {/* Menu stampabile */}
        <div className="flex items-center gap-2">
          <button onClick={() => window.open('/menu-stampa', '_blank')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: 'var(--hotel-amber)' }}>
            <Download size={13} /> Menu stampabile (PDF)
          </button>
          <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Si apre la versione da stampa — usa File → Stampa → Salva come PDF</p>
        </div>
      </div>
    </div>
  );
}

// ── Pagina principale ─────────────────────────────────────────────────────────
export default function PaginaMenu() {
  const { utente } = useAuth();
  const [categorie, setCategorie] = useState([]);
  const [piatti, setPiatti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalCat, setModalCat] = useState(null);   // null | 'new' | {cat}
  const [modalPiatto, setModalPiatto] = useState(null);
  const [filtroCat, setFiltroCat] = useState(null);
  const [mostraQr, setMostraQr] = useState(false);

  const isTitolare = utente?.ruolo === 'titolare' || utente?.ruolo === 'admin';

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [rc, rp] = await Promise.all([api.get('/menu/categorie'), api.get('/menu/piatti')]);
      setCategorie(rc.data.categorie);
      setPiatti(rp.data.piatti);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { carica(); }, [carica]);

  async function toggleDisp(id) {
    try {
      const r = await api.patch(`/menu/piatti/${id}/toggle`);
      setPiatti(ps => ps.map(p => p.id === id ? { ...p, disponibile: r.data.piatto.disponibile } : p));
    } catch {}
  }

  async function eliminaPiatto(id) {
    if (!confirm('Eliminare questo piatto?')) return;
    try { await api.delete(`/menu/piatti/${id}`); await carica(); } catch {}
  }

  async function eliminaCategoria(id) {
    if (!confirm('Eliminare questa categoria e tutti i suoi piatti?')) return;
    try { await api.delete(`/menu/categorie/${id}`); await carica(); } catch {}
  }

  async function toggleCat(cat) {
    try { await api.put(`/menu/categorie/${cat.id}`, { attivo: !cat.attivo }); await carica(); } catch {}
  }

  const catVisibili = filtroCat ? categorie.filter(c => c.id === filtroCat) : categorie;
  const piattiPerCat = (catId) => piatti.filter(p => p.categoria_id === catId);
  const urlPubblico = typeof window !== 'undefined' ? `${window.location.origin}/menu-pubblico` : '';

  return (
    <AppShell>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Menu</h1>
            <p className="text-[13px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {piatti.filter(p => p.disponibile).length} piatti disponibili oggi
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setMostraQr(!mostraQr)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ border: '0.5px solid var(--border)', color: 'var(--foreground)' }}>
              <QrCode size={13} /> QR Code
            </button>
            {isTitolare && (
              <>
                <button onClick={() => setModalCat('new')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ border: '0.5px solid var(--border)', color: 'var(--foreground)' }}>
                  <Plus size={13} /> Categoria
                </button>
                <button onClick={() => setModalPiatto('new')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                        style={{ background: 'var(--hotel-navy)' }}>
                  <Plus size={13} /> Piatto
                </button>
              </>
            )}
          </div>
        </div>

        {/* QR panel */}
        {mostraQr && (
          <PannelloQr urlPubblico={urlPubblico} isTitolare={isTitolare} imgBase={IMG_BASE} />
        )}

        {/* Filtro categorie */}
        {categorie.length > 1 && (
          <div className="flex gap-2 flex-wrap mb-5">
            <button onClick={() => setFiltroCat(null)}
                    className="text-xs px-3 py-1.5 rounded-full font-medium"
                    style={{ background: !filtroCat ? 'var(--hotel-navy)' : 'var(--muted)', color: !filtroCat ? '#fff' : 'var(--muted-foreground)' }}>
              Tutte
            </button>
            {categorie.map(c => (
              <button key={c.id} onClick={() => setFiltroCat(c.id === filtroCat ? null : c.id)}
                      className="text-xs px-3 py-1.5 rounded-full font-medium"
                      style={{ background: filtroCat === c.id ? 'var(--hotel-navy)' : 'var(--muted)', color: filtroCat === c.id ? '#fff' : 'var(--muted-foreground)' }}>
                {c.titolo}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : categorie.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>Nessuna categoria ancora</p>
            <p className="text-[13px]" style={{ color: 'var(--muted-foreground)' }}>Crea una categoria per iniziare a costruire il menu</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {catVisibili.map(cat => (
              <div key={cat.id} className="rounded-2xl overflow-hidden" style={{ border: '0.5px solid var(--border)' }}>
                {/* Header categoria */}
                <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--hotel-navy)' }}>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-white">{cat.titolo}</h2>
                    {!cat.attivo && <Badge label="nascosta" color="red" />}
                    <span className="text-[11px] text-white/60">{piattiPerCat(cat.id).length} piatti</span>
                  </div>
                  {isTitolare && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleCat(cat)} className="p-1.5 rounded text-white/70 hover:text-white" title={cat.attivo ? 'Nascondi' : 'Mostra'}>
                        {cat.attivo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => setModalCat(cat)} className="p-1.5 rounded text-white/70 hover:text-white">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => eliminaCategoria(cat.id)} className="p-1.5 rounded text-white/70 hover:text-red-300">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Piatti */}
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {piattiPerCat(cat.id).length === 0 ? (
                    <p className="px-4 py-4 text-[13px]" style={{ color: 'var(--muted-foreground)' }}>Nessun piatto in questa categoria</p>
                  ) : (
                    piattiPerCat(cat.id).map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-3"
                           style={{ background: p.disponibile ? 'var(--card)' : 'var(--muted)', opacity: p.disponibile ? 1 : 0.6 }}>
                        {/* Foto */}
                        {p.immagine_url ? (
                          <img src={`${IMG_BASE}${p.immagine_url}`} alt={p.nome}
                               className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-lg"
                               style={{ background: 'var(--muted)' }}>🍽</div>
                        )}
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{p.nome}</span>
                            {!p.disponibile && <Badge label="non disponibile" color="red" />}
                            {p.allergeni?.map(a => <Badge key={a} label={a} />)}
                          </div>
                          {p.descrizione && (
                            <p className="text-[12px] mt-0.5 line-clamp-2" style={{ color: 'var(--muted-foreground)' }}>{p.descrizione}</p>
                          )}
                        </div>
                        {/* Prezzo */}
                        {p.prezzo && (
                          <span className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--hotel-amber)' }}>
                            €{Number(p.prezzo).toFixed(2)}
                          </span>
                        )}
                        {/* Azioni */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => toggleDisp(p.id)} title={p.disponibile ? 'Segna non disponibile' : 'Rendi disponibile'}
                                  className="p-1.5 rounded"
                                  style={{ color: p.disponibile ? 'var(--status-green-text)' : 'var(--muted-foreground)' }}>
                            {p.disponibile ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                          </button>
                          {isTitolare && (
                            <>
                              <button onClick={() => setModalPiatto(p)} className="p-1.5 rounded" style={{ color: 'var(--muted-foreground)' }}>
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => eliminaPiatto(p.id)} className="p-1.5 rounded" style={{ color: 'var(--status-red-text)' }}>
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modali */}
      {modalCat && (
        <ModalCategoria
          cat={modalCat === 'new' ? null : modalCat}
          onSalva={() => { setModalCat(null); carica(); }}
          onChiudi={() => setModalCat(null)}
        />
      )}
      {modalPiatto && (
        <ModalPiatto
          piatto={modalPiatto === 'new' ? null : modalPiatto}
          categorie={categorie}
          onSalva={() => { setModalPiatto(null); carica(); }}
          onChiudi={() => setModalPiatto(null)}
        />
      )}
    </AppShell>
  );
}
