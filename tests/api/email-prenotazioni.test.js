// Test suite — Email automatiche prenotazioni (modulo 5.3, parte email).
// Copre solo l'aspetto "non deve mai bloccare/rompere" della transizione di
// stato verso 'confermata' — non testa l'invio reale (nessuna chiamata a
// Resend nei test: RESEND_API_KEY viene rimossa esplicitamente per la durata
// di questa suite, indipendentemente dal contenuto di backend/.env, per non
// inviare email vere durante i test automatici e restare deterministici).
// Stesso pattern di fixture di tests/api/prenotazioni.test.js (camera/ospite
// dedicati, date nel 2099).

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let cameraTestId;
let ospiteSenzaEmailId;
let ospiteConEmailId;
let resendApiKeyOriginale;
const prenotazioniCreate = [];

async function creaPrenotazione(ospiteId, overrides = {}) {
  const { soggiorno: soggiornoOverride, ...restOverrides } = overrides;
  const res = await request(app)
    .post('/api/prenotazioni')
    .set(authHeader.receptionist())
    .send({
      canale_origine: 'diretta',
      soggiorno: {
        camera_id: cameraTestId,
        ospite_id: ospiteId,
        data_arrivo: '2099-02-10',
        data_partenza: '2099-02-15',
        num_ospiti: 1,
        ...soggiornoOverride,
      },
      ...restOverrides,
    });
  if (res.status === 201) prenotazioniCreate.push(res.body.id);
  return res;
}

// Piccola attesa per lasciare completare l'invio email fire-and-forget
// (mai atteso esplicitamente dal controller, per non rallentare la risposta
// HTTP) prima di controllare lo stato nel DB.
function attendiCodaEmail() {
  return new Promise(resolve => setTimeout(resolve, 300));
}

beforeAll(async () => {
  resendApiKeyOriginale = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  const db = getPool();
  const camera = await db.query(
    `INSERT INTO camere (numero, nome, piano) VALUES ($1, 'Camera Test Email Prenotazioni', 9) RETURNING id`,
    [`TEST-EMAIL${SUFFISSO}`]
  );
  cameraTestId = camera.rows[0].id;

  const ospiteSenzaEmail = await db.query(
    `INSERT INTO ospiti (nome, cognome) VALUES ('Mario', $1) RETURNING id`,
    [`TestEmailSenzaEmail${SUFFISSO}`]
  );
  ospiteSenzaEmailId = ospiteSenzaEmail.rows[0].id;

  const ospiteConEmail = await db.query(
    `INSERT INTO ospiti (nome, cognome, email) VALUES ('Luigi', $1, $2) RETURNING id`,
    [`TestEmailConEmail${SUFFISSO}`, `luigi.test${SUFFISSO}@example.com`]
  );
  ospiteConEmailId = ospiteConEmail.rows[0].id;
});

afterAll(async () => {
  if (resendApiKeyOriginale !== undefined) process.env.RESEND_API_KEY = resendApiKeyOriginale;

  const db = getPool();
  await db.query('DELETE FROM soggiorno_ospiti WHERE ospite_id = ANY($1)', [[ospiteSenzaEmailId, ospiteConEmailId]]);
  await db.query('DELETE FROM soggiorni WHERE camera_id = $1', [cameraTestId]);
  if (prenotazioniCreate.length) {
    await db.query('DELETE FROM prenotazioni WHERE id = ANY($1)', [prenotazioniCreate]);
  }
  await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  await db.query('DELETE FROM ospiti WHERE id = ANY($1)', [[ospiteSenzaEmailId, ospiteConEmailId]]);
  await chiudiPool();
});

