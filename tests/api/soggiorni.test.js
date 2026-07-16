// Test suite — Modulo Prenotazioni Fase 2, Sezioni 3-4 del contratto API.
// Copre: POST /api/prenotazioni/:id/soggiorni, PATCH /api/soggiorni/:id,
//        GET/POST /api/soggiorni/:id/ospiti, DELETE /api/soggiorni/:id/ospiti/:ospiteId.
// Dipendenze: tabelle prenotazioni/soggiorni/soggiorno_ospiti (migration 016),
// vincolo excl_soggiorni_camera_overlap (migration 017).
// Usa date fittizie nel 2099 e camere/ospiti dedicati per non toccare dati
// reali (stesso pattern di prenotazioni.test.js).

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let cameraTestId;
let cameraTestId2;
let ospiteTestId;
const prenotazioniCreate = []; // id di tutte le prenotazioni create nei test, per cleanup

async function creaPrenotazione(headerRuolo, overrides = {}) {
  const { soggiorno: soggiornoOverride, ...restOverrides } = overrides;
  const res = await request(app)
    .post('/api/prenotazioni')
    .set(headerRuolo)
    .send({
      canale_origine: 'diretta',
      soggiorno: {
        camera_id: cameraTestId,
        ospite_id: ospiteTestId,
        data_arrivo: '2099-01-10',
        data_partenza: '2099-01-15',
        num_ospiti: 2,
        tariffa_totale: 400,
        ...soggiornoOverride,
      },
      ...restOverrides,
    });
  if (res.status === 201) prenotazioniCreate.push(res.body.id);
  return res;
}

beforeAll(async () => {
  const db = getPool();
  const camera = await db.query(
    `INSERT INTO camere (numero, nome, piano) VALUES ($1, 'Camera Test Soggiorni', 9) RETURNING id`,
    [`TEST-SOGG${SUFFISSO}`]
  );
  cameraTestId = camera.rows[0].id;

  const camera2 = await db.query(
    `INSERT INTO camere (numero, nome, piano) VALUES ($1, 'Camera Test Soggiorni 2', 9) RETURNING id`,
    [`TEST-SOGG2${SUFFISSO}`]
  );
  cameraTestId2 = camera2.rows[0].id;

  const ospite = await db.query(
    `INSERT INTO ospiti (nome, cognome) VALUES ('Mario', $1) RETURNING id`,
    [`TestSoggiorni${SUFFISSO}`]
  );
  ospiteTestId = ospite.rows[0].id;
});

afterAll(async () => {
  const db = getPool();
  // I test aggiungono anche ospiti "extra" (familiari, secondi intestatari)
  // creati direttamente nel DB con nome LIKE 'TestSoggiorni%<SUFFISSO>' — la
  // pulizia deve rimuovere le righe soggiorno_ospiti di TUTTI i soggiorni
  // delle camere di test, non solo quelle di ospiteTestId, altrimenti la
  // DELETE su soggiorni fallisce per violazione FK.
  await db.query(
    `DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (
       SELECT id FROM soggiorni WHERE camera_id = ANY($1)
     )`,
    [[cameraTestId, cameraTestId2]]
  );
  await db.query('DELETE FROM soggiorni WHERE camera_id = ANY($1)', [[cameraTestId, cameraTestId2]]);
  if (prenotazioniCreate.length) {
    await db.query('DELETE FROM prenotazioni WHERE id = ANY($1)', [prenotazioniCreate]);
  }
  await db.query('DELETE FROM camere WHERE id = ANY($1)', [[cameraTestId, cameraTestId2]]);
  await db.query(`DELETE FROM ospiti WHERE id = $1 OR cognome LIKE $2`, [ospiteTestId, `%${SUFFISSO}%`]);
  await chiudiPool();
});

// ─── POST /api/prenotazioni/:id/soggiorni ────────────────────────────────────

