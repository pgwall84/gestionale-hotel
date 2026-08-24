// tests/api/verificaLimitiListino.test.js
// Copre: verificaLimitiListino su un tipo camera "madre" (min/max diretti su
// tariffe) e su un tipo "derivato" (min/max su regole_derivazione_tariffe).
// Stessa convenzione di tests/api/tariffe.test.js: date 2090+, suffisso
// univoco per non collidere tra run.

const { getPool, chiudiPool } = require('../helpers/db');
const { verificaLimitiListino } = require('../../backend/utils/verificaLimitiListino');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let tipoMadreId;
let tipoDerivatoId;
let periodoId;

beforeAll(async () => {
  const db = getPool();
  const madre = await db.query(`INSERT INTO tipi_camera (nome) VALUES ($1) RETURNING id`, [`MadreVerificaLimiti${SUFFISSO}`]);
  tipoMadreId = madre.rows[0].id;
  const derivato = await db.query(`INSERT INTO tipi_camera (nome) VALUES ($1) RETURNING id`, [`DerivatoVerificaLimiti${SUFFISSO}`]);
  tipoDerivatoId = derivato.rows[0].id;

  const periodo = await db.query(
    `INSERT INTO periodi_stagionali (nome, data_inizio, data_fine) VALUES ($1, '2091-06-01', '2091-06-30') RETURNING id`,
    [`PeriodoVerificaLimiti${SUFFISSO}`]
  );
  periodoId = periodo.rows[0].id;

  await db.query(
    `INSERT INTO tariffe (tipo_camera_id, data_inizio, data_fine, prezzo_notte, periodo_id, prezzo_minimo, prezzo_massimo)
     VALUES ($1, '2091-06-01', '2091-06-30', 150, $2, 120, 200)`,
    [tipoMadreId, periodoId]
  );

  await db.query(
    `INSERT INTO regole_derivazione_tariffe (tipo_camera_id, tipo_camera_base_id, periodo_id, percentuale, prezzo_minimo, prezzo_massimo)
     VALUES ($1, $2, $3, -20, 90, 150)`,
    [tipoDerivatoId, tipoMadreId, periodoId]
  );
});

afterAll(async () => {
  const db = getPool();
  await db.query('DELETE FROM regole_derivazione_tariffe WHERE tipo_camera_id = $1', [tipoDerivatoId]);
  await db.query('DELETE FROM tariffe WHERE tipo_camera_id = $1', [tipoMadreId]);
  await db.query('DELETE FROM periodi_stagionali WHERE id = $1', [periodoId]);
  await db.query('DELETE FROM tipi_camera WHERE id = ANY($1)', [[tipoMadreId, tipoDerivatoId]]);
  await chiudiPool();
});

describe('verificaLimitiListino — tipo madre', () => {
  test('valore dentro il range → conforme true', async () => {
    const r = await verificaLimitiListino({
      tipoCameraId: tipoMadreId, trattamento: 'bb',
      dataArrivo: '2091-06-10', dataPartenza: '2091-06-12', valore: 300, // 150x2 notti
    });
    expect(r.conforme).toBe(true);
    expect(r.minimo).toBe(240); // 120x2
    expect(r.massimo).toBe(400); // 200x2
  });

  test('valore sopra il massimo → conforme false', async () => {
    const r = await verificaLimitiListino({
      tipoCameraId: tipoMadreId, trattamento: 'bb',
      dataArrivo: '2091-06-10', dataPartenza: '2091-06-12', valore: 450,
    });
    expect(r.conforme).toBe(false);
  });
});

describe('verificaLimitiListino — tipo derivato', () => {
  test('legge min/max dalla regola di derivazione, non dal tipo base', async () => {
    const r = await verificaLimitiListino({
      tipoCameraId: tipoDerivatoId, trattamento: 'bb',
      dataArrivo: '2091-06-10', dataPartenza: '2091-06-11', valore: 100,
    });
    expect(r.conforme).toBe(true);
    expect(r.minimo).toBe(90);
    expect(r.massimo).toBe(150);
  });
});

describe('verificaLimitiListino — nessun limite configurato', () => {
  test('tipo camera senza righe né in tariffe né in regole_derivazione → sempre conforme', async () => {
    const db = getPool();
    const tipo = await db.query(`INSERT INTO tipi_camera (nome) VALUES ($1) RETURNING id`, [`SenzaLimiti${SUFFISSO}`]);
    const r = await verificaLimitiListino({
      tipoCameraId: tipo.rows[0].id, trattamento: 'bb',
      dataArrivo: '2091-06-10', dataPartenza: '2091-06-11', valore: 999999,
    });
    expect(r.conforme).toBe(true);
    expect(r.minimo).toBeNull();
    expect(r.massimo).toBeNull();
    await db.query('DELETE FROM tipi_camera WHERE id = $1', [tipo.rows[0].id]);
  });
});
