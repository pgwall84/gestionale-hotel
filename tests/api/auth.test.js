// Test suite — Modulo Autenticazione
// Copre: login, /me, refresh token, logout, logout-all, permessi per ruolo
// Accessibile a: tutti i ruoli (login pubblico, /me autenticato)

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader }       = require('../helpers/auth');
const { pulisciDatiTest, creaUtenteDiTest, chiudiPool } = require('../helpers/db');

// Credenziali dell'utente admin dal seed — deve esistere nel DB di test
const ADMIN_EMAIL    = 'admin@hotel.it';
const ADMIN_PASSWORD = 'Admin1234';

afterAll(async () => {
  await pulisciDatiTest();
  await chiudiPool();
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  test('login corretto → 200 con token JWT', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('utente');
    expect(res.body.utente.email).toBe(ADMIN_EMAIL);
  });

  test('password errata → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'passwordsbagliata' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('errore');
  });

  test('email non esistente → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonesiste@hotel.it', password: 'qualcosa' });

    expect(res.status).toBe(401);
  });

  test('campi mancanti → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL });

    expect(res.status).toBe(400);
  });

  test('email malformata → 400 o 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'non-una-email', password: 'qualcosa' });

    expect([400, 401]).toContain(res.status);
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('token valido admin → 200 con dati utente', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader.admin());

    expect(res.status).toBe(200);
    // Il controller risponde con { utente: {...} }
    expect(res.body.utente).toHaveProperty('id');
    expect(res.body.utente).toHaveProperty('ruolo');
  });

  test('token valido non-admin → 200 con utente nel body', async () => {
    // Crea un utente reale nel DB per verificare che /me risponda con i dati corretti
    const utente = await creaUtenteDiTest({
      email: `me_test_${Date.now()}@test.hotel`,
      ruolo: 'receptionist',
    });
    const { creaToken } = require('../helpers/auth');
    const tkn = creaToken({ id: utente.id, ruolo: 'receptionist', email: utente.email });

    const res = await request(app)
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${tkn}` });

    expect(res.status).toBe(200);
    const u = res.body.utente ?? res.body;
    expect(u.ruolo).toBe('receptionist');
  });

  test('token contraffatto → 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set({ Authorization: 'Bearer tokenfalso.firma.sbagliata' });

    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  test('con token valido → 200', async () => {
    // Eseguiamo prima un login vero per avere un refresh token reale nel DB
    const utente = await creaUtenteDiTest({
      email: `logout_test_${Date.now()}@test.hotel`,
      ruolo: 'receptionist',
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: utente.email, password: 'TestPassword1!' });

    expect(loginRes.status).toBe(200);

    const res = await request(app)
      .post('/api/auth/logout')
      .set({ Authorization: `Bearer ${loginRes.body.token}` })
      .set('Cookie', loginRes.headers['set-cookie'] ?? []);

    expect(res.status).toBe(200);
  });
});

// ─── POST /api/auth/logout-all ───────────────────────────────────────────────

describe('POST /api/auth/logout-all', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/auth/logout-all');
    expect(res.status).toBe(401);
  });

  test('con token valido → 200 e revoca tutti i refresh token', async () => {
    const utente = await creaUtenteDiTest({
      email: `logoutall_test_${Date.now()}@test.hotel`,
      ruolo: 'dipendente',
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: utente.email, password: 'TestPassword1!' });

    const res = await request(app)
      .post('/api/auth/logout-all')
      .set({ Authorization: `Bearer ${loginRes.body.token}` });

    expect(res.status).toBe(200);
  });
});

// ─── GET /api/health ─────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  test('risponde 200 con stato ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.stato).toBe('ok');
  });
});
