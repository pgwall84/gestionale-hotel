// tests/lib/beds24Riconciliazione.test.js
const pool = require('../../backend/config/db');
const beds24Client = require('../../backend/lib/beds24Client');
const beds24SyncController = require('../../backend/controllers/beds24SyncController');
const { eseguiRiconciliazione } = require('../../backend/jobs/beds24Riconciliazione');

describe('eseguiRiconciliazione', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await pool.query('DELETE FROM beds24_config');
  });

  test('non chiama Beds24 se non è mai stato fatto un giro precedente', async () => {
    const spy = jest.spyOn(beds24Client, 'getBookings');
    await eseguiRiconciliazione();
    expect(spy).not.toHaveBeenCalled();
  });

  test('chiama processaBooking per ogni prenotazione restituita e aggiorna ultima_sincronizzazione_at', async () => {
    await pool.query(
      `INSERT INTO beds24_config (id, ultima_sincronizzazione_at) VALUES (1, NOW() - INTERVAL '1 day')`
    );
    jest.spyOn(beds24Client, 'getBookings').mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const processaSpy = jest.spyOn(beds24SyncController, 'processaBooking').mockResolvedValue({ esito: 'aggiornata' });

    await eseguiRiconciliazione();

    expect(processaSpy).toHaveBeenCalledTimes(2);
    const config = await pool.query('SELECT ultima_sincronizzazione_at FROM beds24_config WHERE id = 1');
    expect(new Date(config.rows[0].ultima_sincronizzazione_at).getTime()).toBeGreaterThan(Date.now() - 5000);
  });
});
