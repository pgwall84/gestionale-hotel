// Test suite — Modulo 1.7: Magazzino
// Copre: /api/magazzino/prodotti, /fornitori, /movimenti, /alert, /food-cost
// Permessi: lettura + movimenti = admin/titolare/cuoco/receptionist/portiere_notte
//           anagrafica (crea prodotto/fornitore) e food-cost = solo admin/titolare
// Nota: usa nomi prefissati ZZZ_TEST_ per isolare e pulire i dati di test.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const PREFISSO = 'ZZZ_TEST_';

afterAll(async () => {
  const db = getPool();
  await db.query(`DELETE FROM movimenti_magazzino WHERE prodotto_id IN (
    SELECT id FROM prodotti WHERE nome LIKE $1
  )`, [`${PREFISSO}%`]);
  await db.query('DELETE FROM prodotti WHERE nome LIKE $1', [`${PREFISSO}%`]);
  await db.query('DELETE FROM fornitori WHERE nome LIKE $1', [`${PREFISSO}%`]);
  await chiudiPool();
});

// ─── GET /api/magazzino/prodotti ───────────────────────────────────────────────

describe('GET /api/magazzino/prodotti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/magazzino/prodotti');
    expect(res.status).toBe(401);
  });

  test('cameriere → 403', async () => {
    const res = await request(app).get('/api/magazzino/prodotti').set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('dipendente → 403', async () => {
    const res = await request(app).get('/api/magazzino/prodotti').set(authHeader.dipendente());
    expect(res.status).toBe(403);
  });

  test('cuoco (lettura consentita) → 200', async () => {
    const res = await request(app).get('/api/magazzino/prodotti').set(authHeader.cuoco());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('prodotti');
  });

  test('receptionist (lettura consentita) → 200', async () => {
    const res = await request(app).get('/api/magazzino/prodotti').set(authHeader.receptionist());
    expect(res.status).toBe(200);
  });

  test('portiere_notte (lettura consentita) → 200', async () => {
    const res = await request(app).get('/api/magazzino/prodotti').set(authHeader.portiere_notte());
    expect(res.status).toBe(200);
  });
});

// ─── POST /api/magazzino/prodotti (anagrafica — solo admin/titolare) ──────────

describe('POST /api/magazzino/prodotti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/magazzino/prodotti').send({});
    expect(res.status).toBe(401);
  });

  test('cuoco → 403 (anagrafica riservata a admin/titolare)', async () => {
    const res = await request(app)
      .post('/api/magazzino/prodotti')
      .set(authHeader.cuoco())
      .send({ nome: `${PREFISSO}Pomodori` });
    expect(res.status).toBe(403);
  });

  test('receptionist → 403 (anagrafica riservata a admin/titolare)', async () => {
    const res = await request(app)
      .post('/api/magazzino/prodotti')
      .set(authHeader.receptionist())
      .send({ nome: `${PREFISSO}Pomodori` });
    expect(res.status).toBe(403);
  });

  test('nome mancante → 400', async () => {
    const res = await request(app)
      .post('/api/magazzino/prodotti')
      .set(authHeader.titolare())
      .send({ categoria: 'verdura' });
    expect(res.status).toBe(400);
  });

  test('titolare crea prodotto → 201 con qr_code generato e giacenza 0', async () => {
    const res = await request(app)
      .post('/api/magazzino/prodotti')
      .set(authHeader.titolare())
      .send({ nome: `${PREFISSO}Pomodori`, categoria: 'verdura', unita_misura: 'kg', soglia_minima: 5 });
    expect(res.status).toBe(201);
    expect(res.body.prodotto).toHaveProperty('qr_code');
    expect(res.body.prodotto.qr_code).toBeTruthy();

    const lista = await request(app).get('/api/magazzino/prodotti').set(authHeader.admin());
    const creato = lista.body.prodotti.find(p => p.nome === `${PREFISSO}Pomodori`);
    expect(creato).toBeDefined();
    expect(creato.giacenza).toBe(0);
    expect(creato.sottoscorta).toBe(true); // soglia 5, giacenza 0 → 0 < 5 → sotto scorta
  });
});

