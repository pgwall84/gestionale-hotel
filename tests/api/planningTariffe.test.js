// Test suite — Planning tariffe giorno-per-giorno (Piano 3, 24/08/2026) e
// supporto canale (Modulo 2.3, Fase 2/3, 04/09/2026). File nuovo — non
// esisteva un test dedicato per planningTariffeController.js/la rotta
// /api/planning-tariffe prima di questo task; stesso pattern di fixture di
// tests/api/bookingPubblico.test.js (tipo_camera + tariffa dedicati, date
// fittizie nel 2099).

const request = require('supertest');
const app = require('../../backend/app');
const { getPool, chiudiPool } = require('../helpers/db');
const { authHeader } = require('../helpers/auth');
const { calcolaTariffaPerTrattamentiConPlanning } = require('../../backend/controllers/planningTariffeController');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let tipoCameraTestId;

beforeAll(async () => {
  const db = getPool();
  const tipo = await db.query(
    `INSERT INTO tipi_camera (nome, capienza_max) VALUES ($1, 2) RETURNING id`,
    [`TestPlanningTariffe${SUFFISSO}`]
  );
  tipoCameraTestId = tipo.rows[0].id;

  await db.query(
    `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte)
     VALUES ($1, 'Test', '2099-01-01', '2099-12-31', 100)`,
    [tipoCameraTestId]
  );
});

afterAll(async () => {
  const db = getPool();
  await db.query('DELETE FROM planning_tariffe_giorni WHERE tipo_camera_id = $1', [tipoCameraTestId]);
  await db.query('DELETE FROM tariffe WHERE tipo_camera_id = $1', [tipoCameraTestId]);
  await db.query('DELETE FROM tipi_camera WHERE id = $1', [tipoCameraTestId]);
  await chiudiPool();
});

describe('Blindatura motore diretto — canale IS NULL (Modulo 2.3)', () => {
  test('un override canale=beds24 NON influenza il prezzo calcolato per il motore diretto', async () => {
    const db = getPool();
    await db.query(
      `INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data, canale, prezzo_notte)
       VALUES ($1, 'bb', '2099-06-10', 'beds24', 999)`,
      [tipoCameraTestId]
    );

    const risultato = await calcolaTariffaPerTrattamentiConPlanning(tipoCameraTestId, '2099-06-10', '2099-06-11', ['bb']);

    expect(risultato.bb.prezzo_totale).not.toBe(999); // deve restare il prezzo diretto (100), non l'eccezione beds24
    expect(risultato.bb.prezzo_totale).toBe(100);

    await db.query(`DELETE FROM planning_tariffe_giorni WHERE tipo_camera_id = $1 AND canale = 'beds24'`, [tipoCameraTestId]);
  });
});

describe('GET /api/planning-tariffe/griglia — supporto canale (Modulo 2.3)', () => {
  test('con canale=beds24 esclude pensione_completa e segnala le eccezioni', async () => {
    const db = getPool();
    await db.query(
      `INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data, canale, prezzo_notte)
       VALUES ($1, 'bb', '2099-06-12', 'beds24', 250)`,
      [tipoCameraTestId]
    );

    const risposta = await request(app)
      .get(`/api/planning-tariffe/griglia?tipo_camera_id=${tipoCameraTestId}&data_da=2099-06-12&data_a=2099-06-12&canale=beds24`)
      .set(authHeader.titolare());

    expect(risposta.status).toBe(200);
    expect(risposta.body.righe.pensione_completa).toBeUndefined();
    expect(risposta.body.righe.bb['2099-06-12'].prezzo).toBe(250);
    expect(risposta.body.righe.bb['2099-06-12'].eccezione_canale).toBe(true);

    await db.query(`DELETE FROM planning_tariffe_giorni WHERE tipo_camera_id = $1 AND canale = 'beds24'`, [tipoCameraTestId]);
  });

  test('senza canale (comportamento invariato) include pensione_completa e non ha eccezione_canale', async () => {
    const risposta = await request(app)
      .get(`/api/planning-tariffe/griglia?tipo_camera_id=${tipoCameraTestId}&data_da=2099-06-13&data_a=2099-06-13`)
      .set(authHeader.titolare());

    expect(risposta.status).toBe(200);
    expect(risposta.body.righe.pensione_completa).toBeDefined();
    expect(risposta.body.righe.bb['2099-06-13'].eccezione_canale).toBe(false);
  });
});
