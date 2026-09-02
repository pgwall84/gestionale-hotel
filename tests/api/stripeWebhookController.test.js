// tests/api/stripeWebhookController.test.js
// Fixture/asserzioni via tests/helpers/db.js (pool separato, stesso DB —
// vedi tests/setup.js). L'endpoint sotto test usa invece confermaPrenotazione
// (backend/lib/prenotazioni/confermaPrenotazione.js), che passa dal pool di
// backend/config/db.js — stesso database, chiuso centralmente da
// tests/setup-after-env.js: qui chiudiamo solo il pool dei helper.
const request = require('supertest');
const app = require('../../backend/app');
const stripe = require('../../backend/lib/stripeClient');
const { getPool, chiudiPool } = require('../helpers/db');

function costruisciHeaderFirma(payload) {
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
}

function eventoPaymentIntentSucceeded({ prenotazioneId, paymentIntentId }) {
  return JSON.stringify({
    id: 'evt_test',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: paymentIntentId,
        payment_method: null,
        amount: 1000,
        metadata: { prenotazione_id: String(prenotazioneId) },
      },
    },
  });
}

const prenotazioniCreate = [];

// canale_origine='test_interno': convenzione del progetto per dati di test
// (esclusi dai job schedulati reali, vedi jobs/invioAlloggiatiWeb.js).
async function creaPrenotazioneConHold(minutiScadenza) {
  const db = getPool();
  const { rows } = await db.query(
    `INSERT INTO prenotazioni (canale_origine, stato, data_scadenza_opzione)
     VALUES ('test_interno', 'opzione', NOW() + make_interval(mins => $1)) RETURNING id`,
    [minutiScadenza]
  );
  prenotazioniCreate.push(rows[0].id);
  return rows[0].id;
}

async function creaPagamentoPending(prenotazioneId, externalPaymentId) {
  const db = getPool();
  await db.query(
    `INSERT INTO pagamenti (prenotazione_id, importo, tipo, stato, external_payment_id) VALUES ($1, 10.00, 'caparra', 'pending', $2)`,
    [prenotazioneId, externalPaymentId]
  );
}

describe('POST /api/stripe/webhook', () => {
  afterAll(async () => {
    const db = getPool();
    if (prenotazioniCreate.length) {
      await db.query('DELETE FROM pagamenti WHERE prenotazione_id = ANY($1::int[])', [prenotazioniCreate]);
      await db.query('DELETE FROM soggiorni WHERE prenotazione_id = ANY($1::int[])', [prenotazioniCreate]);
      await db.query('DELETE FROM prenotazioni WHERE id = ANY($1::int[])', [prenotazioniCreate]);
    }
    await chiudiPool();
  });

  test('payment_intent.succeeded su prenotazione valida conferma la prenotazione', async () => {
    const prenotazioneId = await creaPrenotazioneConHold(15);
    await creaPagamentoPending(prenotazioneId, 'pi_ok');
    const payload = eventoPaymentIntentSucceeded({ prenotazioneId, paymentIntentId: 'pi_ok' });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', costruisciHeaderFirma(payload))
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    const db = getPool();
    const p = await db.query(`SELECT stato FROM prenotazioni WHERE id = $1`, [prenotazioneId]);
    expect(p.rows[0].stato).toBe('confermata');
  });

  test('firma non valida risponde 400 e non tocca il DB', async () => {
    const prenotazioneId = await creaPrenotazioneConHold(15);
    const payload = eventoPaymentIntentSucceeded({ prenotazioneId, paymentIntentId: 'pi_firma_sbagliata' });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'firma_non_valida')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(400);
    const db = getPool();
    const p = await db.query(`SELECT stato FROM prenotazioni WHERE id = $1`, [prenotazioneId]);
    expect(p.rows[0].stato).toBe('opzione');
  });
});
