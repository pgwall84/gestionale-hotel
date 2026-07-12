// Test suite — Modulo HR (Personale)
// Copre: timbrature (timbra/stato/storico/presenti), assenze (lista/crea/aggiornaStato),
//        comunicazioni (lista/crea/elimina)
// Skip: export Excel, report mensile (risposte binarie), upload documenti (multipart)
// Dipendenze: users (seed), richieste_assenza, comunicazioni, timbrature

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader, creaToken } = require('../helpers/auth');
const { creaUtenteDiTest, pulisciDatiTest, chiudiPool, getPool } = require('../helpers/db');

let utenteTest;
let tokenUtente;

beforeAll(async () => {
  utenteTest = await creaUtenteDiTest({
    email: `hr_test_${Date.now()}@test.hotel`,
    ruolo: 'receptionist',
  });
  tokenUtente = creaToken({ id: utenteTest.id, ruolo: 'receptionist', email: utenteTest.email });
});

afterAll(async () => {
  // Pulisce timbrature e assenze dell'utente di test
  const db = getPool();
  await db.query('DELETE FROM timbrature WHERE user_id = $1', [utenteTest?.id]);
  await db.query('DELETE FROM richieste_assenza WHERE user_id = $1', [utenteTest?.id]);
  await pulisciDatiTest();
  await chiudiPool();
});

// ─── POST /api/hr/timbrature ──────────────────────────────────────────────────

describe('POST /api/hr/timbrature', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/hr/timbrature');
    expect(res.status).toBe(401);
  });

  test('prima timbratura del giorno → 201 con tipo entrata', async () => {
    const res = await request(app)
      .post('/api/hr/timbrature')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({});
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('timbratura');
    expect(['entrata', 'uscita']).toContain(res.body.timbratura.tipo);
    expect(res.body).toHaveProperty('messaggio');
  });

  test('seconda timbratura → tipo opposto alla prima', async () => {
    // Recupera tipo attuale
    const stato = await request(app)
      .get('/api/hr/timbrature/stato')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    const prossimo = stato.body.prossimaTimbratua;

    const res = await request(app)
      .post('/api/hr/timbrature')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.timbratura.tipo).toBe(prossimo);
  });
});

// ─── GET /api/hr/timbrature/stato ────────────────────────────────────────────

describe('GET /api/hr/timbrature/stato', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/hr/timbrature/stato');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con dentroStruttura e prossimaTimbratua', async () => {
    const res = await request(app)
      .get('/api/hr/timbrature/stato')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('dentroStruttura');
    expect(res.body).toHaveProperty('prossimaTimbratua');
  });
});

// ─── GET /api/hr/timbrature/storico ──────────────────────────────────────────

describe('GET /api/hr/timbrature/storico', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/hr/timbrature/storico');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con array timbrature', async () => {
    const res = await request(app)
      .get('/api/hr/timbrature/storico')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('timbrature');
    expect(Array.isArray(res.body.timbrature)).toBe(true);
  });

  test('con filtro mese → 200', async () => {
    const mese = new Date().toISOString().slice(0, 7);
    const res = await request(app)
      .get(`/api/hr/timbrature/storico?mese=${mese}`)
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/hr/timbrature/presenti ─────────────────────────────────────────

describe('GET /api/hr/timbrature/presenti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/hr/timbrature/presenti');
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (solo titolare)', async () => {
    const res = await request(app)
      .get('/api/hr/timbrature/presenti')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(403);
  });

  test('titolare → 200 con array presenti', async () => {
    const res = await request(app)
      .get('/api/hr/timbrature/presenti')
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('presenti');
    expect(Array.isArray(res.body.presenti)).toBe(true);
  });
});

// ─── GET /api/hr/assenze ─────────────────────────────────────────────────────

describe('GET /api/hr/assenze', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/hr/assenze');
    expect(res.status).toBe(401);
  });

  test('dipendente → 200 (vede solo le sue)', async () => {
    const res = await request(app)
      .get('/api/hr/assenze')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('richieste');
  });

  test('titolare → 200 (vede tutte)', async () => {
    const res = await request(app)
      .get('/api/hr/assenze')
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.richieste)).toBe(true);
  });
});

// ─── POST /api/hr/assenze ────────────────────────────────────────────────────

describe('POST /api/hr/assenze', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/hr/assenze').send({});
    expect(res.status).toBe(401);
  });

  test('campi mancanti → 400', async () => {
    const res = await request(app)
      .post('/api/hr/assenze')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ tipo: 'ferie' }); // mancano le date
    expect(res.status).toBe(400);
  });

  test('tipo non valido → 400', async () => {
    const res = await request(app)
      .post('/api/hr/assenze')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ tipo: 'vacanza', data_inizio: '2026-08-01', data_fine: '2026-08-07' });
    expect(res.status).toBe(400);
  });

  test('richiesta ferie valida → 201', async () => {
    const res = await request(app)
      .post('/api/hr/assenze')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ tipo: 'ferie', data_inizio: '2026-09-01', data_fine: '2026-09-07', note: 'Test' });
    expect(res.status).toBe(201);
    expect(res.body.richiesta.tipo).toBe('ferie');
    expect(res.body.richiesta.stato).toBe('in_attesa');
  });
});

