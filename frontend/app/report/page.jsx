'use client';

// Struttura ▸ Report — ADR/RevPAR/TRevPAR (16/08/2026).
//
// Prima pagina di quella che diventerà la sezione "Report": raccoglie qui
// tutti gli indicatori costi/ricavi via via costruiti, invece di lasciarli
// solo come tessere sparse in dashboard. Oggi mostra i primi 3 (gli unici
// che non dipendono da WuBook/A-Cube/altre mail in sospeso — vedi
// docs/EVOLUTIVE.md, voce "Indicatori sviluppabili senza le mail in
// sospeso"), con un selettore di mese per guardare indietro. Gli altri
// indicatori del report KPI originale (GOPPAR, CPOR, Net RevPAR,
// pace/pickup) sono elencati sotto come tessere "non sviluppato" — onestà
// sullo stato reale, stesso pattern già usato in dashboard (WidgetItem
// sviluppato=false) invece di nasconderli del tutto o fingerli pronti.
//
// Riservata admin/titolare: stessa policy con cui "Incasso oggi"/"Registra
// incasso" sono già visibili solo a loro in dashboard — sono dati
// finanziari, non una nuova restrizione inventata per questa pagina.
//
// TRevPAR oggi usa incassi_giornalieri (inserimento manuale, camere+
// ristorante insieme) — quando l'integrazione WuBook/A-Cube sarà completa
// il backend cambierà fonte (vedi commento su ricavoTotalePeriodo() in
// dashboardController.js), questa pagina non richiederà modifiche: legge
// solo il numero già calcolato da GET /dashboard/revenue.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, TrendingUp } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import KpiCard from '@/components/ui/KpiCard';
import WidgetGruppo from '@/components/ui/WidgetGruppo';
import WidgetItem from '@/components/ui/WidgetItem';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const RUOLI_ACCESSO = ['admin', 'titolare'];

