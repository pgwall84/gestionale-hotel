// Controller Alloggiati Web — Modulo 2.5.
// Fase 1b: sincronizzazione tabelle di codifica (sola lettura) + lettura
// per le tendine della scheda ospite.
// Fase 2 (11/08/2026): verifica credenziali, generazione+verifica schedina
// (Test, sempre sicuro) e invio reale (Send, ACQUISISCE presso la Polizia
// di Stato — gated da conferma esplicita nel body, vedi
// inviaSchedineSoggiorno). Vedi backend/lib/alloggiatiSoapClient.js per il
// client SOAP e backend/lib/alloggiatiSchedina.js per il generatore.
// Fase 2 (13/08/2026): estratta eseguiInvioReale — stessa logica di invio
// riusata sia dal pulsante manuale (inviaSchedineSoggiorno, HTTP, richiede
// conferma_dati_reali) sia dal job notturno (backend/jobs/invioAlloggiatiWeb.js,
// nessuna richiesta HTTP, nessun flag di conferma perché non è mai un'azione
// spontanea di un operatore). Chiama sempre Test PRIMA di Send: se anche una
// sola riga non passa il controllo di formato, Send non viene mai invocato
// — niente tentativi di acquisizione su dati che sappiamo già essere
// respinti.
// Fase A del piano concordato il 13/08/2026 (docs/EVOLUTIVE.md, "Modulo
// 2.5 — Fase 2, stato al 13/08/2026"): un errore di rete/servizio non
// raggiungibile ora SCRIVE comunque una riga in alloggiati_invii con
// esito 'errore_rete' (prima non scriveva nulla — "retry-safety" invisibile,
// nessun contatore, nessun ultimo errore mostrato in coda). Resta comunque
// "da reinviare" per la query di trovaSoggiorniDaInviare/codaInvii (già
// considerano qualunque esito diverso da 'ok'), quindi il comportamento di
// retry automatico non cambia — cambia solo la visibilità. Non distingue
// un guasto davvero transitorio (portale giù) da un problema persistente
// (es. credenziali cambiate) — per questo la coda mostra anche il numero di
// tentativi falliti consecutivi: un contatore che cresce notte dopo notte
// è il segnale che NON si sta autorisolvendo.

const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const { generaToken, scaricaTabella, parseCsv, autenticationTest, testSchedine, inviaSchedine, scaricaRicevuta } = require('../lib/alloggiatiSoapClient');
const { generaSchedineSoggiorno } = require('../lib/alloggiatiSchedina');

// Cartella dove vengono salvate le ricevute PDF (Fase B, 13/08/2026) —
// stesso pattern di uploads/archivio (archivioController.js), ma creata al
// primo utilizzo invece di richiedere che esista già nel repository: qui il
// file non arriva da un upload multer, ma da una risposta SOAP.
const CARTELLA_RICEVUTE = path.join(__dirname, '..', 'uploads', 'alloggiati_ricevute');

// Legge le 3 credenziali da .env e restituisce un errore chiaro se manca
// anche solo una — riusata da tutti gli endpoint che parlano con
// WS_ALLOGGIATI, per non ripetere lo stesso controllo 4 volte.
function credenzialiAlloggiati() {
  const utente = process.env.ALLOGGIATI_UTENTE;
  const password = process.env.ALLOGGIATI_PASSWORD;
  const wsKey = process.env.ALLOGGIATI_WSKEY;
  if (!utente || !password || !wsKey) return null;
  return { utente, password, wsKey };
}

// Le uniche tabelle utili alla scheda ospite (nazionalità/documento).
// TipoErrore e ListaAppartamenti non servono in questa fase (niente invio
// schedine, niente casa in affitto — rimandata, vedi CLAUDE.md Sezione 16).
const TABELLE_DA_SINCRONIZZARE = ['Luoghi', 'Tipi_Documento', 'Tipi_Alloggiato'];

