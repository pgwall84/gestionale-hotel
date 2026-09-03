// tests/api/beds24Webhook.test.js
const request = require('supertest');
const app = require('../../backend/app');
const pool = require('../../backend/config/db');
const { authHeader } = require('../helpers/auth');
const beds24Client = require('../../backend/lib/beds24Client');

describe('POST /api/beds24/webhook/bookings', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await pool.query(`DELETE FROM webhook_log WHERE fonte = 'beds24'`);
    await pool.query(`DELETE FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id = '999777'`);
  });

  test('arricchisce con GET /bookings prima di processare, poi logga il payload grezzo (incapsulato)', async () => {
    const bookingCompleto = {
      id: 999777, roomId: 88888, arrival: '2026-12-01', departure: '2026-12-02',
      numAdult: 1, numChild: 0, firstName: 'Test', lastName: 'Webhook',
      email: 'webhook.beds24test@example.com', phone: null, status: 'confirmed',
    };
    const getBookingsSpy = jest.spyOn(beds24Client, 'getBookings').mockResolvedValue([bookingCompleto]);

    const risposta = await request(app)
      .post('/api/beds24/webhook/bookings')
      .send({
        timeStamp: '2026-08-30T08:11:32.996Z',
        booking: { id: 999777, roomId: 88888, arrival: '2026-12-01', departure: '2026-12-02', status: 'confirmed' },
        retries: 0,
      });

    expect(risposta.status).toBe(200);
    expect(getBookingsSpy).toHaveBeenCalledWith({ id: [999777] });
    const log = await pool.query(`SELECT * FROM webhook_log WHERE fonte = 'beds24' ORDER BY id DESC LIMIT 1`);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0].payload_raw.booking.id).toBe(999777);
    // roomId 88888 non è mappato in tipi_camera_canali → finisce in coda,
    // ma con i dati ospite VERI (dalla GET arricchita), non da null.
    const coda = await pool.query(`SELECT * FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id = '999777'`);
    expect(coda.rows).toHaveLength(1);
    expect(coda.rows[0].payload_raw.email).toBe('webhook.beds24test@example.com');
  });

  test('se GET /bookings di arricchimento fallisce, non processa e non crea ospiti vuoti', async () => {
    jest.spyOn(beds24Client, 'getBookings').mockRejectedValue(new Error('rete non raggiungibile'));

    const risposta = await request(app)
      .post('/api/beds24/webhook/bookings')
      .send({ booking: { id: 999777, roomId: 88888, status: 'confirmed' } });

    expect(risposta.status).toBe(200);
    const log = await pool.query(`SELECT errore FROM webhook_log WHERE fonte = 'beds24' ORDER BY id DESC LIMIT 1`);
    expect(log.rows[0].errore).toMatch(/arricchimento/);
    const coda = await pool.query(`SELECT * FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id = '999777'`);
    expect(coda.rows).toHaveLength(0);
  });

  test('risponde 200 anche se il payload è vuoto/malformato, senza andare in crash', async () => {
    const risposta = await request(app).post('/api/beds24/webhook/bookings').send({});
    expect(risposta.status).toBe(200);
  });
});

describe('GET /api/beds24/webhook/bookings', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await pool.query(`DELETE FROM webhook_log WHERE fonte = 'beds24'`);
    await pool.query(`DELETE FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id = '999778'`);
  });

  test('formato reale Beds24 (bookid/status in query, nessun corpo): arricchisce con GET /bookings e logga bookid/status', async () => {
    const bookingCompleto = {
      id: 999778, roomId: 88889, arrival: '2026-12-05', departure: '2026-12-06',
      numAdult: 1, numChild: 0, firstName: 'Test', lastName: 'WebhookGet',
      email: 'webhookget.beds24test@example.com', phone: null, status: 'confirmed',
    };
    const getBookingsSpy = jest.spyOn(beds24Client, 'getBookings').mockResolvedValue([bookingCompleto]);

    const risposta = await request(app)
      .get('/api/beds24/webhook/bookings')
      .query({ bookid: 999778, status: 'new' });

    expect(risposta.status).toBe(200);
    expect(getBookingsSpy).toHaveBeenCalledWith({ id: ['999778'] });
    const log = await pool.query(`SELECT * FROM webhook_log WHERE fonte = 'beds24' ORDER BY id DESC LIMIT 1`);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0].payload_raw.bookid).toBe('999778');
    expect(log.rows[0].payload_raw.status).toBe('new');
    // roomId 88889 non è mappato → finisce in coda, con i dati ospite veri.
    const coda = await pool.query(`SELECT * FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id = '999778'`);
    expect(coda.rows).toHaveLength(1);
    expect(coda.rows[0].payload_raw.email).toBe('webhookget.beds24test@example.com');
  });

  test('se GET /bookings di arricchimento fallisce, non processa e non crea ospiti vuoti', async () => {
    jest.spyOn(beds24Client, 'getBookings').mockRejectedValue(new Error('rete non raggiungibile'));

    const risposta = await request(app)
      .get('/api/beds24/webhook/bookings')
      .query({ bookid: 999778, status: 'new' });

    expect(risposta.status).toBe(200);
    const log = await pool.query(`SELECT errore FROM webhook_log WHERE fonte = 'beds24' ORDER BY id DESC LIMIT 1`);
    expect(log.rows[0].errore).toMatch(/arricchimento/);
    const coda = await pool.query(`SELECT * FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id = '999778'`);
    expect(coda.rows).toHaveLength(0);
  });

  test('risponde 200 anche senza bookid, senza andare in crash', async () => {
    const risposta = await request(app).get('/api/beds24/webhook/bookings').query({ status: 'new' });
    expect(risposta.status).toBe(200);
    const log = await pool.query(`SELECT errore FROM webhook_log WHERE fonte = 'beds24' ORDER BY id DESC LIMIT 1`);
    expect(log.rows[0].errore).toMatch(/bookid/);
  });
});

describe('GET /api/beds24/da-revisionare — permessi', () => {
  test('senza token → 401', async () => {
    const risposta = await request(app).get('/api/beds24/da-revisionare');
    expect(risposta.status).toBe(401);
  });

  test('con ruolo cameriere → 403', async () => {
    const risposta = await request(app).get('/api/beds24/da-revisionare').set(authHeader.cameriere());
    expect(risposta.status).toBe(403);
  });

  test('con ruolo receptionist → 200', async () => {
    const risposta = await request(app).get('/api/beds24/da-revisionare').set(authHeader.receptionist());
    expect(risposta.status).toBe(200);
    expect(Array.isArray(risposta.body)).toBe(true);
  });
});
