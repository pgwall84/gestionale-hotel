// Pagina radice ("/") — reindirizza in base allo stato di autenticazione.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function PaginaRadice() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (utente) {
      router.replace('/home');
    } else {
      router.replace('/login');
    }
  }, [utente, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-800">
      <p className="text-white text-xl font-medium">Caricamento...</p>
    </div>
  );
}
