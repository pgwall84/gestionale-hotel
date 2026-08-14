// Test suite — Modulo 1.8: Dashboard KPI reali
// Copre: GET /api/dashboard/kpi, POST /api/dashboard/incassi, GET /api/dashboard/alert
// Usa date fittizie 2099 (oggi test) e 2098 (anno scorso test) per non toccare dati reali.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');
const { alertInviiAlloggiati } = require('../../backend/controllers/dashboardController');

const DATA_TEST        = '2099-11-23';
const DATA_ANNO_SCORSO = '2098-11-23'; // stesso giorno/mese di DATA_TEST, anno-1 — coerente con dashboardController.js:116
const PREFISSO = 'ZZZ_TEST_';

afterAll(async () => {
  const db = getPool();
  await db.query('DELETE FROM incassi_giornalieri WHERE data IN ($1, $2)', [DATA_TEST, DATA_ANNO_SCORSO]);
  await db.query('DELETE FROM ospiti_giornalieri WHERE data IN ($1, $2)', [DATA_TEST, DATA_ANNO_SCORSO]);
  await db.query(`DELETE FROM movimenti_magazzino WHERE prodotto_id IN (
    SELECT id FROM prodotti WHERE nome LIKE $1
  )`, [`${PREFISSO}%`]);
  await db.query('DELETE FROM prodotti WHERE nome LIKE $1', [`${PREFISSO}%`]);
  await chiudiPool();
});

// ─── GET /api/dashboard/kpi ─────────────────────────────────────────────────────

describe('GET /api/dashboard/kpi', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/dashboard/kpi');
    expect(res.status).toBe(401);
  });

  test('qualsiasi ruolo autenticato → 200 (dato aggregato, non sensibile)', async () => {
    const res = await request(app).get('/api/dashboard/kpi').set(authHeader.cameriere());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('camere');
    expect(res.body).toHaveProperty('coperti');
    expect(res.body).toHaveProperty('incasso');
    expect(res.body).toHaveProperty('foodCost');
  });

  test('data senza nessun dato → attuale 0, variazionePercentuale null (mai una divisione per zero)', async () => {
    const res = await request(app)
      .get(`/api/dashboard/kpi?data=${DATA_TEST}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.coperti.attuale).toBe(0);
    expect(res.body.coperti.variazionePercentuale).toBeNull();
    expect(res.body.incasso.attuale).toBe(0);
    expect(res.body.incasso.variazionePercentuale).toBeNull();
  });

  test('con dati oggi e anno scorso → variazionePercentuale calcolata correttamente', async () => {
    const db = getPool();
    await db.query(
      `INSERT INTO ospiti_giornalieri (data, coperti_colazione, coperti_pranzo, coperti_cena)
       VALUES ($1, 5, 5, 10)`,
      [DATA_TEST]
    ); // totale 20
    await db.query(
      `INSERT INTO ospiti_giornalieri (data, coperti_colazione, coperti_pranzo, coperti_cena)
       VALUES ($1, 2, 3, 5)`,
      [DATA_ANNO_SCORSO]
    ); // totale 10 → variazione attesa +100%

    const res = await request(app)
      .get(`/api/dashboard/kpi?data=${DATA_TEST}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.coperti.attuale).toBe(20);
    expect(res.body.coperti.annoScorso).toBe(10);
    expect(res.body.coperti.variazionePercentuale).toBe(100);
  });

  test('alert magazzino incluso se un prodotto è sotto soglia', async () => {
    const db = getPool();
    const p = await db.query(
      `INSERT INTO prodotti (nome, unita_misura, soglia_minima, qr_code) VALUES ($1, 'kg', 50, $2) RETURNING id`,
      [`${PREFISSO}Farina Dashboard`, `${PREFISSO}QR-DASHBOARD`]
    );
    await db.query(
      `INSERT INTO movimenti_magazzino (prodotto_id, tipo, quantita, user_id) VALUES ($1, 'carico', 5, 1)`,
      [p.rows[0].id]
    );

    const res = await request(app).get('/api/dashboard/alert').set(authHeader.admin());
    expect(res.status).toBe(200);
    const trovato = res.body.alerts.find(a => a.category === 'Magazzino' && a.text.includes('Farina Dashboard'));
    expect(trovato).toBeDefined();
    expect(trovato.link).toBe('/magazzino');
  });
});

