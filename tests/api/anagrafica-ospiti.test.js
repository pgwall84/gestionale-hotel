// Test suite — Modulo Prenotazioni Fase 2: anagrafica Ospiti.
// Copre: GET /api/ospiti?search=, GET /api/ospiti/:id, POST /api/ospiti,
//        PATCH /api/ospiti/:id, POST /api/ospiti/:id/svela-documento.
// Non va confuso con tests/api/ospiti.test.js (Modulo 1.2, ospiti_giornalieri,
// /api/hr/ospiti) — dominio diverso.
// Dipendenze: tabella ospiti (migration 016), audit_log (migration 012).
// Nota: documento_numero non deve mai comparire in chiaro nelle risposte di
// lista/dettaglio/crea/aggiorna — ogni test lo verifica esplicitamente.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const COGNOME_TEST = `TestOspiteFase2_${Date.now()}`;
const DOCUMENTO_NUMERO = 'AB1234567';
const DOCUMENTO_TIPO = 'CI';

let ospiteId;
let ospiteCreatoId; // creato dal test POST, ripulito a parte
let cameraTestId;
let prenotazioneTestId;

afterAll(async () => {
  const db = getPool();
  await db.query(`DELETE FROM audit_log WHERE risorsa_tipo = 'ospiti' AND risorsa_id = $1`, [ospiteId]);
  await db.query('DELETE FROM soggiorni WHERE ospite_id = $1', [ospiteId]);
  if (prenotazioneTestId) await db.query('DELETE FROM prenotazioni WHERE id = $1', [prenotazioneTestId]);
  if (cameraTestId) await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  await db.query('DELETE FROM ospiti WHERE cognome = $1', [COGNOME_TEST]);
  await chiudiPool();
});

beforeAll(async () => {
  const db = getPool();
  const r = await db.query(
    `INSERT INTO ospiti (nome, cognome, sesso, documento_tipo_codice, documento_numero, email, telefono, consenso_marketing)
     VALUES ('Mario', $1, 'M', $2, $3, 'mario.test@test.hotel', '3331234567', false)
     RETURNING id`,
    [COGNOME_TEST, DOCUMENTO_TIPO, DOCUMENTO_NUMERO]
  );
  ospiteId = r.rows[0].id;

  // Fixture per il test numero_soggiorni della sezione Clienti (01/08/2026):
  // un soggiorno attivo + uno cancellato, per verificare che il conteggio
  // in lista() escluda i cancellati (stesso filtro usato in dettaglio()).
  const camera = await db.query(
    `INSERT INTO camere (numero, nome, piano) VALUES ($1, 'Camera Test Clienti', 9) RETURNING id`,
    [`TEST-CLI${Date.now().toString().slice(-6)}`]
  );
  cameraTestId = camera.rows[0].id;

  const prenotazione = await db.query(
    `INSERT INTO prenotazioni (canale_origine, stato) VALUES ('diretta', 'confermata') RETURNING id`
  );
  prenotazioneTestId = prenotazione.rows[0].id;

  await db.query(
    `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti, tariffa_totale)
     VALUES ($1, $2, $3, '2098-01-10', '2098-01-15', 1, 250)`,
    [prenotazioneTestId, cameraTestId, ospiteId]
  );
  await db.query(
    `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti, tariffa_totale, cancellato)
     VALUES ($1, $2, $3, '2098-02-10', '2098-02-15', 1, 250, true)`,
    [prenotazioneTestId, cameraTestId, ospiteId]
  );
});

// ─── GET /api/ospiti ────────────────────────────────────────────────────────

