// Test suite — Modulo Prenotazioni Fase 2 (Sezione 2 del contratto API).
// Copre: GET /api/prenotazioni/griglia, GET /api/prenotazioni/:id,
//        POST /api/prenotazioni, PATCH /api/prenotazioni/:id,
//        PATCH /api/prenotazioni/:id/stato (state machine + permessi).
// Dipendenze: tabelle prenotazioni/soggiorni/soggiorno_ospiti/pagamenti
// (migration 016), vincolo excl_soggiorni_camera_overlap (migration 017).
// Usa date fittizie nel 2099 e una camera/ospite dedicati per non toccare
// dati reali (stesso pattern di dashboard.test.js/anagrafica-ospiti.test.js).

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let cameraTestId;
let ospiteTestId;
const prenotazioniCreate = []; // id di tutte le prenotazioni create nei test, per cleanup

async function creaPrenotazione(headerRuolo, overrides = {}) {
  // Nota: soggiorno va estratto PRIMA di spargere il resto di overrides,
  // altrimenti "...overrides" sovrascriverebbe l'intero campo "soggiorno"
  // già mergiato con i default (perdendo camera_id/ospite_id).
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
    `INSERT INTO camere (numero, nome, piano) VALUES ($1, 'Camera Test Prenotazioni', 9) RETURNING id`,
    [`TEST-PREN${SUFFISSO}`]
  );
  cameraTestId = camera.rows[0].id;

  const ospite = await db.query(
    `INSERT INTO ospiti (nome, cognome) VALUES ('Mario', $1) RETURNING id`,
    [`TestPrenotazioni${SUFFISSO}`]
  );
  ospiteTestId = ospite.rows[0].id;
});

afterAll(async () => {
  const db = getPool();
  await db.query('DELETE FROM soggiorno_ospiti WHERE ospite_id = $1', [ospiteTestId]);
  await db.query('DELETE FROM soggiorni WHERE camera_id = $1', [cameraTestId]);
  if (prenotazioniCreate.length) {
    await db.query('DELETE FROM prenotazioni WHERE id = ANY($1)', [prenotazioniCreate]);
  }
  await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  await db.query('DELETE FROM ospiti WHERE id = $1', [ospiteTestId]);
  await chiudiPool();
});

// ─── GET /api/prenotazioni/griglia ───────────────────────────────────────────

describe('GET /api/prenotazioni/griglia', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/prenotazioni/griglia?data_inizio=2099-01-01&data_fine=2099-01-31');
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (sezione prenotazioni non consentita)', async () => {
    const res = await request(app)
      .get('/api/prenotazioni/griglia?data_inizio=2099-01-01&data_fine=2099-01-31')
      .set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('senza data_inizio/data_fine → 400', async () => {
    const res = await request(app).get('/api/prenotazioni/griglia').set(authHeader.receptionist());
    expect(res.status).toBe(400);
  });

  test('portiere_notte (sola lettura consentita) → 200, include camere.piano e esclude soggiorni cancellati', async () => {
    const attiva = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-01-20', data_partenza: '2099-01-25' },
    });
    expect(attiva.status).toBe(201);

    const cancellata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-01-26', data_partenza: '2099-01-28' },
    });
    expect(cancellata.status).toBe(201);
    // Porta la seconda prenotazione a 'interrotta' — il controller deve
    // impostare soggiorni.cancellato=true, la griglia non deve più mostrarla.
    const interrompi = await request(app)
      .patch(`/api/prenotazioni/${cancellata.body.id}/stato`)
      .set(authHeader.titolare())
      .send({ stato: 'interrotta' });
    expect(interrompi.status).toBe(200);

    const res = await request(app)
      .get('/api/prenotazioni/griglia?data_inizio=2099-01-01&data_fine=2099-01-31')
      .set(authHeader.portiere_notte());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const rigaAttiva = res.body.find(r => r.prenotazione_id === attiva.body.id);
    expect(rigaAttiva).toBeDefined();
    expect(rigaAttiva.piano).toBe(9);

    const rigaCancellata = res.body.find(r => r.prenotazione_id === cancellata.body.id);
    expect(rigaCancellata).toBeUndefined();
  });
});

// ─── GET /api/prenotazioni/:id ────────────────────────────────────────────────