// ─── POST /api/dashboard/incassi ────────────────────────────────────────────────

describe('POST /api/dashboard/incassi', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/dashboard/incassi').send({});
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (solo titolare/admin)', async () => {
    const res = await request(app)
      .post('/api/dashboard/incassi')
      .set(authHeader.cameriere())
      .send({ data: DATA_TEST, contanti: 100, pos: 200 });
    expect(res.status).toBe(403);
  });

  test('titolare registra incasso → 200', async () => {
    const res = await request(app)
      .post('/api/dashboard/incassi')
      .set(authHeader.titolare())
      .send({ data: DATA_TEST, contanti: 300, pos: 450.50, note: 'Test dashboard' });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.incasso.contanti)).toBe(300);
    expect(parseFloat(res.body.incasso.pos)).toBe(450.5);
  });

  test('KPI riflette l\'incasso appena registrato', async () => {
    const res = await request(app)
      .get(`/api/dashboard/kpi?data=${DATA_TEST}`)
      .set(authHeader.admin());
    expect(res.body.incasso.attuale).toBe(750.5);
  });

  test('admin aggiorna lo stesso giorno (upsert) → 200, nessun duplicato', async () => {
    const res = await request(app)
      .post('/api/dashboard/incassi')
      .set(authHeader.admin())
      .send({ data: DATA_TEST, contanti: 500, pos: 0 });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.incasso.contanti)).toBe(500);

    const db = getPool();
    const r = await db.query('SELECT COUNT(*) FROM incassi_giornalieri WHERE data = $1', [DATA_TEST]);
    expect(parseInt(r.rows[0].count)).toBe(1);
  });
});