describe('GET /api/ospiti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/ospiti');
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (sezione ospiti non consentita)', async () => {
    const res = await request(app).get('/api/ospiti').set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('portiere_notte (sola lettura consentita) → 200', async () => {
    const res = await request(app)
      .get(`/api/ospiti?search=${encodeURIComponent(COGNOME_TEST)}`)
      .set(authHeader.portiere_notte());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  test('search per cognome trova l\'ospite di test, documento sempre mascherato', async () => {
    const res = await request(app)
      .get(`/api/ospiti?search=${encodeURIComponent(COGNOME_TEST)}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    const trovato = res.body.find(o => o.id === ospiteId);
    expect(trovato).toBeDefined();
    expect(trovato).not.toHaveProperty('documento_numero');
    expect(trovato.documento_mascherato).toBe('CI · ••••4567');
  });

  test('numero_soggiorni conta solo i soggiorni non cancellati (sezione Clienti)', async () => {
    const res = await request(app)
      .get(`/api/ospiti?search=${encodeURIComponent(COGNOME_TEST)}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    const trovato = res.body.find(o => o.id === ospiteId);
    expect(trovato).toBeDefined();
    expect(Number(trovato.numero_soggiorni)).toBe(1);
  });
});

// ─── GET /api/ospiti/:id ─────────────────────────────────────────────────────

describe('GET /api/ospiti/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get(`/api/ospiti/${ospiteId}`);
    expect(res.status).toBe(401);
  });

  test('dipendente → 403 (sezione ospiti non consentita)', async () => {
    const res = await request(app).get(`/api/ospiti/${ospiteId}`).set(authHeader.dipendente());
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app).get('/api/ospiti/999999999').set(authHeader.titolare());
    expect(res.status).toBe(404);
  });

  test('receptionist → 200, storico soggiorni presente, documento mascherato', async () => {
    const res = await request(app).get(`/api/ospiti/${ospiteId}`).set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('documento_numero');
    expect(res.body.documento_mascherato).toBe('CI · ••••4567');
    expect(Array.isArray(res.body.storico_soggiorni)).toBe(true);
  });
});

// ─── POST /api/ospiti ────────────────────────────────────────────────────────

describe('POST /api/ospiti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/ospiti').send({});
    expect(res.status).toBe(401);
  });

  test('cuoco → 403 (sezione ospiti non consentita)', async () => {
    const res = await request(app)
      .post('/api/ospiti')
      .set(authHeader.cuoco())
      .send({ nome: 'Luigi', cognome: 'Verdi' });
    expect(res.status).toBe(403);
  });

  test('portiere_notte → 403 (sola lettura, niente scrittura)', async () => {
    const res = await request(app)
      .post('/api/ospiti')
      .set(authHeader.portiere_notte())
      .send({ nome: 'Luigi', cognome: 'Verdi' });
    expect(res.status).toBe(403);
  });

  test('receptionist senza cognome → 400', async () => {
    const res = await request(app)
      .post('/api/ospiti')
      .set(authHeader.receptionist())
      .send({ nome: 'Luigi' });
    expect(res.status).toBe(400);
  });

  test('sesso non valido → 400', async () => {
    const res = await request(app)
      .post('/api/ospiti')
      .set(authHeader.receptionist())
      .send({ nome: 'Luigi', cognome: `${COGNOME_TEST}_2`, sesso: 'X' });
    expect(res.status).toBe(400);
  });

  test('receptionist con dati validi → 201, documento mascherato, mai in chiaro', async () => {
    const res = await request(app)
      .post('/api/ospiti')
      .set(authHeader.receptionist())
      .send({
        nome: 'Luigi',
        cognome: `${COGNOME_TEST}_creato`,
        documento_tipo_codice: 'CI',
        documento_numero: 'XY9876543',
      });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('documento_numero');
    expect(res.body.documento_mascherato).toBe('CI · ••••6543');
    ospiteCreatoId = res.body.id;
  });

  // Modulo 5.2 Fase A (03/08/2026) — colonna aggiunta per l'OCR documento
  // (MRZ), non richiesta da Alloggiati Web ma utile per un futuro alert
  // "documento in scadenza". Nessuna colonna residenza (deciso dal titolare).
  test('salva documento_scadenza → 201, presente nella risposta', async () => {
    const res = await request(app)
      .post('/api/ospiti')
      .set(authHeader.receptionist())
      .send({
        nome: 'Marco',
        cognome: `${COGNOME_TEST}_scadenza`,
        documento_scadenza: '2030-05-20',
      });
    expect(res.status).toBe(201);
    expect(res.body.documento_scadenza).toBe('2030-05-20');
    await getPool().query('DELETE FROM ospiti WHERE id = $1', [res.body.id]);
  });

  afterAll(async () => {
    if (ospiteCreatoId) {
      const db = getPool();
      await db.query('DELETE FROM ospiti WHERE id = $1', [ospiteCreatoId]);
    }
  });
});

