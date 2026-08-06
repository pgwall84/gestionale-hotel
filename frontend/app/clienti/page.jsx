'use client';

// Pagina Clienti — completa il Modulo 2.1 (Anagrafica ospiti), Fase 2A.
// Il backend /api/ospiti esiste dalla migration 016 (autocomplete "Nuova
// prenotazione") ma non aveva mai avuto una UI di consultazione propria —
// questa pagina è quella UI, non introduce nuovi dati né nuovi permessi
// (riusa shared/ruoli.js sezione 'ospiti', invariata).
// GDPR: documento_numero non compare mai qui — la lista/dettaglio usano
// sempre documento_mascherato (vedi backend/controllers/anagraficaOspitiController.js,
// costante DOC_MASCHERATO); solo il pulsante "Svela documento" nella pagina
// di dettaglio lo rivela, con audit log obbligatorio lato backend.
// Campi documento/nazionalità (modulo 2.5): sempre testo libero (colonne
// *_testo, migration 023) — la reception li scrive leggendo il documento
// fisico del cliente, indipendentemente da Alloggiati Web. Se le tabelle di
// codifica sono state sincronizzate (Impostazioni ▸ Alloggiati Web) e il
// testo corrisponde a un suggerimento, selezionandolo si abbina anche il
// codice ufficiale (colonne *_codice, migration 016) — serve solo più avanti
// per l'invio della schedina (Fase 2), mai per registrare l'ospite oggi.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import DataTable from '@/components/ui/DataTable';
import SelettoreCodiceAlloggiati from '@/components/ui/SelettoreCodiceAlloggiati';
import SelettoreProvincia from '@/components/ui/SelettoreProvincia';
import ScannerDocumento from '@/components/ui/ScannerDocumento';
import CampoData, { ANNO_CORRENTE } from '@/components/ui/CampoData';
import { Search, Plus } from 'lucide-react';

// ICAO alpha-3 → testo leggibile, solo per i casi più comuni tra gli ospiti
// dell'hotel — riempie il campo cittadinanza con un punto di partenza dopo
// la scansione, MAI un codice ufficiale abbinato (l'operatore seleziona
// comunque il suggerimento giusto dalla tendina se serve per la schedina).
// Non esaustivo per design: per le altre nazionalità resta il codice ICAO
// grezzo, comunque meglio di niente e sempre modificabile.
const NAZIONALITA_ICAO = {
  ITA: 'Italia', FRA: 'Francia', DEU: 'Germania', GBR: 'Regno Unito',
  USA: 'Stati Uniti', CHE: 'Svizzera', ESP: 'Spagna', NLD: 'Paesi Bassi',
  BEL: 'Belgio', AUT: 'Austria', PRT: 'Portogallo', POL: 'Polonia',
};

const RUOLI_LETTURA = ['admin', 'titolare', 'receptionist', 'portiere_notte'];
const RUOLI_SCRITTURA = ['admin', 'titolare', 'receptionist'];

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