describe('GET /api/prenotazioni/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/prenotazioni/1');
    expect(res.status).toBe(401);
  });

  test('cuoco → 403', async () => {
    const res = await request(app).get('/api/prenotazioni/1').set(authHeader.cuoco());
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app).get('/api/prenotazioni/999999999').set(authHeader.titolare());
    expect(res.status).toBe(404);
  });

  test('receptionist → 200, con soggiorni.ospiti (capofamiglia) e pagamenti: [] (nessuna riga ancora)', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-02-01', data_partenza: '2099-02-05' },
    });
    expect(creata.status).toBe(201);

    const res = await request(app).get(`/api/prenotazioni/${creata.body.id}`).set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(creata.body.id);
    expect(Array.isArray(res.body.soggiorni)).toBe(true);
    expect(res.body.soggiorni.length).toBe(1);
    expect(res.body.soggiorni[0].camera_numero).toBe(`TEST-PREN${SUFFISSO}`);
    expect(res.body.soggiorni[0].ospiti.length).toBe(1);
    expect(res.body.soggiorni[0].ospiti[0].tipo_alloggiato).toBe('17');
    expect(res.body.soggiorni[0].ospiti[0].id).toBe(ospiteTestId);
    expect(res.body.pagamenti).toEqual([]);
  });
});

// ─── POST /api/prenotazioni ───────────────────────────────────────────────────

describe('POST /api/prenotazioni', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/prenotazioni').send({});
    expect(res.status).toBe(401);
  });

  test('cuoco → 403', async () => {
    const res = await request(app).post('/api/prenotazioni').set(authHeader.cuoco()).send({});
    expect(res.status).toBe(403);
  });

  test('portiere_notte → 403 (sola lettura, niente scrittura)', async () => {
    const res = await creaPrenotazione(authHeader.portiere_notte());
    expect(res.status).toBe(403);
  });

  test('canale_origine mancante → 400', async () => {
    const res = await request(app)
      .post('/api/prenotazioni')
      .set(authHeader.receptionist())
      .send({ soggiorno: { camera_id: cameraTestId, ospite_id: ospiteTestId, data_arrivo: '2099-03-01', data_partenza: '2099-03-05' } });
    expect(res.status).toBe(400);
  });

  test('data_partenza <= data_arrivo → 400', async () => {
    const res = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-03-10', data_partenza: '2099-03-10' },
    });
    expect(res.status).toBe(400);
  });

  test('receptionist con dati validi → 201, stato opzione, data_scadenza_opzione ~48h, soggiorno_ospiti capofamiglia creato', async () => {
    const prima = Date.now();
    const res = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-04-01', data_partenza: '2099-04-05' },
    });
    expect(res.status).toBe(201);
    expect(res.body.stato).toBe('opzione');
    expect(res.body.soggiorno.camera_id).toBe(cameraTestId);

    const scadenza = new Date(res.body.data_scadenza_opzione).getTime();
    const oreDaAdesso = (scadenza - prima) / (1000 * 60 * 60);
    expect(oreDaAdesso).toBeGreaterThan(47.5);
    expect(oreDaAdesso).toBeLessThan(48.5);

    const db = getPool();
    const so = await db.query(
      'SELECT tipo_alloggiato FROM soggiorno_ospiti WHERE soggiorno_id = $1',
      [res.body.soggiorno.id]
    );
    expect(so.rows.length).toBe(1);
    expect(so.rows[0].tipo_alloggiato).toBe('17');
  });

  test('conflitto camera stessa camera/date sovrapposte → 409, non 500', async () => {
    const prima = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-05-10', data_partenza: '2099-05-15' },
    });
    expect(prima.status).toBe(201);

    const sovrapposta = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-05-12', data_partenza: '2099-05-18' },
    });
    expect(sovrapposta.status).toBe(409);
    expect(sovrapposta.body.error).toMatch(/occupata/i);
  });
});

// ─── PATCH /api/prenotazioni/:id ──────────────────────────────────────────────

describe('PATCH /api/prenotazioni/:id', () => {
  test('senza token → 401', async () => {
    const res = await request(app).patch('/api/prenotazioni/1').send({});
    expect(res.status).toBe(401);
  });

  test('portiere_notte → 403 (sola lettura, niente scrittura)', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-06-01', data_partenza: '2099-06-05' },
    });
    const res = await request(app)
      .patch(`/api/prenotazioni/${creata.body.id}`)
      .set(authHeader.portiere_notte())
      .send({ note: 'tentativo non autorizzato' });
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app)
      .patch('/api/prenotazioni/999999999')
      .set(authHeader.admin())
      .send({ note: 'x' });
    expect(res.status).toBe(404);
  });

  test('admin aggiorna solo note → 200, canale_origine invariato (COALESCE)', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-06-10', data_partenza: '2099-06-15' },
    });
    const res = await request(app)
      .patch(`/api/prenotazioni/${creata.body.id}`)
      .set(authHeader.admin())
      .send({ note: 'Nota aggiornata' });
    expect(res.status).toBe(200);
    expect(res.body.note).toBe('Nota aggiornata');
    expect(res.body.canale_origine).toBe('diretta');
  });
});

// ─── PATCH /api/prenotazioni/:id/stato ────────────────────────────────────────

