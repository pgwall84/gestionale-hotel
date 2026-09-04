// tests/api/beds24Sync.test.js
// pushDisponibilitaImmediata è mockata: processaBooking la chiama sempre
// dopo ogni commit (Task 8, Fase 2/3), ma questi test verificano solo la
// scrittura su prenotazioni/soggiorni — una vera chiamata di rete verso
// Beds24 qui sarebbe fuori scope e rallenterebbe la suite senza motivo.
jest.mock('../../backend/lib/beds24PushDisponibilita', () => ({ pushDisponibilitaImmediata: jest.fn() }));

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

describe('beds24SyncController — processaBooking, cancellazioni', () => {
  let tipoCameraId, cameraId;

  beforeAll(async () => {
    const tc = await pool.query(
      `INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Doppia Test Beds24 Cancellazioni', 2) RETURNING id`
    );
    tipoCameraId = tc.rows[0].id;
    const c = await pool.query(
      `INSERT INTO camere (numero, nome, attivo) VALUES ('T25', 'Camera Test Beds24 Cancellazioni', true) RETURNING id`
    );
    cameraId = c.rows[0].id;
    await pool.query(`INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`, [tipoCameraId, cameraId]);
    await pool.query(`INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno) VALUES ($1, 'beds24', '999889')`, [tipoCameraId]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (SELECT id FROM soggiorni WHERE camera_id = $1)`, [cameraId]);
    await pool.query(`DELETE FROM soggiorni WHERE camera_id = $1`, [cameraId]);
    await pool.query(`DELETE FROM prenotazioni WHERE canale_origine = 'beds24' AND external_booking_id IN ('555222', '555333', '555666')`);
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_camere WHERE camera_id = $1`, [cameraId]);
    await pool.query(`DELETE FROM camere WHERE id = $1`, [cameraId]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
  });

  test('cancellazione pre check-in porta la prenotazione a interrotta', async () => {
    await processaBooking({
      id: 555222, roomId: 999889, arrival: '2026-11-15', departure: '2026-11-17',
      numAdult: 1, numChild: 0, firstName: 'Anna', lastName: 'Verdi', email: 'anna.beds24test@example.com', status: 'confirmed',
    });
    const risultato = await processaBooking({
      id: 555222, roomId: 999889, arrival: '2026-11-15', departure: '2026-11-17',
      numAdult: 1, numChild: 0, firstName: 'Anna', lastName: 'Verdi', email: 'anna.beds24test@example.com', status: 'cancelled',
    });

    expect(risultato.esito).toBe('cancellata');
    const prenotazione = await pool.query(
      `SELECT stato FROM prenotazioni WHERE canale_origine = 'beds24' AND external_booking_id = '555222'`
    );
    expect(prenotazione.rows[0].stato).toBe('interrotta');
  });

  test('cancellazione con check-in già effettuato NON tocca lo stato', async () => {
    await processaBooking({
      id: 555333, roomId: 999889, arrival: '2026-11-18', departure: '2026-11-20',
      numAdult: 1, numChild: 0, firstName: 'Luca', lastName: 'Bianchi', email: 'luca.beds24test@example.com', status: 'confirmed',
    });
    const soggiorno = await pool.query(
      `SELECT s.id FROM soggiorni s JOIN prenotazioni p ON p.id = s.prenotazione_id
       WHERE p.external_booking_id = '555333'`
    );
    await pool.query(`UPDATE soggiorni SET check_in_effettuato_at = NOW() WHERE id = $1`, [soggiorno.rows[0].id]);

    const risultato = await processaBooking({
      id: 555333, roomId: 999889, arrival: '2026-11-18', departure: '2026-11-20',
      numAdult: 1, numChild: 0, firstName: 'Luca', lastName: 'Bianchi', email: 'luca.beds24test@example.com', status: 'cancelled',
    });

    expect(risultato.esito).toBe('cancellazione_ignorata_post_checkin');
    const prenotazione = await pool.query(
      `SELECT stato FROM prenotazioni WHERE canale_origine = 'beds24' AND external_booking_id = '555333'`
    );
    expect(prenotazione.rows[0].stato).not.toBe('interrotta');
  });

  test('prenotazione mai vista prima e già cancellata su Beds24 viene ignorata, nessuna camera occupata', async () => {
    const risultato = await processaBooking({
      id: 555666, roomId: 999889, arrival: '2026-11-21', departure: '2026-11-23',
      numAdult: 1, numChild: 0, firstName: 'Sara', lastName: 'Neri', email: 'sara.beds24test@example.com', status: 'cancelled',
    });

    expect(risultato.esito).toBe('ignorata_cancellata_alla_prima_vista');
    const prenotazione = await pool.query(
      `SELECT * FROM prenotazioni WHERE canale_origine = 'beds24' AND external_booking_id = '555666'`
    );
    expect(prenotazione.rows).toHaveLength(0);
    const coda = await pool.query(
      `SELECT * FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id = '555666'`
    );
    expect(coda.rows).toHaveLength(0);
  });
});

describe('beds24SyncController — processaBooking, coda da revisionare', () => {
  afterEach(async () => {
    await pool.query(`DELETE FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id IN ('555444', '555555')`);
  });

  test('roomId non mappato finisce in coda con il motivo corretto, nessuna scrittura su prenotazioni', async () => {
    const risultato = await processaBooking({
      id: 555444, roomId: 12345999, arrival: '2026-11-22', departure: '2026-11-23',
      numAdult: 1, numChild: 0, firstName: 'Test', lastName: 'NonMappato', email: 'nonmappato.beds24test@example.com', status: 'confirmed',
    });

    expect(risultato.esito).toBe('in_coda');
    expect(risultato.dettaglio.motivo).toBe('camera_non_mappata');
    const coda = await pool.query(
      `SELECT * FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id = '555444'`
    );
    expect(coda.rows).toHaveLength(1);
    expect(coda.rows[0].motivo).toBe('camera_non_mappata');
    expect(coda.rows[0].risolto).toBe(false);
    const prenotazione = await pool.query(
      `SELECT * FROM prenotazioni WHERE external_booking_id = '555444'`
    );
    expect(prenotazione.rows).toHaveLength(0);
  });

  test('camera mappata ma tutte occupate finisce in coda con motivo nessuna_camera_disponibile', async () => {
    const tc = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Singola Piena Test', 1) RETURNING id`);
    const c = await pool.query(`INSERT INTO camere (numero, nome, attivo) VALUES ('T26', 'Camera Piena Test', true) RETURNING id`);
    await pool.query(`INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`, [tc.rows[0].id, c.rows[0].id]);
    await pool.query(`INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno) VALUES ($1, 'beds24', '777000')`, [tc.rows[0].id]);
    const ospite = await pool.query(`INSERT INTO ospiti (nome, cognome) VALUES ('Occupante', 'Test') RETURNING id`);
    const prenotazioneEsistente = await pool.query(
      `INSERT INTO prenotazioni (canale_origine, stato) VALUES ('test_interno', 'confermata') RETURNING id`
    );
    await pool.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
       VALUES ($1, $2, $3, '2026-11-25', '2026-11-27', 1)`,
      [prenotazioneEsistente.rows[0].id, c.rows[0].id, ospite.rows[0].id]
    );

    const risultato = await processaBooking({
      id: 555555, roomId: 777000, arrival: '2026-11-25', departure: '2026-11-27',
      numAdult: 1, numChild: 0, firstName: 'Test', lastName: 'SenzaCamera', email: 'senzacamera.beds24test@example.com', status: 'confirmed',
    });

    expect(risultato.esito).toBe('in_coda');
    expect(risultato.dettaglio.motivo).toBe('nessuna_camera_disponibile');

    await pool.query(`DELETE FROM soggiorni WHERE prenotazione_id = $1`, [prenotazioneEsistente.rows[0].id]);
    await pool.query(`DELETE FROM prenotazioni WHERE id = $1`, [prenotazioneEsistente.rows[0].id]);
    await pool.query(`DELETE FROM ospiti WHERE id = $1`, [ospite.rows[0].id]);
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tc.rows[0].id]);
    await pool.query(`DELETE FROM tipi_camera_camere WHERE camera_id = $1`, [c.rows[0].id]);
    await pool.query(`DELETE FROM camere WHERE id = $1`, [c.rows[0].id]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tc.rows[0].id]);
  });
});
