// Test suite — Modulo Pagamenti (Sezione 5 del contratto API).
// Copre: GET/POST /api/prenotazioni/:id/pagamenti, GET/POST
// /api/gruppi/:id/pagamenti, permessi per ruolo, e il vincolo CHECK XOR
// (chk_pagamenti_prenotazione_o_gruppo, migration 017) — nessun endpoint
// pubblico passa mai entrambi gli id, quindi il vincolo va verificato con un
// INSERT diretto sul DB, non tramite l'API.
// Usa date fittizie nel 2097 e camera/ospite/gruppo dedicati per non toccare
// dati reali (stesso pattern di prenotazioni.test.js/gruppi.test.js).

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let cameraTestId;
let ospiteTestId;
let gruppoTestId;
let prenotazioneTestId;

beforeAll(async () => {
  const db = getPool();

  const camera = await db.query(
    `INSERT INTO camere (numero, nome, piano) VALUES ($1, 'Camera Test Pagamenti', 2) RETURNING id`,
    [`TEST-PAG${SUFFISSO}`]
  );
  cameraTestId = camera.rows[0].id;

  const ospite = await db.query(
    `INSERT INTO ospiti (nome, cognome) VALUES ('Anna', $1) RETURNING id`,
    [`TestPagamenti${SUFFISSO}`]
  );
  ospiteTestId = ospite.rows[0].id;

  const gruppo = await db.query(
    `INSERT INTO gruppi_prenotazione (nome) VALUES ($1) RETURNING id`,
    [`Gruppo Test Pagamenti${SUFFISSO}`]
  );
  gruppoTestId = gruppo.rows[0].id;

  const prenotazione = await request(app)
    .post('/api/prenotazioni')
    .set(authHeader.receptionist())
    .send({
      canale_origine: 'diretta',
      soggiorno: {
        camera_id: cameraTestId,
        ospite_id: ospiteTestId,
        data_arrivo: '2097-01-10',
        data_partenza: '2097-01-15',
        num_ospiti: 1,
        tariffa_totale: 300,
      },
    });
  prenotazioneTestId = prenotazione.body.id;
});

afterAll(async () => {
  const db = getPool();
  await db.query('DELETE FROM pagamenti WHERE prenotazione_id = $1 OR gruppo_id = $2', [prenotazioneTestId, gruppoTestId]);
  await db.query('DELETE FROM soggiorno_ospiti WHERE ospite_id = $1', [ospiteTestId]);
  await db.query('DELETE FROM soggiorni WHERE camera_id = $1', [cameraTestId]);
  await db.query('DELETE FROM prenotazioni WHERE id = $1', [prenotazioneTestId]);
  await db.query('DELETE FROM gruppi_prenotazione WHERE id = $1', [gruppoTestId]);
  await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  await db.query('DELETE FROM ospiti WHERE id = $1', [ospiteTestId]);
  await chiudiPool();
});

// ─── GET/POST /api/prenotazioni/:id/pagamenti ─────────────────────────────────

describe('GET /api/prenotazioni/:id/pagamenti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get(`/api/prenotazioni/${prenotazioneTestId}/pagamenti`);
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (nessun accesso alla sezione pagamenti)', async () => {
    const res = await request(app).get(`/api/prenotazioni/${prenotazioneTestId}/pagamenti`).set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('portiere_notte → 403 (escluso da pagamenti, a differenza di gruppi/prenotazioni)', async () => {
    const res = await request(app).get(`/api/prenotazioni/${prenotazioneTestId}/pagamenti`).set(authHeader.portiere_notte());
    expect(res.status).toBe(403);
  });

  test('receptionist, nessun pagamento ancora → 200, array vuoto', async () => {
    const res = await request(app).get(`/api/prenotazioni/${prenotazioneTestId}/pagamenti`).set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/prenotazioni/:id/pagamenti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post(`/api/prenotazioni/${prenotazioneTestId}/pagamenti`).send({});
    expect(res.status).toBe(401);
  });

  test('portiere_notte → 403', async () => {
    const res = await request(app)
      .post(`/api/prenotazioni/${prenotazioneTestId}/pagamenti`)
      .set(authHeader.portiere_notte())
      .send({ importo: 100, tipo: 'caparra' });
    expect(res.status).toBe(403);
  });

  test('importo mancante → 400', async () => {
    const res = await request(app)
      .post(`/api/prenotazioni/${prenotazioneTestId}/pagamenti`)
      .set(authHeader.receptionist())
      .send({ tipo: 'caparra' });
    expect(res.status).toBe(400);
  });

  test('importo zero/negativo → 400', async () => {
    const res = await request(app)
      .post(`/api/prenotazioni/${prenotazioneTestId}/pagamenti`)
      .set(authHeader.receptionist())
      .send({ importo: 0, tipo: 'caparra' });
    expect(res.status).toBe(400);
  });

  test('tipo mancante → 400', async () => {
    const res = await request(app)
      .post(`/api/prenotazioni/${prenotazioneTestId}/pagamenti`)
      .set(authHeader.receptionist())
      .send({ importo: 100 });
    expect(res.status).toBe(400);
  });

  test('prenotazione inesistente → 404', async () => {
    const res = await request(app)
      .post('/api/prenotazioni/999999999/pagamenti')
      .set(authHeader.receptionist())
      .send({ importo: 100, tipo: 'caparra' });
    expect(res.status).toBe(404);
  });

  test('receptionist con dati validi → 201, stato completato, prenotazione_id valorizzato e gruppo_id nullo', async () => {
    const res = await request(app)
      .post(`/api/prenotazioni/${prenotazioneTestId}/pagamenti`)
      .set(authHeader.receptionist())
      .send({ importo: 100, metodo: 'contanti', tipo: 'caparra' });
    expect(res.status).toBe(201);
    expect(res.body.stato).toBe('completato');
    expect(res.body.prenotazione_id).toBe(prenotazioneTestId);
    expect(res.body.gruppo_id).toBeNull();
    expect(Number(res.body.importo)).toBe(100);

    const lista = await request(app).get(`/api/prenotazioni/${prenotazioneTestId}/pagamenti`).set(authHeader.titolare());
    expect(lista.status).toBe(200);
    expect(lista.body.length).toBe(1);
    expect(lista.body[0].id).toBe(res.body.id);
  });
});

