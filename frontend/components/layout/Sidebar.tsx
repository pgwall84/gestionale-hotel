'use client';

// Sidebar di navigazione — navy scuro fisso a sinistra su desktop,
// bottom navigation bar su mobile (< 768px).
// Mostra solo le voci accessibili al ruolo dell'utente loggato.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, Users, Package, UtensilsCrossed,
  CalendarDays, BookOpen, Car, Archive, Settings,
  Clock, LogOut, LogIn, ChefHat, ClipboardList, BedDouble,
  Euro, Gift, Building2, Contact, ShieldCheck, Menu as MenuIcon, X, Mail, Send, FileCode,
  Wrench,
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
    label: 'OSPITALITÀ',
    voci: [
      { href: '/planning-camere', icona: CalendarDays, testo: 'Prenotazioni', ruoli: [...AT,'receptionist','portiere_notte'] },
      // Arrivi/Partenze (modulo 5.1, Check-in/check-out digitale, 03/08/2026):
      // scorciatoia operativa sulle transizioni di stato già esistenti nel
      // pannello dettaglio di planning-camere — stessi ruoli di lettura,
      // permessi di transizione verificati lato pagina (check-out escluso
      // per portiere_notte, come nel pannello planning).
      { href: '/arrivi-partenze', icona: LogIn, testo: 'Arrivi/Partenze', ruoli: [...AT,'receptionist','portiere_notte'] },
      // Clienti (completamento modulo 2.1, 01/08/2026): consultazione
      // anagrafica ospiti + storico soggiorni, UI mai esistita prima —
      // stessi ruoli di lettura di shared/ruoli.js sezione 'ospiti'.
      { href: '/clienti', icona: Contact, testo: 'Clienti', ruoli: [...AT,'receptionist','portiere_notte'] },
      // Tariffe/Pacchetti (modulo 2.2): scrittura solo admin/titolare, ma la
      // voce resta visibile in lettura anche a receptionist (shared/ruoli.js
      // sezioni 'tariffe'/'pacchetti' — la pagina nasconde da sé i controlli
      // di modifica per chi non può scrivere).
      { href: '/tariffe',   icona: Euro, testo: 'Tariffe',   ruoli: [...AT,'receptionist'] },
      { href: '/pacchetti', icona: Gift, testo: 'Pacchetti', ruoli: [...AT,'receptionist'] },
      // Stato Camere (ex "Camere", spostata da RISTORANTE il 31/07/2026):
      // fermata/partenza/pronta/note sono operazioni di reception/pulizie,
      // non di ristorante. Aggiunto receptionist (mancava), portiere_notte
      // e cameriere restano invariati (scrittura limitata lato pagina/API).
      { href: '/camere', icona: BedDouble, testo: 'Stato Camere', ruoli: [...AT,'receptionist','cameriere','portiere_notte'] },
      // Tassa di soggiorno (modulo 2.4): calcolo/riscossione/report — stesso
      // set di ruoli di 'tariffe' (lettura anche a receptionist, che la
      // riscuote in reception). shared/ruoli.js sezione 'tassa_soggiorno'.
      { href: '/tassa-soggiorno', icona: Euro, testo: 'Tassa di soggiorno', ruoli: [...AT,'receptionist'] },
      // Pre check-in (modulo 5.2 Fase B, 04/08/2026): coda di revisione dei
      // dati inviati dall'ospite dal form pubblico — stessi ruoli di
      // shared/ruoli.js sezione 'pre_checkin'.
      { href: '/pre-checkin', icona: Mail, testo: 'Pre check-in', ruoli: [...AT,'receptionist'] },
    ],
  },
  {
    label: 'RISTORANTE',
    voci: [
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
      // Manutenzione/guasti (nuovo modulo, 06/08/2026): tutto il personale
      // segnala e vede le segnalazioni (shared/ruoli.js sezione
      // 'manutenzione', azioni 'lettura'/'crea' = TUTTI); la gestione dello
      // stato resta riservata ad admin/titolare, controllata lato pagina.
      { href: '/manutenzione', icona: Wrench, testo: 'Manutenzione', ruoli: TUTTI },
    ],
  },
  {
    // Sezione IMPOSTAZIONI (31/07/2026, task preliminare al modulo 2.3):
    // prima "Impostazioni" era una singola voce (→ /utenti) dentro ALTRO.
    // Ora è una sezione a sé con più voci — configurazione strutturale
    // (utenti, camere), non consultazione/operatività quotidiana. Entrambe
    // riservate ad admin/titolare (shared/ruoli.js sezione 'impostazioni').
    label: 'IMPOSTAZIONI',
    voci: [
      { href: '/utenti',            icona: Settings,  testo: 'Utenti', ruoli: AT },
      { href: '/impostazioni/camere', icona: Building2, testo: 'Camere', ruoli: AT },
      // Configurazione aliquota tassa di soggiorno (storico, esenzioni) —
      // decisione, non operatività quotidiana: solo admin/titolare, a
      // differenza della voce operativa in OSPITALITÀ.
      { href: '/impostazioni/tassa-soggiorno', icona: Euro, testo: 'Tassa di soggiorno', ruoli: AT },
      // Alloggiati Web (modulo 2.5, Fase 1b): sincronizzazione tabelle di
      // codifica — configurazione, non operatività quotidiana.
      { href: '/impostazioni/alloggiati', icona: ShieldCheck, testo: 'Alloggiati Web', ruoli: AT },
      // Testi email (modulo 5.3, estensione 04/08/2026): oggetto/corpo delle
      // 3 email automatiche + footer comune — configurazione, non
      // operatività quotidiana, come le voci sopra.
      { href: '/impostazioni/email', icona: Mail, testo: 'Testi email', ruoli: AT },
      // Export ROSS1000 (modulo 2.6, Fase 1 — 04/08/2026): generazione XML
      // per verifica manuale, nessun invio reale — configurazione/strumento
      // occasionale, non operatività quotidiana, come le voci sopra.
      { href: '/impostazioni/ross1000', icona: FileCode, testo: 'Export ROSS1000', ruoli: AT },
    ],
  },
  {
    // Sezione MARKETING (modulo 5.3, estensione 04/08/2026, richiesta
    // esplicita del titolare): prima idea solo loggata in docs/EVOLUTIVE.md,
    // ora un primo modulo reale — invio di offerte dedicate via email verso
    // i clienti con consenso marketing (shared/ruoli.js sezione
    // 'offerte_email'). Riservata ad admin/titolare, come IMPOSTAZIONI.
    label: 'MARKETING',
    voci: [
      { href: '/marketing/offerte', icona: Send, testo: 'Offerte', ruoli: AT },
    ],
  },
];

