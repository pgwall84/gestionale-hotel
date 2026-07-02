// Test suite — Modulo Camere
// Copre: lista camere con stato, oggi (arrivi/partenze), aggiornaStato (soloTitolare), segnaPronte
// Dipendenze: tabella camere (seed — 21 camere fisse), stato_camere

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader, creaToken } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const OGGI = new Date().toISOString().split('T')[0];
let primaCamera; // id della prima camera reale nel DB

beforeAll(async () => {
  const db = getPool();
  const r = await db.query('SELECT id FROM camere ORDER BY id LIMIT 1');
  primaCamera = r.rows[0]?.id ?? 1;
});

afterAll(async () => {
  // Rimuove eventuali record stato_camere creati dai test
  const db = getPool();
  await db.query(`DELETE FROM stato_camere WHERE data = $1 AND aggiornato_da = 2`, [OGGI]);
  await chiudiPool();
});

// ─── GET /api/camere ──────────────────────────────────────────────────────────

describe('GET /api/camere', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/camere');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con array camere', async () => {
    const res = await request(app)
      .get('/api/camere')
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('camere');
    expect(Array.isArray(res.body.camere)).toBe(true);
    expect(res.body.camere.length).toBeGreaterThan(0);
  });

  test('ogni camera ha numero, nome, arrivo, partenza, pronta', async () => {
    const res = await request(app)
      .get('/api/camere')
      .set(authHeader.receptionist());
    const c = res.body.camere[0];
    expect(c).toHaveProperty('numero');
    expect(c).toHaveProperty('nome');
    expect(c).toHaveProperty('arrivo');
    expect(c).toHaveProperty('partenza');
    expect(c).toHaveProperty('pronta');
  });

  test('con parametro data → 200', async () => {
    const res = await request(app)
      .get('/api/camere?data=2026-07-15')
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.data).toBe('2026-07-15');
  });
});

// ─── GET /api/camere/oggi ─────────────────────────────────────────────────────

describe('GET /api/camere/oggi', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/camere/oggi');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con array camere oggi', async () => {
    const res = await request(app)
      .get('/api/camere/oggi')
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('camere');
    expect(Array.isArray(res.body.camere)).toBe(true);
  });
});

// ─── POST /api/camere/stato ───────────────────────────────────────────────────

describe('POST /api/camere/stato', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/camere/stato').send({});
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (solo titolare)', async () => {
    const res = await request(app)
      .post('/api/camere/stato')
      .set(authHeader.cameriere())
      .send({ camera_id: primaCamera, arrivo: true });
    expect(res.status).toBe(403);
  });

  test('camera_id mancante → 400', async () => {
    const res = await request(app)
      .post('/api/camere/stato')
      .set(authHeader.titolare())
      .send({ arrivo: true });
    expect(res.status).toBe(400);
  });

  test('titolare aggiorna stato camera → 200', async () => {
    const res = await request(app)
      .post('/api/camere/stato')
      .set(authHeader.titolare())
      .send({ camera_id: primaCamera, data: OGGI, arrivo: true, partenza: false, note: 'test' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stato');
    expect(res.body.stato.arrivo).toBe(true);
  });

  test('upsert — secondo aggiornamento stessa camera/data → 200', async () => {
    const res = await request(app)
      .post('/api/camere/stato')
      .set(authHeader.titolare())
      .send({ camera_id: primaCamera, data: OGGI, arrivo: false, partenza: true });
    expect(res.status).toBe(200);
    expect(res.body.stato.partenza).toBe(true);
  });
});

// ─── POST /api/camere/pronta ──────────────────────────────────────────────────

describe('POST /api/camere/pronta', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/camere/pronta').send({});
    expect(res.status).toBe(401);
  });

  test('camera_id mancante → 400', async () => {
    const res = await request(app)
      .post('/api/camere/pronta')
      .set(authHeader.cameriere())
      .send({ pronta: true });
    expect(res.status).toBe(400);
  });

  test('cameriere segna camera pronta → 200', async () => {
    const res = await request(app)
      .post('/api/camere/pronta')
      .set(authHeader.cameriere())
      .send({ camera_id: primaCamera, data: OGGI, pronta: true });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('messaggio');
  });

  test('cameriere segna camera non pronta → 200', async () => {
    const res = await request(app)
      .post('/api/camere/pronta')
      .set(authHeader.cameriere())
      .send({ camera_id: primaCamera, data: OGGI, pronta: false });
    expect(res.status).toBe(200);
  });
});
