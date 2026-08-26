// Test suite — Booking Engine Diretto (modulo 19/08/2026). Route pubbliche,
// nessun token: GET disponibilita, POST prenota, POST webhook Stripe.
// Usa date fittizie nel 2099 e una camera/tipo camera dedicati, stesso
// pattern di prenotazioni.test.js.
//
// STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET devono essere chiavi di test
// Stripe VERE (sk_test_.../whsec_...) in backend/.env — non sono
// sovrascritte da backend/.env.test (a differenza di Alloggiati Web, qui
// serve davvero chiamare l'API di test di Stripe, non evitarla).

const request = require('supertest');
const crypto  = require('crypto');
const app     = require('../../backend/app');
const stripe  = require('../../backend/lib/stripeClient');
const { getPool, chiudiPool } = require('../helpers/db');
const { authHeader } = require('../helpers/auth');
const { PERCENTUALE_CAPARRA } = require('../../backend/controllers/bookingPubblicoController');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let tipoCameraTestId;
let cameraTestId;
const prenotazioniCreate = [];

beforeAll(async () => {
  const db = getPool();
  const tipo = await db.query(
    `INSERT INTO tipi_camera (nome, capienza_max) VALUES ($1, 2) RETURNING id`,
    [`TestBookingEngine${SUFFISSO}`]
  );
  tipoCameraTestId = tipo.rows[0].id;

  const camera = await db.query(
    `INSERT INTO camere (numero, nome, piano, tipo_camera_id, attivo) VALUES ($1, 'Camera Test Booking Engine', 9, $2, true) RETURNING id`,
    [`TEST-BE${SUFFISSO}`, tipoCameraTestId]
  );
  cameraTestId = camera.rows[0].id;

  // Shared inventory (migration 050): la disponibilità del booking engine
  // pubblico legge da `tipi_camera_camere`, non più da `camere.tipo_camera_id`
  // — senza questa riga la camera di test non risulta idonea per nessuna
  // ricerca (stesso principio della fixture "Shared inventory" più sotto).
  await db.query(
    `INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`,
    [tipoCameraTestId, cameraTestId]
  );

  await db.query(
    `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte)
     VALUES ($1, 'Test', '2099-01-01', '2099-12-31', 100)`,
    [tipoCameraTestId]
  );
});

afterAll(async () => {
  const db = getPool();
  if (prenotazioniCreate.length) {
    await db.query('DELETE FROM pagamenti WHERE prenotazione_id = ANY($1)', [prenotazioniCreate]);
    await db.query('DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (SELECT id FROM soggiorni WHERE prenotazione_id = ANY($1))', [prenotazioniCreate]);
    await db.query('DELETE FROM soggiorni WHERE prenotazione_id = ANY($1)', [prenotazioniCreate]);
    await db.query('DELETE FROM prenotazioni WHERE id = ANY($1)', [prenotazioniCreate]);
  }
  await db.query('DELETE FROM tipi_camera_camere WHERE tipo_camera_id = $1', [tipoCameraTestId]);
  await db.query('DELETE FROM tariffe WHERE tipo_camera_id = $1', [tipoCameraTestId]);
  await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  await db.query('DELETE FROM tipi_camera WHERE id = $1', [tipoCameraTestId]);
  await chiudiPool();
});

describe('GET /api/booking-pubblico/disponibilita', () => {
  test('senza token, ritorna il tipo camera con prezzo calcolato', async () => {
    const res = await request(app)
      .get('/api/booking-pubblico/disponibilita')
      .query({ data_arrivo: '2099-06-01', data_partenza: '2099-06-03', adulti: 2 });

    expect(res.status).toBe(200);
    const trovato = res.body.find(t => t.id === tipoCameraTestId);
    expect(trovato).toBeDefined();
    // Modulo tariffe derivate (20/08/2026): disponibilita() ora restituisce
    // i 3 prezzi insieme (bb/mezza_pensione/pensione_completa) invece di un
    // singolo prezzo_totale — bb è il B&B, invariato rispetto a prima.
    expect(trovato.prezzi.bb).toBe(200);
  });

  test('400 se mancano le date', async () => {
    const res = await request(app).get('/api/booking-pubblico/disponibilita').query({ adulti: 2 });
    expect(res.status).toBe(400);
  });
});

// Fix 23/08/2026 (code review 22/08, Tier 2): la percentuale di caparra era
// duplicata a mano (letterale 0.3) in sito-hotel — questo endpoint la rende
// leggibile a runtime, stessa fonte del calcolo reale in prenota() sotto.
describe('GET /api/booking-pubblico/configurazione', () => {
  test('senza token, ritorna la percentuale di caparra corrente', async () => {
    const res = await request(app).get('/api/booking-pubblico/configurazione');
    expect(res.status).toBe(200);
    expect(res.body.percentuale_caparra).toBe(PERCENTUALE_CAPARRA);
  });
});

