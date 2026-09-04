// Booking Engine Diretto (modulo 19/08/2026) — route pubbliche, NESSUNA
// autenticazione, stesso principio di sicurezza di
// preCheckinPubblicoController.js: protette da rate limit dedicato
// (backend/routes/bookingPubblico.js), mai da verificaToken. Vedi
// docs/superpowers/specs/2026-08-19-booking-engine-diretto-design.md.

const pool = require('../config/db');
// Sincronizzazione con planning-tariffe (24/08/2026, segnalato dal
// titolare): il prezzo mostrato/prenotato qui non usa più direttamente
// calcolaTariffa/calcolaTariffaPerTrattamenti "nude" (tariffeController.js)
// — usa le varianti *ConPlanning in planningTariffeController.js, che
// controllano prima un override giorno-per-giorno in
// planning_tariffe_giorni e ricadono sul motore vecchio solo per le notti
// senza override. Vedi commento su calcolaTariffaPerTrattamentiConPlanning
// per il dettaglio del merge e le assunzioni sulle restrizioni
// (min_stay/chiuso_arrivo/chiuso_partenza/stop_sell).
const { calcolaTariffaPerTrattamentiConPlanning, calcolaTariffaConPlanning } = require('./planningTariffeController');
const { gestisciConflittoCamera } = require('../utils/erroriDb');
const { providerAttivo, nomeProviderAttivo } = require('../lib/payments');
// Push disponibilità immediato verso Beds24 (Modulo 2.3, Fase 2/3,
// 04/09/2026): qualunque punto di questo controller che crea, libera o
// sposta un soggiorno diretto deve rispecchiare subito la disponibilità
// su Beds24 — stesso principio già applicato lato beds24SyncController.js
// per le prenotazioni in arrivo dai canali OTA. Best-effort: non lancia
// mai, vedi beds24PushDisponibilita.js.
const { pushDisponibilitaImmediata } = require('../lib/beds24PushDisponibilita');
// Le colonne data_arrivo/data_partenza tornano da pg come oggetti Date —
// stesso helper già in uso in beds24SyncController.js per la stessa ragione.
function isoData(valore) {
  return valore instanceof Date ? valore.toISOString().slice(0, 10) : String(valore);
}

const CANALE_ORIGINE_BOOKING_ENGINE = 'sito_diretto';
const MINUTI_VALIDITA_HOLD = 15;
const PERCENTUALE_CAPARRA = 0.30;

// Ricava adulti/bambini dalla query string della disponibilità o dal body di
// prenota — Fase A Booking Engine v2 (19/08/2026): sostituisce il vecchio
// singolo numero "ospiti" con adulti + età di ogni bambino, necessario per
// il calcolo esatto della tassa di soggiorno (calcolaTassaSoggiorno,
// emailPrenotazioni.js) e per la tariffazione differenziata bambini (Modulo
// tariffe derivate, 20/08/2026 — vedi tariffeController.calcolaTariffa).
// bambini_eta accetta sia un array (JSON, dal body di prenota) sia una
// stringa "5,9" (querystring GET di disponibilita). Età fuori range 0-17
// scartate silenziosamente (un bambino ha per definizione meno di 18 anni;
// valori sporchi non devono far fallire l'intera richiesta).
//
// Due conteggi distinti, confermati con il titolare il 20/08/2026:
// - totaleOspiti: headcount reale (tutte le età) — usato per num_ospiti e
//   per il calcolo esatto della tassa di soggiorno, invariato.
// - ospitiChePesanoSuCapienza: usato SOLO per scegliere il tipo camera
//   adeguato (capienza_max) e per il supplemento trattamento — un bambino
//   0-2 anni non conta (dorme in culla, sempre gratis), un bambino 3-11 anni
//   conta pienamente come un adulto (deve salire di categoria se la camera
//   scelta dai soli adulti è già piena). I 12-17 sono trattati come adulti
//   qui per coerenza (nessuna regola specifica data dal titolare).
function normalizzaComposizioneOspiti(adultiInput, bambiniEtaInput) {
  const adulti = Math.max(1, parseInt(adultiInput, 10) || 1);
  let bambiniEta = [];
  if (Array.isArray(bambiniEtaInput)) {
    bambiniEta = bambiniEtaInput;
  } else if (typeof bambiniEtaInput === 'string' && bambiniEtaInput.trim() !== '') {
    bambiniEta = bambiniEtaInput.split(',');
  }
  bambiniEta = bambiniEta
    .map(e => parseInt(e, 10))
    .filter(e => Number.isInteger(e) && e >= 0 && e < 18);
  const bambiniCheContanoSuCapienza = bambiniEta.filter(e => e >= 3).length;
  return {
    adulti,
    bambiniEta,
    totaleOspiti: adulti + bambiniEta.length,
    ospitiChePesanoSuCapienza: adulti + bambiniCheContanoSuCapienza,
  };
}

