// tests/api/beds24Webhook.test.js
const request = require('supertest');
const app = require('../../backend/app');
const pool = require('../../backend/config/db');

describe('POST /api/beds24/webhook/bookings', () => {
  afterEach(async () => {
    await pool.query(`DELETE FROM webhook_log WHERE fonte = 'beds24'`);
    await pool.query(`DELETE FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id = '999777'`);
  });

  test('logga sempre il payload grezzo su webhook_log, anche se il roomId non è mappato', async () => {
    const risposta = await request(app)
      .post('/api/beds24/webhook/bookings')
      .send({ id: 999777, roomId: 88888, arrival: '2026-12-01', departure: '2026-12-02', firstName: 'Test', lastName: 'Webhook', status: 'confirmed' });

    expect(risposta.status).toBe(200);
    const log = await pool.query(`SELECT * FROM webhook_log WHERE fonte = 'beds24' ORDER BY id DESC LIMIT 1`);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0].payload_raw.id).toBe(999777);
    const coda = await pool.query(`SELECT * FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id = '999777'`);
    expect(coda.rows).toHaveLength(1);
  });

  test('risponde 200 anche se il payload è vuoto/malformato, senza andare in crash', async () => {
    const risposta = await request(app).post('/api/beds24/webhook/bookings').send({});
    expect(risposta.status).toBe(200);
  });
});