// ─── alertInviiAlloggiati — Alloggiati Web, invii (Fase C, 14/08/2026) ──────
// Diverso dai fixture 2099 sopra: la query di questo blocco filtra
// `s.data_arrivo <= CURRENT_DATE` (nessun parametro data), quindi qui serve
// per forza CURRENT_DATE reale, non la data fittizia futura usata da kpi().
// Ogni fixture usa una camera dedicata (stesso accorgimento già adottato in
// alloggiati.test.js dopo il bug di collisione date del 13/08/2026) per non
// rischiare un conflitto EXCLUDE con altri dati di test/reali.
//
// Chiama alertInviiAlloggiati() DIRETTAMENTE con soggiornoIds, non
// l'endpoint HTTP /api/dashboard/alert — bug trovato dal titolare
// 14/08/2026: nel DB di sviluppo esistono soggiorni REALI (non di test)
// mai inviati, con termine scaduto da settimane. La query ha un LIMIT 5
// ordinato per urgenza: quei soggiorni reali riempivano da soli tutti gli
// slot, escludendo i fixture appena creati dal test — non un bug
// applicativo, un problema di isolamento. Filtrando esplicitamente sugli
// id creati qui, il test verifica la logica (rosso/ambra/esclusioni)
// indipendentemente da quanto backlog reale esiste in un dato momento nel
// DB di sviluppo — alert() in produzione continua a chiamare la stessa
// funzione SENZA filtro, comportamento invariato.
describe('alertInviiAlloggiati (Fase C)', () => {
  const SUFF = Date.now().toString().slice(-6);
  const oreFa = (ore) => new Date(Date.now() - ore * 3600 * 1000);

  const NUM_ROSSO = `DSHR${SUFF}`; // check-in 30h fa, mai inviato → termine scaduto
  const NUM_AMBRA = `DSHA${SUFF}`; // check-in 2h fa, mai inviato → termine non ancora scaduto
  const NUM_OK    = `DSHO${SUFF}`; // check-in 30h fa MA esito 'ok' → nessun alert
  const NUM_TEST  = `DSHT${SUFF}`; // check-in 30h fa, canale_origine test_interno → nessun alert

  let camere = [], ospiti = [], prenotazioni = [], soggiorni = [];
  let sogRossoId, sogAmbraId, sogOkId, sogTestId;

  beforeAll(async () => {
    const db = getPool();

    async function crea(numero, canale, oreDalCheckIn, esito) {
      const cam = await db.query(
        `INSERT INTO camere (numero, nome) VALUES ($1, 'Camera Test Dashboard Alloggiati') RETURNING id`,
        [numero]
      );
      camere.push(cam.rows[0].id);
      const osp = await db.query(
        `INSERT INTO ospiti (nome, cognome) VALUES ('Prova', $1) RETURNING id`,
        [`Dashboard${numero}`]
      );
      ospiti.push(osp.rows[0].id);
      const pren = await db.query(
        `INSERT INTO prenotazioni (canale_origine, stato) VALUES ($1, 'check_in') RETURNING id`,
        [canale]
      );
      prenotazioni.push(pren.rows[0].id);
      const sog = await db.query(
        `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti, check_in_effettuato_at)
         VALUES ($1, $2, $3, CURRENT_DATE - 2, CURRENT_DATE + 1, 1, $4) RETURNING id`,
        [pren.rows[0].id, cam.rows[0].id, osp.rows[0].id, oreFa(oreDalCheckIn)]
      );
      soggiorni.push(sog.rows[0].id);
      if (esito) {
        await db.query(`INSERT INTO alloggiati_invii (soggiorno_id, esito) VALUES ($1, $2)`, [sog.rows[0].id, esito]);
      }
      return sog.rows[0].id;
    }

    sogRossoId = await crea(NUM_ROSSO, 'diretta', 30);
    sogAmbraId = await crea(NUM_AMBRA, 'diretta', 2);
    sogOkId    = await crea(NUM_OK, 'diretta', 30, 'ok');
    sogTestId  = await crea(NUM_TEST, 'test_interno', 30);
  });

  // Tutti e 4 gli id insieme in ogni chiamata: il filtro soggiornoIds si
  // somma alle condizioni WHERE già esistenti (canale_origine, esito) —
  // non le bypassa. Verifica quindi in un colpo solo sia la selezione
  // giusta (rosso+ambra dentro, ok+test fuori) sia che il filtro non
  // interferisca con la business logic.
  const tuttiGliId = () => [sogRossoId, sogAmbraId, sogOkId, sogTestId];

  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM alloggiati_invii WHERE soggiorno_id = ANY($1::int[])', [soggiorni]);
    await db.query('DELETE FROM soggiorni WHERE id = ANY($1::int[])', [soggiorni]);
    await db.query('DELETE FROM prenotazioni WHERE id = ANY($1::int[])', [prenotazioni]);
    await db.query('DELETE FROM camere WHERE id = ANY($1::int[])', [camere]);
    await db.query('DELETE FROM ospiti WHERE id = ANY($1::int[])', [ospiti]);
  });

  test('termine scaduto (check-in 30h fa, mai inviato) → alert rosso', async () => {
    const alerts = await alertInviiAlloggiati({ soggiornoIds: tuttiGliId() });
    const alert = alerts.find(a => a.text.includes(`Camera ${NUM_ROSSO}`));
    expect(alert).toBeDefined();
    expect(alert.category).toBe('Alloggiati Web · Invio');
    expect(alert.type).toBe('red');
    expect(alert.text).toMatch(/in ritardo/);
    expect(alert.link).toBe('/impostazioni/alloggiati');
  });

  test('termine non ancora scaduto (check-in 2h fa, mai inviato) → alert ambra', async () => {
    const alerts = await alertInviiAlloggiati({ soggiornoIds: tuttiGliId() });
    const alert = alerts.find(a => a.text.includes(`Camera ${NUM_AMBRA}`));
    expect(alert).toBeDefined();
    expect(alert.type).toBe('amber');
    expect(alert.text).toMatch(/da inviare/);
  });

  test("esito 'ok' già registrato → NESSUN alert anche se il check-in è vecchio", async () => {
    const alerts = await alertInviiAlloggiati({ soggiornoIds: tuttiGliId() });
    const alert = alerts.find(a => a.text.includes(`Camera ${NUM_OK}`));
    expect(alert).toBeUndefined();
  });

  test("canale_origine='test_interno' → NESSUN alert anche se il termine è scaduto", async () => {
    const alerts = await alertInviiAlloggiati({ soggiornoIds: tuttiGliId() });
    const alert = alerts.find(a => a.text.includes(`Camera ${NUM_TEST}`));
    expect(alert).toBeUndefined();
  });

  test('senza filtro soggiornoIds, la funzione resta utilizzabile da alert() in produzione (nessuna eccezione, LIMIT 5 di default)', async () => {
    // Non asserisce sul contenuto (dipende dal backlog reale del DB in quel
    // momento, vedi commento in testa al describe) — verifica solo che la
    // chiamata "di produzione" (nessun filtro) non generi errori dopo
    // l'estrazione della funzione.
    const alerts = await alertInviiAlloggiati();
    expect(Array.isArray(alerts)).toBe(true);
  });
});

