'use client';

// Pagina Impostazioni ▸ Alloggiati Web — Modulo 2.5, Fase 1b.
// Sincronizza le tabelle di codifica (Luoghi, Tipi_Documento, Tipi_Alloggiato)
// da WS_ALLOGGIATI — sola lettura verso il servizio esterno, nessun dato
// ospite viene mai inviato qui. Il generatore di schedina e l'invio reale
// (Test/Send) arrivano con la Fase 2. Richiede ALLOGGIATI_UTENTE/PASSWORD/
// WSKEY in backend/.env — se mancanti, "Sincronizza ora" restituisce un
// errore chiaro invece di un 500 generico.
// Riservata ad admin/titolare (shared/ruoli.js sezione 'alloggiati', azione
// 'sincronizza') — stesso criterio di 'tassa_soggiorno'.configurazione:
// tocca credenziali/configurazione, non è operatività quotidiana.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const RUOLI_SINCRONIZZA = ['admin', 'titolare'];

const NOMI_TABELLE = {
  Luoghi: 'Luoghi (Stati + Comuni)',
  Tipi_Documento: 'Tipi documento',
  Tipi_Alloggiato: 'Tipi alloggiato',
};

export default function PaginaImpostazioniAlloggiati() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const [stato, setStato] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [sincronizzando, setSincronizzando] = useState(false);
  const [errore, setErrore] = useState('');
  const [successo, setSuccesso] = useState('');

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_SINCRONIZZA.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const caricaStato = useCallback(async () => {
    setCaricamento(true);
    try {
      const res = await api.get('/alloggiati/stato');
      setStato(res.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento dello stato.');
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => {
    if (utente && RUOLI_SINCRONIZZA.includes(utente.ruolo)) caricaStato();
  }, [utente, caricaStato]);

  async function sincronizza() {
    setSincronizzando(true);
    setErrore('');
    setSuccesso('');
    try {
      const res = await api.post('/alloggiati/sincronizza');
      const dettaglio = res.data.risultati
        .map(r => `${NOMI_TABELLE[r.tabella] || r.tabella}: ${r.righe_sincronizzate} codici`)
        .join(' · ');
      setSuccesso(`Sincronizzazione completata — ${dettaglio}`);
      caricaStato();
    } catch (err) {
      setErrore(err.message || 'Errore nella sincronizzazione.');
    } finally {
      setSincronizzando(false);
    }
  }

  if (loading || !utente) return null;

  const numeroCodiciTotale = (tabella) => stato.find(s => s.tabella === tabella)?.numero_codici ?? 0;
  const ultimoSync = (tabella) => stato.find(s => s.tabella === tabella)?.ultimo_sync;

  return (
    <AppShell titolo="Alloggiati Web">
      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}
      {successo && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
          {successo}
        </div>
      )}

      <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Tabelle di codifica</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              Nazionalità, comuni di nascita e tipi documento usati nelle tendine della scheda cliente.
              Operazione di sola lettura verso Alloggiati Web — nessun dato ospite viene inviato.
            </p>
          </div>
          <button onClick={sincronizza} disabled={sincronizzando}
                  className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60 shrink-0"
                  style={{ background: 'var(--hotel-navy)' }}>
            <RefreshCw size={13} className={sincronizzando ? 'animate-spin' : ''} />
            {sincronizzando ? 'Sincronizzazione...' : 'Sincronizza ora'}
          </button>
        </div>

        {caricamento ? (
          <p className="text-center py-6 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ border: '0.5px solid var(--border)' }}>
            {Object.entries(NOMI_TABELLE).map(([tabella, nome], idx, arr) => (
              <div key={tabella}
                   className="flex items-center justify-between px-3 py-2.5 text-sm"
                   style={{
                     background: idx % 2 === 0 ? 'var(--card)' : 'var(--background)',
                     borderBottom: idx === arr.length - 1 ? 'none' : '0.5px solid var(--border)',
                   }}>
                <span>{nome}</span>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {numeroCodiciTotale(tabella) > 0
                    ? `${numeroCodiciTotale(tabella)} codici · ultimo sync ${new Date(ultimoSync(tabella)).toLocaleString('it-IT')}`
                    : 'Mai sincronizzata'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
