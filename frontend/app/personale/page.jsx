'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Download, Trash2, Check, X, Upload, ChevronLeft, ChevronRight, FileText, Settings, Users, UserPlus, Pencil, PowerOff, Power } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import StatusBadge from '@/components/ui/StatusBadge';
import DataTable from '@/components/ui/DataTable';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const TABS_TITOLARE = [
  { id: 'presenze',  label: 'Presenze' },
  { id: 'turni',    label: 'Turni' },
  { id: 'ferie',    label: 'Ferie / Permessi' },
  { id: 'scadenze', label: 'Scadenze' },
  { id: 'documenti',label: 'Documenti' },
  { id: 'bacheca',  label: 'Bacheca' },
  { id: 'ospiti',   label: 'Note Cucina' },
];

const TABS_DIPENDENTE = [
  { id: 'turni',   label: 'Turni' },
  { id: 'ferie',   label: 'Ferie / Permessi' },
  { id: 'bacheca', label: 'Bacheca' },
];

const fmtData    = d => d ? new Date(d).toLocaleDateString('it-IT') : '—';
const fmtOra     = d => d ? new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDataOra = d => d ? `${fmtData(d)} ${fmtOra(d)}` : '—';

// Calcola il lunedì della settimana contenente `data`
function lunediDi(data) {
  const d = new Date(data);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function aggiungiGiorni(data, n) {
  const d = new Date(data);
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
}

const GIORNI_LABEL = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// Preset turni
const PRESET_TURNI = [
  { label: 'M',   title: 'Mattina',  ora_inizio: '07:00', ora_fine: '15:00', tipo_turno: 'mattina' },
  { label: 'S',   title: 'Sera',     ora_inizio: '15:00', ora_fine: '23:00', tipo_turno: 'sera'    },
  { label: 'N',   title: 'Notte',    ora_inizio: '23:00', ora_fine: '07:00', tipo_turno: 'notte'   },
  { label: 'R',   title: 'Riposo',   ora_inizio: '',      ora_fine: '',      tipo_turno: 'riposo'  },
];

const COLORE_TURNO = {
  mattina: { bg: 'var(--hotel-navy)',  text: 'white' },
  sera:    { bg: 'var(--hotel-amber)', text: 'white' },
  notte:   { bg: '#4B2D83',           text: 'white' },
  riposo:  { bg: 'var(--muted)',       text: 'var(--muted-foreground)' },
};

// ── Modal Gestione Personale ─────────────────────────────────────────────────
const TUTTI_RUOLI = ['admin', 'titolare', 'receptionist', 'cameriere', 'cuoco', 'portiere_notte', 'dipendente'];

function ModalGestionePersonale({ isAdmin, onChiudi }) {
  const [utenti, setUtenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // null = nuovo, id = modifica
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nome: '', cognome: '', email: '', ruolo: 'dipendente', password: '' });
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const [confermaDisattiva, setConfermaDisattiva] = useState(null);

  const ruoliDisponibili = isAdmin ? TUTTI_RUOLI : TUTTI_RUOLI.filter(r => r !== 'admin');

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/users');
      // titolare non vede gli admin
      const lista = isAdmin ? r.data.utenti : r.data.utenti.filter(u => u.ruolo !== 'admin');
      setUtenti(lista);
    } catch {} finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { carica(); }, [carica]);

  function apriNuovo() {
    setEditingId(null);
    setForm({ nome: '', cognome: '', email: '', ruolo: 'dipendente', password: '' });
    setErrore('');
    setShowForm(true);
  }

  function apriModifica(u) {
    setEditingId(u.id);
    setForm({ nome: u.nome, cognome: u.cognome, email: u.email, ruolo: u.ruolo, password: '' });
    setErrore('');
    setShowForm(true);
  }

  function annullaForm() {
    setShowForm(false);
    setEditingId(null);
    setErrore('');
  }

  async function salva(e) {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      const payload = { nome: form.nome, cognome: form.cognome, email: form.email, ruolo: form.ruolo };
      if (form.password) payload.password = form.password;
      if (editingId) {
        await api.put(`/users/${editingId}`, payload);
      } else {
        if (!form.password) { setErrore('La password è obbligatoria per i nuovi utenti.'); setInvio(false); return; }
        await api.post('/users', { ...payload, password: form.password });
      }
      await carica();
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      setErrore(err?.response?.data?.errore || 'Errore durante il salvataggio.');
    } finally { setInvio(false); }
  }

  async function toggleAttivo(u) {
    if (u.attivo) {
      setConfermaDisattiva(u);
      return;
    }
    try { await api.patch(`/users/${u.id}/attivo`, { attivo: true }); await carica(); } catch {}
  }

  async function confermaDiattiva() {
    if (!confermaDisattiva) return;
    try { await api.patch(`/users/${confermaDisattiva.id}/attivo`, { attivo: false }); await carica(); }
    catch {} finally { setConfermaDisattiva(null); }
  }

  const RUOLO_COLORE = {
    admin:          { bg: '#7C3AED20', text: '#7C3AED' },
    titolare:       { bg: 'rgba(27,58,92,0.12)', text: 'var(--hotel-navy)' },
    receptionist:   { bg: 'rgba(201,138,58,0.12)', text: 'var(--hotel-amber)' },
    cameriere:      { bg: '#16A34A20', text: '#16A34A' },
    cuoco:          { bg: '#DC262620', text: '#DC2626' },
    portiere_notte: { bg: '#0EA5E920', text: '#0EA5E9' },
    dipendente:     { bg: 'var(--muted)', text: 'var(--muted-foreground)' },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onChiudi}>
      <div className="rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
           style={{ background: 'var(--card)', border: '0.5px solid var(--border)', position: 'relative' }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex justify-between items-center p-5 pb-4 shrink-0"
             style={{ borderBottom: '0.5px solid var(--border)' }}>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Gestione personale</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {loading ? '...' : `${utenti.filter(u => u.attivo).length} attivi · ${utenti.filter(u => !u.attivo).length} disattivati`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!showForm && (
              <button onClick={apriNuovo}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                      style={{ background: 'var(--hotel-amber)' }}>
                <UserPlus size={13} /> Nuovo dipendente
              </button>
            )}
            <button onClick={onChiudi} className="p-1.5 rounded-lg"
                    style={{ color: 'var(--muted-foreground)', border: '0.5px solid var(--border)' }}>
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-3">

          {/* Form nuovo / modifica */}
          {showForm && (
            <div className="rounded-xl p-4 flex flex-col gap-3"
                 style={{ background: 'var(--background)', border: '0.5px solid var(--hotel-amber)' }}>
              <p className="text-[12px] font-semibold" style={{ color: 'var(--foreground)' }}>
                {editingId ? 'Modifica dipendente' : 'Nuovo dipendente'}
              </p>
              <form onSubmit={salva} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  {[['nome','Nome *'],['cognome','Cognome *']].map(([k,lbl]) => (
                    <div key={k}>
                      <label className="text-[10px] font-medium mb-0.5 block" style={{ color: 'var(--muted-foreground)' }}>{lbl}</label>
                      <input required value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                             className="w-full px-2 rounded-lg text-sm outline-none"
                             style={{ height: '34px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-[10px] font-medium mb-0.5 block" style={{ color: 'var(--muted-foreground)' }}>Email *</label>
                  <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                         className="w-full px-2 rounded-lg text-sm outline-none"
                         style={{ height: '34px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-medium mb-0.5 block" style={{ color: 'var(--muted-foreground)' }}>Ruolo *</label>
                    <select required value={form.ruolo} onChange={e => setForm({ ...form, ruolo: e.target.value })}
                            className="w-full px-2 rounded-lg text-sm outline-none capitalize"
                            style={{ height: '34px', border: '0.5px solid var(--border)', background: 'var(--card)' }}>
                      {ruoliDisponibili.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium mb-0.5 block" style={{ color: 'var(--muted-foreground)' }}>
                      {editingId ? 'Nuova password (lascia vuoto per non cambiare)' : 'Password *'}
                    </label>
                    <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                           minLength={form.password ? 8 : undefined}
                           placeholder={editingId ? '••••••••' : 'min. 8 caratteri'}
                           className="w-full px-2 rounded-lg text-sm outline-none"
                           style={{ height: '34px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
                  </div>
                </div>
                {errore && <p className="text-[12px]" style={{ color: 'var(--status-red-text)' }}>{errore}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={invio}
                          className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                          style={{ background: 'var(--hotel-navy)' }}>
                    {invio ? 'Salvataggio...' : editingId ? 'Aggiorna' : 'Crea dipendente'}
                  </button>
                  <button type="button" onClick={annullaForm}
                          className="px-4 py-2 rounded-lg text-sm"
                          style={{ border: '0.5px solid var(--border)', color: 'var(--muted-foreground)' }}>
                    Annulla
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Lista utenti */}
          {loading ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
          ) : (
            <div className="flex flex-col gap-1">
              {utenti.map(u => {
                const col = RUOLO_COLORE[u.ruolo] || RUOLO_COLORE.dipendente;
                return (
                  <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                       style={{
                         background: u.attivo ? 'var(--background)' : 'transparent',
                         border: '0.5px solid var(--border)',
                         opacity: u.attivo ? 1 : 0.5,
                       }}>
                    {/* Avatar iniziali */}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
                         style={{ background: col.bg, color: col.text }}>
                      {u.nome?.[0]}{u.cognome?.[0]}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                        {u.nome} {u.cognome}
                        {!u.attivo && <span className="ml-2 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>(disattivato)</span>}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--muted-foreground)' }}>{u.email}</p>
                    </div>
                    {/* Badge ruolo */}
                    <span className="text-[10px] font-medium px-2 py-1 rounded-md capitalize shrink-0 hidden sm:inline"
                          style={{ background: col.bg, color: col.text }}>
                      {u.ruolo.replace('_', ' ')}
                    </span>
                    {/* Azioni */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => apriModifica(u)} title="Modifica"
                              className="p-1.5 rounded-lg"
                              style={{ border: '0.5px solid var(--border)', color: 'var(--foreground)' }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => toggleAttivo(u)}
                              title={u.attivo ? 'Disattiva' : 'Riattiva'}
                              className="p-1.5 rounded-lg"
                              style={{
                                border: '0.5px solid var(--border)',
                                color: u.attivo ? 'var(--status-red-text)' : 'var(--status-green-text)',
                              }}>
                        {u.attivo ? <PowerOff size={13} /> : <Power size={13} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dialog conferma disattivazione */}
        {confermaDisattiva && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl"
               style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="rounded-xl p-5 max-w-xs w-full mx-4"
                 style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
              <p className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground)' }}>Disattiva utente</p>
              <p className="text-[13px] mb-4" style={{ color: 'var(--muted-foreground)' }}>
                Disattivando <strong>{confermaDisattiva.nome} {confermaDisattiva.cognome}</strong> non potrà più accedere al sistema.
                I dati storici (timbrature, turni, ecc.) restano intatti.
              </p>
              <div className="flex gap-2">
                <button onClick={confermaDiattiva}
                        className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ background: 'var(--status-red-text)' }}>
                  Disattiva
                </button>
                <button onClick={() => setConfermaDisattiva(null)}
                        className="flex-1 py-2 rounded-lg text-sm"
                        style={{ border: '0.5px solid var(--border)', color: 'var(--muted-foreground)' }}>
                  Annulla
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pannello impostazioni turni standard ─────────────────────────────────────
function TurniStandardPanel({ utenti, onChiudi }) {
  const [standards, setStandards] = useState([]);
  const [editing, setEditing] = useState(null); // user_id in editing
  const [form, setForm] = useState({ tipo_turno: 'mattina', ora_inizio: '07:00', ora_fine: '15:00', note: '' });
  const [invio, setInvio] = useState(false);

  const carica = useCallback(async () => {
    try { const r = await api.get('/hr/turni-standard'); setStandards(r.data.turniStandard); } catch {}
  }, []);

  useEffect(() => { carica(); }, [carica]);

  const standardMap = {};
  for (const s of standards) standardMap[s.user_id] = s;

  function apriEdit(u) {
    const s = standardMap[u.id];
    setForm(s
      ? { tipo_turno: s.tipo_turno, ora_inizio: s.ora_inizio?.slice(0,5) || '', ora_fine: s.ora_fine?.slice(0,5) || '', note: s.note || '' }
      : { tipo_turno: 'mattina', ora_inizio: '07:00', ora_fine: '15:00', note: '' }
    );
    setEditing(u.id);
  }

  async function salva(e) {
    e.preventDefault();
    setInvio(true);
    try {
      await api.post('/hr/turni-standard', { user_id: editing, ...form });
      await carica();
      setEditing(null);
    } catch {} finally { setInvio(false); }
  }

  async function rimuovi(user_id) {
    try { await api.delete(`/hr/turni-standard/${user_id}`); await carica(); } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onChiudi}>
      <div className="rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
           style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}
           onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 pb-3" style={{ borderBottom: '0.5px solid var(--border)' }}>
          <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Turni standard dipendenti</p>
          <button onClick={onChiudi} className="p-1" style={{ color: 'var(--muted-foreground)' }}><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-2">
          {utenti.map(u => {
            const s = standardMap[u.id];
            const col = s ? (COLORE_TURNO[s.tipo_turno] || COLORE_TURNO.mattina) : null;
            return (
              <div key={u.id}>
                <div className="flex items-center gap-3 py-2 px-1">
                  <div className="flex-1">
                    <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{u.nome} {u.cognome}</span>
                    <span className="text-[11px] ml-2 capitalize" style={{ color: 'var(--muted-foreground)' }}>{u.ruolo}</span>
                  </div>
                  {s ? (
                    <span className="text-[11px] font-medium px-2 py-1 rounded-md"
                          style={{ background: col.bg, color: col.text }}>
                      {s.tipo_turno === 'riposo' ? 'Riposo' : `${s.ora_inizio?.slice(0,5)}–${s.ora_fine?.slice(0,5)}`}
                    </span>
                  ) : (
                    <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>—</span>
                  )}
                  <button onClick={() => apriEdit(u)}
                          className="text-[11px] px-2 py-1 rounded-md"
                          style={{ border: '0.5px solid var(--border)', color: 'var(--foreground)' }}>
                    {s ? 'Modifica' : 'Imposta'}
                  </button>
                  {s && (
                    <button onClick={() => rimuovi(u.id)} className="p-1" style={{ color: 'var(--status-red-text)' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                {editing === u.id && (
                  <form onSubmit={salva} className="mb-2 mx-1 p-3 rounded-xl flex flex-col gap-2"
                        style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
                    <div className="grid grid-cols-4 gap-1.5">
                      {PRESET_TURNI.map(p => {
                        const c = COLORE_TURNO[p.tipo_turno];
                        const attivo = form.tipo_turno === p.tipo_turno;
                        return (
                          <button key={p.label} type="button"
                                  onClick={() => setForm({ ...form, tipo_turno: p.tipo_turno, ora_inizio: p.ora_inizio, ora_fine: p.ora_fine })}
                                  className="py-1.5 rounded-lg text-xs font-bold"
                                  style={{ background: attivo ? c.bg : 'var(--muted)', color: attivo ? c.text : 'var(--muted-foreground)', border: attivo ? `2px solid ${c.bg}` : '2px solid transparent' }}>
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                    {form.tipo_turno !== 'riposo' && (
                      <div className="grid grid-cols-2 gap-2">
                        {[['ora_inizio','Inizio'],['ora_fine','Fine']].map(([k,lbl]) => (
                          <div key={k}>
                            <label className="text-[10px] font-medium mb-0.5 block" style={{ color: 'var(--muted-foreground)' }}>{lbl}</label>
                            <input type="time" value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                                   className="w-full px-2 rounded-lg text-sm outline-none"
                                   style={{ height: '32px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button type="submit" disabled={invio}
                              className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                              style={{ background: 'var(--hotel-navy)' }}>
                        {invio ? 'Salvataggio...' : 'Salva'}
                      </button>
                      <button type="button" onClick={() => setEditing(null)}
                              className="px-3 py-1.5 rounded-lg text-xs"
                              style={{ border: '0.5px solid var(--border)', color: 'var(--muted-foreground)' }}>
                        Annulla
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Modal assegna/modifica turno ────────────────────────────────────────────
function ModalTurno({ utente, data, turnoEsistente, turnoStandard, onSalva, onElimina, onChiudi }) {
  const dataLabel = new Date(data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const [form, setForm] = useState(
    turnoEsistente
      ? { ora_inizio: turnoEsistente.ora_inizio?.slice(0,5) || '', ora_fine: turnoEsistente.ora_fine?.slice(0,5) || '', tipo_turno: turnoEsistente.tipo_turno || 'mattina', note: turnoEsistente.note || '' }
      : { ora_inizio: '07:00', ora_fine: '15:00', tipo_turno: 'mattina', note: '' }
  );
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');

  function applicaStandard() {
    if (!turnoStandard) return;
    setForm({
      tipo_turno: turnoStandard.tipo_turno,
      ora_inizio: turnoStandard.ora_inizio?.slice(0,5) || '',
      ora_fine:   turnoStandard.ora_fine?.slice(0,5) || '',
      note: form.note,
    });
  }

  function selezionaPreset(p) {
    setForm({ ...form, ora_inizio: p.ora_inizio, ora_fine: p.ora_fine, tipo_turno: p.tipo_turno });
  }

  async function salva(e) {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      await onSalva({ ...form, user_id: utente.id, data });
    } catch (err) {
      const msg = err?.response?.data?.errore || err?.message || 'Errore durante il salvataggio.';
      setErrore(msg);
    } finally { setInvio(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onChiudi}>
      <div className="rounded-2xl p-5 w-full max-w-sm flex flex-col gap-4"
           style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}
           onClick={e => e.stopPropagation()}>
        <div>
          <p className="text-sm font-semibold capitalize" style={{ color: 'var(--foreground)' }}>
            {utente.nome} {utente.cognome}
          </p>
          <p className="text-[12px] capitalize" style={{ color: 'var(--muted-foreground)' }}>{dataLabel}</p>
        </div>

        {/* Turno standard */}
        {turnoStandard && (
          <button type="button" onClick={applicaStandard}
                  className="w-full py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '0.5px solid var(--border)' }}>
            ⚡ Turno standard ({turnoStandard.tipo_turno === 'riposo' ? 'Riposo' : `${turnoStandard.ora_inizio?.slice(0,5)}–${turnoStandard.ora_fine?.slice(0,5)}`})
          </button>
        )}

        {/* Preset */}
        <div className="grid grid-cols-4 gap-2">
          {PRESET_TURNI.map(p => {
            const col = COLORE_TURNO[p.tipo_turno];
            const attivo = form.tipo_turno === p.tipo_turno;
            return (
              <button key={p.label} type="button" onClick={() => selezionaPreset(p)}
                      title={p.title}
                      className="py-2 rounded-lg text-sm font-bold transition-opacity"
                      style={{
                        background: attivo ? col.bg : 'var(--muted)',
                        color:      attivo ? col.text : 'var(--muted-foreground)',
                        opacity:    attivo ? 1 : 0.6,
                        border:     attivo ? `2px solid ${col.bg}` : '2px solid transparent',
                      }}>
                {p.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={salva} className="flex flex-col gap-3">
          {form.tipo_turno !== 'riposo' && (
            <div className="grid grid-cols-2 gap-2">
              {[['ora_inizio', 'Inizio'], ['ora_fine', 'Fine']].map(([k, lbl]) => (
                <div key={k}>
                  <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>{lbl}</label>
                  <input type="time" value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                         required={form.tipo_turno !== 'riposo'}
                         className="w-full px-2 rounded-lg text-sm outline-none"
                         style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--background)' }} />
                </div>
              ))}
            </div>
          )}
          <input type="text" placeholder="Note (opzionale)" value={form.note}
                 onChange={e => setForm({ ...form, note: e.target.value })}
                 className="w-full px-3 rounded-lg text-sm outline-none"
                 style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--background)' }} />
          {errore && (
            <p className="text-[12px] px-1" style={{ color: 'var(--status-red-text)' }}>{errore}</p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={invio}
                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                    style={{ background: 'var(--hotel-navy)' }}>
              {invio ? 'Salvataggio...' : turnoEsistente ? 'Aggiorna' : 'Assegna'}
            </button>
            {turnoEsistente && (
              <button type="button" onClick={() => onElimina(turnoEsistente.id)}
                      className="px-3 py-2 rounded-lg text-sm"
                      style={{ color: 'var(--status-red-text)', border: '0.5px solid var(--border)' }}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tab Turni ────────────────────────────────────────────────────────────────
function TabTurni({ utenti, isTitolare, utenteCorrente }) {
  const [lunedi, setLunedi] = useState(() => lunediDi(new Date()));
  const [turni, setTurni] = useState([]);
  const [standards, setStandards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { utente, data, turnoEsistente }
  const [pannelloStandard, setPannelloStandard] = useState(false);

  const giorni = Array.from({ length: 7 }, (_, i) => aggiungiGiorni(lunedi, i));

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [rTurni, rStd] = await Promise.all([
        api.get(`/hr/turni?settimana=${isoDate(lunedi)}`),
        isTitolare ? api.get('/hr/turni-standard') : Promise.resolve({ data: { turniStandard: [] } }),
      ]);
      setTurni(rTurni.data.turni);
      setStandards(rStd.data.turniStandard);
    } catch {} finally { setLoading(false); }
  }, [lunedi, isTitolare]);

  useEffect(() => { carica(); }, [carica]);

  const turniMap = {};
  for (const t of turni) {
    turniMap[`${t.user_id}_${String(t.data).slice(0, 10)}`] = t;
  }

  const standardMap = {};
  for (const s of standards) standardMap[s.user_id] = s;

  async function handleSalva(payload) {
    const chiave = `${payload.user_id}_${payload.data}`;
    const esistente = turniMap[chiave];
    if (esistente) {
      await api.put(`/hr/turni/${esistente.id}`, payload);
    } else {
      await api.post('/hr/turni', payload);
    }
    setModal(null);
    await carica();
  }

  async function handleElimina(id) {
    await api.delete(`/hr/turni/${id}`);
    setModal(null);
    await carica();
  }

  const rigaUtenti = isTitolare ? utenti : [utenteCorrente].filter(Boolean);

  const labelSettimana = `${giorni[0].toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} — ${giorni[6].toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const oggi = isoDate(new Date());

  return (
    <div>
      {/* Barra superiore */}
      <div className="flex justify-between items-center mb-3">
        <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          Clicca su una cella per assegnare o modificare il turno
        </span>
        {isTitolare && (
          <button onClick={() => setPannelloStandard(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ border: '0.5px solid var(--border)', color: 'var(--foreground)' }}>
            <Settings size={13} /> Turni standard
          </button>
        )}
      </div>

      {/* Navigazione settimana */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setLunedi(aggiungiGiorni(lunedi, -7))}
                className="p-1.5 rounded-lg" style={{ border: '0.5px solid var(--border)' }}>
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium flex-1 text-center" style={{ color: 'var(--foreground)' }}>
          {labelSettimana}
        </span>
        <button onClick={() => setLunedi(aggiungiGiorni(lunedi, 7))}
                className="p-1.5 rounded-lg" style={{ border: '0.5px solid var(--border)' }}>
          <ChevronRight size={16} />
        </button>
        <button onClick={() => setLunedi(lunediDi(new Date()))}
                className="px-2 py-1 rounded-lg text-xs font-medium"
                style={{ border: '0.5px solid var(--border)', color: 'var(--muted-foreground)' }}>
          Oggi
        </button>
      </div>

      {/* Legenda */}
      <div className="flex gap-3 mb-3 flex-wrap">
        {PRESET_TURNI.map(p => {
          const col = COLORE_TURNO[p.tipo_turno];
          return (
            <span key={p.label} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: col.bg }} />
              <span style={{ color: 'var(--muted-foreground)' }}>{p.title}</span>
            </span>
          );
        })}
      </div>

      {/* Griglia */}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr>
              <th className="text-left py-2 px-3 font-medium w-32"
                  style={{ color: 'var(--muted-foreground)', borderBottom: '0.5px solid var(--border)' }}>
                Dipendente
              </th>
              {giorni.map((g, i) => {
                const isOggi = isoDate(g) === oggi;
                return (
                  <th key={i} className="text-center py-2 px-1 font-medium"
                      style={{
                        color: isOggi ? 'var(--hotel-navy)' : 'var(--muted-foreground)',
                        borderBottom: `2px solid ${isOggi ? 'var(--hotel-navy)' : 'var(--border)'}`,
                        minWidth: '80px',
                      }}>
                    <div>{GIORNI_LABEL[i]}</div>
                    <div className="text-[11px] font-normal">
                      {g.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</td></tr>
            ) : rigaUtenti.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessun dipendente.</td></tr>
            ) : rigaUtenti.map(u => (
              <tr key={u.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                <td className="py-2 px-3">
                  <span className="font-medium text-[12px]" style={{ color: 'var(--foreground)' }}>
                    {u.nome} {u.cognome}
                  </span>
                  <span className="block text-[10px] capitalize" style={{ color: 'var(--muted-foreground)' }}>{u.ruolo}</span>
                </td>
                {giorni.map((g, i) => {
                  const key = `${u.id}_${isoDate(g)}`;
                  const turno = turniMap[key];
                  const col = turno ? (COLORE_TURNO[turno.tipo_turno] || COLORE_TURNO.mattina) : null;
                  const isOggi = isoDate(g) === oggi;

                  return (
                    <td key={i} className="py-1 px-1 text-center"
                        style={{ background: isOggi ? 'rgba(27,58,92,0.04)' : 'transparent' }}>
                      {isTitolare ? (
                        <button
                          onClick={() => setModal({ utente: u, data: isoDate(g), turnoEsistente: turno || null, turnoStandard: standardMap[u.id] || null })}
                          className="w-full rounded-lg py-1.5 px-1 text-[11px] font-medium transition-opacity hover:opacity-80"
                          style={turno ? { background: col.bg, color: col.text } : { background: 'var(--muted)', color: 'var(--muted-foreground)', opacity: 0.4 }}>
                          {turno
                            ? turno.tipo_turno === 'riposo'
                              ? 'Riposo'
                              : `${turno.ora_inizio?.slice(0,5) || ''}–${turno.ora_fine?.slice(0,5) || ''}`
                            : '+'
                          }
                        </button>
                      ) : (
                        turno ? (
                          <span className="inline-block rounded-lg py-1.5 px-2 text-[11px] font-medium"
                                style={{ background: col.bg, color: col.text }}>
                            {turno.tipo_turno === 'riposo'
                              ? 'Riposo'
                              : `${turno.ora_inizio?.slice(0,5) || ''}–${turno.ora_fine?.slice(0,5) || ''}`
                            }
                          </span>
                        ) : (
                          <span className="text-[11px]" style={{ color: 'var(--muted-foreground)', opacity: 0.4 }}>—</span>
                        )
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <ModalTurno
          utente={modal.utente}
          data={modal.data}
          turnoEsistente={modal.turnoEsistente}
          turnoStandard={modal.turnoStandard}
          onSalva={handleSalva}
          onElimina={handleElimina}
          onChiudi={() => setModal(null)}
        />
      )}

      {pannelloStandard && (
        <TurniStandardPanel
          utenti={utenti}
          onChiudi={() => { setPannelloStandard(false); carica(); }}
        />
      )}
    </div>
  );
}

// ── Tab Presenze ─────────────────────────────────────────────────────────────
function TabPresenze() {
  const [presenti, setPresenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [esportando, setEsportando] = useState(false);
  const [scaricandoReport, setScaricandoReport] = useState(false);

  const oggi = new Date().toISOString().split('T')[0];
  const primoMese = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const meseCorrente = oggi.slice(0, 7);
  const [da, setDa] = useState(primoMese);
  const [a, setA]   = useState(oggi);
  const [meseReport, setMeseReport] = useState(meseCorrente);

  useEffect(() => {
    api.get('/hr/timbrature/presenti')
      .then(r => setPresenti(r.data.presenti))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function scaricaFile(url, nomeFile, setSt) {
    setSt(true);
    try {
      const Cookies = (await import('js-cookie')).default;
      const token = Cookies.get('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${url}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = nomeFile;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch { alert('Errore durante il download.'); }
    finally { setSt(false); }
  }

  if (loading) return <p className="text-sm py-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>;

  return (
    <>
      <p className="text-[13px] mb-4" style={{ color: 'var(--muted-foreground)' }}>
        {presenti.length} {presenti.length === 1 ? 'persona in struttura' : 'persone in struttura'} in questo momento
      </p>
      <DataTable
        colonne={[
          { header: 'Dipendente', accessor: r => <span className="font-medium">{r.nome} {r.cognome}</span> },
          { header: 'Ruolo',   accessor: 'ruolo' },
          { header: 'Entrata', accessor: r => fmtOra(r.timestamp) },
        ]}
        dati={presenti}
        emptyText="Nessuno in struttura in questo momento."
      />

      {/* Export timbrature grezze */}
      <div className="mt-6 pt-4" style={{ borderTop: '0.5px solid var(--border)' }}>
        <p className="text-[13px] font-medium mb-3" style={{ color: 'var(--foreground)' }}>Esporta timbrature</p>
        <div className="flex flex-wrap items-end gap-3">
          {[['da', 'Dal', da, setDa], ['a', 'Al', a, setA]].map(([, lbl, val, set]) => (
            <div key={lbl}>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>{lbl}</label>
              <input type="date" value={val} onChange={e => set(e.target.value)}
                     className="px-2 rounded-lg text-sm outline-none"
                     style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
            </div>
          ))}
          <button onClick={() => scaricaFile(`/hr/timbrature/export?da=${da}&a=${a}`, `timbrature_${da}_${a}.xlsx`, setEsportando)}
                  disabled={esportando}
                  className="flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ height: '36px', background: 'var(--hotel-navy)' }}>
            <Download size={15} />
            {esportando ? 'Esportazione...' : 'Scarica Excel'}
          </button>
        </div>
      </div>

      {/* Report mensile per consulente */}
      <div className="mt-5 pt-4" style={{ borderTop: '0.5px solid var(--border)' }}>
        <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--foreground)' }}>Report mensile — Consulente del lavoro</p>
        <p className="text-[11px] mb-3" style={{ color: 'var(--muted-foreground)' }}>
          Include ore lavorate, ferie, malattia e permessi per ogni dipendente
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Mese</label>
            <input type="month" value={meseReport} onChange={e => setMeseReport(e.target.value)}
                   className="px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <button onClick={() => scaricaFile(`/hr/timbrature/report-mensile?mese=${meseReport}`, `report_${meseReport}.xlsx`, setScaricandoReport)}
                  disabled={scaricandoReport}
                  className="flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ height: '36px', background: 'var(--hotel-amber)' }}>
            <FileText size={15} />
            {scaricandoReport ? 'Generazione...' : 'Scarica Report'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Tab Ferie / Permessi ─────────────────────────────────────────────────────
function TabFerie() {
  const [richieste, setRichieste] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ tipo: 'ferie', data_inizio: '', data_fine: '', note: '' });
  const [aperto, setAperto] = useState(false);
  const [invio, setInvio] = useState(false);
  const { utente } = useAuth();

  const carica = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get('/hr/assenze'); setRichieste(r.data.richieste); }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { carica(); }, [carica]);

  async function invia(e) {
    e.preventDefault();
    setInvio(true);
    try { await api.post('/hr/assenze', form); await carica(); setAperto(false); }
    catch {} finally { setInvio(false); }
  }

  async function cambiaStato(id, stato) {
    try { await api.patch(`/hr/assenze/${id}/stato`, { stato }); await carica(); } catch {}
  }

  const BADGE = { in_attesa: 'amber', approvata: 'green', rifiutata: 'red' };
  const LABEL = { in_attesa: 'In attesa', approvata: 'Approvata', rifiutata: 'Rifiutata' };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-[13px]" style={{ color: 'var(--muted-foreground)' }}>
          {richieste.filter(r => r.stato === 'in_attesa').length} in attesa di approvazione
        </p>
        <button onClick={() => setAperto(!aperto)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--hotel-amber)' }}>
          <Plus size={12} /> Nuova richiesta
        </button>
      </div>

      {aperto && (
        <form onSubmit={invia} className="rounded-xl p-4 mb-4 flex flex-col gap-3"
              style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <div className="grid grid-cols-3 gap-2">
            {['ferie', 'permesso', 'malattia'].map(t => (
              <button key={t} type="button" onClick={() => setForm({ ...form, tipo: t })}
                      className="py-2 rounded-lg text-xs font-medium capitalize"
                      style={{
                        background: form.tipo === t ? 'var(--hotel-navy)' : 'var(--card)',
                        color: form.tipo === t ? 'white' : 'var(--foreground)',
                        border: '0.5px solid var(--border)',
                      }}>{t}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[['data_inizio', 'Dal'], ['data_fine', 'Al']].map(([k, lbl]) => (
              <div key={k}>
                <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>{lbl}</label>
                <input type="date" required value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                       className="w-full px-2 rounded-lg text-sm outline-none"
                       style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
              </div>
            ))}
          </div>
          <textarea placeholder="Note (opzionale)" value={form.note}
                    onChange={e => setForm({ ...form, note: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                    style={{ border: '0.5px solid var(--border)', background: 'var(--card)' }} rows={2} />
          <button type="submit" disabled={invio}
                  className="py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-amber)' }}>
            {invio ? 'Invio...' : 'Invia richiesta'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-center py-6 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      ) : (
        <DataTable
          colonne={[
            { header: 'Dipendente', accessor: r => `${r.nome} ${r.cognome}` },
            { header: 'Tipo',   accessor: r => <span className="capitalize">{r.tipo}</span> },
            { header: 'Dal',    accessor: r => fmtData(r.data_inizio) },
            { header: 'Al',     accessor: r => fmtData(r.data_fine) },
            { header: 'Stato',  accessor: r => <StatusBadge status={BADGE[r.stato]} label={LABEL[r.stato]} /> },
            { header: '', accessor: r => (utente?.ruolo === 'titolare' && r.stato === 'in_attesa') ? (
              <div className="flex gap-1">
                <button onClick={() => cambiaStato(r.id, 'approvata')} title="Approva"
                        className="p-1 rounded" style={{ color: 'var(--status-green-text)' }}><Check size={14} /></button>
                <button onClick={() => cambiaStato(r.id, 'rifiutata')} title="Rifiuta"
                        className="p-1 rounded" style={{ color: 'var(--status-red-text)' }}><X size={14} /></button>
              </div>
            ) : null },
          ]}
          dati={richieste}
          emptyText="Nessuna richiesta."
        />
      )}
    </div>
  );
}

// ── Tab Scadenze ─────────────────────────────────────────────────────────────
function TabScadenze({ utenti }) {
  const [scadenze, setScadenze] = useState([]);
  const [aperto, setAperto] = useState(false);
  const [form, setForm] = useState({ user_id: '', tipo: '', data_scadenza: '', giorni_alert: 30, note: '' });
  const [invio, setInvio] = useState(false);

  const carica = useCallback(async () => {
    try { const r = await api.get('/hr/scadenze'); setScadenze(r.data.scadenze); } catch {}
  }, []);

  useEffect(() => { carica(); }, [carica]);

  async function salva(e) {
    e.preventDefault();
    setInvio(true);
    try { await api.post('/hr/scadenze', form); await carica(); setAperto(false); }
    catch {} finally { setInvio(false); }
  }

  async function elimina(id) {
    if (!confirm('Eliminare questa scadenza?')) return;
    try { await api.delete(`/hr/scadenze/${id}`); await carica(); } catch {}
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setAperto(!aperto)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--hotel-amber)' }}>
          <Plus size={12} /> Nuova scadenza
        </button>
      </div>

      {aperto && (
        <form onSubmit={salva} className="rounded-xl p-4 mb-4 grid grid-cols-2 gap-3"
              style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <div className="col-span-2">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Dipendente *</label>
            <select required value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}
                    className="w-full px-2 rounded-lg text-sm outline-none"
                    style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }}>
              <option value="">Seleziona...</option>
              {utenti.map(u => <option key={u.id} value={u.id}>{u.nome} {u.cognome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Tipo *</label>
            <input type="text" required placeholder="Es: visita medica" value={form.tipo}
                   onChange={e => setForm({ ...form, tipo: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Scadenza *</label>
            <input type="date" required value={form.data_scadenza}
                   onChange={e => setForm({ ...form, data_scadenza: e.target.value })}
                   className="w-full px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Alert (giorni prima)</label>
            <input type="number" min="1" max="365" value={form.giorni_alert}
                   onChange={e => setForm({ ...form, giorni_alert: parseInt(e.target.value) || 30 })}
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

      <DataTable
        colonne={[
          { header: 'Dipendente',    accessor: r => `${r.nome} ${r.cognome}` },
          { header: 'Tipo',          accessor: 'tipo' },
          { header: 'Scadenza',      accessor: r => fmtData(r.data_scadenza) },
          { header: 'Giorni mancanti', accessor: r => (
            <StatusBadge
              status={r.giorni_mancanti <= 7 ? 'red' : r.giorni_mancanti <= 30 ? 'amber' : 'green'}
              label={`${r.giorni_mancanti} gg`}
            />
          )},
          { header: '', accessor: r => (
            <button onClick={() => elimina(r.id)} className="p-1 rounded"
                    style={{ color: 'var(--status-red-text)' }}><Trash2 size={13} /></button>
          )},
        ]}
        dati={scadenze}
        emptyText="Nessuna scadenza registrata."
      />
    </div>
  );
}

// ── Tab Documenti ─────────────────────────────────────────────────────────────
function TabDocumenti({ utenti }) {
  const [documenti, setDocumenti] = useState([]);
  const [aperto, setAperto] = useState(false);
  const [form, setForm] = useState({ user_id: '', tipo: 'busta_paga', data_documento: '' });
  const [file, setFile] = useState(null);
  const [invio, setInvio] = useState(false);
  const fileRef = useRef(null);

  const carica = useCallback(async () => {
    try { const r = await api.get('/hr/documenti'); setDocumenti(r.data.documenti); } catch {}
  }, []);

  useEffect(() => { carica(); }, [carica]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setInvio(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('user_id', form.user_id);
      fd.append('tipo', form.tipo);
      if (form.data_documento) fd.append('data_documento', form.data_documento);
      await api.post('/hr/documenti', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await carica();
      setAperto(false);
      setFile(null);
    } catch {} finally { setInvio(false); }
  }

  async function elimina(id) {
    if (!confirm('Eliminare questo documento?')) return;
    try { await api.delete(`/hr/documenti/${id}`); await carica(); } catch {}
  }

  const TIPI = ['busta_paga', 'cud', 'contratto', 'certificato', 'altro'];

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setAperto(!aperto)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--hotel-amber)' }}>
          <Upload size={12} /> Carica documento
        </button>
      </div>

      {aperto && (
        <form onSubmit={handleUpload} className="rounded-xl p-4 mb-4 flex flex-col gap-3"
              style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <select required value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}
                  className="w-full px-2 rounded-lg text-sm outline-none"
                  style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }}>
            <option value="">Seleziona dipendente...</option>
            {utenti.map(u => <option key={u.id} value={u.id}>{u.nome} {u.cognome}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
                    className="px-2 rounded-lg text-sm outline-none"
                    style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }}>
              {TIPI.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
            <input type="date" value={form.data_documento}
                   onChange={e => setForm({ ...form, data_documento: e.target.value })}
                   className="px-2 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
                 onChange={e => setFile(e.target.files[0])}
                 className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full py-2 rounded-lg text-sm text-left px-3"
                  style={{ border: '0.5px dashed var(--border)', color: file ? 'var(--foreground)' : 'var(--muted-foreground)', background: 'var(--card)' }}>
            {file ? `📄 ${file.name}` : '📂 Clicca per scegliere un file (PDF, JPG, PNG)'}
          </button>
          <button type="submit" disabled={invio}
                  className="py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-amber)' }}>
            {invio ? 'Caricamento...' : 'Carica'}
          </button>
        </form>
      )}

      <DataTable
        colonne={[
          { header: 'Dipendente', accessor: r => `${r.nome} ${r.cognome}` },
          { header: 'Tipo',       accessor: r => <span className="capitalize">{r.tipo?.replace('_', ' ')}</span> },
          { header: 'Data doc.',  accessor: r => fmtData(r.data_documento) },
          { header: 'Caricato',   accessor: r => fmtData(r.uploaded_at) },
          { header: '', accessor: r => (
            <div className="flex gap-1">
              <button onClick={async () => {
                        try {
                          const token = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('token='))?.split('=')[1];
                          const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';
                          const res = await fetch(`${base}/hr/documenti/${r.id}/download`, {
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          if (!res.ok) return;
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url; a.download = r.filename || `documento_${r.id}`;
                          a.click(); URL.revokeObjectURL(url);
                        } catch {}
                      }} title="Scarica"
                      className="p-1 rounded inline-flex" style={{ color: 'var(--status-blue-text)' }}>
                <Download size={13} />
              </button>
              <button onClick={() => elimina(r.id)} title="Elimina"
                      className="p-1 rounded" style={{ color: 'var(--status-red-text)' }}>
                <Trash2 size={13} />
              </button>
            </div>
          )},
        ]}
        dati={documenti}
        emptyText="Nessun documento caricato."
      />

      {/* Scarica per tipo */}
      <DownloadZipDocumenti utenti={utenti} />
    </div>
  );
}

function DownloadZipDocumenti({ utenti }) {
  const TIPI = ['busta_paga', 'cud', 'contratto', 'certificato', 'altro'];
  const [tipo, setTipo] = useState('cud');
  const [anno, setAnno] = useState(new Date().getFullYear().toString());
  const [userId, setUserId] = useState('');
  const [scaricando, setScaricando] = useState(false);

  async function scaricaZip() {
    setScaricando(true);
    try {
      const Cookies = (await import('js-cookie')).default;
      const token = Cookies.get('token');
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';
      const params = new URLSearchParams({ tipo });
      if (anno) params.set('anno', anno);
      if (userId) params.set('user_id', userId);
      const res = await fetch(`${base}/hr/documenti/download-zip?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Errore ${res.status}: ${err.errore || 'sconosciuto'}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dipendente = userId ? utenti.find(u => String(u.id) === userId) : null;
      const suffisso = dipendente ? `_${dipendente.cognome}` : '';
      a.download = anno ? `${tipo}${suffisso}_${anno}.zip` : `${tipo}${suffisso}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Errore durante il download.'); }
    finally { setScaricando(false); }
  }

  return (
    <div className="mt-5 pt-4" style={{ borderTop: '0.5px solid var(--border)' }}>
      <p className="text-[13px] font-medium mb-3" style={{ color: 'var(--foreground)' }}>Scarica documenti per tipo</p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)}
                  className="px-2 rounded-lg text-sm outline-none capitalize"
                  style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}>
            {TIPI.map(t => <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Dipendente (opzionale)</label>
          <select value={userId} onChange={e => setUserId(e.target.value)}
                  className="px-2 rounded-lg text-sm outline-none"
                  style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}>
            <option value="">Tutti</option>
            {utenti.map(u => <option key={u.id} value={u.id}>{u.cognome} {u.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Anno (opzionale)</label>
          <input type="number" value={anno} onChange={e => setAnno(e.target.value)}
                 placeholder="tutti"
                 className="px-2 rounded-lg text-sm outline-none w-24"
                 style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)' }} />
        </div>
        <button onClick={scaricaZip} disabled={scaricando}
                className="flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                style={{ height: '36px', background: 'var(--hotel-navy)' }}>
          <Download size={15} />
          {scaricando ? 'Preparazione ZIP...' : 'Scarica ZIP'}
        </button>
      </div>
    </div>
  );
}

// ── Tab Bacheca ───────────────────────────────────────────────────────────────
function TabBacheca() {
  const [comunicazioni, setComunicazioni] = useState([]);
  const [aperto, setAperto] = useState(false);
  const [form, setForm] = useState({ titolo: '', testo: '', ruoli_destinatari: [] });
  const [invio, setInvio] = useState(false);
  const { utente } = useAuth();
  const RUOLI = ['receptionist', 'cameriere', 'cuoco', 'dipendente'];

  const carica = useCallback(async () => {
    try { const r = await api.get('/hr/comunicazioni'); setComunicazioni(r.data.comunicazioni); } catch {}
  }, []);

  useEffect(() => { carica(); }, [carica]);

  async function invia(e) {
    e.preventDefault();
    setInvio(true);
    try { await api.post('/hr/comunicazioni', form); await carica(); setAperto(false); }
    catch {} finally { setInvio(false); }
  }

  async function elimina(id) {
    if (!confirm('Eliminare questa comunicazione?')) return;
    try { await api.delete(`/hr/comunicazioni/${id}`); await carica(); } catch {}
  }

  function toggleRuolo(r) {
    const lista = form.ruoli_destinatari.includes(r)
      ? form.ruoli_destinatari.filter(x => x !== r)
      : [...form.ruoli_destinatari, r];
    setForm({ ...form, ruoli_destinatari: lista });
  }

  return (
    <div>
      {utente?.ruolo === 'titolare' && (
        <div className="flex justify-end mb-3">
          <button onClick={() => setAperto(!aperto)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: 'var(--hotel-amber)' }}>
            <Plus size={12} /> Nuova comunicazione
          </button>
        </div>
      )}

      {aperto && (
        <form onSubmit={invia} className="rounded-xl p-4 mb-4 flex flex-col gap-3"
              style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <input type="text" required placeholder="Titolo" value={form.titolo}
                 onChange={e => setForm({ ...form, titolo: e.target.value })}
                 className="w-full px-3 rounded-lg text-sm outline-none"
                 style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          <textarea required placeholder="Testo comunicazione..." value={form.testo}
                    onChange={e => setForm({ ...form, testo: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                    style={{ border: '0.5px solid var(--border)', background: 'var(--card)' }} rows={3} />
          <div>
            <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
              Destinatari (vuoto = tutti)
            </p>
            <div className="flex flex-wrap gap-2">
              {RUOLI.map(r => (
                <button key={r} type="button" onClick={() => toggleRuolo(r)}
                        className="px-3 py-1 rounded-full text-xs font-medium capitalize"
                        style={{
                          background: form.ruoli_destinatari.includes(r) ? 'var(--hotel-navy)' : 'var(--card)',
                          color: form.ruoli_destinatari.includes(r) ? 'white' : 'var(--foreground)',
                          border: '0.5px solid var(--border)',
                        }}>{r}</button>
              ))}
            </div>
          </div>
          <button type="submit" disabled={invio}
                  className="py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-amber)' }}>
            {invio ? 'Pubblicazione...' : 'Pubblica'}
          </button>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {comunicazioni.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessuna comunicazione.</p>
        ) : comunicazioni.map(c => (
          <div key={c.id} className="rounded-xl p-4"
               style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>{c.titolo}</p>
                <p className="text-[13px] mb-2" style={{ color: 'var(--muted-foreground)' }}>{c.testo}</p>
                <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                  {c.autore_nome} {c.autore_cognome} · {fmtDataOra(c.created_at)}
                  {c.ruoli_destinatari ? ` · Per: ${c.ruoli_destinatari.join(', ')}` : ' · Per tutti'}
                </p>
              </div>
              {utente?.ruolo === 'titolare' && (
                <button onClick={() => elimina(c.id)} className="p-1 shrink-0"
                        style={{ color: 'var(--status-red-text)' }}><Trash2 size={14} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab Note Cucina ───────────────────────────────────────────────────────────
function TabOspiti() {
  const oggi = new Date().toISOString().split('T')[0];
  const [data, setData] = useState(oggi);
  const [form, setForm] = useState({ coperti_colazione: 0, coperti_pranzo: 0, coperti_cena: 0, note_allergie: '' });
  const [invio, setInvio] = useState(false);
  const [salvato, setSalvato] = useState(false);

  useEffect(() => {
    api.get(`/hr/ospiti?data=${data}`)
      .then(r => setForm({
        coperti_colazione: r.data.ospiti.coperti_colazione,
        coperti_pranzo:    r.data.ospiti.coperti_pranzo,
        coperti_cena:      r.data.ospiti.coperti_cena,
        note_allergie:     r.data.ospiti.note_allergie || '',
      }))
      .catch(() => {});
  }, [data]);

  async function salva(e) {
    e.preventDefault();
    setInvio(true);
    try {
      await api.post('/hr/ospiti', { data, ...form });
      setSalvato(true);
      setTimeout(() => setSalvato(false), 3000);
    } catch {} finally { setInvio(false); }
  }

  return (
    <form onSubmit={salva} className="max-w-sm flex flex-col gap-4">
      <div>
        <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>Data</label>
        <input type="date" value={data} onChange={e => setData(e.target.value)}
               className="px-3 rounded-lg text-sm outline-none"
               style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[['coperti_colazione', 'Colazione'], ['coperti_pranzo', 'Pranzo'], ['coperti_cena', 'Cena']].map(([k, lbl]) => (
          <div key={k} className="text-center">
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>{lbl}</label>
            <input type="number" min="0" max="200" value={form[k]}
                   onChange={e => setForm({ ...form, [k]: parseInt(e.target.value) || 0 })}
                   className="w-full text-center rounded-lg text-xl font-medium outline-none"
                   style={{ height: '52px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
          </div>
        ))}
      </div>
      <div>
        <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--muted-foreground)' }}>
          Allergie / intolleranze ospiti
        </label>
        <textarea value={form.note_allergie} onChange={e => setForm({ ...form, note_allergie: e.target.value })}
                  placeholder="Es: camera 5 celiaco, camera 8 intollerante al lattosio..."
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ border: '0.5px solid var(--border)', background: 'var(--card)' }} rows={3} />
      </div>
      <button type="submit" disabled={invio}
              className="py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
              style={{ background: 'var(--hotel-amber)' }}>
        {invio ? 'Salvataggio...' : 'Salva note cucina'}
      </button>
      {salvato && (
        <p className="text-[13px] text-center" style={{ color: 'var(--status-green-text)' }}>
          Note salvate correttamente.
        </p>
      )}
    </form>
  );
}

// ── Pagina principale ─────────────────────────────────────────────────────────
export default function PaginaPersonale() {
  const { utente } = useAuth();
  const isTitolare = utente?.ruolo === 'titolare' || utente?.ruolo === 'admin';
  const isAdmin = utente?.ruolo === 'admin';
  const [tabAttiva, setTabAttiva] = useState(isTitolare ? 'presenze' : 'turni');
  const [utenti, setUtenti] = useState([]);
  const [pannelloGestione, setPannelloGestione] = useState(false);

  const tabs = isTitolare ? TABS_TITOLARE : TABS_DIPENDENTE;

  const ricaricaUtenti = useCallback(() => {
    if (isTitolare) {
      api.get('/users').then(r => setUtenti(r.data.utenti.filter(u => u.attivo))).catch(() => {});
    }
  }, [isTitolare]);

  useEffect(() => { ricaricaUtenti(); }, [ricaricaUtenti]);

  return (
    <AppShell titolo="Personale">
      <div className="flex items-center gap-2 mb-5">
        <div className="flex gap-1 overflow-x-auto pb-1 flex-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTabAttiva(t.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
                    style={{
                      background: tabAttiva === t.id ? 'var(--hotel-navy)' : 'var(--card)',
                      color:      tabAttiva === t.id ? 'white' : 'var(--muted-foreground)',
                      border:     '0.5px solid var(--border)',
                    }}>
              {t.label}
            </button>
          ))}
        </div>
        {isTitolare && (
          <button onClick={() => setPannelloGestione(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0"
                  style={{ border: '0.5px solid var(--border)', color: 'var(--foreground)', background: 'var(--card)' }}>
            <Users size={13} /> Gestione personale
          </button>
        )}
      </div>

      {tabAttiva === 'presenze'  && <TabPresenze />}
      {tabAttiva === 'turni'     && <TabTurni utenti={utenti} isTitolare={isTitolare} utenteCorrente={utente} />}
      {tabAttiva === 'ferie'     && <TabFerie />}
      {tabAttiva === 'scadenze'  && <TabScadenze utenti={utenti} />}
      {tabAttiva === 'documenti' && <TabDocumenti utenti={utenti} />}
      {tabAttiva === 'bacheca'   && <TabBacheca />}
      {tabAttiva === 'ospiti'    && <TabOspiti />}

      {pannelloGestione && (
        <ModalGestionePersonale
          isAdmin={isAdmin}
          onChiudi={() => { setPannelloGestione(false); ricaricaUtenti(); }}
        />
      )}
    </AppShell>
  );
}