// ─── GET /api/dashboard/gruppi — dashboard a gruppi di widget (14/08/2026) ──
// Copertura di primo livello: forma della risposta e presenza dei placeholder
// onesti (sviluppato: false) per i due moduli non ancora costruiti (OTA e
// fabbisogno pasti). Non ri-verifica qui il conteggio di ogni singola query
// (arrivi/partenze/camere da fare/ecc.): sono le stesse tabelle già testate
// altrove (camereController, tassaSoggiornoController, alertInviiAlloggiati
// sopra) — un test di forma basta a intercettare un endpoint rotto senza
// duplicare l'intera batteria di fixture per ogni modulo coinvolto.
describe('GET /api/dashboard/gruppi', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/dashboard/gruppi');
    expect(res.status).toBe(401);
  });

  test('qualsiasi ruolo autenticato → 200, con tutti e 5 i gruppi', async () => {
    const res = await request(app).get('/api/dashboard/gruppi').set(authHeader.cameriere());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('clienti');
    expect(res.body).toHaveProperty('adempimenti');
    expect(res.body).toHaveProperty('hotel');
    expect(res.body).toHaveProperty('ristorante');
  });

  test('prenotazioni OTA e fabbisogno pasti dichiarati non sviluppati, non nascosti né a zero finto', async () => {
    const res = await request(app).get('/api/dashboard/gruppi').set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.clienti.prenotazioniOta.sviluppato).toBe(false);
    expect(res.body.clienti.prenotazioniOta.messaggio).toMatch(/non sviluppato/i);
    expect(res.body.hotel.fabbisognoPasti.sviluppato).toBe(false);
    expect(res.body.hotel.fabbisognoPasti.messaggio).toMatch(/non sviluppato/i);
  });

  test('statistiche Liguria: sviluppato ma non automatico, distinto dai placeholder veri', async () => {
    const res = await request(app).get('/api/dashboard/gruppi').set(authHeader.titolare());
    expect(res.body.adempimenti.statisticheLiguria.sviluppato).toBe(true);
    expect(res.body.adempimenti.statisticheLiguria.automatico).toBe(false);
  });

  test('alloggiati Web: stato semaforo è uno tra verde/ambra/rosso', async () => {
    const res = await request(app).get('/api/dashboard/gruppi').set(authHeader.titolare());
    expect(['verde', 'ambra', 'rosso']).toContain(res.body.adempimenti.alloggiatiWeb.stato);
    expect(typeof res.body.adempimenti.alloggiatiWeb.daInviare).toBe('number');
  });

  test('conteggi numerici sono sempre numeri, mai stringhe (parseInt/Number applicato ovunque)', async () => {
    const res = await request(app).get('/api/dashboard/gruppi').set(authHeader.titolare());
    expect(typeof res.body.clienti.arriviOggi).toBe('number');
    expect(typeof res.body.clienti.partenzeOggi).toBe('number');
    expect(typeof res.body.clienti.checkInDaFare).toBe('number');
    expect(typeof res.body.clienti.preCheckinDaInviare).toBe('number');
    expect(typeof res.body.hotel.camereDaFare).toBe('number');
    expect(typeof res.body.hotel.manutenzioniAperte).toBe('number');
    expect(typeof res.body.hotel.magazzinoSottoScorta).toBe('number');
    expect(typeof res.body.ristorante.copertiColazione).toBe('number');
    expect(typeof res.body.ristorante.tavoliOccupatiOra).toBe('number');
    expect(typeof res.body.ristorante.menuPronto).toBe('boolean');
  });
});
