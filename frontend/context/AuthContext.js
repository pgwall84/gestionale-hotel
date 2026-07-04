// Contesto di autenticazione globale.
// React Context permette di condividere i dati dell'utente loggato
// con tutti i componenti dell'app senza dover passare props manualmente.
// Ogni componente che ha bisogno di sapere "chi sono?" usa useAuth().

'use client'; // necessario per i Context in Next.js App Router

import dynamic from 'next/dynamic';
import { createContext, useContext, useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import api from '@/lib/api';

// Crea il contesto con valori di default (utili per TypeScript e auto-complete)
const AuthContext = createContext({
  utente: null,
  loading: true,
  login: async () => {},
  logout: () => {},
});

// Provider: avvolge tutta l'app e mette i dati utente a disposizione di tutti i figli
function AuthProviderInner({ children }) {
  const [utente, setUtente] = useState(null);       // dati utente loggato (null = non loggato)
  const [loading, setLoading] = useState(true);      // true mentre verifichiamo il token al caricamento

  // All'avvio dell'app, controlla se c'è un token salvato e se è ancora valido.
  // Questo evita di tornare al login dopo ogni refresh della pagina.
  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      setLoading(false); // nessun token: non loggato, fine
      return;
    }

    // Verifica il token chiamando /api/auth/me.
    // Rimuove il cookie solo su 401 (token non valido) — non su errori di rete,
    // altrimenti un backend temporaneamente irraggiungibile disconnette l'utente.
    api.get('/auth/me')
      .then((res) => {
        setUtente(res.data.utente);
      })
      .catch((err) => {
        if (err?.response?.status === 401) {
          Cookies.remove('token');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Funzione di login: chiama il backend, salva il token, aggiorna lo stato
  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    const { token, utente: datiUtente } = res.data;

    Cookies.set('token', token, {
      expires: 1,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    });

    setUtente(datiUtente);
    return datiUtente;
  }

  // Funzione di logout: rimuove il token e azzera lo stato utente
  function logout() {
    Cookies.remove('token');
    setUtente(null);
  }

  return (
    <AuthContext.Provider value={{ utente, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// AuthProvider wrappato con dynamic ssr:false — non viene mai eseguito lato server
export const AuthProvider = dynamic(() => Promise.resolve(AuthProviderInner), { ssr: false });

// Hook personalizzato per usare il contesto nei componenti.
// Uso: const { utente, login, logout } = useAuth();
export function useAuth() {
  return useContext(AuthContext);
}
