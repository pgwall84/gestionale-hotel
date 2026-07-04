'use client';

// Pagina Sala — mappa 20 tavoli + prenotazioni di oggi.
// Cameriere: tocca tavolo libero → bottom sheet (apri+vai / solo segna / annulla).
//            tocca tavolo verde → naviga a /ristorante?comanda=X via router.push.
// SSE /sala/stream: aggiornamento real-time + notifiche "piatto pronto" (banner + suono).
// Titolare/admin: pannello per aggiungere/rimuovere tavoli e cambiare layout.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Settings, X, ChevronRight } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import Cookies from 'js-cookie';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';

const RUOLI_ADMIN  = ['admin', 'titolare'];
const RUOLI_ASSEGNA = ['admin', 'titolare', 'receptionist', 'cameriere'];

function oggi() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Suono notifica (AudioContext nativo — no librerie) ────────────────────────
// audioCtxRef deve essere creato/sbloccato al primo tap utente prima di chiamare suonaBip.
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

// ── Card tavolo ───────────────────────────────────────────────────────────────

function CardTavolo({ tavolo, modalitaAssegna, onAssegna, onLibero, onOccupato, aprendoId }) {
  const occupato      = !!tavolo.comanda_stato;
  const haEtichetta   = !!tavolo.etichetta;
  const inPreparazione = parseInt(tavolo.piatti_in_attesa) > 0;
  const caricando     = aprendoId === tavolo.id;

  let bg, border, labelColor;
  if (modalitaAssegna) {
    bg = occupato ? 'var(--muted)' : 'var(--status-green-bg)';
    border = occupato ? 'var(--border)' : 'var(--status-green-text)';
    labelColor = occupato ? 'var(--muted-foreground)' : 'var(--status-green-text)';
  } else if (inPreparazione) {
    bg = 'var(--status-amber-bg)'; border = 'var(--status-amber-text)'; labelColor = 'var(--status-amber-text)';
  } else if (occupato) {
    bg = 'var(--status-green-bg)'; border = 'var(--status-green-text)'; labelColor = 'var(--status-green-text)';
  } else if (haEtichetta) {
    bg = 'var(--status-blue-bg)'; border = 'var(--status-blue-text)'; labelColor = 'var(--status-blue-text)';
  } else {
    bg = 'var(--card)'; border = 'var(--border)'; labelColor = 'var(--muted-foreground)';
  }

  const handleClick = () => {
    if (caricando) return;
    if (modalitaAssegna) { if (!occupato) onAssegna(tavolo); return; }
    if (occupato) onOccupato(tavolo);
    else onLibero(tavolo);
  };

  // Stato leggibile per test E2E
  const statoTavolo = modalitaAssegna ? (occupato ? 'occupato' : 'libero')
    : inPreparazione ? 'in-preparazione'
    : occupato ? 'occupato'
    : haEtichetta ? 'prenotato'
    : 'libero';

  return (
    <div
      onClick={handleClick}
      data-tavolo-id={tavolo.id}
      data-tavolo-numero={tavolo.numero}
      data-stato={statoTavolo}
      className="rounded-xl p-2.5 flex flex-col gap-1 select-none transition-all active:scale-95"
      style={{
        background: bg,
        border: `2px solid ${border}`,
        cursor: caricando ? 'wait' : (modalitaAssegna && occupato) ? 'not-allowed' : 'pointer',
        opacity: caricando ? 0.5 : (modalitaAssegna && occupato) ? 0.4 : 1,
        minHeight: 72,
      }}
    >
      <div className="flex justify-between items-center">
        <span className="font-bold text-base" style={{ color: 'var(--foreground)' }}>T{tavolo.numero}</span>
        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{tavolo.coperti}p</span>
      </div>
      {tavolo.etichetta && (
        <span className="text-xs font-semibold truncate" style={{ color: labelColor }}>
          {tavolo.etichetta}{tavolo.prenotazione_ora && ` ${tavolo.prenotazione_ora.slice(0,5)}`}
        </span>
      )}
      <div className="flex items-center gap-1">
        {inPreparazione && (
          <span className="text-xs px-1 rounded-full font-bold"
                style={{ background: 'var(--status-amber-text)', color: '#fff' }}>
            {tavolo.piatti_in_attesa}
          </span>
        )}
        <span className="text-xs" style={{ color: labelColor }}>
          {caricando ? '...' : modalitaAssegna && !occupato ? 'Seleziona' : occupato ? (inPreparazione ? 'In prep.' : 'Occupato') : haEtichetta ? 'Prenotato' : 'Libero'}
        </span>
      </div>
    </div>
  );
}

