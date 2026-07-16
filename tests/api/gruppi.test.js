// Test suite — Modulo Gruppi di prenotazione (Sezione 6 del contratto API).
// Copre: GET /api/gruppi/:id (dettaglio + prenotazioni + totali aggregati),
//        POST /api/gruppi, PATCH /api/gruppi/:id, permessi per ruolo.
// Dipendenze: tabella gruppi_prenotazione + prenotazioni.gruppo_id +
// pagamenti.gruppo_id (migration 017). Usa date fittizie nel 2098 e camere/
// ospite dedicati per non toccare dati reali (stesso pattern di
// prenotazioni.test.js).

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let cameraAId, cameraBId;
let ospiteTestId;
const gruppiCreati = [];
const prenotazioniCreate = [];

async function creaPrenotazione(headerRuolo, overrides = {}) {
  const { soggiorno: soggiornoOverride, ...restOverrides } = overrides;
  const res = await request(app)
    .post('/api/prenotazioni')
    .set(headerRuolo)
    .send({
      canale_origine: 'diretta',
      soggiorno: {
        camera_id: cameraAId,
        ospite_id: ospiteTestId,
        data_arrivo: '2098-01-10',
        data_partenza: '2098-01-15',
        num_ospiti: 2,
        tariffa_totale: 400,
        ...soggiornoOverride,
      },
      ...restOverrides,
    });
  if (res.status === 201) prenotazioniCreate.push(res.body.id);
  return res;
}

async function creaGruppo(headerRuolo, overrides = {}) {
  const res = await request(app)
    .post('/api/gruppi')
    .set(headerRuolo)
    .send({ nome: `Gruppo Test${SUFFISSO}`, referente_nome: 'Mario Rossi', ...overrides });
  if (res.status === 201) gruppiCreati.push(res.body.id);
  return res;
}

beforeAll(async () => {
  const db = getPool();
  const camA = await db.query(
    `INSERT INTO camere (numero, nome, piano) VALUES ($1, 'Camera Test Gruppi A', 1) RETURNING id`,
    [`TEST-GRUA${SUFFISSO}`]
  );
  cameraAId = camA.rows[0].id;
  const camB = await db.query(
    `INSERT INTO camere (numero, nome, piano) VALUES ($1, 'Camera Test Gruppi B', 1) RETURNING id`,
    [`TEST-GRUB${SUFFISSO}`]
  );
  cameraBId = camB.rows[0].id;

  const ospite = await db.query(
    `INSERT INTO ospiti (nome, cognome) VALUES ('Luca', $1) RETURNING id`,
    [`TestGruppi${SUFFISSO}`]
  );
  ospiteTestId = ospite.rows[0].id;
});

afterAll(async () => {
  const db = getPool();
  if (gruppiCreati.length) {
    await db.query('DELETE FROM pagamenti WHERE gruppo_id = ANY($1)', [gruppiCreati]);
  }
  await db.query('DELETE FROM soggiorno_ospiti WHERE ospite_id = $1', [ospiteTestId]);
  await db.query('DELETE FROM soggiorni WHERE camera_id = ANY($1)', [[cameraAId, cameraBId]]);
  if (prenotazioniCreate.length) {
    await db.query('DELETE FROM prenotazioni WHERE id = ANY($1)', [prenotazioniCreate]);
  }
  if (gruppiCreati.length) {
    await db.query('DELETE FROM gruppi_prenotazione WHERE id = ANY($1)', [gruppiCreati]);
  }
  await db.query('DELETE FROM camere WHERE id = ANY($1)', [[cameraAId, cameraBId]]);
  await db.query('DELETE FROM ospiti WHERE id = $1', [ospiteTestId]);
  await chiudiPool();
});

// ─── GET /api/gruppi/:id ──────────────────────────────────────────────────────

