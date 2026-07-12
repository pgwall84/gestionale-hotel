'use client';

// Sidebar di navigazione — navy scuro fisso a sinistra su desktop,
// bottom navigation bar su mobile (< 768px).
// Mostra solo le voci accessibili al ruolo dell'utente loggato.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, Package, UtensilsCrossed,
  CalendarDays, BookOpen, Car, Archive, Settings,
  Clock, LogOut, ChefHat, ClipboardList, BedDouble,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const A = ['admin'];
const AT = ['admin','titolare'];
const TUTTI = ['admin','titolare','receptionist','cameriere','cuoco','portiere_notte','dipendente'];

// Definizione voci menu con ruoli per voce
const SEZIONI_MENU = [
  {
    label: 'PRINCIPALE',
    voci: [
      { href: '/home',       icona: LayoutDashboard, testo: 'Dashboard',  ruoli: TUTTI },
      { href: '/timbratura', icona: Clock,            testo: 'Timbratura', ruoli: TUTTI },
      { href: '/personale',  icona: Users,            testo: 'Personale',  ruoli: TUTTI },
    ],
  },
  {
    label: 'RISTORANTE',
    voci: [
      { href: '/camere',       icona: BedDouble,       testo: 'Camere',          ruoli: [...AT,'cameriere','portiere_notte'] },
      { href: '/sala',         icona: UtensilsCrossed, testo: 'Sala / Comande', ruoli: [...AT,'cameriere','portiere_notte'] },
      { href: '/cucina',       icona: ChefHat,         testo: 'Cucina',          ruoli: [...AT,'cuoco','portiere_notte'] },
      { href: '/prenotazioni', icona: CalendarDays,    testo: 'Prenotazioni',    ruoli: [...AT,'receptionist','portiere_notte'] },
      { href: '/menu',         icona: BookOpen,        testo: 'Menu',            ruoli: [...AT,'cuoco','portiere_notte'] },
      { href: '/magazzino',    icona: Package,         testo: 'Magazzino',       ruoli: [...AT,'cuoco','receptionist','portiere_notte'] },
    ],
  },
  {
    label: 'ALTRO',
    voci: [
      { href: '/ztl',      icona: Car,          testo: 'ZTL Targhe',   ruoli: [...AT,'receptionist','portiere_notte'] },
      { href: '/checklist',icona: ClipboardList, testo: 'HACCP',        ruoli: [...AT,'cuoco'] },
      { href: '/archivio', icona: Archive,       testo: 'Archivio',     ruoli: [...AT,'receptionist'] },
      { href: '/utenti',   icona: Settings,      testo: 'Impostazioni', ruoli: AT },
    ],
  },
];

// Voci bottom nav mobile per ruolo (max 5)
const VOCI_MOBILE: Record<string, { href: string; icona: React.ElementType; testo: string }[]> = {
  admin: [
    { href: '/home',      icona: LayoutDashboard, testo: 'Home' },
    { href: '/personale', icona: Users,           testo: 'Personale' },
    { href: '/sala',      icona: UtensilsCrossed, testo: 'Sala' },
    { href: '/magazzino', icona: Package,         testo: 'Magazz.' },
    { href: '/utenti',    icona: Settings,        testo: 'Impost.' },
  ],
  titolare: [
    { href: '/home',      icona: LayoutDashboard, testo: 'Home' },
    { href: '/personale', icona: Users,           testo: 'Personale' },
    { href: '/timbratura',icona: Clock,           testo: 'Timbr.' },
    { href: '/checklist', icona: ClipboardList,   testo: 'HACCP' },
    { href: '/magazzino', icona: Package,         testo: 'Magazz.' },
  ],
  receptionist: [
    { href: '/timbratura',  icona: Clock,        testo: 'Timbratura' },
    { href: '/prenotazioni',icona: CalendarDays, testo: 'Prenotaz.' },
    { href: '/ztl',         icona: Car,          testo: 'ZTL' },
    { href: '/magazzino',   icona: Package,      testo: 'Magazz.' },
    { href: '/archivio',    icona: Archive,      testo: 'Archivio' },
  ],
  cameriere: [
    { href: '/timbratura', icona: Clock,           testo: 'Timbratura' },
    { href: '/camere',     icona: BedDouble,       testo: 'Camere' },
    { href: '/sala',       icona: UtensilsCrossed, testo: 'Sala' },
    { href: '/menu',       icona: BookOpen,        testo: 'Menu' },
  ],
  cuoco: [
    { href: '/timbratura', icona: Clock,          testo: 'Timbratura' },
    { href: '/cucina',     icona: ChefHat,        testo: 'Cucina' },
    { href: '/magazzino',  icona: Package,        testo: 'Magazz.' },
    { href: '/checklist',  icona: ClipboardList,  testo: 'HACCP' },
  ],
  portiere_notte: [
    { href: '/timbratura',  icona: Clock,        testo: 'Timbratura' },
    { href: '/prenotazioni',icona: CalendarDays, testo: 'Prenotaz.' },
    { href: '/sala',        icona: UtensilsCrossed, testo: 'Sala' },
    { href: '/ztl',         icona: Car,          testo: 'ZTL' },
    { href: '/magazzino',   icona: Package,      testo: 'Magazz.' },
  ],
  dipendente: [
    { href: '/timbratura', icona: Clock,  testo: 'Timbratura' },
    { href: '/personale',  icona: Users,  testo: 'Turni' },
  ],
};