// Endpoint disponibilità mensile aggregata (24/08/2026) — alimenta il nuovo
// calendario OTA-style del date-range picker in sito-hotel. Aggregato su
// TUTTE le tipologie attive (non filtrabile per tipo_camera_id nella
// risposta, per design — vedi
// sito-hotel/docs/superpowers/specs/2026-08-24-date-range-picker-design.md):
// le asserzioni "false" sotto usano adulti:20 per restare valide anche se
// nel DB di test esistono altre tipologie attive con capienza inferiore a
// 20 (assunzione ragionevole per un hotel come questo, non verificabile da
// questa sessione Cowork senza accesso al DB).
describe('GET /api/booking-pubblico/disponibilita-mese', () => {
  let tipoMeseId, cameraMeseId;
  const prenotazioniMese = [];

  // Isolamento dall'aggregazione (vedi commento sul describe qui sopra):
  // capienzaIsolante è più alta di qualunque capienza_max reale attiva nel
  // DB, cosi la sola tipologia che soddisfa il filtro capienza nella query
  // "notte prenotata" (sotto) è quella di questo test — altrimenti una
  // qualunque camera reale libera in quella notte fa risultare l'aggregato
  // disponibile=true a prescindere dalla prenotazione appena creata.
  // Calcolata dal DB invece di un numero fisso, per non affidarsi a un
  // valore che potrebbe non reggere se in futuro l'hotel aggiunge una
  // tipologia con capienza maggiore (es. una suite).
  let capienzaIsolante;

  beforeAll(async () => {
    const db = getPool();
    const maxReale = await db.query(
      `SELECT COALESCE(MAX(capienza_max), 0) AS max FROM tipi_camera WHERE attivo = true`
    );
    capienzaIsolante = maxReale.rows[0].max + 1;
    const tipo = await db.query(
      `INSERT INTO tipi_camera (nome, capienza_max) VALUES ($1, $2) RETURNING id`,
      [`TestDispMese${SUFFISSO}`, capienzaIsolante]
    );
    tipoMeseId = tipo.rows[0].id;
    const camera = await db.query(
      `INSERT INTO camere (numero, nome, piano, attivo) VALUES ($1, 'Camera Test Disponibilita Mese', 9, true) RETURNING id`,
      [`TEST-DM${SUFFISSO}`]
    );
    cameraMeseId = camera.rows[0].id;
    await db.query(
      `INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`,
      [tipoMeseId, cameraMeseId]
    );
    await db.query(
      `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte) VALUES ($1, 'Test', '2099-01-01', '2099-12-31', 90)`,
      [tipoMeseId]
    );
  });

  afterAll(async () => {
    const db = getPool();
    if (prenotazioniMese.length) {
      await db.query('DELETE FROM pagamenti WHERE prenotazione_id = ANY($1)', [prenotazioniMese]);
      await db.query('DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (SELECT id FROM soggiorni WHERE prenotazione_id = ANY($1))', [prenotazioniMese]);
      await db.query('DELETE FROM soggiorni WHERE prenotazione_id = ANY($1)', [prenotazioniMese]);
      await db.query('DELETE FROM prenotazioni WHERE id = ANY($1)', [prenotazioniMese]);
    }
    await db.query('DELETE FROM tipi_camera_camere WHERE tipo_camera_id = $1', [tipoMeseId]);
    await db.query('DELETE FROM tariffe WHERE tipo_camera_id = $1', [tipoMeseId]);
    await db.query('DELETE FROM camere WHERE id = $1', [cameraMeseId]);
    await db.query('DELETE FROM tipi_camera WHERE id = $1', [tipoMeseId]);
  });

  test('400 se anno o mese mancano o non validi', async () => {
    const senzaParam = await request(app).get('/api/booking-pubblico/disponibilita-mese').query({ mese: 6 });
    expect(senzaParam.status).toBe(400);

    const meseFuoriRange = await request(app).get('/api/booking-pubblico/disponibilita-mese').query({ anno: 2099, mese: 13 });
    expect(meseFuoriRange.status).toBe(400);
  });

  test('un mese senza prenotazioni: le notti risultano disponibili grazie alla tipologia di test', async () => {
    const res = await request(app)
      .get('/api/booking-pubblico/disponibilita-mese')
      .query({ anno: 2099, mese: 6, adulti: 2 });

    expect(res.status).toBe(200);
    expect(res.body.disponibilita['2099-06-01']).toBe(true);
    expect(res.body.disponibilita['2099-06-30']).toBe(true);
    expect(Object.keys(res.body.disponibilita).length).toBe(30); // giugno ha 30 giorni
  });

  test('una notte prenotata sulla camera di test risulta non disponibile, il checkout resta libero', async () => {
    const prenotazione = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoMeseId, data_arrivo: '2099-07-10', data_partenza: '2099-07-12',
      nome: 'DispMese', cognome: 'Test', email: `dispmese${SUFFISSO}@example.com`,
    });
    expect(prenotazione.status).toBe(201);
    prenotazioniMese.push(prenotazione.body.prenotazione_id);

    const res = await request(app)
      .get('/api/booking-pubblico/disponibilita-mese')
      .query({ anno: 2099, mese: 7, adulti: capienzaIsolante });

    expect(res.status).toBe(200);
    // Notti occupate: 10 e 11 luglio. Il 12 è il giorno di checkout — la
    // notte del 12 (arrivo di un altro ospite) resta libera, stessa
    // semantica '[)' già usata in disponibilita().
    expect(res.body.disponibilita['2099-07-10']).toBe(false);
    expect(res.body.disponibilita['2099-07-11']).toBe(false);
    expect(res.body.disponibilita['2099-07-12']).toBe(true);
    expect(res.body.disponibilita['2099-07-01']).toBe(true);
  });

  test('capienza richiesta irrealisticamente alta: nessuna tipologia soddisfa, notte non disponibile', async () => {
    const res = await request(app)
      .get('/api/booking-pubblico/disponibilita-mese')
      .query({ anno: 2099, mese: 8, adulti: 20 });

    expect(res.status).toBe(200);
    expect(res.body.disponibilita['2099-08-15']).toBe(false);
  });
});

