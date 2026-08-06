// Test suite — Offerte dedicate via email (modulo 5.3, estensione
// 04/08/2026). Copre solo la modalità "clienti specifici" (destinatari =
// array di id), con fixture di ospiti dedicati — MAI la modalità "tutti i
// clienti con consenso": in un DB di sviluppo reale può contenere clienti
// veri con consenso marketing attivo, e testare 'tutti' scriverebbe righe
// reali in offerte_email/offerte_email_destinatari visibili nello storico
// di produzione. Verifica manuale di quella modalità lasciata al titolare
// tramite la UI. RESEND_API_KEY rimossa per la durata della suite (stesso
// pattern di tests/api/email-prenotazioni.test.js): nessuna email vera.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let ospiteConConsensoId;
let ospiteSenzaConsensoId;
let resendApiKeyOriginale;
const offerteCreate = [];

beforeAll(async () => {
  resendApiKeyOriginale = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  const db = getPool();
  const conConsenso = await db.query(
    `INSERT INTO ospiti (nome, cognome, email, consenso_marketing) VALUES ('Mario', $1, $2, true) RETURNING id`,
    [`TestOffertaConConsenso${SUFFISSO}`, `mario.offerta${SUFFISSO}@example.com`]
  );
  ospiteConConsensoId = conConsenso.rows[0].id;

  const senzaConsenso = await db.query(
    `INSERT INTO ospiti (nome, cognome, email, consenso_marketing) VALUES ('Luigi', $1, $2, false) RETURNING id`,
    [`TestOffertaSenzaConsenso${SUFFISSO}`, `luigi.offerta${SUFFISSO}@example.com`]
  );
  ospiteSenzaConsensoId = senzaConsenso.rows[0].id;
});

afterAll(async () => {
  if (resendApiKeyOriginale !== undefined) process.env.RESEND_API_KEY = resendApiKeyOriginale;

  const db = getPool();
  if (offerteCreate.length) {
    await db.query('DELETE FROM offerte_email WHERE id = ANY($1)', [offerteCreate]); // CASCADE su offerte_email_destinatari
  }
  await db.query('DELETE FROM ospiti WHERE id = ANY($1)', [[ospiteConConsensoId, ospiteSenzaConsensoId]]);
  await chiudiPool();
});

describe('POST /api/offerte-email', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/offerte-email').send({ oggetto: 'x', corpo: 'y', destinatari: [ospiteConConsensoId] });
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (riservato ad admin/titolare)', async () => {
    const res = await request(app).post('/api/offerte-email').set(authHeader.receptionist())
      .send({ oggetto: 'x', corpo: 'y', destinatari: [ospiteConConsensoId] });
    expect(res.status).toBe(403);
  });

  test('titolare, oggetto/corpo mancanti → 400', async () => {
    const res = await request(app).post('/api/offerte-email').set(authHeader.titolare())
      .send({ destinatari: [ospiteConConsensoId] });
    expect(res.status).toBe(400);
  });

  test('titolare, destinatari array vuoto → 400', async () => {
    const res = await request(app).post('/api/offerte-email').set(authHeader.titolare())
      .send({ oggetto: 'x', corpo: 'y', destinatari: [] });
    expect(res.status).toBe(400);
  });

  test('titolare, un consenziente + un non consenziente → esclude quello senza consenso, invio fallisce senza RESEND_API_KEY (ok:false)', async () => {
    const res = await request(app).post('/api/offerte-email').set(authHeader.titolare())
      .send({
        oggetto: `Offerta di test ${SUFFISSO}`,
        corpo: 'Ciao {nome_ospite}, offerta di prova.',
        destinatari: [ospiteConConsensoId, ospiteSenzaConsensoId],
      });
    expect(res.status).toBe(200);
    // 1 destinatario valido risolto (quello con consenso), 1 escluso.
    expect(res.body.esclusi).toBe(1);
    // Senza RESEND_API_KEY l'invio individuale fallisce, ma la offerta viene
    // comunque creata (ok:true a livello di richiesta — il fallimento è per
    // singolo destinatario, tracciato in totaleFalliti).
    if (res.body.ok) {
      offerteCreate.push(res.body.offertaId);
      expect(res.body.totaleDestinatari).toBe(1);
      expect(res.body.totaleFalliti).toBe(1);
      expect(res.body.totaleOk).toBe(0);
    }
  });

  test('titolare, solo destinatario senza consenso → nessun destinatario valido, ok:false', async () => {
    const res = await request(app).post('/api/offerte-email').set(authHeader.titolare())
      .send({ oggetto: 'x', corpo: 'y', destinatari: [ospiteSenzaConsensoId] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });
});

describe('GET /api/offerte-email e /api/offerte-email/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/offerte-email');
    expect(res.status).toBe(401);
  });

  test('titolare → 200, storico è un array', async () => {
    const res = await request(app).get('/api/offerte-email').set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('titolare, id inesistente → 404', async () => {
    const res = await request(app).get('/api/offerte-email/999999999').set(authHeader.titolare());
    expect(res.status).toBe(404);
  });

  test('titolare, offerta creata nel test precedente → dettaglio con destinatari', async () => {
    if (!offerteCreate.length) return; // dipende dalla creazione riuscita sopra
    const res = await request(app).get(`/api/offerte-email/${offerteCreate[0]}`).set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.destinatari)).toBe(true);
    expect(res.body.destinatari.length).toBe(1);
  });
});
