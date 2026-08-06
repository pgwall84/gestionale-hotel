'use client';

// Pagina Dettaglio Cliente — completa il Modulo 2.1, Fase 2A.
// Consuma GET/PATCH /api/ospiti/:id (già esistenti) + POST .../svela-documento.
// GDPR: il documento resta mascherato (documento_mascherato dal backend)
// finché non si preme esplicitamente "Svela documento" — azione loggata in
// audit_log lato backend ad ogni click, anche se il campo è vuoto. Non
// salvare mai il documento in chiaro in uno stato persistente più a lungo
// del necessario: resta in memoria solo finché si sta sulla pagina.

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import DataTable from '@/components/ui/DataTable';
import SelettoreCodiceAlloggiati from '@/components/ui/SelettoreCodiceAlloggiati';
import SelettoreProvincia from '@/components/ui/SelettoreProvincia';
import ScannerDocumento from '@/components/ui/ScannerDocumento';
import CampoData, { ANNO_CORRENTE } from '@/components/ui/CampoData';
import { ArrowLeft, Eye, Users, X, Search } from 'lucide-react';

const RUOLI_LETTURA = ['admin', 'titolare', 'receptionist', 'portiere_notte'];
const RUOLI_SCRITTURA = ['admin', 'titolare', 'receptionist'];
const RUOLI_SVELA = ['admin', 'titolare', 'receptionist'];

// Stessa mappa di frontend/app/clienti/page.jsx (Nuovo cliente) — solo un
// punto di partenza leggibile dopo la scansione, mai un codice ufficiale
// abbinato. Duplicata invece di condivisa: sono due file piccoli e separati,
// non vale la pena di un modulo condiviso per 12 righe.
const NAZIONALITA_ICAO = {
  ITA: 'Italia', FRA: 'Francia', DEU: 'Germania', GBR: 'Regno Unito',
  USA: 'Stati Uniti', CHE: 'Svizzera', ESP: 'Spagna', NLD: 'Paesi Bassi',
  BEL: 'Belgio', AUT: 'Austria', PRT: 'Portogallo', POL: 'Polonia',
};

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