// POST /api/alloggiati/sincronizza — scarica le tabelle di codifica da
// WS_ALLOGGIATI e le salva in alloggiati_codici (upsert per tabella+codice).
// Operazione di sola lettura verso il servizio esterno: non invia mai dati
// di ospiti reali, solo Utente/Password/WsKey per l'autenticazione.
// Accessibile a: admin, titolare.
async function sincronizzaTabelle(req, res) {
  const utente = process.env.ALLOGGIATI_UTENTE;
  const password = process.env.ALLOGGIATI_PASSWORD;
  const wsKey = process.env.ALLOGGIATI_WSKEY;

  if (!utente || !password || !wsKey) {
    return res.status(400).json({
      error: 'Credenziali Alloggiati Web non configurate — impostare ALLOGGIATI_UTENTE, ALLOGGIATI_PASSWORD, ALLOGGIATI_WSKEY in backend/.env.',
    });
  }

  try {
    const token = await generaToken({ utente, password, wsKey });

    const risultati = [];
    for (const tabella of TABELLE_DA_SINCRONIZZARE) {
      const csv = await scaricaTabella({ utente, token, tipo: tabella });
      const righe = parseCsv(csv);

      if (righe.length === 0) {
        risultati.push({ tabella, righe_sincronizzate: 0 });
        continue;
      }

      // Prima colonna = codice, seconda = descrizione — assunzione da
      // verificare sui dati reali (vedi commento in migration 022). Le
      // altre colonne finiscono comunque in dati_extra, nessuna perdita.
      const colonne = Object.keys(righe[0]);
      const colonnaCodice = colonne[0];
      const colonnaDescrizione = colonne[1] ?? colonnaCodice;

      for (const riga of righe) {
        const codice = riga[colonnaCodice];
        if (!codice) continue;
        const descrizione = riga[colonnaDescrizione] || codice;
        await pool.query(
          `INSERT INTO alloggiati_codici (tabella, codice, descrizione, dati_extra, sincronizzato_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (tabella, codice) DO UPDATE SET
             descrizione = EXCLUDED.descrizione,
             dati_extra = EXCLUDED.dati_extra,
             sincronizzato_at = now()`,
          [tabella, codice, descrizione, JSON.stringify(riga)]
        );
      }
      risultati.push({ tabella, righe_sincronizzate: righe.length });
    }

    res.json({ sincronizzato_il: new Date().toISOString(), risultati });
  } catch (err) {
    console.error('sincronizzaTabelle error:', err.message);
    res.status(502).json({ error: `Sincronizzazione con Alloggiati Web fallita: ${err.message}` });
  }
}

// Voci "storiche" (comuni/stati con DataFineVal valorizzata in dati_extra —
// es. comuni fusi o rinominati) in fondo alla lista, non nascoste: servono
// ancora per ospiti nati quando quel codice era valido, ma non devono
// competere con le voci attive nei suggerimenti di oggi. Su richiesta
// esplicita del titolare (02/08/2026) — vedi docs/DIARIO_SESSIONI.md.
// Tabelle senza questa colonna (Tipi_Documento, Tipi_Alloggiato) non sono
// affette: dati_extra->>'DataFineVal' è semplicemente NULL per loro.
const ORDINE_STORICO = `
  (CASE WHEN NULLIF(dati_extra->>'DataFineVal', '') IS NULL THEN 0 ELSE 1 END)
`;