// ─── GET/POST /api/gruppi/:id/pagamenti ───────────────────────────────────────

describe('GET /api/gruppi/:id/pagamenti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get(`/api/gruppi/${gruppoTestId}/pagamenti`);
    expect(res.status).toBe(401);
  });

  test('cameriere → 403', async () => {
    const res = await request(app).get(`/api/gruppi/${gruppoTestId}/pagamenti`).set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('portiere_notte → 403 (escluso da pagamenti)', async () => {
    const res = await request(app).get(`/api/gruppi/${gruppoTestId}/pagamenti`).set(authHeader.portiere_notte());
    expect(res.status).toBe(403);
  });

  test('receptionist, nessun pagamento ancora → 200, array vuoto', async () => {
    const res = await request(app).get(`/api/gruppi/${gruppoTestId}/pagamenti`).set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/gruppi/:id/pagamenti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post(`/api/gruppi/${gruppoTestId}/pagamenti`).send({});
    expect(res.status).toBe(401);
  });

  test('portiere_notte → 403', async () => {
    const res = await request(app)
      .post(`/api/gruppi/${gruppoTestId}/pagamenti`)
      .set(authHeader.portiere_notte())
      .send({ importo: 50, tipo: 'caparra' });
    expect(res.status).toBe(403);
  });

  test('importo mancante → 400', async () => {
    const res = await request(app)
      .post(`/api/gruppi/${gruppoTestId}/pagamenti`)
      .set(authHeader.receptionist())
      .send({ tipo: 'caparra' });
    expect(res.status).toBe(400);
  });

  test('tipo mancante → 400', async () => {
    const res = await request(app)
      .post(`/api/gruppi/${gruppoTestId}/pagamenti`)
      .set(authHeader.receptionist())
      .send({ importo: 50 });
    expect(res.status).toBe(400);
  });

  test('gruppo inesistente → 404', async () => {
    const res = await request(app)
      .post('/api/gruppi/999999999/pagamenti')
      .set(authHeader.receptionist())
      .send({ importo: 50, tipo: 'caparra' });
    expect(res.status).toBe(404);
  });

  test('receptionist con dati validi → 201, stato completato, gruppo_id valorizzato e prenotazione_id nullo', async () => {
    const res = await request(app)
      .post(`/api/gruppi/${gruppoTestId}/pagamenti`)
      .set(authHeader.receptionist())
      .send({ importo: 200, metodo: 'bonifico', tipo: 'saldo' });
    expect(res.status).toBe(201);
    expect(res.body.stato).toBe('completato');
    expect(res.body.gruppo_id).toBe(gruppoTestId);
    expect(res.body.prenotazione_id).toBeNull();

    const lista = await request(app).get(`/api/gruppi/${gruppoTestId}/pagamenti`).set(authHeader.titolare());
    expect(lista.status).toBe(200);
    expect(lista.body.length).toBe(1);
    expect(lista.body[0].id).toBe(res.body.id);
  });
});

// ─── Vincolo CHECK XOR (chk_pagamenti_prenotazione_o_gruppo, migration 017) ───

describe('Vincolo DB chk_pagamenti_prenotazione_o_gruppo', () => {
  test('INSERT con entrambi prenotazione_id e gruppo_id valorizzati → violazione CHECK (23514)', async () => {
    const db = getPool();
    await expect(
      db.query(
        `INSERT INTO pagamenti (prenotazione_id, gruppo_id, importo, tipo, stato)
         VALUES ($1, $2, 10, 'caparra', 'completato')`,
        [prenotazioneTestId, gruppoTestId]
      )
    ).rejects.toMatchObject({ code: '23514', constraint: 'chk_pagamenti_prenotazione_o_gruppo' });
  });

  test('INSERT senza né prenotazione_id né gruppo_id → violazione CHECK (23514)', async () => {
    const db = getPool();
    await expect(
      db.query(
        `INSERT INTO pagamenti (importo, tipo, stato) VALUES (10, 'caparra', 'completato')`
      )
    ).rejects.toMatchObject({ code: '23514', constraint: 'chk_pagamenti_prenotazione_o_gruppo' });
  });
});
