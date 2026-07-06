'use client';

// Pagina Ristorante — gestione comande attive.
// Layout 3 zone (topbar / selezione piatti / carrello) ottimizzato per mobile.
// Integra badge allergeni con match fuzzy su note_allergie ospiti del giorno.

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShoppingCart, X, CheckCircle } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import Cookies from 'js-cookie';

// ── Match allergeni ────────────────────────────────────────────────────────────
// Copertura 14 allergeni obbligatori Reg. UE 1169/2011 + varianti testo libero.
const KEYWORD_MAP = {
  'glutine':            ['glutine', 'celiaco', 'celiachia', 'grano', 'frumento', 'senza glutine'],
  'lattosio':           ['lattosio', 'latte', 'latticini', 'formaggio', 'burro', 'panna'],
  'uova':               ['uova', 'uovo'],
  'frutta secca':       ['frutta secca', 'noci', 'arachidi', 'mandorle', 'nocciole', 'pistacchi'],
  'pesce':              ['pesce'],
  'crostacei':          ['crostacei', 'gamberi', 'aragoste', 'granchio'],
  'soia':               ['soia'],
  'sedano':             ['sedano'],
  'senape':             ['senape'],
  'sesamo':             ['sesamo'],
  'lupini':             ['lupini'],
  'molluschi':          ['molluschi', 'cozze', 'vongole', 'calamari'],
  'anidride solforosa': ['solfiti', 'solforosa', 'anidride solforosa'],
};

// Restituisce gli allergeni del piatto che matchano le note allergie ospite.
function hasMatch(allergeniPiatto, noteAllergie) {
  if (!noteAllergie || !allergeniPiatto?.length) return [];
  const noteLC = noteAllergie.toLowerCase();
  return allergeniPiatto.filter(all => {
    const keys = KEYWORD_MAP[all.toLowerCase()] || [all.toLowerCase()];
    return keys.some(k => noteLC.includes(k));
  });
}

// Parole chiave che rendono una nota cameriere "allerta allergia"
const PAROLE_ALLERTA = [
  'celiaco', 'celiachia', 'allergi', 'senza glutine',
  'intolleranza', 'lattosio', 'arachidi', 'frutta secca',
  'soia', 'crostacei', 'molluschi',
];
function notaEAllerta(nota) {
  if (!nota) return false;
  const lc = nota.toLowerCase();
  return PAROLE_ALLERTA.some(p => lc.includes(p));
}

