// Test suite — Testi email automatiche + footer (modulo 5.3, estensione
// 04/08/2026). Copre: GET/PATCH /api/email-template, GET/PATCH
// /api/email-template/footer. Le righe toccate (email_template, riga
// singola id=1 di impostazioni_email) sono seedate dalla migration 026 e
// condivise con l'uso reale del gestionale — i test salvano il valore
// originale e lo ripristinano in afterAll, non solo puliscono un fixture.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

let confermaOriginale;
let footerOriginale;

beforeAll(async () => {
  const db = getPool();
  const conferma = await db.query(`SELECT oggetto, corpo FROM email_template WHERE tipo = 'conferma'`);
  confermaOriginale = conferma.rows[0];
  const footer = await db.query('SELECT footer_indirizzo, footer_telefono, footer_email, footer_sito, logo_url FROM impostazioni_email WHERE id = 1');
  footerOriginale = footer.rows[0];
});

afterAll(async () => {
  const db = getPool();
  if (confermaOriginale) {
    await db.query(`UPDATE email_template SET oggetto = $1, corpo = $2 WHERE tipo = 'conferma'`, [confermaOriginale.oggetto, confermaOriginale.corpo]);
  }
  if (footerOriginale) {
    await db.query(
      `UPDATE impostazioni_email SET footer_indirizzo = $1, footer_telefono = $2, footer_email = $3, footer_sito = $4, logo_url = $5 WHERE id = 1`,
      [footerOriginale.footer_indirizzo, footerOriginale.footer_telefono, footerOriginale.footer_email, footerOriginale.footer_sito, footerOriginale.logo_url]
    );
  }
  await chiudiPool();
});

describe('GET /api/email-template', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/email-template');
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (riservato ad admin/titolare)', async () => {
    const res = await request(app).get('/api/email-template').set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('titolare → 200, contiene i 4 tipi (incluso pre_checkin, migration 027)', async () => {
    const res = await request(app).get('/api/email-template').set(authHeader.titolare());
    expect(res.status).toBe(200);
    const tipi = res.body.map(t => t.tipo).sort();
    expect(tipi).toEqual(['conferma', 'pre_checkin', 'promemoria', 'recensione']);
  });
});

describe('PATCH /api/email-template/:tipo', () => {
  test('titolare, campi mancanti → 400', async () => {
    const res = await request(app).patch('/api/email-template/conferma').set(authHeader.titolare()).send({ oggetto: 'Solo oggetto' });
    expect(res.status).toBe(400);
  });

  test('titolare, tipo non valido → 400', async () => {
    const res = await request(app).patch('/api/email-template/inesistente').set(authHeader.titolare())
      .send({ oggetto: 'x', corpo: 'y' });
    expect(res.status).toBe(400);
  });

  test('titolare, tipo valido → 200, testo aggiornato e rileggibile', async () => {
    const nuovoOggetto = `Oggetto di test ${Date.now()}`;
    const res = await request(app).patch('/api/email-template/conferma').set(authHeader.titolare())
      .send({ oggetto: nuovoOggetto, corpo: 'Corpo di test {nome_ospite}' });
    expect(res.status).toBe(200);
    expect(res.body.oggetto).toBe(nuovoOggetto);

    const rilettura = await request(app).get('/api/email-template').set(authHeader.titolare());
    const conferma = rilettura.body.find(t => t.tipo === 'conferma');
    expect(conferma.oggetto).toBe(nuovoOggetto);
  });

  test('receptionist → 403', async () => {
    const res = await request(app).patch('/api/email-template/conferma').set(authHeader.receptionist())
      .send({ oggetto: 'x', corpo: 'y' });
    expect(res.status).toBe(403);
  });
});

describe('GET/PATCH /api/email-template/footer', () => {
  test('GET titolare → 200', async () => {
    const res = await request(app).get('/api/email-template/footer').set(authHeader.titolare());
    expect(res.status).toBe(200);
  });

  test('PATCH titolare → 200, dati salvati', async () => {
    const res = await request(app).patch('/api/email-template/footer').set(authHeader.titolare())
      .send({ footer_indirizzo: 'Via di Test 1', footer_telefono: '0187000000', footer_email: 'test@example.com', footer_sito: 'https://example.com', logo_url: null });
    expect(res.status).toBe(200);
    expect(res.body.footer_indirizzo).toBe('Via di Test 1');
  });

  test('PATCH receptionist → 403', async () => {
    const res = await request(app).patch('/api/email-template/footer').set(authHeader.receptionist()).send({ footer_indirizzo: 'x' });
    expect(res.status).toBe(403);
  });
});
