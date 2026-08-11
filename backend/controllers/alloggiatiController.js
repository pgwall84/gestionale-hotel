// Controller Alloggiati Web — Modulo 2.5.
// Fase 1b: sincronizzazione tabelle di codifica (sola lettura) + lettura
// per le tendine della scheda ospite.
// Fase 2 (11/08/2026): verifica credenziali, generazione+verifica schedina
// (Test, sempre sicuro) e invio reale (Send, ACQUISISCE presso la Polizia
// di Stato — gated da conferma esplicita nel body, vedi
// inviaSchedineSoggiorno). Vedi backend/lib/alloggiatiSoapClient.js per il
// client SOAP e backend/lib/alloggiatiSchedina.js per il generatore.

const pool = require('../config/db');
const { generaToken, scaricaTabella, parseCsv, autenticationTest, testSchedine, inviaSchedine } = require('../lib/alloggiatiSoapClient');
const { generaSchedineSoggiorno } = require('../lib/alloggiatiSchedina');

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

// POST /api/alloggiati/soggiorni/:id/invia — NON SICURO: il metodo Send
// acquisisce davvero le schedine presso la Polizia di Stato. Richiede
// esplicitamente { conferma_dati_reali: true } nel body — nessuna
// scorciatoia, nessun default permissivo: senza quel flag la richiesta si
// ferma con 400 prima ancora di generare le righe o contattare il
// servizio. Esito salvato in alloggiati_invii (predisposta da migration
// 016, mai popolata finora). Accessibile a: admin, titolare.
async function inviaSchedineSoggiorno(req, res) {
  if (req.body?.conferma_dati_reali !== true) {
    return res.status(400).json({
      error: 'Invio reale non confermato — impostare conferma_dati_reali: true solo per un soggiorno con ospiti reali effettivamente presenti in struttura.',
    });
  }
  const cred = credenzialiAlloggiati();
  if (!cred) {
    return res.status(400).json({
      error: 'Credenziali Alloggiati Web non configurate — impostare ALLOGGIATI_UTENTE, ALLOGGIATI_PASSWORD, ALLOGGIATI_WSKEY in backend/.env.',
    });
  }
  try {
    const { righeSchedina, avvisi, totaleOspiti } = await generaSchedineSoggiorno(pool, req.params.id);
    if (!righeSchedina.length) {
      return res.status(400).json({ error: 'Nessuna riga generabile per questo soggiorno.', avvisi });
    }
    const token = await generaToken(cred);
    const esito = await inviaSchedine({ utente: cred.utente, token, righe: righeSchedina });
    await pool.query(
      `INSERT INTO alloggiati_invii (soggiorno_id, esito) VALUES ($1, $2)`,
      [req.params.id, esito.schedineValide === righeSchedina.length ? 'ok' : 'parziale']
    );
    res.json({ inviato: true, avvisi, totaleOspiti, righeInviate: righeSchedina.length, esito });
  } catch (err) {
    console.error('inviaSchedineSoggiorno error:', err.message);
    res.status(502).json({ error: `Invio schedina fallito: ${err.message}` });
  }
}

module.exports = {
  sincronizzaTabelle, listaCodici, statoSincronizzazione,
  verificaCredenziali, testSchedineSoggiorno, inviaSchedineSoggiorno,
};
