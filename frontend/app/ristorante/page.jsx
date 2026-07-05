'use client';

// Pagina Ristorante — gestione comande attive.
// Cameriere: seleziona tavolo → aggiunge piatti → invia in cucina.
// Fix 3: "← Sala" torna direttamente a /sala (1 tap invece di 2).
// Fix 4: SSE /sala/stream sostituisce polling; notifiche "piatto pronto" con banner + suono.

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus, X, ChevronDown, CheckCircle } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import Cookies from 'js-cookie';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';

const STATI_RIGA = {
  in_attesa:       { label: 'In attesa',  color: 'var(--muted-foreground)' },
  in_preparazione: { label: 'In prep.',   color: 'var(--status-amber-text)' },
  pronto:          { label: 'Pronto ✓',   color: 'var(--status-green-text)' },
  servito:         { label: 'Servito',     color: 'var(--status-blue-text)' },
};

function BadgeRiga({ stato }) {
  const s = STATI_RIGA[stato] || STATI_RIGA.in_attesa;
  return <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>;
}

// ── Suono notifica (AudioContext nativo) ──────────────────────────────────────

function suonaBip(audioCtxRef) {
  try {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) {}
}

function RistoranteInner() {
  const { utente } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const comandaIdParam = searchParams.get('comanda');

  const [comande, setComande]                   = useState([]);
  const [comandaSelezionata, setComandarSelezionata] = useState(null);
  const [righe, setRighe]                       = useState([]);
  const [categorie, setCategorie]               = useState([]);
  const [piatti, setPiatti]                     = useState([]);
  const [notePerPiatto, setNotePerPiatto]       = useState({});
  const [categoriaAperta, setCategoriaAperta]   = useState(null);
  const [loading, setLoading]                   = useState(true);
  const [loadingRighe, setLoadingRighe]         = useState(false);
  const [errore, setErrore]                     = useState(null);
  const [aggiungendo, setAggiungendo]           = useState(null);
  const [chiudendo, setChiudendo]               = useState(false);
  const [conto, setConto]                       = useState(null);
  const [mostraConto, setMostraConto]           = useState(false);

  // Fix 4: notifiche
  const [notifica, setNotifica]   = useState(null);
  const notificaTimerRef          = useRef(null);
  const esRef                     = useRef(null);
  const audioCtxRef               = useRef(null);

  const isAdmin    = utente && ['admin', 'titolare'].includes(utente.ruolo);
  const isCamerier = utente && ['admin', 'titolare', 'cameriere'].includes(utente.ruolo);

  // ── Dati ───────────────────────────────────────────────────────────────────

  const caricaComande = useCallback(async () => {
    try {
      setLoading(true); setErrore(null);
      const r = await api.get('/ristorante/comande');
      setComande(r.data.comande || []);
    } catch (err) {
      setErrore(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const caricaDettaglio = useCallback(async (comandaId) => {
    try {
      setLoadingRighe(true);
      const r = await api.get(`/ristorante/comande/${comandaId}`);
      setComandarSelezionata(r.data.comanda);
      setRighe(r.data.righe || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingRighe(false);
    }
  }, []);

  useEffect(() => {
    caricaComande();
    api.get('/menu/categorie').then(r => setCategorie(r.data.categorie || [])).catch(() => {});
    api.get('/menu/piatti').then(r => setPiatti(r.data.piatti || [])).catch(() => {});
  }, [caricaComande]);

  // Apri direttamente la comanda se arrivati da /sala?comanda=X
  useEffect(() => {
    if (comandaIdParam) caricaDettaglio(comandaIdParam);
  }, [comandaIdParam, caricaDettaglio]);

  // ── Notifica banner ─────────────────────────────────────────────────────────

  const mostraNotifica = useCallback((testo) => {
    if (notificaTimerRef.current) clearTimeout(notificaTimerRef.current);
    setNotifica(testo);
    document.title = `🔔 ${testo}`;
    notificaTimerRef.current = setTimeout(() => {
      setNotifica(null);
      document.title = 'Gestionale Hotel';
    }, 5000);
    suonaBip(audioCtxRef);
  }, []);

  // ── SSE /sala/stream — sostituisce polling righe ────────────────────────────

  const connetti = useCallback(() => {
    const token = Cookies.get('token');
    if (!token) return;
    if (esRef.current) esRef.current.close();

    const url = `${BASE_URL}/ristorante/sala/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const dati = JSON.parse(e.data);
        if (dati.evento === 'riga_pronta') {
          mostraNotifica(`Tavolo ${dati.riga.tavolo_numero} — ${dati.riga.piatto_nome} PRONTO`);
          // Ricarica le righe solo se il piatto appartiene alla comanda visualizzata
          if (comandaSelezionata && dati.riga.comanda_id === comandaSelezionata.id) {
            caricaDettaglio(comandaSelezionata.id);
          }
        } else if (dati.evento === 'comanda_chiusa') {
          // Se il cameriere sta visualizzando la comanda appena chiusa → torna alla sala
          if (comandaSelezionata && parseInt(dati.comanda_id) === parseInt(comandaSelezionata.id)) {
            setComandarSelezionata(null);
            setRighe([]);
            router.push('/sala');
          } else {
            caricaComande();
          }
        }
      } catch (_) {}
    };

    es.onerror = () => {
      es.close();
      setTimeout(connetti, 5000);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostraNotifica, caricaDettaglio, caricaComande]);

  useEffect(() => {
    connetti();
    return () => { esRef.current?.close(); };
  }, [connetti]);

  // ── Sblocco AudioContext al primo tap (richiesto da iOS/Android) ────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.suspend();
      audioCtxRef.current = ctx;
    } catch (_) {}

    const sblocca = () => {
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    };
    document.addEventListener('touchstart', sblocca, { once: true });
    document.addEventListener('click', sblocca, { once: true });

    return () => {
      document.removeEventListener('touchstart', sblocca);
      document.removeEventListener('click', sblocca);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => () => {
    if (notificaTimerRef.current) clearTimeout(notificaTimerRef.current);
  }, []);

  // ── Azioni comanda ──────────────────────────────────────────────────────────

  const aggiungiPiatto = async (piatto) => {
    if (!comandaSelezionata || aggiungendo) return;
    setAggiungendo(piatto.id);
    const note = notePerPiatto[piatto.id] || '';
    try {
      await api.post(`/ristorante/comande/${comandaSelezionata.id}/righe`, {
        piatto_id: piatto.id,
        quantita: 1,
        ...(note ? { note } : {}),
      });
      setNotePerPiatto(prev => { const n = { ...prev }; delete n[piatto.id]; return n; });
      await caricaDettaglio(comandaSelezionata.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setAggiungendo(null);
    }
  };

  const rimuoviRiga = async (rigaId) => {
    try {
      await api.delete(`/ristorante/comande/righe/${rigaId}`);
      await caricaDettaglio(comandaSelezionata.id);
    } catch (err) {
      alert(err.message || 'Non è possibile rimuovere: piatto già in preparazione.');
    }
  };

  const aggiornaStatoRiga = async (rigaId, stato) => {
    try {
      await api.patch(`/ristorante/comande/righe/${rigaId}/stato`, { stato });
      await caricaDettaglio(comandaSelezionata.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const mostraContoComanda = async () => {
    try {
      const r = await api.get(`/ristorante/conto/${comandaSelezionata.id}`);
      setConto(r.data);
      setMostraConto(true);
    } catch (err) {
      alert(err.message);
    }
  };

  const chiudiComanda = async () => {
    if (!confirm('Chiudere la comanda?')) return;
    setChiudendo(true);
    try {
      await api.patch(`/ristorante/comande/${comandaSelezionata.id}/chiudi`);
      setComandarSelezionata(null);
      setRighe([]);
      setMostraConto(false);
      setConto(null);
      // Fix 3: torna direttamente a /sala
      router.push('/sala');
    } catch (err) {
      alert(err.message);
    } finally {
      setChiudendo(false);
    }
  };

  const prossimoStato = (stato) => {
    const sequenza = { in_attesa: 'in_preparazione', in_preparazione: 'pronto', pronto: 'servito' };
    return sequenza[stato] || null;
  };

  // ── Vista dettaglio comanda ─────────────────────────────────────────────────

  if (comandaSelezionata) {
    const piattiDaMenu = categoriaAperta
      ? piatti.filter(p => p.categoria_id === categoriaAperta && p.disponibile)
      : [];

    return (
      <AppShell>
        <div className="p-4 flex flex-col gap-4 max-w-xl mx-auto">

          {/* Banner notifica */}
          {notifica && (
            <div data-testid="notifica-banner"
                 className="fixed top-4 left-4 right-4 z-50 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg max-w-xl mx-auto"
                 style={{ background: 'var(--status-green-bg)', border: '2px solid var(--status-green-text)' }}>
              <span className="text-lg">🔔</span>
              <span className="text-sm font-bold flex-1" style={{ color: 'var(--status-green-text)' }}>{notifica}</span>
              <button onClick={() => { setNotifica(null); document.title = 'Gestionale Hotel'; }}
                      style={{ color: 'var(--status-green-text)' }}>
                <X size={18} />
              </button>
            </div>
          )}

          {/* Header comanda */}
          <div className="flex justify-between items-center">
            <div>
              {/* Fix 3: torna a /sala direttamente */}
              <button onClick={() => router.push('/sala')}
                      className="text-sm" style={{ color: 'var(--primary)' }}>
                ← Sala
              </button>
              <h2 className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>
                Tavolo {comandaSelezionata.tavolo_numero}
              </h2>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Aperta alle {new Date(comandaSelezionata.timestamp_apertura).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                {comandaSelezionata.cameriere_nome && ` · ${comandaSelezionata.cameriere_nome}`}
              </p>
            </div>
            <button onClick={mostraContoComanda}
                    className="px-3 py-1.5 rounded-lg text-sm"
                    style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
              Conto
            </button>
          </div>

          {/* Righe comanda */}
          {loadingRighe ? (
            <p className="text-sm text-center" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
          ) : righe.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--muted-foreground)' }}>Nessun piatto aggiunto ancora.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {righe.map(r => (
                <div key={r.id}
                     data-testid="riga-comanda"
                     data-riga-id={r.id}
                     data-stato={r.stato}
                     className="flex items-center justify-between rounded-xl px-3 py-2"
                     style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                      {r.quantita}× {r.piatto_nome}
                    </p>
                    <div className="flex items-center gap-2">
                      <BadgeRiga stato={r.stato} />
                      {r.tipo_speciale && <span className="text-xs" style={{ color: 'var(--status-red-text)' }}>[{r.tipo_speciale}]</span>}
                      {r.note && <span className="text-xs italic" style={{ color: 'var(--muted-foreground)' }}>{r.note}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {prossimoStato(r.stato) && (
                      <button onClick={() => aggiornaStatoRiga(r.id, prossimoStato(r.stato))}
                              data-testid="btn-avanza-stato"
                              data-stato-corrente={r.stato}
                              data-stato-prossimo={prossimoStato(r.stato)}
                              className="text-xs px-2 py-1 rounded"
                              style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
                        <CheckCircle size={14} />
                      </button>
                    )}
                    {r.stato === 'in_attesa' && isCamerier && (
                      <button onClick={() => rimuoviRiga(r.id)}
                              className="text-xs px-2 py-1 rounded"
                              style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Aggiungi piatti */}
          {isCamerier && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Aggiungi piatti</p>
              {categorie.map(cat => (
                <div key={cat.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <button onClick={() => setCategoriaAperta(categoriaAperta === cat.id ? null : cat.id)}
                          className="w-full flex justify-between items-center px-3 py-2 text-sm font-medium"
                          style={{ background: 'var(--card)', color: 'var(--foreground)' }}>
                    {cat.nome}
                    <ChevronDown size={16} className={`transition-transform ${categoriaAperta === cat.id ? 'rotate-180' : ''}`} />
                  </button>
                  {categoriaAperta === cat.id && (
                    <div className="flex flex-col divide-y" style={{ borderTop: '1px solid var(--border)', background: 'var(--muted)' }}>
                      {piattiDaMenu.length === 0 ? (
                        <p className="px-3 py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>Nessun piatto disponibile.</p>
                      ) : piattiDaMenu.map(p => (
                        <div key={p.id} className="flex flex-col" style={{ borderBottom: '1px solid var(--border)' }}>
                          <button onClick={() => aggiungiPiatto(p)} disabled={aggiungendo === p.id}
                                  className="flex justify-between items-center px-3 py-2 text-sm text-left w-full"
                                  style={{ color: 'var(--foreground)', opacity: aggiungendo === p.id ? 0.5 : 1 }}>
                            <span>{p.nome}</span>
                            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }}>
                              {p.prezzo ? `€${parseFloat(p.prezzo).toFixed(2)}` : ''}
                              <Plus size={14} />
                            </span>
                          </button>
                          <input
                            type="text"
                            placeholder="Note (es. al dente, senza cipolla...)"
                            value={notePerPiatto[p.id] || ''}
                            onChange={e => setNotePerPiatto(prev => ({ ...prev, [p.id]: e.target.value }))}
                            className="px-3 w-full outline-none"
                            style={{
                              background: 'var(--muted)',
                              color: 'var(--foreground)',
                              borderTop: '1px solid var(--border)',
                              minHeight: '44px',
                              fontSize: '16px',
                              lineHeight: '1.25',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Modale conto */}
          {mostraConto && conto && (
            <div className="fixed inset-0 flex items-end justify-center z-50"
                 style={{ background: 'rgba(0,0,0,0.5)' }}
                 onClick={() => setMostraConto(false)}>
              <div className="w-full max-w-xl rounded-t-2xl p-5 flex flex-col gap-3"
                   style={{ background: 'var(--card)' }}
                   onClick={e => e.stopPropagation()}>
                <p className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>
                  Conto — Tavolo {conto.comanda.tavolo_numero}
                </p>
                {conto.righe.map(r => (
                  <div key={r.id} className="flex justify-between text-sm" style={{ color: 'var(--foreground)' }}>
                    <span>{r.quantita}× {r.piatto_nome}
                      {r.tipo_speciale && <span className="text-xs ml-1" style={{ color: 'var(--status-red-text)' }}>({r.tipo_speciale})</span>}
                    </span>
                    <span>€{parseFloat(r.subtotale).toFixed(2)}</span>
                  </div>
                ))}
                <div className="pt-2 border-t flex justify-between font-bold"
                     style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                  <span>Totale</span>
                  <span>€{conto.totale.toFixed(2)}</span>
                </div>
                {conto.ospite_hotel && (
                  <p className="text-sm text-center" style={{ color: 'var(--status-blue-text)' }}>
                    Ospite hotel — conto incluso nella camera
                  </p>
                )}
                <button onClick={chiudiComanda} disabled={chiudendo}
                        className="w-full py-3 rounded-xl font-bold mt-1"
                        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: chiudendo ? 0.6 : 1 }}>
                  {chiudendo ? 'Chiusura...' : 'Chiudi comanda'}
                </button>
                <button onClick={() => setMostraConto(false)}
                        className="w-full py-2 rounded-xl text-sm"
                        style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                  Continua ad aggiungere
                </button>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  // ── Vista lista comande ─────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="p-4 flex flex-col gap-4 max-w-xl mx-auto">

        {/* Banner notifica */}
        {notifica && (
          <div data-testid="notifica-banner"
               className="fixed top-4 left-4 right-4 z-50 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg max-w-xl mx-auto"
               style={{ background: 'var(--status-green-bg)', border: '2px solid var(--status-green-text)' }}>
            <span className="text-lg">🔔</span>
            <span className="text-sm font-bold flex-1" style={{ color: 'var(--status-green-text)' }}>{notifica}</span>
            <button onClick={() => { setNotifica(null); document.title = 'Gestionale Hotel'; }}
                    style={{ color: 'var(--status-green-text)' }}>
              <X size={18} />
            </button>
          </div>
        )}

        <div className="flex justify-between items-center">
          <h1 className="font-bold text-xl" style={{ color: 'var(--foreground)' }}>Comande</h1>
          <button onClick={() => router.push('/sala')}
                  className="text-sm px-3 py-1.5 rounded-lg"
                  style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
            Mappa sala
          </button>
        </div>

        {loading ? (
          <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : errore ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--status-red-text)' }}>{errore}</p>
        ) : comande.length === 0 ? (
          <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Nessuna comanda aperta. Vai alla mappa sala per aprirne una.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {comande.map(c => (
              <button key={c.id} onClick={() => caricaDettaglio(c.id)}
                      className="rounded-xl px-4 py-3 text-left flex justify-between items-center"
                      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--foreground)' }}>Tavolo {c.tavolo_numero}</p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {c.cameriere_nome} · {parseInt(c.totale_righe)} piatti
                    {parseInt(c.righe_in_attesa) > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full font-bold text-xs"
                            style={{ background: 'var(--status-amber-text)', color: '#fff' }}>
                        {c.righe_in_attesa} in attesa
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {new Date(c.timestamp_apertura).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function RistorantePage() {
  return (
    <Suspense>
      <RistoranteInner />
    </Suspense>
  );
}
