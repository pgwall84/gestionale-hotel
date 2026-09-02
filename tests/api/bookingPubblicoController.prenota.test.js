// tests/api/bookingPubblicoController.prenota.test.js
// Copre solo il campo `provider` su /configurazione e il contratto di
// risposta dei provider — nessuna delle due cose tocca il DB. I test
// end-to-end di POST /prenota con fixture camere/tipi_camera reali sono
// gia' coperti in tests/api/bookingPubblico.test.js (provider Stripe,
// invariato) — vedi Task 6 del piano per la nota sul perche' non se ne
// aggiungono qui di nuovi con provider Nexi.
const request = require('supertest');
const app = require('../../backend/app');

describe('GET /api/booking-pubblico/configurazione — campo provider', () => {
  const OLD_ENV = process.env;
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  test('provider = stripe di default', async () => {
    delete process.env.PAYMENT_PROVIDER;
    const res = await request(app).get('/api/booking-pubblico/configurazione');
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('stripe');
    expect(res.body).toHaveProperty('percentuale_caparra');
  });

  test('provider = nexi quando PAYMENT_PROVIDER=nexi', async () => {
    process.env.PAYMENT_PROVIDER = 'nexi';
    const res = await request(app).get('/api/booking-pubblico/configurazione');
    expect(res.body.provider).toBe('nexi');
  });
});

describe('contratto di risposta dei provider — chiaveRisposta/datiCliente', () => {
  test('nexiProvider.avviaPagamento produce la forma {external_payment_id, chiaveRisposta, datiCliente}', () => {
    const nexiProvider = require('../../backend/lib/payments/nexiProvider');
    process.env.XPAY_BUILD_ALIAS = 'A';
    process.env.XPAY_BUILD_MAC_KEY = 'K';
    const risultato = nexiProvider.avviaPagamento({ prenotazioneId: 1, importoEuro: 10 });
    expect(Object.keys(risultato).sort()).toEqual(['chiaveRisposta', 'datiCliente', 'external_payment_id']);
  });
});
