// Client SOAP grezzo per WS_ALLOGGIATI (Polizia di Stato) — Modulo 2.5.
// Fase 1b: GenerateToken e Tabella (lettura, nessun invio dati ospite).
// Fase 2 (11/08/2026): aggiunti Authentication_Test (verifica credenziali,
// zero rischio), Test (verifica formato schedina, NESSUNA acquisizione —
// manuale pag. 9) e Send (invio reale, ACQUISISCE le schedine — manuale
// pag. 10). Test/Send hanno risposta annidata (Dettaglio con più
// EsitoOperazioneServizio, uno per riga) — gestita con regex sui blocchi
// ripetuti (vedi estraiBlocchi sotto), ancora nessuna libreria XML nuova:
// i blocchi sono regolari e non annidati tra loro.
//
// Nessuna dipendenza nuova: le richieste sono envelope XML fissi con pochi
// valori interpolati (esempi letterali nel manuale WS_ALLOGGIATI), le
// risposte si analizzano con regex mirate sui tag noti.
//
// ATTENZIONE — assunzione da verificare al primo uso reale: l'header
// Content-Type con il parametro action="AlloggiatiService/<Metodo>" è
// dedotto dalla convenzione SOAP 1.2 e dal namespace xmlns:all="AlloggiatiService"
// visto negli esempi del manuale, ma non è documentato esplicitamente a
// livello HTTP. Se il primo GenerateToken reale fallisce con un errore di
// binding/azione, il WSDL è la fonte autorevole:
// https://alloggiatiweb.poliziadistato.it/service/service.asmx?wsdl

const ENDPOINT = 'https://alloggiatiweb.poliziadistato.it/service/service.asmx';
const NAMESPACE = 'AlloggiatiService';

