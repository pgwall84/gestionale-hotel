'use client';

// Pagina Prenotazioni Ristorante — lista giornaliera + form inserimento.
// Controllo overbooking: il backend risponde 409 se coperti esauriti.
// Accessibile a: admin, titolare, receptionist, portiere_notte (write); tutti gli operativi (read).

import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Phone, Users, Clock, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const RUOLI_WRITE = ['admin', 'titolare', 'receptionist', 'portiere_notte'];

function oggi() {
  return new Date().toISOString().split('T')[0];
}

function formatData(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function spostaData(d, giorni) {
  // Aritmetica in ora locale (evita scarto UTC+2 di toISOString)
  const [y, m, g] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, g + giorni);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

const STATI_BADGE = {
  confermata:  { bg: 'var(--status-green-bg)',  color: 'var(--status-green-text)',  label: 'Confermata' },
  in_attesa:   { bg: 'var(--status-amber-bg)',  color: 'var(--status-amber-text)',  label: 'In attesa' },
  completata:  { bg: 'var(--status-blue-bg)',   color: 'var(--status-blue-text)',   label: 'Completata' },
  cancellata:  { bg: 'var(--status-red-bg)',    color: 'var(--status-red-text)',    label: 'Cancellata' },
};

function BadgeStato({ stato }) {
  const s = STATI_BADGE[stato] || STATI_BADGE.in_attesa;
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

const FORM_VUOTO = { nome: '', telefono: '', ora: '20:00', coperti: 2, allergie: '', note: '', ospite_hotel: false };

export default function PrenotazioniPage() {
  const { utente } = useAuth();
  const [data, setData] = useState(oggi());
  const [prenotazioni, setPrenotazioni] = useState([]);
  const [totale, setTotale] = useState(0);
  const [copetiMax, setCopertiMax] = useState(70);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [formAperto, setFormAperto] = useState(false);
  const [form, setForm] = useState(FORM_VUOTO);
  const [salvando, setSalvando] = useState(false);
  const [erroreForm, setErroreForm] = useState(null);
  const [cancellando, setCancellando] = useState(null);

  const puoScrivere = utente && RUOLI_WRITE.includes(utente.ruolo);

  const carica = useCallback(async () => {
    try {
      setLoading(true);
      setErrore(null);
      const r = await api.get(`/ristorante/prenotazioni?data=${data}`);
      setPrenotazioni(r.data.prenotazioni || []);
      setTotale(r.data.totale_coperti || 0);
      setCopertiMax(r.data.coperti_max || 70);
    } catch (err) {
      setErrore(err.message);
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => { carica(); }, [carica]);

  const salva = async (e) => {
    e.preventDefault();
    setErroreForm(null);
    setSalvando(true);
    try {
      await api.post('/ristorante/prenotazioni', { ...form, data });
      setFormAperto(false);
      setForm(FORM_VUOTO);
      await carica();
    } catch (err) {
      if (err.response?.status === 409) {
        const d = err.response.data;
        setErroreForm(`Overbooking: rimangono solo ${d.disponibili} posti disponibili in questo slot.`);
      } else {
        setErroreForm(err.message);
      }
    } finally {
      setSalvando(false);
    }
  };

  const cancella = async (id) => {
    if (!confirm('Cancellare questa prenotazione?')) return;
    setCancellando(id);
    try {
      await api.delete(`/ristorante/prenotazioni/${id}`);
      await carica();
    } catch (err) {
      alert(err.message);
    } finally {
      setCancellando(null);
    }
  };

  const completaPrenotazione = async (id) => {
    try {
      await api.patch(`/ristorante/prenotazioni/${id}`, { stato: 'completata' });
      await carica();
    } catch (err) {
      alert(err.message);
    }
  };

  const percentualeOccupazione = Math.round((totale / copetiMax) * 100);
  const coloreOccupazione = percentualeOccupazione >= 90
    ? 'var(--status-red-text)'
    : percentualeOccupazione >= 70
    ? 'var(--status-amber-text)'
    : 'var(--status-green-text)';

  return (
    <AppShell>
      <div className="p-4 max-w-2xl mx-auto flex flex-col gap-4">

        {/* Header con navigazione data */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setData(d => spostaData(d, -1))}
                    className="p-1.5 rounded-lg hover:bg-[var(--muted)]">
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="font-semibold text-sm capitalize" style={{ color: 'var(--foreground)' }}>
                {formatData(data)}
              </p>
              {data !== oggi() && (
                <button onClick={() => setData(oggi())}
                        className="text-xs" style={{ color: 'var(--primary)' }}>
                  Oggi
                </button>
              )}
            </div>
            <button onClick={() => setData(d => spostaData(d, 1))}
                    className="p-1.5 rounded-lg hover:bg-[var(--muted)]">
              <ChevronRight size={18} />
            </button>
          </div>

          {puoScrivere && (
            <button onClick={() => { setFormAperto(true); setErroreForm(null); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              <Plus size={16} /> Nuova
            </button>
          )}
        </div>

        {/* Barra occupazione */}
        <div className="rounded-xl p-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Coperti prenotati</span>
            <span className="text-sm font-bold" style={{ color: coloreOccupazione }}>
              {totale} / {copetiMax}
              {percentualeOccupazione >= 90 && ' ⚠️'}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
            <div className="h-full rounded-full transition-all"
                 style={{ width: `${Math.min(percentualeOccupazione, 100)}%`, background: coloreOccupazione }} />
          </div>
        </div>

        {/* Form nuova prenotazione */}
        {formAperto && (
          <div className="rounded-xl p-4 flex flex-col gap-3"
               style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex justify-between items-center">
              <p className="font-semibold" style={{ color: 'var(--foreground)' }}>Nuova prenotazione</p>
              <button onClick={() => setFormAperto(false)} style={{ color: 'var(--muted-foreground)' }}>
                <X size={18} />
              </button>
            </div>

            {erroreForm && (
              <div className="flex items-start gap-2 p-2 rounded-lg text-sm"
                   style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {erroreForm}
              </div>
            )}

            <form onSubmit={salva} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                    Nome *
                  </label>
                  <input required value={form.nome}
                         onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                         placeholder="Mario Rossi"
                         className="rounded-lg px-3 py-2 text-sm"
                         style={{ background: 'var(--input)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Telefono</label>
                  <input value={form.telefono}
                         onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                         placeholder="347 1234567" type="tel"
                         className="rounded-lg px-3 py-2 text-sm"
                         style={{ background: 'var(--input)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Ora *</label>
                  <input required type="time" value={form.ora}
                         onChange={e => setForm(f => ({ ...f, ora: e.target.value }))}
                         className="rounded-lg px-3 py-2 text-sm"
                         style={{ background: 'var(--input)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Coperti *</label>
                  <input required type="number" min="1" max="70" value={form.coperti}
                         onChange={e => setForm(f => ({ ...f, coperti: parseInt(e.target.value) || 1 }))}
                         className="rounded-lg px-3 py-2 text-sm"
                         style={{ background: 'var(--input)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="ospite_hotel" checked={form.ospite_hotel}
                         onChange={e => setForm(f => ({ ...f, ospite_hotel: e.target.checked }))} />
                  <label htmlFor="ospite_hotel" className="text-sm" style={{ color: 'var(--foreground)' }}>
                    Ospite hotel
                  </label>
                </div>

                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Allergie</label>
                  <input value={form.allergie}
                         onChange={e => setForm(f => ({ ...f, allergie: e.target.value }))}
                         placeholder="Glutine, crostacei..."
                         className="rounded-lg px-3 py-2 text-sm"
                         style={{ background: 'var(--input)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                </div>

                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Note</label>
                  <textarea value={form.note}
                            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                            placeholder="Tavolo vicino alla finestra..."
                            rows={2}
                            className="rounded-lg px-3 py-2 text-sm resize-none"
                            style={{ background: 'var(--input)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setFormAperto(false)}
                        className="px-4 py-2 rounded-lg text-sm"
                        style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                  Annulla
                </button>
                <button type="submit" disabled={salvando}
                        className="px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: salvando ? 0.6 : 1 }}>
                  {salvando ? 'Salvataggio...' : 'Salva'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista prenotazioni */}
        {loading ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : errore ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--status-red-text)' }}>{errore}</p>
        ) : prenotazioni.length === 0 ? (
          <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Nessuna prenotazione per questa data.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {prenotazioni.map(p => (
              <div key={p.id} className="rounded-xl p-3 flex flex-col gap-1.5"
                   style={{ background: 'var(--card)', border: '1px solid var(--border)',
                            opacity: p.stato === 'cancellata' ? 0.5 : 1 }}>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Clock size={14} style={{ color: 'var(--muted-foreground)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                      {p.ora?.slice(0,5)} — {p.nome}
                    </span>
                    {p.ospite_hotel && (
                      <span className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--status-blue-bg)', color: 'var(--status-blue-text)' }}>
                        Hotel
                      </span>
                    )}
                  </div>
                  <BadgeStato stato={p.stato} />
                </div>

                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {p.coperti} cop.
                  </span>
                  {p.telefono && (
                    <span className="flex items-center gap-1">
                      <Phone size={12} /> {p.telefono}
                    </span>
                  )}
                  {p.allergie && <span>⚠️ {p.allergie}</span>}
                  {p.note && <span className="italic">{p.note}</span>}
                </div>

                {puoScrivere && p.stato !== 'cancellata' && p.stato !== 'completata' && (
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => completaPrenotazione(p.id)}
                            className="px-2 py-1 rounded text-xs"
                            style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
                      Completata
                    </button>
                    <button onClick={() => cancella(p.id)}
                            disabled={cancellando === p.id}
                            className="px-2 py-1 rounded text-xs"
                            style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
                      {cancellando === p.id ? '...' : 'Cancella'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