describe('PATCH /api/prenotazioni/:id/stato → confermata (email di conferma)', () => {
  test('ospite senza email: la transizione riesce comunque (200), invio email saltato in silenzio', async () => {
    const creata = await creaPrenotazione(ospiteSenzaEmailId);
    expect(creata.status).toBe(201);

    const res = await request(app)
      .patch(`/api/prenotazioni/${creata.body.id}/stato`)
      .set(authHeader.receptionist())
      .send({ stato: 'confermata' });

    expect(res.status).toBe(200);
    expect(res.body.stato).toBe('confermata');

    await attendiCodaEmail();
    const db = getPool();
    const verifica = await db.query('SELECT email_conferma_inviata_at FROM prenotazioni WHERE id = $1', [creata.body.id]);
    expect(verifica.rows[0].email_conferma_inviata_at).toBeNull();
  });

  test('ospite con email ma RESEND_API_KEY non configurata: transizione riesce (200), nessun invio registrato', async () => {
    const creata = await creaPrenotazione(ospiteConEmailId);
    expect(creata.status).toBe(201);

    const res = await request(app)
      .patch(`/api/prenotazioni/${creata.body.id}/stato`)
      .set(authHeader.receptionist())
      .send({ stato: 'confermata' });

    expect(res.status).toBe(200);

    await attendiCodaEmail();
    const db = getPool();
    const verifica = await db.query('SELECT email_conferma_inviata_at FROM prenotazioni WHERE id = $1', [creata.body.id]);
    expect(verifica.rows[0].email_conferma_inviata_at).toBeNull();
  });

  test('transizione non ammessa (es. da confermata a confermata) → 400, nessuna email tentata', async () => {
    const creata = await creaPrenotazione(ospiteConEmailId);
    await request(app)
      .patch(`/api/prenotazioni/${creata.body.id}/stato`)
      .set(authHeader.receptionist())
      .send({ stato: 'confermata' });

    const res = await request(app)
      .patch(`/api/prenotazioni/${creata.body.id}/stato`)
      .set(authHeader.receptionist())
      .send({ stato: 'confermata' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/prenotazioni/:id/test-email (pulsante di test admin/titolare)', () => {
  test('receptionist → 403 (riservato ad admin/titolare)', async () => {
    const creata = await creaPrenotazione(ospiteConEmailId);
    const res = await request(app)
      .post(`/api/prenotazioni/${creata.body.id}/test-email`)
      .set(authHeader.receptionist())
      .send({ tipo: 'conferma' });
    expect(res.status).toBe(403);
  });

  test('titolare, tipo non valido → 400', async () => {
    const creata = await creaPrenotazione(ospiteConEmailId);
    const res = await request(app)
      .post(`/api/prenotazioni/${creata.body.id}/test-email`)
      .set(authHeader.titolare())
      .send({ tipo: 'inesistente' });
    expect(res.status).toBe(400);
  });

  test('titolare, tipo valido, senza RESEND_API_KEY → 200 con { ok: false }, non lancia', async () => {
    const creata = await creaPrenotazione(ospiteConEmailId);
    const res = await request(app)
      .post(`/api/prenotazioni/${creata.body.id}/test-email`)
      .set(authHeader.titolare())
      .send({ tipo: 'conferma' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  test('titolare, prenotazione inesistente → 404', async () => {
    const res = await request(app)
      .post('/api/prenotazioni/999999999/test-email')
      .set(authHeader.titolare())
      .send({ tipo: 'conferma' });
    expect(res.status).toBe(404);
  });
});

describe('backend/lib/resendClient.js — inviaEmail', () => {
  test('senza RESEND_API_KEY → { ok: false }, non lancia', async () => {
    const { inviaEmail } = require('../../backend/lib/resendClient');
    const esito = await inviaEmail({ destinatario: 'test@example.com', oggetto: 'Test', html: '<p>Test</p>' });
    expect(esito.ok).toBe(false);
    expect(esito.errore).toBeTruthy();
  });

  test('senza destinatario → { ok: false }, non lancia', async () => {
    process.env.RESEND_API_KEY = 'chiave_fittizia_per_test';
    const { inviaEmail } = require('../../backend/lib/resendClient');
    const esito = await inviaEmail({ destinatario: null, oggetto: 'Test', html: '<p>Test</p>' });
    expect(esito.ok).toBe(false);
    delete process.env.RESEND_API_KEY;
  });
});