describe('POST /api/booking-pubblico/prenota', () => {
  test('crea una prenotazione opzione con hold breve e un PaymentIntent', async () => {
    const res = await request(app)
      .post('/api/booking-pubblico/prenota')
      .send({
        tipo_camera_id: tipoCameraTestId,
        data_arrivo: '2099-07-01',
        data_partenza: '2099-07-03',
        adulti: 1,
        bambini_eta: [5],
        nome: 'Mario',
        cognome: 'Rossi',
        email: `mario.rossi${SUFFISSO}@example.com`,
        telefono: '3331234567',
      });

    expect(res.status).toBe(201);
    expect(res.body.client_secret).toBeDefined();
    expect(res.body.importo_caparra).toBe(60); // 30% di 200
    prenotazioniCreate.push(res.body.prenotazione_id);

    const db = getPool();
    const prenotazione = await db.query('SELECT stato, canale_origine, data_scadenza_opzione FROM prenotazioni WHERE id = $1', [res.body.prenotazione_id]);
    expect(prenotazione.rows[0].stato).toBe('opzione');
    expect(prenotazione.rows[0].canale_origine).toBe('sito_diretto');

    const pagamento = await db.query('SELECT tipo, stato, importo FROM pagamenti WHERE prenotazione_id = $1', [res.body.prenotazione_id]);
    expect(pagamento.rows[0].tipo).toBe('caparra');
    expect(pagamento.rows[0].stato).toBe('pending');
    expect(Number(pagamento.rows[0].importo)).toBe(60);

    // Fase A Booking Engine v2 (19/08/2026): composizione ospiti salvata
    // correttamente, num_ospiti derivato (1 adulto + 1 bambino = 2), non più
    // preso direttamente dal client.
    const soggiorno = await db.query('SELECT num_ospiti, composizione_ospiti FROM soggiorni WHERE prenotazione_id = $1', [res.body.prenotazione_id]);
    expect(soggiorno.rows[0].num_ospiti).toBe(2);
    expect(soggiorno.rows[0].composizione_ospiti).toEqual({ adulti: 1, bambini_eta: [5] });
  });

  test('400 se la composizione ospiti supera la capienza massima del tipo camera', async () => {
    const res = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-07-10', data_partenza: '2099-07-12',
      adulti: 2, bambini_eta: [4, 7], // 4 persone, capienza_max del tipo di test è 2
      nome: 'Troppi', cognome: 'Ospiti', email: `troppiospiti${SUFFISSO}@example.com`,
    });
    expect(res.status).toBe(400);
  });

  test('409 se la camera è già occupata in quelle date (nessun tipo camera alternativo libero)', async () => {
    const prima = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-08-01', data_partenza: '2099-08-03',
      nome: 'Anna', cognome: 'Bianchi', email: `anna${SUFFISSO}@example.com`,
    });
    prenotazioniCreate.push(prima.body.prenotazione_id);

    const seconda = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-08-02', data_partenza: '2099-08-04',
      nome: 'Luca', cognome: 'Verdi', email: `luca${SUFFISSO}@example.com`,
    });
    expect(seconda.status).toBe(409);
  });

  test('400 se mancano nome/cognome/email', async () => {
    const res = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-09-01', data_partenza: '2099-09-03',
    });
    expect(res.status).toBe(400);
  });

  test('due richieste concorrenti sulla stessa camera/date: solo una riesce', async () => {
    const [prima, seconda] = await Promise.all([
      request(app).post('/api/booking-pubblico/prenota').send({
        tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-10-01', data_partenza: '2099-10-03',
        nome: 'Concorrente', cognome: 'Uno', email: `concorrente1${SUFFISSO}@example.com`,
      }),
      request(app).post('/api/booking-pubblico/prenota').send({
        tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-10-01', data_partenza: '2099-10-03',
        nome: 'Concorrente', cognome: 'Due', email: `concorrente2${SUFFISSO}@example.com`,
      }),
    ]);

    const successi = [prima, seconda].filter(r => r.status === 201);
    const conflitti = [prima, seconda].filter(r => r.status === 409);
    expect(successi.length).toBe(1);
    expect(conflitti.length).toBe(1);

    if (successi[0]) prenotazioniCreate.push(successi[0].body.prenotazione_id);
  });
});