// ── Bottom sheet: scelta azione su tavolo libero ──────────────────────────────

function BottomSheetTavoloLibero({ tavolo, onApriEVai, onSoloSegna, onAnnulla, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
         style={{ background: 'rgba(0,0,0,0.45)' }}
         onClick={onAnnulla}>
      <div className="w-full max-w-xl rounded-t-2xl p-5 flex flex-col gap-3"
           style={{ background: 'var(--card)' }}
           onClick={e => e.stopPropagation()}>
        <p className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>
          Tavolo {tavolo.numero} — {tavolo.coperti} posti
        </p>
        <button
          onClick={onApriEVai}
          disabled={loading}
          className="w-full py-3.5 rounded-xl font-bold text-base"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Apertura...' : 'Apri comanda e aggiungi piatti →'}
        </button>
        <button
          onClick={onSoloSegna}
          disabled={loading}
          className="w-full py-3 rounded-xl font-medium text-sm"
          style={{ background: 'var(--muted)', color: 'var(--foreground)', opacity: loading ? 0.6 : 1 }}
        >
          Solo segna occupato
        </button>
        <button
          onClick={onAnnulla}
          className="w-full py-2 text-sm"
          style={{ color: 'var(--muted-foreground)' }}
        >
          Annulla
        </button>
      </div>
    </div>
  );
}

// ── Pagina principale ─────────────────────────────────────────────────────────

const FORM_TAVOLO_VUOTO = { numero: '', coperti: 2 };

