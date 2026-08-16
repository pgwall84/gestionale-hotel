'use client';

// Dashboard principale — KPI, widget a gruppi (14/08/2026), alert, presenze
// (admin/titolare), camere oggi (cameriere/portiere notte).
//
// La griglia di widget a gruppi (Clienti/Adempimenti/Hotel/Costi/Ristorante)
// sostituisce concettualmente la vecchia lista piatta di "Alert del giorno"
// come punto di ingresso principale per admin/titolare: ogni tessera è un
// numero reale cliccabile che porta alla pagina che lo gestisce, raggruppato
// per tema. Dove il dato non esiste ancora (integrazione OTA/WuBook — modulo
// 2.3 non avviato; stima automatica fabbisogno cucina) la tessera lo dichiara
// apertamente ("Modulo non sviluppato") invece di mostrare uno zero finto.
// Vedi docs/DIARIO_SESSIONI.md, voce 14/08/2026, per la ricerca sui
// competitor (TeamSystem/Cloudbeds/Mews) che ha guidato questo pattern.
//
// La vecchia lista di alert resta sotto, ridimensionata: molte voci sono
// ora coperte dai widget dedicati, ma alcune (scadenze HR, opzioni
// prenotazione in scadenza, pre check-in da rivedere, documenti Alloggiati
// incompleti) non hanno ancora una tessera propria — tenerla evita di perdere
// segnalazioni reali finché non si decide se/come integrarle nei gruppi.

import { useState, useEffect } from 'react';
import {
  BedDouble, UtensilsCrossed, Banknote, TrendingDown, TrendingUp, X,
  Users, ShieldCheck, Wrench, UtensilsCrossed as IconaRistorante,
} from 'lucide-react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import KpiCard from '@/components/ui/KpiCard';
import AlertItem from '@/components/ui/AlertItem';
import StatusBadge from '@/components/ui/StatusBadge';
import DataTable from '@/components/ui/DataTable';
import WidgetGruppo from '@/components/ui/WidgetGruppo';
import WidgetItem from '@/components/ui/WidgetItem';
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

// ADR/RevPAR/TRevPAR (16/08/2026) — traduce variazionePercentuale in
// stato/sub per WidgetItem, stessa filosofia di badgeVariazione() sopra ma
// per il vocabolario verde/ambra/rosso/neutro di WidgetItem invece del
// badge di KpiCard (i due componenti non condividono le stesse prop).
function statoTrendRicavi(pct) {
  if (pct === null || pct === undefined) return 'neutro';
  return pct >= 0 ? 'verde' : 'rosso';
}
function subTrendRicavi(pct) {
  if (pct === null || pct === undefined) return 'mese in corso · nessun confronto disponibile';
  const segno = pct > 0 ? '+' : '';
  return `mese in corso · ${segno}${pct}% vs anno scorso`;
}

