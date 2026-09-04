// tests/lib/beds24InvioTariffe.test.js
// Job periodico invio tariffe/restrizioni — Modulo 2.3, Fase 2/3.

const pool = require('../../backend/config/db');
const beds24Client = require('../../backend/lib/beds24Client');
const { eseguiInvioTariffe } = require('../../backend/jobs/beds24InvioTariffe');

describe('eseguiInvioTariffe', () => {
  let tipoCameraId;

  beforeAll(async () => {
    const tc = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Test Job Tariffe', 2) RETURNING id`);
    tipoCameraId = tc.rows[0].id;
    await pool.query(`INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno) VALUES ($1, 'beds24', '777005')`, [tipoCameraId]);
    await pool.query(`INSERT INTO tariffe (tipo_camera_id, data_inizio, data_fine, prezzo_notte) VALUES ($1, '2099-07-01', '2099-07-31', 120)`, [tipoCameraId]);
    await pool.query(`INSERT INTO beds24_config (id, orizzonte_invio_tariffe_fino_a) VALUES (1, '2099-07-05') ON CONFLICT (id) DO UPDATE SET orizzonte_invio_tariffe_fino_a = EXCLUDED.orizzonte_invio_tariffe_fino_a`);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tariffe WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
    await pool.query(`UPDATE beds24_config SET orizzonte_invio_tariffe_fino_a = NULL WHERE id = 1`);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await pool.query(`DELETE FROM beds24_invio_log WHERE tipo_camera_id = $1`, [tipoCameraId]);
  });

  test('invia il calendario per ogni tipologia mappata fino all\'orizzonte configurato', async () => {
    const pushSpy = jest.spyOn(beds24Client, 'pushCalendario').mockResolvedValue({ ok: true, risposta: [{ success: true }], creditiRimanenti: 400 });

    await eseguiInvioTariffe();

    expect(pushSpy).toHaveBeenCalled();
    const chiamata = pushSpy.mock.calls.find(c => c[0][0].roomId === 777005);
    expect(chiamata).toBeDefined();
    const log = await pool.query(`SELECT * FROM beds24_invio_log WHERE tipo_camera_id = $1 AND tipo = 'tariffe'`, [tipoCameraId]);
    expect(log.rows.length).toBeGreaterThan(0);
  });

  test('non si ferma se una tipologia fallisce — continua con le altre e logga l\'errore isolato', async () => {
    jest.spyOn(beds24Client, 'pushCalendario').mockRejectedValue(new Error('errore simulato'));

    await expect(eseguiInvioTariffe()).resolves.not.toThrow();

    const log = await pool.query(`SELECT * FROM beds24_invio_log WHERE tipo_camera_id = $1 AND esito = 'errore'`, [tipoCameraId]);
    expect(log.rows.length).toBeGreaterThan(0);
  });

  test('non invia nulla se orizzonte_invio_tariffe_fino_a non è configurato', async () => {
    await pool.query(`UPDATE beds24_config SET orizzonte_invio_tariffe_fino_a = NULL WHERE id = 1`);
    const pushSpy = jest.spyOn(beds24Client, 'pushCalendario');

    await eseguiInvioTariffe();

    expect(pushSpy).not.toHaveBeenCalled();
    await pool.query(`UPDATE beds24_config SET orizzonte_invio_tariffe_fino_a = '2099-07-05' WHERE id = 1`);
  });
});

describe('eseguiInvioTariffe — scenario composito', () => {
  let tipoCameraId, cameraId;

  beforeAll(async () => {
    const tc = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Test Scenario E2E', 2) RETURNING id`);
    tipoCameraId = tc.rows[0].id;
    const c = await pool.query(`INSERT INTO camere (numero, nome, attivo) VALUES ('E2E1', 'Camera E2E', true) RETURNING id`);
    cameraId = c.rows[0].id;
    await pool.query(`INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`, [tipoCameraId, cameraId]);
    await pool.query(
      `INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno, unita_esposte, maggiorazione_percentuale)
       VALUES ($1, 'beds24', '777099', 1, 10)`,
      [tipoCameraId]
    );
    await pool.query(`INSERT INTO tariffe (tipo_camera_id, data_inizio, data_fine, prezzo_notte) VALUES ($1, '2099-08-01', '2099-08-31', 100)`, [tipoCameraId]);
    // Eccezione beds24: stop_sell il 2099-08-10
    await pool.query(
      `INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data, canale, stop_sell)
       VALUES ($1, 'bb', '2099-08-10', 'beds24', true)`,
      [tipoCameraId]
    );
    await pool.query(`INSERT INTO beds24_config (id, orizzonte_invio_tariffe_fino_a) VALUES (1, '2099-08-12') ON CONFLICT (id) DO UPDATE SET orizzonte_invio_tariffe_fino_a = EXCLUDED.orizzonte_invio_tariffe_fino_a`);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM planning_tariffe_giorni WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tariffe WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_camere WHERE camera_id = $1`, [cameraId]);
    await pool.query(`DELETE FROM camere WHERE id = $1`, [cameraId]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
    await pool.query(`UPDATE beds24_config SET orizzonte_invio_tariffe_fino_a = NULL WHERE id = 1`);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await pool.query(`DELETE FROM beds24_invio_log WHERE tipo_camera_id = $1`, [tipoCameraId]);
  });

  test('il calendario inviato riflette prezzo maggiorato, price2 derivato e blackout sul giorno con stop_sell', async () => {
    const pushSpy = jest.spyOn(beds24Client, 'pushCalendario').mockResolvedValue({ ok: true, risposta: [{ success: true }], creditiRimanenti: 400 });

    await eseguiInvioTariffe();

    const chiamata = pushSpy.mock.calls.find(c => c[0][0].roomId === 777099);
    expect(chiamata).toBeDefined();
    const calendar = chiamata[0][0].calendar;
    const giorno10 = calendar.find(c => c.from === '2099-08-10');
    expect(giorno10.override).toBe('blackout');
    // Un giorno SPECIFICO di agosto 2099 (non "il primo che non è il 10"):
    // domaniIso() calcola l'orizzonte dalla data reale di sistema, quindi
    // il range effettivo va da domani (oggi, 2026) fino all'orizzonte
    // fittizio 2099-08-12 — il primo elemento dell'array è "domani" 2026,
    // senza tariffa configurata (price1 null lì, non nei giorni di agosto
    // 2099 coperti dalla fixture `tariffe`).
    const giornoAltro = calendar.find(c => c.from === '2099-08-05'); // dentro l'orizzonte configurato (fino al 2099-08-12), diverso dal 10 (blackout)
    expect(giornoAltro).toBeDefined();
    expect(giornoAltro.price1).toBe(110); // 100 * 1.10
    expect(giornoAltro.price2).toBeGreaterThan(110); // bb + supplemento mezza pensione, maggiorato
  });
});