// Shared inventory (migration 050, 19/08/2026) — camere fisiche vendibili
// sotto più identità/prezzi (es. Singola/Matrimoniale Piccola sulle camere
// 2,7,12,21 reali) e supplemento letto extra (Tripla/Quadrupla, prezzo
// derivato dal tipo base + percentuale, mai una tariffa propria). Fixture
// dedicate, non le camere reali — stesso principio di isolamento del resto
// del file.
describe('Shared inventory (migration 050)', () => {
  let tipoAId, tipoBId, cameraCondivisaId;
  let tipoBaseId, tipoSupplementoId, cameraBaseId, cameraSupplementoId;
  const prenotazioniShared = [];

  beforeAll(async () => {
    const db = getPool();

    // Due tipi che condividono UNA sola camera fisica — stesso schema di
    // Singola/Matrimoniale Piccola sulle camere 2,7,12,21 reali.
    const tipoA = await db.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ($1, 1) RETURNING id`, [`TestSharedA${SUFFISSO}`]);
    tipoAId = tipoA.rows[0].id;
    const tipoB = await db.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ($1, 2) RETURNING id`, [`TestSharedB${SUFFISSO}`]);
    tipoBId = tipoB.rows[0].id;
    const cameraCondivisa = await db.query(
      `INSERT INTO camere (numero, nome, piano, attivo) VALUES ($1, 'Camera Test Shared', 9, true) RETURNING id`,
      [`TEST-SHARED${SUFFISSO}`]
    );
    cameraCondivisaId = cameraCondivisa.rows[0].id;
    await db.query(
      `INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $3), ($2, $3)`,
      [tipoAId, tipoBId, cameraCondivisaId]
    );
    await db.query(
      `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte) VALUES ($1, 'Test', '2099-01-01', '2099-12-31', 50)`,
      [tipoAId]
    );
    await db.query(
      `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte) VALUES ($1, 'Test', '2099-01-01', '2099-12-31', 80)`,
      [tipoBId]
    );

    // Tipo base + tipo con supplemento — prezzo sempre derivato, mai una
    // tariffa propria in `tariffe` (così non si disallinea quando cambia
    // il prezzo del tipo base, il problema che aveva la prima versione).
    const tipoBase = await db.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ($1, 2) RETURNING id`, [`TestBase${SUFFISSO}`]);
    tipoBaseId = tipoBase.rows[0].id;
    // prezzo_base_tipo_id/supplemento_percentuale su tipi_camera sono le
    // colonne STORICHE (migration 050, 19/08/2026) — non più lette da
    // calcolaTariffa dopo il modulo tariffe derivate (20/08/2026, migration
    // 051): il meccanismo vero ora è regole_derivazione_tariffe, sotto.
    // Le teniamo qui solo per realismo con i dati di produzione (migrati,
    // non cancellati), ma la riga che conta per il test è l'INSERT dopo.
    const tipoSupplemento = await db.query(
      `INSERT INTO tipi_camera (nome, capienza_max, prezzo_base_tipo_id, supplemento_percentuale) VALUES ($1, 3, $2, 30) RETURNING id`,
      [`TestSupplemento${SUFFISSO}`, tipoBaseId]
    );
    tipoSupplementoId = tipoSupplemento.rows[0].id;
    await db.query(
      `INSERT INTO regole_derivazione_tariffe (tipo_camera_id, tipo_camera_base_id, periodo_id, percentuale)
       VALUES ($1, $2, NULL, 30)`,
      [tipoSupplementoId, tipoBaseId]
    );
    const cameraBase = await db.query(
      `INSERT INTO camere (numero, nome, piano, attivo) VALUES ($1, 'Camera Test Base', 9, true) RETURNING id`,
      [`TEST-BASE${SUFFISSO}`]
    );
    cameraBaseId = cameraBase.rows[0].id;
    const cameraSupplemento = await db.query(
      `INSERT INTO camere (numero, nome, piano, attivo) VALUES ($1, 'Camera Test Supplemento', 9, true) RETURNING id`,
      [`TEST-SUPP${SUFFISSO}`]
    );
    cameraSupplementoId = cameraSupplemento.rows[0].id;
    await db.query(`INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`, [tipoBaseId, cameraBaseId]);
    await db.query(`INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`, [tipoSupplementoId, cameraSupplementoId]);
    await db.query(
      `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte) VALUES ($1, 'Test', '2099-01-01', '2099-12-31', 100)`,
      [tipoBaseId]
    );
  });

  afterAll(async () => {
    const db = getPool();
    const tuttiITipi = [tipoAId, tipoBId, tipoBaseId, tipoSupplementoId];
    if (prenotazioniShared.length) {
      await db.query('DELETE FROM pagamenti WHERE prenotazione_id = ANY($1)', [prenotazioniShared]);
      await db.query('DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (SELECT id FROM soggiorni WHERE prenotazione_id = ANY($1))', [prenotazioniShared]);
      await db.query('DELETE FROM soggiorni WHERE prenotazione_id = ANY($1)', [prenotazioniShared]);
      await db.query('DELETE FROM prenotazioni WHERE id = ANY($1)', [prenotazioniShared]);
    }
    await db.query('DELETE FROM tipi_camera_camere WHERE tipo_camera_id = ANY($1)', [tuttiITipi]);
    await db.query('DELETE FROM regole_derivazione_tariffe WHERE tipo_camera_id = ANY($1)', [tuttiITipi]);
    await db.query('DELETE FROM tariffe WHERE tipo_camera_id = ANY($1)', [tuttiITipi]);
    await db.query('DELETE FROM camere WHERE id = ANY($1)', [[cameraCondivisaId, cameraBaseId, cameraSupplementoId]]);
    await db.query('DELETE FROM tipi_camera WHERE id = ANY($1)', [tuttiITipi]);
  });

  test("due tipi che condividono la stessa camera fisica: prenotarne uno esaurisce anche l'altro", async () => {
    const datiRicerca = { data_arrivo: '2099-04-01', data_partenza: '2099-04-03', adulti: 1 };

    const primaRicercaA = await request(app).get('/api/booking-pubblico/disponibilita').query(datiRicerca);
    expect(primaRicercaA.body.find(t => t.id === tipoAId)).toBeDefined();
    const primaRicercaB = await request(app).get('/api/booking-pubblico/disponibilita').query(datiRicerca);
    expect(primaRicercaB.body.find(t => t.id === tipoBId)).toBeDefined();

    const prenotazione = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoAId, ...datiRicerca,
      nome: 'Shared', cognome: 'Test', email: `shared${SUFFISSO}@example.com`,
    });
    expect(prenotazione.status).toBe(201);
    prenotazioniShared.push(prenotazione.body.prenotazione_id);

    const dopoRicercaA = await request(app).get('/api/booking-pubblico/disponibilita').query(datiRicerca);
    expect(dopoRicercaA.body.find(t => t.id === tipoAId)).toBeUndefined();
    const dopoRicercaB = await request(app).get('/api/booking-pubblico/disponibilita').query(datiRicerca);
    expect(dopoRicercaB.body.find(t => t.id === tipoBId)).toBeUndefined();
  });

  test("tipo_camera_venduto_id registra l'identità venduta, non l'etichetta fisica della camera", async () => {
    const prenotazione = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoBId, data_arrivo: '2099-04-10', data_partenza: '2099-04-12', adulti: 2,
      nome: 'Venduto', cognome: 'Test', email: `venduto${SUFFISSO}@example.com`,
    });
    expect(prenotazione.status).toBe(201);
    prenotazioniShared.push(prenotazione.body.prenotazione_id);

    const db = getPool();
    const soggiorno = await db.query(
      'SELECT tipo_camera_venduto_id, camera_id FROM soggiorni WHERE prenotazione_id = $1',
      [prenotazione.body.prenotazione_id]
    );
    expect(soggiorno.rows[0].tipo_camera_venduto_id).toBe(tipoBId);
    expect(soggiorno.rows[0].camera_id).toBe(cameraCondivisaId);
  });

  test('prezzo di un tipo con supplemento è calcolato dal tipo base, mai da una tariffa propria', async () => {
    const res = await request(app).get('/api/booking-pubblico/disponibilita').query({
      data_arrivo: '2099-05-01', data_partenza: '2099-05-03', adulti: 3,
    });
    const base = res.body.find(t => t.id === tipoBaseId);
    const supplemento = res.body.find(t => t.id === tipoSupplementoId);
    // capienza_max del tipo base è 2, la ricerca è per 3 adulti: non deve comparire.
    expect(base).toBeUndefined();
    expect(supplemento).toBeDefined();
    // 2 notti × 100€/notte (tariffa del tipo BASE) × 1.30 = 260€ — TestSupplemento
    // non ha nessuna riga propria in `tariffe`, solo la regola di derivazione.
    expect(supplemento.prezzi.bb).toBe(260);
  });
});

// Tariffe derivate — periodi, clamp, trattamento, bambini (Modulo tariffe
// derivate, 20/08/2026, migration 051). Fixture dedicate, isolate dal resto
// del file. configurazione_bambini è una tabella globale a riga singola:
// il valore originale viene salvato e ripristinato, mai lasciato alterato
// per gli altri test del progetto.
describe('Tariffe derivate — periodi, clamp, trattamento, bambini', () => {
  let tipoMadreId, tipoDerivatoId, periodoId;
  let scontoBambiniOriginale;
  const prenotazioniTariffeDerivate = [];

  beforeAll(async () => {
    const db = getPool();

    const madre = await db.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ($1, 2) RETURNING id`, [`TestMadreDerivate${SUFFISSO}`]);
    tipoMadreId = madre.rows[0].id;
    const cameraMadre = await db.query(
      `INSERT INTO camere (numero, nome, piano, attivo) VALUES ($1, 'Camera Test Madre Derivate', 9, true) RETURNING id`,
      [`TEST-TD-M${SUFFISSO}`]
    );
    await db.query(`INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`, [tipoMadreId, cameraMadre.rows[0].id]);
    await db.query(
      `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte) VALUES ($1, 'Test', '2099-01-01', '2099-12-31', 100)`,
      [tipoMadreId]
    );

    const derivato = await db.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ($1, 3) RETURNING id`, [`TestDerivatoPeriodi${SUFFISSO}`]);
    tipoDerivatoId = derivato.rows[0].id;

    const periodo = await db.query(
      `INSERT INTO periodi_stagionali (nome, data_inizio, data_fine) VALUES ($1, '2099-08-01', '2099-08-31') RETURNING id`,
      [`TestPeriodoAlta${SUFFISSO}`]
    );
    periodoId = periodo.rows[0].id;

    // Fallback (valido tutto l'anno, nessun periodo specifico): +20%, nessun
    // range dichiarato — il clamp resta inattivo qui, di proposito.
    await db.query(
      `INSERT INTO regole_derivazione_tariffe (tipo_camera_id, tipo_camera_base_id, periodo_id, percentuale) VALUES ($1, $2, NULL, 20)`,
      [tipoDerivatoId, tipoMadreId]
    );
    // Regola specifica per il periodo "alta stagione": +50%, con un massimo
    // dichiarato di 130€/notte — più basso del calcolo naturale (150€/notte),
    // deve scattare il clamp.
    await db.query(
      `INSERT INTO regole_derivazione_tariffe (tipo_camera_id, tipo_camera_base_id, periodo_id, percentuale, prezzo_massimo)
       VALUES ($1, $2, $3, 50, 130)`,
      [tipoDerivatoId, tipoMadreId, periodoId]
    );

    // Sconto bambini — sovrascritto con un valore noto per il test.
    const attuale = await db.query(`SELECT sconto_mezza_pensione_percentuale FROM configurazione_bambini WHERE id = 1`);
    scontoBambiniOriginale = attuale.rows[0]?.sconto_mezza_pensione_percentuale ?? 0;
    await db.query(`UPDATE configurazione_bambini SET sconto_mezza_pensione_percentuale = 50 WHERE id = 1`);

    // Supplemento mezza pensione, categoria 'doppia' (capienza_max 2 = tipoMadreId), fallback valido tutto l'anno.
    await db.query(
      `INSERT INTO supplementi_trattamento (categoria, periodo_id, trattamento, supplemento_a_persona) VALUES ('doppia', NULL, 'mezza_pensione', 20)`
    );
  });

  afterAll(async () => {
    const db = getPool();
    if (prenotazioniTariffeDerivate.length) {
      await db.query('DELETE FROM pagamenti WHERE prenotazione_id = ANY($1)', [prenotazioniTariffeDerivate]);
      await db.query('DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (SELECT id FROM soggiorni WHERE prenotazione_id = ANY($1))', [prenotazioniTariffeDerivate]);
      await db.query('DELETE FROM soggiorni WHERE prenotazione_id = ANY($1)', [prenotazioniTariffeDerivate]);
      await db.query('DELETE FROM prenotazioni WHERE id = ANY($1)', [prenotazioniTariffeDerivate]);
    }
    await db.query(`UPDATE configurazione_bambini SET sconto_mezza_pensione_percentuale = $1 WHERE id = 1`, [scontoBambiniOriginale]);
    await db.query(`DELETE FROM supplementi_trattamento WHERE categoria = 'doppia' AND trattamento = 'mezza_pensione' AND periodo_id IS NULL AND supplemento_a_persona = 20`);
    await db.query('DELETE FROM regole_derivazione_tariffe WHERE tipo_camera_id = $1', [tipoDerivatoId]);
    await db.query('DELETE FROM tipi_camera_camere WHERE tipo_camera_id = $1', [tipoMadreId]);
    await db.query('DELETE FROM tariffe WHERE tipo_camera_id = $1', [tipoMadreId]);
    await db.query(`DELETE FROM camere WHERE numero = $1`, [`TEST-TD-M${SUFFISSO}`]);
    await db.query('DELETE FROM periodi_stagionali WHERE id = $1', [periodoId]);
    await db.query('DELETE FROM tipi_camera WHERE id = ANY($1)', [[tipoMadreId, tipoDerivatoId]]);
  });

  test('percentuale di derivazione fuori periodo usa la regola di fallback', async () => {
    const res = await request(app).get('/api/tariffe/calcola').set(authHeader.titolare()).query({
      tipo_camera_id: tipoDerivatoId, data_arrivo: '2099-03-01', data_partenza: '2099-03-03',
    });
    expect(res.status).toBe(200);
    // 2 notti × 100€ × 1.20 = 240€ (fallback +20%, fuori dal periodo alta stagione).
    expect(res.body.prezzo_totale).toBe(240);
  });

  test('percentuale di derivazione dentro il periodo usa la regola specifica, con clamp sul massimo dichiarato', async () => {
    const res = await request(app).get('/api/tariffe/calcola').set(authHeader.titolare()).query({
      tipo_camera_id: tipoDerivatoId, data_arrivo: '2099-08-10', data_partenza: '2099-08-12',
    });
    expect(res.status).toBe(200);
    // 2 notti × 100€ × 1.50 = 300€ calcolato, ma il massimo dichiarato è
    // 130€/notte → clamp a 2×130 = 260€, con un avviso per ogni notte.
    expect(res.body.prezzo_totale).toBe(260);
    expect(res.body.avvisi.length).toBe(2);
  });

  test('supplemento trattamento a persona, con sconto bambini 3-11', async () => {
    const res = await request(app).get('/api/tariffe/calcola').set(authHeader.titolare()).query({
      tipo_camera_id: tipoMadreId, data_arrivo: '2099-03-01', data_partenza: '2099-03-03',
      trattamento: 'mezza_pensione', adulti: 2, bambini_eta: '5',
    });
    expect(res.status).toBe(200);
    // Camera: 2 notti × 100€ = 200€.
    // Supplemento: 20€/notte/persona × (2 adulti + 1 bambino 5 anni scontato al 50%) × 2 notti
    //   = (20×2 + 20×0.5) × 2 = 50×2 = 100€.
    expect(res.body.prezzo_camera).toBe(200);
    expect(res.body.supplemento_trattamento).toBe(100);
    expect(res.body.prezzo_totale).toBe(300);
  });

  test('bambino 0-2 anni non pesa sulla capienza, un bambino 3-11 sì', async () => {
    const conNeonato = await request(app).get('/api/booking-pubblico/disponibilita').query({
      data_arrivo: '2099-03-01', data_partenza: '2099-03-03', adulti: 2, bambini_eta: '1',
    });
    expect(conNeonato.body.find(t => t.id === tipoMadreId)).toBeDefined();

    const conBambino = await request(app).get('/api/booking-pubblico/disponibilita').query({
      data_arrivo: '2099-03-01', data_partenza: '2099-03-03', adulti: 2, bambini_eta: '5',
    });
    expect(conBambino.body.find(t => t.id === tipoMadreId)).toBeUndefined();
  });

  test('prenota salva il trattamento scelto in soggiorni.trattamento', async () => {
    const res = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoMadreId, data_arrivo: '2099-03-15', data_partenza: '2099-03-17',
      adulti: 2, trattamento: 'mezza_pensione',
      nome: 'Trattamento', cognome: 'Test', email: `trattamento${SUFFISSO}@example.com`,
    });
    expect(res.status).toBe(201);
    prenotazioniTariffeDerivate.push(res.body.prenotazione_id);
    const db = getPool();
    const soggiorno = await db.query('SELECT trattamento FROM soggiorni WHERE prenotazione_id = $1', [res.body.prenotazione_id]);
    expect(soggiorno.rows[0].trattamento).toBe('mezza_pensione');
  });
});

// Bugfix 20/08/2026 (sera, trovato in code review) — calcolaPrezzoCameraPerNotte
// usava una sola base (regoleResult.rows[0], riga scelta arbitrariamente da una
// query senza ORDER BY) per tutte le notti dell'anno, anche quando la regola
// fallback e una regola per periodo dello stesso tipo derivato puntano a DUE
// tipi camera base diversi — possibile da quando la UI (SchedaPrezzoTipologia)
// permette di scegliere "Deriva da" indipendentemente per ogni periodo. Fixture
// dedicata: due tipi madre con prezzi diretti diversi, un derivato la cui
// regola fallback punta al primo e la cui regola per periodo punta al secondo.
describe('Tariffe derivate — basi diverse tra fallback e periodo (bugfix code review 20/08/2026)', () => {
  let tipoMadreAId, tipoMadreBId, tipoDerivatoMistoId, periodoMistoId;

  beforeAll(async () => {
    const db = getPool();

    const madreA = await db.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ($1, 2) RETURNING id`, [`TestMadreA${SUFFISSO}`]);
    tipoMadreAId = madreA.rows[0].id;
    await db.query(
      `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte) VALUES ($1, 'Test', '2099-01-01', '2099-12-31', 100)`,
      [tipoMadreAId]
    );

    const madreB = await db.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ($1, 2) RETURNING id`, [`TestMadreB${SUFFISSO}`]);
    tipoMadreBId = madreB.rows[0].id;
    await db.query(
      `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte) VALUES ($1, 'Test', '2099-01-01', '2099-12-31', 300)`,
      [tipoMadreBId]
    );

    const derivato = await db.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ($1, 3) RETURNING id`, [`TestDerivatoMisto${SUFFISSO}`]);
    tipoDerivatoMistoId = derivato.rows[0].id;

    const periodo = await db.query(
      `INSERT INTO periodi_stagionali (nome, data_inizio, data_fine) VALUES ($1, '2099-09-01', '2099-09-30') RETURNING id`,
      [`TestPeriodoMisto${SUFFISSO}`]
    );
    periodoMistoId = periodo.rows[0].id;

    // Fallback: deriva da madreA (100€/notte) — fuori dal periodo, +10% = 110€/notte.
    await db.query(
      `INSERT INTO regole_derivazione_tariffe (tipo_camera_id, tipo_camera_base_id, periodo_id, percentuale) VALUES ($1, $2, NULL, 10)`,
      [tipoDerivatoMistoId, tipoMadreAId]
    );
    // Periodo specifico: deriva da madreB (300€/notte) — dentro il periodo, +10% = 330€/notte.
    // Se il bug fosse ancora presente, questa notte userebbe per errore madreA
    // (100€ → 110€) invece di madreB (300€ → 330€), perché la vecchia versione
    // leggeva un'unica base da una riga arbitraria.
    await db.query(
      `INSERT INTO regole_derivazione_tariffe (tipo_camera_id, tipo_camera_base_id, periodo_id, percentuale) VALUES ($1, $2, $3, 10)`,
      [tipoDerivatoMistoId, tipoMadreBId, periodoMistoId]
    );
  });

  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM regole_derivazione_tariffe WHERE tipo_camera_id = $1', [tipoDerivatoMistoId]);
    await db.query('DELETE FROM tariffe WHERE tipo_camera_id = ANY($1)', [[tipoMadreAId, tipoMadreBId]]);
    await db.query('DELETE FROM periodi_stagionali WHERE id = $1', [periodoMistoId]);
    await db.query('DELETE FROM tipi_camera WHERE id = ANY($1)', [[tipoMadreAId, tipoMadreBId, tipoDerivatoMistoId]]);
  });

  test('fuori periodo usa la base della regola fallback (madreA, 100€ → 110€)', async () => {
    const res = await request(app).get('/api/tariffe/calcola').set(authHeader.titolare()).query({
      tipo_camera_id: tipoDerivatoMistoId, data_arrivo: '2099-03-01', data_partenza: '2099-03-02',
    });
    expect(res.status).toBe(200);
    expect(res.body.prezzo_totale).toBe(110);
  });

  test('dentro il periodo usa la base della regola specifica (madreB, 300€ → 330€), non quella del fallback', async () => {
    const res = await request(app).get('/api/tariffe/calcola').set(authHeader.titolare()).query({
      tipo_camera_id: tipoDerivatoMistoId, data_arrivo: '2099-09-10', data_partenza: '2099-09-11',
    });
    expect(res.status).toBe(200);
    expect(res.body.prezzo_totale).toBe(330);
  });

  test('un soggiorno a cavallo tra i due periodi usa la base corretta notte per notte', async () => {
    // 31 agosto (fuori periodo, madreA) + 1 settembre (dentro il periodo, madreB) = 110 + 330 = 440.
    const res = await request(app).get('/api/tariffe/calcola').set(authHeader.titolare()).query({
      tipo_camera_id: tipoDerivatoMistoId, data_arrivo: '2099-08-31', data_partenza: '2099-09-02',
    });
    expect(res.status).toBe(200);
    expect(res.body.prezzo_totale).toBe(440);
  });
});

