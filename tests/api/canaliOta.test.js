// Test suite — Mappatura canali OTA (Modulo 2.3, Fase 1).
// Copre: GET /api/canali-ota (lista per categoria, LEFT JOIN da tipi_camera),
// PUT /api/canali-ota/:tipoCameraId (upsert codice_esterno per canale).
// Dipendenze: tabelle tipi_camera + tipi_camera_canali (migration 020).
// Usa una categoria dedicata al test (non le categorie reali già
// configurate dal titolare), stesso pattern di tariffe.test.js/tipiCamera.test.js.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let tipoCameraId;

beforeAll(async () => {
  const db = getPool();
  const tipo = await db.query(`INSERT INTO tipi_camera (nome) VALUES ($1) RETURNING id`, [`TipoCanaliOtaTest${SUFFISSO}`]);
  tipoCameraId = tipo.rows[0].id;
});

afterAll(async () => {
  const db = getPool();
  // tipi_camera_canali ha ON DELETE CASCADE su tipo_camera_id (migration 020)
  // — cancellare tipi_camera basta, nessuna DELETE separata necessaria.
  await db.query('DELETE FROM tipi_camera WHERE id = $1', [tipoCameraId]);
  await chiudiPool();
});

// ─── GET /api/canali-ota ───────────────────────────────────────────────────────

describe('GET /api/canali-ota', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/canali-ota');
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (nessun accesso alla sezione canali_ota)', async () => {
    const res = await request(app).get('/api/canali-ota').set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('receptionist (lettura consentita) → 200 con array', async () => {
    const res = await request(app).get('/api/canali-ota').set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('include la categoria di test, canale wubook, codice_esterno null (non ancora configurato)', async () => {
    const res = await request(app).get('/api/canali-ota').set(authHeader.titolare());
    const riga = res.body.find(r => r.tipo_camera_id === tipoCameraId);
    expect(riga).toBeDefined();
    expect(riga.canale).toBe('wubook');
    expect(riga.codice_esterno).toBeNull();
  });
});

// ─── PUT /api/canali-ota/:tipoCameraId ─────────────────────────────────────────

describe('PUT /api/canali-ota/:tipoCameraId', () => {
  test('senza token → 401', async () => {
    const res = await request(app).put(`/api/canali-ota/${tipoCameraId}`).send({ codice_esterno: '12345' });
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (sola lettura)', async () => {
    const res = await request(app)
      .put(`/api/canali-ota/${tipoCameraId}`)
      .set(authHeader.receptionist())
      .send({ codice_esterno: '12345' });
    expect(res.status).toBe(403);
  });

  test('categoria camera inesistente → 404', async () => {
    const res = await request(app)
      .put('/api/canali-ota/999999999')
      .set(authHeader.titolare())
      .send({ codice_esterno: '12345' });
    expect(res.status).toBe(404);
  });

  test('titolare imposta codice → 200, codice_esterno valorizzato, canale default wubook', async () => {
    const res = await request(app)
      .put(`/api/canali-ota/${tipoCameraId}`)
      .set(authHeader.titolare())
      .send({ codice_esterno: '104521' });
    expect(res.status).toBe(200);
    expect(res.body.codice_esterno).toBe('104521');
    expect(res.body.canale).toBe('wubook');
  });

  test('upsert idempotente — un secondo PUT aggiorna la stessa riga, non ne crea una seconda', async () => {
    await request(app)
      .put(`/api/canali-ota/${tipoCameraId}`)
      .set(authHeader.admin())
      .send({ codice_esterno: '999888' });

    const db = getPool();
    const r = await db.query(
      'SELECT COUNT(*) AS tot FROM tipi_camera_canali WHERE tipo_camera_id = $1 AND canale = $2',
      [tipoCameraId, 'wubook']
    );
    expect(Number(r.rows[0].tot)).toBe(1);

    const res = await request(app).get('/api/canali-ota').set(authHeader.titolare());
    const riga = res.body.find(r2 => r2.tipo_camera_id === tipoCameraId);
    expect(riga.codice_esterno).toBe('999888');
  });

  test('codice_esterno vuoto → 200, torna null (permette di rimuovere un codice inserito per errore)', async () => {
    const res = await request(app)
      .put(`/api/canali-ota/${tipoCameraId}`)
      .set(authHeader.titolare())
      .send({ codice_esterno: '' });
    expect(res.status).toBe(200);
    expect(res.body.codice_esterno).toBeNull();
  });
});
