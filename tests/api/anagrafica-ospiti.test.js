// Test suite — Modulo Prenotazioni Fase 2: anagrafica Ospiti.
// Copre: GET /api/ospiti?search=, GET /api/ospiti/:id, POST /api/ospiti,
//        PATCH /api/ospiti/:id, POST /api/ospiti/:id/svela-documento.
// Non va confuso con tests/api/ospiti.test.js (Modulo 1.2, ospiti_giornalieri,
// /api/hr/ospiti) — dominio diverso.
// Dipendenze: tabella ospiti (migration 016), audit_log (migration 012).
// Nota: documento_numero non deve mai comparire in chiaro nelle risposte di
// lista/dettaglio/crea/aggiorna — ogni test lo verifica esplicitamente.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const COGNOME_TEST = `TestOspiteFase2_${Date.now()}`;
const DOCUMENTO_NUMERO = 'AB1234567';
const DOCUMENTO_TIPO = 'CI';

let ospiteId;
let ospiteCreatoId; // creato dal test POST, ripulito a parte

afterAll(async () => {
  const db = getPool();
  await db.query(`DELETE FROM audit_log WHERE risorsa_tipo = 'ospiti' AND risorsa_id = $1`, [ospiteId]);
  await db.query('DELETE FROM ospiti WHERE cognome = $1', [COGNOME_TEST]);
  await chiudiPool();
});

beforeAll(async () => {
  const db = getPool();
  const r = await db.query(
    `INSERT INTO ospiti (nome, cognome, sesso, documento_tipo_codice, documento_numero, email, telefono, consenso_marketing)
     VALUES ('Mario', $1, 'M', $2, $3, 'mario.test@test.hotel', '3331234567', false)
     RETURNING id`,
    [COGNOME_TEST, DOCUMENTO_TIPO, DOCUMENTO_NUMERO]
  );
  ospiteId = r.rows[0].id;
});

// ─── GET /api/ospiti ────────────────────────────────────────────────────────

