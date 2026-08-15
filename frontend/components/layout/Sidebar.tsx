'use client';

// Sidebar di navigazione — su desktop una "rail" verticale di icone di
// gruppo (larghezza var(--sidebar-rail-width)) con un pannello a comparsa
// a fianco (var(--sidebar-flyout-width)) che mostra le voci del gruppo
// selezionato o i risultati di ricerca; su mobile bottom navigation bar
// (< 768px, invariata dal 03/08/2026).
// Mostra solo le voci accessibili al ruolo dell'utente loggato.
//
// Riorganizzazione 14/08/2026 (richiesta esplicita del titolare, mock
// discussi e approvati prima di scrivere codice — vedi conversazione):
// prima erano 6 sezioni sempre tutte espanse, fino a 9 voci in una sola
// (OSPITALITÀ) — troppo lungo da scorrere. Ora 8 gruppi più corti (nessuno
// sopra 7 voci), un solo gruppo aperto alla volta nel pannello, più un tab
// di ricerca per saltare direttamente a una pagina senza navigare i gruppi.
// Il gruppo aperto si sincronizza da solo con la pagina corrente (non va
// ricordato a mano) — vedi useEffect più sotto.
// La bottom nav mobile NON è stata toccata in questa sessione (richiesta
// esplicita del titolare: teniamola come già era) — continua a leggere
// SEZIONI_MENU per il pannello "Menu", quindi eredita automaticamente il
// nuovo raggruppamento, ma le 4 icone rapide (VOCI_MOBILE) restano invariate.
//
// Ritocco 15/08/2026 (richiesta esplicita del titolare): eliminato il
// gruppo PRINCIPALE (Dashboard/Timbratura/Personale) — Timbratura e
// Personale spostate in STRUTTURA, HACCP spostata da STRUTTURA ad
// ADEMPIMENTI (stesso tema "scadenze/controlli"). Dashboard non è più
// dentro nessun gruppo: restava già raggiungibile in un click dall'icona
// Home dedicata in cima alla rail desktop (aggiunta il 14/08) — aggiunta
// qui l'equivalente sulla bottom nav mobile, altrimenti i ruoli le cui 4
// icone rapide non includono /home (receptionist, cameriere, cuoco,
// portiere_notte) restavano senza alcuna via per tornare in Dashboard da
// telefono, dato che il pannello "Menu" mobile elenca solo i gruppi.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Users, Package, UtensilsCrossed,
  CalendarDays, BookOpen, Car, Archive, Settings,
  Clock, LogOut, LogIn, ChefHat, ClipboardList, BedDouble,
  Euro, Gift, Building2, Contact, ShieldCheck, Menu as MenuIcon, X, Mail, Send, FileCode,
  Wrench, Receipt, KeyRound, Search, Home,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const A = ['admin'];
const AT = ['admin','titolare'];
const TUTTI = ['admin','titolare','receptionist','cameriere','cuoco','portiere_notte','dipendente'];

