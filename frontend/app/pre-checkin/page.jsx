'use client';

// Pagina Pre check-in — coda di revisione lato reception (modulo 5.2 Fase B,
// 04/08/2026). I dati inviati dall'ospite tramite il form pubblico
// (/pre-checkin/[token], NON questa pagina) restano "in attesa" finché non
// vengono applicati (creano/aggiornano gli ospiti reali e li collegano al
// soggiorno) o scartati. Accessibile a: admin, titolare, receptionist
// (shared/ruoli.js sezione 'pre_checkin').

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import DataTable from '@/components/ui/DataTable';
import SelettoreCodiceAlloggiati from '@/components/ui/SelettoreCodiceAlloggiati';
import SelettoreProvincia from '@/components/ui/SelettoreProvincia';
import CampoData, { ANNO_CORRENTE } from '@/components/ui/CampoData';
import { X, Search, Check } from 'lucide-react';

const RUOLI_PAGINA = ['admin', 'titolare', 'receptionist'];

const TIPI_ALLOGGIATO = [
  { valore: '17', etichetta: 'Capofamiglia' },
  { valore: '16', etichetta: 'Singolo' },
  { valore: '18', etichetta: 'Capogruppo' },
  { valore: '19', etichetta: 'Familiare' },
  { valore: '20', etichetta: 'Membro gruppo' },
];