// ─── GET /api/magazzino/prodotti/lookup-ean/:ean (solo admin/titolare) ────────

describe('GET /api/magazzino/prodotti/lookup-ean/:ean', () => {
  test('cuoco → 403', async () => {
    const res = await request(app).get('/api/magazzino/prodotti/lookup-ean/0000000000000').set(authHeader.cuoco());
    expect(res.status).toBe(403);
  });

  test('EAN inesistente → 200 con trovato:false (mai un errore bloccante)', async () => {
    const res = await request(app)
      .get('/api/magazzino/prodotti/lookup-ean/0000000000000')
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('trovato');
  }, 15000);
});

// ─── Fornitori ──────────────────────────────────────────────────────────────────

describe('Fornitori', () => {
  test('GET senza token → 401', async () => {
    const res = await request(app).get('/api/magazzino/fornitori');
    expect(res.status).toBe(401);
  });

  test('GET cuoco (lettura consentita, serve per il form movimenti) → 200', async () => {
    const res = await request(app).get('/api/magazzino/fornitori').set(authHeader.cuoco());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('fornitori');
  });

  test('POST receptionist → 403 (anagrafica riservata a admin/titolare)', async () => {
    const res = await request(app)
      .post('/api/magazzino/fornitori')
      .set(authHeader.receptionist())
      .send({ nome: `${PREFISSO}Fornitore Verdure` });
    expect(res.status).toBe(403);
  });

  test('POST admin → 201', async () => {
    const res = await request(app)
      .post('/api/magazzino/fornitori')
      .set(authHeader.admin())
      .send({ nome: `${PREFISSO}Fornitore Verdure`, telefono: '0187123456' });
    expect(res.status).toBe(201);
    expect(res.body.fornitore.nome).toBe(`${PREFISSO}Fornitore Verdure`);
  });
});

// ─── POST /api/magazzino/movimenti (carico/scarico — tier lettura+movimenti) ──

