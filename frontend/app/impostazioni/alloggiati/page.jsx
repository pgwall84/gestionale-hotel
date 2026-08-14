'use client';

// Pagina Impostazioni ▸ Alloggiati Web — Modulo 2.5.
// Fase 1b: sincronizza le tabelle di codifica (Luoghi, Tipi_Documento,
// Tipi_Alloggiato) da WS_ALLOGGIATI — sola lettura, nessun dato ospite
// viene mai inviato qui.
// Fase 2 (11/08/2026): pulsante "Verifica credenziali" (GenerateToken +
// Authentication_Test) — zero rischio, nessun dato ospite coinvolto, serve
// solo a confermare che utente/password/WSKEY funzionano contro il
// servizio reale prima di generare/testare una schedina vera.
// Fase 2 (13/08/2026): pulsante "Verifica schedina" — genera le righe dal
// soggiorno indicato e le fa validare dal metodo Test (SICURO, nessuna
// acquisizione, manuale pag. 9). Serve l'id di un soggiorno esistente: per
// una prova senza usare un ospite reale, node
// backend/scripts/creaPrenotazioneTestAlloggiati.js ne crea uno fittizio e
// stampa l'id da incollare qui.
// Split 14/08/2026: "Coda invii" e "Ricevute" — operatività quotidiana —
// si sono spostate su una pagina dedicata, /alloggiati-web (gruppo
// ADEMPIMENTI del menu). Questa pagina resta solo configurazione:
// credenziali, sincronizzazione tabelle di codifica, verifica schedina di
// test — cose che si fanno una volta ogni tanto, non ogni giorno. Stessa
// logica già usata altrove nel gestionale per separare configurazione da
// operatività (es. Tassa di soggiorno: aliquote qui, riscossione altrove).
// Richiede ALLOGGIATI_UTENTE/PASSWORD/WSKEY in backend/.env — se mancanti,
// tutti i pulsanti restituiscono un errore chiaro invece di un 500 generico.
// Riservata ad admin/titolare (shared/ruoli.js sezione 'alloggiati', azioni
// 'sincronizza'/'invio') — stesso criterio di 'tassa_soggiorno'.configurazione:
// tocca credenziali/configurazione, non è operatività quotidiana.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, ShieldCheck, ClipboardCheck, Send } from 'lucide-react';
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

  // Fase 2 — verifica credenziali (Authentication_Test), indipendente dallo
  // stato di sincronizzazione sopra: non tocca alloggiati_codici.
  const [verificando, setVerificando] = useState(false);
  const [esitoVerifica, setEsitoVerifica] = useState(null); // { ok, verificato_il } | { errore }

  // Fase 2 — verifica schedina (Test) su un soggiorno a scelta, mai un invio
  // reale: richiede solo l'id del soggiorno, digitato o incollato da chi usa
  // la pagina (nessuna lista soggiorni qui, per restare una pagina di sola
  // configurazione — la selezione vera avverrà da un punto operativo quando
  // il flusso sarà collegato al planning).
  const [soggiornoIdTest, setSoggiornoIdTest] = useState('');
  const [testando, setTestando] = useState(false);
  const [esitoTest, setEsitoTest] = useState(null); // { ok, ... } | { errore }

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

  async function verificaCredenziali() {
    setVerificando(true);
    setEsitoVerifica(null);
    try {
      const res = await api.post('/alloggiati/verifica-credenziali');
      setEsitoVerifica({ ok: true, verificato_il: res.data.verificato_il });
    } catch (err) {
      setEsitoVerifica({ ok: false, errore: err.message || 'Verifica fallita.' });
    } finally {
      setVerificando(false);
    }
  }

  async function verificaSchedina() {
    if (!soggiornoIdTest) return;
    setTestando(true);
    setEsitoTest(null);
    try {
      const res = await api.post(`/alloggiati/soggiorni/${soggiornoIdTest}/test`);
      setEsitoTest({ ok: true, ...res.data });
    } catch (err) {
      setEsitoTest({ ok: false, errore: err.message || 'Verifica schedina fallita.' });
    } finally {
      setTestando(false);
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

      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Verifica credenziali</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              Controlla che utente/password/WSKEY funzionino contro WS_ALLOGGIATI. Nessun dato ospite coinvolto — solo autenticazione.
            </p>
          </div>
          <button onClick={verificaCredenziali} disabled={verificando}
                  className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60 shrink-0"
                  style={{ background: 'var(--hotel-navy)' }}>
            <ShieldCheck size={13} />
            {verificando ? 'Verifica...' : 'Verifica credenziali'}
          </button>
        </div>
        {esitoVerifica && (
          <div className="px-3 py-2.5 rounded-lg text-[13px]"
               style={esitoVerifica.ok
                 ? { background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }
                 : { background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
            {esitoVerifica.ok
              ? `Credenziali valide — verificato il ${new Date(esitoVerifica.verificato_il).toLocaleString('it-IT')}`
              : esitoVerifica.errore}
          </div>
        )}
      </div>

      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <div className="mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Verifica schedina (Test)</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            Genera la schedina di un soggiorno e la fa controllare da WS_ALLOGGIATI col metodo Test — SICURO,
            nessuna schedina viene mai acquisita, solo controllo di formato. Diverso dall'invio reale (Send),
            che qui non è collegato a nessun pulsante.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="number" min="1" placeholder="ID soggiorno" value={soggiornoIdTest}
                 onChange={(e) => setSoggiornoIdTest(e.target.value)}
                 className="flex-1 px-3 py-2 rounded-lg text-sm"
                 style={{ background: 'var(--background)', border: '0.5px solid var(--border)', color: 'var(--foreground)' }} />
          <button onClick={verificaSchedina} disabled={testando || !soggiornoIdTest}
                  className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60 shrink-0"
                  style={{ background: 'var(--hotel-navy)' }}>
            <ClipboardCheck size={13} />
            {testando ? 'Verifica...' : 'Verifica schedina'}
          </button>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
          Non hai un soggiorno a portata di mano? <code>node backend/scripts/creaPrenotazioneTestAlloggiati.js</code>{' '}
          ne crea uno fittizio (date 2099, non tocca il planning reale) e stampa l&apos;ID da incollare qui.
        </p>

        {esitoTest && (
          <div className="mt-3 space-y-2">
            {esitoTest.ok ? (
              <>
                {esitoTest.avvisi?.length > 0 && (
                  <div className="px-3 py-2.5 rounded-lg text-[13px]"
                       style={{ background: 'var(--status-amber-bg)', color: 'var(--status-amber-text)' }}>
                    <p className="font-medium mb-1">Ospiti esclusi (dati mancanti):</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {esitoTest.avvisi.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
                {esitoTest.testato ? (
                  <div className="px-3 py-2.5 rounded-lg text-[13px]"
                       style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
                    Formato verificato — {esitoTest.esito?.schedineValide ?? 0}/{esitoTest.righeInviate} schedine valide
                    su {esitoTest.totaleOspiti} ospiti nel soggiorno.
                  </div>
                ) : (
                  <div className="px-3 py-2.5 rounded-lg text-[13px]"
                       style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
                    {esitoTest.motivo || 'Nessuna riga generabile — completa i dati indicati sopra.'}
                  </div>
                )}
                {esitoTest.esito?.dettaglio?.some(d => !d.esito) && (
                  <div className="px-3 py-2.5 rounded-lg text-[13px]"
                       style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
                    <p className="font-medium mb-1">Righe respinte dal servizio:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {esitoTest.esito.dettaglio.filter(d => !d.esito).map((d, i) => (
                        <li key={i}>{d.erroreDes || d.erroreCod || 'errore non specificato'}{d.erroreDettaglio ? ` — ${d.erroreDettaglio}` : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="px-3 py-2.5 rounded-lg text-[13px]"
                   style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
                {esitoTest.errore}
              </div>
            )}
          </div>
        )}
      </div>

      <Link href="/alloggiati-web"
            className="flex items-center gap-2 text-xs font-medium mb-4"
            style={{ color: 'var(--hotel-navy)' }}>
        <Send size={13} />
        Coda invii e ricevute — pagina operativa Alloggiati Web
      </Link>

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