describe('PATCH /api/prenotazioni/:id/stato', () => {
  test('senza token → 401', async () => {
    const res = await request(app).patch('/api/prenotazioni/1/stato').send({ stato: 'confermata' });
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (nessun accesso alla sezione prenotazioni)', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-07-01', data_partenza: '2099-07-05' },
    });
    const res = await request(app)
      .patch(`/api/prenotazioni/${creata.body.id}/stato`)
      .set(authHeader.cameriere())
      .send({ stato: 'confermata' });
    expect(res.status).toBe(403);
  });

  test('ciclo di vita completo: opzione → confermata → check_in → check_out → chiusa, tutte 200', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-08-01', data_partenza: '2099-08-05' },
    });
    const id = creata.body.id;

    const step1 = await request(app).patch(`/api/prenotazioni/${id}/stato`).set(authHeader.titolare()).send({ stato: 'confermata' });
    expect(step1.status).toBe(200);
    expect(step1.body.stato).toBe('confermata');

    const step2 = await request(app).patch(`/api/prenotazioni/${id}/stato`).set(authHeader.titolare()).send({ stato: 'check_in' });
    expect(step2.status).toBe(200);
    expect(step2.body.stato).toBe('check_in');

    const step3 = await request(app).patch(`/api/prenotazioni/${id}/stato`).set(authHeader.titolare()).send({ stato: 'check_out' });
    expect(step3.status).toBe(200);
    expect(step3.body.stato).toBe('check_out');

    const step4 = await request(app).patch(`/api/prenotazioni/${id}/stato`).set(authHeader.titolare()).send({ stato: 'chiusa' });
    expect(step4.status).toBe(200);
    expect(step4.body.stato).toBe('chiusa');

    // Fuori mappa: da 'chiusa' nessuna transizione è ammessa → 400
    const fuoriMappa = await request(app).patch(`/api/prenotazioni/${id}/stato`).set(authHeader.titolare()).send({ stato: 'confermata' });
    expect(fuoriMappa.status).toBe(400);
    expect(fuoriMappa.body.error).toMatch(/non consentita/i);
  });

  test('transizione non valida: opzione → check_in (salta confermata) → 400', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-09-01', data_partenza: '2099-09-05' },
    });
    const res = await request(app)
      .patch(`/api/prenotazioni/${creata.body.id}/stato`)
      .set(authHeader.titolare())
      .send({ stato: 'check_in' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non consentita/i);
  });

  test('interrotta: imposta cancellato=true su tutti i soggiorni nella stessa transazione', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-10-01', data_partenza: '2099-10-05' },
    });
    const res = await request(app)
      .patch(`/api/prenotazioni/${creata.body.id}/stato`)
      .set(authHeader.titolare())
      .send({ stato: 'interrotta' });
    expect(res.status).toBe(200);
    expect(res.body.stato).toBe('interrotta');

    const db = getPool();
    const s = await db.query('SELECT cancellato FROM soggiorni WHERE prenotazione_id = $1', [creata.body.id]);
    expect(s.rows.length).toBe(1);
    expect(s.rows[0].cancellato).toBe(true);
  });

  test('portiere_notte: confermata → check_in → 200 (l\'unica transizione consentita)', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-11-01', data_partenza: '2099-11-05' },
    });
    const id = creata.body.id;
    const portaAConfermata = await request(app).patch(`/api/prenotazioni/${id}/stato`).set(authHeader.titolare()).send({ stato: 'confermata' });
    expect(portaAConfermata.status).toBe(200);

    const res = await request(app)
      .patch(`/api/prenotazioni/${id}/stato`)
      .set(authHeader.portiere_notte())
      .send({ stato: 'check_in' });
    expect(res.status).toBe(200);
    expect(res.body.stato).toBe('check_in');
  });

  test('portiere_notte: check_in → check_out → 403 (fuori dall\'unica eccezione consentita)', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-12-01', data_partenza: '2099-12-05' },
    });
    const id = creata.body.id;
    await request(app).patch(`/api/prenotazioni/${id}/stato`).set(authHeader.titolare()).send({ stato: 'confermata' });
    await request(app).patch(`/api/prenotazioni/${id}/stato`).set(authHeader.titolare()).send({ stato: 'check_in' });

    const res = await request(app)
      .patch(`/api/prenotazioni/${id}/stato`)
      .set(authHeader.portiere_notte())
      .send({ stato: 'check_out' });
    expect(res.status).toBe(403);

    // Verifica che lo stato non sia cambiato nonostante il tentativo
    const db = getPool();
    const p = await db.query('SELECT stato FROM prenotazioni WHERE id = $1', [id]);
    expect(p.rows[0].stato).toBe('check_in');
  });
});
