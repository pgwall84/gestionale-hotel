// Test suite — Modulo 1.8: Dashboard KPI reali
// Copre: GET /api/dashboard/kpi, POST /api/dashboard/incassi, GET /api/dashboard/alert
// Usa date fittizie 2099 (oggi test) e 2098 (anno scorso test) per non toccare dati reali.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const DATA_TEST        = '2099-06-15';
const DATA_ANNO_SCORSO = '2098-06-15';
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