export default function PaginaClienti() {
  const { utente, loading } = useAuth();
  const router = useRouter();
  const puoScrivere = utente && RUOLI_SCRITTURA.includes(utente.ruolo);

  const [search, setSearch] = useState('');
  const [clienti, setClienti] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [formAperto, setFormAperto] = useState(false);

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_LETTURA.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const caricaClienti = useCallback(async (termine) => {
    setCaricamento(true);
    try {
      const res = await api.get(`/ospiti${termine ? `?search=${encodeURIComponent(termine)}` : ''}`);
      setClienti(res.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento dei clienti.');
    } finally {
      setCaricamento(false);
    }
  }, []);

  // Debounce leggero sulla ricerca — evita una chiamata ad ogni tasto premuto.
  useEffect(() => {
    if (!utente || !RUOLI_LETTURA.includes(utente.ruolo)) return;
    const timer = setTimeout(() => caricaClienti(search), 300);
    return () => clearTimeout(timer);
  }, [search, utente, caricaClienti]);

  if (loading || !utente) return null;

  const colonne = [
    { header: 'Cliente', accessor: c => `${c.cognome} ${c.nome}` },
    { header: 'Email', accessor: c => c.email || '—' },
    { header: 'Telefono', accessor: c => c.telefono || '—' },
    { header: 'Soggiorni', accessor: c => c.numero_soggiorni },
    {
      header: 'Marketing',
      accessor: c => (
        <span className="text-[11px] px-1.5 py-0.5 rounded"
              style={{
                background: c.consenso_marketing ? 'var(--status-green-bg)' : 'var(--background)',
                color: c.consenso_marketing ? 'var(--status-green-text)' : 'var(--muted-foreground)',
              }}>
          {c.consenso_marketing ? 'Consenso dato' : 'Nessun consenso'}
        </span>
      ),
    },
  ];

  return (
    <AppShell titolo="Clienti">
      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
          <input
            placeholder="Cerca per nome o cognome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </div>
        {puoScrivere && (
          <button onClick={() => setFormAperto(true)}
                  className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg text-white shrink-0"
                  style={{ background: 'var(--hotel-amber)', height: '38px' }}>
            <Plus size={13} /> Nuovo cliente
          </button>
        )}
      </div>

      {formAperto && (
        <NuovoCliente
          onChiudi={() => setFormAperto(false)}
          onCreato={() => { setFormAperto(false); caricaClienti(search); }}
          onErrore={setErrore}
        />
      )}

      <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        {caricamento ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : (
          <DataTable
            colonne={colonne}
            dati={clienti}
            onRowClick={c => router.push(`/clienti/${c.id}`)}
            emptyText={search ? 'Nessun cliente trovato.' : 'Nessun cliente in anagrafica.'}
          />
        )}
      </div>
    </AppShell>
  );
}

// ── Form nuovo cliente ────────────────────────────────────────────────────
// Solo i campi già utilizzabili senza le tabelle di codifica ufficiali
// (arrivano col modulo 2.5) — niente nazionalità/documento qui, per non far
// inserire codici a mano che il sistema Alloggiati Web rifiuterebbe.

function NuovoCliente({ onChiudi, onCreato, onErrore }) {
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [sesso, setSesso] = useState('');
  const [dataNascita, setDataNascita] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [note, setNote] = useState('');
  const [consensoMarketing, setConsensoMarketing] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);

  // Documento/nazionalità (modulo 2.5) — testo + codice abbinato (vedi
  // commento in testa al file e in SelettoreCodiceAlloggiati.jsx).
  const [statoNascitaTesto, setStatoNascitaTesto] = useState('');
  const [statoNascitaCodice, setStatoNascitaCodice] = useState(null);
  const [comuneNascitaTesto, setComuneNascitaTesto] = useState('');
  const [comuneNascitaCodice, setComuneNascitaCodice] = useState(null);
  const [provinciaNascita, setProvinciaNascita] = useState('');
  const [cittadinanzaTesto, setCittadinanzaTesto] = useState('');
  const [cittadinanzaCodice, setCittadinanzaCodice] = useState(null);
  const [documentoTipoTesto, setDocumentoTipoTesto] = useState('');
  const [documentoTipoCodice, setDocumentoTipoCodice] = useState(null);
  const [documentoNumero, setDocumentoNumero] = useState('');
  const [documentoScadenza, setDocumentoScadenza] = useState('');
  const [luogoRilascioTesto, setLuogoRilascioTesto] = useState('');
  const [luogoRilascioCodice, setLuogoRilascioCodice] = useState(null);

  // Residenza (modulo 2.6 — Export ROSS1000, 04/08/2026): diversa dal luogo
  // di nascita sopra, obbligatoria per la statistica turistica regionale.
  const [statoResidenzaTesto, setStatoResidenzaTesto] = useState('');
  const [statoResidenzaCodice, setStatoResidenzaCodice] = useState(null);
  const [comuneResidenzaTesto, setComuneResidenzaTesto] = useState('');
  const [comuneResidenzaCodice, setComuneResidenzaCodice] = useState(null);

  // Precompila dai dati letti dalla zona MRZ (modulo 5.2, Fase A) — non
  // sovrascrive mai un campo già valorizzato a mano dall'operatore, solo
  // quelli ancora vuoti. La cittadinanza va SEMPRE a testo libero (mai un
  // codice abbinato dall'OCR): il codice ufficiale si sceglie dalla tendina.
  function applicaDatiOcr(dati) {
    if (dati.nome && !nome) setNome(dati.nome);
    if (dati.cognome && !cognome) setCognome(dati.cognome);
    if (dati.dataNascita && !dataNascita) setDataNascita(dati.dataNascita);
    if (dati.sesso && !sesso) setSesso(dati.sesso);
    if (dati.documentoNumero && !documentoNumero) setDocumentoNumero(dati.documentoNumero);
    if (dati.documentoScadenza && !documentoScadenza) setDocumentoScadenza(dati.documentoScadenza);
    if (dati.nazionalita && !cittadinanzaTesto) {
      setCittadinanzaTesto(NAZIONALITA_ICAO[dati.nazionalita] || dati.nazionalita);
      setCittadinanzaCodice(null); // testo di partenza, non un codice ufficiale abbinato
    }
  }

  async function salva() {
    if (!nome || !cognome) {
      onErrore('Nome e cognome sono obbligatori.');
      return;
    }
    setSalvataggio(true);
    onErrore('');
    try {
      await api.post('/ospiti', {
        nome, cognome,
        sesso: sesso || null,
        data_nascita: dataNascita || null,
        email: email || null,
        telefono: telefono || null,
        note: note || null,
        consenso_marketing: consensoMarketing,
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
      onCreato();
    } catch (err) {
      onErrore(err.message || 'Errore nella creazione del cliente.');
    } finally {
      setSalvataggio(false);
    }
  }

  return (
    <div className="mb-4 p-4 rounded-xl space-y-2" style={{ background: 'var(--card)', border: '1px solid var(--hotel-amber)' }}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Nuovo cliente</h3>
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Nome" value={nome} onChange={e => setNome(e.target.value)}
               className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
        <input placeholder="Cognome" value={cognome} onChange={e => setCognome(e.target.value)}
               className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
        <select value={sesso} onChange={e => setSesso(e.target.value)}
                className="px-3 rounded-lg text-sm outline-none" style={inputStyle}>
          <option value="">Sesso (opzionale)</option>
          <option value="M">M</option>
          <option value="F">F</option>
        </select>
        <CampoData value={dataNascita} onChange={v => setDataNascita(v)}
               minAnno={ANNO_CORRENTE - 110} maxAnno={ANNO_CORRENTE}
               className="px-3" style={inputStyle} />
        <input placeholder="Email (opzionale)" value={email} onChange={e => setEmail(e.target.value)}
               className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
        <input placeholder="Telefono (opzionale)" value={telefono} onChange={e => setTelefono(e.target.value)}
               className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
      </div>
      <input placeholder="Note (opzionale)" value={note} onChange={e => setNote(e.target.value)}
             className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />

      <div className="pt-2 mt-1" style={{ borderTop: '0.5px solid var(--border)' }}>
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
          Documento e nazionalità (testo libero, leggi dal documento del cliente — tutti opzionali qui)
        </p>

        <div className="mb-2">
          <ScannerDocumento onDatiEstratti={applicaDatiOcr} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SelettoreCodiceAlloggiati tabella="Luoghi" testo={statoNascitaTesto} codice={statoNascitaCodice}
            onCambiamento={(t, c) => { setStatoNascitaTesto(t); setStatoNascitaCodice(c); }} placeholder="Stato di nascita" />
          <SelettoreCodiceAlloggiati tabella="Luoghi" testo={comuneNascitaTesto} codice={comuneNascitaCodice}
            onCambiamento={(t, c) => { setComuneNascitaTesto(t); setComuneNascitaCodice(c); }} placeholder="Comune di nascita (se Italia)" />
          <SelettoreProvincia valore={provinciaNascita} onCambiamento={setProvinciaNascita}
                               placeholder="Provincia di nascita (sigla, se Italia)" />
          <SelettoreCodiceAlloggiati tabella="Luoghi" testo={cittadinanzaTesto} codice={cittadinanzaCodice}
            onCambiamento={(t, c) => { setCittadinanzaTesto(t); setCittadinanzaCodice(c); }} placeholder="Cittadinanza" />
          <SelettoreCodiceAlloggiati tabella="Tipi_Documento" testo={documentoTipoTesto} codice={documentoTipoCodice}
            onCambiamento={(t, c) => { setDocumentoTipoTesto(t); setDocumentoTipoCodice(c); }} placeholder="Tipo documento" />
          <input placeholder="Numero documento" value={documentoNumero} onChange={e => setDocumentoNumero(e.target.value)}
                 className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Scadenza documento (opzionale)</label>
            <CampoData value={documentoScadenza} onChange={v => setDocumentoScadenza(v)}
                   minAnno={ANNO_CORRENTE - 1} maxAnno={ANNO_CORRENTE + 11}
                   className="px-3" style={inputStyle} />
          </div>
          <SelettoreCodiceAlloggiati tabella="Luoghi" testo={luogoRilascioTesto} codice={luogoRilascioCodice}
            onCambiamento={(t, c) => { setLuogoRilascioTesto(t); setLuogoRilascioCodice(c); }} placeholder="Luogo di rilascio documento" />
          <SelettoreCodiceAlloggiati tabella="Luoghi" testo={statoResidenzaTesto} codice={statoResidenzaCodice}
            onCambiamento={(t, c) => { setStatoResidenzaTesto(t); setStatoResidenzaCodice(c); }} placeholder="Stato di residenza" />
          <SelettoreCodiceAlloggiati tabella="Luoghi" testo={comuneResidenzaTesto} codice={comuneResidenzaCodice}
            onCambiamento={(t, c) => { setComuneResidenzaTesto(t); setComuneResidenzaCodice(c); }} placeholder="Comune di residenza (se Italia)" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--foreground)' }}>
        <input type="checkbox" checked={consensoMarketing} onChange={e => setConsensoMarketing(e.target.checked)} />
        Consenso a ricevere comunicazioni di marketing
      </label>
      <div className="flex gap-2">
        <button onClick={salva} disabled={salvataggio}
                className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                style={{ background: 'var(--hotel-navy)' }}>
          {salvataggio ? 'Salvataggio...' : 'Salva'}
        </button>
        <button onClick={onChiudi} className="text-xs font-medium px-3 py-1.5 rounded-lg border">Annulla</button>
      </div>
    </div>
  );
}