// Definizione voci menu con ruoli per voce, raggruppate per gruppo. Ogni
// gruppo ha un'icona propria (iconaGruppo, per la rail) e un'etichetta
// corta (railLabel, sotto l'icona sulla rail — max ~9 caratteri per non
// andare a capo) oltre al label lungo mostrato in testa al pannello.
// Aggiungere/spostare una voce = modificare solo questo array: nessuna
// altra parte del componente va toccata (rail, pannello, ricerca, bottom
// sheet mobile leggono tutti da qui).
const SEZIONI_MENU = [
  {
    // Ex OSPITALITÀ (era 9 voci in un solo gruppo) — divisa in due:
    // questo copre cliente/prenotazione, il prossimo camere/tariffe.
    label: 'CLIENTI E PRENOTAZIONI',
    railLabel: 'Clienti',
    iconaGruppo: Users,
    voci: [
      { href: '/planning-camere', icona: CalendarDays, testo: 'Prenotazioni', ruoli: [...AT,'receptionist','portiere_notte'] },
      { href: '/arrivi-partenze', icona: LogIn, testo: 'Arrivi/Partenze', ruoli: [...AT,'receptionist','portiere_notte'] },
      { href: '/clienti', icona: Contact, testo: 'Clienti', ruoli: [...AT,'receptionist','portiere_notte'] },
      // Gruppi (15/08/2026) — elenco comitive/famiglie multi-camera, stessi
      // ruoli di shared/ruoli.js sezione 'gruppi'.lettura (A/T/R/P).
      { href: '/gruppi', icona: Users, testo: 'Gruppi', ruoli: [...AT,'receptionist','portiere_notte'] },
      { href: '/pre-checkin', icona: Mail, testo: 'Pre check-in', ruoli: [...AT,'receptionist'] },
      { href: '/addebiti-extra', icona: Receipt, testo: 'Addebiti extra', ruoli: [...AT,'receptionist','cameriere'] },
    ],
  },
  {
    label: 'CAMERE E TARIFFE',
    railLabel: 'Camere',
    iconaGruppo: BedDouble,
    voci: [
      { href: '/camere', icona: BedDouble, testo: 'Stato Camere', ruoli: [...AT,'receptionist','cameriere','portiere_notte'] },
      { href: '/tariffe',   icona: Euro, testo: 'Tariffe',   ruoli: [...AT,'receptionist'] },
      { href: '/pacchetti', icona: Gift, testo: 'Pacchetti', ruoli: [...AT,'receptionist'] },
    ],
  },
  {
    // Nuovo gruppo (14/08/2026), specchio del widget "Adempimenti" della
    // dashboard — stessa idea: tutto ciò che ha una scadenza legale/
    // amministrativa in un posto solo. Alloggiati Web qui è la pagina
    // OPERATIVA nuova (/alloggiati-web, coda invii + ricevute) — diversa
    // da quella di configurazione che resta in IMPOSTAZIONI (sync tabelle
        // di codifica, verifica credenziali, verifica schedina di test).
    // Statistiche Liguria punta ancora a /impostazioni/ross1000 (nessuno
    // split operativo/config possibile finché la Fase E — RIMOVCLI vs
    // ROSS1000 — non è sbloccata dalla risposta di Regione Liguria):
    // stessa pagina, non duplicata altrove — rimossa la vecchia voce
    // "Export ROSS1000" da IMPOSTAZIONI per non avere due link alla
    // stessa identica pagina con due nomi diversi.
    label: 'ADEMPIMENTI',
    railLabel: 'Adempim.',
    iconaGruppo: ShieldCheck,
    voci: [
      { href: '/tassa-soggiorno', icona: Euro, testo: 'Tassa di soggiorno', ruoli: [...AT,'receptionist'] },
      { href: '/ztl',      icona: Car,          testo: 'ZTL Targhe',   ruoli: [...AT,'receptionist','portiere_notte'] },
      { href: '/alloggiati-web', icona: ShieldCheck, testo: 'Alloggiati Web', ruoli: AT },
      { href: '/impostazioni/ross1000', icona: FileCode, testo: 'Statistiche Liguria', ruoli: AT },
      // Spostata qui da STRUTTURA (15/08/2026, richiesta esplicita del
      // titolare): stesso tema "scadenze/controlli obbligatori" delle altre
      // voci del gruppo. In futuro, quando il modulo HACCP avrà un vero
      // widget di controlli da realizzare (vedi docs/EVOLUTIVE.md, voce
      // "Modulo HACCP avanzato"), caricherà qui — non un cambio di posto a
      // sé, ma la stessa idea del widget "Adempimenti" già in Dashboard.
      { href: '/checklist', icona: ClipboardList, testo: 'HACCP', ruoli: [...AT,'cuoco'] },
    ],
  },
  {
    label: 'RISTORANTE',
    railLabel: 'Ristorante',
    iconaGruppo: UtensilsCrossed,
    voci: [
      { href: '/sala',         icona: UtensilsCrossed, testo: 'Sala / Comande', ruoli: [...AT,'cameriere','portiere_notte'] },
      { href: '/cucina',       icona: ChefHat,         testo: 'Cucina',          ruoli: [...AT,'cuoco','portiere_notte'] },
      { href: '/prenotazioni', icona: CalendarDays,    testo: 'Prenotazioni',    ruoli: [...AT,'receptionist','portiere_notte'] },
      { href: '/menu',         icona: BookOpen,        testo: 'Menu',            ruoli: [...AT,'cuoco','portiere_notte'] },
      { href: '/magazzino',    icona: Package,         testo: 'Magazzino',       ruoli: [...AT,'cuoco','receptionist','portiere_notte'] },
    ],
  },
  {
    // Ex ALTRO, rinominata (14/08/2026) — "ALTRO" era un contenitore
    // residuale senza un vero tema comune; questi tre riguardano tutti la
    // struttura fisica/sicurezza alimentare, non il cliente.
    label: 'STRUTTURA',
    railLabel: 'Struttura',
    iconaGruppo: Wrench,
    voci: [
      // Timbratura e Personale spostate qui da PRINCIPALE (15/08/2026,
      // richiesta esplicita del titolare — gruppo PRINCIPALE eliminato:
      // la Dashboard resta comunque raggiungibile in un click dall'icona
      // dedicata in cima alla rail desktop, vedi più sotto nel componente,
      // e dalla nuova icona equivalente in cima alla bottom nav mobile).
      { href: '/timbratura', icona: Clock, testo: 'Timbratura', ruoli: TUTTI },
      { href: '/personale',  icona: Users, testo: 'Personale',  ruoli: TUTTI },
      { href: '/archivio', icona: Archive,       testo: 'Archivio',     ruoli: [...AT,'receptionist'] },
      { href: '/manutenzione', icona: Wrench, testo: 'Manutenzione', ruoli: TUTTI },
    ],
  },
  {
    label: 'MARKETING',
    railLabel: 'Marketing',
    iconaGruppo: Send,
    voci: [
      { href: '/marketing/offerte', icona: Send, testo: 'Offerte', ruoli: AT },
    ],
  },
  {
    // Impostazioni spostata in fondo (14/08/2026, richiesta esplicita del
    // titolare, al posto di Marketing) — configurazione, non operatività
    // quotidiana, coerente col motivo per cui questa sezione esiste già.
    label: 'IMPOSTAZIONI',
    railLabel: 'Impostaz.',
    iconaGruppo: Settings,
    voci: [
      { href: '/utenti',            icona: Settings,  testo: 'Utenti', ruoli: AT },
      { href: '/impostazioni/camere', icona: Building2, testo: 'Camere', ruoli: AT },
      { href: '/impostazioni/tassa-soggiorno', icona: Euro, testo: 'Tassa di soggiorno', ruoli: AT },
      { href: '/impostazioni/alloggiati', icona: ShieldCheck, testo: 'Alloggiati Web', ruoli: AT },
      { href: '/impostazioni/email', icona: Mail, testo: 'Testi email', ruoli: AT },
      { href: '/impostazioni/catalogo-addebiti', icona: Receipt, testo: 'Catalogo addebiti', ruoli: AT },
    ],
  },
];