// Icone rapide (max 4) in bottom nav mobile, per ruolo — curate in base
// all'attività primaria presunta di ciascun ruolo (03/08/2026, fix menu
// mobile disallineato dal menu desktop). Il resto delle voci consentite al
// ruolo resta comunque raggiungibile dal pulsante "Menu" (vedi più sotto),
// che legge sempre da SEZIONI_MENU — quindi non può più diventare
// incompleto quando si aggiunge un modulo nuovo, a differenza di questa
// lista che va curata a mano.
// PROVVISORIO: il titolare ha chiesto di rivedere sia queste 4 icone sia,
// più in generale, cosa vede ciascun ruolo nel gestionale quando il
// progetto sarà "a regime" — non considerare questa assegnazione definitiva.
const VOCI_MOBILE: Record<string, { href: string; icona: React.ElementType; testo: string }[]> = {
  admin: [
    { href: '/home',            icona: LayoutDashboard, testo: 'Home' },
    { href: '/planning-camere', icona: CalendarDays,    testo: 'Prenotaz.' },
    { href: '/personale',       icona: Users,           testo: 'Personale' },
    { href: '/magazzino',       icona: Package,         testo: 'Magazz.' },
  ],
  titolare: [
    { href: '/home',            icona: LayoutDashboard, testo: 'Home' },
    { href: '/planning-camere', icona: CalendarDays,    testo: 'Prenotaz.' },
    { href: '/personale',       icona: Users,           testo: 'Personale' },
    { href: '/magazzino',       icona: Package,         testo: 'Magazz.' },
  ],
  receptionist: [
    { href: '/timbratura',      icona: Clock,     testo: 'Timbratura' },
    { href: '/arrivi-partenze', icona: LogIn,     testo: 'Arrivi/Part.' },
    { href: '/camere',          icona: BedDouble, testo: 'Camere' },
    { href: '/clienti',         icona: Contact,   testo: 'Clienti' },
  ],
  cameriere: [
    { href: '/timbratura', icona: Clock,           testo: 'Timbratura' },
    { href: '/sala',       icona: UtensilsCrossed, testo: 'Sala' },
    { href: '/menu',       icona: BookOpen,        testo: 'Menu' },
    { href: '/camere',     icona: BedDouble,       testo: 'Camere' },
  ],
  cuoco: [
    { href: '/timbratura', icona: Clock,          testo: 'Timbratura' },
    { href: '/cucina',     icona: ChefHat,        testo: 'Cucina' },
    { href: '/magazzino',  icona: Package,        testo: 'Magazz.' },
    { href: '/checklist',  icona: ClipboardList,  testo: 'HACCP' },
  ],
  portiere_notte: [
    { href: '/timbratura',      icona: Clock,           testo: 'Timbratura' },
    { href: '/arrivi-partenze', icona: LogIn,           testo: 'Arrivi/Part.' },
    { href: '/sala',            icona: UtensilsCrossed, testo: 'Sala' },
    { href: '/ztl',             icona: Car,             testo: 'ZTL' },
  ],
  dipendente: [
    { href: '/home',       icona: LayoutDashboard, testo: 'Home' },
    { href: '/timbratura', icona: Clock,           testo: 'Timbratura' },
    { href: '/personale',  icona: Users,           testo: 'Turni' },
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
  // Pannello "Menu" mobile — mostra tutte le voci consentite al ruolo
  // (stessa fonte SEZIONI_MENU del desktop), aperto/chiuso da bottone dedicato
  const [menuAperto, setMenuAperto] = useState(false);

  if (!utente) return null;

  // Cast necessario perché AuthContext è in JS senza tipi espliciti
  const u = utente as any;
  const ruoloCorrente = u.ruolo as string;

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

      {/* BOTTOM NAV MOBILE — barra fissa in basso su schermi < 768px:
          4 icone rapide curate per ruolo + pulsante "Menu" per tutto il resto */}
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
        <button
          type="button"
          onClick={() => setMenuAperto(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg"
          style={{ color: menuAperto ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)' }}
        >
          <MenuIcon size={20} strokeWidth={menuAperto ? 2 : 1.5} />
          <span className="text-[10px]">Menu</span>
        </button>
      </nav>

      {/* PANNELLO "MENU" MOBILE — bottom sheet con tutte le voci consentite
          al ruolo, raggruppate per sezione come nel menu desktop. Legge da
          SEZIONI_MENU (stessa fonte del desktop): non serve mantenerlo
          aggiornato a mano, a differenza delle 4 icone rapide sopra. */}
      {menuAperto && (
        <div className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end">
          <div
            className="flex-1"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setMenuAperto(false)}
          />
          <div
            className="rounded-t-2xl max-h-[75vh] overflow-y-auto"
            style={{ background: 'var(--sidebar-bg)' }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 sticky top-0"
              style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--sidebar-border)' }}
            >
              <p className="text-white font-semibold text-sm">Menu</p>
              <button onClick={() => setMenuAperto(false)} style={{ color: 'var(--sidebar-text)' }}>
                <X size={18} />
              </button>
            </div>

            <div className="px-2 py-3 pb-8">
              {SEZIONI_MENU.map((sezione) => {
                const vociFiltrate = sezione.voci.filter(v => v.ruoli.includes(ruoloCorrente));
                if (vociFiltrate.length === 0) return null;

                return (
                  <div key={sezione.label} className="mb-4">
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
                          onClick={() => setMenuAperto(false)}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg mb-0.5 text-sm"
                          style={{
                            background: attiva ? 'var(--sidebar-item-active)' : 'transparent',
                            color: attiva ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                          }}
                        >
                          <Icona size={16} strokeWidth={attiva ? 2 : 1.5} />
                          <span className={attiva ? 'font-medium' : 'font-normal'}>{voce.testo}</span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
