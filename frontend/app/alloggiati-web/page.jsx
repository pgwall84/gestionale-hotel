'use client';

// Pagina Alloggiati Web — operativa (gruppo ADEMPIMENTI). Modulo 2.5, Fase 2.
// Nuova (14/08/2026): prima "Coda invii" e "Ricevute" vivevano dentro
// Impostazioni ▸ Alloggiati Web insieme alla configurazione (credenziali,
// sync tabelle, verifica schedina di test) — una pagina di configurazione
// non è il posto giusto per un'operazione quotidiana ("invia ora questo
// soggiorno rimasto in coda"). Split deciso col titolare mentre si
// discuteva la riorganizzazione del menu: qui solo ciò che la reception fa
// ogni giorno, la configurazione resta in Impostazioni ▸ Alloggiati Web
// (link in fondo a questa pagina).
// L'invio reale automatico resta il flusso primario (job notturno, ore
// 02:00, backend/jobs/invioAlloggiatiWeb.js) — "Invia ora" qui sotto è il
// caso d'eccezione per chi non vuole aspettare la notte o deve ritentare
// un soggiorno andato in errore dopo aver corretto la scheda ospite.
// Stessi endpoint di prima (nessuna modifica backend): GET /alloggiati/coda,
// POST /alloggiati/soggiorni/:id/invia, GET /alloggiati/ricevute,
// POST /alloggiati/ricevute/:data/scarica, GET /alloggiati/ricevute/:data/file.
// Riservata ad admin/titolare (shared/ruoli.js sezione 'alloggiati', azioni
// 'invio'/'ricevute') — stesso perimetro di prima, solo su una pagina diversa.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Settings } from 'lucide-react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const RUOLI_ADEMPIMENTO = ['admin', 'titolare'];