describe('POST /api/stripe/webhook', () => {
  function creaEventoFirmato(payload, secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    const payloadString = JSON.stringify(payload);
    const firmaPayload = `${timestamp}.${payloadString}`;
    const firma = crypto.createHmac('sha256', secret).update(firmaPayload, 'utf8').digest('hex');
    return { header: `t=${timestamp},v1=${firma}`, body: payloadString };
  }

  test('400 se la firma non è valida', async () => {
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=123,v1=firma_finta')
      .send(JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } }));
    expect(res.status).toBe(400);
  });

  test('conferma la prenotazione e crea il pagamento completato quando il webhook arriva entro i 15 minuti', async () => {
    const prenotazione = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-11-01', data_partenza: '2099-11-03',
      nome: 'Webhook', cognome: 'Test', email: `webhook${SUFFISSO}@example.com`,
    });
    prenotazioniCreate.push(prenotazione.body.prenotazione_id);

    const db = getPool();
    const pagamento = await db.query('SELECT external_payment_id FROM pagamenti WHERE prenotazione_id = $1', [prenotazione.body.prenotazione_id]);
    const paymentIntentId = pagamento.rows[0].external_payment_id;

    const evento = {
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId, metadata: { prenotazione_id: String(prenotazione.body.prenotazione_id) } } },
    };
    const { header, body } = creaEventoFirmato(evento, process.env.STRIPE_WEBHOOK_SECRET);

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', header)
      .send(body);

    expect(res.status).toBe(200);

    const prenotazioneAggiornata = await db.query('SELECT stato FROM prenotazioni WHERE id = $1', [prenotazione.body.prenotazione_id]);
    expect(prenotazioneAggiornata.rows[0].stato).toBe('confermata');

    const pagamentoAggiornato = await db.query('SELECT stato FROM pagamenti WHERE prenotazione_id = $1', [prenotazione.body.prenotazione_id]);
    expect(pagamentoAggiornato.rows[0].stato).toBe('completato');
  });

  test('rimborsa e interrompe la prenotazione se il webhook arriva dopo la scadenza del blocco', async () => {
    const prenotazione = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-12-01', data_partenza: '2099-12-03',
      nome: 'Scaduto', cognome: 'Test', email: `scaduto${SUFFISSO}@example.com`,
    });
    prenotazioniCreate.push(prenotazione.body.prenotazione_id);

    const db = getPool();
    await db.query(`UPDATE prenotazioni SET data_scadenza_opzione = NOW() - INTERVAL '1 minute' WHERE id = $1`, [prenotazione.body.prenotazione_id]);
    const pagamento = await db.query('SELECT external_payment_id FROM pagamenti WHERE prenotazione_id = $1', [prenotazione.body.prenotazione_id]);
    const paymentIntentId = pagamento.rows[0].external_payment_id;

    // Il webhook è firmato a mano qui sotto (mai un vero evento Stripe), quindi
    // il PaymentIntent va confermato per davvero con la carta di test Stripe
    // 'pm_card_visa' — altrimenti il rimborso richiesto più sotto fallisce
    // per davvero contro l'API Stripe ("nessun addebito riuscito da rimborsare").
    await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: 'pm_card_visa',
      return_url: 'https://example.com/return',
    });

    const evento = {
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId, metadata: { prenotazione_id: String(prenotazione.body.prenotazione_id) } } },
    };
    const { header, body } = creaEventoFirmato(evento, process.env.STRIPE_WEBHOOK_SECRET);

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', header)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.rimborsato).toBe(true);

    const prenotazioneAggiornata = await db.query('SELECT stato FROM prenotazioni WHERE id = $1', [prenotazione.body.prenotazione_id]);
    expect(prenotazioneAggiornata.rows[0].stato).toBe('interrotta');

    const pagamentoAggiornato = await db.query('SELECT stato FROM pagamenti WHERE prenotazione_id = $1', [prenotazione.body.prenotazione_id]);
    expect(pagamentoAggiornato.rows[0].stato).toBe('rimborsato');
  });

  // Bugfix 20/08/2026 (sera, trovato in code review) — race cron/webhook: qui
  // si simula il cron che interrompe la prenotazione (stato='interrotta',
  // soggiorno cancellato) PRIMA che il webhook del pagamento riuscito venga
  // elaborato, con il pagamento ancora 'pending' (mai marcato completato).
  // Prima del fix, il webhook vedeva stato !== 'opzione' e si fermava subito
  // senza rimborsare — l'ospite restava addebitato su Stripe senza
  // prenotazione e senza rimborso. Dopo il fix deve rimborsare comunque.
  test('rimborsa anche se il cron ha già interrotto la prenotazione prima del webhook (race)', async () => {
    const prenotazione = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-12-10', data_partenza: '2099-12-12',
      nome: 'Race', cognome: 'Test', email: `race${SUFFISSO}@example.com`,
    });
    prenotazioniCreate.push(prenotazione.body.prenotazione_id);

    const db = getPool();
    const pagamento = await db.query('SELECT external_payment_id FROM pagamenti WHERE prenotazione_id = $1', [prenotazione.body.prenotazione_id]);
    const paymentIntentId = pagamento.rows[0].external_payment_id;

    // Il pagamento viene confermato per davvero (serve per il rimborso vero
    // più sotto), ESATTAMENTE come nel test "scaduto" sopra.
    await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: 'pm_card_visa',
      return_url: 'https://example.com/return',
    });

    // Simula il cron scadenzaHoldBookingEngine.js: interrompe la prenotazione
    // e cancella il soggiorno SENZA sapere che il pagamento è nel frattempo
    // riuscito su Stripe (il cron non chiama mai Stripe, per scelta) — il
    // pagamento resta 'pending' in tabella, non toccato dal cron.
    await db.query(`UPDATE soggiorni SET cancellato = true WHERE prenotazione_id = $1`, [prenotazione.body.prenotazione_id]);
    await db.query(`UPDATE prenotazioni SET stato = 'interrotta', updated_at = NOW() WHERE id = $1`, [prenotazione.body.prenotazione_id]);

    // Solo ORA arriva il webhook del pagamento riuscito.
    const evento = {
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId, metadata: { prenotazione_id: String(prenotazione.body.prenotazione_id) } } },
    };
    const { header, body } = creaEventoFirmato(evento, process.env.STRIPE_WEBHOOK_SECRET);

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', header)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.rimborsato).toBe(true);

    const prenotazioneAggiornata = await db.query('SELECT stato FROM prenotazioni WHERE id = $1', [prenotazione.body.prenotazione_id]);
    expect(prenotazioneAggiornata.rows[0].stato).toBe('interrotta'); // resta interrotta, non resuscitata

    const pagamentoAggiornato = await db.query('SELECT stato FROM pagamenti WHERE prenotazione_id = $1', [prenotazione.body.prenotazione_id]);
    expect(pagamentoAggiornato.rows[0].stato).toBe('rimborsato'); // non più 'pending' a vuoto

    // Un secondo invio dello stesso evento (Stripe reinvia) non deve tentare
    // un secondo rimborso — il pagamento è già 'rimborsato', non più 'pending'.
    const res2 = await request(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', header)
      .send(body);
    expect(res2.status).toBe(200);
    expect(res2.body.rimborsato).toBeUndefined();
  });
});
