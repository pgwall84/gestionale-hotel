'use client';

// Dashboard principale — KPI, alert, presenze (admin/titolare), camere oggi (cameriere).

import { useState, useEffect } from 'react';
import { BedDouble, UtensilsCrossed, Banknote, TrendingDown, X } from 'lucide-react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import KpiCard from '@/components/ui/KpiCard';
import AlertItem from '@/components/ui/AlertItem';
import StatusBadge from '@/components/ui/StatusBadge';
import DataTable from '@/components/ui/DataTable';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

// Costruisce le card KPI a partire dai dati reali di /dashboard/kpi.
// variazionePercentuale null → badge neutro "—" (nessun dato di confronto,
// non un errore: capita spesso finché non c'è uno storico di almeno un anno).
function badgeVariazione(pct) {
  // null → nessun dato di confronto (comune finché non c'è uno storico di
  // almeno un anno) — KpiCard non mostra badge se badge/badgeVariante mancano
  if (pct === null || pct === undefined) return { badge: undefined, badgeVariante: undefined };
  const segno = pct > 0 ? '+' : '';
  return { badge: `${segno}${pct}%`, badgeVariante: pct >= 0 ? 'green' : 'red' };
}

function costruisciKpi(dati) {
  if (!dati) return [];
  const camerePct = badgeVariazione(dati.camere.variazionePercentuale);
  const copertiPct = badgeVariazione(dati.coperti.variazionePercentuale);
  const incassoPct = badgeVariazione(dati.incasso.variazionePercentuale);
  return [
    {
      label: 'Camere — movimenti oggi', value: `${dati.camere.attuale} / ${dati.camere.totale}`,
      sub: 'arrivi + partenze', Icona: BedDouble, ...camerePct,
    },
    {
      label: 'Coperti oggi', value: String(dati.coperti.attuale),
      sub: 'colazione + pranzo + cena', Icona: UtensilsCrossed, ...copertiPct,
    },
    {
      label: 'Incasso oggi', value: `€ ${dati.incasso.attuale.toFixed(2)}`,
      sub: 'contanti + POS', Icona: Banknote, ...incassoPct,
    },
    {
      label: 'Food cost', value: dati.foodCost.euroPerCoperto !== null ? `€ ${dati.foodCost.euroPerCoperto.toFixed(2)}/coperto` : '—',
      sub: 'mese corrente', Icona: TrendingDown,
    },
  ];
}

// Bottom sheet registrazione incasso giornaliero — solo admin/titolare
function BottomSheetIncasso({ onSalva, onAnnulla, loading }) {
  const [contanti, setContanti] = useState('');
  const [pos, setPos] = useState('');
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
         style={{ background: 'rgba(0,0,0,0.45)' }}
         onClick={onAnnulla}>
      <div className="w-full max-w-xl rounded-t-2xl p-5 flex flex-col gap-3"
           style={{ background: 'var(--card)' }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>Registra incasso di oggi</p>
          <button onClick={onAnnulla}><X size={20} style={{ color: 'var(--muted-foreground)' }} /></button>
        </div>
        <input type="number" step="0.01" placeholder="Contanti €" value={contanti} onChange={e => setContanti(e.target.value)}
               className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />
        <input type="number" step="0.01" placeholder="POS €" value={pos} onChange={e => setPos(e.target.value)}
               className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />
        <input type="text" placeholder="Note (opzionale)" value={note} onChange={e => setNote(e.target.value)}
               className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />
        <button
          onClick={() => onSalva({ contanti: contanti || 0, pos: pos || 0, note })}
          disabled={loading || (!contanti && !pos)}
          className="w-full py-3.5 rounded-xl font-bold text-base"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: (loading || (!contanti && !pos)) ? 0.6 : 1 }}>
          {loading ? 'Salvataggio...' : 'Salva incasso'}
        </button>
      </div>
    </div>
  );
}


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
  const [datiKpi, setDatiKpi] = useState(null);
  const [loadingKpi, setLoadingKpi] = useState(true);
  const [mostraIncasso, setMostraIncasso] = useState(false);
  const [salvandoIncasso, setSalvandoIncasso] = useState(false);

  const isGestione  = ['admin', 'titolare'].includes(utente?.ruolo);
  const isCameriera = utente?.ruolo === 'cameriere';
  const isPortiere  = utente?.ruolo === 'portiere_notte';

  const caricaKpi = () => {
    api.get('/dashboard/kpi')
      .then(r => setDatiKpi(r.data))
      .catch(() => {})
      .finally(() => setLoadingKpi(false));
  };

  useEffect(() => {
    caricaKpi();
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

  const kpiCards = costruisciKpi(datiKpi);

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
        {loadingKpi ? (
          <p className="col-span-2 md:col-span-4 text-center py-4 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Caricamento KPI...
          </p>
        ) : (
          kpiCards
            .filter(k => {
              if (['Incasso oggi', 'Food cost'].includes(k.label)) return isGestione;
              return true;
            })
            .map(k => <KpiCard key={k.label} {...k} />)
        )}
      </div>

      {isGestione && (
        <button onClick={() => setMostraIncasso(true)}
                className="mb-6 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
          Registra incasso di oggi
        </button>
      )}

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

      {mostraIncasso && (
        <BottomSheetIncasso
          loading={salvandoIncasso}
          onAnnulla={() => setMostraIncasso(false)}
          onSalva={async (dati) => {
            setSalvandoIncasso(true);
            try {
              await api.post('/dashboard/incassi', dati);
              setMostraIncasso(false);
              setLoadingKpi(true);
              caricaKpi();
            } catch (err) {
              alert(err.response?.data?.errore || err.message);
            } finally {
              setSalvandoIncasso(false);
            }
          }}
        />
      )}
    </AppShell>
  );
}