// GET /api/alloggiati/codici?tabella=Luoghi&search=... — per le tendine
// della scheda ospite, max 20 risultati. Con ?codice=... invece di search,
// fa un lookup esatto (usato per mostrare la descrizione leggibile di un
// codice già salvato su un ospite, senza dover rifare una ricerca testuale).
// Accessibile a: admin, titolare, receptionist, portiere_notte (lettura).
async function listaCodici(req, res) {
  const { tabella, search, codice } = req.query;
  if (!tabella) {
    return res.status(400).json({ error: 'Il parametro tabella è obbligatorio.' });
  }
  try {
    let result;
    if (codice) {
      result = await pool.query(
        `SELECT codice, descrizione, dati_extra FROM alloggiati_codici
         WHERE tabella = $1 AND codice = $2`,
        [tabella, codice]
      );
    } else if (search) {
      result = await pool.query(
        `SELECT codice, descrizione, dati_extra FROM alloggiati_codici
         WHERE tabella = $1 AND descrizione ILIKE $2
         ORDER BY ${ORDINE_STORICO}, descrizione LIMIT 20`,
        [tabella, `%${search}%`]
      );
    } else {
      result = await pool.query(
        `SELECT codice, descrizione, dati_extra FROM alloggiati_codici
         WHERE tabella = $1
         ORDER BY ${ORDINE_STORICO}, descrizione LIMIT 20`,
        [tabella]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error('listaCodici error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/alloggiati/stato — numero di codici e data dell'ultima
// sincronizzazione per ciascuna tabella, per la pagina Impostazioni.
// Accessibile a: admin, titolare.
async function statoSincronizzazione(req, res) {
  try {
    const result = await pool.query(
      `SELECT tabella, COUNT(*) AS numero_codici, MAX(sincronizzato_at) AS ultimo_sync
       FROM alloggiati_codici GROUP BY tabella`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('statoSincronizzazione error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/alloggiati/verifica-credenziali — GenerateToken +
// Authentication_Test. Nessun dato ospite coinvolto, zero rischio — pensato
// per un pulsante di verifica in Impostazioni, utilizzabile in qualunque
// momento. Accessibile a: admin, titolare.
async function verificaCredenziali(req, res) {
  const cred = credenzialiAlloggiati();
  if (!cred) {
    return res.status(400).json({
      error: 'Credenziali Alloggiati Web non configurate — impostare ALLOGGIATI_UTENTE, ALLOGGIATI_PASSWORD, ALLOGGIATI_WSKEY in backend/.env.',
    });
  }
  try {
    const token = await generaToken(cred);
    await autenticationTest({ utente: cred.utente, token });
    res.json({ ok: true, verificato_il: new Date().toISOString() });
  } catch (err) {
    console.error('verificaCredenziali error:', err.message);
    res.status(502).json({ error: `Verifica credenziali fallita: ${err.message}` });
  }
}

// POST /api/alloggiati/soggiorni/:id/test — SICURO, nessuna acquisizione:
// genera le righe schedina per il soggiorno e le fa validare da
// WS_ALLOGGIATI col metodo Test (solo controllo di formato). Utilizzabile
// ripetutamente, anche con un soggiorno di prova. Accessibile a: admin,
// titolare.
async function testSchedineSoggiorno(req, res) {
  const cred = credenzialiAlloggiati();
  if (!cred) {
    return res.status(400).json({
      error: 'Credenziali Alloggiati Web non configurate — impostare ALLOGGIATI_UTENTE, ALLOGGIATI_PASSWORD, ALLOGGIATI_WSKEY in backend/.env.',
    });
  }
  try {
    const { righeSchedina, avvisi, totaleOspiti } = await generaSchedineSoggiorno(pool, req.params.id);
    if (!righeSchedina.length) {
      return res.json({
        testato: false,
        avvisi,
        totaleOspiti,
        motivo: 'Nessuna riga generabile: completare in scheda ospite i dati indicati negli avvisi.',
      });
    }
    const token = await generaToken(cred);
    const esito = await testSchedine({ utente: cred.utente, token, righe: righeSchedina });
    res.json({ testato: true, avvisi, totaleOspiti, righeInviate: righeSchedina.length, esito });
  } catch (err) {
    console.error('testSchedineSoggiorno error:', err.message);
    res.status(502).json({ error: `Test schedina fallito: ${err.message}` });
  }
}

// Riduce l'array "dettaglio" di Test/Send (una riga per ogni
// EsitoOperazioneServizio) alla sola parte utile — righe respinte, con
// motivo — in una stringa unica pronta da salvare/mostrare. Restituisce
// null se non c'è nulla da segnalare (tutte le righe valide).
function riassumiRigheRespinte(dettaglio) {
  const respinte = (dettaglio || []).filter(d => !d.esito);
  if (respinte.length === 0) return null;
  return respinte
    .map(d => (d.erroreDes || d.erroreCod || 'errore non specificato') + (d.erroreDettaglio ? ` — ${d.erroreDettaglio}` : ''))
    .join('; ');
}

// Esegue davvero l'invio verso WS_ALLOGGIATI per un soggiorno — Test PRIMA
// di Send, Send invocato solo se Test conferma che tutte le righe sono
// valide. Riusata sia dall'endpoint HTTP (pulsante manuale) sia dal job
// notturno (nessuna richiesta HTTP di mezzo). Non genera MAI eccezioni per
// "condizioni note" (credenziali mancanti, dati insufficienti) — le
// restituisce come esito 'in_attesa', così il chiamante decide se
// rispondere con un 400 (HTTP) o lasciarla in coda per la notte dopo (job).
// Le eccezioni che escono da qui sono solo errori di rete/servizio non
// raggiungibile — il chiamante decide se scriverle o no in alloggiati_invii
// (la HTTP le traduce in 502, il job non scrive nulla, vedi jobs/invioAlloggiatiWeb.js).
async function eseguiInvioReale(soggiornoId) {
  // Blocco di sicurezza — QUI, non solo nelle query di elenco (codaInvii,
  // trovaSoggiorniDaInviare del job): quelle proteggono solo chi passa da
  // lì, ma l'endpoint HTTP POST /soggiorni/:id/invia accetta qualunque id
  // gli venga passato, anche a mano (es. un vecchio id incollato per errore
  // durante un test con "Verifica schedina"). Mettendo il controllo qui,
  // dentro l'UNICA funzione da cui passano davvero tutti gli invii (job,
  // endpoint manuale, futuri chiamanti), un soggiorno di test non può mai
  // essere inviato per davvero, indipendentemente da come ci si arriva.
  const canaleRes = await pool.query(
    `SELECT p.canale_origine FROM soggiorni s JOIN prenotazioni p ON p.id = s.prenotazione_id WHERE s.id = $1`,
    [soggiornoId]
  );
  if (canaleRes.rows.length === 0) {
    return { soggiornoId, esito: 'in_attesa', scritto: false, dettaglio: 'Soggiorno non trovato.', righeInviate: 0, totaleOspiti: 0, avvisi: [] };
  }
  if (canaleRes.rows[0].canale_origine === 'test_interno') {
    throw new Error(
      `Soggiorno #${soggiornoId} è un dato di test (canale_origine='test_interno', generato da uno script di seed) — invio reale bloccato per sicurezza, non è mai stato un ospite vero. Se serve testare il formato, usa "Verifica schedina" (Test), mai questo endpoint.`
    );
  }

  const cred = credenzialiAlloggiati();
  if (!cred) {
    return { soggiornoId, esito: 'in_attesa', scritto: false, dettaglio: 'Credenziali Alloggiati Web non configurate.', righeInviate: 0, totaleOspiti: 0, avvisi: [] };
  }

  const { righeSchedina, avvisi, totaleOspiti } = await generaSchedineSoggiorno(pool, soggiornoId);
  if (!righeSchedina.length) {
    return {
      soggiornoId, esito: 'in_attesa', scritto: false,
      dettaglio: avvisi.join('; ') || 'Dati ospite insufficienti per generare la schedina.',
      righeInviate: 0, totaleOspiti, avvisi,
    };
  }

  // Chiamate verso WS_ALLOGGIATI — da qui in poi un errore è di rete/
  // servizio (timeout, portale in manutenzione, credenziali rifiutate...),
  // non un problema nei dati. Scritto come 'errore_rete' invece di essere
  // rilanciato: resta comunque "da reinviare" alla prossima esecuzione
  // (stessa query di prima), ma ora è visibile in coda invece che silenzioso.
  // La validazione di forma qui dentro (non solo il try/catch attorno alle
  // chiamate) è deliberata: una risposta inattesa dal client SOAP — es. un
  // WSDL cambiato, o un mock di test mal configurato — deve finire nello
  // stesso ramo "errore_rete", mai in un crash con proprietà lette da
  // undefined (bug reale trovato dal titolare 13/08/2026, causato da un
  // problema di igiene dei mock nei test, non da questa funzione — ma la
  // funzione va comunque resa robusta a prescindere da cosa gliela passa).
  let token, esitoTest, esitoSend;
  try {
    token = await generaToken(cred);
    esitoTest = await testSchedine({ utente: cred.utente, token, righe: righeSchedina });
    if (!esitoTest || typeof esitoTest.schedineValide !== 'number') {
      throw new Error('Risposta di Test malformata (schedineValide mancante) — verificare il client SOAP/WSDL.');
    }
  } catch (err) {
    await pool.query(
      `INSERT INTO alloggiati_invii (soggiorno_id, esito, dettaglio_errore) VALUES ($1, 'errore_rete', $2)`,
      [soggiornoId, err.message]
    );
    return { soggiornoId, esito: 'errore_rete', scritto: true, dettaglio: err.message, righeInviate: 0, totaleOspiti, avvisi };
  }

  if (esitoTest.schedineValide !== righeSchedina.length) {
    const dettaglio = riassumiRigheRespinte(esitoTest.dettaglio) || 'Formato non valido secondo WS_ALLOGGIATI.';
    await pool.query(
      `INSERT INTO alloggiati_invii (soggiorno_id, esito, dettaglio_errore) VALUES ($1, 'errore', $2)`,
      [soggiornoId, dettaglio]
    );
    return { soggiornoId, esito: 'errore', scritto: true, dettaglio, righeInviate: righeSchedina.length, totaleOspiti, avvisi };
  }

  try {
    esitoSend = await inviaSchedine({ utente: cred.utente, token, righe: righeSchedina });
    if (!esitoSend || typeof esitoSend.schedineValide !== 'number') {
      throw new Error('Risposta di Send malformata (schedineValide mancante) — verificare il client SOAP/WSDL.');
    }
  } catch (err) {
    await pool.query(
      `INSERT INTO alloggiati_invii (soggiorno_id, esito, dettaglio_errore) VALUES ($1, 'errore_rete', $2)`,
      [soggiornoId, err.message]
    );
    return { soggiornoId, esito: 'errore_rete', scritto: true, dettaglio: err.message, righeInviate: 0, totaleOspiti, avvisi };
  }

  const esitoFinale = esitoSend.schedineValide === righeSchedina.length ? 'ok' : 'parziale';
  const dettaglio = riassumiRigheRespinte(esitoSend.dettaglio);
  await pool.query(
    `INSERT INTO alloggiati_invii (soggiorno_id, esito, dettaglio_errore) VALUES ($1, $2, $3)`,
    [soggiornoId, esitoFinale, dettaglio]
  );
  return { soggiornoId, esito: esitoFinale, scritto: true, dettaglio, righeInviate: esitoSend.schedineValide, totaleOspiti, avvisi };
}

// POST /api/alloggiati/soggiorni/:id/invia — NON SICURO: il metodo Send
// acquisisce davvero le schedine presso la Polizia di Stato. Richiede
// esplicitamente { conferma_dati_reali: true } nel body — nessuna
// scorciatoia, nessun default permissivo: senza quel flag la richiesta si
// ferma con 400 prima ancora di generare le righe o contattare il
// servizio. Usato sia per il pulsante manuale "Invia ora" nella coda
// (Impostazioni ▸ Alloggiati Web) sia, senza HTTP di mezzo, dal job
// notturno tramite eseguiInvioReale. Accessibile a: admin, titolare.
async function inviaSchedineSoggiorno(req, res) {
  if (req.body?.conferma_dati_reali !== true) {
    return res.status(400).json({
      error: 'Invio reale non confermato — impostare conferma_dati_reali: true solo per un soggiorno con ospiti reali effettivamente presenti in struttura.',
    });
  }
  try {
    const risultato = await eseguiInvioReale(req.params.id);
    if (risultato.esito === 'in_attesa') {
      return res.status(400).json({ error: risultato.dettaglio, avvisi: risultato.avvisi });
    }
    if (risultato.esito === 'errore_rete') {
      return res.status(502).json({ error: `Invio schedina fallito: ${risultato.dettaglio}`, avvisi: risultato.avvisi });
    }
    res.json({
      inviato: risultato.esito === 'ok' || risultato.esito === 'parziale',
      esito: risultato.esito,
      dettaglio: risultato.dettaglio,
      avvisi: risultato.avvisi,
      totaleOspiti: risultato.totaleOspiti,
      righeInviate: risultato.righeInviate,
    });
  } catch (err) {
    console.error('inviaSchedineSoggiorno error:', err.message);
    res.status(502).json({ error: `Invio schedina fallito: ${err.message}` });
  }
}

// GET /api/alloggiati/coda — soggiorni con arrivo già avvenuto che non
// risultano ancora inviati con successo (mai tentati, o ultimo tentativo
// con esito diverso da 'ok') + gli ultimi inviati con successo, per la
// pagina Impostazioni ▸ Alloggiati Web. Esclude sempre canale_origine =
// 'test_interno' — i soggiorni generati dagli script di test (
// creaPrenotazioneTestAlloggiati.js, seedPrenotazioniTest.js) non devono
// mai comparire qui, altrimenti finirebbero nel giro di invio reale del
// job notturno. Accessibile a: admin, titolare (stessa azione 'invio').
async function codaInvii(req, res) {
  try {
    const daInviareRes = await pool.query(
      `WITH ultimo_tentativo AS (
         SELECT DISTINCT ON (soggiorno_id) soggiorno_id, esito, dettaglio_errore, data_invio
         FROM alloggiati_invii
         ORDER BY soggiorno_id, data_invio DESC
       ),
       ultimo_ok AS (
         SELECT soggiorno_id, MAX(data_invio) AS ultimo_ok_at
         FROM alloggiati_invii WHERE esito = 'ok' GROUP BY soggiorno_id
       ),
       tentativi_falliti AS (
         -- Fase A (13/08/2026): quanti tentativi consecutivi hanno fallito
         -- da quando (se mai) è andato a buon fine l'ultimo — un numero che
         -- cresce notte dopo notte segnala un problema che non si sta
         -- autorisolvendo, non solo rumore di rete transitorio.
         SELECT ai.soggiorno_id, COUNT(*)::int AS tentativi_falliti
         FROM alloggiati_invii ai
         LEFT JOIN ultimo_ok uo ON uo.soggiorno_id = ai.soggiorno_id
         WHERE ai.esito != 'ok'
           AND (uo.ultimo_ok_at IS NULL OR ai.data_invio > uo.ultimo_ok_at)
         GROUP BY ai.soggiorno_id
       )
       SELECT s.id AS soggiorno_id, s.data_arrivo, s.data_partenza, c.numero AS camera_numero,
              o.nome, o.cognome,
              ut.esito AS ultimo_esito, ut.dettaglio_errore, ut.data_invio AS ultimo_tentativo_at,
              COALESCE(tf.tentativi_falliti, 0) AS tentativi_falliti
       FROM soggiorni s
       JOIN prenotazioni p ON p.id = s.prenotazione_id
       JOIN camere c ON c.id = s.camera_id
       JOIN ospiti o ON o.id = s.ospite_id
       LEFT JOIN ultimo_tentativo ut ON ut.soggiorno_id = s.id
       LEFT JOIN tentativi_falliti tf ON tf.soggiorno_id = s.id
       WHERE s.cancellato = false
         AND s.data_arrivo <= CURRENT_DATE
         AND p.canale_origine != 'test_interno'
         AND (ut.esito IS NULL OR ut.esito != 'ok')
       ORDER BY s.data_arrivo DESC
       LIMIT 100`
    );

    const inviatiRecentiRes = await pool.query(
      `WITH ultimo_tentativo AS (
         SELECT DISTINCT ON (soggiorno_id) soggiorno_id, esito, data_invio
         FROM alloggiati_invii
         ORDER BY soggiorno_id, data_invio DESC
       )
       SELECT s.id AS soggiorno_id, s.data_arrivo, c.numero AS camera_numero,
              o.nome, o.cognome, ut.data_invio AS ultimo_tentativo_at
       FROM soggiorni s
       JOIN prenotazioni p ON p.id = s.prenotazione_id
       JOIN camere c ON c.id = s.camera_id
       JOIN ospiti o ON o.id = s.ospite_id
       JOIN ultimo_tentativo ut ON ut.soggiorno_id = s.id
       WHERE s.cancellato = false AND p.canale_origine != 'test_interno' AND ut.esito = 'ok'
       ORDER BY ut.data_invio DESC
       LIMIT 30`
    );

    res.json({ daInviare: daInviareRes.rows, inviatiRecenti: inviatiRecentiRes.rows });
  } catch (err) {
    console.error('codaInvii error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// Scarica e salva su disco la ricevuta ufficiale (PDF) di UNA data —
// Fase B (13/08/2026). Non genera mai eccezioni per condizioni note
// (credenziali mancanti, data fuori dalla finestra ammessa dal servizio) —
// le restituisce come { scaricata: false, motivo }, stesso stile di
// eseguiInvioReale, così il chiamante decide come reagire (400 HTTP o
// semplicemente "riprova la notte dopo" per il job). Idempotente: se la
// ricevuta di quella data è già stata scaricata, non richiama il servizio.
async function scaricaRicevutaGiorno(dataStr) {
  const esistente = await pool.query('SELECT id FROM alloggiati_ricevute WHERE data = $1', [dataStr]);
  if (esistente.rows.length > 0) {
    return { data: dataStr, scaricata: false, motivo: 'Ricevuta già scaricata in precedenza.' };
  }

  // Finestra ammessa dal servizio (manuale, pag. 17): "Ultimi 30gg escluso
  // il giorno corrente" — validato qui PRIMA di contattare WS_ALLOGGIATI,
  // per dare un errore chiaro invece di un ErroreDes generico dal servizio.
  const oggi = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  const data = new Date(`${dataStr}T00:00:00`);
  const giorniFa = Math.round((oggi - data) / 86400000);
  if (giorniFa <= 0) {
    return { data: dataStr, scaricata: false, motivo: 'La ricevuta di oggi non è ancora scaricabile — disponibile solo dal giorno successivo.' };
  }
  if (giorniFa > 30) {
    return { data: dataStr, scaricata: false, motivo: 'Data troppo vecchia — WS_ALLOGGIATI conserva le ricevute solo per 30 giorni.' };
  }

  const cred = credenzialiAlloggiati();
  if (!cred) {
    return { data: dataStr, scaricata: false, motivo: 'Credenziali Alloggiati Web non configurate.' };
  }

  const token = await generaToken(cred);
  const pdfBuffer = await scaricaRicevuta({ utente: cred.utente, token, data: dataStr });
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    // Stesso principio della guardia in eseguiInvioReale: una risposta
    // inattesa dal client SOAP non deve mai finire silenziosamente scritta
    // su disco come file vuoto/corrotto — meglio un errore esplicito.
    throw new Error('Risposta di Ricevuta senza contenuto PDF valido — verificare il client SOAP/WSDL.');
  }

  fs.mkdirSync(CARTELLA_RICEVUTE, { recursive: true });
  const nomeFile = `${dataStr}.pdf`;
  fs.writeFileSync(path.join(CARTELLA_RICEVUTE, nomeFile), pdfBuffer);

  await pool.query(
    `INSERT INTO alloggiati_ricevute (data, percorso_file) VALUES ($1, $2)
     ON CONFLICT (data) DO NOTHING`,
    [dataStr, nomeFile]
  );
  return { data: dataStr, scaricata: true, percorso_file: nomeFile };
}

// Trova le date con almeno un invio riuscito (ok/parziale) non ancora
// coperte da una ricevuta scaricata, entro la finestra dei 30 giorni, e
// prova a scaricarle una per una — chiamata dal job notturno dopo il giro
// di invio (invioAlloggiatiWeb.js). Un fallimento su una data non blocca le
// altre: l'array dei risultati mostra ogni esito separatamente, e le date
// non riuscite restano candidate anche la notte successiva (nessuna riga
// scritta in alloggiati_ricevute finché il download non va a buon fine).
async function scaricaRicevutePendenti() {
  const dateRes = await pool.query(
    `SELECT DISTINCT ai.data_invio::date AS data
     FROM alloggiati_invii ai
     LEFT JOIN alloggiati_ricevute ar ON ar.data = ai.data_invio::date
     WHERE ai.esito IN ('ok', 'parziale')
       AND ar.id IS NULL
       AND ai.data_invio::date >= CURRENT_DATE - INTERVAL '30 days'
       AND ai.data_invio::date < CURRENT_DATE
     ORDER BY data`
  );
  const risultati = [];
  for (const riga of dateRes.rows) {
    const dataStr = riga.data.toISOString ? riga.data.toISOString().slice(0, 10) : String(riga.data).slice(0, 10);
    try {
      risultati.push(await scaricaRicevutaGiorno(dataStr));
    } catch (err) {
      console.error(`[scaricaRicevutePendenti] data ${dataStr} — errore: ${err.message}`);
      risultati.push({ data: dataStr, scaricata: false, motivo: err.message });
    }
  }
  return risultati;
}

// GET /api/alloggiati/ricevute — elenco ricevute scaricate, per la pagina
// Impostazioni ▸ Alloggiati Web. Accessibile a: admin, titolare.
async function listaRicevute(req, res) {
  try {
    const result = await pool.query(
      `SELECT data, scaricata_at FROM alloggiati_ricevute ORDER BY data DESC LIMIT 60`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('listaRicevute error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/alloggiati/ricevute/:data/scarica — download manuale per una
// data specifica (es. se il giro automatico ha fallito). Accessibile a:
// admin, titolare.
async function scaricaRicevutaManuale(req, res) {
  try {
    const risultato = await scaricaRicevutaGiorno(req.params.data);
    if (!risultato.scaricata) {
      return res.status(400).json({ error: risultato.motivo });
    }
    res.json(risultato);
  } catch (err) {
    console.error('scaricaRicevutaManuale error:', err.message);
    res.status(502).json({ error: `Download ricevuta fallito: ${err.message}` });
  }
}

// GET /api/alloggiati/ricevute/:data/file — scarica il PDF già salvato.
// Accessibile a: admin, titolare.
async function downloadRicevutaFile(req, res) {
  try {
    const result = await pool.query(
      'SELECT percorso_file FROM alloggiati_ricevute WHERE data = $1',
      [req.params.data]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ricevuta non trovata per questa data.' });
    }
    const filePath = path.join(CARTELLA_RICEVUTE, result.rows[0].percorso_file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File non trovato sul server.' });
    }
    res.download(filePath, `ricevuta-alloggiati-${req.params.data}.pdf`);
  } catch (err) {
    console.error('downloadRicevutaFile error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = {
  sincronizzaTabelle, listaCodici, statoSincronizzazione,
  verificaCredenziali, testSchedineSoggiorno, inviaSchedineSoggiorno,
  eseguiInvioReale, codaInvii,
  scaricaRicevutaGiorno, scaricaRicevutePendenti, listaRicevute,
  scaricaRicevutaManuale, downloadRicevutaFile,
};
