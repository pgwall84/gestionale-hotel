'use client';

// Pagina gestione utenti — admin/titolare (shared/ruoli.js sezione 'utenti').
// CRUD completo: lista dipendenti, creazione, modifica, attiva/disattiva.
//
// Fix 12/08/2026: la guardia di accesso qui sotto controllava solo
// `ruolo === 'titolare'`, escludendo admin — mentre la sidebar (Sidebar.tsx,
// voce Utenti, ruoli: AT) e il backend (routes/users.js, middleware
// soloTitolare, che nonostante il nome ammette admin+titolare) la
// consentivano a entrambi. Risultato: un account admin veniva rimbalzato
// su /home aprendo questa pagina — causa reale della "pagina utenti non
// raggiungibile in locale" segnalata da Marco. Anche LABEL_RUOLI era
// disallineata: mancavano 'admin' e 'portiere_notte' (7 ruoli, non 5).

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import StatusBadge from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { RUOLI } from '@/lib/ruoli';

const RUOLI_CONSENTITI = ['admin', 'titolare'];

// 'dipendente' resta la chiave interna (invariata in shared/ruoli.js — è il
// ruolo generico riusato anche da 'pulizie'/'camere.pulizia'), ma in UI si
// mostra come "Lavapiatti" su richiesta esplicita del titolare (13/08/2026).
const LABEL_RUOLI = {
  admin: 'Admin', titolare: 'Titolare', receptionist: 'Receptionist',
  cameriere: 'Cameriere', cuoco: 'Cuoco', portiere_notte: 'Portiere di notte',
  dipendente: 'Lavapiatti',
};

