// tests/api/beds24Sync.test.js
const pool = require('../../backend/config/db');
const { processaBooking } = require('../../backend/controllers/beds24SyncController');

describe('beds24SyncController — processaBooking, creazione', () => {
  let tipoCameraId, cameraId;

  beforeAll(async () => {
    const tc = await pool.query(
      `INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Doppia Test Beds24', 2) RETURNING id`
    );
    tipoCameraId = tc.rows[0].id;
    const c = await pool.query(
      `INSERT INTO camere (numero, nome, attivo) VALUES ('T24', 'Camera Test Beds24', true) RETURNING id`
    );
    cameraId = c.rows[0].id;
    await pool.query(
      `INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`,
      [tipoCameraId, cameraId]
    );
    await pool.query(
      `INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno) VALUES ($1, 'beds24', '999888')`,
      [tipoCameraId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (SELECT id FROM soggiorni WHERE camera_id = $1)`, [cameraId]);
    await pool.query(`DELETE FROM soggiorni WHERE camera_id = $1`, [cameraId]);
    await pool.query(`DELETE FROM prenotazioni WHERE canale_origine = 'beds24'`);
    await pool.query(`DELETE FROM ospiti WHERE email = 'ospite.beds24test@example.com'`);
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_camere WHERE camera_id = $1`, [cameraId]);
    await pool.query(`DELETE FROM camere WHERE id = $1`, [cameraId]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
  });

  const bookingFittizio = {
    id: 555111,
    roomId: 999888,
    arrival: '2026-11-10',
    departure: '2026-11-12',
    numAdult: 2,
    numChild: 0,
    firstName: 'Mario',
    lastName: 'Rossi Beds24Test',
    email: 'ospite.beds24test@example.com',
    status: 'confirmed',
  };

  test('crea prenotazione + soggiorno + ospite alla prima ricezione', async () => {
    const risultato = await processaBooking(bookingFittizio);

    expect(risultato.esito).toBe('creata');
    const prenotazione = await pool.query(
      `SELECT * FROM prenotazioni WHERE canale_origine = 'beds24' AND external_booking_id = '555111'`
    );
    expect(prenotazione.rows).toHaveLength(1);
    const soggiorno = await pool.query(
      `SELECT * FROM soggiorni WHERE prenotazione_id = $1`, [prenotazione.rows[0].id]
    );
    expect(soggiorno.rows).toHaveLength(1);
    expect(soggiorno.rows[0].camera_id).toBe(cameraId);
    expect(soggiorno.rows[0].num_ospiti).toBe(2);
  });

  test('la stessa external_booking_id non crea un doppione, aggiorna la riga esistente', async () => {
    const bookingModificato = { ...bookingFittizio, numAdult: 1 };
    const risultato = await processaBooking(bookingModificato);

    expect(risultato.esito).toBe('aggiornata');
    const prenotazioni = await pool.query(
      `SELECT * FROM prenotazioni WHERE canale_origine = 'beds24' AND external_booking_id = '555111'`
    );
    expect(prenotazioni.rows).toHaveLength(1);
    const soggiorno = await pool.query(
      `SELECT num_ospiti FROM soggiorni WHERE prenotazione_id = $1`, [prenotazioni.rows[0].id]
    );
    expect(soggiorno.rows[0].num_ospiti).toBe(1);
  });
});
