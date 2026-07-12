// Test suite — Modulo 1.9: Archivio documentale
// Copre: GET /api/archivio (ricerca), POST /api/archivio (upload multipart),
//        GET /api/archivio/:id/download, DELETE /api/archivio/:id
// Permessi: admin, titolare, receptionist — 403 per tutti gli altri ruoli.

const request = require('supertest');
const path    = require('path');
const fs      = require('fs');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

// Estensione .pdf necessaria: multer accetta solo pdf/jpeg/jpg/png (fileFilter
// in routes/archivio.js), il contenuto reale non viene validato oltre il mimetype.
const FILE_TEST = path.join(__dirname, '_archivio_test_file.pdf');

let idCaricato;

beforeAll(() => {
  fs.writeFileSync(FILE_TEST, 'contenuto di test');
});

afterAll(async () => {
  fs.unlinkSync(FILE_TEST);
  const db = getPool();
  if (idCaricato) {
    const r = await db.query('SELECT filename FROM archivio_documenti WHERE id = $1', [idCaricato]);
    if (r.rows.length) {
      const fp = path.join(__dirname, '..', '..', 'backend', 'uploads', 'archivio', r.rows[0].filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await db.query('DELETE FROM archivio_documenti WHERE id = $1', [idCaricato]);
  }
  await chiudiPool();
});

// ─── GET /api/archivio ──────────────────────────────────────────────────────────

describe('GET /api/archivio', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/archivio');
    expect(res.status).toBe(401);
  });

  test('cameriere → 403', async () => {
    const res = await request(app).get('/api/archivio').set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('cuoco → 403', async () => {
    const res = await request(app).get('/api/archivio').set(authHeader.cuoco());
    expect(res.status).toBe(403);
  });

  test('receptionist → 200', async () => {
    const res = await request(app).get('/api/archivio').set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('documenti');
  });

  test('titolare → 200', async () => {
    const res = await request(app).get('/api/archivio').set(authHeader.titolare());
    expect(res.status).toBe(200);
  });
});

// ─── POST /api/archivio ─────────────────────────────────────────────────────────

describe('POST /api/archivio', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/archivio');
    expect(res.status).toBe(401);
  });

  test('cameriere → 403', async () => {
    // Niente multipart qui: il permesso viene negato prima di raggiungere multer,
    // allegare un file causerebbe un ECONNRESET (il server chiude la risposta
    // prima di aver consumato lo stream della richiesta).
    const res = await request(app)
      .post('/api/archivio')
      .set(authHeader.cameriere())
      .send({ tipo: 'ddt' });
    expect(res.status).toBe(403);
  });

  test('senza file → 400', async () => {
    const res = await request(app)
      .post('/api/archivio')
      .set(authHeader.receptionist())
      .field('tipo', 'ddt');
    expect(res.status).toBe(400);
  });

  test('tipo non valido → 400', async () => {
    const res = await request(app)
      .post('/api/archivio')
      .set(authHeader.receptionist())
      .attach('file', FILE_TEST)
      .field('tipo', 'inventato');
    expect(res.status).toBe(400);
  });

  test('receptionist carica DDT → 201', async () => {
    const res = await request(app)
      .post('/api/archivio')
      .set(authHeader.receptionist())
      .attach('file', FILE_TEST)
      .field('tipo', 'ddt')
      .field('data_documento', '2099-05-01')
      .field('note', 'Test archivio');
    expect(res.status).toBe(201);
    expect(res.body.documento.tipo).toBe('ddt');
    idCaricato = res.body.documento.id;
  });
});

// ─── GET /api/archivio/:id/download ─────────────────────────────────────────────

describe('GET /api/archivio/:id/download', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get(`/api/archivio/${idCaricato}/download`);
    expect(res.status).toBe(401);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app).get('/api/archivio/999999/download').set(authHeader.titolare());
    expect(res.status).toBe(404);
  });

  test('titolare scarica il documento caricato → 200', async () => {
    const res = await request(app).get(`/api/archivio/${idCaricato}/download`).set(authHeader.titolare());
    expect(res.status).toBe(200);
  });
});

// ─── Ricerca per categoria e data ───────────────────────────────────────────────

describe('GET /api/archivio — ricerca', () => {
  test('filtro tipo=ddt include il documento appena caricato', async () => {
    const res = await request(app).get('/api/archivio?tipo=ddt').set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.documenti.some(d => d.id === idCaricato)).toBe(true);
  });

  test('filtro tipo=fattura NON include il documento DDT', async () => {
    const res = await request(app).get('/api/archivio?tipo=fattura').set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.documenti.some(d => d.id === idCaricato)).toBe(false);
  });

  test('filtro per data (data_da/data_a) include il documento nel range', async () => {
    const res = await request(app)
      .get('/api/archivio?data_da=2099-04-01&data_a=2099-06-01')
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.documenti.some(d => d.id === idCaricato)).toBe(true);
  });
});

// ─── DELETE /api/archivio/:id ───────────────────────────────────────────────────

describe('DELETE /api/archivio/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).delete(`/api/archivio/${idCaricato}`);
    expect(res.status).toBe(401);
  });

  test('cameriere → 403', async () => {
    const res = await request(app).delete(`/api/archivio/${idCaricato}`).set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app).delete('/api/archivio/999999').set(authHeader.titolare());
    expect(res.status).toBe(404);
  });

  test('receptionist elimina il documento → 200, non più presente in lista', async () => {
    const res = await request(app).delete(`/api/archivio/${idCaricato}`).set(authHeader.receptionist());
    expect(res.status).toBe(200);

    const lista = await request(app).get('/api/archivio').set(authHeader.titolare());
    expect(lista.body.documenti.some(d => d.id === idCaricato)).toBe(false);
    idCaricato = null; // già ripulito, evita doppia cancellazione in afterAll
  });
});
