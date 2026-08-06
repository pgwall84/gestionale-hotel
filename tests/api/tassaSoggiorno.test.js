// Test suite — Modulo Tassa di soggiorno (Modulo 2.4, Fase 2A).
// Copre: GET/POST /api/tassa-soggiorno/configurazione, GET /api/tassa-soggiorno/calcolo/:id,
// POST /api/tassa-soggiorno/:id/riscuoti, GET /api/tassa-soggiorno/report[/export] —
// permessi per azione (lettura/scrittura/configurazione), validazione, calcolo
// esenzione età + tetto notti, congelamento post-riscossione, doppia riscossione.
// Dipendenze: tabelle configurazione_tassa_soggiorno + tasse_soggiorno
// (migration 021), soggiorni/soggiorno_ospiti/ospiti/camere/prenotazioni
// (migration 016/017).
// Scritto a mano (non da tests/agent/genera-test.js, per coerenza con
// tariffe.test.js — stesso pattern di fixture dirette su DB condiviso).
// Usa date fittizie nel 2099 per il soggiorno principale e nel 2097-2098 per
// il test della chiusura automatica dell'aliquota precedente (POST
// /configurazione chiude qualunque riga con valido_al IS NULL — incluso, se
// esiste, il periodo realmente in corso: comportamento corretto e voluto
// dell'applicazione, non un side-effect da evitare, stesso principio di
// tariffe.test.js che usa gli anni 2090-2094 per non toccare dati operativi
// vicini a oggi).

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;

let cameraId;
let ospiteAdultoId;
let ospiteBambinoId;
let prenotazioneId;
let soggiornoId;          // 2099-01-10 → 2099-01-15, adulto + bambino esente
let soggiornoSenzaConfigId; // 1999, nessuna configurazione vigente
let soggiornoNonCalcolatoId; // per il test "riscuoti senza calcolo pregresso"
let configurazionePrincipaleId;

const configurazioniCreate = []; // id creati via POST reale, per cleanup

beforeAll(async () => {
  const db = getPool();

  const camera = await db.query(
    `INSERT INTO camere (numero, nome, piano) VALUES ($1, 'Camera Test Tassa Soggiorno', 9) RETURNING id`,
    [`TEST-TXS${SUFFISSO}`]
  );
  cameraId = camera.rows[0].id;

  const adulto = await db.query(
    `INSERT INTO ospiti (nome, cognome, data_nascita) VALUES ('Mario', $1, '1980-01-01') RETURNING id`,
    [`TestTassaAdulto${SUFFISSO}`]
  );
  ospiteAdultoId = adulto.rows[0].id;

  // Nato 2090-06-01 → 8 anni all'arrivo del soggiorno di test (2099-01-10),
  // sotto la soglia eta_esente_fino=12 della configurazione di test → esente.
  const bambino = await db.query(
    `INSERT INTO ospiti (nome, cognome, data_nascita) VALUES ('Luigi', $1, '2090-06-01') RETURNING id`,
    [`TestTassaBambino${SUFFISSO}`]
  );
  ospiteBambinoId = bambino.rows[0].id;

  const prenotazione = await db.query(
    `INSERT INTO prenotazioni (canale_origine, stato) VALUES ('diretta', 'confermata') RETURNING id`
  );
  prenotazioneId = prenotazione.rows[0].id;

  const soggiorno = await db.query(
    `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
     VALUES ($1, $2, $3, '2099-01-10', '2099-01-15', 2) RETURNING id`,
    [prenotazioneId, cameraId, ospiteAdultoId]
  );
  soggiornoId = soggiorno.rows[0].id;

  await db.query(
    `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1, $2, '17')`,
    [soggiornoId, ospiteAdultoId]
  );
  await db.query(
    `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1, $2, '19')`,
    [soggiornoId, ospiteBambinoId]
  );

  // Configurazione dedicata al test, finestra chiusa 2099 — non tocca né
  // viene toccata dalla configurazione realmente in vigore oggi.
  const config = await db.query(
    `INSERT INTO configurazione_tassa_soggiorno
       (importo_a_notte, eta_esente_fino, notti_max_tassabili, valido_dal, valido_al, note)
     VALUES (2.00, 12, 7, '2099-01-01', '2099-12-31', $1) RETURNING id`,
    [`Config test${SUFFISSO}`]
  );
  configurazionePrincipaleId = config.rows[0].id;

  // Soggiorno senza nessuna configurazione vigente per la sua data (1999,
  // ben prima di qualunque aliquota mai configurata).
  const soggiornoVecchio = await db.query(
    `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
     VALUES ($1, $2, $3, '1999-01-10', '1999-01-15', 1) RETURNING id`,
    [prenotazioneId, cameraId, ospiteAdultoId]
  );
  soggiornoSenzaConfigId = soggiornoVecchio.rows[0].id;

  // Soggiorno mai calcolato, usato solo per il test "riscuoti senza calcolo".
  const soggiornoNonCalcolato = await db.query(
    `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
     VALUES ($1, $2, $3, '2099-03-01', '2099-03-03', 1) RETURNING id`,
    [prenotazioneId, cameraId, ospiteAdultoId]
  );
  soggiornoNonCalcolatoId = soggiornoNonCalcolato.rows[0].id;
  await db.query(
    `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1, $2, '17')`,
    [soggiornoNonCalcolatoId, ospiteAdultoId]
  );
});

