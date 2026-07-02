'use client';

// Pagina login — sfondo navy, card bianca centrata, pulsante ambra.
// Toggle mostra/nascondi password. Nessun link registrazione.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function PaginaLogin() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostraPassword, setMostraPassword] = useState(false);
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrore('');
    setCaricamento(true);
    try {
      await login(email, password);
      router.replace('/home');
    } catch (err) {
      setErrore(err?.response?.data?.errore || 'Errore di connessione. Riprova.');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'var(--hotel-navy)' }}
    >
      {/* Nome hotel sopra la card */}
      <p className="text-white/60 text-sm mb-6 tracking-wide uppercase">Hotel Gestionale</p>

      {/* Card login */}
      <div className="w-full max-w-sm rounded-xl p-8" style={{ background: 'var(--card)' }}>
        <h1 className="text-xl font-medium mb-1" style={{ color: 'var(--foreground)' }}>Accedi</h1>
        <p className="text-[13px] mb-6" style={{ color: 'var(--muted-foreground)' }}>
          Inserisci le tue credenziali per continuare
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          <div>
            <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nome@hotel.it"
              required
              autoComplete="email"
              className="w-full px-3 rounded-lg text-sm outline-none"
              style={{ height: '44px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            />
          </div>

          {/* Password con toggle mostra/nascondi */}
          <div>
            <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
              Password
            </label>
            <div className="relative">
              <input
                type={mostraPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full px-3 pr-10 rounded-lg text-sm outline-none"
                style={{ height: '44px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
              />
              <button
                type="button"
                onClick={() => setMostraPassword(!mostraPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--muted-foreground)' }}
                tabIndex={-1}
              >
                {mostraPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {errore && (
            <div className="px-3 py-2.5 rounded-lg text-[13px]"
                 style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
              {errore}
            </div>
          )}

          <button
            type="submit"
            disabled={caricamento}
            className="w-full font-medium text-sm text-white rounded-lg transition-colors disabled:opacity-60"
            style={{ height: '44px', background: 'var(--hotel-amber)' }}
            onMouseEnter={e => { if (!caricamento) e.currentTarget.style.background = 'var(--hotel-amber-dark)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--hotel-amber)'; }}
          >
            {caricamento ? 'Accesso in corso...' : 'Accedi'}
          </button>
        </form>
      </div>

      <p className="text-white/30 text-xs mt-6">Problemi di accesso? Contatta il titolare.</p>
    </div>
  );
}
