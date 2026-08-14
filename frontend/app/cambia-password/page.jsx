'use client';

// Cambia password — self-service, raggiungibile da qualunque utente
// autenticato (link "Cambia password" in Sidebar, desktop e mobile).
// Distinta dal reset fatto da admin/titolare in /utenti: qui bisogna
// conoscere la password attuale (POST /api/auth/cambia-password).
// Aggiunta 13/08/2026 — Fase A provisioning dipendenti (CLAUDE.md Sezione 16).

import { useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import api from '@/lib/api';

export default function CambiaPassword() {
  const [passwordAttuale, setPasswordAttuale] = useState('');
  const [nuovaPassword, setNuovaPassword] = useState('');
  const [confermaPassword, setConfermaPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [successo, setSuccesso] = useState('');
  const [salvataggio, setSalvataggio] = useState(false);

  async function handleSalva(e) {
    e.preventDefault();
    setErrore('');
    setSuccesso('');

    if (nuovaPassword.length < 8) {
      setErrore('La nuova password deve avere almeno 8 caratteri.');
      return;
    }
    if (nuovaPassword !== confermaPassword) {
      setErrore('Le due password non coincidono.');
      return;
    }

    setSalvataggio(true);
    try {
      await api.post('/auth/cambia-password', { passwordAttuale, nuovaPassword });
      setSuccesso('Password aggiornata.');
      setPasswordAttuale('');
      setNuovaPassword('');
      setConfermaPassword('');
    } catch (err) {
      setErrore(err?.response?.data?.errore || 'Errore durante il salvataggio.');
    } finally {
      setSalvataggio(false);
    }
  }

  return (
    <AppShell titolo="Cambia password">
      <div className="max-w-md">
        <div className="rounded-xl p-6" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          <form onSubmit={handleSalva} className="flex flex-col gap-4">

            <div>
              <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                Password attuale *
              </label>
              <input type="password" value={passwordAttuale} required
                     onChange={e => setPasswordAttuale(e.target.value)}
                     className="w-full px-3 rounded-lg text-sm outline-none"
                     style={{ height: '44px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
            </div>

            <div>
              <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                Nuova password *
              </label>
              <input type="password" value={nuovaPassword} required minLength={8}
                     placeholder="Minimo 8 caratteri"
                     onChange={e => setNuovaPassword(e.target.value)}
                     className="w-full px-3 rounded-lg text-sm outline-none"
                     style={{ height: '44px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
            </div>

            <div>
              <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                Conferma nuova password *
              </label>
              <input type="password" value={confermaPassword} required minLength={8}
                     onChange={e => setConfermaPassword(e.target.value)}
                     className="w-full px-3 rounded-lg text-sm outline-none"
                     style={{ height: '44px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
            </div>

            {errore && (
              <div className="px-3 py-2.5 rounded-lg text-[13px]"
                   style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
                {errore}
              </div>
            )}
            {successo && (
              <div className="px-3 py-2.5 rounded-lg text-[13px]"
                   style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
                {successo}
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
