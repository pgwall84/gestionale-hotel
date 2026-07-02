// Test suite — Modulo ZTL
// Copre: lista, alert, inserimento manuale, salvaTarga, segnaNonNecessaria, elimina
// Skip: importExcel (multipart), esportaVigiPass (richiede dati in stato da_inviare)
// Dipendenze: ztl_prenotazioni (creati e puliti da questo test)

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const OGGI       = new Date().toISOString().split('T')[0];
const DOMANI     = new Date(Date.now() + 86400000).toISOString().split('T')[0];
const FRA_7GIORNI = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

// IDs creati durante i test — puliti in afterAll
const idsCreati = [];

afterAll(async () => {
  const db = getPool();
  if (idsCreati.length) {
    await db.query(`DELETE FROM ztl_prenotazioni WHERE id = ANY($1)`, [idsCreati]);
  }
  await chiudiPool();
});

// ─── GET /api/ztl ─────────────────────────────────────────────────────────────

describe('GET /api/ztl', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/ztl');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con array prenotazioni e data', async () => {
    const res = await request(app)
      .get('/api/ztl')
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('prenotazioni');
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.prenotazioni)).toBe(true);
  });

  test('filtro per stato → 200', async () => {
    const res = await request(app)
      .get('/api/ztl?stato=mancante')
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    // Tutte le prenotazioni restituite devono avere stato mancante
    res.body.prenotazioni.forEach(p => expect(p.stato).toBe('mancante'));
  });

  test('filtro per data → 200 con data corretta nel body', async () => {
    const res = await request(app)
      .get(`/api/ztl?data=${FRA_7GIORNI}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.data).toBe(FRA_7GIORNI);
  });
});

// ─── GET /api/ztl/alert ───────────────────────────────────────────────────────

describe('GET /api/ztl/alert', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/ztl/alert');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con count e array alert', async () => {
    const res = await request(app)
      .get('/api/ztl/alert')
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('alert');
    expect(res.body).toHaveProperty('count');
    expect(typeof res.body.count).toBe('number');
  });
});

// ─── POST /api/ztl/manuale ────────────────────────────────────────────────────

describe('POST /api/ztl/manuale', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/ztl/manuale').send({});
    expect(res.status).toBe(401);
  });

  test('campi obbligatori mancanti → 400', async () => {
    const res = await request(app)
      .post('/api/ztl/manuale')
      .set(authHeader.receptionist())
      .send({ camera_numero: '5' }); // mancano le date
    expect(res.status).toBe(400);
  });

  test('inserimento valido senza targa → 201 con stato mancante', async () => {
    const camera = `T${Date.now()}`.slice(-4); // numero camera unico per il test
    const res = await request(app)
      .post('/api/ztl/manuale')
      .set(authHeader.receptionist())
      .send({
        camera_numero: camera,
        ospite_nome:   'Ospite Test ZTL',
        data_arrivo:   DOMANI,
        data_partenza: FRA_7GIORNI,
      });
    expect(res.status).toBe(201);
    expect(res.body.prenotazione.stato).toBe('mancante');
    idsCreati.push(res.body.prenotazione.id);
  });

  test('inserimento con targa → 201 con stato da_inviare', async () => {
    const camera = `T${Date.now() + 1}`.slice(-4);
    const res = await request(app)
      .post('/api/ztl/manuale')
      .set(authHeader.receptionist())
      .send({
        camera_numero: camera,
        ospite_nome:   'Ospite Con Targa',
        data_arrivo:   DOMANI,
        data_partenza: FRA_7GIORNI,
        targa:         'AB123CD',
      });
    expect(res.status).toBe(201);
    expect(res.body.prenotazione.stato).toBe('da_inviare');
    expect(res.body.prenotazione.targa).toBe('AB123CD');
    idsCreati.push(res.body.prenotazione.id);
  });
});

// ─── PATCH /api/ztl/:id/targa ─────────────────────────────────────────────────

describe('PATCH /api/ztl/:id/targa', () => {
  let idPrenotazione;

  beforeAll(async () => {
    const camera = `T${Date.now() + 2}`.slice(-4);
    const res = await request(app)
      .post('/api/ztl/manuale')
      .set(authHeader.receptionist())
      .send({ camera_numero: camera, data_arrivo: DOMANI, data_partenza: FRA_7GIORNI });
    idPrenotazione = res.body.prenotazione?.id;
    if (idPrenotazione) idsCreati.push(idPrenotazione);
  });

  test('senza token → 401', async () => {
    const res = await request(app).patch(`/api/ztl/${idPrenotazione}/targa`).send({ targa: 'AA000BB' });
    expect(res.status).toBe(401);
  });

  test('targa mancante → 400', async () => {
    const res = await request(app)
      .patch(`/api/ztl/${idPrenotazione}/targa`)
      .set(authHeader.receptionist())
      .send({});
    expect(res.status).toBe(400);
  });

  test('id non esistente → 404', async () => {
    const res = await request(app)
      .patch('/api/ztl/999999/targa')
      .set(authHeader.receptionist())
      .send({ targa: 'AA000BB' });
    expect(res.status).toBe(404);
  });

  test('targa valida → 200, targa maiuscola e stato da_inviare', async () => {
    const res = await request(app)
      .patch(`/api/ztl/${idPrenotazione}/targa`)
      .set(authHeader.receptionist())
      .send({ targa: 'ab123cd' });
    expect(res.status).toBe(200);
    expect(res.body.prenotazione.targa).toBe('AB123CD');
    expect(res.body.prenotazione.stato).toBe('da_inviare');
  });
});

// ─── PATCH /api/ztl/:id/non-necessaria ───────────────────────────────────────

describe('PATCH /api/ztl/:id/non-necessaria', () => {
  let idMancante;

  beforeAll(async () => {
    const camera = `T${Date.now() + 3}`.slice(-4);
    const res = await request(app)
      .post('/api/ztl/manuale')
      .set(authHeader.receptionist())
      .send({ camera_numero: camera, data_arrivo: DOMANI, data_partenza: FRA_7GIORNI });
    idMancante = res.body.prenotazione?.id;
    if (idMancante) idsCreati.push(idMancante);
  });

  test('senza token → 401', async () => {
    const res = await request(app).patch(`/api/ztl/${idMancante}/non-necessaria`).send({});
    expect(res.status).toBe(401);
  });

  test('id non esistente → 404', async () => {
    const res = await request(app)
      .patch('/api/ztl/999999/non-necessaria')
      .set(authHeader.receptionist())
      .send({});
    expect(res.status).toBe(404);
  });

  test('da stato mancante → 200 con stato non_necessaria', async () => {
    const res = await request(app)
      .patch(`/api/ztl/${idMancante}/non-necessaria`)
      .set(authHeader.receptionist())
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.prenotazione.stato).toBe('non_necessaria');
  });

  test('da stato non mancante → 404 (transizione non permessa)', async () => {
    // Richiama di nuovo — ora è già non_necessaria, non mancante
    const res = await request(app)
      .patch(`/api/ztl/${idMancante}/non-necessaria`)
      .set(authHeader.receptionist())
      .send({});
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/ztl/:id ──────────────────────────────────────────────────────

describe('DELETE /api/ztl/:id', () => {
  let idDaEliminare;

  beforeAll(async () => {
    const camera = `T${Date.now() + 4}`.slice(-4);
    const res = await request(app)
      .post('/api/ztl/manuale')
      .set(authHeader.receptionist())
      .send({ camera_numero: camera, data_arrivo: DOMANI, data_partenza: FRA_7GIORNI });
    idDaEliminare = res.body.prenotazione?.id;
    // Non aggiungiamo a idsCreati — sarà eliminato dal test stesso
  });

  test('senza token → 401', async () => {
    const res = await request(app).delete(`/api/ztl/${idDaEliminare}`);
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (solo titolare)', async () => {
    const res = await request(app)
      .delete(`/api/ztl/${idDaEliminare}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('id non esistente → 404', async () => {
    const res = await request(app)
      .delete('/api/ztl/999999')
      .set(authHeader.titolare());
    expect(res.status).toBe(404);
  });

  test('titolare elimina → 200', async () => {
    const res = await request(app)
      .delete(`/api/ztl/${idDaEliminare}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('messaggio');
  });
});
