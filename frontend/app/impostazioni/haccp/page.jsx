'use client';

// Impostazioni ▸ HACCP — anagrafica apparecchiature (condivisa da A.2
// registro temperature e A.6 manutenzioni programmate) + on/off dei moduli
// "in forse" (A.4 buffet, A.6 manutenzioni). Modulo 6.1, ricostruzione
// 16/08/2026. Riservata admin/titolare, stesso pattern delle altre pagine
// /impostazioni/* (es. tassa-soggiorno).

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const RUOLI_CONFIGURAZIONE = ['admin', 'titolare'];

const TIPI = [
  { valore: 'frigo', etichetta: 'Frigo' },
  { valore: 'freezer', etichetta: 'Freezer' },
  { valore: 'abbattitore', etichetta: 'Abbattitore' },
  { valore: 'cappa', etichetta: 'Cappa' },
  { valore: 'piano_cottura', etichetta: 'Piano cottura' },
  { valore: 'forno', etichetta: 'Forno' },
  { valore: 'lavastoviglie', etichetta: 'Lavastoviglie' },
  { valore: 'zona_rifiuti', etichetta: 'Zona rifiuti' },
  { valore: 'altro', etichetta: 'Altro' },
];

const inputStyle = {
  height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)',
};

export default function PaginaImpostazioniHaccp() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const [apparecchiature, setApparecchiature] = useState([]);
  const [moduli, setModuli] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [aperto, setAperto] = useState(false);
  const [form, setForm] = useState({ nome: '', tipo: 'frigo', ubicazione: '' });
  const [invio, setInvio] = useState(false);

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_CONFIGURAZIONE.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const [ra, rm] = await Promise.all([
        api.get('/impostazioni/haccp/apparecchiature'),
        api.get('/impostazioni/haccp/moduli'),
      ]);
      setApparecchiature(ra.data.apparecchiature || []);
      setModuli(rm.data.moduli || []);
    } catch {} finally { setCaricamento(false); }
  }, []);

  useEffect(() => { carica(); }, [carica]);

  async function salvaApparecchiatura(e) {
    e.preventDefault();
    setInvio(true);
    try {
      await api.post('/impostazioni/haccp/apparecchiature', form);
      setForm({ nome: '', tipo: 'frigo', ubicazione: '' });
      setAperto(false);
      await carica();
    } catch {} finally { setInvio(false); }
  }

  async function toggleAttivo(app) {
    try {
      await api.put(`/impostazioni/haccp/apparecchiature/${app.id}`, { attivo: !app.attivo });
      await carica();
    } catch {}
  }

  async function toggleModulo(modulo) {
    try {
      await api.put(`/impostazioni/haccp/moduli/${modulo.modulo}`, { attivo: !modulo.attivo });
      await carica();
    } catch {}
  }

  const NOMI_MODULI = { buffet: 'Buffet colazione (A.4)', manutenzioni_programmate: 'Manutenzioni programmate (A.6)' };

  if (loading || caricamento) return <p className="text-sm py-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>;

  return (
    <AppShell titolo="Impostazioni HACCP" sottotitolo="Apparecchiature e moduli attivi">
      <div className="max-w-2xl mx-auto">

        <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--foreground)' }}>Moduli in valutazione</p>
          <p className="text-[12px] mb-3" style={{ color: 'var(--muted-foreground)' }}>
            Verifica nel piano HACCP dell'hotel se questi controlli sono richiesti; se non lo sono, spegnili — il codice resta, solo i tab spariscono.
          </p>
          {moduli.map(m => (
            <div key={m.modulo} className="flex items-center justify-between py-2" style={{ borderTop: '0.5px solid var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--foreground)' }}>{NOMI_MODULI[m.modulo] || m.modulo}</span>
              <button onClick={() => toggleModulo(m)}
                      className="px-3 py-1 rounded-lg text-xs font-medium text-white"
                      style={{ background: m.attivo ? 'var(--hotel-amber)' : 'var(--muted-foreground)' }}>
                {m.attivo ? 'Attivo' : 'Spento'}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Apparecchiature</p>
          <button onClick={() => setAperto(!aperto)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: 'var(--hotel-amber)' }}>
            <Plus size={12} /> Nuova apparecchiatura
          </button>
        </div>

        {aperto && (
          <form onSubmit={salvaApparecchiatura} className="rounded-xl p-4 mb-4 grid grid-cols-2 gap-3"
                style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
            <div className="col-span-2">
              <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Nome *</label>
              <input type="text" required value={form.nome}
                     onChange={e => setForm({ ...form, nome: e.target.value })}
                     placeholder="Es: Frigo 4"
                     className="w-full px-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Tipo *</label>
              <select required value={form.tipo}
                      onChange={e => setForm({ ...form, tipo: e.target.value })}
                      className="w-full px-2 rounded-lg text-sm outline-none" style={inputStyle}>
                {TIPI.map(t => <option key={t.valore} value={t.valore}>{t.etichetta}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Ubicazione</label>
              <input type="text" value={form.ubicazione}
                     onChange={e => setForm({ ...form, ubicazione: e.target.value })}
                     placeholder="Es: Cucina"
                     className="w-full px-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </div>
            <button type="submit" disabled={invio}
                    className="col-span-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                    style={{ background: 'var(--hotel-amber)' }}>
              {invio ? 'Salvataggio...' : 'Salva'}
            </button>
          </form>
        )}

        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          {apparecchiature.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessuna apparecchiatura registrata.</p>
          ) : apparecchiature.map((a, i) => (
            <div key={a.id} className="px-4 py-3 flex items-center justify-between gap-3"
                 style={{ borderBottom: i < apparecchiature.length - 1 ? '0.5px solid var(--border)' : 'none', opacity: a.attivo ? 1 : 0.5 }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{a.nome}</p>
                <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                  {TIPI.find(t => t.valore === a.tipo)?.etichetta || a.tipo}{a.ubicazione ? ` · ${a.ubicazione}` : ''}
                </p>
              </div>
              <button onClick={() => toggleAttivo(a)}
                      className="px-3 py-1 rounded-lg text-xs font-medium shrink-0"
                      style={{ border: '0.5px solid var(--border)', color: 'var(--foreground)' }}>
                {a.attivo ? 'Disattiva' : 'Riattiva'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