const TRATTAMENTI_VALIDI = ['bb', 'mezza_pensione', 'pensione_completa'];

// GET /api/booking-pubblico/disponibilita?data_arrivo=&data_partenza=&adulti=&bambini_eta=
// Ritorna i tipi camera con almeno una camera attiva libera nell'intervallo
// richiesto, con il prezzo totale dal motore tariffe (modulo 2.2). Il
// prezzo non è mai fidato dal client: viene sempre ricalcolato qui e di
// nuovo in prenota() prima di generare il PaymentIntent.
async function disponibilita(req, res) {
  const { data_arrivo, data_partenza, adulti, bambini_eta } = req.query;
  if (!data_arrivo || !data_partenza) {
    return res.status(400).json({ error: 'data_arrivo e data_partenza sono obbligatori.' });
  }
  if (data_partenza <= data_arrivo) {
    return res.status(400).json({ error: 'data_partenza deve essere successiva a data_arrivo.' });
  }
  const { adulti: adultiValidati, bambiniEta, ospitiChePesanoSuCapienza } = normalizzaComposizioneOspiti(adulti, bambini_eta);

  try {
    // Shared inventory (migration 050, 19/08/2026): la camera candidata per
    // un tipo non è più "camere.tipo_camera_id = tc.id" — è qualunque
    // camera elencata come idonea per quel tipo in `tipi_camera_camere`
    // (una stessa camera fisica può essere idonea per più tipi, es. una
    // stanza da 10mq idonea sia a Singola sia a Matrimoniale Piccola).
    // Capienza: confrontata con ospitiChePesanoSuCapienza (adulti + bambini
    // 3+ anni — un neonato 0-2 non richiede una camera più grande, vedi
    // normalizzaComposizioneOspiti sopra), non con il totale ospiti reale.
    const tipiResult = await pool.query(
      `SELECT DISTINCT tc.id, tc.nome, tc.capienza_max
       FROM tipi_camera tc
       WHERE tc.attivo = true
         AND (tc.capienza_max IS NULL OR tc.capienza_max >= $3)
         AND EXISTS (
           SELECT 1 FROM tipi_camera_camere tcc
           JOIN camere c ON c.id = tcc.camera_id
           WHERE tcc.tipo_camera_id = tc.id AND c.attivo = true
             AND NOT EXISTS (
               SELECT 1 FROM soggiorni s
               WHERE s.camera_id = c.id AND s.cancellato = false
                 AND daterange(s.data_arrivo, s.data_partenza, '[)') && daterange($1::date, $2::date, '[)')
             )
         )
       ORDER BY tc.nome`,
      [data_arrivo, data_partenza, ospitiChePesanoSuCapienza]
    );

    // Prezzo per i 3 trattamenti insieme (Modulo tariffe derivate,
    // 20/08/2026): il widget mostra un selettore trattamento DOPO aver
    // scelto la camera, senza una seconda chiamata di rete — un trattamento
    // non ancora configurato per il periodo richiesto risulta null (non
    // esclude l'intero tipo camera, solo quell'opzione).
    // Fix 23/08/2026 (code review 22/08, Tier 2): usa
    // calcolaTariffaPerTrattamenti invece di 3 chiamate separate a
    // calcolaTariffa — il prezzo camera (identico per i 3 trattamenti) si
    // calcola una sola volta per tipo camera invece di tre.
    // Aggiornato 24/08/2026: calcolaTariffaPerTrattamentiConPlanning
    // (planningTariffeController.js) al posto della versione "nuda" —
    // legge prima planning_tariffe_giorni, ricade sul motore vecchio solo
    // per le notti senza override. Ogni tipo camera è isolato nel proprio
    // try/catch: un tipo con una configurazione tariffaria rotta (es. una
    // catena di derivazione a più livelli non supportata, vedi Piano 2 del
    // 24/08/2026 su /tariffe) viene escluso dai risultati invece di far
    // rispondere 500 all'INTERA ricerca — prima di oggi un solo tipo
    // camera mal configurato bastava a rompere ogni ricerca disponibilità
    // del sito, non solo il prezzo di quel tipo.
    const tipiConPrezzo = await Promise.all(
      tipiResult.rows.map(async (tipo) => {
        try {
          const risultati = await calcolaTariffaPerTrattamentiConPlanning(
            tipo.id, data_arrivo, data_partenza, TRATTAMENTI_VALIDI, { adulti: adultiValidati, bambiniEta }
          );
          const { bb, mezza_pensione: mezzaPensione, pensione_completa: pensioneCompleta } = risultati;
          const prezzoSeDisponibile = (r) => (r.restrizioni.bloccato ? null : r.prezzo_totale);
          return {
            id: tipo.id,
            nome: tipo.nome,
            capienza_max: tipo.capienza_max,
            num_notti: bb.num_notti,
            prezzi: {
              bb: prezzoSeDisponibile(bb),
              mezza_pensione: prezzoSeDisponibile(mezzaPensione),
              pensione_completa: prezzoSeDisponibile(pensioneCompleta),
            },
            notti_scoperte: bb.notti_scoperte,
            avvisi: bb.avvisi,
            // Motivo specifico (min_stay/chiusura/stop_sell) quando un
            // trattamento risulta non disponibile per restrizione invece
            // che per assenza di prezzo — null se non bloccato.
            motivi_non_disponibile: {
              bb: bb.restrizioni.motivo,
              mezza_pensione: mezzaPensione.restrizioni.motivo,
              pensione_completa: pensioneCompleta.restrizioni.motivo,
            },
          };
        } catch (errTipo) {
          console.error(`disponibilita: calcolo prezzo fallito per tipo camera ${tipo.id} (${tipo.nome}), escluso dai risultati:`, errTipo.message);
          return null;
        }
      })
    );

    res.json(tipiConPrezzo.filter(t => t && t.prezzi.bb !== null));
  } catch (err) {
    console.error('disponibilita booking pubblico error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/booking-pubblico/disponibilita-mese?anno=&mese=&adulti=&bambini_eta=
// Disponibilità mensile aggregata (24/08/2026) — alimenta il calendario
// OTA-style del date-range picker in sito-hotel. Riusa lo stesso pattern
// EXISTS inventario/capienza di disponibilita() sopra, ma UNA query sola
// su generate_series invece di N chiamate, e NESSUN calcolo prezzo/
// derivazione: per design, non tiene conto delle restrizioni di
// planning-tariffe (min_stay/chiuso_arrivo/chiuso_partenza/stop_sell), che
// sono per tipo_camera+trattamento e qui il trattamento non è ancora
// scelto — vedi
// sito-hotel/docs/superpowers/specs/2026-08-24-date-range-picker-design.md.
async function disponibilitaMese(req, res) {
  const { anno, mese, adulti, bambini_eta } = req.query;
  const annoNum = parseInt(anno, 10);
  const meseNum = parseInt(mese, 10);

  if (!Number.isInteger(annoNum) || annoNum < 2020 || annoNum > 2100) {
    return res.status(400).json({ error: 'anno non valido.' });
  }
  if (!Number.isInteger(meseNum) || meseNum < 1 || meseNum > 12) {
    return res.status(400).json({ error: 'mese non valido (1-12).' });
  }

  const { ospitiChePesanoSuCapienza } = normalizzaComposizioneOspiti(adulti, bambini_eta);

  const primoGiorno = `${annoNum}-${String(meseNum).padStart(2, '0')}-01`;
  const meseSuccessivo = meseNum === 12 ? 1 : meseNum + 1;
  const annoMeseSuccessivo = meseNum === 12 ? annoNum + 1 : annoNum;
  const primoGiornoMeseSuccessivo = `${annoMeseSuccessivo}-${String(meseSuccessivo).padStart(2, '0')}-01`;

  try {
    const result = await pool.query(
      `SELECT
         notte::date::text AS notte,
         EXISTS (
           SELECT 1
           FROM tipi_camera tc
           WHERE tc.attivo = true
             AND (tc.capienza_max IS NULL OR tc.capienza_max >= $3)
             AND EXISTS (
               SELECT 1 FROM tipi_camera_camere tcc
               JOIN camere c ON c.id = tcc.camera_id
               WHERE tcc.tipo_camera_id = tc.id AND c.attivo = true
                 AND NOT EXISTS (
                   SELECT 1 FROM soggiorni s
                   WHERE s.camera_id = c.id AND s.cancellato = false
                     AND daterange(s.data_arrivo, s.data_partenza, '[)') @> notte::date
                 )
             )
         ) AS disponibile
       FROM generate_series($1::date, ($2::date - INTERVAL '1 day'), INTERVAL '1 day') AS notte
       ORDER BY notte`,
      [primoGiorno, primoGiornoMeseSuccessivo, ospitiChePesanoSuCapienza]
    );

    const disponibilita = {};
    result.rows.forEach((r) => { disponibilita[r.notte] = r.disponibile; });
    res.json({ disponibilita });
  } catch (err) {
    console.error('Errore disponibilitaMese:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// POST /api/booking-pubblico/prenota
// Crea una prenotazione con blocco camera breve (opzione, TTL 15 minuti) e
// genera il PaymentIntent Stripe per il 30% di caparra. SICUREZZA:
// tariffa_totale non è mai accettata dal client — sempre ricalcolata qui
// via calcolaTariffaConPlanning. Il blocco (verifica disponibilità + riserva) è
// atomico nella stessa transazione: due richieste concorrenti sulla stessa
// camera/date non possono superare entrambe il controllo (backstop finale:
// il vincolo excl_soggiorni_camera_overlap a livello DB, tradotto in 409 da
// gestisciConflittoCamera).
async function prenota(req, res) {
  const { tipo_camera_id, data_arrivo, data_partenza, adulti, bambini_eta, trattamento, nome, cognome, email, telefono } = req.body;

  if (!tipo_camera_id || !data_arrivo || !data_partenza) {
    return res.status(400).json({ error: 'tipo_camera_id, data_arrivo e data_partenza sono obbligatori.' });
  }
  if (data_partenza <= data_arrivo) {
    return res.status(400).json({ error: 'data_partenza deve essere successiva a data_arrivo.' });
  }
  if (!nome || !cognome || !email) {
    return res.status(400).json({ error: 'nome, cognome ed email sono obbligatori.' });
  }
  const trattamentoValidato = trattamento || 'bb';
  if (!TRATTAMENTI_VALIDI.includes(trattamentoValidato)) {
    return res.status(400).json({ error: `trattamento non valido — valori ammessi: ${TRATTAMENTI_VALIDI.join(', ')}.` });
  }
  // Composizione ospiti (Fase A Booking Engine v2, 19/08/2026) — sostituisce
  // il vecchio num_ospiti diretto dal client: adulti + età di ogni bambino,
  // normalizzati e validati qui, mai fidati così come arrivano dal body.
  const { adulti: adultiValidati, bambiniEta, totaleOspiti, ospitiChePesanoSuCapienza } = normalizzaComposizioneOspiti(adulti, bambini_eta);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Sweep di cortesia: libera eventuali hold di QUESTO canale scaduti,
    // prima del controllo disponibilità. Scoped solo a canale_origine
    // 'sito_diretto' — non tocca mai le opzioni prese per telefono (canale
    // 'diretta', TTL 48h, evolutiva separata di cron automatico, vedi
    // docs/EVOLUTIVE.md). Lo stesso sweep gira anche nel cron dedicato
    // (backend/jobs/scadenzaHoldBookingEngine.js) — qui è solo una
    // garanzia aggiuntiva per non far fallire inutilmente una richiesta
    // arrivata tra due esecuzioni del cron.
    // RETURNING (04/09/2026): serve a sapere QUALI tipo_camera_id/date sono
    // state liberate da questo sweep, per ripubblicare la disponibilità su
    // Beds24 dopo il COMMIT — vedi pushDisponibilitaImmediata più sotto.
    const holdScadutiLiberati = await client.query(
      `UPDATE soggiorni s SET cancellato = true
       FROM prenotazioni p
       WHERE s.prenotazione_id = p.id
         AND p.canale_origine = $1 AND p.stato = 'opzione'
         AND p.data_scadenza_opzione < NOW() AND s.cancellato = false
       RETURNING s.tipo_camera_venduto_id, s.data_arrivo, s.data_partenza`,
      [CANALE_ORIGINE_BOOKING_ENGINE]
    );
    await client.query(
      `UPDATE prenotazioni SET stato = 'interrotta'
       WHERE canale_origine = $1 AND stato = 'opzione' AND data_scadenza_opzione < NOW()`,
      [CANALE_ORIGINE_BOOKING_ENGINE]
    );

    // Aggiornato 24/08/2026: calcolaTariffaConPlanning al posto di
    // calcolaTariffa "nuda" — stesso motore ora usato da disponibilita(),
    // per non poter mai prenotare a un prezzo diverso da quello mostrato in
    // ricerca. Include anche l'enforcement delle restrizioni
    // (min_stay/chiuso_arrivo/chiuso_partenza/stop_sell impostate in
    // /planning-tariffe) — prima di oggi queste non erano mai controllate
    // qui, un ospite poteva prenotare anche in violazione di un minimo
    // notti o una chiusura arrivo/partenza impostati dal titolare.
    const tariffa = await calcolaTariffaConPlanning(tipo_camera_id, data_arrivo, data_partenza, {
      trattamento: trattamentoValidato, adulti: adultiValidati, bambiniEta,
    });
    if (tariffa.restrizioni.bloccato) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: tariffa.restrizioni.motivo || 'Questa combinazione di date e trattamento non è disponibile.' });
    }
    if (tariffa.prezzo_totale === null) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Non è disponibile una tariffa per queste date (camera o trattamento scelto).' });
    }

    // Validazione capienza — mai fidarsi del solo filtro lato client in
    // disponibilita(): la stessa richiesta potrebbe arrivare direttamente a
    // questo endpoint senza essere passata di lì. ospitiChePesanoSuCapienza
    // (non totaleOspiti): un neonato 0-2 anni non richiede una camera più
    // grande, vedi normalizzaComposizioneOspiti.
    const tipoCameraResult = await client.query(`SELECT capienza_max FROM tipi_camera WHERE id = $1`, [tipo_camera_id]);
    const capienzaMax = tipoCameraResult.rows[0]?.capienza_max;
    if (capienzaMax != null && ospitiChePesanoSuCapienza > capienzaMax) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Questo tipo di camera ospita al massimo ${capienzaMax} persone.` });
    }

    // Shared inventory (migration 050): la camera candidata viene da
    // tipi_camera_camere, non più da un'uguaglianza diretta su
    // camere.tipo_camera_id — stesso principio di disponibilita() sopra.
    const cameraResult = await client.query(
      `SELECT c.id FROM camere c
       JOIN tipi_camera_camere tcc ON tcc.camera_id = c.id
       WHERE tcc.tipo_camera_id = $1 AND c.attivo = true
         AND NOT EXISTS (
           SELECT 1 FROM soggiorni s
           WHERE s.camera_id = c.id AND s.cancellato = false
             AND daterange(s.data_arrivo, s.data_partenza, '[)') && daterange($2::date, $3::date, '[)')
         )
       ORDER BY c.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [tipo_camera_id, data_arrivo, data_partenza]
    );
    if (!cameraResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Nessuna camera disponibile per queste date.' });
    }
    const cameraId = cameraResult.rows[0].id;

    // Ospite: cerca per email, altrimenti crea. Match minimo (solo email),
    // sufficiente per non duplicare richieste ripetute dello stesso ospite
    // dal sito — non i criteri più ampi usati in reception. Bug corretto il
    // 19/08/2026 (segnalato da Marco durante il primo test end-to-end): il
    // ramo "ospite già esistente" aggiornava solo il telefono, mai
    // nome/cognome — chi prenotava di nuovo con la stessa email restava con
    // il nome della PRIMA prenotazione mai fatta con quell'indirizzo, anche
    // se il form ne indicava uno diverso. Nome/cognome vanno sempre
    // aggiornati con l'ultimo dato fornito, stesso principio già in uso per
    // il telefono.
    const ospiteEsistente = await client.query(
      `SELECT id FROM ospiti WHERE email = $1 ORDER BY id LIMIT 1`,
      [email]
    );
    let ospiteId;
    if (ospiteEsistente.rows.length) {
      ospiteId = ospiteEsistente.rows[0].id;
      await client.query(
        `UPDATE ospiti SET nome = $2, cognome = $3, telefono = COALESCE($4, telefono) WHERE id = $1`,
        [ospiteId, nome, cognome, telefono || null]
      );
    } else {
      const nuovoOspite = await client.query(
        `INSERT INTO ospiti (nome, cognome, email, telefono) VALUES ($1, $2, $3, $4) RETURNING id`,
        [nome, cognome, email, telefono || null]
      );
      ospiteId = nuovoOspite.rows[0].id;
    }

    const prenotazioneResult = await client.query(
      `INSERT INTO prenotazioni (canale_origine, stato, data_scadenza_opzione)
       VALUES ($1, 'opzione', NOW() + make_interval(mins => $2))
       RETURNING *`,
      [CANALE_ORIGINE_BOOKING_ENGINE, MINUTI_VALIDITA_HOLD]
    );
    const prenotazione = prenotazioneResult.rows[0];

    // tipo_camera_venduto_id (migration 050): registra l'identità
    // effettivamente venduta (es. "Singola"), indipendente dalla camera
    // fisica assegnata — con lo shared inventory quella camera potrebbe
    // avere un'altra etichetta di default (es. "Matrimoniale Piccola").
    // Senza questo, mail/planning mostrerebbero il nome sbagliato.
    const soggiornoResult = await client.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti, tariffa_totale, composizione_ospiti, tipo_camera_venduto_id, trattamento)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        prenotazione.id, cameraId, ospiteId, data_arrivo, data_partenza, totaleOspiti, tariffa.prezzo_totale,
        JSON.stringify({ adulti: adultiValidati, bambini_eta: bambiniEta }),
        tipo_camera_id,
        trattamentoValidato,
      ]
    );

    await client.query(
      `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1, $2, '17')`,
      [soggiornoResult.rows[0].id, ospiteId]
    );

    const importoCaparra = Math.round(tariffa.prezzo_totale * PERCENTUALE_CAPARRA * 100) / 100;

    // Fix 23/08/2026 (code review 22/08, Tier 2): stripe.paymentIntents.create
    // è una chiamata di rete esterna — prima veniva eseguita QUI, dentro la
    // transazione ancora aperta, tenendo impegnati sia la connessione DB sia
    // il lock FOR UPDATE SKIP LOCKED sulla camera per l'intera round-trip
    // verso Stripe (unico punto del codice a farlo: ogni altra chiamata
    // Stripe, in stripeWebhookController.js, avviene già dopo COMMIT). Ora si
    // fa COMMIT prima — la camera resta comunque riservata dal vincolo di
    // esclusione su `soggiorni` più il TTL dell'hold (MINUTI_VALIDITA_HOLD),
    // non dal lock di transazione — poi si chiama il provider di pagamento
    // fuori transazione, infine si scrive la riga `pagamenti` con un
    // secondo INSERT (atomico di per sé, singola query). Valido anche con
    // Nexi (02/09/2026), pur essendo sincrono/senza rete: stesso schema per
    // non avere due percorsi diversi a seconda del provider attivo.
    await client.query('COMMIT');

    // Push disponibilità immediato (Modulo 2.3, Fase 2/3) — sempre dopo il
    // commit, mai dentro la transazione. Due motivi distinti per cui la
    // disponibilità è cambiata: (a) lo sweep sopra ha liberato camere di
    // hold scaduti di altri clienti, su tipo_camera_id potenzialmente
    // diversi da quello appena prenotato; (b) questa prenotazione ha appena
    // occupato una camera del tipo richiesto. Best-effort, non blocca mai
    // la risposta al cliente.
    for (const riga of holdScadutiLiberati.rows) {
      await pushDisponibilitaImmediata(riga.tipo_camera_venduto_id, isoData(riga.data_arrivo), isoData(riga.data_partenza));
    }
    await pushDisponibilitaImmediata(tipo_camera_id, data_arrivo, data_partenza);

    let risultatoPagamento;
    try {
      risultatoPagamento = await providerAttivo().avviaPagamento({
        prenotazioneId: prenotazione.id,
        importoEuro: importoCaparra,
      });
    } catch (pagamentoErr) {
      // La prenotazione (hold) esiste già ma senza modo di pagarla: libero
      // subito la camera invece di aspettare la scadenza naturale del hold
      // — nessun motivo di tenerla bloccata sapendo già che questo tentativo
      // non avrà un pagamento.
      console.error(`prenotazione ${prenotazione.id}: avvio pagamento (${nomeProviderAttivo()}) fallito, libero la prenotazione:`, pagamentoErr.message);
      try {
        await client.query(`UPDATE prenotazioni SET stato = 'interrotta', updated_at = NOW() WHERE id = $1`, [prenotazione.id]);
        await client.query(`UPDATE soggiorni SET cancellato = true WHERE prenotazione_id = $1`, [prenotazione.id]);
        // La camera appena liberata da questo cleanup va ripubblicata su
        // Beds24 come gli altri due casi sopra — queste query girano già
        // fuori transazione (il COMMIT è avvenuto prima del tentativo di
        // pagamento), quindi il push avviene subito dopo, non dopo un
        // secondo COMMIT che qui non esiste.
        await pushDisponibilitaImmediata(tipo_camera_id, data_arrivo, data_partenza);
      } catch (cleanupErr) {
        console.error(`prenotazione ${prenotazione.id}: cleanup dopo fallimento avvio pagamento — errore imprevisto:`, cleanupErr.message);
      }
      return res.status(502).json({ error: 'Impossibile avviare il pagamento in questo momento. Riprova tra qualche istante.' });
    }

    try {
      await client.query(
        `INSERT INTO pagamenti (prenotazione_id, importo, tipo, stato, external_payment_id, metodo)
         VALUES ($1, $2, 'caparra', 'pending', $3, $4)`,
        [prenotazione.id, importoCaparra, risultatoPagamento.external_payment_id, nomeProviderAttivo()]
      );
    } catch (dbErr) {
      // Caso limite: il pagamento esiste già presso il provider ma la riga
      // pagamenti non è stata scritta (fallimento DB proprio in questa
      // finestra) — loggato per intervento manuale, perché la conferma non
      // troverà nessuna riga 'pending' da aggiornare quando arriverà.
      console.error(`prenotazione ${prenotazione.id}: pagamento ${risultatoPagamento.external_payment_id} avviato ma riga pagamenti non scritta:`, dbErr.message);
      return res.status(500).json({ error: 'Errore interno' });
    }

    res.status(201).json({
      prenotazione_id: prenotazione.id,
      importo_caparra: importoCaparra,
      [risultatoPagamento.chiaveRisposta]: risultatoPagamento.datiCliente,
      scadenza_hold: prenotazione.data_scadenza_opzione,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (gestisciConflittoCamera(err, res)) return;
    console.error('prenota booking pubblico error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}

// GET /api/booking-pubblico/termini-cancellazione — Fase C Booking Engine v2
// (19/08/2026). Testo mostrato su /prenota prima del pagamento, stessa
// colonna impostazioni_email.termini_cancellazione usata dalla mail di
// conferma (backend/lib/emailPrenotazioni.js) — editabile da
// Impostazioni ▸ Testi email, mai duplicato tra email e sito. Pubblico,
// nessun dato sensibile: è testo informativo destinato a un visitatore che
// non si è ancora autenticato.
async function terminiCancellazione(req, res) {
  try {
    const result = await pool.query('SELECT termini_cancellazione FROM impostazioni_email WHERE id = 1', []);
    res.json({ termini_cancellazione: result.rows[0]?.termini_cancellazione || null });
  } catch (err) {
    console.error('terminiCancellazione booking pubblico error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

// GET /api/booking-pubblico/configurazione — fix 23/08/2026 (code review
// 22/08, Tier 2): la percentuale di caparra era duplicata a mano tra questo
// backend (PERCENTUALE_CAPARRA, sopra) e sito-hotel (un letterale 0.3 in
// BookingWidget.tsx, solo per mostrare la stima PRIMA di creare la
// prenotazione — l'importo autorevole resta sempre quello restituito da
// POST /prenota, mai ricalcolato dal client). Stesso principio già in uso
// per terminiCancellazione qui sopra: un solo endpoint pubblico, letto a
// runtime dal sito, invece di un numero copiato a mano in due repository
// che può disallinearsi silenziosamente. Nessun dato sensibile — è la
// stessa percentuale già visibile a chiunque prenoti sul sito.
async function configurazione(req, res) {
  res.json({ percentuale_caparra: PERCENTUALE_CAPARRA, provider: nomeProviderAttivo() });
}

module.exports = { disponibilita, disponibilitaMese, prenota, terminiCancellazione, configurazione, CANALE_ORIGINE_BOOKING_ENGINE, MINUTI_VALIDITA_HOLD, PERCENTUALE_CAPARRA };