describe('POST /api/prenotazioni/:id/soggiorni', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/prenotazioni/1/soggiorni').send({});
    expect(res.status).toBe(401);
  });

  test('cuoco → 403', async () => {
    const res = await request(app).post('/api/prenotazioni/1/soggiorni').set(authHeader.cuoco()).send({});
    expect(res.status).toBe(403);
  });

  test('portiere_notte → 403 (sola lettura, niente scrittura)', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-01-20', data_partenza: '2099-01-25' },
    });
    const res = await request(app)
      .post(`/api/prenotazioni/${creata.body.id}/soggiorni`)
      .set(authHeader.portiere_notte())
      .send({ soggiorno: { camera_id: cameraTestId2, ospite_id: ospiteTestId, data_arrivo: '2099-01-20', data_partenza: '2099-01-25' } });
    expect(res.status).toBe(403);
  });

  test('prenotazione inesistente → 404', async () => {
    const res = await request(app)
      .post('/api/prenotazioni/999999999/soggiorni')
      .set(authHeader.receptionist())
      .send({ soggiorno: { camera_id: cameraTestId2, ospite_id: ospiteTestId, data_arrivo: '2099-01-20', data_partenza: '2099-01-25' } });
    expect(res.status).toBe(404);
  });

  test('caso multi-camera: aggiunge un secondo soggiorno (altra camera) alla stessa prenotazione → 201, capofamiglia creato', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-02-01', data_partenza: '2099-02-05' },
    });
    expect(creata.status).toBe(201);

    const res = await request(app)
      .post(`/api/prenotazioni/${creata.body.id}/soggiorni`)
      .set(authHeader.receptionist())
      .send({
        soggiorno: {
          camera_id: cameraTestId2,
          ospite_id: ospiteTestId,
          data_arrivo: '2099-02-01',
          data_partenza: '2099-02-05',
          num_ospiti: 1,
          tariffa_totale: 200,
        },
      });
    expect(res.status).toBe(201);
    expect(res.body.camera_id).toBe(cameraTestId2);
    expect(res.body.prenotazione_id).toBe(creata.body.id);

    const db = getPool();
    const dettaglio = await request(app).get(`/api/prenotazioni/${creata.body.id}`).set(authHeader.receptionist());
    expect(dettaglio.body.soggiorni.length).toBe(2);

    const so = await db.query(
      'SELECT tipo_alloggiato FROM soggiorno_ospiti WHERE soggiorno_id = $1',
      [res.body.id]
    );
    expect(so.rows.length).toBe(1);
    expect(so.rows[0].tipo_alloggiato).toBe('17');
  });
});

// ─── PATCH /api/soggiorni/:id ─────────────────────────────────────────────────

describe('PATCH /api/soggiorni/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).patch('/api/soggiorni/1').send({});
    expect(res.status).toBe(401);
  });

  test('portiere_notte → 403 (sola lettura)', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-03-01', data_partenza: '2099-03-05' },
    });
    const res = await request(app)
      .patch(`/api/soggiorni/${creata.body.soggiorno.id}`)
      .set(authHeader.portiere_notte())
      .send({ tariffa_totale: 999 });
    expect(res.status).toBe(403);
  });

  test('soggiorno inesistente → 404', async () => {
    const res = await request(app)
      .patch('/api/soggiorni/999999999')
      .set(authHeader.receptionist())
      .send({ tariffa_totale: 999 });
    expect(res.status).toBe(404);
  });

  test('spostamento su altra camera/date libere → 200', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-04-01', data_partenza: '2099-04-05' },
    });
    const res = await request(app)
      .patch(`/api/soggiorni/${creata.body.soggiorno.id}`)
      .set(authHeader.receptionist())
      .send({ camera_id: cameraTestId2, data_arrivo: '2099-04-02', data_partenza: '2099-04-06' });
    expect(res.status).toBe(200);
    expect(res.body.camera_id).toBe(cameraTestId2);
    expect(res.body.data_arrivo.slice(0, 10)).toBe('2099-04-02');
  });

  test('spostamento (drag-and-drop planning) su camera già occupata nelle stesse date → 409, non 500', async () => {
    const occupante = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { camera_id: cameraTestId2, data_arrivo: '2099-05-10', data_partenza: '2099-05-15' },
    });
    expect(occupante.status).toBe(201);

    const daSpostare = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { camera_id: cameraTestId, data_arrivo: '2099-05-10', data_partenza: '2099-05-15' },
    });
    expect(daSpostare.status).toBe(201);

    const res = await request(app)
      .patch(`/api/soggiorni/${daSpostare.body.soggiorno.id}`)
      .set(authHeader.receptionist())
      .send({ camera_id: cameraTestId2 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/occupata/i);
  });
});

// ─── GET /api/soggiorni/:id/ospiti ────────────────────────────────────────────

