// Controller pubblico Pre check-in (modulo 5.2 Fase B, 04/08/2026) —
// NESSUNA autenticazione: protetto solo dal token nel link (vedi
// backend/routes/preCheckinPubblico.js per il rate limit dedicato). Non
// deve MAI restituire 401 (la risposta 401 di frontend/lib/api.js fa
// scattare un redirect a /login, sbagliato per una pagina pubblica) — solo
// 404/410/400.
//
// I dati inviati qui NON toccano `ospiti`/`soggiorno_ospiti`: restano in
// pre_checkin_richieste/pre_checkin_ospiti finché la reception non li
// applica da backend/controllers/preCheckinController.js.

const pool = require('../config/db');
const { hashToken } = require('../lib/preCheckin');
const { CODICE_ITALIA_ALLOGGIATI } = require('../lib/rimovcliResidenza');

const GIORNI_VALIDITA_DOPO_PARTENZA = 2;

// Recupera la prenotazione dal token (hashato) con i suoi soggiorni attivi.
// Ritorna null se il token non esiste, è scaduto o la prenotazione è
// annullata — il chiamante decide il codice HTTP esatto.
async function recuperaDaToken(token) {
  const hash = hashToken(token);
  const prenotazione = await pool.query(
    `SELECT id, stato FROM prenotazioni WHERE pre_checkin_token_hash = $1`,
    [hash]
  );
  if (!prenotazione.rows.length) return { errore: 'non_trovato' };
  if (prenotazione.rows[0].stato === 'interrotta') return { errore: 'annullata' };

  const soggiorni = await pool.query(
    `SELECT s.id, s.data_arrivo, s.data_partenza, s.num_ospiti, c.numero AS camera_numero
     FROM soggiorni s JOIN camere c ON c.id = s.camera_id
     WHERE s.prenotazione_id = $1 AND s.cancellato = false
     ORDER BY s.data_arrivo`,
    [prenotazione.rows[0].id]
  );
  if (!soggiorni.rows.length) return { errore: 'non_trovato' };

  const partenzaMassima = soggiorni.rows.reduce((max, s) => (s.data_partenza > max ? s.data_partenza : max), soggiorni.rows[0].data_partenza);
  const scadenza = new Date(partenzaMassima);
  scadenza.setDate(scadenza.getDate() + GIORNI_VALIDITA_DOPO_PARTENZA);
  if (new Date() > scadenza) return { errore: 'scaduto' };

  return { prenotazioneId: prenotazione.rows[0].id, soggiorni: soggiorni.rows };
}

function codiceErrore(errore) {
  if (errore === 'non_trovato') return { status: 404, error: 'Link non valido.' };
  return { status: 410, error: errore === 'annullata' ? 'Questa prenotazione è stata annullata.' : 'Questo link non è più valido.' };
}

