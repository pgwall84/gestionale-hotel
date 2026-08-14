// Test suite — Modulo Utenti (gestione dipendenti, /api/users)
// Copre: creazione/modifica con contratto_tipo/fascia_oraria (Fase B,
// 13/08/2026) — prima di questi test la validazione non era mai stata
// esercitata. Il resto del controller (lista/dettaglio/cambiaStato) non è
// nuovo di questa sessione e resta a copertura manuale, non aggiunto qui
// per restare mirati a quanto segnalato.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { pulisciDatiTest, chiudiPool } = require('../helpers/db');

function utenteBase(suffisso) {
  return {
    nome: 'Test',
    cognome: 'Contratto',
    email: `test_contratto_${suffisso}_${Date.now()}@test.hotel`,
    password: 'PasswordTest1!',
    ruolo: 'cameriere',
  };
}

afterAll(async () => {
  await pulisciDatiTest();
  await chiudiPool();
});

describe('POST /api/users — contratto_tipo e fascia_oraria', () => {
  test('senza contratto_tipo/fascia_oraria → 201, entrambi null', async () => {
    const res = await request(app)
      .post('/api/users')
      .set(authHeader.titolare())
      .send(utenteBase('senza'));

    expect(res.status).toBe(201);
    expect(res.body.utente.contratto_tipo).toBeNull();
    expect(res.body.utente.fascia_oraria).toBeNull();
  });

  test('contratto_tipo tempo_indeterminato + fascia_oraria notturna → 201, salvati', async () => {
    const res = await request(app)
      .post('/api/users')
      .set(authHeader.titolare())
      .send({ ...utenteBase('indet'), contratto_tipo: 'tempo_indeterminato', fascia_oraria: 'notturna' });

    expect(res.status).toBe(201);
    expect(res.body.utente.contratto_tipo).toBe('tempo_indeterminato');
    expect(res.body.utente.fascia_oraria).toBe('notturna');
  });

  test('contratto_tipo non valido → 400', async () => {
    const res = await request(app)
      .post('/api/users')
      .set(authHeader.titolare())
      .send({ ...utenteBase('badcontr'), contratto_tipo: 'stagionale' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errore');
  });

  test('fascia_oraria non valida → 400', async () => {
    const res = await request(app)
      .post('/api/users')
      .set(authHeader.titolare())
      .send({ ...utenteBase('badfascia'), fascia_oraria: 'serale' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errore');
  });

  test('senza token → 401', async () => {
    const res = await request(app).post('/api/users').send(utenteBase('notoken'));
    expect(res.status).toBe(401);
  });

  test('con token receptionist → 403', async () => {
    const res = await request(app)
      .post('/api/users')
      .set(authHeader.receptionist())
      .send(utenteBase('recept'));
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/users/:id — aggiornamento contratto_tipo e fascia_oraria', () => {
  let utenteId;

  beforeAll(async () => {
    const creazione = await request(app)
      .post('/api/users')
      .set(authHeader.titolare())
      .send(utenteBase('modifica'));
    utenteId = creazione.body.utente.id;
  });

  test('imposta contratto part_time (senza fascia_oraria) → 200, salvato', async () => {
    const res = await request(app)
      .put(`/api/users/${utenteId}`)
      .set(authHeader.titolare())
      .send({ nome: 'Test', cognome: 'Contratto', email: `${Date.now()}_upd@test.hotel`, ruolo: 'cameriere', contratto_tipo: 'part_time' });

    expect(res.status).toBe(200);
    expect(res.body.utente.contratto_tipo).toBe('part_time');
    expect(res.body.utente.fascia_oraria).toBeNull();
  });

  test('contratto_tipo non valido in modifica → 400, nessuna scrittura', async () => {
    const res = await request(app)
      .put(`/api/users/${utenteId}`)
      .set(authHeader.titolare())
      .send({ nome: 'Test', cognome: 'Contratto', email: `${Date.now()}_upd2@test.hotel`, ruolo: 'cameriere', contratto_tipo: 'annuale' });

    expect(res.status).toBe(400);
  });

  test('rimuove il contratto (stringa vuota → null)', async () => {
    const res = await request(app)
      .put(`/api/users/${utenteId}`)
      .set(authHeader.titolare())
      .send({ nome: 'Test', cognome: 'Contratto', email: `${Date.now()}_upd3@test.hotel`, ruolo: 'cameriere', contratto_tipo: '' });

    expect(res.status).toBe(200);
    expect(res.body.utente.contratto_tipo).toBeNull();
  });
});

describe('GET /api/users — lista espone contratto_tipo/fascia_oraria', () => {
  test('un utente creato con contratto è presente nella lista con i campi giusti', async () => {
    const creazione = await request(app)
      .post('/api/users')
      .set(authHeader.titolare())
      .send({ ...utenteBase('lista'), contratto_tipo: 'chiamata' });
    const nuovoId = creazione.body.utente.id;

    const res = await request(app).get('/api/users').set(authHeader.titolare());
    expect(res.status).toBe(200);
    const trovato = res.body.utenti.find(u => u.id === nuovoId);
    expect(trovato).toBeDefined();
    expect(trovato.contratto_tipo).toBe('chiamata');
  });
});