describe('GET /api/ospiti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/ospiti');
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (sezione ospiti non consentita)', async () => {
    const res = await request(app).get('/api/ospiti').set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('portiere_notte (sola lettura consentita) → 200', async () => {
    const res = await request(app)
      .get(`/api/ospiti?search=${encodeURIComponent(COGNOME_TEST)}`)
      .set(authHeader.portiere_notte());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  test('search per cognome trova l\'ospite di test, documento sempre mascherato', async () => {
    const res = await request(app)
      .get(`/api/ospiti?search=${encodeURIComponent(COGNOME_TEST)}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    const trovato = res.body.find(o => o.id === ospiteId);
    expect(trovato).toBeDefined();
    expect(trovato).not.toHaveProperty('documento_numero');
    expect(trovato.documento_mascherato).toBe('CI · ••••4567');
  });
});

// ─── GET /api/ospiti/:id ─────────────────────────────────────────────────────

describe('GET /api/ospiti/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get(`/api/ospiti/${ospiteId}`);
    expect(res.status).toBe(401);
  });

  test('dipendente → 403 (sezione ospiti non consentita)', async () => {
    const res = await request(app).get(`/api/ospiti/${ospiteId}`).set(authHeader.dipendente());
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app).get('/api/ospiti/999999999').set(authHeader.titolare());
    expect(res.status).toBe(404);
  });

  test('receptionist → 200, storico soggiorni presente, documento mascherato', async () => {
    const res = await request(app).get(`/api/ospiti/${ospiteId}`).set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('documento_numero');
    expect(res.body.documento_mascherato).toBe('CI · ••••4567');
    expect(Array.isArray(res.body.storico_soggiorni)).toBe(true);
  });
});

// ─── POST /api/ospiti ────────────────────────────────────────────────────────

describe('POST /api/ospiti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/ospiti').send({});
    expect(res.status).toBe(401);
  });

  test('cuoco → 403 (sezione ospiti non consentita)', async () => {
    const res = await request(app)
      .post('/api/ospiti')
      .set(authHeader.cuoco())
      .send({ nome: 'Luigi', cognome: 'Verdi' });
    expect(res.status).toBe(403);
  });

  test('portiere_notte → 403 (sola lettura, niente scrittura)', async () => {
    const res = await request(app)
      .post('/api/ospiti')
      .set(authHeader.portiere_notte())
      .send({ nome: 'Luigi', cognome: 'Verdi' });
    expect(res.status).toBe(403);
  });

  test('receptionist senza cognome → 400', async () => {
    const res = await request(app)
      .post('/api/ospiti')
      .set(authHeader.receptionist())
      .send({ nome: 'Luigi' });
    expect(res.status).toBe(400);
  });

  test('sesso non valido → 400', async () => {
    const res = await request(app)
      .post('/api/ospiti')
      .set(authHeader.receptionist())
      .send({ nome: 'Luigi', cognome: `${COGNOME_TEST}_2`, sesso: 'X' });
    expect(res.status).toBe(400);
  });

  test('receptionist con dati validi → 201, documento mascherato, mai in chiaro', async () => {
    const res = await request(app)
      .post('/api/ospiti')
      .set(authHeader.receptionist())
      .send({
        nome: 'Luigi',
        cognome: `${COGNOME_TEST}_creato`,
        documento_tipo_codice: 'CI',
        documento_numero: 'XY9876543',
      });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('documento_numero');
    expect(res.body.documento_mascherato).toBe('CI · ••••6543');
    ospiteCreatoId = res.body.id;
  });

  afterAll(async () => {
    if (ospiteCreatoId) {
      const db = getPool();
      await db.query('DELETE FROM ospiti WHERE id = $1', [ospiteCreatoId]);
    }
  });
});

// ─── PATCH /api/ospiti/:id ───────────────────────────────────────────────────

describe('PATCH /api/ospiti/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).patch(`/api/ospiti/${ospiteId}`).send({});
    expect(res.status).toBe(401);
  });

  test('portiere_notte → 403 (sola lettura, niente scrittura)', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteId}`)
      .set(authHeader.portiere_notte())
      .send({ telefono: '3339999999' });
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app)
      .patch('/api/ospiti/999999999')
      .set(authHeader.admin())
      .send({ telefono: '3339999999' });
    expect(res.status).toBe(404);
  });

  test('admin aggiorna solo telefono → 200, cognome invariato (COALESCE)', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteId}`)
      .set(authHeader.admin())
      .send({ telefono: '3339999999' });
    expect(res.status).toBe(200);
    expect(res.body.telefono).toBe('3339999999');
    expect(res.body.cognome).toBe(COGNOME_TEST);
    expect(res.body).not.toHaveProperty('documento_numero');
    expect(res.body.documento_mascherato).toBe('CI · ••••4567');
  });
});

// ─── POST /api/ospiti/:id/svela-documento ────────────────────────────────────

describe('POST /api/ospiti/:id/svela-documento', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post(`/api/ospiti/${ospiteId}/svela-documento`);
    expect(res.status).toBe(401);
  });

  test('portiere_notte → 403 (mai svela-documento, anche se ha lettura)', async () => {
    const res = await request(app)
      .post(`/api/ospiti/${ospiteId}/svela-documento`)
      .set(authHeader.portiere_notte());
    expect(res.status).toBe(403);
  });

  test('dipendente → 403', async () => {
    const res = await request(app)
      .post(`/api/ospiti/${ospiteId}/svela-documento`)
      .set(authHeader.dipendente());
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app)
      .post('/api/ospiti/999999999/svela-documento')
      .set(authHeader.titolare());
    expect(res.status).toBe(404);
  });

  test('receptionist → 200, documento_numero in chiaro + riga scritta in audit_log', async () => {
    const res = await request(app)
      .post(`/api/ospiti/${ospiteId}/svela-documento`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.documento_numero).toBe(DOCUMENTO_NUMERO);

    const db = getPool();
    const log = await db.query(
      `SELECT * FROM audit_log WHERE risorsa_tipo = 'ospiti' AND risorsa_id = $1 AND azione = 'svela_documento'
       ORDER BY created_at DESC LIMIT 1`,
      [ospiteId]
    );
    expect(log.rows.length).toBe(1);
    expect(log.rows[0].user_id).toBe(3); // receptionist — vedi tests/helpers/auth.js
  });
});
