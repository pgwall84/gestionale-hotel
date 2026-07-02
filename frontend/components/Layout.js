// Layout principale dell'app con menu di navigazione dinamico.
// Questo componente avvolge tutte le pagine della dashboard.
// Il menu mostra solo le sezioni a cui l'utente corrente ha accesso,
// basandosi sul ruolo salvato nel contesto di autenticazione.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { PERMESSI_SEZIONI } from '@/lib/ruoli';

// Definizione delle voci di menu con icone e sezione di riferimento.
// La "sezione" corrisponde alle chiavi in PERMESSI_SEZIONI (shared/ruoli.js).
const VOCI_MENU = [
  {
    sezione: 'hr_timbratura',
    label: 'Timbratura',
    icona: '⏱️',
    href: '/timbratura',
    descrizione: 'Entrata / Uscita',
  },
  {
    sezione: 'hr',
    label: 'Personale',
    icona: '👥',
    href: '/personale',
    descrizione: 'Turni, ferie, documenti',
  },
  {
    sezione: 'magazzino',
    label: 'Magazzino',
    icona: '📦',
    href: '/magazzino',
    descrizione: 'Scorte e movimenti',
  },
  {
    sezione: 'ristorante',
    label: 'Ristorante',
    icona: '🍽️',
    href: '/ristorante',
    descrizione: 'Menu, prenotazioni, comande',
  },
  {
    sezione: 'ristorante_sala',
    label: 'Sala',
    icona: '🗺️',
    href: '/sala',
    descrizione: 'Mappa e comande',
  },
  {
    sezione: 'ristorante_prenotazioni',
    label: 'Prenotazioni',
    icona: '📅',
    href: '/prenotazioni',
    descrizione: 'Prenotazioni ristorante',
  },
  {
    sezione: 'ztl',
    label: 'ZTL',
    icona: '🚗',
    href: '/ztl',
    descrizione: 'Gestione targhe ospiti',
  },
  {
    sezione: 'archivio',
    label: 'Archivio',
    icona: '🗂️',
    href: '/archivio',
    descrizione: 'Documenti e foto',
  },
  {
    sezione: 'dashboard',
    label: 'Dashboard',
    icona: '📊',
    href: '/dashboard',
    descrizione: 'KPI e statistiche',
  },
  {
    sezione: 'utenti',
    label: 'Utenti',
    icona: '⚙️',
    href: '/utenti',
    descrizione: 'Gestione dipendenti',
  },
];

export default function Layout({ children }) {
  const { utente, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuAperto, setMenuAperto] = useState(false);

  // Filtra le voci di menu: mostra solo quelle accessibili al ruolo corrente
  const vociVisibili = VOCI_MENU.filter((voce) => {
    const permessi = PERMESSI_SEZIONI[voce.sezione];
    return permessi && utente && permessi.includes(utente.ruolo);
  });

  function handleLogout() {
    logout();
    router.push('/login');
  }

  if (!utente) return null;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header mobile con nome utente e pulsanti ── */}
      <header className="bg-blue-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-2">
          {/* Pulsante home — visibile su tutte le pagine tranne la home stessa */}
          {pathname !== '/home' && (
            <Link
              href="/home"
              className="p-2 rounded-lg bg-blue-700 hover:bg-blue-600 transition-colors"
              aria-label="Torna alla home"
              title="Home"
            >
              <span className="text-xl leading-none">🏠</span>
            </Link>
          )}
          <div>
            <p className="font-bold text-lg leading-tight">Hotel Gestionale</p>
            <p className="text-blue-200 text-sm">
              {utente.nome} {utente.cognome} — <span className="capitalize">{utente.ruolo}</span>
            </p>
          </div>
        </div>

        {/* Pulsante hamburger per aprire/chiudere il menu su mobile */}
        <button
          onClick={() => setMenuAperto(!menuAperto)}
          className="p-2 rounded-lg bg-blue-700 hover:bg-blue-600 transition-colors"
          aria-label="Apri menu"
        >
          <div className="w-6 h-0.5 bg-white mb-1.5"></div>
          <div className="w-6 h-0.5 bg-white mb-1.5"></div>
          <div className="w-6 h-0.5 bg-white"></div>
        </button>
      </header>

      {/* ── Menu a scorrimento laterale (sidebar) ── */}
      {menuAperto && (
        <>
          {/* Overlay scuro dietro il menu — clic fuori chiude il menu */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setMenuAperto(false)}
          />

          {/* Menu vero e proprio */}
          <nav className="fixed left-0 top-0 h-full w-72 bg-white z-50 shadow-2xl overflow-y-auto">
            <div className="bg-blue-800 text-white px-4 py-4">
              <p className="font-bold text-lg">Hotel Gestionale</p>
              <p className="text-blue-200 text-sm mt-0.5">
                {utente.nome} {utente.cognome}
              </p>
              <span className="inline-block bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full mt-1 capitalize">
                {utente.ruolo}
              </span>
            </div>

            <div className="p-3">
              {vociVisibili.map((voce) => {
                const attiva = pathname.startsWith(voce.href);
                return (
                  <Link
                    key={voce.sezione}
                    href={voce.href}
                    onClick={() => setMenuAperto(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-colors ${
                      attiva
                        ? 'bg-blue-800 text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-2xl">{voce.icona}</span>
                    <div>
                      <p className="font-semibold text-sm">{voce.label}</p>
                      <p className={`text-xs ${attiva ? 'text-blue-200' : 'text-gray-400'}`}>
                        {voce.descrizione}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Pulsante logout in fondo al menu */}
            <div className="p-3 border-t border-gray-200 mt-2">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors"
              >
                <span className="text-2xl">🚪</span>
                <span className="font-semibold text-sm">Esci</span>
              </button>
            </div>
          </nav>
        </>
      )}

      {/* ── Contenuto della pagina ── */}
      <main className="p-4 max-w-2xl mx-auto">
        {children}
      </main>
    </div>
  );
}
