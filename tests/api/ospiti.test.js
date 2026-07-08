// Test suite — Modulo 1.2: Note cucina ospiti (ospiti_giornalieri)
// Copre: GET /api/hr/ospiti (lettura, tutti i ruoli autenticati),
//        POST /api/hr/ospiti (upsert, sezione 'ristorante_prenotazioni' — admin/titolare/receptionist/portiere_notte)
// Dipendenze: tabella ospiti_giornalieri (UNIQUE su data), FK inserito_da -> users(id)
// Nota: usa una data fittizia lontana nel futuro per non toccare i dati reali odierni della cucina.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const DATA_TEST = '2099-06-15';

afterAll(async () => {
  // Rimuove il record di test creato su ospiti_giornalieri
  const db = getPool();
  await db.query('DELETE FROM ospiti_giornalieri WHERE data = $1', [DATA_TEST]);
  await chiudiPool();
});

// ─── GET /api/hr/ospiti ────────────────────────────────────────────────────────

describe('GET /api/hr/ospiti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/hr/ospiti');
    expect(res.status).toBe(401);
  });

  test('cuoco (lettura consentita a tutti i ruoli) → 200', async () => {
    const res = await request(app)
      .get('/api/hr/ospiti')
      .set(authHeader.cuoco());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ospiti');
  });

  test('data senza record esistente → 200 con valori a zero', async () => {
    const res = await request(app)
      .get(`/api/hr/ospiti?data=${DATA_TEST}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.ospiti).toMatchObject({
      data: DATA_TEST,
      coperti_colazione: 0,
      coperti_pranzo: 0,
      coperti_cena: 0,
      note_allergie: '',
    });
  });
});

// ─── POST /api/hr/ospiti ───────────────────────────────────────────────────────

describe('POST /api/hr/ospiti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/hr/ospiti').send({});
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (sezione ristorante_prenotazioni non consentita)', async () => {
    const res = await request(app)
      .post('/api/hr/ospiti')
      .set(authHeader.cameriere())
      .send({ data: DATA_TEST, coperti_colazione: 5 });
    expect(res.status).toBe(403);
  });

  test('cuoco → 403 (sezione ristorante_prenotazioni non consentita)', async () => {
    const res = await request(app)
      .post('/api/hr/ospiti')
      .set(authHeader.cuoco())
      .send({ data: DATA_TEST, coperti_colazione: 5 });
    expect(res.status).toBe(403);
  });

  test('receptionist crea il record del giorno → 200', async () => {
    const res = await request(app)
      .post('/api/hr/ospiti')
      .set(authHeader.receptionist())
      .send({
        data: DATA_TEST,
        coperti_colazione: 12,
        coperti_pranzo: 20,
        coperti_cena: 30,
        note_allergie: 'Tavolo 4: allergia noci',
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ospiti');
    expect(res.body.ospiti.coperti_cena).toBe(30);
    expect(res.body.ospiti.note_allergie).toBe('Tavolo 4: allergia noci');
  });

  test('portiere_notte aggiorna lo stesso giorno (upsert) → 200, nessun duplicato', async () => {
    const res = await request(app)
      .post('/api/hr/ospiti')
      .set(authHeader.portiere_notte())
      .send({
        data: DATA_TEST,
        coperti_colazione: 15,
        coperti_pranzo: 20,
        coperti_cena: 30,
        note_allergie: 'Tavolo 4: allergia noci e lattosio',
      });
    expect(res.status).toBe(200);
    expect(res.body.ospiti.coperti_colazione).toBe(15);
    expect(res.body.ospiti.note_allergie).toBe('Tavolo 4: allergia noci e lattosio');

    // Verifica che sia un upsert reale — un solo record per la data di test
    const db = getPool();
    const r = await db.query('SELECT COUNT(*) FROM ospiti_giornalieri WHERE data = $1', [DATA_TEST]);
    expect(parseInt(r.rows[0].count)).toBe(1);
  });

  test('GET dopo il salvataggio restituisce i dati aggiornati', async () => {
    const res = await request(app)
      .get(`/api/hr/ospiti?data=${DATA_TEST}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.ospiti.coperti_colazione).toBe(15);
  });

  test('body vuoto → 200 con valori di default a zero (nessun campo obbligatorio)', async () => {
    const dataVuota = '2099-06-16';
    const res = await request(app)
      .post('/api/hr/ospiti')
      .set(authHeader.admin())
      .send({ data: dataVuota });
    expect(res.status).toBe(200);
    expect(res.body.ospiti.coperti_colazione).toBe(0);

    // Pulizia record aggiuntivo creato in questo test
    const db = getPool();
    await db.query('DELETE FROM ospiti_giornalieri WHERE data = $1', [dataVuota]);
  });
});
