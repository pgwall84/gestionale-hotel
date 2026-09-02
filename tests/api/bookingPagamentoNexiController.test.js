// tests/api/bookingPagamentoNexiController.test.js
// Fixture/asserzioni via tests/helpers/db.js (pool separato, stesso DB —
// vedi tests/setup.js). L'endpoint sotto test usa invece confermaPrenotazione
// (pool di backend/config/db.js), chiuso centralmente da
// tests/setup-after-env.js: qui chiudiamo solo il pool dei helper.
const request = require('supertest');
const app = require('../../backend/app');
const nexiProvider = require('../../backend/lib/payments/nexiProvider');
const { getPool, chiudiPool } = require('../helpers/db');

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

async function creaPagamentoPending(prenotazioneId, externalPaymentId, importo = 10.0) {
  const db = getPool();
  await db.query(
    `INSERT INTO pagamenti (prenotazione_id, importo, tipo, stato, external_payment_id, metodo) VALUES ($1, $2, 'caparra', 'pending', $3, 'nexi')`,
    [prenotazioneId, importo, externalPaymentId]
  );
}

describe('POST /api/booking-pubblico/completa-pagamento-nexi', () => {
  afterAll(async () => {
    const db = getPool();
    if (prenotazioniCreate.length) {
      await db.query('DELETE FROM pagamenti WHERE prenotazione_id = ANY($1::int[])', [prenotazioniCreate]);
      await db.query('DELETE FROM soggiorni WHERE prenotazione_id = ANY($1::int[])', [prenotazioniCreate]);
      await db.query('DELETE FROM prenotazioni WHERE id = ANY($1::int[])', [prenotazioniCreate]);
    }
    await chiudiPool();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('esito OK su prenotazione valida conferma la prenotazione', async () => {
    const prenotazioneId = await creaPrenotazioneConHold(15);
    await creaPagamentoPending(prenotazioneId, 'PR-OK');
    jest.spyOn(nexiProvider, 'completaPagamento').mockResolvedValue({
      httpStatus: 200,
      esito: { esito: 'OK', idOperazione: '123456' },
    });

    const res = await request(app)
      .post('/api/booking-pubblico/completa-pagamento-nexi')
      .send({ prenotazione_id: prenotazioneId, xpay_nonce: 'nonce-test' });

    expect(res.status).toBe(200);
    expect(res.body.confermato).toBe(true);
    const db = getPool();
    const p = await db.query(`SELECT stato FROM prenotazioni WHERE id = $1`, [prenotazioneId]);
    expect(p.rows[0].stato).toBe('confermata');
  });

  test('esito KO — pagamento rifiutato, prenotazione resta in opzione, pagamento fallito', async () => {
    const prenotazioneId = await creaPrenotazioneConHold(15);
    await creaPagamentoPending(prenotazioneId, 'PR-KO');
    jest.spyOn(nexiProvider, 'completaPagamento').mockResolvedValue({
      httpStatus: 200,
      esito: { esito: 'KO', errore: { codice: 19, messaggio: 'Auth. Denied' } },
    });

    const res = await request(app)
      .post('/api/booking-pubblico/completa-pagamento-nexi')
      .send({ prenotazione_id: prenotazioneId, xpay_nonce: 'nonce-test' });

    expect(res.status).toBe(200);
    expect(res.body.confermato).toBe(false);
    const db = getPool();
    const p = await db.query(`SELECT stato FROM prenotazioni WHERE id = $1`, [prenotazioneId]);
    expect(p.rows[0].stato).toBe('opzione');
    const pag = await db.query(`SELECT stato FROM pagamenti WHERE prenotazione_id = $1`, [prenotazioneId]);
    expect(pag.rows[0].stato).toBe('fallito');
  });

  test('esito OK ma hold gia scaduto -> marcato per rimborso manuale, nessuna chiamata di storno automatica', async () => {
    const prenotazioneId = await creaPrenotazioneConHold(-1);
    await creaPagamentoPending(prenotazioneId, 'PR-SCADUTA');
    jest.spyOn(nexiProvider, 'completaPagamento').mockResolvedValue({
      httpStatus: 200,
      esito: { esito: 'OK', idOperazione: '999' },
    });

    const res = await request(app)
      .post('/api/booking-pubblico/completa-pagamento-nexi')
      .send({ prenotazione_id: prenotazioneId, xpay_nonce: 'nonce-test' });

    expect(res.status).toBe(200);
    expect(res.body.confermato).toBe(false);
    expect(res.body.richiede_intervento_manuale).toBe(true);
    const db = getPool();
    const pag = await db.query(`SELECT stato FROM pagamenti WHERE prenotazione_id = $1`, [prenotazioneId]);
    expect(pag.rows[0].stato).toBe('richiede_rimborso_manuale');
  });

  test('prenotazione_id o xpay_nonce mancanti -> 400', async () => {
    const res = await request(app).post('/api/booking-pubblico/completa-pagamento-nexi').send({});
    expect(res.status).toBe(400);
  });
});
