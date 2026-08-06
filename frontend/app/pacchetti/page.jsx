'use client';

// Pagina Pacchetti — Modulo 2.2, Fase 2A.
// CRUD pacchetti a prezzo fisso indipendente dal calcolo per notte (es.
// "Weekend Relax 2 notti" a 250€ tutto compreso). Nessuna eliminazione
// fisica: "elimina" dalla UI disattiva soltanto (PATCH attivo:false), perché
// un soggiorno passato può ancora referenziare un pacchetto non più in
// vendita — vedi backend/controllers/pacchettiController.js.
// Lettura: admin, titolare, receptionist. Scrittura: solo admin/titolare
// (shared/ruoli.js, sezione 'pacchetti').

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const RUOLI_LETTURA = ['admin', 'titolare', 'receptionist'];

const inputStyle = {
  height: '40px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

export default function PaginaPacchetti() {
  const { utente, loading } = useAuth();
  const router = useRouter();
  const puoScrivere = utente && ['admin', 'titolare'].includes(utente.ruolo);

  const [pacchetti, setPacchetti] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [successo, setSuccesso] = useState('');
  const [form, setForm] = useState(null); // null | 'nuovo' | {pacchetto}
  const [nome, setNome] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [numNotti, setNumNotti] = useState('');
  const [prezzoTotale, setPrezzoTotale] = useState('');
  const [salvataggio, setSalvataggio] = useState(false);

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_LETTURA.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const res = await api.get('/pacchetti');
      setPacchetti(res.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento.');
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => {
    if (utente && RUOLI_LETTURA.includes(utente.ruolo)) carica();
  }, [utente, carica]);

  function apriNuovo() {
    setNome(''); setDescrizione(''); setNumNotti(''); setPrezzoTotale('');
    setForm('nuovo'); setErrore('');
  }
  function apriModifica(p) {
    setNome(p.nome); setDescrizione(p.descrizione ?? ''); setNumNotti(p.num_notti); setPrezzoTotale(p.prezzo_totale);
    setForm(p); setErrore('');
  }

  async function salva() {
    if (!nome.trim() || !numNotti || !prezzoTotale) {
      return setErrore('Nome, numero notti e prezzo totale sono obbligatori.');
    }
    setSalvataggio(true);
    setErrore('');
    try {
      const body = {
        nome: nome.trim(),
        descrizione: descrizione || null,
        num_notti: Number(numNotti),
        prezzo_totale: Number(prezzoTotale),
      };
      if (form === 'nuovo') await api.post('/pacchetti', body);
      else await api.patch(`/pacchetti/${form.id}`, body);
      setForm(null);
      setSuccesso('Pacchetto salvato.');
      await carica();
    } catch (err) {
      setErrore(err.message || 'Errore nel salvataggio.');
    } finally {
      setSalvataggio(false);
    }
  }

  async function cambiaAttivo(p) {
    try {
      await api.patch(`/pacchetti/${p.id}`, { attivo: !p.attivo });
      setSuccesso(p.attivo ? 'Pacchetto disattivato.' : 'Pacchetto riattivato.');
      await carica();
    } catch (err) {
      setErrore(err.message || 'Errore.');
    }
  }

  if (loading || !utente) return null;

  if (form !== null) {
    const isNuovo = form === 'nuovo';
    return (
      <AppShell titolo={isNuovo ? 'Nuovo pacchetto' : 'Modifica pacchetto'}>
        <div className="max-w-lg">
          <button onClick={() => setForm(null)} className="text-sm mb-4 flex items-center gap-1" style={{ color: 'var(--hotel-amber)' }}>
            ← Torna alla lista
          </button>
          <div className="rounded-xl p-6 flex flex-col gap-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
            <div>
              <label className="block text-[13px] font-medium mb-1.5">Nome *</label>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Es. Weekend Relax"
                     className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-[13px] font-medium mb-1.5">Descrizione</label>
              <textarea value={descrizione} rows={3} onChange={e => setDescrizione(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ ...inputStyle, height: 'auto' }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium mb-1.5">Numero notti *</label>
                <input type="number" min={1} value={numNotti} onChange={e => setNumNotti(e.target.value)}
                       className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-1.5">Prezzo totale (€) *</label>
                <input type="number" min={0} step="0.01" value={prezzoTotale} onChange={e => setPrezzoTotale(e.target.value)}
                       className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
            </div>
            {errore && (
              <div className="px-3 py-2.5 rounded-lg text-[13px]" style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
                {errore}
              </div>
            )}
            <button onClick={salva} disabled={salvataggio}
                    className="w-full font-medium text-sm text-white rounded-lg disabled:opacity-60"
                    style={{ height: '44px', background: 'var(--hotel-amber)' }}>
              {salvataggio ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titolo="Pacchetti" azioneLabel={puoScrivere ? 'Nuovo pacchetto' : undefined} onAzione={puoScrivere ? apriNuovo : undefined}>
      {puoScrivere && (
        <div className="md:hidden flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium">Pacchetti</h2>
          <button onClick={apriNuovo} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: 'var(--hotel-amber)' }}>
            <Plus size={14} /> Nuovo
          </button>
        </div>
      )}

      {successo && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4" style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
          {successo}
        </div>
      )}
      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4" style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}

      {caricamento ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border)' }}>
          {pacchetti.map((p, idx) => (
            <div key={p.id} className="flex items-center gap-4 px-4 py-3"
                 style={{
                   background: idx % 2 === 0 ? 'var(--card)' : 'var(--background)',
                   borderBottom: idx < pacchetti.length - 1 ? '0.5px solid var(--border)' : 'none',
                   opacity: p.attivo ? 1 : 0.5,
                 }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.nome}</p>
                <p className="text-[12px] truncate" style={{ color: 'var(--muted-foreground)' }}>
                  {p.num_notti} notti · €{Number(p.prezzo_totale).toFixed(2)} tutto compreso
                  {!p.attivo && ' · disattivato'}
                </p>
              </div>
              {puoScrivere && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => apriModifica(p)} title="Modifica" className="p-2 rounded-lg hover:bg-gray-100" style={{ color: 'var(--muted-foreground)' }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => cambiaAttivo(p)} title={p.attivo ? 'Disattiva' : 'Riattiva'}
                          className="p-2 rounded-lg hover:bg-gray-100"
                          style={{ color: p.attivo ? 'var(--status-red-text)' : 'var(--status-green-text)' }}>
                    {p.attivo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  </button>
                </div>
              )}
            </div>
          ))}
          {pacchetti.length === 0 && (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Nessun pacchetto. Crea il primo con il pulsante in alto.
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
