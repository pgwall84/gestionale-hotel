// Test suite — Modulo Tariffe (Modulo 2.2, Fase 2A).
// Copre: GET /api/tariffe, GET /api/tariffe/calcola, POST, PATCH, DELETE —
// permessi, validazione, vincolo anti-sovrapposizione EXCLUDE (409).
// Dipendenze: tabelle tipi_camera + tariffe (migration 018). Ogni test usa
// intervalli di date su anni diversi (2090-2094) per non sovrapporsi mai
// per errore tra un test e l'altro sulla stessa categoria di test.
// Scritto a mano (non da tests/agent/genera-test.js — API Claude non
// disponibile per credito esaurito il 31/07/2026, vedi docs/DIARIO_SESSIONI.md).

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');
const { calcolaTariffa, calcolaTariffaPerTrattamenti } = require('../../backend/controllers/tariffeController');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let tipoCameraId;
const tariffeCreate = [];

async function creaTariffa(headerRuolo, overrides = {}) {
  const res = await request(app)
    .post('/api/tariffe')
    .set(headerRuolo)
    .send({
      tipo_camera_id: tipoCameraId,
      nome_stagione: `Stagione Test${SUFFISSO}`,
      prezzo_notte: 100,
      ...overrides,
    });
  if (res.status === 201) tariffeCreate.push(res.body.id);
  return res;
}

beforeAll(async () => {
  const db = getPool();
  const tipo = await db.query(`INSERT INTO tipi_camera (nome) VALUES ($1) RETURNING id`, [`TipoTariffeTest${SUFFISSO}`]);
  tipoCameraId = tipo.rows[0].id;
});

afterAll(async () => {
  const db = getPool();
  if (tariffeCreate.length) await db.query('DELETE FROM tariffe WHERE id = ANY($1)', [tariffeCreate]);
  await db.query('DELETE FROM tipi_camera WHERE id = $1', [tipoCameraId]);
  await chiudiPool();
});

// ─── GET /api/tariffe ─────────────────────────────────────────────────────────

describe('GET /api/tariffe', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/tariffe');
    expect(res.status).toBe(401);
  });

  test('receptionist (lettura consentita) → 200 con array', async () => {
    const res = await request(app).get('/api/tariffe').set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('filtro per tipo_camera_id → solo fasce di quella categoria', async () => {
    const creata = await creaTariffa(authHeader.titolare(), { data_inizio: '2090-01-01', data_fine: '2090-01-31' });
    expect(creata.status).toBe(201);

    const res = await request(app).get(`/api/tariffe?tipo_camera_id=${tipoCameraId}`).set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.every(t => t.tipo_camera_id === tipoCameraId)).toBe(true);
  });
});

// ─── POST /api/tariffe — min/max cartellino ───────────────────────────────────

// Date 2095 — non usate altrove nel file (2090-2094, vedi commento in
// testa al file): 2092-01 era la scelta originale, ma collideva con
// "periodo senza tariffa configurata" (GET /api/tariffe/calcola, sotto),
// che si aspetta proprio 2092-01-01→03 scoperto. Trovato con `npx jest`
// reale dal tab Code (23/08/2026) — non rilevabile da questo ambiente
// Cowork, che non può eseguire la suite. Spostato su un anno tutto suo
// invece di limarne solo i giorni, per non ripetere lo stesso rischio con
// un'altra suite futura.
describe('POST /api/tariffe — min/max cartellino', () => {
  test('prezzo dentro il range dichiarato → 201', async () => {
    const res = await creaTariffa(authHeader.titolare(), {
      data_inizio: '2095-01-01', data_fine: '2095-01-31',
      prezzo_notte: 150, prezzo_minimo: 100, prezzo_massimo: 200,
    });
    expect(res.status).toBe(201);
  });

  test('prezzo sopra il massimo, senza conferma → 409 con dettaglio range', async () => {
    const res = await creaTariffa(authHeader.titolare(), {
      data_inizio: '2095-02-01', data_fine: '2095-02-28',
      prezzo_notte: 250, prezzo_minimo: 100, prezzo_massimo: 200,
    });
    expect(res.status).toBe(409);
    expect(res.body.minimo).toBe(100);
    expect(res.body.massimo).toBe(200);
  });

  test('prezzo sopra il massimo, con confermato:true → 201, salvato comunque', async () => {
    const res = await creaTariffa(authHeader.titolare(), {
      data_inizio: '2095-03-01', data_fine: '2095-03-31',
      prezzo_notte: 250, prezzo_minimo: 100, prezzo_massimo: 200, confermato: true,
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.prezzo_notte)).toBe(250);
  });
});