const inputStyle = {
  height: '36px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

export default function PaginaPreCheckin() {
  const { utente, loading } = useAuth();
  const router = useRouter();
  const [richieste, setRichieste] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [richiestaAperta, setRichiestaAperta] = useState(null);

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_PAGINA.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const res = await api.get('/pre-checkin?stato=in_attesa');
      setRichieste(res.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento.');
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => {
    if (utente && RUOLI_PAGINA.includes(utente.ruolo)) carica();
  }, [utente, carica]);

  if (loading || !utente) return null;

  const colonne = [
    { header: 'Arrivo', accessor: r => r.data_arrivo || '—' },
    { header: 'Ospiti proposti', accessor: r => r.numero_ospiti },
    { header: 'Ricevuta il', accessor: r => new Date(r.creato_at).toLocaleString('it-IT') },
  ];

  return (
    <AppShell titolo="Pre check-in">
      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4" style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}

      <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <h3 className="text-sm font-semibold mb-3">Da rivedere</h3>
        {caricamento ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : (
          <DataTable colonne={colonne} dati={richieste} onRowClick={r => setRichiestaAperta(r.id)} emptyText="Nessuna richiesta in attesa." />
        )}
      </div>

      {richiestaAperta && (
        <PannelloRevisione id={richiestaAperta} onChiudi={() => setRichiestaAperta(null)} onFatto={() => { setRichiestaAperta(null); carica(); }} />
      )}
    </AppShell>
  );
}

function riconciliaRiga(o) {
  return {
    pre_checkin_ospiti_id: o.id,
    soggiorno_id: o.soggiorno_id,
    nome: o.nome || '', cognome: o.cognome || '', sesso: o.sesso || '',
    data_nascita: o.data_nascita || '',
    cittadinanza_testo: o.cittadinanza_testo || '', cittadinanza_codice: o.cittadinanza_codice || null,
    documento_tipo_testo: o.documento_tipo_testo || '', documento_tipo_codice: o.documento_tipo_codice || null,
    documento_numero: o.documento_numero || '',
    documento_scadenza: o.documento_scadenza || '', luogo_nascita_testo: o.luogo_nascita_testo || '',
    provincia_nascita: o.provincia_nascita || '',
    stato_residenza_testo: o.stato_residenza_testo || '', stato_residenza_codice: o.stato_residenza_codice || null,
    comune_residenza_testo: o.comune_residenza_testo || '', comune_residenza_codice: o.comune_residenza_codice || null,
    ospite_id_esistente: null,
    ospite_esistente_etichetta: null,
    tipo_alloggiato: '19',
  };
}

function PannelloRevisione({ id, onChiudi, onFatto }) {
  const [dati, setDati] = useState(null);
  const [righe, setRighe] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState('');
  const [ricercaAperta, setRicercaAperta] = useState(null); // indice riga con ricerca cliente aperta
  const [terminRicerca, setTerminoRicerca] = useState('');
  const [risultatiRicerca, setRisultatiRicerca] = useState([]);

  useEffect(() => {
    let attivo = true;
    api.get(`/pre-checkin/${id}`).then(res => {
      if (!attivo) return;
      setDati(res.data);
      const soggiorniVisti = new Set();
      const iniziali = res.data.ospiti.map(o => {
        const riga = riconciliaRiga(o);
        const primoDelSoggiorno = !soggiorniVisti.has(o.soggiorno_id);
        soggiorniVisti.add(o.soggiorno_id);
        if (primoDelSoggiorno && o.capofamiglia_id) {
          riga.ospite_id_esistente = o.capofamiglia_id;
          riga.ospite_esistente_etichetta = `${o.capofamiglia_nome} ${o.capofamiglia_cognome}`;
          riga.tipo_alloggiato = '17';
        } else if (primoDelSoggiorno) {
          riga.tipo_alloggiato = '17';
        }
        return riga;
      });
      setRighe(iniziali);
    }).finally(() => { if (attivo) setCaricamento(false); });
    return () => { attivo = false; };
  }, [id]);

  useEffect(() => {
    if (!terminRicerca.trim()) { setRisultatiRicerca([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/ospiti?search=${encodeURIComponent(terminRicerca)}`);
        setRisultatiRicerca(res.data);
      } catch { setRisultatiRicerca([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [terminRicerca]);

  function aggiornaRiga(indice, campo, valore) {
    setRighe(r => { const c = [...r]; c[indice] = { ...c[indice], [campo]: valore }; return c; });
  }

  // Coppia testo+codice per cittadinanza/tipo documento (04/08/2026, stesso
  // pattern della scheda cliente — vedi SelettoreCodiceAlloggiati.jsx).
  function aggiornaCoppiaRiga(indice, campoTesto, campoCodice, testo, codice) {
    setRighe(r => { const c = [...r]; c[indice] = { ...c[indice], [campoTesto]: testo, [campoCodice]: codice }; return c; });
  }

  function scegliEsistente(indice, cliente) {
    setRighe(r => {
      const c = [...r];
      c[indice] = { ...c[indice], ospite_id_esistente: cliente.id, ospite_esistente_etichetta: `${cliente.cognome} ${cliente.nome}` };
      return c;
    });
    setRicercaAperta(null);
    setTerminoRicerca('');
  }

  function scollega(indice) {
    setRighe(r => { const c = [...r]; c[indice] = { ...c[indice], ospite_id_esistente: null, ospite_esistente_etichetta: null }; return c; });
  }

  async function applica() {
    setSalvataggio(true);
    setErrore('');
    try {
      await api.post(`/pre-checkin/${id}/applica`, {
        ospiti: righe.map(({ ospite_esistente_etichetta, pre_checkin_ospiti_id, ...resto }) => ({
          ...resto,
          pre_checkin_ospiti_id,
          data_nascita: resto.data_nascita || null,
          documento_scadenza: resto.documento_scadenza || null,
        })),
      });
      onFatto();
    } catch (err) {
      setErrore(err.message || "Errore nell'applicazione.");
    } finally {
      setSalvataggio(false);
    }
  }

  async function scarta() {
    const motivo = window.prompt('Motivo dello scarto (facoltativo):') || '';
    setSalvataggio(true);
    setErrore('');
    try {
      await api.post(`/pre-checkin/${id}/scarta`, { motivo });
      onFatto();
    } catch (err) {
      setErrore(err.message || 'Errore.');
      setSalvataggio(false);
    }
  }

  const soggiorniUnici = dati ? [...new Map(dati.ospiti.map(o => [o.soggiorno_id, o])).values()] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onChiudi}>
      <div className="h-full w-full max-w-lg bg-white shadow-xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white z-10">
          <p className="font-semibold text-sm">Revisione pre check-in</p>
          <button onClick={onChiudi} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          {caricamento || !dati ? (
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
          ) : (
            <>
              {errore && (
                <div className="px-3 py-2.5 rounded-lg text-[13px]" style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>{errore}</div>
              )}
              {dati.note_referente && (
                <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
                  <span className="font-medium">Note dell'ospite: </span>{dati.note_referente}
                </div>
              )}

              {soggiorniUnici.map(sog => (
                <div key={sog.soggiorno_id} className="space-y-2">
                  <p className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>
                    Camera {sog.camera_numero} — dal {sog.data_arrivo} al {sog.data_partenza}
                  </p>
                  {righe.map((riga, indice) => {
                    if (riga.soggiorno_id !== sog.soggiorno_id) return null;
                    return (
                      <div key={indice} className="rounded-lg p-3 space-y-2" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
                        <div className="flex items-center justify-between gap-2">
                          <select value={riga.tipo_alloggiato} onChange={e => aggiornaRiga(indice, 'tipo_alloggiato', e.target.value)}
                                  className="px-2 rounded-lg text-xs outline-none" style={inputStyle}>
                            {TIPI_ALLOGGIATO.map(t => <option key={t.valore} value={t.valore}>{t.etichetta}</option>)}
                          </select>
                          {riga.ospite_id_esistente ? (
                            <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full" style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
                              <Check size={11} /> Aggiorna: {riga.ospite_esistente_etichetta}
                              <button onClick={() => scollega(indice)}><X size={11} /></button>
                            </span>
                          ) : (
                            <button onClick={() => { setRicercaAperta(indice); setTerminoRicerca(''); }}
                                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border">
                              <Search size={11} /> Collega cliente esistente
                            </button>
                          )}
                        </div>

                        {ricercaAperta === indice && (
                          <div className="space-y-1">
                            <input placeholder="Cerca per nome o cognome..." value={terminRicerca} onChange={e => setTerminoRicerca(e.target.value)}
                                   className="w-full px-3 rounded-lg text-xs outline-none" style={inputStyle} />
                            {risultatiRicerca.length > 0 && (
                              <div className="rounded-lg border max-h-32 overflow-y-auto">
                                {risultatiRicerca.map(c => (
                                  <button key={c.id} onClick={() => scegliEsistente(indice, c)}
                                          className="w-full text-left px-2 py-1.5 text-xs border-b last:border-b-0">
                                    {c.cognome} {c.nome}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <input placeholder="Nome" value={riga.nome} onChange={e => aggiornaRiga(indice, 'nome', e.target.value)}
                                 className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                          <input placeholder="Cognome" value={riga.cognome} onChange={e => aggiornaRiga(indice, 'cognome', e.target.value)}
                                 className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                          <select value={riga.sesso} onChange={e => aggiornaRiga(indice, 'sesso', e.target.value)}
                                  className="px-3 rounded-lg text-sm outline-none" style={inputStyle}>
                            <option value="">Sesso</option>
                            <option value="M">M</option>
                            <option value="F">F</option>
                          </select>
                          <CampoData value={riga.data_nascita} onChange={v => aggiornaRiga(indice, 'data_nascita', v)}
                                 minAnno={ANNO_CORRENTE - 110} maxAnno={ANNO_CORRENTE}
                                 className="px-3" style={inputStyle} />
                          <SelettoreCodiceAlloggiati tabella="Luoghi" testo={riga.cittadinanza_testo} codice={riga.cittadinanza_codice}
                                                      placeholder="Cittadinanza"
                                                      onCambiamento={(t, c) => aggiornaCoppiaRiga(indice, 'cittadinanza_testo', 'cittadinanza_codice', t, c)} />
                          <input placeholder="Luogo di nascita" value={riga.luogo_nascita_testo} onChange={e => aggiornaRiga(indice, 'luogo_nascita_testo', e.target.value)}
                                 className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                          <SelettoreCodiceAlloggiati tabella="Tipi_Documento" testo={riga.documento_tipo_testo} codice={riga.documento_tipo_codice}
                                                      placeholder="Tipo documento"
                                                      onCambiamento={(t, c) => aggiornaCoppiaRiga(indice, 'documento_tipo_testo', 'documento_tipo_codice', t, c)} />
                          <input placeholder="Numero documento" value={riga.documento_numero} onChange={e => aggiornaRiga(indice, 'documento_numero', e.target.value)}
                                 className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                          <CampoData placeholder="Scadenza documento" value={riga.documento_scadenza} onChange={v => aggiornaRiga(indice, 'documento_scadenza', v)}
                                 minAnno={ANNO_CORRENTE - 1} maxAnno={ANNO_CORRENTE + 11}
                                 className="px-3" style={inputStyle} />
                          <SelettoreProvincia valore={riga.provincia_nascita}
                                               onCambiamento={v => aggiornaRiga(indice, 'provincia_nascita', v)}
                                               placeholder="Provincia nascita" />
                          <SelettoreCodiceAlloggiati tabella="Luoghi" testo={riga.stato_residenza_testo} codice={riga.stato_residenza_codice}
                                                      placeholder="Stato di residenza"
                                                      onCambiamento={(t, c) => aggiornaCoppiaRiga(indice, 'stato_residenza_testo', 'stato_residenza_codice', t, c)} />
                          <SelettoreCodiceAlloggiati tabella="Luoghi" testo={riga.comune_residenza_testo} codice={riga.comune_residenza_codice}
                                                      placeholder="Comune di residenza (se Italia)"
                                                      onCambiamento={(t, c) => aggiornaCoppiaRiga(indice, 'comune_residenza_testo', 'comune_residenza_codice', t, c)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              <div className="flex gap-2 pt-2">
                <button onClick={applica} disabled={salvataggio}
                        className="flex-1 rounded-lg py-2 text-sm font-medium text-white disabled:opacity-60"
                        style={{ background: 'var(--hotel-navy)' }}>
                  {salvataggio ? 'Applicazione...' : 'Applica'}
                </button>
                <button onClick={scarta} disabled={salvataggio}
                        className="rounded-lg py-2 px-3 text-sm font-medium border"
                        style={{ color: 'var(--status-red-text)', borderColor: 'var(--status-red-text)' }}>
                  Scarta
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