describe('GET /api/soggiorni/:id/ospiti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/soggiorni/1/ospiti');
    expect(res.status).toBe(401);
  });

  test('cuoco → 403 (nessun accesso alla sezione)', async () => {
    const res = await request(app).get('/api/soggiorni/1/ospiti').set(authHeader.cuoco());
    expect(res.status).toBe(403);
  });

  test('portiere_notte (sola lettura consentita) → 200, elenca il capofamiglia', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-06-01', data_partenza: '2099-06-05' },
    });
    const res = await request(app)
      .get(`/api/soggiorni/${creata.body.soggiorno.id}/ospiti`)
      .set(authHeader.portiere_notte());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].tipo_alloggiato).toBe('17');
    expect(res.body[0].ospite_id).toBe(ospiteTestId);
  });
});

// ─── POST /api/soggiorni/:id/ospiti ───────────────────────────────────────────

describe('POST /api/soggiorni/:id/ospiti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/soggiorni/1/ospiti').send({});
    expect(res.status).toBe(401);
  });

  test('portiere_notte → 403 (sola lettura, niente scrittura)', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-07-01', data_partenza: '2099-07-05' },
    });
    const db = getPool();
    const familiare = await db.query(
      `INSERT INTO ospiti (nome, cognome) VALUES ('Figlio', $1) RETURNING id`,
      [`TestSoggiorniFamiliare${SUFFISSO}_1`]
    );
    const res = await request(app)
      .post(`/api/soggiorni/${creata.body.soggiorno.id}/ospiti`)
      .set(authHeader.portiere_notte())
      .send({ ospite_id: familiare.rows[0].id, tipo_alloggiato: '19' });
    expect(res.status).toBe(403);
  });

  test('aggiunge un familiare (tipo 19) al soggiorno con già un capofamiglia → 201', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-07-10', data_partenza: '2099-07-15' },
    });
    const db = getPool();
    const familiare = await db.query(
      `INSERT INTO ospiti (nome, cognome) VALUES ('Figlio', $1) RETURNING id`,
      [`TestSoggiorniFamiliare${SUFFISSO}_2`]
    );
    const res = await request(app)
      .post(`/api/soggiorni/${creata.body.soggiorno.id}/ospiti`)
      .set(authHeader.receptionist())
      .send({ ospite_id: familiare.rows[0].id, tipo_alloggiato: '19' });
    expect(res.status).toBe(201);
    expect(res.body.tipo_alloggiato).toBe('19');
  });

  test('tipo_alloggiato non valido → 400', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-07-20', data_partenza: '2099-07-25' },
    });
    const res = await request(app)
      .post(`/api/soggiorni/${creata.body.soggiorno.id}/ospiti`)
      .set(authHeader.receptionist())
      .send({ ospite_id: ospiteTestId, tipo_alloggiato: '99' });
    expect(res.status).toBe(400);
  });

  // Il vincolo è sul GRUPPO di tipi (16/17/18) nel suo insieme, non sulla
  // ripetizione dello stesso codice — il soggiorno è creato con capofamiglia
  // '17' (da POST /api/prenotazioni), qui si tenta di aggiungere un secondo
  // intestatario con tipo '18' (capogruppo): deve essere bloccato lo stesso.
  test('secondo tentativo di intestatario con tipo diverso dal primo (17 poi 18) → 400', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-08-01', data_partenza: '2099-08-05' },
    });
    // Il soggiorno ha già il capofamiglia '17' creato automaticamente.
    const db = getPool();
    const secondoOspite = await db.query(
      `INSERT INTO ospiti (nome, cognome) VALUES ('Capogruppo', $1) RETURNING id`,
      [`TestSoggiorniCapogruppo${SUFFISSO}`]
    );
    const res = await request(app)
      .post(`/api/soggiorni/${creata.body.soggiorno.id}/ospiti`)
      .set(authHeader.receptionist())
      .send({ ospite_id: secondoOspite.rows[0].id, tipo_alloggiato: '18' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/capofamiglia|singolo|capogruppo/i);

    // Verifica che resti un solo intestatario nel DB, non due.
    const intestatari = await db.query(
      `SELECT id FROM soggiorno_ospiti WHERE soggiorno_id = $1 AND tipo_alloggiato IN ('16','17','18')`,
      [creata.body.soggiorno.id]
    );
    expect(intestatari.rows.length).toBe(1);
  });

  test('anche stesso tipo (17 poi 17) → 400', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-08-10', data_partenza: '2099-08-15' },
    });
    const db = getPool();
    const secondoOspite = await db.query(
      `INSERT INTO ospiti (nome, cognome) VALUES ('Capofamiglia2', $1) RETURNING id`,
      [`TestSoggiorniCapofamiglia2${SUFFISSO}`]
    );
    const res = await request(app)
      .post(`/api/soggiorni/${creata.body.soggiorno.id}/ospiti`)
      .set(authHeader.receptionist())
      .send({ ospite_id: secondoOspite.rows[0].id, tipo_alloggiato: '17' });
    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/soggiorni/:id/ospiti/:ospiteId ───────────────────────────────

