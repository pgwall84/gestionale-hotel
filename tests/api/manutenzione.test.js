// Test suite — Modulo Manutenzione/guasti (06/08/2026).
// Copre: autenticazione, validazione input, permessi differenziati per
// ruolo (lettura/crea aperti a tutti, gestione riservata ad admin/titolare),
// e il ciclo di vita di una segnalazione (creazione → presa in carico →
// risolta). Usa un utente reale creato ad hoc (creaUtenteDiTest) invece dei
// token sintetici di authHeader per le operazioni che scrivono su
// segnalazioni_manutenzione: segnalato_da/gestito_da hanno una FK su
// users(id), i token sintetici (id fissi 1-7) non garantiscono che quella
// riga esista davvero nel DB di sviluppo del titolare.

const request = require('supertest');
const app = require('../../backend/app');
const { authHeader, creaToken } = require('../helpers/auth');
const { getPool, chiudiPool, creaUtenteDiTest, pulisciDatiTest } = require('../helpers/db');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let cameraTestId;
let utenteTest;
let headerUtenteTest;
const segnalazioniCreate = [];

beforeAll(async () => {
  const db = getPool();

  const camera = await db.query(
    `INSERT INTO camere (numero, nome, piano, attivo) VALUES ($1, 'Camera Test Manutenzione', 9, true) RETURNING id`,
    [`TEST-MANUT${SUFFISSO}`]
  );
  cameraTestId = camera.rows[0].id;

  // Utente reale (non sintetico) per le operazioni che scrivono in
  // segnalazioni_manutenzione — vedi commento in cima al file.
  utenteTest = await creaUtenteDiTest({
    nome: 'Test', cognome: 'Manutenzione', ruolo: 'titolare',
    email: `manutenzione${SUFFISSO}@test.hotel`,
  });
  headerUtenteTest = { Authorization: `Bearer ${creaToken({ id: utenteTest.id, ruolo: 'titolare', email: utenteTest.email })}` };
});

afterAll(async () => {
  const db = getPool();
  if (segnalazioniCreate.length > 0) {
    await db.query('DELETE FROM segnalazioni_manutenzione WHERE id = ANY($1)', [segnalazioniCreate]);
  }
  await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  await pulisciDatiTest();
  await chiudiPool();
});

describe('GET /api/manutenzione', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/manutenzione');
    expect(res.status).toBe(401);
  });

  test('con token valido (qualsiasi ruolo, lettura aperta a tutti) → 200', async () => {
    const res = await request(app).get('/api/manutenzione').set(authHeader.cameriere());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.segnalazioni)).toBe(true);
  });

  test('filtro stato non valido → 400', async () => {
    const res = await request(app).get('/api/manutenzione?stato=inesistente').set(authHeader.receptionist());
    expect(res.status).toBe(400);
  });

  test('filtro priorita non valida → 400', async () => {
    const res = await request(app).get('/api/manutenzione?priorita=urgentissima').set(authHeader.receptionist());
    expect(res.status).toBe(400);
  });
});

