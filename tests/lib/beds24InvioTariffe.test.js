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