// ─── GET /api/tariffe/calcola ─────────────────────────────────────────────────

describe('GET /api/tariffe/calcola', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/tariffe/calcola');
    expect(res.status).toBe(401);
  });

  test('parametri mancanti → 400', async () => {
    const res = await request(app).get('/api/tariffe/calcola').set(authHeader.receptionist());
    expect(res.status).toBe(400);
  });

  test('data_partenza non successiva a data_arrivo → 400', async () => {
    const res = await request(app)
      .get(`/api/tariffe/calcola?tipo_camera_id=${tipoCameraId}&data_arrivo=2092-06-10&data_partenza=2092-06-10`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(400);
  });

  test('periodo senza tariffa configurata → prezzo_totale null + notti_scoperte valorizzato', async () => {
    const res = await request(app)
      .get(`/api/tariffe/calcola?tipo_camera_id=${tipoCameraId}&data_arrivo=2092-01-01&data_partenza=2092-01-03`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.prezzo_totale).toBeNull();
    expect(res.body.notti_scoperte.length).toBe(2);
  });

  test('periodo coperto dal listino (100€/notte, 3 notti) → prezzo_totale 300', async () => {
    const creata = await creaTariffa(authHeader.titolare(), { data_inizio: '2091-06-01', data_fine: '2091-06-30' });
    expect(creata.status).toBe(201);

    const res = await request(app)
      .get(`/api/tariffe/calcola?tipo_camera_id=${tipoCameraId}&data_arrivo=2091-06-10&data_partenza=2091-06-13`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.num_notti).toBe(3);
    expect(res.body.prezzo_totale).toBe(300);
    expect(res.body.notti_scoperte).toEqual([]);
  });

  // Regressione post-refactor (19/08/2026): calcola() ora chiama la
  // funzione pura calcolaTariffa (estratta per essere riusata dal booking
  // engine, tests/api/bookingPubblico.test.js) — stesso formato di risposta
  // di prima, invariato.
  test('continua a rispondere con lo stesso formato dopo il refactor di calcolaTariffa', async () => {
    const res = await request(app)
      .get(`/api/tariffe/calcola?tipo_camera_id=${tipoCameraId}&data_arrivo=2091-06-10&data_partenza=2091-06-13`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('num_notti');
    expect(res.body).toHaveProperty('prezzo_totale');
    expect(res.body).toHaveProperty('notti_scoperte');
  });
});

// ─── calcolaTariffaPerTrattamenti (fix code review 22/08/2026, Tier 2) ────────
// Prima, GET /api/booking-pubblico/disponibilita chiamava calcolaTariffa una
// volta per trattamento (3 volte per ogni tipo camera in lista), ricalcolando
// da zero anche il prezzo camera — identico per i 3 trattamenti, dipende solo
// da tipo/date, non dal trattamento. calcolaTariffaPerTrattamenti calcola il
// prezzo camera una sola volta e lo riusa: qui si verifica che il risultato
// per 'bb' resti IDENTICO sia chiamato da solo (calcolaTariffa) sia dentro un
// batch con altri trattamenti (calcolaTariffaPerTrattamenti) — nessuna
// interferenza tra i supplementi calcolati per gli altri trattamenti.