export default function PaginaDettaglioCliente() {
  const { id } = useParams();
  const { utente, loading } = useAuth();
  const router = useRouter();
  const puoScrivere = utente && RUOLI_SCRITTURA.includes(utente.ruolo);
  const puoSvelare = utente && RUOLI_SVELA.includes(utente.ruolo);

  const [cliente, setCliente] = useState(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [successo, setSuccesso] = useState('');
  const [modifica, setModifica] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [documentoSvelato, setDocumentoSvelato] = useState(null); // null finché non si preme il pulsante

  // Nucleo familiare (modulo 5.2 Fase B, estensione 04/08/2026)
  const [nucleo, setNucleo] = useState(null);
  const [etichettaNucleo, setEtichettaNucleo] = useState('');
  const [ricercaNucleo, setRicercaNucleo] = useState('');
  const [risultatiRicercaNucleo, setRisultatiRicercaNucleo] = useState([]);

  // Campi form modifica
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [sesso, setSesso] = useState('');
  const [dataNascita, setDataNascita] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [note, setNote] = useState('');

  // Documento/nazionalità (modulo 2.5) — testo + codice abbinato (vedi
  // commento in testa a SelettoreCodiceAlloggiati.jsx).
  const [statoNascitaTesto, setStatoNascitaTesto] = useState('');
  const [statoNascitaCodice, setStatoNascitaCodice] = useState(null);
  const [comuneNascitaTesto, setComuneNascitaTesto] = useState('');
  const [comuneNascitaCodice, setComuneNascitaCodice] = useState(null);
  const [provinciaNascita, setProvinciaNascita] = useState('');
  const [cittadinanzaTesto, setCittadinanzaTesto] = useState('');
  const [cittadinanzaCodice, setCittadinanzaCodice] = useState(null);
  const [documentoTipoTesto, setDocumentoTipoTesto] = useState('');
  const [documentoTipoCodice, setDocumentoTipoCodice] = useState(null);
  const [luogoRilascioTesto, setLuogoRilascioTesto] = useState('');
  const [luogoRilascioCodice, setLuogoRilascioCodice] = useState(null);
  // Scrittura sola andata: la GET non restituisce mai il numero documento in
  // chiaro (solo documento_mascherato/svela-documento), quindi il campo
  // parte sempre vuoto in modifica — se lasciato vuoto il backend mantiene
  // il valore esistente (COALESCE), se compilato lo sovrascrive.
  const [documentoNumero, setDocumentoNumero] = useState('');
  // Scadenza (modulo 5.2): questa invece la GET la restituisce sempre (non è
  // sensibile come il numero) — precompilata da caricaCliente come gli altri campi.
  const [documentoScadenza, setDocumentoScadenza] = useState('');

  // Residenza (modulo 2.6 — Export ROSS1000, 04/08/2026): diversa dal luogo
  // di nascita sopra, obbligatoria per la statistica turistica regionale.
  const [statoResidenzaTesto, setStatoResidenzaTesto] = useState('');
  const [statoResidenzaCodice, setStatoResidenzaCodice] = useState(null);
  const [comuneResidenzaTesto, setComuneResidenzaTesto] = useState('');
  const [comuneResidenzaCodice, setComuneResidenzaCodice] = useState(null);

  // Precompila dai dati letti dalla zona MRZ (modulo 5.2, Fase A) — non
  // sovrascrive mai un campo già valorizzato, solo quelli ancora vuoti.
  function applicaDatiOcr(dati) {
    if (dati.nome && !nome) setNome(dati.nome);
    if (dati.cognome && !cognome) setCognome(dati.cognome);
    if (dati.dataNascita && !dataNascita) setDataNascita(dati.dataNascita);
    if (dati.sesso && !sesso) setSesso(dati.sesso);
    if (dati.documentoNumero && !documentoNumero) setDocumentoNumero(dati.documentoNumero);
    if (dati.documentoScadenza && !documentoScadenza) setDocumentoScadenza(dati.documentoScadenza);
    if (dati.nazionalita && !cittadinanzaTesto) {
      setCittadinanzaTesto(NAZIONALITA_ICAO[dati.nazionalita] || dati.nazionalita);
      setCittadinanzaCodice(null);
    }
  }

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_LETTURA.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const caricaCliente = useCallback(async () => {
    setCaricamento(true);
    try {
      const res = await api.get(`/ospiti/${id}`);
      setCliente(res.data);
      setNome(res.data.nome);
      setCognome(res.data.cognome);
      setSesso(res.data.sesso || '');
      setDataNascita(res.data.data_nascita ? res.data.data_nascita.slice(0, 10) : '');
      setEmail(res.data.email || '');
      setTelefono(res.data.telefono || '');
      setNote(res.data.note || '');
      setStatoNascitaTesto(res.data.stato_nascita_testo || '');
      setStatoNascitaCodice(res.data.stato_nascita_codice || null);
      setComuneNascitaTesto(res.data.comune_nascita_testo || '');
      setComuneNascitaCodice(res.data.comune_nascita_codice || null);
      setProvinciaNascita(res.data.provincia_nascita || '');
      setCittadinanzaTesto(res.data.cittadinanza_testo || '');
      setCittadinanzaCodice(res.data.cittadinanza_codice || null);
      setDocumentoTipoTesto(res.data.documento_tipo_testo || '');
      setDocumentoTipoCodice(res.data.documento_tipo_codice || null);
      setLuogoRilascioTesto(res.data.luogo_rilascio_testo || '');
      setLuogoRilascioCodice(res.data.luogo_rilascio_codice || null);
      setDocumentoScadenza(res.data.documento_scadenza ? res.data.documento_scadenza.slice(0, 10) : '');
      setStatoResidenzaTesto(res.data.stato_residenza_testo || '');
      setStatoResidenzaCodice(res.data.stato_residenza_codice || null);
      setComuneResidenzaTesto(res.data.comune_residenza_testo || '');
      setComuneResidenzaCodice(res.data.comune_residenza_codice || null);
      if (res.data.nucleo_familiare_id) {
        caricaNucleo(res.data.nucleo_familiare_id);
      } else {
        setNucleo(null);
      }
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento del cliente.');
    } finally {
      setCaricamento(false);
    }
  }, [id]);

  async function caricaNucleo(nucleoId) {
    try {
      const res = await api.get(`/nuclei-familiari/${nucleoId}`);
      setNucleo(res.data);
      setEtichettaNucleo(res.data.etichetta || '');
    } catch {
      setNucleo(null);
    }
  }

  useEffect(() => {
    if (utente && RUOLI_LETTURA.includes(utente.ruolo)) caricaCliente();
  }, [utente, caricaCliente]);

  // Ricerca cliente da collegare al nucleo familiare (debounce leggero)
  useEffect(() => {
    if (!ricercaNucleo.trim()) { setRisultatiRicercaNucleo([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/ospiti?search=${encodeURIComponent(ricercaNucleo)}`);
        setRisultatiRicercaNucleo(res.data.filter(c => String(c.id) !== String(id)));
      } catch { setRisultatiRicercaNucleo([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [ricercaNucleo, id]);

  // Collega questo cliente al nucleo familiare di un altro (esistente o da
  // creare al volo se l'altro cliente non ne ha ancora uno).
  async function collegaANucleoDi(altroCliente) {
    setErrore('');
    try {
      let nucleoId = altroCliente.nucleo_familiare_id;
      if (!nucleoId) {
        const nuovo = await api.post('/nuclei-familiari', {});
        nucleoId = nuovo.data.id;
        await api.post(`/ospiti/${altroCliente.id}/nucleo`, { nucleo_familiare_id: nucleoId });
      }
      await api.post(`/ospiti/${id}/nucleo`, { nucleo_familiare_id: nucleoId });
      setRicercaNucleo('');
      setRisultatiRicercaNucleo([]);
      caricaCliente();
    } catch (err) {
      setErrore(err.message || 'Errore nel collegamento al nucleo.');
    }
  }

  async function scollegaDaNucleo() {
    setErrore('');
    try {
      await api.post(`/ospiti/${id}/nucleo`, { nucleo_familiare_id: null });
      setNucleo(null);
      caricaCliente();
    } catch (err) {
      setErrore(err.message || 'Errore nello scollegamento.');
    }
  }

  async function salvaEtichettaNucleo() {
    if (!nucleo) return;
    setErrore('');
    try {
      const res = await api.patch(`/nuclei-familiari/${nucleo.id}`, { etichetta: etichettaNucleo || null });
      setNucleo(n => ({ ...n, etichetta: res.data.etichetta }));
    } catch (err) {
      setErrore(err.message || "Errore nel salvataggio dell'etichetta.");
    }
  }

  async function salvaModifiche() {
    setSalvataggio(true);
    setErrore('');
    try {
      await api.patch(`/ospiti/${id}`, {
        nome, cognome,
        sesso: sesso || null,
        data_nascita: dataNascita || null,
        email: email || null,
        telefono: telefono || null,
        note: note || null,
        stato_nascita_testo: statoNascitaTesto || null,
        stato_nascita_codice: statoNascitaCodice,
        comune_nascita_testo: comuneNascitaTesto || null,
        comune_nascita_codice: comuneNascitaCodice,
        provincia_nascita: provinciaNascita || null,
        cittadinanza_testo: cittadinanzaTesto || null,
        cittadinanza_codice: cittadinanzaCodice,
        documento_tipo_testo: documentoTipoTesto || null,
        documento_tipo_codice: documentoTipoCodice,
        documento_numero: documentoNumero || null,
        documento_scadenza: documentoScadenza || null,
        luogo_rilascio_testo: luogoRilascioTesto || null,
        luogo_rilascio_codice: luogoRilascioCodice,
        stato_residenza_testo: statoResidenzaTesto || null,
        stato_residenza_codice: statoResidenzaCodice,
        comune_residenza_testo: comuneResidenzaTesto || null,
        comune_residenza_codice: comuneResidenzaCodice,
      });
      setModifica(false);
      setDocumentoNumero('');
      setSuccesso('Dati cliente aggiornati.');
      caricaCliente();
    } catch (err) {
      setErrore(err.message || 'Errore nel salvataggio.');
    } finally {
      setSalvataggio(false);
    }
  }

  async function toggleConsenso() {
    setErrore('');
    try {
      await api.patch(`/ospiti/${id}`, { consenso_marketing: !cliente.consenso_marketing });
      caricaCliente();
    } catch (err) {
      setErrore(err.message || 'Errore nell\'aggiornamento del consenso.');
    }
  }

  async function svelaDocumento() {
    setErrore('');
    try {
      const res = await api.post(`/ospiti/${id}/svela-documento`);
      setDocumentoSvelato(res.data);
    } catch (err) {
      setErrore(err.message || 'Errore nella richiesta del documento.');
    }
  }

  if (loading || !utente || caricamento) {
    return (
      <AppShell titolo="Cliente">
        <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      </AppShell>
    );
  }

  if (!cliente) {
    return (
      <AppShell titolo="Cliente">
        <div className="px-3 py-2.5 rounded-lg text-[13px]" style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore || 'Cliente non trovato.'}
        </div>
      </AppShell>
    );
  }

  const totaleSpeso = (cliente.storico_soggiorni || [])
    .filter(s => !s.cancellato)
    .reduce((tot, s) => tot + (Number(s.tariffa_totale) || 0), 0);

  const colonneSoggiorni = [
    { header: 'Camera', accessor: s => s.camera_numero || s.camera_nome },
    { header: 'Arrivo', accessor: s => s.data_arrivo },
    { header: 'Partenza', accessor: s => s.data_partenza },
    { header: 'Ospiti', accessor: s => s.num_ospiti },
    { header: 'Tariffa', accessor: s => (s.tariffa_totale != null ? `€${Number(s.tariffa_totale).toFixed(2)}` : '—') },
    { header: 'Stato prenotazione', accessor: s => s.prenotazione_stato },
  ];

  return (
    <AppShell titolo={`${cliente.cognome} ${cliente.nome}`}>
      <button onClick={() => router.push('/clienti')}
              className="flex items-center gap-1 text-xs font-medium mb-4"
              style={{ color: 'var(--muted-foreground)' }}>
        <ArrowLeft size={14} /> Torna ai clienti
      </button>

      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4" style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}
      {successo && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4" style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
          {successo}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Anagrafica */}
        <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Anagrafica</h3>
            {puoScrivere && !modifica && (
              <button onClick={() => setModifica(true)} className="text-xs font-medium" style={{ color: 'var(--hotel-amber-dark)' }}>Modifica</button>
            )}
          </div>

          {!modifica ? (
            <div className="space-y-1.5 text-sm" style={{ color: 'var(--foreground)' }}>
              <p><span style={{ color: 'var(--muted-foreground)' }}>Sesso:</span> {cliente.sesso || '—'}</p>
              <p><span style={{ color: 'var(--muted-foreground)' }}>Data di nascita:</span> {cliente.data_nascita || '—'}</p>
              <p><span style={{ color: 'var(--muted-foreground)' }}>Email:</span> {cliente.email || '—'}</p>
              <p><span style={{ color: 'var(--muted-foreground)' }}>Telefono:</span> {cliente.telefono || '—'}</p>
              <p><span style={{ color: 'var(--muted-foreground)' }}>Note:</span> {cliente.note || '—'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Nome" value={nome} onChange={e => setNome(e.target.value)} className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                <input placeholder="Cognome" value={cognome} onChange={e => setCognome(e.target.value)} className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                <select value={sesso} onChange={e => setSesso(e.target.value)} className="px-3 rounded-lg text-sm outline-none" style={inputStyle}>
                  <option value="">Sesso</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
                <CampoData value={dataNascita} onChange={v => setDataNascita(v)} minAnno={ANNO_CORRENTE - 110} maxAnno={ANNO_CORRENTE} className="px-3" style={inputStyle} />
                <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                <input placeholder="Telefono" value={telefono} onChange={e => setTelefono(e.target.value)} className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <input placeholder="Note" value={note} onChange={e => setNote(e.target.value)} className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />
              <div className="flex gap-2">
                <button onClick={salvaModifiche} disabled={salvataggio}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60" style={{ background: 'var(--hotel-navy)' }}>
                  {salvataggio ? 'Salvataggio...' : 'Salva'}
                </button>
                <button onClick={() => setModifica(false)} className="text-xs font-medium px-3 py-1.5 rounded-lg border">Annulla</button>
              </div>
            </div>
          )}
        </div>

        {/* Documento + marketing */}
        <div className="rounded-xl p-4 flex flex-col gap-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground)' }}>Documento</h3>
            {!documentoSvelato ? (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--foreground)' }}>{cliente.documento_mascherato || 'Non registrato'}</span>
                {puoSvelare && cliente.documento_mascherato && (
                  <button onClick={svelaDocumento} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--hotel-amber-dark)' }}>
                    <Eye size={13} /> Svela
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--foreground)' }}>
                {documentoSvelato.documento_tipo_codice || '—'} · {documentoSvelato.documento_numero || '—'}
              </p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground)' }}>Marketing</h3>
            <div className="flex items-center justify-between">
              <span className="text-[11px] px-1.5 py-0.5 rounded"
                    style={{
                      background: cliente.consenso_marketing ? 'var(--status-green-bg)' : 'var(--background)',
                      color: cliente.consenso_marketing ? 'var(--status-green-text)' : 'var(--muted-foreground)',
                    }}>
                {cliente.consenso_marketing ? 'Consenso dato' : 'Nessun consenso'}
              </span>
              {puoScrivere && (
                <button onClick={toggleConsenso} className="text-xs font-medium" style={{ color: 'var(--hotel-amber-dark)' }}>
                  {cliente.consenso_marketing ? 'Revoca' : 'Registra consenso'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Documento e nazionalità — testo libero + codice ufficiale abbinato, modulo 2.5 */}
      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--foreground)' }}>Documento e nazionalità</h3>
        <p className="text-[11px] mb-3" style={{ color: 'var(--muted-foreground)' }}>
          Testo libero — scrivi leggendo il documento del cliente. Se le tabelle Alloggiati Web sono
          sincronizzate (Impostazioni ▸ Alloggiati Web) e il testo corrisponde a un suggerimento, selezionalo:
          abbina anche il codice ufficiale (✓), necessario solo per l'invio della schedina più avanti.
        </p>

        {!modifica ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-1.5 text-sm" style={{ color: 'var(--foreground)' }}>
            <p><span className="font-medium">Stato di nascita:</span> {cliente.stato_nascita_testo || '—'}</p>
            <p><span className="font-medium">Comune di nascita:</span> {cliente.comune_nascita_testo || '—'}</p>
            <p><span className="font-medium">Provincia:</span> {cliente.provincia_nascita || '—'}</p>
            <p><span className="font-medium">Cittadinanza:</span> {cliente.cittadinanza_testo || '—'}</p>
            <p><span className="font-medium">Tipo documento:</span> {cliente.documento_tipo_testo || '—'}</p>
            <p><span className="font-medium">Luogo di rilascio:</span> {cliente.luogo_rilascio_testo || '—'}</p>
            <p><span className="font-medium">Scadenza documento:</span> {cliente.documento_scadenza || '—'}</p>
            <p><span className="font-medium">Stato di residenza:</span> {cliente.stato_residenza_testo || '—'}</p>
            <p><span className="font-medium">Comune di residenza:</span> {cliente.comune_residenza_testo || '—'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <ScannerDocumento onDatiEstratti={applicaDatiOcr} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Stato di nascita</label>
                <SelettoreCodiceAlloggiati tabella="Luoghi" testo={statoNascitaTesto} codice={statoNascitaCodice}
                  onCambiamento={(t, c) => { setStatoNascitaTesto(t); setStatoNascitaCodice(c); }} placeholder="Es. Italia" />
              </div>
              <div>
                <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Comune di nascita</label>
                <SelettoreCodiceAlloggiati tabella="Luoghi" testo={comuneNascitaTesto} codice={comuneNascitaCodice}
                  onCambiamento={(t, c) => { setComuneNascitaTesto(t); setComuneNascitaCodice(c); }} placeholder="Es. Lerici" />
              </div>
              <div>
                <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Provincia</label>
                <SelettoreProvincia valore={provinciaNascita} onCambiamento={setProvinciaNascita} placeholder="Es. SP" />
              </div>
              <div>
                <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Cittadinanza</label>
                <SelettoreCodiceAlloggiati tabella="Luoghi" testo={cittadinanzaTesto} codice={cittadinanzaCodice}
                  onCambiamento={(t, c) => { setCittadinanzaTesto(t); setCittadinanzaCodice(c); }} placeholder="Es. Italiana" />
              </div>
              <div>
                <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Tipo documento</label>
                <SelettoreCodiceAlloggiati tabella="Tipi_Documento" testo={documentoTipoTesto} codice={documentoTipoCodice}
                  onCambiamento={(t, c) => { setDocumentoTipoTesto(t); setDocumentoTipoCodice(c); }} placeholder="Es. Carta d'identità" />
              </div>
              <div>
                <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Luogo di rilascio</label>
                <SelettoreCodiceAlloggiati tabella="Luoghi" testo={luogoRilascioTesto} codice={luogoRilascioCodice}
                  onCambiamento={(t, c) => { setLuogoRilascioTesto(t); setLuogoRilascioCodice(c); }} placeholder="Es. Lerici" />
              </div>
              <div>
                <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Numero documento</label>
                <input value={documentoNumero} onChange={e => setDocumentoNumero(e.target.value)}
                       placeholder={cliente.documento_mascherato ? 'Lascia vuoto per non modificare' : 'Numero documento'}
                       className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Scadenza documento</label>
                <CampoData value={documentoScadenza} onChange={v => setDocumentoScadenza(v)}
                       minAnno={ANNO_CORRENTE - 1} maxAnno={ANNO_CORRENTE + 11}
                       className="px-3" style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Stato di residenza</label>
                <SelettoreCodiceAlloggiati tabella="Luoghi" testo={statoResidenzaTesto} codice={statoResidenzaCodice}
                  onCambiamento={(t, c) => { setStatoResidenzaTesto(t); setStatoResidenzaCodice(c); }} placeholder="Es. Italia" />
              </div>
              <div>
                <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Comune di residenza</label>
                <SelettoreCodiceAlloggiati tabella="Luoghi" testo={comuneResidenzaTesto} codice={comuneResidenzaCodice}
                  onCambiamento={(t, c) => { setComuneResidenzaTesto(t); setComuneResidenzaCodice(c); }} placeholder="Es. Lerici" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nucleo familiare (modulo 5.2 Fase B, estensione 04/08/2026) */}
      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
          <Users size={14} /> Nucleo familiare
        </h3>
        {nucleo ? (
          <div className="space-y-2">
            {puoScrivere ? (
              <div className="flex items-center gap-2">
                <input value={etichettaNucleo} onChange={e => setEtichettaNucleo(e.target.value)}
                       placeholder="Etichetta (es. Famiglia Rossi)"
                       className="flex-1 px-3 rounded-lg text-sm outline-none" style={inputStyle} />
                <button onClick={salvaEtichettaNucleo} className="text-xs font-medium px-3 py-2 rounded-lg border">Salva</button>
              </div>
            ) : (
              <p className="text-sm">{nucleo.etichetta || 'Nessuna etichetta'}</p>
            )}
            <div className="space-y-1">
              {nucleo.membri.filter(m => String(m.id) !== String(id)).map(m => (
                <button key={m.id} onClick={() => router.push(`/clienti/${m.id}`)}
                        className="block text-xs px-2 py-1.5 rounded-lg w-full text-left"
                        style={{ background: 'var(--background)' }}>
                  {m.cognome} {m.nome}
                </button>
              ))}
              {nucleo.membri.filter(m => String(m.id) !== String(id)).length === 0 && (
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Nessun altro membro collegato.</p>
              )}
            </div>
            {puoScrivere && (
              <button onClick={scollegaDaNucleo} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--status-red-text)' }}>
                <X size={12} /> Rimuovi dal nucleo
              </button>
            )}
          </div>
        ) : puoScrivere ? (
          <div className="space-y-1.5">
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Non collegato a nessun nucleo. Cerca un altro cliente per collegarli insieme (es. componenti della stessa famiglia).
            </p>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
              <input placeholder="Cerca cliente..." value={ricercaNucleo} onChange={e => setRicercaNucleo(e.target.value)}
                     className="w-full pl-8 pr-3 rounded-lg text-sm outline-none" style={inputStyle} />
            </div>
            {risultatiRicercaNucleo.length > 0 && (
              <div className="rounded-lg border max-h-32 overflow-y-auto">
                {risultatiRicercaNucleo.map(c => (
                  <button key={c.id} onClick={() => collegaANucleoDi(c)}
                          className="w-full text-left px-2 py-1.5 text-xs border-b last:border-b-0">
                    {c.cognome} {c.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Non collegato a nessun nucleo.</p>
        )}
      </div>

      {/* Storico soggiorni */}
      <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Storico soggiorni</h3>
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Totale speso: €{totaleSpeso.toFixed(2)}</span>
        </div>
        <DataTable colonne={colonneSoggiorni} dati={cliente.storico_soggiorni || []} emptyText="Nessun soggiorno registrato." />
      </div>
    </AppShell>
  );
}