// ─── PATCH /api/hr/assenze/:id/stato ─────────────────────────────────────────

describe('PATCH /api/hr/assenze/:id/stato', () => {
  let idRichiesta;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/hr/assenze')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ tipo: 'permesso', data_inizio: '2026-10-01', data_fine: '2026-10-01' });
    idRichiesta = res.body.richiesta?.id;
  });

  test('senza token → 401', async () => {
    const res = await request(app).patch(`/api/hr/assenze/${idRichiesta}/stato`).send({ stato: 'approvata' });
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (solo titolare)', async () => {
    const res = await request(app)
      .patch(`/api/hr/assenze/${idRichiesta}/stato`)
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ stato: 'approvata' });
    expect(res.status).toBe(403);
  });

  test('stato non valido → 400', async () => {
    const res = await request(app)
      .patch(`/api/hr/assenze/${idRichiesta}/stato`)
      .set(authHeader.titolare())
      .send({ stato: 'sospesa' });
    expect(res.status).toBe(400);
  });

  test('titolare approva → 200', async () => {
    const res = await request(app)
      .patch(`/api/hr/assenze/${idRichiesta}/stato`)
      .set(authHeader.titolare())
      .send({ stato: 'approvata' });
    expect(res.status).toBe(200);
    expect(res.body.richiesta.stato).toBe('approvata');
  });

  test('approvazione imposta data_decisione (per il riquadro "Ultime decisioni")', async () => {
    const res = await request(app)
      .patch(`/api/hr/assenze/${idRichiesta}/stato`)
      .set(authHeader.titolare())
      .send({ stato: 'rifiutata' });
    expect(res.status).toBe(200);
    expect(res.body.richiesta.data_decisione).toBeTruthy();
    const secondiFa = (Date.now() - new Date(res.body.richiesta.data_decisione).getTime()) / 1000;
    expect(secondiFa).toBeLessThan(10);
  });
});

// ─── Geolocalizzazione timbratura (Miglioramento HR 1) ────────────────────────

describe('POST /api/hr/timbrature — geolocalizzazione', () => {
  test('con lat/lon/distanza → salvati sulla timbratura', async () => {
    const res = await request(app)
      .post('/api/hr/timbrature')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ latitudine: 44.0773612, longitudine: 9.9127261, distanza_hotel: 12 });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.timbratura.latitudine)).toBeCloseTo(44.0773612, 5);
    expect(parseFloat(res.body.timbratura.longitudine)).toBeCloseTo(9.9127261, 5);
    expect(res.body.timbratura.distanza_hotel).toBe(12);
  });

  test('senza campi di geolocalizzazione → funziona comunque (opzionali)', async () => {
    const res = await request(app)
      .post('/api/hr/timbrature')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.timbratura.latitudine).toBeNull();
  });
});

// ─── GET /api/hr/comunicazioni ────────────────────────────────────────────────

describe('GET /api/hr/comunicazioni', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/hr/comunicazioni');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con array comunicazioni', async () => {
    const res = await request(app)
      .get('/api/hr/comunicazioni')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('comunicazioni');
    expect(Array.isArray(res.body.comunicazioni)).toBe(true);
  });
});

// ─── POST /api/hr/comunicazioni ───────────────────────────────────────────────

describe('POST /api/hr/comunicazioni', () => {
  let idComunicazione;

  test('senza token → 401', async () => {
    const res = await request(app).post('/api/hr/comunicazioni').send({});
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (solo titolare)', async () => {
    const res = await request(app)
      .post('/api/hr/comunicazioni')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ titolo: 'Test', testo: 'Test' });
    expect(res.status).toBe(403);
  });

  test('campi mancanti → 400', async () => {
    const res = await request(app)
      .post('/api/hr/comunicazioni')
      .set(authHeader.titolare())
      .send({ titolo: 'Solo titolo' });
    expect(res.status).toBe(400);
  });

  test('titolare crea comunicazione → 201', async () => {
    const res = await request(app)
      .post('/api/hr/comunicazioni')
      .set(authHeader.titolare())
      .send({ titolo: 'Riunione test', testo: 'Testo della comunicazione di test.' });
    expect(res.status).toBe(201);
    expect(res.body.comunicazione.titolo).toBe('Riunione test');
    idComunicazione = res.body.comunicazione.id;
  });

  test('DELETE /api/hr/comunicazioni/:id — titolare elimina → 200', async () => {
    if (!idComunicazione) return;
    const res = await request(app)
      .delete(`/api/hr/comunicazioni/${idComunicazione}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
  });

  test('DELETE — senza token → 401', async () => {
    const res = await request(app).delete('/api/hr/comunicazioni/999');
    expect(res.status).toBe(401);
  });
});
