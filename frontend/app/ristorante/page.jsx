'use client';

// Pagina Ristorante — gestione comande attive.
// Cameriere: seleziona tavolo → aggiunge piatti → invia in cucina.
// Cuoco: aggiorna stati da monitor cucina (/cucina).
// Titolare: vede tutto, può segnare omaggi/autoconsumo.

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, X, ChevronDown, CheckCircle, Minus } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const STATI_RIGA = {
  in_attesa:       { label: 'In attesa',     color: 'var(--muted-foreground)' },
  in_preparazione: { label: 'In prep.',      color: 'var(--status-amber-text)' },
  pronto:          { label: 'Pronto ✓',      color: 'var(--status-green-text)' },
  servito:         { label: 'Servito',        color: 'var(--status-blue-text)' },
};

function BadgeRiga({ stato }) {
  const s = STATI_RIGA[stato] || STATI_RIGA.in_attesa;
  return <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>;
}

function RistoranteInner() {
  const { utente } = useAuth();
  const searchParams = useSearchParams();
  const comandaIdParam = searchParams.get('comanda');
  const tavoloIdParam  = searchParams.get('tavolo');

  const [comande, setComande] = useState([]);
  const [comandaSelezionata, setComandarSelezionata] = useState(null);
  const [righe, setRighe] = useState([]);
  const [categorie, setCategorie] = useState([]);
  const [piatti, setPiatti] = useState([]);
  const [categoriaAperta, setCategoriaAperta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingRighe, setLoadingRighe] = useState(false);
  const [errore, setErrore] = useState(null);
  const [aggiungendo, setAggiungendo] = useState(null);
  const [chiudendo, setChiudendo] = useState(false);
  const [conto, setConto] = useState(null);
  const [mostraConto, setMostraConto] = useState(false);

  const isAdmin   = utente && ['admin', 'titolare'].includes(utente.ruolo);
  const isCamerier = utente && ['admin', 'titolare', 'cameriere'].includes(utente.ruolo);

  const caricaComande = useCallback(async () => {
    try {
      setLoading(true);
      setErrore(null);
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

  // Se arriviamo da /sala con comanda_id nel query param, apriamo subito quella
  useEffect(() => {
    if (comandaIdParam) {
      caricaDettaglio(comandaIdParam);
    }
  }, [comandaIdParam, caricaDettaglio]);

  // Polling delle righe ogni 15s quando c'è una comanda aperta
  useEffect(() => {
    if (!comandaSelezionata) return;
    const t = setInterval(() => caricaDettaglio(comandaSelezionata.id), 15000);
    return () => clearInterval(t);
  }, [comandaSelezionata, caricaDettaglio]);

  const aggiungiPiatto = async (piatto) => {
    if (!comandaSelezionata || aggiungendo) return;
    setAggiungendo(piatto.id);
    try {
      await api.post(`/ristorante/comande/${comandaSelezionata.id}/righe`, {
        piatto_id: piatto.id,
        quantita: 1,
      });
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
      await caricaComande();
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
          {/* Header comanda */}
          <div className="flex justify-between items-center">
            <div>
              <button onClick={() => { setComandarSelezionata(null); setRighe([]); }}
                      className="text-sm" style={{ color: 'var(--primary)' }}>
                ← Torna alla lista
              </button>
              <h2 className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>
                Tavolo {comandaSelezionata.tavolo_numero}
              </h2>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Aperta alle {new Date(comandaSelezionata.timestamp_apertura).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                {comandaSelezionata.cameriere_nome && ` · ${comandaSelezionata.cameriere_nome}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={mostraContoComanda}
                      className="px-3 py-1.5 rounded-lg text-sm"
                      style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                Conto
              </button>
            </div>
          </div>

          {/* Righe comanda */}
          {loadingRighe ? (
            <p className="text-sm text-center" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
          ) : righe.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--muted-foreground)' }}>
              Nessun piatto aggiunto ancora.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {righe.map(r => (
                <div key={r.id} className="flex items-center justify-between rounded-xl px-3 py-2"
                     style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                      {r.quantita}× {r.piatto_nome}
                    </p>
                    <div className="flex items-center gap-2">
                      <BadgeRiga stato={r.stato} />
                      {r.tipo_speciale && (
                        <span className="text-xs" style={{ color: 'var(--status-red-text)' }}>
                          [{r.tipo_speciale}]
                        </span>
                      )}
                      {r.note && <span className="text-xs italic" style={{ color: 'var(--muted-foreground)' }}>{r.note}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {prossimoStato(r.stato) && (
                      <button onClick={() => aggiornaStatoRiga(r.id, prossimoStato(r.stato))}
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

          {/* Aggiungi piatti — menu a fisarmonica */}
          {isCamerier && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Aggiungi piatti</p>
              {categorie.map(cat => (
                <div key={cat.id} className="rounded-xl overflow-hidden"
                     style={{ border: '1px solid var(--border)' }}>
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
                        <button key={p.id}
                                onClick={() => aggiungiPiatto(p)}
                                disabled={aggiungendo === p.id}
                                className="flex justify-between items-center px-3 py-2 text-sm text-left w-full"
                                style={{ color: 'var(--foreground)', opacity: aggiungendo === p.id ? 0.5 : 1 }}>
                          <span>{p.nome}</span>
                          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }}>
                            {p.prezzo ? `€${parseFloat(p.prezzo).toFixed(2)}` : ''}
                            <Plus size={14} />
                          </span>
                        </button>
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
                <div className="pt-2 border-t flex justify-between font-bold" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                  <span>Totale</span>
                  <span>€{conto.totale.toFixed(2)}</span>
                </div>
                {conto.ospite_hotel && (
                  <p className="text-sm text-center" style={{ color: 'var(--status-blue-text)' }}>
                    Ospite hotel — conto incluso nella camera
                  </p>
                )}
                <button onClick={chiudiComanda}
                        disabled={chiudendo}
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
        <div className="flex justify-between items-center">
          <h1 className="font-bold text-xl" style={{ color: 'var(--foreground)' }}>Comande</h1>
          <a href="/sala" className="text-sm px-3 py-1.5 rounded-lg"
             style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
            Mappa sala
          </a>
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
              <button key={c.id}
                      onClick={() => caricaDettaglio(c.id)}
                      className="rounded-xl px-4 py-3 text-left flex justify-between items-center"
                      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--foreground)' }}>
                    Tavolo {c.tavolo_numero}
                  </p>
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