export default function PaginaUtenti() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const [utenti, setUtenti] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [successo, setSuccesso] = useState('');
  const [modalita, setModalita] = useState(null); // null | 'nuovo' | {utente}
  const [form, setForm] = useState({ nome: '', cognome: '', email: '', password: '', ruolo: '' });
  const [salvataggio, setSalvataggio] = useState(false);

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_CONSENTITI.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  useEffect(() => {
    if (utente && RUOLI_CONSENTITI.includes(utente.ruolo)) caricaUtenti();
  }, [utente]);

  async function caricaUtenti() {
    setCaricamento(true);
    try {
      const res = await api.get('/users');
      setUtenti(res.data.utenti);
    } catch { setErrore('Errore nel caricamento.'); }
    finally { setCaricamento(false); }
  }

  function apriNuovo() {
    setForm({ nome: '', cognome: '', email: '', password: '', ruolo: '' });
    setModalita('nuovo');
    setErrore('');
  }

  function apriModifica(u) {
    setForm({ nome: u.nome, cognome: u.cognome, email: u.email, password: '', ruolo: u.ruolo });
    setModalita(u);
    setErrore('');
  }

  async function handleSalva(e) {
    e.preventDefault();
    setSalvataggio(true);
    setErrore('');
    try {
      if (modalita === 'nuovo') {
        await api.post('/users', form);
        setSuccesso('Utente creato.');
      } else {
        await api.put(`/users/${modalita.id}`, form);
        setSuccesso('Utente aggiornato.');
      }
      await caricaUtenti();
      setModalita(null);
    } catch (err) {
      setErrore(err?.response?.data?.errore || 'Errore durante il salvataggio.');
    } finally { setSalvataggio(false); }
  }

  async function cambiaStato(id, attivoCorrente) {
    if (!confirm(attivoCorrente ? 'Disattivare questo utente?' : 'Riattivare questo utente?')) return;
    try {
      await api.patch(`/users/${id}/attivo`, { attivo: !attivoCorrente });
      setSuccesso(attivoCorrente ? 'Utente disattivato.' : 'Utente riattivato.');
      await caricaUtenti();
    } catch (err) { setErrore(err?.response?.data?.errore || 'Errore.'); }
  }

  if (loading || !utente) return null;

  // ── Form creazione/modifica ────────────────────────────────────────────────
  if (modalita !== null) {
    const isNuovo = modalita === 'nuovo';
    return (
      <AppShell titolo={isNuovo ? 'Nuovo dipendente' : 'Modifica dipendente'}>
        <div className="max-w-lg">
          <button onClick={() => setModalita(null)} className="text-sm mb-4 flex items-center gap-1"
                  style={{ color: 'var(--hotel-amber)' }}>
            ← Torna alla lista
          </button>

          <div className="rounded-xl p-6" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
            <form onSubmit={handleSalva} className="flex flex-col gap-4">

              <div className="grid grid-cols-2 gap-3">
                {[['Nome', 'nome', 'text'], ['Cognome', 'cognome', 'text']].map(([label, key, type]) => (
                  <div key={key}>
                    <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>{label} *</label>
                    <input type={type} value={form[key]} required
                           onChange={e => setForm({ ...form, [key]: e.target.value })}
                           className="w-full px-3 rounded-lg text-sm outline-none"
                           style={{ height: '44px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
                  </div>
                ))}
              </div>

              <div>
                {/* Il campo si chiama "email" nel DB (colonna storica, usata per il
                    login) ma non ha mai avuto una validazione di formato lato
                    backend — solo obbligatorietà e unicità (usersController.js).
                    Da 13/08/2026, su richiesta del titolare, si usa come "nome
                    utente" (es. nome.cognome) invece di una vera email — niente
                    type="email" per non forzare un formato con @ che qui non serve. */}
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Nome utente *</label>
                <input type="text" value={form.email} required
                       placeholder="nome.cognome"
                       onChange={e => setForm({ ...form, email: e.target.value })}
                       className="w-full px-3 rounded-lg text-sm outline-none"
                       style={{ height: '44px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
              </div>

              <div>
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                  Password {!isNuovo && <span className="font-normal" style={{ color: 'var(--muted-foreground)' }}>(lascia vuoto per non cambiarla)</span>}
                  {isNuovo && ' *'}
                </label>
                <input type="password" value={form.password} required={isNuovo} minLength={8}
                       placeholder="Minimo 8 caratteri"
                       onChange={e => setForm({ ...form, password: e.target.value })}
                       className="w-full px-3 rounded-lg text-sm outline-none"
                       style={{ height: '44px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
              </div>

              <div>
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Ruolo *</label>
                <select value={form.ruolo} required onChange={e => setForm({ ...form, ruolo: e.target.value })}
                        className="w-full px-3 rounded-lg text-sm outline-none"
                        style={{ height: '44px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}>
                  <option value="">Seleziona ruolo...</option>
                  {/* Un titolare non può assegnare il ruolo admin (solo un admin può) —
                      LABEL_RUOLI serve anche per il badge in lista, dove admin va mostrato
                      anche a chi non può assegnarlo, quindi qui filtriamo solo la tendina. */}
                  {Object.entries(LABEL_RUOLI)
                    .filter(([val]) => utente.ruolo === 'admin' || val !== 'admin')
                    .map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                </select>
              </div>

              {errore && (
                <div className="px-3 py-2.5 rounded-lg text-[13px]"
                     style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
                  {errore}
                </div>
              )}

              <button type="submit" disabled={salvataggio}
                      className="w-full font-medium text-sm text-white rounded-lg transition-colors disabled:opacity-60"
                      style={{ height: '44px', background: 'var(--hotel-amber)' }}>
                {salvataggio ? 'Salvataggio...' : 'Salva'}
              </button>
            </form>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Lista utenti ───────────────────────────────────────────────────────────
  return (
    <AppShell titolo="Utenti" azioneLabel="Nuovo dipendente" onAzione={apriNuovo}>

      {/* Pulsante nuovo su mobile (la topbar è nascosta) */}
      <div className="md:hidden flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>Dipendenti</h2>
        <button onClick={apriNuovo}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--hotel-amber)' }}>
          <Plus size={14} /> Nuovo
        </button>
      </div>

      {successo && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
          {successo}
        </div>
      )}
      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}

      {caricamento ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border)' }}>
          {utenti.map((u, idx) => (
            <div key={u.id}
                 className="flex items-center gap-4 px-4 py-3"
                 style={{
                   background: idx % 2 === 0 ? 'var(--card)' : 'var(--background)',
                   borderBottom: idx < utenti.length - 1 ? '0.5px solid var(--border)' : 'none',
                   opacity: u.attivo ? 1 : 0.5,
                 }}>
              {/* Avatar iniziali */}
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 text-white"
                   style={{ background: 'var(--hotel-navy)' }}>
                {u.nome[0]}{u.cognome[0]}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                  {u.nome} {u.cognome}
                </p>
                <p className="text-[12px] truncate" style={{ color: 'var(--muted-foreground)' }}>{u.email}</p>
              </div>

              <StatusBadge status="blue" label={LABEL_RUOLI[u.ruolo]} />
              {!u.attivo && <StatusBadge status="red" label="Disattivato" />}

              {/* Azioni */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => apriModifica(u)} title="Modifica"
                        className="p-2 rounded-lg transition-colors hover:bg-gray-100"
                        style={{ color: 'var(--muted-foreground)' }}>
                  <Pencil size={14} />
                </button>
                {u.id !== utente.id && (
                  <button onClick={() => cambiaStato(u.id, u.attivo)}
                          title={u.attivo ? 'Disattiva' : 'Riattiva'}
                          className="p-2 rounded-lg transition-colors hover:bg-gray-100"
                          style={{ color: u.attivo ? 'var(--status-red-text)' : 'var(--status-green-text)' }}>
                    {u.attivo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  </button>
                )}
              </div>
            </div>
          ))}

          {utenti.length === 0 && (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Nessun utente. Crea il primo con il pulsante in alto.
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