afterAll(async () => {
  const db = getPool();
  const tuttiSoggiorni = [soggiornoId, soggiornoSenzaConfigId, soggiornoNonCalcolatoId];

  await db.query('DELETE FROM tasse_soggiorno WHERE soggiorno_id = ANY($1)', [tuttiSoggiorni]);
  await db.query('DELETE FROM soggiorno_ospiti WHERE soggiorno_id = ANY($1)', [tuttiSoggiorni]);
  await db.query('DELETE FROM soggiorni WHERE id = ANY($1)', [tuttiSoggiorni]);
  await db.query('DELETE FROM prenotazioni WHERE id = $1', [prenotazioneId]);
  await db.query('DELETE FROM ospiti WHERE id = ANY($1)', [[ospiteAdultoId, ospiteBambinoId]]);
  await db.query('DELETE FROM camere WHERE id = $1', [cameraId]);

  const idConfigDaRimuovere = [configurazionePrincipaleId, ...configurazioniCreate];
  await db.query('DELETE FROM configurazione_tassa_soggiorno WHERE id = ANY($1)', [idConfigDaRimuovere]);

  await chiudiPool();
});

// ─── GET /api/tassa-soggiorno/configurazione ─────────────────────────────────

describe('GET /api/tassa-soggiorno/configurazione', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/tassa-soggiorno/configurazione');
    expect(res.status).toBe(401);
  });

  test('receptionist (azione configurazione non concessa) → 403', async () => {
    const res = await request(app).get('/api/tassa-soggiorno/configurazione').set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('titolare → 200 con array, include la configurazione di test', async () => {
    const res = await request(app).get('/api/tassa-soggiorno/configurazione').set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some(c => c.id === configurazionePrincipaleId)).toBe(true);
  });
});

// ─── POST /api/tassa-soggiorno/configurazione ────────────────────────────────

