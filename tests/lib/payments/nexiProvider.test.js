// tests/lib/payments/nexiProvider.test.js
describe('nexiProvider — calcolo MAC', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      XPAY_BUILD_ALIAS: 'ALIAS_TEST',
      XPAY_BUILD_MAC_KEY: 'CHIAVE_TEST',
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('macAvvioPagamento produce lo stesso sha1 per gli stessi input', () => {
    const { macAvvioPagamento } = require('../../../backend/lib/payments/nexiProvider');
    const mac1 = macAvvioPagamento({ transactionId: 'PR1T1000', amount: 15000, currency: 'EUR' });
    const mac2 = macAvvioPagamento({ transactionId: 'PR1T1000', amount: 15000, currency: 'EUR' });
    expect(mac1).toBe(mac2);
    expect(mac1).toMatch(/^[a-f0-9]{40}$/);
  });

  test('macAvvioPagamento cambia se cambia importo', () => {
    const { macAvvioPagamento } = require('../../../backend/lib/payments/nexiProvider');
    const macA = macAvvioPagamento({ transactionId: 'PR1T1000', amount: 15000, currency: 'EUR' });
    const macB = macAvvioPagamento({ transactionId: 'PR1T1000', amount: 20000, currency: 'EUR' });
    expect(macA).not.toBe(macB);
  });

  test('avviaPagamento lancia se ALIAS/CHIAVE_SEGRETA non configurati', () => {
    process.env.XPAY_BUILD_ALIAS = '';
    const { avviaPagamento } = require('../../../backend/lib/payments/nexiProvider');
    expect(() => avviaPagamento({ prenotazioneId: 1, importoEuro: 150 })).toThrow(/XPAY_BUILD_ALIAS/);
  });

  test('avviaPagamento restituisce external_payment_id, chiaveRisposta e datiCliente coerenti', () => {
    const { avviaPagamento } = require('../../../backend/lib/payments/nexiProvider');
    const risultato = avviaPagamento({ prenotazioneId: 42, importoEuro: 150.5 });
    expect(risultato.chiaveRisposta).toBe('pagamento_nexi');
    expect(risultato.external_payment_id).toBe(risultato.datiCliente.transactionId);
    expect(risultato.datiCliente.amount).toBe(15050);
    expect(risultato.datiCliente.alias).toBe('ALIAS_TEST');
  });
});
