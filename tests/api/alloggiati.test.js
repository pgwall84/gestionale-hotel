// Test suite — Modulo 2.5 Fase 1b: tabelle di codifica Alloggiati Web.
// Copre: GET /api/alloggiati/codici, GET /api/alloggiati/stato,
//        POST /api/alloggiati/sincronizza.
// Nota: sincronizzaTabelle chiama il servizio SOAP esterno WS_ALLOGGIATI —
// nei test NON si eseguono chiamate di rete reali (nessuna credenziale
// ALLOGGIATI_* impostata nell'ambiente di test). Si verifica solo il ramo
// "credenziali mancanti → 400", che è deterministico e non tocca la rete.
// codici/stato sono invece testati contro righe seminate direttamente in
// alloggiati_codici, senza passare da una sincronizzazione reale.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const TABELLA_TEST = `Test_Tabella_${Date.now()}`;
const CODICE_TEST = 'Z999';
const DESCRIZIONE_TEST = 'STATO DI PROVA PER TEST AUTOMATICI';

beforeAll(async () => {
  const db = getPool();
  await db.query(
    `INSERT INTO alloggiati_codici (tabella, codice, descrizione, dati_extra)
     VALUES ($1, $2, $3, $4)`,
    [TABELLA_TEST, CODICE_TEST, DESCRIZIONE_TEST, JSON.stringify({ codice: CODICE_TEST, descrizione: DESCRIZIONE_TEST })]
  );
});

afterAll(async () => {
  const db = getPool();
  await db.query('DELETE FROM alloggiati_codici WHERE tabella = $1', [TABELLA_TEST]);
  await chiudiPool();
});

// ─── GET /api/alloggiati/codici ─────────────────────────────────────────────

describe('GET /api/alloggiati/codici', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get(`/api/alloggiati/codici?tabella=${TABELLA_TEST}`);
    expect(res.status).toBe(401);
  });

  test('dipendente → 403 (sezione alloggiati non consentita)', async () => {
    const res = await request(app)
      .get(`/api/alloggiati/codici?tabella=${TABELLA_TEST}`)
      .set(authHeader.dipendente());
    expect(res.status).toBe(403);
  });

  test('portiere_notte (lettura consentita) → 200', async () => {
    const res = await request(app)
      .get(`/api/alloggiati/codici?tabella=${TABELLA_TEST}&search=prova`)
      .set(authHeader.portiere_notte());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('senza parametro tabella → 400', async () => {
    const res = await request(app)
      .get('/api/alloggiati/codici')
      .set(authHeader.receptionist());
    expect(res.status).toBe(400);
  });

  test('?search= trova per descrizione (case-insensitive)', async () => {
    const res = await request(app)
      .get(`/api/alloggiati/codici?tabella=${TABELLA_TEST}&search=stato di prova`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].codice).toBe(CODICE_TEST);
    expect(res.body[0].descrizione).toBe(DESCRIZIONE_TEST);
  });

  test('?codice= fa un lookup esatto', async () => {
    const res = await request(app)
      .get(`/api/alloggiati/codici?tabella=${TABELLA_TEST}&codice=${CODICE_TEST}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].descrizione).toBe(DESCRIZIONE_TEST);
  });

  test('?codice= inesistente → array vuoto (non 404)', async () => {
    const res = await request(app)
      .get(`/api/alloggiati/codici?tabella=${TABELLA_TEST}&codice=NON_ESISTE`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  test('tabella diversa non trova il codice seminato (isolamento per tabella)', async () => {
    const res = await request(app)
      .get(`/api/alloggiati/codici?tabella=Luoghi&codice=${CODICE_TEST}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });
});

// ─── GET /api/alloggiati/stato ───────────────────────────────────────────────

describe('GET /api/alloggiati/stato', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/alloggiati/stato');
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (stato è azione sincronizza, più ristretta della lettura)', async () => {
    const res = await request(app).get('/api/alloggiati/stato').set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('titolare → 200, la tabella di test compare con conteggio corretto', async () => {
    const res = await request(app).get('/api/alloggiati/stato').set(authHeader.titolare());
    expect(res.status).toBe(200);
    const riga = res.body.find(r => r.tabella === TABELLA_TEST);
    expect(riga).toBeDefined();
    expect(Number(riga.numero_codici)).toBe(1);
  });
});

// ─── POST /api/alloggiati/sincronizza ───────────────────────────────────────

describe('POST /api/alloggiati/sincronizza', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/alloggiati/sincronizza');
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (sincronizza è riservata ad admin/titolare)', async () => {
    const res = await request(app).post('/api/alloggiati/sincronizza').set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('admin senza credenziali configurate → 400, nessuna chiamata di rete effettuata', async () => {
    // Ambiente di test: ALLOGGIATI_UTENTE/PASSWORD/WSKEY non impostate.
    // Verifica il fail-fast prima di qualunque tentativo di connessione a
    // WS_ALLOGGIATI — se questo test fallisce con un errore diverso da 400,
    // vuol dire che le variabili sono state impostate nell'ambiente di test
    // per errore (rischio di chiamata di rete reale durante `npm test`).
    expect(process.env.ALLOGGIATI_UTENTE).toBeFalsy();
    const res = await request(app).post('/api/alloggiati/sincronizza').set(authHeader.admin());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/credenziali/i);
  });
});