export default function PaginaAlloggiatiWebOperativa() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const [errore, setErrore] = useState('');
  const [successo, setSuccesso] = useState('');

  const [coda, setCoda] = useState({ daInviare: [], inviatiRecenti: [] });
  const [caricamentoCoda, setCaricamentoCoda] = useState(true);
  const [inviandoId, setInviandoId] = useState(null);

  const [ricevute, setRicevute] = useState([]);
  const [caricamentoRicevute, setCaricamentoRicevute] = useState(true);
  const [scaricandoData, setScaricandoData] = useState(null);

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_ADEMPIMENTO.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const caricaCoda = useCallback(async () => {
    setCaricamentoCoda(true);
    try {
      const res = await api.get('/alloggiati/coda');
      setCoda(res.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento della coda invii.');
    } finally {
      setCaricamentoCoda(false);
    }
  }, []);

  useEffect(() => {
    if (utente && RUOLI_ADEMPIMENTO.includes(utente.ruolo)) caricaCoda();
  }, [utente, caricaCoda]);

  const caricaRicevute = useCallback(async () => {
    setCaricamentoRicevute(true);
    try {
      const res = await api.get('/alloggiati/ricevute');
      setRicevute(res.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento delle ricevute.');
    } finally {
      setCaricamentoRicevute(false);
    }
  }, []);

  useEffect(() => {
    if (utente && RUOLI_ADEMPIMENTO.includes(utente.ruolo)) caricaRicevute();
  }, [utente, caricaRicevute]);

  async function inviaOra(riga) {
    const nomeOspite = `${riga.cognome} ${riga.nome}`;
    const conferma = window.confirm(
      `Invio REALE ad Alloggiati Web per ${nomeOspite} (camera ${riga.camera_numero}, arrivo ${riga.data_arrivo}).\n\n` +
      `Questo registra davvero l'ospite presso la Polizia di Stato — usalo solo se è un ospite vero effettivamente in struttura. Continuare?`
    );
    if (!conferma) return;

    setInviandoId(riga.soggiorno_id);
    setErrore('');
    setSuccesso('');
    try {
      const res = await api.post(`/alloggiati/soggiorni/${riga.soggiorno_id}/invia`, { conferma_dati_reali: true });
      const esito = res.data.esito;
      if (esito === 'ok') {
        setSuccesso(`Inviato — ${nomeOspite}: schedina acquisita da WS_ALLOGGIATI.`);
      } else {
        setErrore(`${nomeOspite}: esito "${esito}"${res.data.dettaglio ? ` — ${res.data.dettaglio}` : ''}.`);
      }
      caricaCoda();
    } catch (err) {
      setErrore(`${nomeOspite}: ${err.message || 'invio fallito.'}`);
    } finally {
      setInviandoId(null);
    }
  }

  async function scaricaOraRicevuta(data) {
    setScaricandoData(data);
    setErrore('');
    setSuccesso('');
    try {
      await api.post(`/alloggiati/ricevute/${data}/scarica`);
      setSuccesso(`Ricevuta del ${new Date(data).toLocaleDateString('it-IT')} scaricata.`);
      caricaRicevute();
    } catch (err) {
      setErrore(err.message || 'Download ricevuta fallito.');
    } finally {
      setScaricandoData(null);
    }
  }

  async function apriRicevuta(data) {
    try {
      const token = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('token='))?.split('=')[1];
      const { protocol, hostname } = window.location;
      const base = `${protocol}//${hostname}:7001/api`;
      const res = await fetch(`${base}/alloggiati/ricevute/${data}/file`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setErrore('Errore durante il download della ricevuta.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `ricevuta-alloggiati-${data}.pdf`;
      a.click(); URL.revokeObjectURL(url);
    } catch {
      setErrore('Errore durante il download della ricevuta.');
    }
  }

  if (loading || !utente) return null;

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

      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <div className="mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Coda invii</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            L&apos;invio reale è automatico ogni notte alle 02:00. Qui sotto solo i casi da gestire subito a mano —
            invio anticipato o soggiorni in errore da ritentare dopo aver corretto la scheda ospite.
          </p>
        </div>

        {caricamentoCoda ? (
          <p className="text-center py-6 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : coda.daInviare.length === 0 ? (
          <p className="text-center py-6 text-sm" style={{ color: 'var(--status-green-text)' }}>
            Tutto allineato — nessun soggiorno in attesa di invio.
          </p>
        ) : (
          <div className="rounded-lg overflow-hidden mb-3" style={{ border: '0.5px solid var(--border)' }}>
            {coda.daInviare.map((riga, idx, arr) => (
              <div key={riga.soggiorno_id}
                   className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                   style={{
                     background: idx % 2 === 0 ? 'var(--card)' : 'var(--background)',
                     borderBottom: idx === arr.length - 1 ? 'none' : '0.5px solid var(--border)',
                   }}>
                <div className="min-w-0">
                  <p className="font-medium truncate">{riga.cognome} {riga.nome} — Camera {riga.camera_numero}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    Arrivo {new Date(riga.data_arrivo).toLocaleDateString('it-IT')}
                    {riga.ultimo_esito
                      ? <span style={{ color: 'var(--status-red-text)' }}> · {riga.ultimo_esito}{riga.dettaglio_errore ? `: ${riga.dettaglio_errore}` : ''}</span>
                      : ' · mai tentato'}
                    {riga.tentativi_falliti > 1 && (
                      <span style={{ color: 'var(--status-red-text)' }}> · {riga.tentativi_falliti} tentativi falliti di fila</span>
                    )}
                  </p>
                </div>
                <button onClick={() => inviaOra(riga)} disabled={inviandoId === riga.soggiorno_id}
                        className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60 shrink-0"
                        style={{ background: 'var(--hotel-navy)' }}>
                  <Send size={13} />
                  {inviandoId === riga.soggiorno_id ? 'Invio...' : 'Invia ora'}
                </button>
              </div>
            ))}
          </div>
        )}

        {coda.inviatiRecenti.length > 0 && (
          <details>
            <summary className="text-xs cursor-pointer select-none" style={{ color: 'var(--muted-foreground)' }}>
              Inviati di recente ({coda.inviatiRecenti.length})
            </summary>
            <div className="rounded-lg overflow-hidden mt-2" style={{ border: '0.5px solid var(--border)' }}>
              {coda.inviatiRecenti.map((riga, idx, arr) => (
                <div key={riga.soggiorno_id}
                     className="flex items-center justify-between px-3 py-2 text-xs"
                     style={{
                       background: idx % 2 === 0 ? 'var(--card)' : 'var(--background)',
                       borderBottom: idx === arr.length - 1 ? 'none' : '0.5px solid var(--border)',
                     }}>
                  <span>{riga.cognome} {riga.nome} — Camera {riga.camera_numero}</span>
                  <span style={{ color: 'var(--muted-foreground)' }}>
                    {new Date(riga.ultimo_tentativo_at).toLocaleString('it-IT')}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <div className="mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Ricevute</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            Scaricate automaticamente dal giro notturno il giorno dopo l&apos;invio (WS_ALLOGGIATI non permette di
            scaricare la ricevuta dello stesso giorno). Conservazione obbligatoria 5 anni.
          </p>
        </div>

        {caricamentoRicevute ? (
          <p className="text-center py-6 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : ricevute.length === 0 ? (
          <p className="text-center py-6 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Nessuna ricevuta ancora scaricata.
          </p>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ border: '0.5px solid var(--border)' }}>
            {ricevute.map((r, idx, arr) => (
              <div key={r.data}
                   className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                   style={{
                     background: idx % 2 === 0 ? 'var(--card)' : 'var(--background)',
                     borderBottom: idx === arr.length - 1 ? 'none' : '0.5px solid var(--border)',
                   }}>
                <span>{new Date(r.data).toLocaleDateString('it-IT')}</span>
                <button onClick={() => apriRicevuta(r.data)}
                        className="text-xs font-medium underline shrink-0" style={{ color: 'var(--hotel-navy)' }}>
                  Scarica PDF
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          <input type="date" id="ricevuta-data-manuale"
                 className="flex-1 px-3 py-2 rounded-lg text-sm"
                 style={{ border: '0.5px solid var(--border)', background: 'var(--background)' }} />
          <button onClick={() => {
                    const valore = document.getElementById('ricevuta-data-manuale').value;
                    if (valore) scaricaOraRicevuta(valore);
                  }}
                  disabled={!!scaricandoData}
                  className="text-xs font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60 shrink-0"
                  style={{ background: 'var(--hotel-navy)' }}>
            {scaricandoData ? 'Scarico...' : 'Scarica ora'}
          </button>
        </div>
      </div>

      <Link href="/impostazioni/alloggiati"
            className="flex items-center gap-2 text-xs font-medium"
            style={{ color: 'var(--muted-foreground)' }}>
        <Settings size={13} />
        Credenziali, verifica e tabelle di codifica — Impostazioni ▸ Alloggiati Web
      </Link>
    </AppShell>
  );
}