// GET /api/pre-checkin-pubblico/:token — dati per precompilare il form.
const dettaglio = async (req, res) => {
  try {
    const esito = await recuperaDaToken(req.params.token);
    if (esito.errore) {
      const { status, error } = codiceErrore(esito.errore);
      return res.status(status).json({ error });
    }

    const richiestaEsistente = await pool.query(
      `SELECT id FROM pre_checkin_richieste WHERE prenotazione_id = $1 AND stato != 'scartata'`,
      [esito.prenotazioneId]
    );

    res.json({
      hotel: 'Hotel del Golfo',
      giaInviato: richiestaEsistente.rows.length > 0,
      soggiorni: esito.soggiorni.map(s => ({
        id: s.id,
        camera_numero: s.camera_numero,
        data_arrivo: s.data_arrivo,
        data_partenza: s.data_partenza,
        num_ospiti: s.num_ospiti,
      })),
    });
  } catch (err) {
    console.error('dettaglio pre-checkin pubblico error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

// POST /api/pre-checkin-pubblico/:token — invia i dati compilati.
const invia = async (req, res) => {
  const { consenso_privacy_accettato, note_referente, ospiti } = req.body;

  if (consenso_privacy_accettato !== true) {
    return res.status(400).json({ error: "È necessario accettare l'informativa privacy." });
  }
  if (!Array.isArray(ospiti) || ospiti.length === 0) {
    return res.status(400).json({ error: 'Inserisci almeno un ospite.' });
  }
  for (const o of ospiti) {
    if (!o.soggiorno_id || !o.nome || !o.cognome) {
      return res.status(400).json({ error: 'Per ogni ospite servono almeno nome, cognome e camera di riferimento.' });
    }
  }

  // Vincolo ISTAT C/59 (Marco, 28/08/2026, seguito alla scoperta di ospiti
  // esclusi dal generatore rimovcliC59.js per mancanza dello stato di
  // residenza — vedi il vincolo gemello al check-in in
  // prenotazioniController.js). ESTESO 28/08/2026 (bis): la prima versione
  // richiedeva la residenza solo al primo ospite inserito per camera
  // ("un solo referente basta") — la documentazione RIMOVCLI non prevede
  // eccezioni per familiari/minori, quindi ora è richiesta per OGNI
  // ospite inserito, non solo il primo. Lato frontend il referente
  // principale (primo della lista) può offrire una spunta "deriva
  // residenza dal referente principale" per compilare più in fretta i
  // campi degli altri componenti — qui non cambia nulla: arriva comunque
  // un valore per ciascun ospite, derivato o no.
  for (const o of ospiti) {
    if (!o.stato_residenza_codice) {
      return res.status(400).json({ error: `Manca lo stato di residenza per ${o.nome} ${o.cognome}: obbligatorio per ogni ospite.` });
    }
    if (o.stato_residenza_codice === CODICE_ITALIA_ALLOGGIATI && !o.comune_residenza_codice) {
      return res.status(400).json({ error: `Manca il comune di residenza per ${o.nome} ${o.cognome} (residente in Italia).` });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const esito = await recuperaDaToken(req.params.token);
    if (esito.errore) {
      await client.query('ROLLBACK');
      const { status, error } = codiceErrore(esito.errore);
      return res.status(status).json({ error });
    }

    const idSoggiorniValidi = new Set(esito.soggiorni.map(s => s.id));
    for (const o of ospiti) {
      if (!idSoggiorniValidi.has(o.soggiorno_id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Uno o più ospiti fanno riferimento a una camera non valida per questa prenotazione.' });
      }
    }

    // Vincolo numero ospiti (Marco, 28/08/2026 sera): num_ospiti è già noto
    // e affidabile PRIMA che l'ospite compili questo form — arriva dalla
    // prenotazione online (adulti + bambini, bookingPubblicoController.js)
    // o è impostato dalla reception in planning-camere per le prenotazioni
    // telefoniche. Il form pubblico deve quindi ricevere ESATTAMENTE quel
    // numero di ospiti validati per ogni camera, non un numero qualunque:
    // altrimenti una riga lasciata vuota (o rimossa/aggiunta per errore)
    // passerebbe senza che nessuno se ne accorga, come già successo nei
    // test di stasera. Contatore fatto qui, non prima, perché deve contare
    // solo gli ospiti che hanno già superato la validazione nome/cognome/
    // residenza sopra — un ospite scartato lì non deve "contare" come
    // presente.
    const contiPerSoggiorno = {};
    for (const o of ospiti) {
      contiPerSoggiorno[o.soggiorno_id] = (contiPerSoggiorno[o.soggiorno_id] || 0) + 1;
    }
    for (const s of esito.soggiorni) {
      const inseriti = contiPerSoggiorno[s.id] || 0;
      if (inseriti !== s.num_ospiti) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Camera ${s.camera_numero}: attesi ${s.num_ospiti} ospit${s.num_ospiti === 1 ? 'e' : 'i'}, ricevut${inseriti === 1 ? 'o' : 'i'} ${inseriti}. Controlla di aver compilato tutte le righe (o rimuovi quelle in più).`,
        });
      }
    }

    const giaInviata = await client.query(
      `SELECT id FROM pre_checkin_richieste WHERE prenotazione_id = $1 AND stato != 'scartata' FOR UPDATE`,
      [esito.prenotazioneId]
    );
    if (giaInviata.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'I dati per questa prenotazione sono già stati inviati.' });
    }

    const richiesta = await client.query(
      `INSERT INTO pre_checkin_richieste (prenotazione_id, consenso_privacy_accettato, note_referente)
       VALUES ($1, true, $2) RETURNING id`,
      [esito.prenotazioneId, note_referente || null]
    );
    const richiestaId = richiesta.rows[0].id;

    for (const o of ospiti) {
      await client.query(
        `INSERT INTO pre_checkin_ospiti (
           richiesta_id, soggiorno_id, nome, cognome, sesso, data_nascita,
           cittadinanza_testo, cittadinanza_codice, documento_tipo_testo, documento_tipo_codice,
           documento_numero, documento_scadenza, luogo_nascita_testo, provincia_nascita,
           stato_residenza_testo, stato_residenza_codice, comune_residenza_testo, comune_residenza_codice
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          richiestaId, o.soggiorno_id, o.nome, o.cognome, o.sesso || null, o.data_nascita || null,
          o.cittadinanza_testo || null, o.cittadinanza_codice || null,
          o.documento_tipo_testo || null, o.documento_tipo_codice || null,
          o.documento_numero || null, o.documento_scadenza || null,
          o.luogo_nascita_testo || null, o.provincia_nascita || null,
          o.stato_residenza_testo || null, o.stato_residenza_codice || null,
          o.comune_residenza_testo || null, o.comune_residenza_codice || null,
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('invio pre-checkin pubblico error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
};

module.exports = { dettaglio, invia };