// Escape dei valori interpolati nell'envelope XML — Utente/Password/WsKey/
// token/tipo sono stringhe semplici, ma si esegue comunque per sicurezza.
function escapeXml(valore) {
  return String(valore ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Decodifica le entità XML più comuni — usata sul contenuto del CSV
// restituito da Tabella, che può contenere questi caratteri nei nomi.
function unescapeXml(valore) {
  return String(valore ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Estrae il contenuto di un tag semplice (non annidato) dalla risposta XML.
// Restituisce null se il tag è assente o self-closing (es. <ErroreDes/>
// quando non c'è errore) — comportamento voluto, non un errore di parsing.
function estraiTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1] : null;
}

// Esegue la chiamata SOAP grezza e restituisce il testo XML della risposta.
async function chiamaSoap(azione, corpoInterno) {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:all="${NAMESPACE}">
  <soap:Header/>
  <soap:Body>
    <all:${azione}>
      ${corpoInterno}
    </all:${azione}>
  </soap:Body>
</soap:Envelope>`;

  const risposta = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': `application/soap+xml; charset=utf-8; action="${NAMESPACE}/${azione}"`,
    },
    body: envelope,
  });

  const testo = await risposta.text();

  if (!risposta.ok) {
    throw new Error(`WS_ALLOGGIATI ha risposto HTTP ${risposta.status}: ${testo.slice(0, 500)}`);
  }
  if (/<(soap:)?Fault[\s>]/i.test(testo)) {
    throw new Error(`WS_ALLOGGIATI ha restituito un Fault SOAP: ${testo.slice(0, 500)}`);
  }
  return testo;
}

// Genera il token di autenticazione temporaneo (GenerateToken).
// Credenziali sempre da backend/.env, mai nel codice (CLAUDE.md Sezione 7).
async function generaToken({ utente, password, wsKey }) {
  const corpo = `
    <all:Utente>${escapeXml(utente)}</all:Utente>
    <all:Password>${escapeXml(password)}</all:Password>
    <all:WsKey>${escapeXml(wsKey)}</all:WsKey>
  `;
  const xml = await chiamaSoap('GenerateToken', corpo);

  const esito = estraiTag(xml, 'esito');
  if (esito !== 'true') {
    const errore = estraiTag(xml, 'ErroreDes') || 'esito negativo senza dettaglio nella risposta';
    throw new Error(`GenerateToken fallito: ${errore}`);
  }
  const token = estraiTag(xml, 'token');
  if (!token) {
    throw new Error('GenerateToken: risposta senza token — formato inatteso, verificare il WSDL');
  }
  return token;
}

// Scarica una tabella di codifica in formato CSV grezzo (';'-separato).
// tipo: 'Luoghi' | 'Tipi_Documento' | 'Tipi_Alloggiato' | 'TipoErrore' | 'ListaAppartamenti'
async function scaricaTabella({ utente, token, tipo }) {
  const corpo = `
    <all:Utente>${escapeXml(utente)}</all:Utente>
    <all:token>${escapeXml(token)}</all:token>
    <all:tipo>${escapeXml(tipo)}</all:tipo>
  `;
  const xml = await chiamaSoap('Tabella', corpo);

  const esito = estraiTag(xml, 'esito');
  if (esito !== 'true') {
    const errore = estraiTag(xml, 'ErroreDes') || 'esito negativo senza dettaglio nella risposta';
    throw new Error(`Tabella (${tipo}) fallita: ${errore}`);
  }
  const csv = estraiTag(xml, 'CSV');
  if (csv === null) {
    throw new Error(`Tabella (${tipo}): risposta senza CSV — formato inatteso, verificare il WSDL`);
  }
  return unescapeXml(csv);
}

// Converte un CSV (prima riga = intestazione) in un array di oggetti
// {colonna: valore}. Nessuna assunzione sui nomi delle colonne — la
// struttura reale di "Luoghi" non è documentata nei manuali (vedi
// commento in migration 022), questo parser resta corretto qualunque
// essa sia.
//
// Separatore rilevato automaticamente (';' o ',') invece di assumerlo
// fisso: il manuale WS_ALLOGGIATI dichiara ';' per la risposta del
// metodo SOAP Tabella, ma le esportazioni CSV scaricate a mano dal
// portale web (Impostazioni ▸ Alloggiati Web ▸ import manuale, vedi
// docs/DIARIO_SESSIONI.md 02/08/2026) usano ','. Meglio riconoscerlo
// che rischiare di rompersi silenziosamente su uno dei due formati.
function rilevaSeparatore(primaRiga) {
  const puntoVirgola = (primaRiga.match(/;/g) || []).length;
  const virgola = (primaRiga.match(/,/g) || []).length;
  return puntoVirgola >= virgola ? ';' : ',';
}

function parseCsv(testo) {
  const righe = testo.split(/\r\n|\n|\r/).filter(r => r.trim().length > 0);
  if (righe.length === 0) return [];
  const separatore = rilevaSeparatore(righe[0]);
  const intestazione = righe[0].split(separatore).map(c => c.trim());
  return righe.slice(1).map(riga => {
    const valori = riga.split(separatore);
    const oggetto = {};
    intestazione.forEach((colonna, i) => { oggetto[colonna] = (valori[i] ?? '').trim(); });
    return oggetto;
  });
}

// Estrae tutti i blocchi ripetuti di un tag da una risposta XML (es. i vari
// <EsitoOperazioneServizio> dentro <Dettaglio>) — a differenza di
// estraiTag, che prende solo la prima occorrenza.
function estraiBlocchi(xml, tag) {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const blocchi = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocchi.push(match[1]);
  }
  return blocchi;
}

// Costruisce il blocco <all:string>...</all:string> ripetuto per
// l'ElencoSchedine — ogni riga viene escapata (l'escape XML può allungare
// la rappresentazione sul filo, es. un apostrofo in cognome → &apos;, ma
// non tocca la stringa decodificata che il server ricontrolla a 168
// caratteri: il tracciato riguarda il dato, non la sua codifica XML).
function costruisciElencoSchedineXml(righe) {
  return righe.map(r => `<all:string>${escapeXml(r)}</all:string>`).join('\n      ');
}

// Parsa la risposta comune a Test/Send (oggetto ElencoSchedineEsito,
// manuale Sezione 3.2): esito generale + un EsitoOperazioneServizio per
// ogni riga inviata, nello stesso ordine dell'elenco richiesto.
function parseEsitoSchedine(xml, azione) {
  const esitoGenerale = estraiTag(xml, 'esito');
  if (esitoGenerale !== 'true') {
    const errore = estraiTag(xml, 'ErroreDes') || 'esito negativo senza dettaglio nella risposta';
    throw new Error(`${azione} fallito: ${errore}`);
  }
  const schedineValide = Number(estraiTag(xml, 'SchedineValide') || 0);
  const dettaglio = estraiBlocchi(xml, 'EsitoOperazioneServizio').map(blocco => ({
    esito: estraiTag(blocco, 'esito') === 'true',
    erroreCod: estraiTag(blocco, 'ErroreCod'),
    erroreDes: estraiTag(blocco, 'ErroreDes'),
    erroreDettaglio: estraiTag(blocco, 'ErroreDettaglio'),
  }));
  return { schedineValide, dettaglio };
}

// Controllo di correttezza delle informazioni di autenticazione — non
// invia mai dati ospite, verifica solo che utente+token siano validi.
// Zero rischio, utilizzabile per un pulsante "Verifica credenziali" senza
// bisogno di un soggiorno reale.
async function autenticationTest({ utente, token }) {
  const corpo = `
    <all:Utente>${escapeXml(utente)}</all:Utente>
    <all:token>${escapeXml(token)}</all:token>
  `;
  const xml = await chiamaSoap('Authentication_Test', corpo);
  const esito = estraiTag(xml, 'esito');
  if (esito !== 'true') {
    const errore = estraiTag(xml, 'ErroreDes') || 'esito negativo senza dettaglio nella risposta';
    throw new Error(`Authentication_Test fallito: ${errore}`);
  }
  return true;
}

// SICURO — controllo di correttezza del tracciato: "questo metodo consente
// di effettuare il solo controllo di correttezza di un elenco di schedine"
// (manuale, pag. 9). NESSUNA schedina viene mai acquisita dal sistema,
// utilizzabile quante volte serve anche con dati di prova.
async function testSchedine({ utente, token, righe }) {
  const corpo = `
    <all:Utente>${escapeXml(utente)}</all:Utente>
    <all:token>${escapeXml(token)}</all:token>
    <all:ElencoSchedine>
      ${costruisciElencoSchedineXml(righe)}
    </all:ElencoSchedine>
  `;
  const xml = await chiamaSoap('Test', corpo);
  return parseEsitoSchedine(xml, 'Test');
}

// NON SICURO — "le sole schedine corrette saranno acquisite dal sistema"
// (manuale, pag. 10): questo è l'unico metodo che registra davvero un
// alloggiato presso la Polizia di Stato. Il chiamante (controller) deve
// aver già ottenuto una conferma esplicita prima di arrivare qui — vedi
// alloggiatiController.inviaSchedineSoggiorno.
async function inviaSchedine({ utente, token, righe }) {
  const corpo = `
    <all:Utente>${escapeXml(utente)}</all:Utente>
    <all:token>${escapeXml(token)}</all:token>
    <all:ElencoSchedine>
      ${costruisciElencoSchedineXml(righe)}
    </all:ElencoSchedine>
  `;
  const xml = await chiamaSoap('Send', corpo);
  return parseEsitoSchedine(xml, 'Send');
}

module.exports = { generaToken, scaricaTabella, parseCsv, autenticationTest, testSchedine, inviaSchedine };
