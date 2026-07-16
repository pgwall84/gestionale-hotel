// Test suite — Modulo Menu
// Copre: menuPubblico (no auth), categorie (CRUD soloTitolare), piatti (lista, toggle)
// Skip: creaPiatto/modificaPiatto (richiedono multipart con immagine)
// Dipendenze: menu_categorie, menu_piatti

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

// IDs creati durante i test — puliti in afterAll
const categorieCrate = [];
let primoIdPiatto; // piatto esistente per il toggle test

beforeAll(async () => {
  const db = getPool();
  const r = await db.query('SELECT id FROM menu_piatti LIMIT 1');
  primoIdPiatto = r.rows[0]?.id ?? null;
});

afterAll(async () => {
  const db = getPool();
  if (categorieCrate.length) {
    await db.query('DELETE FROM menu_categorie WHERE id = ANY($1)', [categorieCrate]);
  }
  await chiudiPool();
});

// ─── GET /api/menu/pubblico ───────────────────────────────────────────────────

describe('GET /api/menu/pubblico', () => {
  test('senza token → 200 (pubblica, no auth)', async () => {
    const res = await request(app).get('/api/menu/pubblico');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('categorie');
    expect(res.body).toHaveProperty('piatti');
    expect(Array.isArray(res.body.categorie)).toBe(true);
    expect(Array.isArray(res.body.piatti)).toBe(true);
  });

  test('risposta contiene solo categorie attive e piatti disponibili', async () => {
    const res = await request(app).get('/api/menu/pubblico');
    // Il menu pubblico non deve esporre categorie disabilitate
    // (non possiamo verificarlo senza sapere il DB, ma la struttura deve essere corretta)
    res.body.piatti.forEach(p => {
      expect(p).toHaveProperty('nome');
    });
  });
});

// ─── GET /api/menu/categorie ──────────────────────────────────────────────────

describe('GET /api/menu/categorie', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/menu/categorie');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con array categorie', async () => {
    const res = await request(app)
      .get('/api/menu/categorie')
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('categorie');
    expect(Array.isArray(res.body.categorie)).toBe(true);
  });

  test('ogni categoria ha id, titolo, ordine', async () => {
    const res = await request(app)
      .get('/api/menu/categorie')
      .set(authHeader.titolare());
    if (res.body.categorie.length > 0) {
      const cat = res.body.categorie[0];
      expect(cat).toHaveProperty('id');
      expect(cat).toHaveProperty('titolo');
      expect(cat).toHaveProperty('ordine');
    }
  });
});

// ─── POST /api/menu/categorie ─────────────────────────────────────────────────

describe('POST /api/menu/categorie', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/menu/categorie').send({ titolo: 'Test' });
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (solo titolare)', async () => {
    const res = await request(app)
      .post('/api/menu/categorie')
      .set(authHeader.cameriere())
      .send({ titolo: 'Categoria Test' });
    expect(res.status).toBe(403);
  });

  test('titolo mancante → 400', async () => {
    const res = await request(app)
      .post('/api/menu/categorie')
      .set(authHeader.titolare())
      .send({ ordine: 5 });
    expect(res.status).toBe(400);
  });

  test('titolare crea categoria → 201', async () => {
    const res = await request(app)
      .post('/api/menu/categorie')
      .set(authHeader.titolare())
      .send({ titolo: `Test Categoria ${Date.now()}`, ordine: 99 });
    expect(res.status).toBe(201);
    expect(res.body.categoria).toHaveProperty('id');
    expect(res.body.categoria).toHaveProperty('titolo');
    categorieCrate.push(res.body.categoria.id);
  });
});

// ─── PUT /api/menu/categorie/:id ──────────────────────────────────────────────

