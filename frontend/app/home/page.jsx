'use client';

// Dashboard principale — KPI, alert, presenze (admin/titolare), camere oggi (cameriere).

import { useState, useEffect } from 'react';
import { BedDouble, UtensilsCrossed, Banknote, TrendingDown, LogIn, LogOut } from 'lucide-react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import KpiCard from '@/components/ui/KpiCard';
import AlertItem from '@/components/ui/AlertItem';
import StatusBadge from '@/components/ui/StatusBadge';
import DataTable from '@/components/ui/DataTable';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const KPI_MOCK = [
  { label: 'Camere occupate',    value: '14 / 20', sub: '70% di occupazione',    badge: 'Buona',  badgeVariante: 'green', Icona: BedDouble },
  { label: 'Coperti stasera',    value: '38',      sub: '12 hotel · 26 esterni', badge: 'Aperto', badgeVariante: 'green', Icona: UtensilsCrossed },
  { label: 'Incasso ristorante', value: '€ 1.240', sub: '+8% rispetto a ieri',   badge: '+8%',    badgeVariante: 'green', Icona: Banknote },
  { label: 'Food cost %',        value: '32%',     sub: 'Obiettivo < 35%',       badge: 'Ottimo', badgeVariante: 'green', Icona: TrendingDown },
];


// Sezione camere inline per cameriere e portiere_notte
function RiepilogoCamere() {
  const [camere, setCamere] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/camere/oggi')
      .then(r => setCamere(r.data.camere))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pronte   = camere.filter(c => c.pronta).length;
  const totale   = camere.length;

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>Camere oggi</p>
        <Link href="/camere" className="text-[11px] font-medium"
              style={{ color: 'var(--hotel-amber)' }}>
          Gestisci →
        </Link>
      </div>
      <p className="text-[11px] mb-3" style={{ color: 'var(--muted-foreground)' }}>
        {loading ? '...' : totale === 0
          ? 'Nessun arrivo o partenza per oggi'
          : `${pronte}/${totale} camere pronte`}
      </p>

      {loading ? (
        <p className="text-sm text-center py-4" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      ) : totale === 0 ? null : (
        <div className="flex flex-col gap-0">
          {camere.map((c, i) => (
            <div key={c.numero}
                 className="flex items-center justify-between py-2"
                 style={{ borderBottom: i < camere.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{
                  color: 'var(--foreground)',
                  textDecoration: c.pronta ? 'line-through' : 'none',
                  opacity: c.pronta ? 0.5 : 1,
                }}>
                  {c.nome}
                </p>
                {c.note && (
                  <p className="text-[11px] truncate" style={{ color: 'var(--muted-foreground)' }}>{c.note}</p>
                )}
              </div>
              <div className="flex gap-1.5 shrink-0 ml-2">
                {c.partenza && <StatusBadge status="red"   label="Partenza" />}
                {c.arrivo   && <StatusBadge status="green" label="Fermata" />}
                {c.pronta   && <StatusBadge status="blue"  label="Pronta" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PaginaHome() {
  const { utente } = useAuth();
  const [presenti, setPresenti] = useState([]);
  const [loadingPresenze, setLoadingPresenze] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const isGestione  = ['admin', 'titolare'].includes(utente?.ruolo);
  const isCameriera = utente?.ruolo === 'cameriere';
  const isPortiere  = utente?.ruolo === 'portiere_notte';

  useEffect(() => {
    if (isGestione) {
      api.get('/hr/timbrature/presenti')
        .then(r => setPresenti(r.data.presenti))
        .catch(() => {})
        .finally(() => setLoadingPresenze(false));
      api.get('/dashboard/alert')
        .then(r => setAlerts(r.data.alerts))
        .catch(() => {})
        .finally(() => setLoadingAlerts(false));
    } else {
      setLoadingPresenze(false);
      setLoadingAlerts(false);
    }
  }, [utente]);

  const oggi = new Date().toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const saluto = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buongiorno';
    if (h < 18) return 'Buon pomeriggio';
    return 'Buonasera';
  })();

  return (
    <AppShell titolo={`${saluto}, ${utente?.nome ?? ''}`} sottotitolo={oggi} alertCount={alerts.length}>

      {/* Saluto mobile */}
      <div className="md:hidden mb-4">
        <h1 className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>
          {saluto}, {utente?.nome}
        </h1>
        <p className="text-[13px] capitalize" style={{ color: 'var(--muted-foreground)' }}>{oggi}</p>
      </div>

      {/* KPI — incasso e food cost solo per gestione */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {KPI_MOCK
          .filter(kpi => {
            if (['Incasso ristorante', 'Food cost %'].includes(kpi.label)) return isGestione;
            return true;
          })
          .map(kpi => <KpiCard key={kpi.label} {...kpi} />)}
      </div>

      {/* Griglia principale — layout dipende dal ruolo */}
      <div className={`grid grid-cols-1 gap-4 ${isGestione ? 'md:grid-cols-2' : ''}`}>

        {/* Alert del giorno */}
        <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--foreground)' }}>Alert del giorno</p>
          <p className="text-[11px] mb-3" style={{ color: 'var(--muted-foreground)' }}>
            {loadingAlerts ? '...' : alerts.length === 0 ? 'Tutto ok, nessun alert' : `${alerts.length} ${alerts.length === 1 ? 'elemento richiede' : 'elementi richiedono'} attenzione`}
          </p>
          {loadingAlerts ? (
            <p className="text-sm text-center py-3" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-center py-3" style={{ color: 'var(--status-green-text)' }}>✓ Nessun problema rilevato</p>
          ) : (
            alerts.map((a, i) => (
              a.link
                ? <Link key={i} href={a.link}><AlertItem {...a} /></Link>
                : <AlertItem key={i} {...a} />
            ))
          )}
        </div>

        {/* Presenze — solo admin e titolare */}
        {isGestione && (
          <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
            <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--foreground)' }}>Presenze oggi</p>
            <p className="text-[11px] mb-3" style={{ color: 'var(--muted-foreground)' }}>
              {loadingPresenze ? '...' : `${presenti.length} ${presenti.length === 1 ? 'persona in struttura' : 'persone in struttura'}`}
            </p>
            {loadingPresenze ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
            ) : (
              <DataTable
                colonne={[
                  { header: 'Dipendente', accessor: r => <span className="font-medium text-sm">{r.nome} {r.cognome}</span> },
                  { header: 'Ruolo',  accessor: 'ruolo' },
                  { header: 'Stato',  accessor: () => <StatusBadge status="green" label="In servizio" /> },
                ]}
                dati={presenti}
                emptyText="Nessuno in struttura al momento."
              />
            )}
          </div>
        )}

        {/* Riepilogo camere — cameriere e portiere notte */}
        {(isCameriera || isPortiere) && <RiepilogoCamere />}
      </div>

    </AppShell>
  );
}