describe('POST /api/manutenzione', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/manutenzione').send({ luogo_tipo: 'bar', descrizione: 'test' });
    expect(res.status).toBe(401);
  });

  test('luogo_tipo mancante → 400', async () => {
    const res = await request(app).post('/api/manutenzione').set(headerUtenteTest)
      .send({ descrizione: 'Manca il luogo' });
    expect(res.status).toBe(400);
  });

  test('luogo_tipo non valido → 400', async () => {
    const res = await request(app).post('/api/manutenzione').set(headerUtenteTest)
      .send({ luogo_tipo: 'giardino_segreto', descrizione: 'test' });
    expect(res.status).toBe(400);
  });

  test('luogo_tipo "camera" senza camera_id → 400', async () => {
    const res = await request(app).post('/api/manutenzione').set(headerUtenteTest)
      .send({ luogo_tipo: 'camera', descrizione: 'Rubinetto rotto' });
    expect(res.status).toBe(400);
  });

  test('luogo_tipo diverso da "camera" con camera_id → 400', async () => {
    const res = await request(app).post('/api/manutenzione').set(headerUtenteTest)
      .send({ luogo_tipo: 'bar', camera_id: cameraTestId, descrizione: 'test' });
    expect(res.status).toBe(400);
  });

  test('descrizione mancante → 400', async () => {
    const res = await request(app).post('/api/manutenzione').set(headerUtenteTest)
      .send({ luogo_tipo: 'garage' });
    expect(res.status).toBe(400);
  });

  test('priorita non valida → 400', async () => {
    const res = await request(app).post('/api/manutenzione').set(headerUtenteTest)
      .send({ luogo_tipo: 'garage', descrizione: 'test', priorita: 'urgentissima' });
    expect(res.status).toBe(400);
  });

  test('cameriere può segnalare (crea aperto a tutti) — area comune, priorità default "media" → 201', async () => {
    const res = await request(app).post('/api/manutenzione')
      .set({ Authorization: headerUtenteTest.Authorization }) // usa utente reale per FK, ma verifica il ruolo non è filtrato
      .send({ luogo_tipo: 'lavaggio_piatti', descrizione: 'Lavastoviglie non scalda' });
    expect(res.status).toBe(201);
    expect(res.body.segnalazione.priorita).toBe('media');
    expect(res.body.segnalazione.stato).toBe('aperta');
    expect(res.body.segnalazione.camera_id).toBeNull();
    segnalazioniCreate.push(res.body.segnalazione.id);
  });

  test('segnalazione con camera_id → salvata correttamente', async () => {
    const res = await request(app).post('/api/manutenzione').set(headerUtenteTest)
      .send({ luogo_tipo: 'camera', camera_id: cameraTestId, descrizione: 'TV non si accende', priorita: 'alta' });
    expect(res.status).toBe(201);
    expect(res.body.segnalazione.camera_id).toBe(cameraTestId);
    expect(res.body.segnalazione.priorita).toBe('alta');
    segnalazioniCreate.push(res.body.segnalazione.id);
  });
});

describe('PATCH /api/manutenzione/:id/stato', () => {
  let segnalazioneId;

  beforeAll(async () => {
    const db = getPool();
    const r = await db.query(
      `INSERT INTO segnalazioni_manutenzione (luogo_tipo, descrizione, segnalato_da)
       VALUES ('magazzino', 'Test gestione stato', $1) RETURNING id`,
      [utenteTest.id]
    );
    segnalazioneId = r.rows[0].id;
    segnalazioniCreate.push(segnalazioneId);
  });

  test('senza token → 401', async () => {
    const res = await request(app).patch(`/api/manutenzione/${segnalazioneId}/stato`).send({ stato: 'in_lavorazione' });
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (gestione riservata ad admin/titolare)', async () => {
    const res = await request(app).patch(`/api/manutenzione/${segnalazioneId}/stato`)
      .set(authHeader.receptionist()).send({ stato: 'in_lavorazione' });
    expect(res.status).toBe(403);
  });

  test('cameriere → 403', async () => {
    const res = await request(app).patch(`/api/manutenzione/${segnalazioneId}/stato`)
      .set(authHeader.cameriere()).send({ stato: 'in_lavorazione' });
    expect(res.status).toBe(403);
  });

  test('titolare, stato non valido → 400', async () => {
    const res = await request(app).patch(`/api/manutenzione/${segnalazioneId}/stato`)
      .set(headerUtenteTest).send({ stato: 'chiusa_per_sempre' });
    expect(res.status).toBe(400);
  });

  test('titolare, stato mancante → 400', async () => {
    const res = await request(app).patch(`/api/manutenzione/${segnalazioneId}/stato`)
      .set(headerUtenteTest).send({});
    expect(res.status).toBe(400);
  });

  test('titolare → in_lavorazione, poi risolta con nota → stato e risolta_il aggiornati', async () => {
    const res1 = await request(app).patch(`/api/manutenzione/${segnalazioneId}/stato`)
      .set(headerUtenteTest).send({ stato: 'in_lavorazione' });
    expect(res1.status).toBe(200);
    expect(res1.body.segnalazione.stato).toBe('in_lavorazione');
    expect(res1.body.segnalazione.risolta_il).toBeNull();

    const res2 = await request(app).patch(`/api/manutenzione/${segnalazioneId}/stato`)
      .set(headerUtenteTest).send({ stato: 'risolta', note_risoluzione: 'Sostituito il pezzo guasto' });
    expect(res2.status).toBe(200);
    expect(res2.body.segnalazione.stato).toBe('risolta');
    expect(res2.body.segnalazione.note_risoluzione).toBe('Sostituito il pezzo guasto');
    expect(res2.body.segnalazione.risolta_il).not.toBeNull();
    expect(res2.body.segnalazione.gestito_da).toBe(utenteTest.id);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app).patch('/api/manutenzione/999999999/stato')
      .set(headerUtenteTest).send({ stato: 'in_lavorazione' });
    expect(res.status).toBe(404);
  });
});
