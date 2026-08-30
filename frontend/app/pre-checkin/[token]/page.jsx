'use client';

// Pagina PUBBLICA — Pre check-in self-service (modulo 5.2 Fase B, 04/08/2026).
// NESSUNA autenticazione: raggiungibile solo con il token nel link mandato
// via email. Niente Sidebar/AppShell — layout minimale, pensato per un
// ospite che apre il link dal telefono da casa.
// I dati inviati NON toccano subito l'anagrafica: restano "in attesa di
// revisione" finché la reception non li applica (vedi /pre-checkin, pagina
// riservata allo staff).
// OCR (Fase A, riusato qui): dietro un flag esplicito, OCR_ATTIVO — i primi
// risultati con operatore in reception erano buoni ma non perfetti; con
// l'ospite da solo, senza nessuno che corregga l'inquadratura, potrebbero
// essere peggiori. Se dopo i primi test reali non convince, si spegne
// cambiando questa unica riga.
// IMPORTANTE: questa pagina funziona solo se il gestionale è raggiungibile
// da internet (1.10 Deploy VPS) — in LAN-only è raggiungibile solo da
// dispositivi sulla stessa rete del PC/server.

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import ScannerDocumento from '@/components/ui/ScannerDocumento';
import SelettoreCodiceAlloggiati from '@/components/ui/SelettoreCodiceAlloggiati';
import SelettoreProvincia from '@/components/ui/SelettoreProvincia';
import CampoData, { ANNO_CORRENTE } from '@/components/ui/CampoData';
import { Loader2, AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';

const OCR_ATTIVO = true;

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

function nuovoOspiteVuoto(soggiornoId) {
  return {
    soggiorno_id: soggiornoId,
    nome: '', cognome: '', sesso: '', data_nascita: '',
    cittadinanza_testo: '', cittadinanza_codice: null,
    documento_tipo_testo: '', documento_tipo_codice: null,
    documento_numero: '',
    documento_scadenza: '', luogo_nascita_testo: '', provincia_nascita: '',
    stato_residenza_testo: '', stato_residenza_codice: null,
    comune_residenza_testo: '', comune_residenza_codice: null,
    // Solo per ospiti oltre il primo (referente principale) — spunta
    // "deriva residenza dal referente principale" (modulo 2.6, 28/08/2026
    // bis). Mai inviata al backend, vedi invia().
    derivaResidenza: false,
  };
}

function formatDataEstesa(data) {
  if (!data) return '';
  const [anno, mese, giorno] = String(data).split('-');
  return `${giorno}/${mese}/${anno}`;
}

export default function PaginaPreCheckinPubblica() {
  const { token } = useParams();
  const [caricamento, setCaricamento] = useState(true);
  const [erroreCaricamento, setErroreCaricamento] = useState(null);
  const [dati, setDati] = useState(null);
  const [ospitiPerSoggiorno, setOspitiPerSoggiorno] = useState({});
  const [noteReferente, setNoteReferente] = useState('');
  const [consenso, setConsenso] = useState(false);
  const [invio, setInvio] = useState(false);
  const [erroreInvio, setErroreInvio] = useState(null);
  const [inviato, setInviato] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.get(`/pre-checkin-pubblico/${token}`)
      .then(res => {
        setDati(res.data);
        const iniziale = {};
        res.data.soggiorni.forEach(s => {
          iniziale[s.id] = Array.from({ length: Math.max(1, s.num_ospiti) }, () => nuovoOspiteVuoto(s.id));
        });
        setOspitiPerSoggiorno(iniziale);
      })
      .catch(err => setErroreCaricamento(err.message || 'Link non valido o scaduto.'))
      .finally(() => setCaricamento(false));
  }, [token]);

  const aggiornaCampo = useCallback((soggiornoId, indice, campo, valore) => {
    setOspitiPerSoggiorno(prev => {
      const lista = [...prev[soggiornoId]];
      lista[indice] = { ...lista[indice], [campo]: valore };
      return { ...prev, [soggiornoId]: lista };
    });
  }, []);

  // Coppia testo+codice per i campi con suggerimenti Alloggiati Web
  // (cittadinanza, tipo documento) — vedi SelettoreCodiceAlloggiati.jsx.
  const aggiornaCoppia = useCallback((soggiornoId, indice, campoTesto, campoCodice, testo, codice) => {
    setOspitiPerSoggiorno(prev => {
      const lista = [...prev[soggiornoId]];
      lista[indice] = { ...lista[indice], [campoTesto]: testo, [campoCodice]: codice };
      return { ...prev, [soggiornoId]: lista };
    });
  }, []);

  function applicaDatiOcr(soggiornoId, indice, datiOcr) {
    const NAZIONALITA_ICAO = { ITA: 'Italia', FRA: 'Francia', DEU: 'Germania', GBR: 'Regno Unito', USA: 'Stati Uniti', CHE: 'Svizzera', ESP: 'Spagna' };
    setOspitiPerSoggiorno(prev => {
      const lista = [...prev[soggiornoId]];
      const attuale = lista[indice];
      lista[indice] = {
        ...attuale,
        nome: attuale.nome || datiOcr.nome || '',
        cognome: attuale.cognome || datiOcr.cognome || '',
        sesso: attuale.sesso || datiOcr.sesso || '',
        data_nascita: attuale.data_nascita || datiOcr.dataNascita || '',
        documento_numero: attuale.documento_numero || datiOcr.documentoNumero || '',
        documento_scadenza: attuale.documento_scadenza || datiOcr.documentoScadenza || '',
        cittadinanza_testo: attuale.cittadinanza_testo || (datiOcr.nazionalita ? (NAZIONALITA_ICAO[datiOcr.nazionalita] || datiOcr.nazionalita) : ''),
      };
      return { ...prev, [soggiornoId]: lista };
    });
  }

  function aggiungiOspite(soggiornoId) {
    setOspitiPerSoggiorno(prev => ({ ...prev, [soggiornoId]: [...prev[soggiornoId], nuovoOspiteVuoto(soggiornoId)] }));
  }

  function rimuoviOspite(soggiornoId, indice) {
    setOspitiPerSoggiorno(prev => {
      const lista = prev[soggiornoId].filter((_, i) => i !== indice);
      return { ...prev, [soggiornoId]: lista.length ? lista : [nuovoOspiteVuoto(soggiornoId)] };
    });
  }

  async function invia() {
    if (!consenso) {
      setErroreInvio("Devi accettare l'informativa privacy per continuare.");
      return;
    }
    // Per ogni camera: se un ospite oltre al primo ha spuntato "deriva
    // residenza dal referente principale", sostituisco i suoi campi di
    // residenza con quelli ATTUALI del referente (indice 0) — copia fatta
    // solo ora, al momento dell'invio, mai un riferimento salvato prima:
    // così è sempre coerente con l'ultimo valore che il referente ha
    // inserito, anche se lo cambia dopo aver spuntato la casella per gli
    // altri.
    const soggiorniConDerivazione = Object.fromEntries(
      Object.entries(ospitiPerSoggiorno).map(([soggiornoId, lista]) => {
        const referente = lista[0];
        return [soggiornoId, lista.map((o, i) => (i > 0 && o.derivaResidenza)
          ? {
              ...o,
              stato_residenza_testo: referente.stato_residenza_testo,
              stato_residenza_codice: referente.stato_residenza_codice,
              comune_residenza_testo: referente.comune_residenza_testo,
              comune_residenza_codice: referente.comune_residenza_codice,
            }
          : o
        )];
      })
    );
    // Niente più filtro silenzioso sulle righe vuote (Marco, 28/08/2026
    // sera): un ospite lasciato incompleto spariva dall'invio senza
    // nessun avviso, e il numero di persone poteva non combaciare con
    // num_ospiti (già noto da prima: prenotazione online o inserito dalla
    // reception per le prenotazioni telefoniche). Ora si blocca con un
    // messaggio chiaro invece di inviare dati silenziosamente incompleti
    // — stesso vincolo che il backend applica comunque come ultima difesa
    // (vedi preCheckinPubblicoController.js).
    for (const s of dati.soggiorni) {
      const lista = soggiorniConDerivazione[s.id] || [];
      if (lista.length !== s.num_ospiti) {
        setErroreInvio(`Camera ${s.camera_numero}: attesi ${s.num_ospiti} ospit${s.num_ospiti === 1 ? 'e' : 'i'}, ${lista.length > s.num_ospiti ? 'ce ne sono di troppo' : 'ne mancano'} — usa "Aggiungi un altro ospite" o il cestino per arrivare al numero giusto.`);
        return;
      }
      const incompleto = lista.find(o => !o.nome.trim() || !o.cognome.trim());
      if (incompleto) {
        setErroreInvio(`Camera ${s.camera_numero}: completa nome e cognome per tutti gli ospiti inseriti (una riga è vuota o incompleta).`);
        return;
      }
    }
    const ospiti = Object.values(soggiorniConDerivazione).flat();
    // Vincolo ISTAT C/59 (Marco, 28/08/2026, ESTESO 28/08/2026 bis): la
    // documentazione RIMOVCLI non prevede eccezioni per familiari/minori
    // (arrivati/partiti/presenti contano ogni persona) — la residenza è
    // richiesta per OGNI ospite inserito, non solo il primo. La spunta
    // "deriva dal referente principale" resta il modo rapido per
    // compilarla per gli altri componenti della camera.
    for (const o of ospiti) {
      if (!o.stato_residenza_codice) {
        setErroreInvio(`Manca lo stato di residenza per ${o.nome} ${o.cognome}.`);
        return;
      }
      if (o.stato_residenza_codice === '100000100' && !o.comune_residenza_codice) {
        setErroreInvio(`Manca il comune di residenza per ${o.nome} ${o.cognome} (residente in Italia).`);
        return;
      }
    }
    setInvio(true);
    setErroreInvio(null);
    try {
      await api.post(`/pre-checkin-pubblico/${token}`, {
        consenso_privacy_accettato: true,
        note_referente: noteReferente || null,
        ospiti: ospiti.map(({ derivaResidenza, ...o }) => ({ ...o, data_nascita: o.data_nascita || null, documento_scadenza: o.documento_scadenza || null })),
      });
      setInviato(true);
    } catch (err) {
      setErroreInvio(err.message || "Errore nell'invio. Riprova tra qualche minuto.");
    } finally {
      setInvio(false);
    }
  }

  if (caricamento) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--muted-foreground)' }} />
      </div>
    );
  }

  if (erroreCaricamento) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-2">
          <AlertTriangle size={28} className="mx-auto" style={{ color: 'var(--status-red-text)' }} />
          <p className="text-sm">{erroreCaricamento}</p>
        </div>
      </div>
    );
  }

  if (dati?.giaInviato || inviato) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-2">
          <CheckCircle2 size={32} style={{ color: 'var(--status-green-text)' }} className="mx-auto" />
          <p className="text-base font-medium">Grazie!</p>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            I dati sono stati ricevuti. La reception li verificherà prima del suo arrivo. A presto!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: 'var(--background)' }}>
      <div className="max-w-lg mx-auto space-y-5">
        <div className="text-center">
          <p className="text-lg font-semibold">{dati.hotel}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Pre check-in online</p>
        </div>

        {erroreInvio && (
          <div className="px-3 py-2.5 rounded-lg text-[13px]" style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
            {erroreInvio}
          </div>
        )}

        {dati.soggiorni.map(s => {
          const listaCamera = ospitiPerSoggiorno[s.id] || [];
          const compilati = listaCamera.filter(o => o.nome.trim() && o.cognome.trim()).length;
          const numeroOk = listaCamera.length === s.num_ospiti;
          return (
          <div key={s.id} className="rounded-xl p-4 space-y-3" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                Camera {s.camera_numero} — dal {formatDataEstesa(s.data_arrivo)} al {formatDataEstesa(s.data_partenza)}
              </p>
              <p className="text-xs font-medium" style={{ color: (numeroOk && compilati === s.num_ospiti) ? 'var(--status-green-text)' : 'var(--status-red-text)' }}>
                {compilati}/{s.num_ospiti} ospiti compilati
              </p>
            </div>

            {ospitiPerSoggiorno[s.id]?.map((ospite, indice) => {
              const referente = ospitiPerSoggiorno[s.id][0];
              const residenzaMostrata = (indice > 0 && ospite.derivaResidenza) ? referente : ospite;
              return (
              <div key={indice} className="rounded-lg p-3 space-y-2" style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                    {indice === 0 ? 'Referente principale' : `Altro ospite ${indice}`}
                  </p>
                  {ospitiPerSoggiorno[s.id].length > 1 && (
                    <button onClick={() => rimuoviOspite(s.id, indice)}><Trash2 size={13} style={{ color: 'var(--status-red-text)' }} /></button>
                  )}
                </div>

                {indice === 0 && OCR_ATTIVO && (
                  <ScannerDocumento onDatiEstratti={d => applicaDatiOcr(s.id, indice, d)} />
                )}

                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Nome" value={ospite.nome} onChange={e => aggiornaCampo(s.id, indice, 'nome', e.target.value)}
                         className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                  <input placeholder="Cognome" value={ospite.cognome} onChange={e => aggiornaCampo(s.id, indice, 'cognome', e.target.value)}
                         className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                  <select value={ospite.sesso} onChange={e => aggiornaCampo(s.id, indice, 'sesso', e.target.value)}
                          className="px-3 rounded-lg text-sm outline-none" style={inputStyle}>
                    <option value="">Sesso</option>
                    <option value="M">M</option>
                    <option value="F">F</option>
                  </select>
                  <CampoData placeholder="Data di nascita" value={ospite.data_nascita}
                         onChange={v => aggiornaCampo(s.id, indice, 'data_nascita', v)}
                         minAnno={ANNO_CORRENTE - 110} maxAnno={ANNO_CORRENTE}
                         className="px-3" style={inputStyle} />
                  <SelettoreCodiceAlloggiati tabella="Luoghi" endpoint="/pre-checkin-pubblico/codici"
                                              testo={ospite.cittadinanza_testo} codice={ospite.cittadinanza_codice}
                                              placeholder="Cittadinanza"
                                              onCambiamento={(t, c) => aggiornaCoppia(s.id, indice, 'cittadinanza_testo', 'cittadinanza_codice', t, c)} />
                  <input placeholder="Luogo di nascita" value={ospite.luogo_nascita_testo}
                         onChange={e => aggiornaCampo(s.id, indice, 'luogo_nascita_testo', e.target.value)}
                         className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                  <SelettoreProvincia valore={ospite.provincia_nascita}
                                       onCambiamento={v => aggiornaCampo(s.id, indice, 'provincia_nascita', v)}
                                       placeholder="Provincia nascita (se Italia)" />
                  {indice === 0 && (
                    <>
                      <SelettoreCodiceAlloggiati tabella="Tipi_Documento" endpoint="/pre-checkin-pubblico/codici"
                                                  testo={ospite.documento_tipo_testo} codice={ospite.documento_tipo_codice}
                                                  placeholder="Tipo documento (es. Carta d'identità)"
                                                  onCambiamento={(t, c) => aggiornaCoppia(s.id, indice, 'documento_tipo_testo', 'documento_tipo_codice', t, c)} />
                      <input placeholder="Numero documento" value={ospite.documento_numero}
                             onChange={e => aggiornaCampo(s.id, indice, 'documento_numero', e.target.value)}
                             className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Scadenza documento</label>
                        <CampoData value={ospite.documento_scadenza}
                               onChange={v => aggiornaCampo(s.id, indice, 'documento_scadenza', v)}
                               minAnno={ANNO_CORRENTE - 1} maxAnno={ANNO_CORRENTE + 11}
                               className="px-3" style={inputStyle} />
                      </div>
                    </>
                  )}
                  <p className="col-span-2 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                    {indice === 0
                      ? 'Stato (ed eventuale comune) di residenza obbligatori.'
                      : 'Stato (ed eventuale comune) di residenza obbligatori anche per questo ospite — puoi derivarli dal referente principale con la spunta qui sotto.'}
                  </p>
                  {indice > 0 && (
                    <label className="col-span-2 flex items-center gap-2 text-xs" style={{ color: 'var(--foreground)' }}>
                      <input type="checkbox" checked={!!ospite.derivaResidenza}
                             onChange={e => aggiornaCampo(s.id, indice, 'derivaResidenza', e.target.checked)} />
                      Deriva residenza dal referente principale
                    </label>
                  )}
                  <SelettoreCodiceAlloggiati tabella="Luoghi" endpoint="/pre-checkin-pubblico/codici"
                                              testo={residenzaMostrata.stato_residenza_testo} codice={residenzaMostrata.stato_residenza_codice}
                                              disabled={indice > 0 && ospite.derivaResidenza}
                                              placeholder="Stato di residenza *"
                                              onCambiamento={(t, c) => aggiornaCoppia(s.id, indice, 'stato_residenza_testo', 'stato_residenza_codice', t, c)} />
                  <SelettoreCodiceAlloggiati tabella="Luoghi" endpoint="/pre-checkin-pubblico/codici"
                                              testo={residenzaMostrata.comune_residenza_testo} codice={residenzaMostrata.comune_residenza_codice}
                                              disabled={indice > 0 && ospite.derivaResidenza}
                                              placeholder="Comune di residenza (se Italia)"
                                              onCambiamento={(t, c) => aggiornaCoppia(s.id, indice, 'comune_residenza_testo', 'comune_residenza_codice', t, c)} />
                </div>
              </div>
              );
            })}


            <button onClick={() => aggiungiOspite(s.id)}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border">
              <Plus size={13} /> Aggiungi un altro ospite per questa camera
            </button>
          </div>
          );
        })}

        <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          <textarea placeholder="Note per la reception (opzionale)" value={noteReferente}
                    onChange={e => setNoteReferente(e.target.value)} rows={3}
                    className="w-full p-3 rounded-lg text-sm outline-none resize-y" style={{ ...inputStyle, height: 'auto' }} />

          <label className="flex items-start gap-2 text-xs" style={{ color: 'var(--foreground)' }}>
            <input type="checkbox" checked={consenso} onChange={e => setConsenso(e.target.checked)} className="mt-0.5" />
            <span>
              Dichiaro di aver letto l'informativa privacy e acconsento al trattamento dei dati forniti ai fini della registrazione del soggiorno,
              come previsto dalla normativa vigente in materia di pubblica sicurezza (TULPS).
            </span>
          </label>

          <button onClick={invia} disabled={invio}
                  className="w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-navy)' }}>
            {invio ? 'Invio in corso...' : 'Invia i miei dati'}
          </button>
        </div>
      </div>
    </div>
  );
}