describe('POST /api/magazzino/movimenti', () => {
  let prodottoId;
  let fornitoreId;

  beforeAll(async () => {
    const db = getPool();
    const p = await db.query(
      `INSERT INTO prodotti (nome, unita_misura, soglia_minima, qr_code) VALUES ($1, 'kg', 3, $2) RETURNING id`,
      [`${PREFISSO}Farina`, `${PREFISSO}QR-FARINA`]
    );
    prodottoId = p.rows[0].id;
    const f = await db.query(`INSERT INTO fornitori (nome) VALUES ($1) RETURNING id`, [`${PREFISSO}Fornitore Farina`]);
    fornitoreId = f.rows[0].id;
  });

  test('senza token → 401', async () => {
    const res = await request(app).post('/api/magazzino/movimenti').send({});
    expect(res.status).toBe(401);
  });

  test('cameriere → 403', async () => {
    const res = await request(app)
      .post('/api/magazzino/movimenti')
      .set(authHeader.cameriere())
      .send({ prodotto_id: prodottoId, tipo: 'carico', quantita: 10 });
    expect(res.status).toBe(403);
  });

  test('tipo non valido → 400', async () => {
    const res = await request(app)
      .post('/api/magazzino/movimenti')
      .set(authHeader.portiere_notte())
      .send({ prodotto_id: prodottoId, tipo: 'furto', quantita: 10 });
    expect(res.status).toBe(400);
  });

  test('prodotto_id inesistente → 404', async () => {
    const res = await request(app)
      .post('/api/magazzino/movimenti')
      .set(authHeader.receptionist())
      .send({ prodotto_id: 999999, tipo: 'carico', quantita: 10 });
    expect(res.status).toBe(404);
  });

  test('portiere_notte registra consegna (carico con fornitore/ddt/scadenza/costo) → 201', async () => {
    const res = await request(app)
      .post('/api/magazzino/movimenti')
      .set(authHeader.portiere_notte())
      .send({
        prodotto_id: prodottoId, tipo: 'carico', quantita: 20,
        fornitore_id: fornitoreId, ddt_numero: 'DDT-001', data_scadenza: '2099-01-01', costo_unitario: 1.5,
      });
    expect(res.status).toBe(201);
    expect(res.body.movimento.tipo).toBe('carico');
  });

  test('giacenza aggiornata dopo il carico → 20', async () => {
    const res = await request(app).get('/api/magazzino/prodotti').set(authHeader.admin());
    const prodotto = res.body.prodotti.find(p => p.id === prodottoId);
    expect(prodotto.giacenza).toBe(20);
  });

  test('cuoco registra scarico → 201, giacenza scende a 15', async () => {
    const res = await request(app)
      .post('/api/magazzino/movimenti')
      .set(authHeader.cuoco())
      .send({ prodotto_id: prodottoId, tipo: 'scarico', quantita: 5 });
    expect(res.status).toBe(201);

    const lista = await request(app).get('/api/magazzino/prodotti').set(authHeader.admin());
    const prodotto = lista.body.prodotti.find(p => p.id === prodottoId);
    expect(prodotto.giacenza).toBe(15);
  });

  test('GET /api/magazzino/movimenti filtrato per prodotto → include entrambi i movimenti', async () => {
    const res = await request(app)
      .get(`/api/magazzino/movimenti?prodotto_id=${prodottoId}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.movimenti.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── GET /api/magazzino/alert ───────────────────────────────────────────────────

describe('GET /api/magazzino/alert', () => {
  test('prodotto sotto soglia (giacenza 15 < soglia 3? no — creo un caso dedicato)', async () => {
    // Farina ha giacenza 15 e soglia 3 → NON sotto scorta. Creo un prodotto scarico apposta.
    const db = getPool();
    const p = await db.query(
      `INSERT INTO prodotti (nome, unita_misura, soglia_minima, qr_code) VALUES ($1, 'pz', 100, $2) RETURNING id`,
      [`${PREFISSO}Tovaglioli`, `${PREFISSO}QR-TOVAGLIOLI`]
    );
    await db.query(
      `INSERT INTO movimenti_magazzino (prodotto_id, tipo, quantita, user_id) VALUES ($1, 'carico', 10, 1)`,
      [p.rows[0].id]
    );

    const res = await request(app).get('/api/magazzino/alert').set(authHeader.admin());
    expect(res.status).toBe(200);
    const trovato = res.body.prodotti.find(pr => pr.id === p.rows[0].id);
    expect(trovato).toBeDefined();
    expect(trovato.giacenza).toBe(10);
  });

  test('cameriere → 403', async () => {
    const res = await request(app).get('/api/magazzino/alert').set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });
});

// ─── GET /api/magazzino/food-cost (solo admin/titolare) ────────────────────────

describe('GET /api/magazzino/food-cost', () => {
  test('cuoco → 403', async () => {
    const res = await request(app)
      .get('/api/magazzino/food-cost?da=2099-01-01&a=2099-01-31')
      .set(authHeader.cuoco());
    expect(res.status).toBe(403);
  });

  test('senza parametri da/a → 400', async () => {
    const res = await request(app).get('/api/magazzino/food-cost').set(authHeader.titolare());
    expect(res.status).toBe(400);
  });

  test('titolare con periodo valido → 200 con spesa/coperti/costo_medio_per_coperto', async () => {
    const res = await request(app)
      .get('/api/magazzino/food-cost?da=2000-01-01&a=2099-12-31')
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('spesa');
    expect(res.body).toHaveProperty('coperti');
    expect(res.body).toHaveProperty('costo_medio_per_coperto');
  });
});

// ─── GET /api/magazzino/prodotti/qr/:qr_code ───────────────────────────────────

describe('GET /api/magazzino/prodotti/qr/:qr_code', () => {
  test('QR esistente → 200 con prodotto', async () => {
    const res = await request(app)
      .get(`/api/magazzino/prodotti/qr/${PREFISSO}QR-FARINA`)
      .set(authHeader.portiere_notte());
    expect(res.status).toBe(200);
    expect(res.body.prodotto.nome).toBe(`${PREFISSO}Farina`);
  });

  test('QR inesistente → 404', async () => {
    const res = await request(app)
      .get('/api/magazzino/prodotti/qr/QR-NON-ESISTE-XYZ')
      .set(authHeader.receptionist());
    expect(res.status).toBe(404);
  });
});