describe('calcolaTariffaPerTrattamenti', () => {
  test('il risultato per "bb" è identico chiamato da solo o dentro un batch con altri trattamenti', async () => {
    // Riusa la fascia 100€/notte 2091-06-01..2091-06-30 creata nel describe
    // precedente ("periodo coperto dal listino").
    const soloBb = await calcolaTariffa(tipoCameraId, '2091-06-10', '2091-06-13', { trattamento: 'bb' });
    expect(soloBb.prezzo_totale).toBe(300);

    const batch = await calcolaTariffaPerTrattamenti(
      tipoCameraId, '2091-06-10', '2091-06-13', ['bb', 'mezza_pensione', 'pensione_completa']
    );
    expect(batch.bb).toEqual(soloBb);
    expect(Object.keys(batch).sort()).toEqual(['bb', 'mezza_pensione', 'pensione_completa'].sort());
  });

  test('un periodo scoperto resta scoperto (null) per ogni trattamento richiesto', async () => {
    const batch = await calcolaTariffaPerTrattamenti(
      tipoCameraId, '2092-01-01', '2092-01-03', ['bb', 'mezza_pensione']
    );
    expect(batch.bb.prezzo_totale).toBeNull();
    expect(batch.mezza_pensione.prezzo_totale).toBeNull();
  });
});

// ─── POST /api/tariffe ────────────────────────────────────────────────────────

describe('POST /api/tariffe', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/tariffe').send({});
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (sola lettura)', async () => {
    const res = await creaTariffa(authHeader.receptionist(), { data_inizio: '2093-01-01', data_fine: '2093-01-31' });
    expect(res.status).toBe(403);
  });

  test('campi obbligatori mancanti → 400', async () => {
    const res = await request(app).post('/api/tariffe').set(authHeader.titolare()).send({ tipo_camera_id: tipoCameraId });
    expect(res.status).toBe(400);
  });

  test('prezzo_notte non positivo → 400', async () => {
    const res = await creaTariffa(authHeader.titolare(), { data_inizio: '2093-02-01', data_fine: '2093-02-28', prezzo_notte: 0 });
    expect(res.status).toBe(400);
  });

  test('titolare crea fascia → 201', async () => {
    const res = await creaTariffa(authHeader.titolare(), { data_inizio: '2094-01-01', data_fine: '2094-01-31' });
    expect(res.status).toBe(201);
    expect(Number(res.body.prezzo_notte)).toBe(100);
  });

  test('date sovrapposte alla stessa categoria → 409', async () => {
    const res = await creaTariffa(authHeader.admin(), { data_inizio: '2094-01-15', data_fine: '2094-02-15' });
    expect(res.status).toBe(409);
  });
});

// ─── PATCH /api/tariffe/:id ───────────────────────────────────────────────────

describe('PATCH /api/tariffe/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).patch('/api/tariffe/1').send({});
    expect(res.status).toBe(401);
  });

  test('receptionist → 403', async () => {
    const res = await request(app)
      .patch(`/api/tariffe/${tariffeCreate[0]}`)
      .set(authHeader.receptionist())
      .send({ prezzo_notte: 120 });
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app).patch('/api/tariffe/999999999').set(authHeader.admin()).send({ prezzo_notte: 120 });
    expect(res.status).toBe(404);
  });

  test('titolare aggiorna prezzo_notte → 200', async () => {
    const res = await request(app)
      .patch(`/api/tariffe/${tariffeCreate[0]}`)
      .set(authHeader.titolare())
      .send({ prezzo_notte: 120 });
    expect(res.status).toBe(200);
    expect(Number(res.body.prezzo_notte)).toBe(120);
  });
});

// ─── DELETE /api/tariffe/:id ──────────────────────────────────────────────────

describe('DELETE /api/tariffe/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).delete('/api/tariffe/1');
    expect(res.status).toBe(401);
  });

  test('receptionist → 403', async () => {
    const res = await request(app)
      .delete(`/api/tariffe/${tariffeCreate[tariffeCreate.length - 1]}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('titolare elimina fascia → 204', async () => {
    const tariffaId = tariffeCreate.pop();
    const res = await request(app).delete(`/api/tariffe/${tariffaId}`).set(authHeader.titolare());
    expect(res.status).toBe(204);
  });
});