// Icone rapide (max 4) in bottom nav mobile, per ruolo — INVARIATA dal
// 03/08/2026 su richiesta esplicita del titolare (14/08/2026): la
// riorganizzazione della rail desktop non tocca il mobile. Resta
// provvisorio per lo stesso motivo di sempre — vedi commento originale
// sotto — solo spostato qui perché la sezione sopra è cambiata.
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
    { href: '/timbratura', icona: Clock,           testo: 'Turni' },
    { href: '/personale',  icona: Users,           testo: 'Personale' },
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
  // Pannello "Menu" mobile — invariato, vedi commento sopra
  const [menuAperto, setMenuAperto] = useState(false);

  // Rail desktop: indice del gruppo aperto nel pannello + modalità ricerca
  // (esclusiva: o un gruppo è aperto, o la ricerca è attiva, mai insieme —
  // stesso comportamento del mock approvato dal titolare).
  const [gruppoAperto, setGruppoAperto] = useState(0);
  const [modoRicerca, setModoRicerca] = useState(false);
  const [queryRicerca, setQueryRicerca] = useState('');

  const u = utente as any;
  const ruoloCorrente = u?.ruolo as string;

  // Sincronizza il gruppo aperto con la pagina corrente: chi naviga da un
  // link esterno o ricarica la pagina ritrova il gruppo giusto già aperto,
  // non deve ricordarselo a mano. Cerca solo tra i gruppi con almeno una
  // voce visibile al ruolo corrente (altrimenti un titolare potrebbe
  // "aprire" un gruppo vuoto per il suo ruolo).
  useEffect(() => {
    if (!ruoloCorrente || !pathname) return;
    const idx = SEZIONI_MENU.findIndex(g =>
      g.voci.some(v => v.ruoli.includes(ruoloCorrente) && (pathname === v.href || (v.href !== '/home' && pathname.startsWith(v.href))))
    );
    if (idx >= 0) {
      setGruppoAperto(idx);
      setModoRicerca(false);
    }
  }, [pathname, ruoloCorrente]);

  // Elenco piatto di tutte le voci consentite al ruolo, per la ricerca —
  // ricalcolato solo quando cambia il ruolo, non ad ogni tasto premuto.
  const tutteLeVoci = useMemo(() => {
    if (!ruoloCorrente) return [];
    const elenco: { href: string; icona: React.ElementType; testo: string; gruppo: string }[] = [];
    SEZIONI_MENU.forEach(g => {
      g.voci.filter(v => v.ruoli.includes(ruoloCorrente)).forEach(v => {
        elenco.push({ href: v.href, icona: v.icona, testo: v.testo, gruppo: g.label });
      });
    });
    return elenco;
  }, [ruoloCorrente]);

  const risultatiRicerca = useMemo(() => {
    const q = queryRicerca.trim().toLowerCase();
    if (!q) return tutteLeVoci;
    return tutteLeVoci.filter(v => v.testo.toLowerCase().includes(q));
  }, [queryRicerca, tutteLeVoci]);

  if (!utente) return null;

  function handleLogout() {
    logout();
    router.push('/login');
  }

  const gruppiVisibili = SEZIONI_MENU
    .map(g => ({ ...g, voci: g.voci.filter(v => v.ruoli.includes(ruoloCorrente)) }))
    .filter(g => g.voci.length > 0);

  const gruppoCorrente = gruppiVisibili[Math.min(gruppoAperto, gruppiVisibili.length - 1)];

  return (
    <>
      {/* SIDEBAR DESKTOP — rail (icone di gruppo) + pannello a comparsa */}
      <aside
        className="hidden md:flex flex-col h-screen sticky top-0 shrink-0"
        style={{ width: 'var(--sidebar-width)', background: 'var(--sidebar-bg)' }}
      >
        {/* Logo / nome app */}
        <div className="px-4 py-5">
          <p className="text-white font-semibold text-base leading-tight">Hotel Gestionale</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--sidebar-text)' }}>Pannello di controllo</p>
        </div>

        <div style={{ borderTop: '1px solid var(--sidebar-border)' }} />

        <div className="flex flex-1 min-h-0">
          {/* Rail — icone di gruppo, larghezza fissa */}
          <nav
            className="flex flex-col items-center gap-1 py-3 overflow-y-auto shrink-0"
            style={{ width: 'var(--sidebar-rail-width)', borderRight: '1px solid var(--sidebar-border)' }}
          >
            {/* Scorciatoia diretta alla Dashboard (14/08/2026, richiesta esplicita
                del titolare): da una pagina interna tornare a /home richiedeva
                comunque due click (icona gruppo PRINCIPALE → voce Dashboard nel
                pannello), anche se PRINCIPALE è il primo gruppo della rail.
                Icona `Home` (non `LayoutDashboard`, già usata come icona del
                gruppo PRINCIPALE subito sotto — stessa icona due volte sulla
                rail sarebbe stata confusa) — è un Link diretto, non apre un
                pannello: un click, sempre, da qualunque pagina. Visibile a
                tutti i ruoli, come la voce Dashboard dentro PRINCIPALE. */}
            <Link
              href="/home"
              onClick={() => setModoRicerca(false)}
              title="Vai alla Dashboard"
              className="w-full flex flex-col items-center gap-0.5 py-1.5 rounded-lg"
              style={{ background: (!modoRicerca && pathname === '/home') ? 'var(--sidebar-item-active)' : 'transparent' }}
            >
              <Home size={17} strokeWidth={(!modoRicerca && pathname === '/home') ? 2 : 1.5}
                    style={{ color: (!modoRicerca && pathname === '/home') ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)' }} />
              <span className="text-[9px]" style={{ color: (!modoRicerca && pathname === '/home') ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)' }}>Dashboard</span>
            </Link>

            <button
              type="button"
              onClick={() => setModoRicerca(true)}
              title="Cerca una pagina"
              className="w-full flex flex-col items-center gap-0.5 py-1.5 rounded-lg"
              style={{ background: modoRicerca ? 'var(--sidebar-item-active)' : 'transparent' }}
            >
              <Search size={17} strokeWidth={modoRicerca ? 2 : 1.5} style={{ color: modoRicerca ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)' }} />
              <span className="text-[9px]" style={{ color: modoRicerca ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)' }}>Cerca</span>
            </button>

            <div className="w-8 my-1" style={{ borderTop: '1px solid var(--sidebar-border)' }} />

            {gruppiVisibili.map((g, i) => {
              const IconaGruppo = g.iconaGruppo;
              const attivo = !modoRicerca && i === gruppoAperto;
              return (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => { setModoRicerca(false); setGruppoAperto(i); }}
                  title={g.label}
                  className="w-full flex flex-col items-center gap-0.5 py-1.5 rounded-lg"
                  style={{ background: attivo ? 'var(--sidebar-item-active)' : 'transparent' }}
                >
                  <IconaGruppo size={17} strokeWidth={attivo ? 2 : 1.5} style={{ color: attivo ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)' }} />
                  <span className="text-[9px] text-center leading-tight px-0.5" style={{ color: attivo ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)' }}>{g.railLabel}</span>
                </button>
              );
            })}
          </nav>

          {/* Pannello a comparsa — voci del gruppo selezionato, o ricerca */}
          <div className="flex-1 min-w-0 overflow-y-auto px-2 py-3" style={{ width: 'var(--sidebar-flyout-width)' }}>
            {modoRicerca ? (
              <>
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-2" style={{ background: 'var(--sidebar-item-hover)' }}>
                  <Search size={14} style={{ color: 'var(--sidebar-text)' }} />
                  <input
                    autoFocus
                    value={queryRicerca}
                    onChange={e => setQueryRicerca(e.target.value)}
                    placeholder="Cerca una pagina..."
                    className="bg-transparent border-none outline-none text-sm flex-1"
                    style={{ color: 'white' }}
                  />
                </div>
                {risultatiRicerca.length === 0 ? (
                  <p className="px-3 py-2 text-xs" style={{ color: 'var(--sidebar-text)' }}>Nessuna pagina trovata.</p>
                ) : (
                  risultatiRicerca.map(v => {
                    const Icona = v.icona;
                    return (
                      <Link
                        key={v.href}
                        href={v.href}
                        onClick={() => setQueryRicerca('')}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-sm"
                        style={{ color: 'var(--sidebar-text)' }}
                      >
                        <Icona size={15} strokeWidth={1.5} />
                        <span className="min-w-0">
                          <span className="block truncate">{v.testo}</span>
                          <span className="block text-[10px] truncate" style={{ color: 'var(--sidebar-label)' }}>{v.gruppo}</span>
                        </span>
                      </Link>
                    );
                  })
                )}
              </>
            ) : gruppoCorrente ? (
              <>
                <p className="px-3 mb-1 text-[10px] font-medium tracking-wider" style={{ color: 'var(--sidebar-label)' }}>
                  {gruppoCorrente.label}
                </p>
                {gruppoCorrente.voci.map(voce => {
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
              </>
            ) : null}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--sidebar-border)' }} />

        {/* Avatar utente + logout in fondo — invariato */}
        <div className="px-3 py-4 flex items-center gap-2.5">
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
          <Link
            href="/cambia-password"
            title="Cambia password"
            className="p-1.5 rounded-lg transition-colors hover:opacity-80"
            style={{ color: 'var(--sidebar-text)' }}
          >
            <KeyRound size={14} />
          </Link>
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

      {/* BOTTOM NAV MOBILE — INVARIATA (richiesta esplicita del titolare,
          14/08/2026): 4 icone rapide curate per ruolo + pulsante "Menu" per
          tutto il resto, che ora eredita il nuovo raggruppamento sopra. */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-1 py-2 border-t"
        style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}
      >
        {/* Scorciatoia diretta alla Dashboard (15/08/2026) — equivalente
            mobile dell'icona Home dedicata sulla rail desktop, aggiunta
            insieme all'eliminazione del gruppo PRINCIPALE: senza questa,
            i ruoli le cui 4 icone rapide (VOCI_MOBILE) non includono già
            /home (receptionist, cameriere, cuoco, portiere_notte) non
            avrebbero più alcun modo di raggiungere la Dashboard da
            telefono, perché il pannello "Menu" sotto elenca solo i gruppi
            di SEZIONI_MENU e Dashboard non ne fa più parte. Non tocca
            VOCI_MOBILE (provvisorie, revisione a parte già in sospeso). */}
        <Link
          href="/home"
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg"
          style={{ color: pathname === '/home' ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)' }}
        >
          <Home size={20} strokeWidth={pathname === '/home' ? 2 : 1.5} />
          <span className="text-[10px]">Home</span>
        </Link>

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

      {/* PANNELLO "MENU" MOBILE — invariato, legge da SEZIONI_MENU (ora
          riorganizzata) come prima. */}
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
              {gruppiVisibili.map((sezione) => (
                <div key={sezione.label} className="mb-4">
                  <p className="px-3 mb-1 text-[10px] font-medium tracking-wider"
                     style={{ color: 'var(--sidebar-label)' }}>
                    {sezione.label}
                  </p>
                  {sezione.voci.map((voce) => {
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
              ))}

              <div className="mt-2 pt-3" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
                <Link
                  href="/cambia-password"
                  onClick={() => setMenuAperto(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg mb-0.5 text-sm"
                  style={{ color: 'var(--sidebar-text)' }}
                >
                  <KeyRound size={16} strokeWidth={1.5} />
                  <span>Cambia password</span>
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg mb-0.5 text-sm w-full text-left"
                  style={{ color: 'var(--sidebar-text)' }}
                >
                  <LogOut size={16} strokeWidth={1.5} />
                  <span>Esci</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
