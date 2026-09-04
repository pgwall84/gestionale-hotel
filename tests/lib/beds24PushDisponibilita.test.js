const pool = require('../../backend/config/db');
const beds24Client = require('../../backend/lib/beds24Client');
const { pushDisponibilitaImmediata } = require('../../backend/lib/beds24PushDisponibilita');

describe('pushDisponibilitaImmediata', () => {
  let tipoCameraId, cameraId;

  beforeAll(async () => {
    const tc = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Test Push Disp', 2) RETURNING id`);
    tipoCameraId = tc.rows[0].id;
    const c = await pool.query(`INSERT INTO camere (numero, nome, attivo) VALUES ('PD1', 'Camera Test Push Disp', true) RETURNING id`);
    cameraId = c.rows[0].id;
    await pool.query(`INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`, [tipoCameraId, cameraId]);
    await pool.query(
      `INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno) VALUES ($1, 'beds24', '777004')`,
      [tipoCameraId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_camere WHERE camera_id = $1`, [cameraId]);
    await pool.query(`DELETE FROM camere WHERE id = $1`, [cameraId]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await pool.query(`DELETE FROM beds24_invio_log WHERE tipo_camera_id = $1`, [tipoCameraId]);
  });

  test('chiama pushCalendario col roomId mappato e logga successo', async () => {
    const pushSpy = jest.spyOn(beds24Client, 'pushCalendario').mockResolvedValue({ ok: true, risposta: [{ success: true }], creditiRimanenti: 400 });

    await pushDisponibilitaImmediata(tipoCameraId, '2099-05-01', '2099-05-03');

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy.mock.calls[0][0][0].roomId).toBe(777004);
    const log = await pool.query(`SELECT * FROM beds24_invio_log WHERE tipo_camera_id = $1`, [tipoCameraId]);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0].esito).toBe('successo');
  });

  test('non lancia e logga errore se pushCalendario fallisce', async () => {
    jest.spyOn(beds24Client, 'pushCalendario').mockRejectedValue(new Error('rete down'));

    await expect(pushDisponibilitaImmediata(tipoCameraId, '2099-05-01', '2099-05-03')).resolves.not.toThrow();

    const log = await pool.query(`SELECT * FROM beds24_invio_log WHERE tipo_camera_id = $1`, [tipoCameraId]);
    expect(log.rows[0].esito).toBe('errore');
  });

  test('non chiama Beds24 se il tipo camera non ha una mappatura beds24 (nessun codice_esterno)', async () => {
    const tc2 = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Test Push Disp Non Mappata', 2) RETURNING id`);
    const pushSpy = jest.spyOn(beds24Client, 'pushCalendario');

    await pushDisponibilitaImmediata(tc2.rows[0].id, '2099-05-01', '2099-05-03');

    expect(pushSpy).not.toHaveBeenCalled();
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tc2.rows[0].id]);
  });
});
