// tests/lib/beds24Client.test.js
const pool = require('../../backend/config/db');
const beds24Client = require('../../backend/lib/beds24Client');

describe('beds24Client — getToken', () => {
  afterEach(async () => {
    await pool.query('DELETE FROM beds24_config');
    jest.restoreAllMocks();
  });

  test('restituisce il token salvato se non è scaduto, senza chiamare Beds24', async () => {
    await pool.query(
      `INSERT INTO beds24_config (id, refresh_token, token, token_scade_at)
       VALUES (1, 'rt_fittizio', 'token_valido', NOW() + INTERVAL '1 hour')`
    );
    const fetchSpy = jest.spyOn(global, 'fetch');

    const token = await beds24Client.getToken();

    expect(token).toBe('token_valido');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('rinnova il token se scaduto e salva il nuovo su beds24_config', async () => {
    await pool.query(
      `INSERT INTO beds24_config (id, refresh_token, token, token_scade_at)
       VALUES (1, 'rt_fittizio', 'token_vecchio', NOW() - INTERVAL '1 hour')`
    );
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'token_nuovo', expiresIn: 86400 }),
    });

    const token = await beds24Client.getToken();

    expect(token).toBe('token_nuovo');
    const riga = await pool.query('SELECT token FROM beds24_config WHERE id = 1');
    expect(riga.rows[0].token).toBe('token_nuovo');
  });
});

describe('beds24Client — getBookings', () => {
  afterEach(async () => {
    await pool.query('DELETE FROM beds24_config');
    jest.restoreAllMocks();
  });

  test('getBookings passa il token e modifiedSince, restituisce un array', async () => {
    await pool.query(
      `INSERT INTO beds24_config (id, refresh_token, token, token_scade_at)
       VALUES (1, 'rt_fittizio', 'token_valido', NOW() + INTERVAL '1 hour')`
    );
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ([{ id: 111, roomId: 222 }]),
    });

    const prenotazioni = await beds24Client.getBookings({ modifiedSince: '2026-08-29T00:00:00Z' });

    expect(prenotazioni).toEqual([{ id: 111, roomId: 222 }]);
    const urlChiamato = fetchSpy.mock.calls[0][0];
    expect(String(urlChiamato)).toContain('modifiedSince=2026-08-29T00%3A00%3A00Z');
    expect(fetchSpy.mock.calls[0][1].headers.token).toBe('token_valido');
  });
});