// ── Suono notifica ─────────────────────────────────────────────────────────────
function suonaBip(audioCtxRef) {
  try {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
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

// ── Badge allergene ────────────────────────────────────────────────────────────
function BadgeAllergene({ nome, inMatch }) {
  return (
    <span className="text-xs px-1.5 py-0.5 rounded-full"
          style={inMatch
            ? { background: '#FCEBEB', border: '1px solid #F09595', color: '#A32D2D' }
            : { background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }
          }>
      {nome}
    </span>
  );
}

// ── Stati riga ─────────────────────────────────────────────────────────────────
const STATI_RIGA = {
  in_attesa:       { label: 'In attesa',  color: 'var(--muted-foreground)' },
  in_preparazione: { label: 'In prep.',   color: 'var(--status-amber-text)' },
  pronto:          { label: 'Pronto ✓',   color: 'var(--status-green-text)' },
  servito:         { label: 'Servito',     color: 'var(--status-blue-text)' },
};

function RistoranteInner() {
  const { utente } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const comandaIdParam = searchParams.get('comanda');

  const [comande, setComande]                       = useState([]);
  const [comandaSelezionata, setComandarSelezionata] = useState(null);
  const [righe, setRighe]                           = useState([]);
  const [categorie, setCategorie]                   = useState([]);
  const [piatti, setPiatti]                         = useState([]);
  const [categoriaAttiva, setCategoriaAttiva]       = useState(null);
  const [noteAllergie, setNoteAllergie]             = useState(null);
  const [loading, setLoading]                       = useState(true);
  const [loadingRighe, setLoadingRighe]             = useState(false);
  const [errore, setErrore]                         = useState(null);
  const [chiudendo, setChiudendo]                   = useState(false);
  const [conto, setConto]                           = useState(null);
  const [mostraConto, setMostraConto]               = useState(false);
  const [inviando, setInviando]                     = useState(false);

  // Carrello: { [piatto_id]: { piatto, qty, nota } }
  const [carrello, setCarrello] = useState({});

  const [notifica, setNotifica]  = useState(null);
  const notificaTimerRef         = useRef(null);
  const esRef                    = useRef(null);
  const audioCtxRef              = useRef(null);

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
      const [rComanda, rTavoli] = await Promise.all([
        api.get(`/ristorante/comande/${comandaId}`),
        api.get('/ristorante/tavoli'),
      ]);
      setComandarSelezionata(rComanda.data.comanda);
      setRighe(rComanda.data.righe || []);
      // note_allergie_oggi è uguale per tutti i tavoli — prendo dal primo
      const tav = rTavoli.data.tavoli?.[0];
      setNoteAllergie(tav?.note_allergie_oggi || null);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingRighe(false);
    }
  }, []);

  useEffect(() => {
    caricaComande();
    api.get('/menu/categorie').then(r => {
      const cats = r.data.categorie || [];
      setCategorie(cats);
      if (cats.length > 0) setCategoriaAttiva(cats[0].id);
    }).catch(() => {});
    api.get('/menu/piatti').then(r => setPiatti(r.data.piatti || [])).catch(() => {});
  }, [caricaComande]);

  useEffect(() => {
    if (comandaIdParam) caricaDettaglio(comandaIdParam);
  }, [comandaIdParam, caricaDettaglio]);

  // ── Notifica ────────────────────────────────────────────────────────────────

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

  // ── SSE /sala/stream ────────────────────────────────────────────────────────

  const connetti = useCallback(() => {
    const token = Cookies.get('token');
    if (!token) return;
    if (esRef.current) esRef.current.close();

    // URL calcolato a runtime per funzionare su IP locale e ngrok
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const url = `${protocol}//${hostname}:7001/api/ristorante/sala/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const dati = JSON.parse(e.data);
        if (dati.evento === 'riga_pronta') {
          mostraNotifica(`Tavolo ${dati.riga.tavolo_numero} — ${dati.riga.piatto_nome} PRONTO`);
          if (comandaSelezionata && dati.riga.comanda_id === comandaSelezionata.id) {
            caricaDettaglio(comandaSelezionata.id);
          }
        } else if (dati.evento === 'comanda_chiusa') {
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

    es.onerror = () => { es.close(); setTimeout(connetti, 5000); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostraNotifica, caricaDettaglio, caricaComande]);

  useEffect(() => {
    connetti();
    return () => { esRef.current?.close(); };
  }, [connetti]);

  // ── AudioContext sblocco ────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.suspend();
      audioCtxRef.current = ctx;
    } catch (_) {}
    const sblocca = () => { if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume(); };
    document.addEventListener('touchstart', sblocca, { once: true });
    document.addEventListener('click', sblocca, { once: true });
    return () => {
      document.removeEventListener('touchstart', sblocca);
      document.removeEventListener('click', sblocca);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => () => { if (notificaTimerRef.current) clearTimeout(notificaTimerRef.current); }, []);

  // ── Carrello helpers ────────────────────────────────────────────────────────

  const aggiungiAlCarrello = (piatto) => {
    setCarrello(prev => {
      const item = prev[piatto.id];
      return { ...prev, [piatto.id]: { piatto, qty: (item?.qty || 0) + 1, nota: item?.nota || '' } };
    });
  };

  const cambiaQty = (piattoId, delta) => {
    setCarrello(prev => {
      const item = prev[piattoId];
      if (!item) return prev;
      const nuova = item.qty + delta;
      if (nuova <= 0) { const n = { ...prev }; delete n[piattoId]; return n; }
      return { ...prev, [piattoId]: { ...item, qty: nuova } };
    });
  };

  const cambioNota = (piattoId, nota) => {
    setCarrello(prev => ({ ...prev, [piattoId]: { ...prev[piattoId], nota } }));
  };

  const itemsCarrello = Object.values(carrello);
  const totaleCarrello = itemsCarrello.reduce(
    (s, it) => s + (parseFloat(it.piatto.prezzo) || 0) * it.qty, 0
  );

  // ── Invia alla cucina ───────────────────────────────────────────────────────

  const inviaOrdine = async () => {
    if (!comandaSelezionata || itemsCarrello.length === 0 || inviando) return;
    setInviando(true);
    try {
      await Promise.all(itemsCarrello.map(it =>
        api.post(`/ristorante/comande/${comandaSelezionata.id}/righe`, {
          piatto_id: it.piatto.id,
          quantita:  it.qty,
          ...(it.nota ? { note: it.nota } : {}),
        })
      ));
      setCarrello({});
      await caricaDettaglio(comandaSelezionata.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setInviando(false);
    }
  };

  // ── Azioni riga ────────────────────────────────────────────────────────────

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

  const [mostraChiusura, setMostraChiusura] = useState(false);
  const [menuAperto, setMenuAperto]         = useState(true);
  const [segnandoServito, setSegnandoServito] = useState(false);

  // Il menu parte aperto se la comanda è vuota, collassato se ha già righe.
  // Ricalcolato solo quando cambia la comanda selezionata (non ad ogni refresh righe).
  useEffect(() => {
    if (comandaSelezionata) setMenuAperto(righe.length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comandaSelezionata?.id]);

  const chiudiConTipo = async ({ tipo, motivo, user_id, valore_costo }) => {
    setChiudendo(true);
    try {
      await api.patch(`/ristorante/comande/${comandaSelezionata.id}/chiudi`, { tipo, motivo, user_id, valore_costo });
      setMostraChiusura(false);
      setComandarSelezionata(null);
      setRighe([]);
      setMostraConto(false);
      setConto(null);
      router.push('/sala');
    } catch (err) {
      alert(err.response?.data?.errore || err.message);
    } finally {
      setChiudendo(false);
    }
  };

  const prossimoStato = (stato) => {
    const seq = { in_attesa: 'in_preparazione', in_preparazione: 'pronto', pronto: 'servito' };
    return seq[stato] || null;
  };

  // Segna in batch tutte le righe 'pronto' come 'servito'.
  // Usa allSettled: se una riga fallisce, le altre restano aggiornate.
  const segnaTuttoServito = async () => {
    const righePronte = righe.filter(r => r.stato === 'pronto');
    if (righePronte.length === 0 || segnandoServito) return;
    setSegnandoServito(true);
    try {
      const risultati = await Promise.allSettled(
        righePronte.map(r => api.patch(`/ristorante/comande/righe/${r.id}/stato`, { stato: 'servito' }))
      );
      const falliti = risultati.filter(r => r.status === 'rejected').length;
      await caricaDettaglio(comandaSelezionata.id);
      if (falliti > 0) {
        alert(`${falliti} piatti non aggiornati correttamente. Riprova.`);
      }
    } finally {
      setSegnandoServito(false);
    }
  };

  // ── VISTA DETTAGLIO COMANDA ─────────────────────────────────────────────────

  if (comandaSelezionata) {
    const piattiCategoria = piatti.filter(p =>
      p.categoria_id === categoriaAttiva && p.disponibile
    );
    const haAllergie = !!(noteAllergie?.trim());
    const haRighePronte = righe.some(r => r.stato === 'pronto');

    return (
      <AppShell>
        {/* Notifica banner */}
        {notifica && (
          <div data-testid="notifica-banner"
               className="fixed top-4 left-4 right-4 z-50 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg"
               style={{ background: 'var(--status-green-bg)', border: '2px solid var(--status-green-text)' }}>
            <span className="text-lg">🔔</span>
            <span className="text-sm font-bold flex-1" style={{ color: 'var(--status-green-text)' }}>{notifica}</span>
            <button onClick={() => { setNotifica(null); document.title = 'Gestionale Hotel'; }}
                    style={{ color: 'var(--status-green-text)' }}>
              <X size={18} />
            </button>
          </div>
        )}

        {/*
          -mt-4/-mb-20 (md: -mt-6/-mb-6) annullano il padding verticale di
          AppShell <main> (p-4 md:p-6 pb-20 md:pb-6 — vedi AppShell.tsx:66).
          L'altezza recupera esattamente lo spazio annullato, così il box
          combacia con lo spazio visibile reale senza scroll esterno.
          Se il padding di AppShell cambia, questi valori vanno aggiornati insieme.
        */}
        <div className="flex flex-col overflow-hidden max-w-xl mx-auto -mt-4 md:-mt-6 -mb-20 md:-mb-6 h-[calc(100%+6rem)] md:h-[calc(100%+3rem)]">

          {/* ── ZONA 1: TOPBAR ─────────────────────────────────────────────── */}
          <div className="shrink-0 px-3 py-2 flex items-center justify-between gap-2"
               style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => router.push('/sala')}
                    className="text-sm shrink-0" style={{ color: 'var(--primary)' }}>
              ← Sala
            </button>
            <div className="flex-1 min-w-0 text-center">
              <p className="font-medium leading-none" style={{ fontSize: 14, color: 'var(--foreground)' }}>
                Tavolo {comandaSelezionata.tavolo_numero}
              </p>
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                {comandaSelezionata.coperti ? `${comandaSelezionata.coperti} coperti` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {haAllergie && (
                <span className="font-bold"
                      style={{ background: '#c0392b', color: '#fff', fontSize: 10,
                               borderRadius: 6, padding: '3px 8px' }}>
                  ⚠ Allergie
                </span>
              )}
              <button onClick={mostraContoComanda}
                      className="px-2 py-1 rounded-lg text-xs"
                      style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                Conto
              </button>
            </div>
          </div>

          {/* ── ZONA 2: PIATTI ORDINATI + AGGIUNGI PIATTI (unica area scrollabile) ── */}
          <div className="flex-1 overflow-y-auto">

          {/* Piatti ordinati — in cima, solo se la comanda ha righe */}
          {righe.length > 0 && (
            <div style={{
                   background: haRighePronte ? '#FAEEDA' : 'var(--card)',
                   borderBottom: '2px solid var(--border)',
                 }}>
              <div className="px-3 py-2 flex items-center justify-between">
                <p className="font-bold text-sm"
                   style={{ color: haRighePronte ? '#633806' : 'var(--foreground)' }}>
                  {haRighePronte ? '⚡ Da servire' : 'Piatti ordinati'} ({righe.length})
                </p>
                {haRighePronte && (
                  <button onClick={segnaTuttoServito} disabled={segnandoServito}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg"
                          style={{ background: '#16344b', color: '#fff', opacity: segnandoServito ? 0.5 : 1 }}>
                    {segnandoServito ? '...' : 'Tutto servito'}
                  </button>
                )}
              </div>
              <div className="px-3 pb-2 flex flex-col gap-1">
                {righe.map(r => {
                  const s = STATI_RIGA[r.stato] || STATI_RIGA.in_attesa;
                  return (
                    <div key={r.id}
                         data-testid="riga-comanda"
                         data-riga-id={r.id}
                         data-stato={r.stato}
                         className="flex items-center gap-2 text-xs py-0.5">
                      <span style={{ color: 'var(--foreground)', flex: 1 }} className="truncate">
                        {r.quantita}× {r.piatto_nome}
                        {r.note && <span className="italic ml-1" style={{ color: 'var(--muted-foreground)' }}>{r.note}</span>}
                      </span>
                      <span style={{ color: s.color }}>{s.label}</span>
                      {prossimoStato(r.stato) && (
                        <button onClick={() => aggiornaStatoRiga(r.id, prossimoStato(r.stato))}
                                data-testid="btn-avanza-stato"
                                data-stato-corrente={r.stato}
                                data-stato-prossimo={prossimoStato(r.stato)}>
                          <CheckCircle size={14} style={{ color: 'var(--status-green-text)' }} />
                        </button>
                      )}
                      {r.stato === 'in_attesa' && isCamerier && (
                        <button onClick={() => rimuoviRiga(r.id)}>
                          <X size={14} style={{ color: 'var(--status-red-text)' }} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Aggiungi piatti — collassabile, aperta di default se comanda vuota */}
          <button onClick={() => setMenuAperto(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold"
                  style={{ background: 'var(--muted)', color: 'var(--foreground)', borderBottom: '1px solid var(--border)' }}>
            <span>Aggiungi piatti</span>
            <span>{menuAperto ? '▲' : '▼'}</span>
          </button>
          {menuAperto && (
          <div className="flex">

            {/* Colonna categorie */}
            <div className="shrink-0 flex flex-col"
                 style={{ width: 72, background: 'var(--card)', borderRight: '1px solid var(--border)' }}>
              {categorie.map(cat => {
                const attiva = categoriaAttiva === cat.id;
                return (
                  <button key={cat.id}
                          onClick={() => setCategoriaAttiva(cat.id)}
                          className="flex flex-col items-center py-3 px-1 gap-1"
                          style={{
                            borderLeft: attiva ? '3px solid #16344b' : '3px solid transparent',
                            background: attiva ? 'var(--surface-2, var(--muted))' : 'transparent',
                            color: attiva ? '#16344b' : 'var(--muted-foreground)',
                          }}>
                    <span style={{ fontSize: 20 }}>{cat.emoji || '🍽️'}</span>
                    <span style={{ fontSize: 10, fontWeight: 500, textAlign: 'center',
                                   lineHeight: '1.2', wordBreak: 'break-word', color: 'inherit' }}>
                      {cat.titolo}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Lista piatti */}
            <div className="flex-1 overflow-y-auto">
              {piattiCategoria.length === 0 ? (
                <p className="px-4 py-6 text-xs text-center" style={{ color: 'var(--muted-foreground)' }}>
                  Nessun piatto disponibile.
                </p>
              ) : (
                piattiCategoria.map(p => {
                  const match = hasMatch(p.allergeni, noteAllergie);
                  const haMatch = match.length > 0;
                  return (
                    <div key={p.id}
                         style={{
                           background: haMatch ? '#FCEBEB' : 'var(--card)',
                           border:     haMatch ? '1px solid #F09595' : '1px solid transparent',
                           borderBottom: '1px solid var(--border)',
                           padding: '10px 12px',
                         }}>
                      {/* Riga superiore */}
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium leading-tight"
                             style={{ fontSize: 13, color: haMatch ? '#A32D2D' : 'var(--foreground)' }}>
                            {p.nome}
                          </p>
                          {p.descrizione && (
                            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 1 }}>
                              {p.descrizione}
                            </p>
                          )}
                          {p.prezzo && (
                            <p style={{ fontSize: 11, color: 'var(--primary)', marginTop: 1 }}>
                              €{parseFloat(p.prezzo).toFixed(2)}
                            </p>
                          )}
                        </div>
                        {/* Pulsante + */}
                        <button onClick={() => aggiungiAlCarrello(p)}
                                className="shrink-0 flex items-center justify-center rounded-full font-bold"
                                style={{
                                  width: 28, height: 28,
                                  background: haMatch ? '#c0392b' : '#16344b',
                                  color: '#fff', fontSize: 18, lineHeight: 1,
                                }}>
                          +
                        </button>
                      </div>

                      {/* Allergeni */}
                      {p.allergeni?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {p.allergeni.map(all => (
                            <BadgeAllergene key={all} nome={all}
                                            inMatch={match.includes(all)} />
                          ))}
                        </div>
                      )}

                      {/* Banner avviso match */}
                      {haMatch && (
                        <div className="mt-1.5 rounded px-2 py-1"
                             style={{ background: '#FCEBEB', border: '1px solid #F09595',
                                      fontSize: 10, color: '#A32D2D' }}>
                          ⚠ Contiene {match.join(', ')} — allergia segnalata per questo tavolo
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          )}
          </div>

          {/* ── ZONA 3: CARRELLO ───────────────────────────────────────────── */}
          <div className="shrink-0" style={{ background: 'var(--card)', borderTop: '2px solid var(--border)' }}>

            {/* Header carrello */}
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <ShoppingCart size={16} style={{ color: 'var(--foreground)' }} />
                <span className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>Ordine</span>
                {itemsCarrello.length > 0 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'var(--hotel-amber, #EF9F27)', color: '#fff' }}>
                    {itemsCarrello.reduce((s, it) => s + it.qty, 0)}
                  </span>
                )}
              </div>
              {totaleCarrello > 0 && (
                <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  €{totaleCarrello.toFixed(2)}
                </span>
              )}
            </div>

            {/* Righe carrello */}
            {itemsCarrello.length > 0 && (
              <div className="overflow-y-auto px-3 flex flex-col gap-1.5"
                   style={{ maxHeight: 180, paddingBottom: 4 }}>
                {itemsCarrello.map(it => {
                  const allerta = notaEAllerta(it.nota);
                  return (
                    <div key={it.piatto.id}>
                      {/* Riga qty + nome */}
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => cambiaQty(it.piatto.id, -1)}
                                className="flex items-center justify-center rounded-full"
                                style={{ width: 20, height: 20, border: '1px solid var(--border)',
                                         color: 'var(--foreground)', fontSize: 14 }}>
                          −
                        </button>
                        <span className="font-bold text-sm" style={{ color: 'var(--foreground)', minWidth: 16, textAlign: 'center' }}>
                          {it.qty}
                        </span>
                        <button onClick={() => cambiaQty(it.piatto.id, +1)}
                                className="flex items-center justify-center rounded-full"
                                style={{ width: 20, height: 20, border: '1px solid var(--border)',
                                         color: 'var(--foreground)', fontSize: 14 }}>
                          +
                        </button>
                        <span className="flex-1 text-sm truncate" style={{ color: 'var(--foreground)' }}>
                          {it.piatto.nome}
                        </span>
                        {it.piatto.prezzo && (
                          <span className="text-xs shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                            €{(parseFloat(it.piatto.prezzo) * it.qty).toFixed(2)}
                          </span>
                        )}
                      </div>
                      {/* Nota */}
                      <input
                        type="text"
                        placeholder="Nota (es. al dente, senza cipolla...)"
                        value={it.nota}
                        onChange={e => cambioNota(it.piatto.id, e.target.value)}
                        className="w-full outline-none rounded px-2"
                        style={{
                          fontSize: 16,
                          minHeight: 44,
                          background: allerta ? '#FCEBEB' : 'var(--muted)',
                          border: allerta ? '1px solid #F09595' : '1px solid var(--border)',
                          color: allerta ? '#A32D2D' : 'var(--muted-foreground)',
                          fontStyle: allerta ? 'normal' : 'italic',
                          fontWeight: allerta ? 500 : 400,
                          marginTop: 4,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pulsante invia */}
            <div className="px-3 py-2">
              <button
                onClick={inviaOrdine}
                disabled={itemsCarrello.length === 0 || inviando}
                className="w-full font-semibold rounded-lg"
                style={{
                  background: '#16344b',
                  color: '#fff',
                  padding: '11px',
                  fontSize: 14,
                  borderRadius: 8,
                  opacity: itemsCarrello.length === 0 || inviando ? 0.4 : 1,
                }}>
                {inviando ? 'Invio...' : 'Invia alla cucina'}
              </button>
            </div>
          </div>
        </div>

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
              <button onClick={() => setMostraChiusura(true)} disabled={chiudendo}
                      className="w-full py-3 rounded-xl font-bold mt-1"
                      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: chiudendo ? 0.6 : 1 }}>
                Chiudi comanda
              </button>
              <button onClick={() => setMostraConto(false)}
                      className="w-full py-2 rounded-xl text-sm"
                      style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                Continua ad aggiungere
              </button>
            </div>
          </div>
        )}

        {mostraChiusura && (
          <BottomSheetChiusuraComanda
            onChiudi={chiudiConTipo}
            onAnnulla={() => setMostraChiusura(false)}
            loading={chiudendo}
            isAdmin={isAdmin}
          />
        )}
      </AppShell>
    );
  }

  // ── VISTA LISTA COMANDE ─────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="p-4 flex flex-col gap-4 max-w-xl mx-auto">

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

// Etichette leggibili per i pulsanti tipo chiusura (il valore inviato al backend resta invariato)
// ETICHETTE_TIPO: testo dei pulsanti selettore (scelta del tipo, non un'azione)
const ETICHETTE_TIPO = { normale: 'Normale', omaggio: 'Omaggio', autoconsumo: 'Autoconsumo' };
// ETICHETTE_AZIONE: testo del pulsante che esegue davvero la chiusura, dinamico sul tipo scelto
const ETICHETTE_AZIONE = { normale: 'Chiudi e incassa', omaggio: 'Conferma omaggio', autoconsumo: 'Conferma autoconsumo' };

function BottomSheetChiusuraComanda({ onChiudi, onAnnulla, loading, isAdmin }) {
  const [tipo, setTipo] = useState('normale');
  const [motivo, setMotivo] = useState('');
  const [userId, setUserId] = useState('');
  const [valoreCosto, setValoreCosto] = useState('');

  const valido = tipo === 'normale'
    || (tipo === 'omaggio' && motivo.trim())
    || (tipo === 'autoconsumo' && userId && valoreCosto);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
         style={{ background: 'rgba(0,0,0,0.45)' }}
         onClick={onAnnulla}>
      <div className="w-full max-w-xl rounded-t-2xl p-5 flex flex-col gap-3"
           style={{ background: 'var(--card)' }}
           onClick={e => e.stopPropagation()}>
        <p className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>Chiudi comanda</p>

        {/* Tipo di chiusura — solo per titolare/admin. Il cameriere chiude sempre normale, un tap solo. */}
        {isAdmin && (
          <div className="flex gap-2">
            {['normale', 'omaggio', 'autoconsumo'].map(t => (
              <button key={t}
                onClick={() => setTipo(t)}
                className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{
                  background: tipo === t ? 'var(--primary)' : 'var(--muted)',
                  color: tipo === t ? 'var(--primary-foreground)' : 'var(--foreground)',
                }}>
                {ETICHETTE_TIPO[t]}
              </button>
            ))}
          </div>
        )}

        {tipo === 'omaggio' && (
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Motivo dell'omaggio…"
            rows={2}
            className="w-full rounded-xl p-3 text-sm"
            style={{ background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)', resize: 'none' }}
          />
        )}

        {tipo === 'autoconsumo' && (
          <div className="flex flex-col gap-2">
            <input
              type="number"
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="ID consumatore (user_id)"
              className="w-full rounded-xl p-3 text-sm"
              style={{ background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
            />
            <input
              type="number"
              step="0.01"
              value={valoreCosto}
              onChange={e => setValoreCosto(e.target.value)}
              placeholder="Valore a costo (€)"
              className="w-full rounded-xl p-3 text-sm"
              style={{ background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
            />
          </div>
        )}

        <button
          onClick={() => onChiudi({ tipo, motivo: motivo.trim(), user_id: userId ? parseInt(userId) : undefined, valore_costo: valoreCosto ? parseFloat(valoreCosto) : undefined })}
          disabled={loading || !valido}
          className="w-full py-3.5 rounded-xl font-bold text-base"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: (loading || !valido) ? 0.6 : 1 }}>
          {loading ? 'Chiusura...' : ETICHETTE_AZIONE[tipo]}
        </button>
        <button onClick={onAnnulla}
                className="w-full py-2 text-sm"
                style={{ color: 'var(--muted-foreground)' }}>
          Annulla
        </button>
      </div>
    </div>
  );
}

export default function RistorantePage() {
  return (
    <Suspense>
      <RistoranteInner />
    </Suspense>
  );
}
