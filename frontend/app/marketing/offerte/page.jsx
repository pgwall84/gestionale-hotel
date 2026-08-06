'use client';

// Pagina Marketing ▸ Offerte — Modulo 5.3, estensione (04/08/2026, richiesta
// esplicita del titolare). Compone e invia un'offerta dedicata via email a:
// clienti scelti a mano, oppure a tutti i clienti con consenso marketing.
// GDPR: il backend (backend/lib/offerteEmail.js) filtra SEMPRE su
// consenso_marketing = true, anche in selezione manuale — un cliente senza
// consenso viene escluso e segnalato, mai inviato comunque. Riservata ad
// admin/titolare (shared/ruoli.js sezione 'offerte_email').

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import DataTable from '@/components/ui/DataTable';
import { Search, X, Send } from 'lucide-react';

const RUOLI_PAGINA = ['admin', 'titolare'];

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

export default function PaginaOfferte() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const [oggetto, setOggetto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [modalitaTutti, setModalitaTutti] = useState(false);
  const [ricerca, setRicerca] = useState('');
  const [risultatiRicerca, setRisultatiRicerca] = useState([]);
  const [selezionati, setSelezionati] = useState([]); // [{id, nome, cognome, consenso_marketing}]
  const [invio, setInvio] = useState(false);
  const [esitoInvio, setEsitoInvio] = useState(null);
  const [errore, setErrore] = useState('');

  const [storico, setStorico] = useState([]);
  const [caricamentoStorico, setCaricamentoStorico] = useState(true);
  const [offertaAperta, setOffertaAperta] = useState(null);

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_PAGINA.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const caricaStorico = useCallback(async () => {
    setCaricamentoStorico(true);
    try {
      const res = await api.get('/offerte-email');
      setStorico(res.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento dello storico.');
    } finally {
      setCaricamentoStorico(false);
    }
  }, []);

  useEffect(() => {
    if (utente && RUOLI_PAGINA.includes(utente.ruolo)) caricaStorico();
  }, [utente, caricaStorico]);

  // Ricerca clienti (debounce leggero) — stesso pattern di /clienti.
  useEffect(() => {
    if (modalitaTutti || !ricerca.trim()) { setRisultatiRicerca([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/ospiti?search=${encodeURIComponent(ricerca)}`);
        setRisultatiRicerca(res.data);
      } catch {
        setRisultatiRicerca([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [ricerca, modalitaTutti]);

  function aggiungiSelezionato(cliente) {
    if (selezionati.some(s => s.id === cliente.id)) return;
    setSelezionati(s => [...s, cliente]);
    setRicerca('');
    setRisultatiRicerca([]);
  }

  function rimuoviSelezionato(id) {
    setSelezionati(s => s.filter(c => c.id !== id));
  }

  async function invia() {
    if (!oggetto || !corpo) {
      setErrore('Oggetto e corpo sono obbligatori.');
      return;
    }
    if (!modalitaTutti && selezionati.length === 0) {
      setErrore('Seleziona almeno un cliente, oppure scegli "Tutti i clienti con consenso".');
      return;
    }
    setInvio(true);
    setErrore('');
    setEsitoInvio(null);
    try {
      const res = await api.post('/offerte-email', {
        oggetto,
        corpo,
        destinatari: modalitaTutti ? 'tutti' : selezionati.map(s => s.id),
      });
      setEsitoInvio(res.data);
      if (res.data.ok) {
        setOggetto('');
        setCorpo('');
        setSelezionati([]);
        caricaStorico();
      }
    } catch (err) {
      setErrore(err.message || "Errore nell'invio.");
    } finally {
      setInvio(false);
    }
  }

  if (loading || !utente) return null;

  const colonneStorico = [
    { header: 'Data', accessor: o => new Date(o.inviato_at).toLocaleString('it-IT') },
    { header: 'Oggetto', accessor: o => o.oggetto },
    { header: 'Destinatari', accessor: o => o.totale_destinatari },
    { header: 'Inviate', accessor: o => o.totale_ok },
    { header: 'Fallite', accessor: o => o.totale_falliti },
    { header: 'Da', accessor: o => o.inviato_da_nome ? `${o.inviato_da_nome} ${o.inviato_da_cognome}` : '—' },
  ];

  return (
    <AppShell titolo="Offerte">
      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}

      <div className="rounded-xl p-4 mb-4 space-y-3" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Nuova offerta</h3>

        <input placeholder="Oggetto" value={oggetto} onChange={e => setOggetto(e.target.value)}
               className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />
        <textarea placeholder="Corpo — puoi usare {nome_ospite} per personalizzare il saluto" value={corpo}
                  onChange={e => setCorpo(e.target.value)} rows={6}
                  className="w-full p-3 rounded-lg text-sm outline-none resize-y" style={{ ...inputStyle, height: 'auto' }} />

        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>Destinatari</p>
          <div className="flex gap-2 mb-2">
            <button onClick={() => setModalitaTutti(false)}
                    className="flex-1 rounded-lg py-2 text-xs font-medium border"
                    style={!modalitaTutti ? { background: 'var(--hotel-navy)', color: '#fff', borderColor: 'var(--hotel-navy)' } : {}}>
              Clienti specifici
            </button>
            <button onClick={() => setModalitaTutti(true)}
                    className="flex-1 rounded-lg py-2 text-xs font-medium border"
                    style={modalitaTutti ? { background: 'var(--hotel-navy)', color: '#fff', borderColor: 'var(--hotel-navy)' } : {}}>
              Tutti i clienti con consenso
            </button>
          </div>

          {modalitaTutti ? (
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Verrà inviata a tutti i clienti in anagrafica con consenso marketing attivo ed email valida.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
                <input placeholder="Cerca cliente per nome o cognome..." value={ricerca}
                       onChange={e => setRicerca(e.target.value)}
                       className="w-full pl-8 pr-3 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              {risultatiRicerca.length > 0 && (
                <div className="rounded-lg border max-h-48 overflow-y-auto">
                  {risultatiRicerca.map(c => (
                    <button
                      key={c.id}
                      onClick={() => c.consenso_marketing && aggiungiSelezionato(c)}
                      disabled={!c.consenso_marketing}
                      className="w-full text-left px-3 py-2 text-xs flex items-center justify-between border-b last:border-b-0 disabled:opacity-50"
                    >
                      <span>{c.cognome} {c.nome} {c.email ? `— ${c.email}` : ''}</span>
                      {!c.consenso_marketing && <span style={{ color: 'var(--status-red-text)' }}>nessun consenso</span>}
                    </button>
                  ))}
                </div>
              )}
              {selezionati.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selezionati.map(c => (
                    <span key={c.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                          style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
                      {c.cognome} {c.nome}
                      <button onClick={() => rimuoviSelezionato(c.id)}><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button onClick={invia} disabled={invio}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60"
                style={{ background: 'var(--hotel-amber)' }}>
          <Send size={13} /> {invio ? 'Invio in corso...' : 'Invia offerta'}
        </button>

        {esitoInvio && (
          <p className="text-xs rounded-md px-3 py-2"
             style={{
               background: esitoInvio.ok ? 'var(--status-green-bg)' : 'var(--status-red-bg)',
               color: esitoInvio.ok ? 'var(--status-green-text)' : 'var(--status-red-text)',
             }}>
            {esitoInvio.ok
              ? `Inviata a ${esitoInvio.totaleOk}/${esitoInvio.totaleDestinatari} destinatari${esitoInvio.totaleFalliti ? ` (${esitoInvio.totaleFalliti} fallite)` : ''}${esitoInvio.esclusi ? ` — ${esitoInvio.esclusi} esclusi per mancanza di consenso/email` : ''}.`
              : `Non inviata: ${esitoInvio.motivo}`}
          </p>
        )}
      </div>

      <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Storico offerte inviate</h3>
        {caricamentoStorico ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : (
          <DataTable colonne={colonneStorico} dati={storico}
                     onRowClick={o => setOffertaAperta(o.id)}
                     emptyText="Nessuna offerta inviata finora." />
        )}
      </div>

      {offertaAperta && (
        <DettaglioOfferta id={offertaAperta} onChiudi={() => setOffertaAperta(null)} />
      )}
    </AppShell>
  );
}

// ── Dettaglio offerta (destinatari + esito individuale) ─────────────────────
function DettaglioOfferta({ id, onChiudi }) {
  const [dati, setDati] = useState(null);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    let attivo = true;
    api.get(`/offerte-email/${id}`).then(res => { if (attivo) setDati(res.data); }).finally(() => { if (attivo) setCaricamento(false); });
    return () => { attivo = false; };
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onChiudi}>
      <div className="h-full w-full max-w-md bg-white shadow-xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white z-10">
          <p className="font-semibold text-sm">Dettaglio offerta</p>
          <button onClick={onChiudi} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-4">
          {caricamento || !dati ? (
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">{dati.oggetto}</p>
                <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: 'var(--muted-foreground)' }}>{dati.corpo}</p>
              </div>
              <div className="space-y-1">
                {dati.destinatari.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg"
                       style={{ background: 'var(--background)' }}>
                    <span>{d.cognome ? `${d.cognome} ${d.nome}` : d.email} — {d.email}</span>
                    <span style={{ color: d.ok ? 'var(--status-green-text)' : 'var(--status-red-text)' }}>
                      {d.ok ? 'inviata' : (d.errore || 'errore')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