// ─── PATCH /api/ospiti/:id ───────────────────────────────────────────────────

describe('PATCH /api/ospiti/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).patch(`/api/ospiti/${ospiteId}`).send({});
    expect(res.status).toBe(401);
  });

  test('portiere_notte → 403 (sola lettura, niente scrittura)', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteId}`)
      .set(authHeader.portiere_notte())
      .send({ telefono: '3339999999' });
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app)
      .patch('/api/ospiti/999999999')
      .set(authHeader.admin())
      .send({ telefono: '3339999999' });
    expect(res.status).toBe(404);
  });

  test('admin aggiorna solo telefono → 200, cognome invariato (COALESCE)', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteId}`)
      .set(authHeader.admin())
      .send({ telefono: '3339999999' });
    expect(res.status).toBe(200);
    expect(res.body.telefono).toBe('3339999999');
    expect(res.body.cognome).toBe(COGNOME_TEST);
    expect(res.body).not.toHaveProperty('documento_numero');
    expect(res.body.documento_mascherato).toBe('CI · ••••4567');
  });

  // Modulo 5.2 Fase A — stesso COALESCE degli altri campi opzionali: se
  // omesso, resta invariato; se inviato, si aggiorna.
  test('aggiorna documento_scadenza → 200', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteId}`)
      .set(authHeader.admin())
      .send({ documento_scadenza: '2028-11-03' });
    expect(res.status).toBe(200);
    expect(res.body.documento_scadenza).toBe('2028-11-03');
  });

  // Sezione Clienti — fix 01/08/2026: documento/nazionalità devono sempre
  // essere salvabili a testo libero, indipendentemente dalla sincronizzazione
  // delle tabelle di codifica Alloggiati Web (modulo 2.5).
  test('salva cittadinanza a testo libero senza codice abbinato → 200, codice resta null', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteId}`)
      .set(authHeader.receptionist())
      .send({ cittadinanza_testo: 'Italiana', cittadinanza_codice: null });
    expect(res.status).toBe(200);
    expect(res.body.cittadinanza_testo).toBe('Italiana');
    expect(res.body.cittadinanza_codice).toBeNull();
  });

  test('salva stato di nascita con testo e codice insieme (suggerimento selezionato) → 200, entrambi salvati', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteId}`)
      .set(authHeader.receptionist())
      .send({ stato_nascita_testo: 'Italia', stato_nascita_codice: '100000100' });
    expect(res.status).toBe(200);
    expect(res.body.stato_nascita_testo).toBe('Italia');
    expect(res.body.stato_nascita_codice).toBe('100000100');
  });
});

// ─── POST /api/ospiti/:id/svela-documento ────────────────────────────────────

describe('POST /api/ospiti/:id/svela-documento', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post(`/api/ospiti/${ospiteId}/svela-documento`);
    expect(res.status).toBe(401);
  });

  test('portiere_notte → 403 (mai svela-documento, anche se ha lettura)', async () => {
    const res = await request(app)
      .post(`/api/ospiti/${ospiteId}/svela-documento`)
      .set(authHeader.portiere_notte());
    expect(res.status).toBe(403);
  });

  test('dipendente → 403', async () => {
    const res = await request(app)
      .post(`/api/ospiti/${ospiteId}/svela-documento`)
      .set(authHeader.dipendente());
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app)
      .post('/api/ospiti/999999999/svela-documento')
      .set(authHeader.titolare());
    expect(res.status).toBe(404);
  });

  test('receptionist → 200, documento_numero in chiaro + riga scritta in audit_log', async () => {
    const res = await request(app)
      .post(`/api/ospiti/${ospiteId}/svela-documento`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.documento_numero).toBe(DOCUMENTO_NUMERO);

    const db = getPool();
    const log = await db.query(
      `SELECT * FROM audit_log WHERE risorsa_tipo = 'ospiti' AND risorsa_id = $1 AND azione = 'svela_documento'
       ORDER BY created_at DESC LIMIT 1`,
      [ospiteId]
    );
    expect(log.rows.length).toBe(1);
    expect(log.rows[0].user_id).toBe(3); // receptionist — vedi tests/helpers/auth.js
  });
});