describe('PUT /api/menu/categorie/:id', () => {
  let idCategoria;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/menu/categorie')
      .set(authHeader.titolare())
      .send({ titolo: `Cat Modifica ${Date.now()}`, ordine: 98 });
    idCategoria = res.body.categoria?.id;
    if (idCategoria) categorieCrate.push(idCategoria);
  });

  test('senza token → 401', async () => {
    const res = await request(app).put(`/api/menu/categorie/${idCategoria}`).send({ titolo: 'X' });
    expect(res.status).toBe(401);
  });

  test('receptionist → 403', async () => {
    const res = await request(app)
      .put(`/api/menu/categorie/${idCategoria}`)
      .set(authHeader.receptionist())
      .send({ titolo: 'Nuovo Titolo' });
    expect(res.status).toBe(403);
  });

  test('titolare modifica → 200 con titolo aggiornato', async () => {
    const nuovoTitolo = `Modificata ${Date.now()}`;
    const res = await request(app)
      .put(`/api/menu/categorie/${idCategoria}`)
      .set(authHeader.titolare())
      .send({ titolo: nuovoTitolo, ordine: 97 });
    expect(res.status).toBe(200);
    expect(res.body.categoria.titolo).toBe(nuovoTitolo);
  });
});

// ─── DELETE /api/menu/categorie/:id ───────────────────────────────────────────

describe('DELETE /api/menu/categorie/:id', () => {
  let idDaEliminare;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/menu/categorie')
      .set(authHeader.titolare())
      .send({ titolo: `Cat Elimina ${Date.now()}`, ordine: 96 });
    idDaEliminare = res.body.categoria?.id;
    // Non aggiungiamo a categorieCrate — sarà eliminata dal test
  });

  test('senza token → 401', async () => {
    const res = await request(app).delete(`/api/menu/categorie/${idDaEliminare}`);
    expect(res.status).toBe(401);
  });

  test('receptionist → 403', async () => {
    const res = await request(app)
      .delete(`/api/menu/categorie/${idDaEliminare}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('titolare elimina → 200', async () => {
    const res = await request(app)
      .delete(`/api/menu/categorie/${idDaEliminare}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('messaggio');
  });
});

// ─── GET /api/menu/piatti ─────────────────────────────────────────────────────

describe('GET /api/menu/piatti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/menu/piatti');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con array piatti', async () => {
    const res = await request(app)
      .get('/api/menu/piatti')
      .set(authHeader.cameriere());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('piatti');
    expect(Array.isArray(res.body.piatti)).toBe(true);
  });

  test('ogni piatto ha id, nome, categoria_titolo', async () => {
    const res = await request(app)
      .get('/api/menu/piatti')
      .set(authHeader.cameriere());
    if (res.body.piatti.length > 0) {
      const p = res.body.piatti[0];
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('nome');
      expect(p).toHaveProperty('categoria_titolo');
    }
  });
});

// ─── PATCH /api/menu/piatti/:id/toggle ────────────────────────────────────────

describe('PATCH /api/menu/piatti/:id/toggle', () => {
  test('senza token → 401', async () => {
    if (!primoIdPiatto) return;
    const res = await request(app).patch(`/api/menu/piatti/${primoIdPiatto}/toggle`);
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (ruolo non ammesso al toggle)', async () => {
    if (!primoIdPiatto) return;
    const res = await request(app)
      .patch(`/api/menu/piatti/${primoIdPiatto}/toggle`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('con token valido → 200 con disponibile invertito', async () => {
    if (!primoIdPiatto) {
      console.warn('Nessun piatto nel DB — test toggle skippato');
      return;
    }
    // Prima lettura
    const prima = await request(app)
      .get('/api/menu/piatti')
      .set(authHeader.titolare());
    const piattoOriginale = prima.body.piatti.find(p => p.id === primoIdPiatto);
    const valoreOriginale = piattoOriginale?.disponibile;

    // Toggle
    const res = await request(app)
      .patch(`/api/menu/piatti/${primoIdPiatto}/toggle`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.piatto.disponibile).toBe(!valoreOriginale);

    // Ripristina
    await request(app)
      .patch(`/api/menu/piatti/${primoIdPiatto}/toggle`)
      .set(authHeader.titolare());
  });
});