describe('DELETE /api/soggiorni/:id/ospiti/:ospiteId', () => {
  test('senza token → 401', async () => {
    const res = await request(app).delete('/api/soggiorni/1/ospiti/1');
    expect(res.status).toBe(401);
  });

  test('portiere_notte → 403 (sola lettura, niente scrittura)', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-09-01', data_partenza: '2099-09-05' },
    });
    const res = await request(app)
      .delete(`/api/soggiorni/${creata.body.soggiorno.id}/ospiti/${ospiteTestId}`)
      .set(authHeader.portiere_notte());
    expect(res.status).toBe(403);
  });

  test('ospite non presente nel soggiorno → 404', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-09-10', data_partenza: '2099-09-15' },
    });
    const res = await request(app)
      .delete(`/api/soggiorni/${creata.body.soggiorno.id}/ospiti/999999999`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(404);
  });

  test('rimozione di un familiare (non intestatario) → 204', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-09-20', data_partenza: '2099-09-25' },
    });
    const db = getPool();
    const familiare = await db.query(
      `INSERT INTO ospiti (nome, cognome) VALUES ('Figlio', $1) RETURNING id`,
      [`TestSoggiorniFamiliareDel${SUFFISSO}`]
    );
    await request(app)
      .post(`/api/soggiorni/${creata.body.soggiorno.id}/ospiti`)
      .set(authHeader.receptionist())
      .send({ ospite_id: familiare.rows[0].id, tipo_alloggiato: '19' });

    const res = await request(app)
      .delete(`/api/soggiorni/${creata.body.soggiorno.id}/ospiti/${familiare.rows[0].id}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(204);
  });

  test('tentativo di rimozione dell\'unico capofamiglia rimasto → 400, riga non eliminata', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-10-01', data_partenza: '2099-10-05' },
    });
    const res = await request(app)
      .delete(`/api/soggiorni/${creata.body.soggiorno.id}/ospiti/${ospiteTestId}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/intestatario/i);

    const db = getPool();
    const rimasti = await db.query(
      'SELECT id FROM soggiorno_ospiti WHERE soggiorno_id = $1 AND ospite_id = $2',
      [creata.body.soggiorno.id, ospiteTestId]
    );
    expect(rimasti.rows.length).toBe(1);
  });

  test('rimozione di un capofamiglia quando ce n\'è un altro (caso non ordinario ma il codice non deve rompersi) → 204', async () => {
    // Scenario: aggiunge un secondo intestatario bypassando temporaneamente
    // il vincolo applicativo via INSERT diretto (simula un dato storico/di
    // migrazione con due intestatari), poi verifica che la DELETE elimini
    // correttamente uno dei due lasciando l'altro, senza bloccare con 400.
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-10-10', data_partenza: '2099-10-15' },
    });
    const db = getPool();
    const secondoIntestatario = await db.query(
      `INSERT INTO ospiti (nome, cognome) VALUES ('Capogruppo2', $1) RETURNING id`,
      [`TestSoggiorniCapogruppo2${SUFFISSO}`]
    );
    await db.query(
      `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1, $2, '18')`,
      [creata.body.soggiorno.id, secondoIntestatario.rows[0].id]
    );

    const res = await request(app)
      .delete(`/api/soggiorni/${creata.body.soggiorno.id}/ospiti/${secondoIntestatario.rows[0].id}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(204);

    const rimasti = await db.query(
      `SELECT ospite_id FROM soggiorno_ospiti WHERE soggiorno_id = $1 AND tipo_alloggiato IN ('16','17','18')`,
      [creata.body.soggiorno.id]
    );
    expect(rimasti.rows.length).toBe(1);
    expect(rimasti.rows[0].ospite_id).toBe(ospiteTestId);
  });
});
