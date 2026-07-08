// Test suite — Modulo 0.2: Audit log (sicurezza)
// Copre: GET /api/audit (lista, solo admin/titolare — mount diretto in app.js, non sotto /api/hr)
//        logAudit() — funzione interna chiamata da altri controller (login, logout, download documenti...)
// Dipendenze: tabella audit_log, FK user_id -> users(id) (nullable)
// Nota: il login/logout è già coperto in auth.test.js — qui si testano solo l'endpoint di lettura
//       e la funzione di scrittura logAudit() in isolamento, con un'azione univoca per non
//       interferire con righe reali già presenti in tabella.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');
const { logAudit } = require('../../backend/controllers/auditController');

const AZIONE_TEST = `test_azione_${Date.now()}`;
const USER_ID_TEST = 2; // titolare — deve esistere nel DB (vedi tests/helpers/auth.js)

afterAll(async () => {
  const db = getPool();
  await db.query('DELETE FROM audit_log WHERE azione = $1', [AZIONE_TEST]);
  await chiudiPool();
});

// ─── GET /api/audit ─────────────────────────────────────────────────────────────

describe('GET /api/audit', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (solo admin/titolare)', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('cameriere → 403 (solo admin/titolare)', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('admin → 200 con array log', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set(authHeader.admin());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('log');
    expect(Array.isArray(res.body.log)).toBe(true);
  });

  test('titolare → 200 con array log', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.log)).toBe(true);
  });

  test('rispetta il parametro limit', async () => {
    const res = await request(app)
      .get('/api/audit?limit=1')
      .set(authHeader.admin());
    expect(res.status).toBe(200);
    expect(res.body.log.length).toBeLessThanOrEqual(1);
  });
});

// ─── logAudit() — scrittura diretta + filtro per azione/user_id ────────────────

describe('logAudit() scrive in audit_log ed è filtrabile da GET /api/audit', () => {
  test('logAudit scrive una riga recuperabile con filtro azione', async () => {
    const reqFinto = { headers: { 'x-forwarded-for': '10.0.0.5' }, socket: { remoteAddress: '10.0.0.5' } };

    await logAudit(USER_ID_TEST, AZIONE_TEST, 'users', USER_ID_TEST, reqFinto, { motivo: 'test automatico' });

    const res = await request(app)
      .get(`/api/audit?azione=${AZIONE_TEST}`)
      .set(authHeader.admin());

    expect(res.status).toBe(200);
    expect(res.body.log.length).toBeGreaterThanOrEqual(1);
    expect(res.body.log[0].azione).toBe(AZIONE_TEST);
    expect(res.body.log[0].ip_address).toBe('10.0.0.5');
  });

  test('filtro combinato azione + user_id restituisce solo la riga di test', async () => {
    const res = await request(app)
      .get(`/api/audit?azione=${AZIONE_TEST}&user_id=${USER_ID_TEST}`)
      .set(authHeader.titolare());

    expect(res.status).toBe(200);
    expect(res.body.log.every(r => r.azione === AZIONE_TEST && r.user_id === USER_ID_TEST)).toBe(true);
  });

  test('logAudit non blocca mai (errore interno gestito, non fa throw)', async () => {
    // risorsa_id non numerico valido non deve far esplodere la funzione chiamante
    await expect(
      logAudit(USER_ID_TEST, AZIONE_TEST, 'users', null, {}, { note: 'req vuoto' })
    ).resolves.not.toThrow();
  });
});
