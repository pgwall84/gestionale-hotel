'use client';

// AppShell — wrapper principale che compone Sidebar + Topbar + contenuto.
// Tutte le pagine della dashboard usano questo componente.
// Layout desktop: sidebar fissa sinistra | topbar + contenuto scrollabile a destra.
// Layout mobile: contenuto fullwidth + bottom nav fissa in basso.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

interface AppShellProps {
  children: React.ReactNode;
  titolo: string;           // Titolo mostrato nella topbar desktop
  sottotitolo?: string;
  azioneLabel?: string;     // Pulsante primario topbar (opzionale)
  onAzione?: () => void;
  alertCount?: number;
}

export default function AppShell({ children, titolo, sottotitolo, azioneLabel, onAzione, alertCount }: AppShellProps) {
  const { utente, loading } = useAuth();
  const router = useRouter();

  // Protezione globale: se non autenticato rimanda al login
  useEffect(() => {
    if (!loading && !utente) {
      router.replace('/login');
    }
  }, [utente, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--hotel-navy)' }}>
        <p className="text-white text-sm">Caricamento...</p>
      </div>
    );
  }

  if (!utente) return null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--background)' }}>

      {/* Sidebar fissa a sinistra (desktop) / bottom nav (mobile) */}
      <Sidebar />

      {/* Area destra: topbar + contenuto scrollabile */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Topbar — visibile solo su desktop */}
        <Topbar
          titolo={titolo}
          sottotitolo={sottotitolo}
          azioneLabel={azioneLabel}
          onAzione={onAzione}
          alertCount={alertCount}
        />

        {/* Contenuto principale con scroll */}
        <main
          className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6"
          // pb-20 su mobile lascia spazio alla bottom nav
        >
          {children}
        </main>
      </div>
    </div>
  );
}