describe('POST /api/tassa-soggiorno/configurazione', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/tassa-soggiorno/configurazione').send({});
    expect(res.status).toBe(401);
  });

  test('receptionist → 403', async () => {
    const res = await request(app)
      .post('/api/tassa-soggiorno/configurazione')
      .set(authHeader.receptionist())
      .send({ importo_a_notte: 1.5, valido_dal: '2097-01-01' });
    expect(res.status).toBe(403);
  });

  test('campi obbligatori mancanti → 400', async () => {
    const res = await request(app)
      .post('/api/tassa-soggiorno/configurazione')
      .set(authHeader.titolare())
      .send({ eta_esente_fino: 12 });
    expect(res.status).toBe(400);
  });

  test('importo_a_notte non positivo → 400', async () => {
    const res = await request(app)
      .post('/api/tassa-soggiorno/configurazione')
      .set(authHeader.titolare())
      .send({ importo_a_notte: 0, valido_dal: '2097-01-01' });
    expect(res.status).toBe(400);
  });

  test('titolare crea nuova aliquota → 201, chiude quella precedente ancora aperta', async () => {
    const prima = await request(app)
      .post('/api/tassa-soggiorno/configurazione')
      .set(authHeader.titolare())
      .send({ importo_a_notte: 1.5, valido_dal: '2097-01-01', note: `Test A${SUFFISSO}` });
    expect(prima.status).toBe(201);
    configurazioniCreate.push(prima.body.id);

    const seconda = await request(app)
      .post('/api/tassa-soggiorno/configurazione')
      .set(authHeader.admin())
      .send({ importo_a_notte: 1.8, valido_dal: '2098-01-01', note: `Test B${SUFFISSO}` });
    expect(seconda.status).toBe(201);
    configurazioniCreate.push(seconda.body.id);

    const db = getPool();
    const primaRiletta = await db.query('SELECT valido_al FROM configurazione_tassa_soggiorno WHERE id = $1', [prima.body.id]);
    expect(primaRiletta.rows[0].valido_al).not.toBeNull();
    // valido_al arriva come stringa 'YYYY-MM-DD', non oggetto Date — stesso
    // type-parser di backend/config/db.js (OID 1082), condiviso a livello di
    // processo pg tra il pool dell'app e quello di tests/helpers/db.js.
    expect(primaRiletta.rows[0].valido_al).toBe('2097-12-31');
  });

  test('valido_dal non successivo alla configurazione precedente → 400 (check_violation tradotto)', async () => {
    const res = await request(app)
      .post('/api/tassa-soggiorno/configurazione')
      .set(authHeader.titolare())
      .send({ importo_a_notte: 1.0, valido_dal: '2098-01-01', note: `Test C${SUFFISSO}` });
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/tassa-soggiorno/calcolo/:soggiorno_id ──────────────────────────

describe('GET /api/tassa-soggiorno/calcolo/:soggiorno_id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get(`/api/tassa-soggiorno/calcolo/${soggiornoId}`);
    expect(res.status).toBe(401);
  });

  test('cuoco (nessun accesso alla sezione) → 403', async () => {
    const res = await request(app).get(`/api/tassa-soggiorno/calcolo/${soggiornoId}`).set(authHeader.cuoco());
    expect(res.status).toBe(403);
  });

  test('soggiorno inesistente → 404', async () => {
    const res = await request(app).get('/api/tassa-soggiorno/calcolo/999999999').set(authHeader.receptionist());
    expect(res.status).toBe(404);
  });

  test('nessuna configurazione vigente per la data → 404', async () => {
    const res = await request(app)
      .get(`/api/tassa-soggiorno/calcolo/${soggiornoSenzaConfigId}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(404);
  });

  test('calcolo corretto: 5 notti, 1 ospite tassabile (bambino esente) → dovuto 10.00', async () => {
    const res = await request(app).get(`/api/tassa-soggiorno/calcolo/${soggiornoId}`).set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.notti_tassabili).toBe(5);
    expect(res.body.ospiti_tassabili).toBe(1);
    expect(Number(res.body.importo_dovuto)).toBe(10);
  });

  test('richiamato una seconda volta prima della riscossione → idempotente, stesso importo', async () => {
    const res = await request(app).get(`/api/tassa-soggiorno/calcolo/${soggiornoId}`).set(authHeader.admin());
    expect(res.status).toBe(200);
    expect(Number(res.body.importo_dovuto)).toBe(10);
  });
});

// ─── POST /api/tassa-soggiorno/:soggiorno_id/riscuoti ────────────────────────

describe('POST /api/tassa-soggiorno/:soggiorno_id/riscuoti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post(`/api/tassa-soggiorno/${soggiornoId}/riscuoti`).send({});
    expect(res.status).toBe(401);
  });

  test('cuoco → 403', async () => {
    const res = await request(app)
      .post(`/api/tassa-soggiorno/${soggiornoId}/riscuoti`)
      .set(authHeader.cuoco())
      .send({ importo_riscosso: 10 });
    expect(res.status).toBe(403);
  });

  test('importo_riscosso mancante → 400', async () => {
    const res = await request(app)
      .post(`/api/tassa-soggiorno/${soggiornoId}/riscuoti`)
      .set(authHeader.receptionist())
      .send({});
    expect(res.status).toBe(400);
  });

  test('soggiorno mai calcolato → 400 "calcola prima"', async () => {
    const res = await request(app)
      .post(`/api/tassa-soggiorno/${soggiornoNonCalcolatoId}/riscuoti`)
      .set(authHeader.receptionist())
      .send({ importo_riscosso: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/calcola/i);
  });

  test('receptionist registra la riscossione → 200', async () => {
    const res = await request(app)
      .post(`/api/tassa-soggiorno/${soggiornoId}/riscuoti`)
      .set(authHeader.receptionist())
      .send({ importo_riscosso: 10, note: `Riscosso in contanti${SUFFISSO}` });
    expect(res.status).toBe(200);
    expect(Number(res.body.importo_riscosso)).toBe(10);
    expect(res.body.data_riscossione).not.toBeNull();
  });

  test('doppia riscossione sullo stesso soggiorno → 400', async () => {
    const res = await request(app)
      .post(`/api/tassa-soggiorno/${soggiornoId}/riscuoti`)
      .set(authHeader.titolare())
      .send({ importo_riscosso: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/già riscossa/i);
  });

  test('calcolo dopo la riscossione → resta congelato, non ricalcola', async () => {
    const res = await request(app).get(`/api/tassa-soggiorno/calcolo/${soggiornoId}`).set(authHeader.admin());
    expect(res.status).toBe(200);
    expect(Number(res.body.importo_dovuto)).toBe(10);
    expect(Number(res.body.importo_riscosso)).toBe(10);
  });
});

// ─── GET /api/tassa-soggiorno/report ─────────────────────────────────────────

describe('GET /api/tassa-soggiorno/report', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/tassa-soggiorno/report?dal=2099-01-01&al=2099-01-31');
    expect(res.status).toBe(401);
  });

  test('cuoco → 403', async () => {
    const res = await request(app)
      .get('/api/tassa-soggiorno/report?dal=2099-01-01&al=2099-01-31')
      .set(authHeader.cuoco());
    expect(res.status).toBe(403);
  });

  test('dal/al mancanti → 400', async () => {
    const res = await request(app).get('/api/tassa-soggiorno/report').set(authHeader.receptionist());
    expect(res.status).toBe(400);
  });

  test('range che copre il soggiorno di test → 200, riga presente con dovuto e riscosso valorizzati', async () => {
    const res = await request(app)
      .get('/api/tassa-soggiorno/report?dal=2099-01-01&al=2099-01-31')
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const riga = res.body.find(r => r.soggiorno_id === soggiornoId);
    expect(riga).toBeDefined();
    expect(Number(riga.importo_dovuto)).toBe(10);
    expect(Number(riga.importo_riscosso)).toBe(10);
  });
});

// ─── GET /api/tassa-soggiorno/report/export ──────────────────────────────────

describe('GET /api/tassa-soggiorno/report/export', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/tassa-soggiorno/report/export?dal=2099-01-01&al=2099-01-31');
    expect(res.status).toBe(401);
  });

  test('cuoco → 403', async () => {
    const res = await request(app)
      .get('/api/tassa-soggiorno/report/export?dal=2099-01-01&al=2099-01-31')
      .set(authHeader.cuoco());
    expect(res.status).toBe(403);
  });

  test('range valido → 200, file Excel', async () => {
    const res = await request(app)
      .get('/api/tassa-soggiorno/report/export?dal=2099-01-01&al=2099-01-31')
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
  });
});
