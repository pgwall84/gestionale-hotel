// Test suite — Modulo Pacchetti (Modulo 2.2, Fase 2A).
// Copre: GET /api/pacchetti, POST, PATCH (incluso toggle attivo/disattivo) —
// permessi e validazione. Nessun DELETE previsto lato API (disattivazione
// soft via PATCH attivo:false — vedi backend/controllers/pacchettiController.js).
// Dipendenze: tabella pacchetti (migration 018).
// Scritto a mano (non da tests/agent/genera-test.js — API Claude non
// disponibile per credito esaurito il 31/07/2026, vedi docs/DIARIO_SESSIONI.md).

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
const pacchettiCreati = [];

async function creaPacchetto(headerRuolo, overrides = {}) {
  const res = await request(app)
    .post('/api/pacchetti')
    .set(headerRuolo)
    .send({ nome: `PacchettoTest${SUFFISSO}`, num_notti: 2, prezzo_totale: 250, ...overrides });
  if (res.status === 201) pacchettiCreati.push(res.body.id);
  return res;
}

afterAll(async () => {
  const db = getPool();
  if (pacchettiCreati.length) await db.query('DELETE FROM pacchetti WHERE id = ANY($1)', [pacchettiCreati]);
  await chiudiPool();
});

// ─── GET /api/pacchetti ───────────────────────────────────────────────────────

describe('GET /api/pacchetti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/pacchetti');
    expect(res.status).toBe(401);
  });

  test('receptionist (lettura consentita) → 200 con array', async () => {
    const res = await request(app).get('/api/pacchetti').set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('cameriere → 403 (nessun accesso alla sezione pacchetti)', async () => {
    const res = await request(app).get('/api/pacchetti').set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('filtro attivo=true → solo pacchetti attivi', async () => {
    const res = await request(app).get('/api/pacchetti?attivo=true').set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.every(p => p.attivo === true)).toBe(true);
  });
});

// ─── POST /api/pacchetti ──────────────────────────────────────────────────────

describe('POST /api/pacchetti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/pacchetti').send({});
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (sola lettura)', async () => {
    const res = await creaPacchetto(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('campi obbligatori mancanti → 400', async () => {
    const res = await request(app).post('/api/pacchetti').set(authHeader.titolare()).send({ nome: 'Solo nome' });
    expect(res.status).toBe(400);
  });

  test('num_notti non positivo → 400', async () => {
    const res = await creaPacchetto(authHeader.titolare(), { num_notti: 0 });
    expect(res.status).toBe(400);
  });

  test('prezzo_totale non positivo → 400', async () => {
    const res = await creaPacchetto(authHeader.titolare(), { prezzo_totale: -10 });
    expect(res.status).toBe(400);
  });

  test('titolare crea pacchetto → 201, attivo di default true', async () => {
    const res = await creaPacchetto(authHeader.titolare(), { descrizione: 'Weekend di prova' });
    expect(res.status).toBe(201);
    expect(res.body.attivo).toBe(true);
    expect(Number(res.body.prezzo_totale)).toBe(250);
  });
});

// ─── PATCH /api/pacchetti/:id ─────────────────────────────────────────────────

describe('PATCH /api/pacchetti/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).patch('/api/pacchetti/1').send({});
    expect(res.status).toBe(401);
  });

  test('receptionist → 403', async () => {
    const res = await request(app)
      .patch(`/api/pacchetti/${pacchettiCreati[0]}`)
      .set(authHeader.receptionist())
      .send({ prezzo_totale: 300 });
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app).patch('/api/pacchetti/999999999').set(authHeader.admin()).send({ prezzo_totale: 300 });
    expect(res.status).toBe(404);
  });

  test('titolare aggiorna prezzo_totale → 200', async () => {
    const res = await request(app)
      .patch(`/api/pacchetti/${pacchettiCreati[0]}`)
      .set(authHeader.titolare())
      .send({ prezzo_totale: 300 });
    expect(res.status).toBe(200);
    expect(Number(res.body.prezzo_totale)).toBe(300);
  });

  test('disattiva pacchetto (attivo:false) → 200, poi sparisce dal filtro attivo=true', async () => {
    const res = await request(app)
      .patch(`/api/pacchetti/${pacchettiCreati[0]}`)
      .set(authHeader.admin())
      .send({ attivo: false });
    expect(res.status).toBe(200);
    expect(res.body.attivo).toBe(false);

    const lista = await request(app).get('/api/pacchetti?attivo=true').set(authHeader.titolare());
    expect(lista.body.find(p => p.id === pacchettiCreati[0])).toBeUndefined();
  });
});