describe('GET /api/gruppi/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/gruppi/1');
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (nessun accesso alla sezione gruppi)', async () => {
    const res = await request(app).get('/api/gruppi/1').set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app).get('/api/gruppi/999999999').set(authHeader.titolare());
    expect(res.status).toBe(404);
  });

  test('portiere_notte (sola lettura consentita) → 200', async () => {
    const gruppo = await creaGruppo(authHeader.receptionist());
    expect(gruppo.status).toBe(201);

    const res = await request(app).get(`/api/gruppi/${gruppo.body.id}`).set(authHeader.portiere_notte());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(gruppo.body.id);
    expect(Array.isArray(res.body.prenotazioni)).toBe(true);
  });

  test('totali aggregati: 2 prenotazioni (400 + 250 di tariffa) e 2 pagamenti di gruppo (100 + 50) → somme distinte, non una singola riga', async () => {
    const gruppo = await creaGruppo(authHeader.receptionist());
    expect(gruppo.status).toBe(201);
    const gruppoId = gruppo.body.id;

    const p1 = await creaPrenotazione(authHeader.receptionist(), {
      gruppo_id: gruppoId,
      soggiorno: { camera_id: cameraAId, data_arrivo: '2098-02-01', data_partenza: '2098-02-05', tariffa_totale: 400 },
    });
    expect(p1.status).toBe(201);

    const p2 = await creaPrenotazione(authHeader.receptionist(), {
      gruppo_id: gruppoId,
      soggiorno: { camera_id: cameraBId, data_arrivo: '2098-02-01', data_partenza: '2098-02-05', tariffa_totale: 250 },
    });
    expect(p2.status).toBe(201);

    const pag1 = await request(app)
      .post(`/api/gruppi/${gruppoId}/pagamenti`)
      .set(authHeader.receptionist())
      .send({ importo: 100, metodo: 'contanti', tipo: 'caparra' });
    expect(pag1.status).toBe(201);

    const pag2 = await request(app)
      .post(`/api/gruppi/${gruppoId}/pagamenti`)
      .set(authHeader.receptionist())
      .send({ importo: 50, metodo: 'carta', tipo: 'caparra' });
    expect(pag2.status).toBe(201);

    const res = await request(app).get(`/api/gruppi/${gruppoId}`).set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.prenotazioni.length).toBe(2);
    expect(Number(res.body.totale_addebiti)).toBe(650);
    expect(Number(res.body.totale_pagamenti)).toBe(150);
  });
});

// ─── POST /api/gruppi ─────────────────────────────────────────────────────────

describe('POST /api/gruppi', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/gruppi').send({});
    expect(res.status).toBe(401);
  });

  test('cameriere → 403', async () => {
    const res = await creaGruppo(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('portiere_notte → 403 (sola lettura, niente scrittura)', async () => {
    const res = await creaGruppo(authHeader.portiere_notte());
    expect(res.status).toBe(403);
  });

  test('nome mancante → 400', async () => {
    const res = await request(app).post('/api/gruppi').set(authHeader.receptionist()).send({ referente_nome: 'x' });
    expect(res.status).toBe(400);
  });

  test('receptionist con dati validi → 201', async () => {
    const res = await creaGruppo(authHeader.receptionist(), { referente_email: 'mario@example.it' });
    expect(res.status).toBe(201);
    expect(res.body.referente_email).toBe('mario@example.it');
  });
});

// ─── PATCH /api/gruppi/:id ────────────────────────────────────────────────────

describe('PATCH /api/gruppi/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).patch('/api/gruppi/1').send({});
    expect(res.status).toBe(401);
  });

  test('portiere_notte → 403 (sola lettura, niente scrittura)', async () => {
    const gruppo = await creaGruppo(authHeader.receptionist());
    const res = await request(app)
      .patch(`/api/gruppi/${gruppo.body.id}`)
      .set(authHeader.portiere_notte())
      .send({ nome: 'tentativo non autorizzato' });
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app).patch('/api/gruppi/999999999').set(authHeader.admin()).send({ nome: 'x' });
    expect(res.status).toBe(404);
  });

  test('admin aggiorna nome e referente → 200', async () => {
    const gruppo = await creaGruppo(authHeader.receptionist());
    const res = await request(app)
      .patch(`/api/gruppi/${gruppo.body.id}`)
      .set(authHeader.admin())
      .send({ nome: 'Nome Aggiornato', referente_telefono: '333123456' });
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Nome Aggiornato');
    expect(res.body.referente_telefono).toBe('333123456');
    expect(res.body.referente_nome).toBe('Mario Rossi'); // invariato (COALESCE)
  });
});
