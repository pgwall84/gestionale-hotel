const pool = require('../../backend/config/db');
const { scriviInvioLog } = require('../../backend/lib/beds24InvioLog');

describe('scriviInvioLog', () => {
  let tipoCameraId;

  beforeAll(async () => {
    const tc = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Test InvioLog Beds24', 2) RETURNING id`);
    tipoCameraId = tc.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM beds24_invio_log WHERE tipo_camera_id = $1`, [tipoCameraId]);
  });

  test('scrive una riga con tipo, esito e dettaglio strutturato', async () => {
    await scriviInvioLog({
      tipo: 'tariffe',
      tipoCameraId,
      esito: 'errore',
      dettaglio: { errors: [{ action: 'update', field: 'price1', message: 'Invalid value' }] },
    });
    const righe = await pool.query(`SELECT * FROM beds24_invio_log WHERE tipo_camera_id = $1`, [tipoCameraId]);
    expect(righe.rows).toHaveLength(1);
    expect(righe.rows[0].esito).toBe('errore');
    expect(righe.rows[0].dettaglio.errors[0].field).toBe('price1');
  });

  test('non lancia se la scrittura sul DB fallisce (es. tipo non valido)', async () => {
    await expect(scriviInvioLog({ tipo: 'non_valido', tipoCameraId, esito: 'errore', dettaglio: {} }))
      .resolves.not.toThrow();
  });
});