// Stessa logica di formattazione data locale usata altrove nel progetto
// (home/page.jsx oggiLocale(), planning-camere/page.jsx oggi()) — evita
// toISOString() che converte in UTC e può far slittare il giorno.
function oggiLocale() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ultimoGiornoMese(meseStr) {
  const [y, m] = meseStr.split('-').map(Number);
  const d = new Date(y, m, 0); // giorno 0 del mese successivo = ultimo giorno del mese richiesto
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function badgeVariazione(pct) {
  if (pct === null || pct === undefined) return { badge: undefined, badgeVariante: undefined };
  const segno = pct > 0 ? '+' : '';
  return { badge: `${segno}${pct}%`, badgeVariante: pct >= 0 ? 'green' : 'red' };
}

function fmtEuro(v) {
  return v !== null && v !== undefined ? `€ ${v.toFixed(2)}` : '—';
}

export default function PaginaReport() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const meseCorrente = oggiLocale().slice(0, 7);
  const [mese, setMese] = useState(meseCorrente);
  const [dati, setDati] = useState(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_ACCESSO.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const carica = useCallback(async (meseSelezionato) => {
    setCaricamento(true);
    setErrore('');
    try {
      const dataQuery = meseSelezionato === meseCorrente ? oggiLocale() : ultimoGiornoMese(meseSelezionato);
      const res = await api.get(`/dashboard/revenue?data=${dataQuery}`);
      setDati(res.data);
    } catch (err) {
      setErrore(err.response?.data?.errore || 'Errore nel caricamento del report.');
    } finally {
      setCaricamento(false);
    }
  }, [meseCorrente]);

  useEffect(() => {
    if (utente && RUOLI_ACCESSO.includes(utente.ruolo)) carica(mese);
  }, [utente, mese, carica]);

  if (loading || !utente) return null;

  return (
    <AppShell titolo="Report" sottotitolo="Indicatori costi/ricavi dell'hotel">

      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} style={{ color: 'var(--hotel-amber)' }} />
          <p className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>
            ADR · RevPAR · TRevPAR
          </p>
        </div>
        <input
          type="month"
          value={mese}
          max={meseCorrente}
          onChange={(e) => setMese(e.target.value)}
          className="rounded-lg px-3 text-[13px]"
          style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
        />
      </div>

      {errore && (
        <p className="text-[13px] mb-4" style={{ color: 'var(--status-red-text)' }}>{errore}</p>
      )}

      {caricamento ? (
        <p className="text-center py-6 text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
          Caricamento report...
        </p>
      ) : dati && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <KpiCard label="ADR — tariffa media" value={fmtEuro(dati.adr.attuale)}
                     sub="ricavo camere / camere-notte vendute" Icona={TrendingUp}
                     {...badgeVariazione(dati.adr.variazionePercentuale)} />
            <KpiCard label="RevPAR — ricavo per camera disp." value={fmtEuro(dati.revpar.attuale)}
                     sub="ricavo camere / camere-notte disponibili" Icona={TrendingUp}
                     {...badgeVariazione(dati.revpar.variazionePercentuale)} />
            <KpiCard label="TRevPAR — ricavo totale per camera disp." value={fmtEuro(dati.trevpar.attuale)}
                     sub="ricavo totale (camere+ristorante) / camere-notte disponibili" Icona={TrendingUp}
                     {...badgeVariazione(dati.trevpar.variazionePercentuale)} />
          </div>

          {/* Dettaglio periodo — i numeri grezzi dietro i 3 indicatori sopra,
              utile al titolare per verificare a occhio invece di fidarsi
              ciecamente del rapporto. */}
          <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
            <p className="text-[12px] font-medium mb-3" style={{ color: 'var(--foreground)' }}>
              Dettaglio periodo — dal {dati.periodo.inizio} al {dati.periodo.fine} ({dati.periodo.giorni} giorni,
              {' '}{dati.periodo.camereAttive} camere attive)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
              <div>
                <p style={{ color: 'var(--muted-foreground)' }}>Camere-notte vendute</p>
                <p className="font-medium" style={{ color: 'var(--foreground)' }}>{dati.dettaglio.camereNotteVendute}</p>
              </div>
              <div>
                <p style={{ color: 'var(--muted-foreground)' }}>Camere-notte disponibili</p>
                <p className="font-medium" style={{ color: 'var(--foreground)' }}>{dati.dettaglio.camereNotteDisponibili}</p>
              </div>
              <div>
                <p style={{ color: 'var(--muted-foreground)' }}>Ricavo camere</p>
                <p className="font-medium" style={{ color: 'var(--foreground)' }}>{fmtEuro(dati.dettaglio.ricavoCamere)}</p>
              </div>
              <div>
                <p style={{ color: 'var(--muted-foreground)' }}>Ricavo totale</p>
                <p className="font-medium" style={{ color: 'var(--foreground)' }}>{fmtEuro(dati.dettaglio.ricavoTotale)}</p>
              </div>
            </div>
            <p className="text-[11px] mt-3" style={{ color: 'var(--muted-foreground)' }}>
              Anno scorso (stesso periodo): {dati.dettaglio.camereNotteVenduteAnnoScorso} camere-notte vendute,
              {' '}ricavo camere {fmtEuro(dati.dettaglio.ricavoCamereAnnoScorso)}, ricavo totale {fmtEuro(dati.dettaglio.ricavoTotaleAnnoScorso)}.
            </p>
          </div>

          {/* Nota metodologica — le due approssimazioni note, dichiarate
              esplicitamente invece di lasciare che qualcuno le scopra da
              solo confrontando i numeri con altre fonti. */}
          <div className="rounded-xl p-4 mb-6 text-[12px] leading-relaxed" style={{ background: 'var(--card)', border: '0.5px dashed var(--border)', color: 'var(--muted-foreground)' }}>
            <p className="font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Nota metodologica</p>
            <p className="mb-1">
              <strong>TRevPAR</strong> usa oggi il totale incassi (contanti+POS) inserito a mano ogni giorno
              (camere e ristorante insieme, non scorporabile). Quando WuBook (camere) e A-Cube (ristorante)
              saranno collegati, il ricavo totale sarà calcolato automaticamente dai pagamenti reali — il
              calcolo si aggiornerà da solo, senza intervento su questa pagina.
            </p>
            <p>
              <strong>Camere disponibili</strong> nel periodo = camere attive oggi × giorni del periodo: non
              esiste uno storico di quando una camera è stata attivata/disattivata, quindi anche per l'anno
              scorso si usa il numero di camere attive adesso.
            </p>
          </div>
        </>
      )}

      {/* Altri indicatori — evolutiva, non ancora sviluppati (16/08/2026).
          Stesso pattern "onesto" già usato in dashboard (WidgetItem
          sviluppato=false): dichiara cosa manca invece di nasconderlo o
          mostrare uno zero finto. Dettaglio del perché ciascuno è bloccato
          in docs/EVOLUTIVE.md. */}
      <WidgetGruppo titolo="Altri indicatori (in programma)" Icona={BarChart3}>
        <WidgetItem label="GOPPAR" sviluppato={false}
                    messaggio="Serve il costo del personale per camera — nessun dato di costo del lavoro in anagrafica oggi." />
        <WidgetItem label="Net RevPAR" sviluppato={false}
                    messaggio="Serve la commissione per canale di vendita — dato che arriverà con l'integrazione WuBook." />
        <WidgetItem label="CPOR — costo per camera occupata" sviluppato={false}
                    messaggio="Stesso limite di GOPPAR: manca il costo del personale allocato alle camere." />
        <WidgetItem label="Pace / Pickup" sviluppato={false}
                    messaggio="Calcolabile oggi solo per le prenotazioni dirette — incompleto finché OTA/WuBook non sono collegati." />
      </WidgetGruppo>

    </AppShell>
  );
}
