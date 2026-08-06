// Test suite — Modulo Tipi Camera (Modulo 2.2, Fase 2A).
// Copre: GET /api/tipi-camera, POST, PATCH, DELETE — permessi, validazione,
// blocco DELETE se la categoria è referenziata da una camera.
// Dipendenze: tabella tipi_camera (migration 018), FK da camere.tipo_camera_id.
// Scritto a mano (non da tests/agent/genera-test.js — API Claude non
// disponibile per credito esaurito il 31/07/2026, vedi docs/DIARIO_SESSIONI.md).

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
const tipiCreati = [];
let cameraTestId;

async function creaTipo(headerRuolo, overrides = {}) {
  const res = await request(app)
    .post('/api/tipi-camera')
    .set(headerRuolo)
    .send({ nome: `TipoTest${SUFFISSO}`, ...overrides });
  if (res.status === 201) tipiCreati.push(res.body.id);
  return res;
}

afterAll(async () => {
  const db = getPool();
  if (cameraTestId) await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  if (tipiCreati.length) await db.query('DELETE FROM tipi_camera WHERE id = ANY($1)', [tipiCreati]);
  await chiudiPool();
});

// ─── GET /api/tipi-camera ──────────────────────────────────────────────────────

describe('GET /api/tipi-camera', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/tipi-camera');
    expect(res.status).toBe(401);
  });

  test('receptionist (lettura consentita) → 200 con array', async () => {
    const res = await request(app).get('/api/tipi-camera').set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0); // almeno le 5 categorie seedate dalla migration
  });

  test('cameriere → 403 (nessun accesso alla sezione tipi_camera)', async () => {
    const res = await request(app).get('/api/tipi-camera').set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('ogni categoria ha camere_assegnate come numero', async () => {
    const res = await request(app).get('/api/tipi-camera').set(authHeader.titolare());
    expect(typeof res.body[0].camere_assegnate).toBe('number');
  });
});

// ─── POST /api/tipi-camera ──────────────────────────────────────────────────────

describe('POST /api/tipi-camera', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/tipi-camera').send({});
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (sola lettura)', async () => {
    const res = await creaTipo(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('nome mancante → 400', async () => {
    const res = await request(app).post('/api/tipi-camera').set(authHeader.titolare()).send({ capienza_max: 2 });
    expect(res.status).toBe(400);
  });

  test('titolare crea categoria → 201', async () => {
    const res = await creaTipo(authHeader.titolare(), { capienza_max: 3, note: 'nota di test' });
    expect(res.status).toBe(201);
    expect(res.body.nome).toBe(`TipoTest${SUFFISSO}`);
    expect(res.body.capienza_max).toBe(3);
  });

  test('nome duplicato → 409', async () => {
    const res = await creaTipo(authHeader.admin());
    expect(res.status).toBe(409);
  });
});

// ─── PATCH /api/tipi-camera/:id ──────────────────────────────────────────────────

describe('PATCH /api/tipi-camera/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).patch('/api/tipi-camera/1').send({});
    expect(res.status).toBe(401);
  });

  test('receptionist → 403', async () => {
    const res = await request(app)
      .patch(`/api/tipi-camera/${tipiCreati[0]}`)
      .set(authHeader.receptionist())
      .send({ capienza_max: 5 });
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app).patch('/api/tipi-camera/999999999').set(authHeader.admin()).send({ capienza_max: 5 });
    expect(res.status).toBe(404);
  });

  test('titolare aggiorna capienza_max → 200', async () => {
    const res = await request(app)
      .patch(`/api/tipi-camera/${tipiCreati[0]}`)
      .set(authHeader.titolare())
      .send({ capienza_max: 5 });
    expect(res.status).toBe(200);
    expect(res.body.capienza_max).toBe(5);
  });
});

// ─── DELETE /api/tipi-camera/:id ─────────────────────────────────────────────────

describe('DELETE /api/tipi-camera/:id', () => {
  let tipoBloccatoId, tipoLiberoId;

  beforeAll(async () => {
    const bloccato = await creaTipo(authHeader.admin(), { nome: `TipoBloccato${SUFFISSO}` });
    tipoBloccatoId = bloccato.body.id;
    const libero = await creaTipo(authHeader.admin(), { nome: `TipoLibero${SUFFISSO}` });
    tipoLiberoId = libero.body.id;

    const db = getPool();
    const cam = await db.query(
      `INSERT INTO camere (numero, nome, tipo_camera_id) VALUES ($1, 'Camera Test TipiCamera', $2) RETURNING id`,
      [`TEST-TC${SUFFISSO}`, tipoBloccatoId]
    );
    cameraTestId = cam.rows[0].id;
  });

  test('senza token → 401', async () => {
    const res = await request(app).delete(`/api/tipi-camera/${tipoLiberoId}`);
    expect(res.status).toBe(401);
  });

  test('receptionist → 403', async () => {
    const res = await request(app).delete(`/api/tipi-camera/${tipoLiberoId}`).set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('categoria referenziata da una camera → 409', async () => {
    const res = await request(app).delete(`/api/tipi-camera/${tipoBloccatoId}`).set(authHeader.admin());
    expect(res.status).toBe(409);
  });

  test('categoria non referenziata → 204', async () => {
    const res = await request(app).delete(`/api/tipi-camera/${tipoLiberoId}`).set(authHeader.admin());
    expect(res.status).toBe(204);
  });
});
