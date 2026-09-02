// tests/lib/payments/index.test.js
describe('lib/payments — selettore provider', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('default a stripe se PAYMENT_PROVIDER non impostata', () => {
    delete process.env.PAYMENT_PROVIDER;
    const { nomeProviderAttivo } = require('../../../backend/lib/payments/index');
    expect(nomeProviderAttivo()).toBe('stripe');
  });

  test('usa nexi se PAYMENT_PROVIDER=nexi', () => {
    process.env.PAYMENT_PROVIDER = 'nexi';
    const { nomeProviderAttivo } = require('../../../backend/lib/payments/index');
    expect(nomeProviderAttivo()).toBe('nexi');
  });

  test('ricade su stripe se PAYMENT_PROVIDER ha un valore non riconosciuto', () => {
    process.env.PAYMENT_PROVIDER = 'paypal';
    const { nomeProviderAttivo } = require('../../../backend/lib/payments/index');
    expect(nomeProviderAttivo()).toBe('stripe');
  });

  test('providerAttivo() restituisce il modulo nexiProvider quando nexi e attivo', () => {
    process.env.PAYMENT_PROVIDER = 'nexi';
    const { providerAttivo } = require('../../../backend/lib/payments/index');
    const nexiProvider = require('../../../backend/lib/payments/nexiProvider');
    expect(providerAttivo()).toBe(nexiProvider);
  });
});
