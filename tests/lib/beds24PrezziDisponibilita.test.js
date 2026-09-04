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

const pool = require('../../backend/config/db');
const { calcolaDisponibilitaBeds24Range } = require('../../backend/lib/beds24PrezziDisponibilita');

describe('calcolaDisponibilitaBeds24Range', () => {
  let tipoCameraId, camera1Id, camera2Id;

  beforeAll(async () => {
    const tc = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Doppia Test Disp Beds24', 2) RETURNING id`);
    tipoCameraId = tc.rows[0].id;
    const c1 = await pool.query(`INSERT INTO camere (numero, nome, attivo) VALUES ('D1', 'Cam Disp 1', true) RETURNING id`);
    const c2 = await pool.query(`INSERT INTO camere (numero, nome, attivo) VALUES ('D2', 'Cam Disp 2', true) RETURNING id`);
    camera1Id = c1.rows[0].id; camera2Id = c2.rows[0].id;
    await pool.query(`INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1,$2),($1,$3)`, [tipoCameraId, camera1Id, camera2Id]);
    await pool.query(
      `INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno, unita_esposte) VALUES ($1, 'beds24', '777001', 1)`,
      [tipoCameraId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_camere WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM camere WHERE id IN ($1,$2)`, [camera1Id, camera2Id]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
  });

  test('numAvail non supera unita_esposte anche se ci sono più camere fisiche libere', async () => {
    const righe = await calcolaDisponibilitaBeds24Range(tipoCameraId, '2099-03-01', '2099-03-03');
    expect(righe).toEqual([
      { giorno: '2099-03-01', numAvail: 1 },
      { giorno: '2099-03-02', numAvail: 1 },
    ]);
  });
});