function formattaDataOra(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Data locale 'YYYY-MM-DD' senza passare da toISOString() (converte in UTC
// e può far slittare il giorno) — stesso pattern usato altrove nel
// progetto (vedi planning-camere/page.jsx, oggi()).
function oggiLocale() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Aggrega le righe di GET /prenotazioni/griglia (una riga per camera per
// soggiorno che si sovrappone al range) in percentuale-occupata per
// ciascuno dei 30 giorni a partire da `oggiStr` (16/08/2026, punto 4
// evolutiva dashboard). data_arrivo/data_partenza arrivano già come
// stringa 'YYYY-MM-DD' (types.setTypeParser(1082, ...) in
// backend/config/db.js), confrontabili lessicograficamente come le date
// ISO — nessun new Date() necessario per il confronto, solo per generare
// la sequenza dei 30 giorni.
function calcolaOccupazione30Giorni(righe, oggiStr) {
  const camereAttive = new Set(righe.map(r => r.camera_id));
  const totale = camereAttive.size;
  const [y, m, g] = oggiStr.split('-').map(Number);
  const giorni = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(y, m - 1, g + i);
    const dataStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const occupate = new Set(
      righe
        .filter(r => r.soggiorno_id && r.data_arrivo <= dataStr && r.data_partenza > dataStr)
        .map(r => r.camera_id)
    ).size;
    giorni.push({
      data: dataStr,
      occupate,
      totale,
      percentuale: totale > 0 ? Math.round((occupate / totale) * 100) : 0,
    });
  }
  return giorni;
}

// Bottom sheet registrazione incasso giornaliero — solo admin/titolare
//
// Suggerimento automatico (14/08/2026): all'apertura precompila
// contanti/POS da GET /dashboard/incassi/suggerimento, che somma i
// pagamenti REALI (tabella `pagamenti`, per metodo) registrati oggi.
// Copre SOLO la parte camere — i pagamenti del ristorante non passano da
// quella tabella (chiude ancora sul registratore fisico Hugin RT-K50, non
// integrato — lo sostituirà A-Cube, modulo 3.1). Resta sempre un
// suggerimento modificabile, mai un valore imposto: il titolare può
// correggerlo o cancellarlo come prima di questa modifica.
function BottomSheetIncasso({ onSalva, onAnnulla, loading }) {
  const [contanti, setContanti] = useState('');
  const [pos, setPos] = useState('');
  const [note, setNote] = useState('');
  const [suggerimento, setSuggerimento] = useState(null); // { contanti, pos, altri } | null
  const [caricandoSuggerimento, setCaricandoSuggerimento] = useState(true);

  useEffect(() => {
    api.get(`/dashboard/incassi/suggerimento?data=${oggiLocale()}`)
      .then((r) => {
        setSuggerimento(r.data);
        // Precompila solo se c'è qualcosa da suggerire — un form vuoto
        // resta più chiaro di due zeri che sembrano già "confermati".
        if (r.data.contanti > 0) setContanti(String(r.data.contanti));
        if (r.data.pos > 0) setPos(String(r.data.pos));
      })
      .catch(() => {
        // Non bloccante: il form resta vuoto e compilabile a mano come
        // sempre, il suggerimento è solo un aiuto, non un requisito.
        setSuggerimento(null);
      })
      .finally(() => setCaricandoSuggerimento(false));
  }, []);

  const altriPagamenti = (suggerimento?.altri?.bonifico || 0) + (suggerimento?.altri?.altro || 0);

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
        {!caricandoSuggerimento && suggerimento && (suggerimento.contanti > 0 || suggerimento.pos > 0) && (
          <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            Precompilato da pagamenti camera registrati oggi (check-out/depositi) — <strong>il ristorante non è incluso</strong>, aggiungilo tu. Puoi correggere entrambi i campi.
          </p>
        )}
        {!caricandoSuggerimento && altriPagamenti > 0 && (
          <p className="text-[11px]" style={{ color: 'var(--hotel-amber)' }}>
            Non incluso nel suggerimento: € {altriPagamenti.toFixed(2)} pagati con bonifico/altro metodo — verifica se vanno sommati a mano.
          </p>
        )}
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

// Griglia dei 5 gruppi di widget — solo admin/titolare. Dati da /dashboard/gruppi
// più incasso/food cost già disponibili da /dashboard/kpi (nessuna doppia query).
// Stato/sub della tessera Incasso in base alla quadratura (16/08/2026,
// punto 3 evolutiva dashboard) — vedi dashboardController.quadraturaIncasso.
// dichiarato === null → titolare non ha ancora registrato nulla oggi,
// niente da confrontare: nessuno stato invece di un falso "ambra".
// copreRistorante è sempre false (limite noto, non un bug) — lo diciamo
// esplicitamente nel sub per non far credere a una quadratura completa.
function statoQuadraturaIncasso(datiQuadratura) {
  if (!datiQuadratura || datiQuadratura.dichiarato === null) {
    return { stato: undefined, sub: 'contanti + POS' };
  }
  if (datiQuadratura.significativo) {
    const segno = datiQuadratura.scostamento > 0 ? '+' : '';
    return {
      stato: 'ambra',
      sub: `Scostamento ${segno}€ ${datiQuadratura.scostamento.toFixed(2)} da pagamenti camere (non copre ristorante)`,
    };
  }
  return { stato: 'verde', sub: 'Quadra con i pagamenti camere (non copre ristorante)' };
}

// Fascia "Occupazione prossimi 30 giorni" (16/08/2026, punto 4 evolutiva
// dashboard) — sola lettura, colpo d'occhio: intensità del colore
// proporzionale alla percentuale occupata, nessun semaforo verde/ambra/rosso
// (un'alta occupazione è una buona notizia, non un allarme — riusare i
// colori di stato dell'app per "pieno" avrebbe letto come un problema).
// Link generico a /planning-camere (senza deep-link al giorno: non è lo
// scopo di questa fascia, che resta un riepilogo, non un punto di ingresso
// per editare una prenotazione specifica).
function FasciaOccupazione30Giorni({ giorni }) {
  if (!giorni) return null;
  return (
    <div className="rounded-xl p-3 mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-medium" style={{ color: 'var(--muted-foreground)' }}>
          Occupazione prossimi 30 giorni
        </p>
        <Link href="/planning-camere" className="text-[11px] font-medium" style={{ color: 'var(--hotel-amber)' }}>
          Vai al planning
        </Link>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {giorni.map(g => (
          <div key={g.data}
               title={`${fmtGiornoBreve(g.data)} — ${g.occupate}/${g.totale} camere occupate (${g.percentuale}%)`}
               className="flex-1 min-w-[10px] h-10 rounded"
               style={{ background: 'var(--status-blue-text)', opacity: 0.12 + (g.percentuale / 100) * 0.78 }} />
        ))}
      </div>
    </div>
  );
}

function fmtGiornoBreve(dataStr) {
  return new Date(`${dataStr}T00:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}

function GrigliaWidget({ dati, datiKpi, loading, datiQuadratura, datiRevenue, onRegistraIncasso }) {
  if (loading) {
    return (
      <p className="text-center py-6 text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
        Caricamento widget...
      </p>
    );
  }
  if (!dati) return null;

  const { clienti, adempimenti, hotel, ristorante } = dati;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

      {/* Gestione cliente — più importante, in alto a sinistra, doppia larghezza */}
      <WidgetGruppo titolo="Gestione cliente" Icona={Users} className="lg:col-span-2">
        <WidgetItem label="Arrivi oggi" valore={clienti.arriviOggi} href="/arrivi-partenze" />
        <WidgetItem label="Partenze oggi" valore={clienti.partenzeOggi} href="/arrivi-partenze" />
        <WidgetItem label="Check-in da fare" valore={clienti.checkInDaFare}
                    stato={clienti.checkInDaFare > 0 ? 'ambra' : 'verde'} href="/arrivi-partenze" />
        <WidgetItem label="Pre check-in da inviare" valore={clienti.preCheckinDaInviare}
                    stato={clienti.preCheckinDaInviare > 0 ? 'ambra' : 'verde'} href="/pre-checkin" />
        <WidgetItem label="Prenotazioni OTA da gestire" sviluppato={false}
                    messaggio={clienti.prenotazioniOta.messaggio} />
      </WidgetGruppo>

      {/* Adempimenti */}
      <WidgetGruppo titolo="Adempimenti" Icona={ShieldCheck}>
        <WidgetItem label="Alloggiati Web"
                    valore={`${adempimenti.alloggiatiWeb.daInviare} da inviare`}
                    sub={adempimenti.alloggiatiWeb.ultimoInvio
                      ? `Ultimo invio: ${formattaDataOra(adempimenti.alloggiatiWeb.ultimoInvio)}`
                      : 'Nessun invio riuscito registrato'}
                    stato={adempimenti.alloggiatiWeb.stato} href="/alloggiati-web" />
        <WidgetItem label="Statistiche Liguria" sub={adempimenti.statisticheLiguria.messaggio}
                    stato="neutro" href="/impostazioni/ross1000" />
        <WidgetItem label="ZTL — targhe mancanti" valore={adempimenti.ztlMancanti}
                    stato={adempimenti.ztlMancanti > 0 ? 'rosso' : 'verde'} href="/ztl" />
        <WidgetItem label="Tassa di soggiorno da riscuotere" valore={adempimenti.tassaDaRiscuotere}
                    stato={adempimenti.tassaDaRiscuotere > 0 ? 'ambra' : 'verde'} href="/tassa-soggiorno" />
      </WidgetGruppo>

      {/* Gestione hotel */}
      <WidgetGruppo titolo="Gestione hotel" Icona={Wrench}>
        <WidgetItem label="Camere da fare" valore={hotel.camereDaFare}
                    stato={hotel.camereDaFare > 0 ? 'ambra' : 'verde'} href="/camere" />
        <WidgetItem label="Manutenzioni aperte" valore={hotel.manutenzioniAperte}
                    sub={hotel.manutenzioniUrgenti > 0 ? `${hotel.manutenzioniUrgenti} urgenti` : undefined}
                    stato={hotel.manutenzioniUrgenti > 0 ? 'rosso' : hotel.manutenzioniAperte > 0 ? 'ambra' : 'verde'}
                    href="/manutenzione" />
        <WidgetItem label="Magazzino sotto scorta" valore={hotel.magazzinoSottoScorta}
                    stato={hotel.magazzinoSottoScorta > 0 ? 'ambra' : 'verde'} href="/magazzino" />
        <WidgetItem label="Materiale per i prossimi pasti" sviluppato={false}
                    messaggio={hotel.fabbisognoPasti.messaggio} />
      </WidgetGruppo>

      {/* Ristorante — affiancato a Gestione hotel, non isolato su una riga a sé */}
      <WidgetGruppo titolo="Ristorante" Icona={IconaRistorante}>
        <WidgetItem label="Coperti colazione" valore={ristorante.copertiColazione} />
        <WidgetItem label="Coperti pranzo" valore={ristorante.copertiPranzo} />
        <WidgetItem label="Coperti cena" valore={ristorante.copertiCena} />
        <WidgetItem label="Tavoli occupati ora" valore={ristorante.tavoliOccupatiOra}
                    sub="comande aperte oggi" href="/sala" />
        <WidgetItem label="Menu del giorno" valore={ristorante.menuPronto ? 'Pronto' : 'Da controllare'}
                    stato={ristorante.menuPronto ? 'verde' : 'ambra'} href="/menu" />
      </WidgetGruppo>

      {/* Costi — riusa i dati già caricati da /dashboard/kpi, nessuna query in più.
          "Registra incasso" vive qui ora (prima era un bottone isolato sopra la
          griglia, senza contesto): è l'unico modo per inserire il dato che questo
          stesso widget mostra come "Incasso oggi" — incassi_giornalieri non ha
          nessuna fonte automatica, va sempre registrato a mano dal titolare. */}
      <WidgetGruppo titolo="Costi" Icona={Banknote}
                     azione={onRegistraIncasso && (
                       <button onClick={onRegistraIncasso} className="text-[11px] font-medium shrink-0"
                               style={{ color: 'var(--hotel-amber)' }}>
                         + Registra incasso
                       </button>
                     )}>
        <WidgetItem label="Incasso oggi"
                    valore={datiKpi ? `€ ${datiKpi.incasso.attuale.toFixed(2)}` : '—'}
                    {...statoQuadraturaIncasso(datiQuadratura)} />
        <WidgetItem label="Food cost mese"
                    valore={datiKpi?.foodCost.euroPerCoperto !== null && datiKpi?.foodCost.euroPerCoperto !== undefined
                      ? `€ ${datiKpi.foodCost.euroPerCoperto.toFixed(2)}/coperto` : '—'} />
      </WidgetGruppo>

      {/* Ricavi — ADR/RevPAR/TRevPAR (16/08/2026), primi 3 indicatori del
          report KPI costruiti: non dipendono da WuBook/A-Cube, vedi
          docs/EVOLUTIVE.md. Mese in corso, click-through verso /report per
          il dettaglio (mesi precedenti, nota metodologica). Gli altri
          indicatori (GOPPAR, CPOR, Net RevPAR, pace/pickup...) restano
          evolutiva finché non ci sono i dati che richiedono — vedi stesso
          documento. */}
      <WidgetGruppo titolo="Ricavi" Icona={TrendingUp}>
        <WidgetItem label="ADR" valore={datiRevenue?.adr?.attuale !== null && datiRevenue?.adr?.attuale !== undefined
                      ? `€ ${datiRevenue.adr.attuale.toFixed(2)}` : '—'}
                    sub={subTrendRicavi(datiRevenue?.adr?.variazionePercentuale)}
                    stato={statoTrendRicavi(datiRevenue?.adr?.variazionePercentuale)} href="/report" />
        <WidgetItem label="RevPAR" valore={datiRevenue?.revpar?.attuale !== null && datiRevenue?.revpar?.attuale !== undefined
                      ? `€ ${datiRevenue.revpar.attuale.toFixed(2)}` : '—'}
                    sub={subTrendRicavi(datiRevenue?.revpar?.variazionePercentuale)}
                    stato={statoTrendRicavi(datiRevenue?.revpar?.variazionePercentuale)} href="/report" />
        <WidgetItem label="TRevPAR" valore={datiRevenue?.trevpar?.attuale !== null && datiRevenue?.trevpar?.attuale !== undefined
                      ? `€ ${datiRevenue.trevpar.attuale.toFixed(2)}` : '—'}
                    sub={subTrendRicavi(datiRevenue?.trevpar?.variazionePercentuale)}
                    stato={statoTrendRicavi(datiRevenue?.trevpar?.variazionePercentuale)} href="/report" />
        <WidgetItem label="Report completo" sub="Dettaglio, mesi precedenti, nota metodologica" href="/report" />
      </WidgetGruppo>

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
  const [datiGruppi, setDatiGruppi] = useState(null);
  const [datiQuadratura, setDatiQuadratura] = useState(null);
  const [occupazione30gg, setOccupazione30gg] = useState(null);
  const [datiRevenue, setDatiRevenue] = useState(null);
  const [loadingGruppi, setLoadingGruppi] = useState(true);
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
      api.get('/dashboard/gruppi')
        .then(r => setDatiGruppi(r.data))
        .catch(() => {})
        .finally(() => setLoadingGruppi(false));
      // Quadratura incasso (16/08/2026, punto 3 evolutiva dashboard) — solo
      // admin/titolare, stessa restrizione di /incassi/suggerimento. Se
      // fallisce (es. ruolo senza permesso su una build vecchia) la tessera
      // Incasso resta semplicemente senza badge, non rompe il resto.
      api.get('/dashboard/incassi/quadratura')
        .then(r => setDatiQuadratura(r.data))
        .catch(() => {});
      // ADR/RevPAR/TRevPAR mese in corso (16/08/2026) — dettaglio completo
      // e mesi precedenti su /report, questa è solo l'istantanea del mese
      // corrente per il colpo d'occhio in dashboard.
      api.get('/dashboard/revenue')
        .then(r => setDatiRevenue(r.data))
        .catch(() => {});
      // Occupazione prossimi 30 giorni (16/08/2026, punto 4 evolutiva
      // dashboard) — nessun endpoint nuovo: riusa GET /prenotazioni/griglia
      // (la stessa fonte dati di /planning-camere e dell'export PDF
      // "Planning mensile"), aggregata qui in percentuale-per-giorno invece
      // di renderizzare la griglia interattiva completa. Quella resta lo
      // strumento per lavorare sulle prenotazioni; questa è solo un colpo
      // d'occhio, senza drag&drop.
      const oggiG = oggiLocale();
      const [yG, mG, gG] = oggiG.split('-').map(Number);
      const fine30 = new Date(yG, mG - 1, gG + 30);
      const dataFine30 = `${fine30.getFullYear()}-${String(fine30.getMonth() + 1).padStart(2, '0')}-${String(fine30.getDate()).padStart(2, '0')}`;
      api.get(`/prenotazioni/griglia?data_inizio=${oggiG}&data_fine=${dataFine30}`)
        .then(r => setOccupazione30gg(calcolaOccupazione30Giorni(r.data, oggiG)))
        .catch(() => {});
    } else {
      setLoadingPresenze(false);
      setLoadingAlerts(false);
      setLoadingGruppi(false);
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

      {/* KPI — solo per chi NON vede la griglia widget sotto (cameriere, cuoco,
          portiere notte, receptionist): per admin/titolare questi 4 numeri sono
          ora ridondanti con Gestione cliente/Ristorante/Costi, tolti da qui per
          non mostrare lo stesso dato due volte nella stessa pagina. */}
      {!isGestione && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {loadingKpi ? (
            <p className="col-span-2 md:col-span-4 text-center py-4 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Caricamento KPI...
            </p>
          ) : (
            kpiCards.map(k => <KpiCard key={k.label} {...k} />)
          )}
        </div>
      )}

      {/* Widget a gruppi — solo admin/titolare. Il pulsante "Registra incasso"
          vive dentro il widget Costi (azione del gruppo), non più isolato qui. */}
      {isGestione && (
        <GrigliaWidget dati={datiGruppi} datiKpi={datiKpi} loading={loadingGruppi}
                        datiQuadratura={datiQuadratura} datiRevenue={datiRevenue}
                        onRegistraIncasso={() => setMostraIncasso(true)} />
      )}

      {/* Occupazione prossimi 30 giorni — solo admin/titolare, stessa
          restrizione di /prenotazioni/griglia (16/08/2026, punto 4). */}
      {isGestione && <FasciaOccupazione30Giorni giorni={occupazione30gg} />}

      {/* Griglia secondaria — layout dipende dal ruolo */}
      <div className={`grid grid-cols-1 gap-4 ${isGestione ? 'md:grid-cols-2' : ''}`}>

        {/* Altri alert — quanto non ancora coperto da un widget dedicato sopra
            (scadenze HR, opzioni prenotazione in scadenza, pre check-in da
            rivedere, documenti Alloggiati Web incompleti, menu non configurato).
            Solo admin/titolare: per gli altri ruoli `alerts` non viene mai
            caricato (vedi useEffect sotto) — mostrarlo comunque avrebbe fatto
            vedere "Tutto ok, nessun alert" anche a receptionist/cuoco/dipendente
            senza che l'endpoint fosse mai stato interrogato per loro: non
            un'informazione mancante, una falsa rassicurazione. */}
        {isGestione && (
          <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
            <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--foreground)' }}>Altri alert</p>
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
        )}

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