// Genera le iniziali dell'utente per l'avatar (es. "Mario Rossi" → "MR")
function iniziali(nome: string, cognome: string) {
  return `${nome?.[0] ?? ''}${cognome?.[0] ?? ''}`.toUpperCase();
}

export default function Sidebar() {
  const { utente, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (!utente) return null;

  // Cast necessario perché AuthContext è in JS senza tipi espliciti
  const u = utente as any;

  function handleLogout() {
    logout();
    router.push('/login');
  }

  // ── Desktop sidebar ────────────────────────────────────────────────────────
  return (
    <>
      {/* SIDEBAR DESKTOP — fissa a sinistra, 220px */}
      <aside
        className="hidden md:flex flex-col h-screen sticky top-0 shrink-0 overflow-y-auto"
        style={{ width: 'var(--sidebar-width)', background: 'var(--sidebar-bg)' }}
      >
        {/* Logo / nome app */}
        <div className="px-4 py-5">
          <p className="text-white font-semibold text-base leading-tight">Hotel Gestionale</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--sidebar-text)' }}>Pannello di controllo</p>
        </div>

        <div style={{ borderTop: '1px solid var(--sidebar-border)' }} />

        {/* Voci di menu raggruppate per sezione */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          {SEZIONI_MENU.map((sezione) => {
            // Filtra le voci per il ruolo corrente
            const ruoloCorrente = u.ruolo as string;
            const vociFiltrate = sezione.voci.filter(v => v.ruoli.includes(ruoloCorrente));
            if (vociFiltrate.length === 0) return null;

            return (
              <div key={sezione.label} className="mb-4">
                {/* Label sezione in maiuscolo */}
                <p className="px-3 mb-1 text-[10px] font-medium tracking-wider"
                   style={{ color: 'var(--sidebar-label)' }}>
                  {sezione.label}
                </p>

                {vociFiltrate.map((voce) => {
                  const Icona = voce.icona;
                  const attiva = pathname === voce.href || (voce.href !== '/home' && pathname.startsWith(voce.href));

                  return (
                    <Link
                      key={voce.href}
                      href={voce.href}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-sm transition-colors"
                      style={{
                        background: attiva ? 'var(--sidebar-item-active)' : 'transparent',
                        color: attiva ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                      }}
                      onMouseEnter={e => { if (!attiva) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'; }}
                      onMouseLeave={e => { if (!attiva) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <Icona size={15} strokeWidth={attiva ? 2 : 1.5} />
                      <span className={attiva ? 'font-medium' : 'font-normal'}>{voce.testo}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div style={{ borderTop: '1px solid var(--sidebar-border)' }} />

        {/* Avatar utente + logout in fondo */}
        <div className="px-3 py-4 flex items-center gap-2.5">
          {/* Avatar con iniziali */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ background: 'var(--hotel-amber)', color: '#fff' }}
          >
            {iniziali(u.nome, u.cognome)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{u.nome} {u.cognome}</p>
            <p className="text-[10px] capitalize truncate" style={{ color: 'var(--sidebar-text)' }}>{u.ruolo}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Esci"
            className="p-1.5 rounded-lg transition-colors hover:opacity-80"
            style={{ color: 'var(--sidebar-text)' }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/* BOTTOM NAV MOBILE — barra fissa in basso su schermi < 768px */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-1 py-2 border-t"
        style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}
      >
        {(VOCI_MOBILE[u.ruolo] ?? VOCI_MOBILE['dipendente']).map((voce) => {
          const Icona = voce.icona;
          const attiva = pathname === voce.href || (voce.href !== '/home' && pathname.startsWith(voce.href));
          return (
            <Link
              key={voce.href}
              href={voce.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg"
              style={{ color: attiva ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)' }}
            >
              <Icona size={20} strokeWidth={attiva ? 2 : 1.5} />
              <span className="text-[10px]">{voce.testo}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
