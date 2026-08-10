'use client';

// Pagina Addebiti extra — conto camera per gli extra oltre il trattamento
// incluso (soprattutto bar). Griglia rapida "a quadratoni": tocca un
// prodotto, si compila il carrello a sinistra, conferma per addebitarlo
// sul soggiorno. Nessuna comanda/tavolo/cucina coinvolta (percorso diretto
// verso addebiti_extra) — per gli extra ordinati a tavola in ristorante
// resta il percorso da comanda (toggle "addebita a camera" sulla riga).
// Raggiungibile con ?soggiorno_id= già risolto (da planning-camere) oppure
// da menu, con selezione camera tra quelle occupate oggi.
// Accessibile a: admin, titolare, receptionist, cameriere (shared/ruoli.js
// sezione 'addebiti_extra').

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, X, Plus, Receipt } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import api from '@/lib/api';

function fmtEuro(v) {
  return `€ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

// Selettore camera — mostrato solo quando si arriva senza soggiorno_id in query.
function SelettoreCamera({ onScelta }) {
  const [camere, setCamere] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const risposta = await api.get('/camere');
        setCamere((risposta.data?.camere || []).filter(c => c.soggiorno_id));
      } catch (err) {
        setErrore(err.message || 'Errore nel caricamento delle camere');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm" style={{ color: 'var(--muted-foreground)' }}>
        <Loader2 size={18} className="animate-spin mr-2" /> Caricamento camere...
      </div>
    );
  }
  if (errore) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
           style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
        <AlertTriangle size={14} /> {errore}
      </div>
    );
  }
  if (!camere.length) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: 'var(--muted-foreground)' }}>
        Nessuna camera occupata oggi.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium mb-2">Seleziona la camera</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {camere.map(c => (
          <button
            key={c.id}
            onClick={() => onScelta(c.soggiorno_id, c.numero, `${c.ospite_nome || ''} ${c.ospite_cognome || ''}`.trim())}
            className="rounded-lg p-3 text-left"
            style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}
          >
            <p className="text-sm font-medium">Camera {c.numero}</p>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {c.ospite_nome ? `${c.ospite_nome} ${c.ospite_cognome}` : '—'}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PaginaAddebitiExtra() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [soggiornoId, setSoggiornoId] = useState(searchParams.get('soggiorno_id') || null);
  const [camera, setCamera]           = useState(searchParams.get('camera') || '');
  const [ospite, setOspite]           = useState(searchParams.get('ospite') || '');

  const [catalogo, setCatalogo]   = useState([]);
  const [addebiti, setAddebiti]   = useState([]);
  const [totaleAccumulato, setTotaleAccumulato] = useState(0);
  const [loading, setLoading]     = useState(false);
  const [errore, setErrore]       = useState(null);
  const [carrello, setCarrello]   = useState([]); // [{ catalogo_id?, descrizione, prezzo }]
  const [confermando, setConfermando] = useState(false);
  const [voceLibera, setVoceLibera] = useState({ descrizione: '', importo: '' });

  const totaleCarrello = useMemo(
    () => carrello.reduce((s, v) => s + Number(v.prezzo || 0), 0),
    [carrello]
  );

  const caricaDati = useCallback(async () => {
    if (!soggiornoId) return;
    setLoading(true);
    setErrore(null);
    try {
      const [rCatalogo, rAddebiti] = await Promise.all([
        api.get('/impostazioni/catalogo-addebiti'),
        api.get(`/soggiorni/${soggiornoId}/addebiti`),
      ]);
      setCatalogo(rCatalogo.data?.catalogo || []);
      setAddebiti(rAddebiti.data?.addebiti || []);
      setTotaleAccumulato(rAddebiti.data?.totale || 0);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento');
    } finally {
      setLoading(false);
    }
  }, [soggiornoId]);

  useEffect(() => { caricaDati(); }, [caricaDati]);

  function sceltaCamera(id, numeroCamera, nomeOspite) {
    setSoggiornoId(id);
    setCamera(numeroCamera);
    setOspite(nomeOspite);
    router.replace(`/addebiti-extra?soggiorno_id=${id}&camera=${encodeURIComponent(numeroCamera || '')}&ospite=${encodeURIComponent(nomeOspite || '')}`);
  }

  function aggiungiAlCarrello(voce) {
    setCarrello(c => [...c, voce]);
  }

  function rimuoviDalCarrello(idx) {
    setCarrello(c => c.filter((_, i) => i !== idx));
  }

  function aggiungiVoceLibera() {
    const importo = Number(voceLibera.importo);
    if (!voceLibera.descrizione.trim() || isNaN(importo) || importo < 0) return;
    aggiungiAlCarrello({ descrizione: voceLibera.descrizione.trim(), prezzo: importo });
    setVoceLibera({ descrizione: '', importo: '' });
  }

  async function confermaAddebito() {
    if (!carrello.length) return;
    setConfermando(true);
    setErrore(null);
    try {
      for (const voce of carrello) {
        await api.post(`/soggiorni/${soggiornoId}/addebiti/rapido`,
          voce.catalogo_id
            ? { catalogo_id: voce.catalogo_id }
            : { descrizione: voce.descrizione, importo: voce.prezzo }
        );
      }
      setCarrello([]);
      await caricaDati();
    } catch (err) {
      setErrore(err.message || 'Errore nel salvataggio dell\'addebito');
    } finally {
      setConfermando(false);
    }
  }

  return (
    <AppShell titolo="Addebiti extra">
      {!soggiornoId && <SelettoreCamera onScelta={sceltaCamera} />}

      {soggiornoId && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium">Camera {camera || '—'}</p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{ospite || 'Ospite non indicato'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Già addebitato</p>
              <p className="text-sm font-medium">{fmtEuro(totaleAccumulato)}</p>
            </div>
          </div>

          {errore && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3 text-xs"
                 style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
              <AlertTriangle size={14} /> {errore}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <Loader2 size={18} className="animate-spin mr-2" /> Caricamento...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4">

              {/* Carrello */}
              <div className="rounded-xl p-3 flex flex-col"
                   style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>Nuovo addebito</p>
                <div className="flex-1 flex flex-col gap-1.5 min-h-[60px]">
                  {!carrello.length && (
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      Tocca un prodotto per aggiungerlo.
                    </p>
                  )}
                  {carrello.map((v, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs gap-2">
                      <span>{v.descrizione}</span>
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <span style={{ color: 'var(--muted-foreground)' }}>{fmtEuro(v.prezzo)}</span>
                        <button onClick={() => rimuoviDalCarrello(idx)} aria-label={`Rimuovi ${v.descrizione}`}>
                          <X size={12} style={{ color: 'var(--muted-foreground)' }} />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 mt-2 text-sm font-medium"
                     style={{ borderTop: '0.5px solid var(--border)' }}>
                  <span>Totale</span>
                  <span>{fmtEuro(totaleCarrello)}</span>
                </div>
                <button
                  onClick={confermaAddebito}
                  disabled={!carrello.length || confermando}
                  className="mt-3 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1.5"
                  style={{
                    background: carrello.length ? 'var(--hotel-navy)' : 'var(--border)',
                    color: 'white',
                    opacity: confermando ? 0.6 : 1,
                  }}
                >
                  {confermando ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
                  Conferma addebito
                </button>

                {/* Voce libera — per prodotti non a catalogo */}
                <div className="mt-4 pt-3" style={{ borderTop: '0.5px solid var(--border)' }}>
                  <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Voce libera</p>
                  <input
                    placeholder="Descrizione"
                    value={voceLibera.descrizione}
                    onChange={e => setVoceLibera(v => ({ ...v, descrizione: e.target.value }))}
                    className="w-full text-xs rounded-lg px-2 py-1.5 mb-1.5"
                    style={{ border: '0.5px solid var(--border)', background: 'var(--background)' }}
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="number" min="0" step="0.5"
                      placeholder="Importo"
                      value={voceLibera.importo}
                      onChange={e => setVoceLibera(v => ({ ...v, importo: e.target.value }))}
                      className="flex-1 text-xs rounded-lg px-2 py-1.5"
                      style={{ border: '0.5px solid var(--border)', background: 'var(--background)' }}
                    />
                    <button onClick={aggiungiVoceLibera} className="rounded-lg px-2"
                            style={{ border: '0.5px solid var(--border)' }} aria-label="Aggiungi voce libera">
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Griglia prodotti */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
                {!catalogo.length && (
                  <p className="text-sm col-span-full py-6 text-center" style={{ color: 'var(--muted-foreground)' }}>
                    Nessun prodotto nel catalogo. Aggiungili da Impostazioni ▸ Catalogo addebiti.
                  </p>
                )}
                {catalogo.map(prodotto => (
                  <button
                    key={prodotto.id}
                    onClick={() => aggiungiAlCarrello({ catalogo_id: prodotto.id, descrizione: prodotto.nome, prezzo: prodotto.prezzo })}
                    className="rounded-xl p-3 flex flex-col justify-between text-left h-[84px]"
                    style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}
                  >
                    <span className="text-sm font-medium leading-tight">{prodotto.nome}</span>
                    <span className="text-xs text-right" style={{ color: 'var(--muted-foreground)' }}>{fmtEuro(prodotto.prezzo)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Storico addebiti già accumulati sul soggiorno */}
          {!!addebiti.length && (
            <div className="mt-5">
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>Addebiti già registrati</p>
              <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border)' }}>
                {addebiti.map(a => (
                  <div key={a.id} className="flex items-center justify-between px-3 py-2 text-xs"
                       style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <span>{a.descrizione}</span>
                    <span style={{ color: 'var(--muted-foreground)' }}>{fmtEuro(a.importo)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
