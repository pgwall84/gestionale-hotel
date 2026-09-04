const { calcolaOverrideBeds24 } = require('../../backend/lib/beds24PrezziDisponibilita');

describe('calcolaOverrideBeds24', () => {
  test('stop_sell vince su tutto', () => {
    expect(calcolaOverrideBeds24({ chiuso_arrivo: true, chiuso_partenza: true, stop_sell: true })).toBe('blackout');
    expect(calcolaOverrideBeds24({ chiuso_arrivo: false, chiuso_partenza: false, stop_sell: true })).toBe('blackout');
  });
  test('chiuso_arrivo e chiuso_partenza insieme (senza stop_sell)', () => {
    expect(calcolaOverrideBeds24({ chiuso_arrivo: true, chiuso_partenza: true, stop_sell: false })).toBe('noCheckInOrCheckOut');
  });
  test('solo chiuso_arrivo', () => {
    expect(calcolaOverrideBeds24({ chiuso_arrivo: true, chiuso_partenza: false, stop_sell: false })).toBe('noCheckIn');
  });
  test('solo chiuso_partenza', () => {
    expect(calcolaOverrideBeds24({ chiuso_arrivo: false, chiuso_partenza: true, stop_sell: false })).toBe('noCheckOut');
  });
  test('nessuna restrizione', () => {
    expect(calcolaOverrideBeds24({ chiuso_arrivo: false, chiuso_partenza: false, stop_sell: false })).toBe('none');
  });
});