export default function SalaPage() {
  const { utente } = useAuth();
  const router = useRouter();

  const [tavoli, setTavoli]             = useState([]);
  const [configs, setConfigs]           = useState([]);
  const [prenotazioni, setPrenotazioni] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [errore, setErrore]             = useState(null);
  const [aprendoId, setAprendoId]       = useState(null);

  // Fix 1: tavolo libero selezionato → bottom sheet
  const [tavoloInScelta, setTavoloInScelta] = useState(null);
  const [loadingScelta, setLoadingScelta]   = useState(false);

  // Fix 4: notifica banner
  const [notifica, setNotifica]    = useState(null);
  const notificaTimerRef           = useRef(null);

  // SSE
  const esRef       = useRef(null);
  const audioCtxRef = useRef(null);

  const [prenotazioneInAssegna, setPrenotazioneInAssegna] = useState(null);

  // Pannello gestione (admin)
  const [pannelloAperto, setPannelloAperto] = useState(false);
  const [sezioneAttiva, setSezioneAttiva]   = useState('tavoli');
  const [formTavolo, setFormTavolo]         = useState(FORM_TAVOLO_VUOTO);
  const [nuovoNomeConfig, setNuovoNomeConfig] = useState('');
  const [salvando, setSalvando]             = useState(false);

  const isAdmin     = utente && RUOLI_ADMIN.includes(utente.ruolo);
  const puoAssegnare = utente && RUOLI_ASSEGNA.includes(utente.ruolo);

  // ── Caricamento dati ────────────────────────────────────────────────────────

  const carica = useCallback(async () => {
    try {
      setLoading(true); setErrore(null);
      const [rt, rc, rp] = await Promise.all([
        api.get('/ristorante/tavoli'),
        api.get('/ristorante/config'),
        api.get(`/ristorante/prenotazioni?data=${oggi()}`),
      ]);
      setTavoli(rt.data.tavoli || []);
      setConfigs(rc.data.configurazioni || []);
      setPrenotazioni((rp.data.prenotazioni || []).filter(p => p.stato !== 'cancellata'));
    } catch (err) {
      setErrore(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carica(); }, [carica]);

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

  // ── SSE /sala/stream — sostituisce polling ──────────────────────────────────

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
          carica(); // aggiorna badge giallo sulla card
        } else if (dati.evento === 'comanda_chiusa') {
          carica(); // libera il tavolo immediatamente
        }
      } catch (_) {}
    };

    es.onerror = () => {
      es.close();
      setTimeout(connetti, 5000); // riconnette automaticamente
    };
  }, [carica, mostraNotifica]);

  useEffect(() => {
    connetti();
    return () => { esRef.current?.close(); };
  }, [connetti]);

  // ── Sblocco AudioContext al primo tap (richiesto da iOS/Android) ────────────
  // Viene creato al mount e sbloccato al primo tocco di qualsiasi elemento interattivo.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.suspend();
      audioCtxRef.current = ctx;
    } catch (_) {}

    const sblocca = () => {
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
      document.removeEventListener('touchstart', sblocca);
      document.removeEventListener('click', sblocca);
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

  // ── Azioni tavolo ──────────────────────────────────────────────────────────

  // Tavolo libero toccato → mostra bottom sheet
  const handleLibero = (tavolo) => setTavoloInScelta(tavolo);

  // "Apri e vai alle comande" — apre comanda e naviga a /ristorante
  const apriEVai = async () => {
    if (!tavoloInScelta) return;
    setLoadingScelta(true);
    try {
      const r = await api.post('/ristorante/comande', { tavolo_id: tavoloInScelta.id });
      const comandaId = r.data.comanda?.id;
      setTavoloInScelta(null);
      router.push(`/ristorante?comanda=${comandaId}`);
    } catch (err) {
      if (err.response?.status === 409) {
        // Comanda già aperta (race condition) — vai comunque alla comanda
        const comandaId = err.response.data?.comanda_id;
        setTavoloInScelta(null);
        if (comandaId) router.push(`/ristorante?comanda=${comandaId}`);
        else await carica();
      } else {
        alert(err.message);
      }
    } finally {
      setLoadingScelta(false);
    }
  };

  // "Solo segna occupato" — apre comanda, resta sulla mappa
  const soloSegnaOccupato = async () => {
    if (!tavoloInScelta) return;
    setLoadingScelta(true);
    try {
      await api.post('/ristorante/comande', { tavolo_id: tavoloInScelta.id });
      setTavoloInScelta(null);
      await carica();
    } catch (err) {
      if (err.response?.status === 409) {
        setTavoloInScelta(null);
        await carica();
      } else {
        alert(err.message);
      }
    } finally {
      setLoadingScelta(false);
    }
  };

  // Fix 2: useRouter invece di window.location.href
  const vaiAComanda = (tavolo) => {
    router.push(`/ristorante?comanda=${tavolo.comanda_id}`);
  };

  const assegnaTavolo = async (tavolo) => {
    if (!prenotazioneInAssegna) return;
    try {
      await api.patch(`/ristorante/tavoli/${tavolo.id}/prenotazione`, { prenotazione_id: prenotazioneInAssegna.id });
      setPrenotazioneInAssegna(null);
      await carica();
    } catch (err) { alert(err.message); }
  };

  const rimuoviAssociazione = async (tavoloId) => {
    try {
      await api.patch(`/ristorante/tavoli/${tavoloId}/prenotazione`, { prenotazione_id: null });
      await carica();
    } catch (err) { alert(err.message); }
  };

  // ── Gestione configurazioni ────────────────────────────────────────────────

  const attivaConfig = async (id) => {
    try { await api.patch(`/ristorante/config/${id}/attiva`); await carica(); }
    catch (err) { alert(err.message); }
  };

  const creaConfig = async (e) => {
    e.preventDefault();
    if (!nuovoNomeConfig.trim()) return;
    setSalvando(true);
    try { await api.post('/ristorante/config', { nome: nuovoNomeConfig.trim() }); setNuovoNomeConfig(''); await carica(); }
    catch (err) { alert(err.message); }
    finally { setSalvando(false); }
  };

  const creaTavolo = async (e) => {
    e.preventDefault();
    if (!formTavolo.numero || !formTavolo.coperti) return;
    setSalvando(true);
    try {
      await api.post('/ristorante/tavoli', { numero: parseInt(formTavolo.numero), coperti: parseInt(formTavolo.coperti) });
      setFormTavolo(FORM_TAVOLO_VUOTO);
      await carica();
    } catch (err) { alert(err.message); }
    finally { setSalvando(false); }
  };

  const eliminaTavolo = async (id) => {
    if (!confirm('Rimuovere il tavolo?')) return;
    try { await api.delete(`/ristorante/tavoli/${id}`); await carica(); }
    catch (err) { alert(err.message); }
  };

  const configAttiva = configs.find(c => c.attiva);
  const prenotazioniAssegnate = new Set(tavoli.map(t => t.prenotazione_id).filter(Boolean));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="p-4 flex flex-col gap-4 max-w-xl mx-auto">

        {/* Banner notifica piatto pronto */}
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

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>Sala</h1>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {configAttiva ? `Layout: ${configAttiva.nome}` : 'Nessun layout attivo'}
            </p>
          </div>
          {isAdmin && (
            <button onClick={() => setPannelloAperto(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
                    style={{ background: pannelloAperto ? 'var(--primary)' : 'var(--muted)', color: pannelloAperto ? 'var(--primary-foreground)' : 'var(--foreground)' }}>
              <Settings size={15} /> Gestisci
            </button>
          )}
        </div>

        {/* Banner modalità assegnazione */}
        {prenotazioneInAssegna && (
          <div className="rounded-xl px-4 py-3 flex justify-between items-center"
               style={{ background: 'var(--status-blue-bg)', border: '2px solid var(--status-blue-text)' }}>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--status-blue-text)' }}>Tocca un tavolo libero per assegnarlo a:</p>
              <p className="text-sm" style={{ color: 'var(--foreground)' }}>
                {prenotazioneInAssegna.nome} — ore {prenotazioneInAssegna.ora?.slice(0,5)} ({prenotazioneInAssegna.coperti} pers.)
              </p>
            </div>
            <button onClick={() => setPrenotazioneInAssegna(null)} style={{ color: 'var(--status-blue-text)' }}>
              <X size={20} />
            </button>
          </div>
        )}

        {/* Pannello gestione */}
        {pannelloAperto && isAdmin && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
              {[{ id: 'tavoli', label: 'Tavoli' }, { id: 'config', label: 'Layout sala' }].map(t => (
                <button key={t.id} onClick={() => setSezioneAttiva(t.id)}
                        className="flex-1 py-2 text-sm font-medium"
                        style={{ background: sezioneAttiva === t.id ? 'var(--primary)' : 'var(--card)', color: sezioneAttiva === t.id ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="p-3 flex flex-col gap-3" style={{ background: 'var(--card)' }}>
              {sezioneAttiva === 'tavoli' && (
                <>
                  <form onSubmit={creaTavolo} className="flex gap-2 items-end">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>N° tavolo</label>
                      <input required type="number" min="1" placeholder="es. 21"
                             value={formTavolo.numero}
                             onChange={e => setFormTavolo(f => ({ ...f, numero: e.target.value }))}
                             className="rounded-lg px-2 py-1.5 text-sm w-20"
                             style={{ background: 'var(--input)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Coperti</label>
                      <input required type="number" min="1" max="20"
                             value={formTavolo.coperti}
                             onChange={e => setFormTavolo(f => ({ ...f, coperti: e.target.value }))}
                             className="rounded-lg px-2 py-1.5 text-sm w-20"
                             style={{ background: 'var(--input)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                    </div>
                    <button type="submit" disabled={salvando}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium"
                            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                      <Plus size={15} /> Aggiungi
                    </button>
                  </form>
                  <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                    {tavoli.map(t => (
                      <div key={t.id} className="flex justify-between items-center py-1 text-sm" style={{ color: 'var(--foreground)' }}>
                        <span>T{t.numero} — {t.coperti} posti</span>
                        {!t.comanda_stato && (
                          <button onClick={() => eliminaTavolo(t.id)}
                                  className="text-xs px-2 py-0.5 rounded"
                                  style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
                            Rimuovi
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {sezioneAttiva === 'config' && (
                <>
                  {configs.map(c => (
                    <div key={c.id} className="flex justify-between items-center">
                      <span className="text-sm" style={{ color: 'var(--foreground)' }}>{c.nome}</span>
                      {c.attiva
                        ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>Attivo</span>
                        : <button onClick={() => attivaConfig(c.id)} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Attiva</button>
                      }
                    </div>
                  ))}
                  <form onSubmit={creaConfig} className="flex gap-2">
                    <input value={nuovoNomeConfig} onChange={e => setNuovoNomeConfig(e.target.value)}
                           placeholder="Nuovo layout (es. Evento60)..."
                           className="flex-1 rounded-lg px-3 py-1.5 text-sm"
                           style={{ background: 'var(--input)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                    <button type="submit" disabled={salvando}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium"
                            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                      <Plus size={15} />
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}

        {/* Griglia tavoli */}
        {loading ? (
          <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : errore ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--status-red-text)' }}>{errore}</p>
        ) : tavoli.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ background: 'var(--card)', border: '1px dashed var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessun tavolo nel layout attivo.</p>
            {isAdmin && (
              <button onClick={() => { setPannelloAperto(true); setSezioneAttiva('tavoli'); }}
                      className="text-sm font-medium mt-2" style={{ color: 'var(--primary)' }}>
                + Aggiungi il primo tavolo
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {tavoli.map(t => (
              <CardTavolo
                key={t.id}
                tavolo={t}
                modalitaAssegna={!!prenotazioneInAssegna}
                aprendoId={aprendoId}
                onAssegna={assegnaTavolo}
                onLibero={handleLibero}
                onOccupato={vaiAComanda}
              />
            ))}
          </div>
        )}

        {/* Legenda */}
        {!prenotazioneInAssegna && tavoli.length > 0 && (
          <div className="flex gap-3 text-xs flex-wrap justify-center" style={{ color: 'var(--muted-foreground)' }}>
            <span>⬜ Libero</span>
            <span style={{ color: 'var(--status-blue-text)' }}>🔵 Prenotato</span>
            <span style={{ color: 'var(--status-green-text)' }}>🟩 Occupato</span>
            <span style={{ color: 'var(--status-amber-text)' }}>🟨 In prep.</span>
          </div>
        )}

        {/* Prenotazioni di oggi */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Prenotazioni di oggi</p>
          {prenotazioni.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Nessuna prenotazione per oggi.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {prenotazioni.map(p => {
                const assegnata = prenotazioniAssegnate.has(p.id);
                const tavoloAssegnato = tavoli.find(t => t.prenotazione_id === p.id);
                return (
                  <div key={p.id}
                       className="rounded-lg px-3 py-2.5 flex justify-between items-center gap-2"
                       style={{ background: assegnata ? 'var(--status-blue-bg)' : 'var(--card)', border: `1px solid ${assegnata ? 'var(--status-blue-text)' : 'var(--border)'}` }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                        <strong>{p.ora?.slice(0,5)}</strong> — {p.nome}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {p.coperti} pers.
                        {p.allergie && ' · ⚠️ ' + p.allergie}
                        {tavoloAssegnato && <span style={{ color: 'var(--status-blue-text)' }}> · T{tavoloAssegnato.numero}</span>}
                      </p>
                    </div>
                    {puoAssegnare && (
                      assegnata ? (
                        <button onClick={() => rimuoviAssociazione(tavoloAssegnato.id)}
                                className="text-xs px-2 py-1 rounded shrink-0"
                                style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
                          Rimuovi T{tavoloAssegnato?.numero}
                        </button>
                      ) : (
                        <button onClick={() => setPrenotazioneInAssegna(p)}
                                className="text-xs px-2 py-1 rounded shrink-0 flex items-center gap-1"
                                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                          Assegna <ChevronRight size={12} />
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Fix 1: Bottom sheet tavolo libero */}
      {tavoloInScelta && (
        <BottomSheetTavoloLibero
          tavolo={tavoloInScelta}
          onApriEVai={apriEVai}
          onSoloSegna={soloSegnaOccupato}
          onAnnulla={() => setTavoloInScelta(null)}
          loading={loadingScelta}
        />
      )}
    </AppShell>
  );
}
