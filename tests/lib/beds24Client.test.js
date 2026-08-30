// tests/lib/beds24Client.test.js
const pool = require('../../backend/config/db');
const beds24Client = require('../../backend/lib/beds24Client');

describe('beds24Client — scambiaInviteCode', () => {
  afterEach(async () => {
    await pool.query('DELETE FROM beds24_config');
    jest.restoreAllMocks();
  });

  test('salva token, refresh token e valorizza ultima_sincronizzazione_at (bootstrap del job notturno)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'token_iniziale', refreshToken: 'rt_iniziale', expiresIn: 86400 }),
    });

    const risultato = await beds24Client.scambiaInviteCode('invite_fittizio');

    expect(risultato).toEqual({ token: 'token_iniziale', refreshToken: 'rt_iniziale', expiresIn: 86400 });
    const riga = await pool.query('SELECT refresh_token, token, ultima_sincronizzazione_at FROM beds24_config WHERE id = 1');
    expect(riga.rows).toHaveLength(1);
    expect(riga.rows[0].refresh_token).toBe('rt_iniziale');
    // Se questa è null, eseguiRiconciliazione() salterà per sempre —
    // vedi commento in beds24Client.js.
    expect(riga.rows[0].ultima_sincronizzazione_at).not.toBeNull();
  });
});

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

  test('getBookings passa il token, modifiedFrom e lo status di default (incluso cancelled)', async () => {
    await pool.query(
      `INSERT INTO beds24_config (id, refresh_token, token, token_scade_at)
       VALUES (1, 'rt_fittizio', 'token_valido', NOW() + INTERVAL '1 hour')`
    );
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, count: 1, pages: { nextPageExists: false }, data: [{ id: 111, roomId: 222 }] }),
    });

    const prenotazioni = await beds24Client.getBookings({ modifiedFrom: '2026-08-29T00:00:00' });

    expect(prenotazioni).toEqual([{ id: 111, roomId: 222 }]);
    const urlChiamato = new URL(fetchSpy.mock.calls[0][0]);
    expect(urlChiamato.searchParams.get('modifiedFrom')).toBe('2026-08-29T00:00:00');
    expect(urlChiamato.searchParams.getAll('status')).toEqual(['confirmed', 'new', 'request', 'cancelled']);
    expect(fetchSpy.mock.calls[0][1].headers.token).toBe('token_valido');
  });

  test('getBookings segue la paginazione e concatena i risultati di tutte le pagine', async () => {
    await pool.query(
      `INSERT INTO beds24_config (id, refresh_token, token, token_scade_at)
       VALUES (1, 'rt_fittizio', 'token_valido', NOW() + INTERVAL '1 hour')`
    );
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, count: 2, pages: { nextPageExists: true }, data: [{ id: 1 }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, count: 2, pages: { nextPageExists: false }, data: [{ id: 2 }] }),
      });

    const prenotazioni = await beds24Client.getBookings({});

    expect(prenotazioni).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const urlSecondaChiamata = new URL(fetchSpy.mock.calls[1][0]);
    expect(urlSecondaChiamata.searchParams.get('page')).toBe('2');
  });
});
