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
  // addebiti_extra e pagamenti (14/08/2026, test del riepilogo economico
  // /conto) non hanno ON DELETE CASCADE su soggiorno_id/prenotazione_id
  // (migration 031 e 016) — vanno ripuliti PRIMA di soggiorni/prenotazioni,
  // altrimenti le DELETE sotto falliscono per violazione FK.
  await db.query('DELETE FROM addebiti_extra WHERE soggiorno_id IN (SELECT id FROM soggiorni WHERE camera_id = $1)', [cameraTestId]);
  if (prenotazioniCreate.length) {
    await db.query('DELETE FROM pagamenti WHERE prenotazione_id = ANY($1)', [prenotazioniCreate]);
  }
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

// ─── GET /api/prenotazioni (elenco filtrabile, 14/08/2026) ──────────────────
// Una riga per soggiorno/camera (non per prenotazione) — vedi commento del
// controller. Esegue prima di POST/PATCH .../stato più sotto: nessuna
// prenotazione è ancora 'chiusa'/'confermata' a questo punto del file.

describe('GET /api/prenotazioni', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/prenotazioni');
    expect(res.status).toBe(401);
  });

  test('cameriere → 403', async () => {
    const res = await request(app).get('/api/prenotazioni').set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('portiere_notte (sola lettura, stessi permessi di /griglia) → 200, forma paginata', async () => {
    const res = await request(app).get('/api/prenotazioni').set(authHeader.portiere_notte());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.risultati)).toBe(true);
    expect(typeof res.body.totale).toBe('number'); // COUNT(*) — type parser bigint, non stringa
    expect(res.body.pagina).toBe(1);
    expect(res.body.per_pagina).toBe(50);
  });

  test('ricerca per cognome ospite trova il soggiorno, con camera_numero corretto', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-01-02', data_partenza: '2099-01-03' },
    });
    expect(creata.status).toBe(201);

    const res = await request(app)
      .get(`/api/prenotazioni?ricerca=TestPrenotazioni${SUFFISSO}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    const trovata = res.body.risultati.find(r => r.soggiorno_id === creata.body.soggiorno.id);
    expect(trovata).toBeDefined();
    expect(trovata.prenotazione_id).toBe(creata.body.id);
    expect(trovata.camera_numero).toBe(`TEST-PREN${SUFFISSO}`);
  });

  test('ricerca per numero camera trova lo stesso soggiorno', async () => {
    const res = await request(app)
      .get(`/api/prenotazioni?ricerca=TEST-PREN${SUFFISSO}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.risultati.some(r => r.camera_numero === `TEST-PREN${SUFFISSO}`)).toBe(true);
  });

  test('filtro stato: opzione include la prenotazione appena creata, confermata la esclude', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-01-04', data_partenza: '2099-01-05' },
    });
    expect(creata.status).toBe(201);

    const conOpzione = await request(app)
      .get(`/api/prenotazioni?ricerca=TestPrenotazioni${SUFFISSO}&stato=opzione`)
      .set(authHeader.receptionist());
    expect(conOpzione.status).toBe(200);
    expect(conOpzione.body.risultati.some(r => r.prenotazione_id === creata.body.id)).toBe(true);

    const conConfermata = await request(app)
      .get(`/api/prenotazioni?ricerca=TestPrenotazioni${SUFFISSO}&stato=confermata`)
      .set(authHeader.receptionist());
    expect(conConfermata.status).toBe(200);
    expect(conConfermata.body.risultati.some(r => r.prenotazione_id === creata.body.id)).toBe(false);
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

// ─── Trattamento + tipo camera venduto in griglia/dettaglio (fix 23/08/2026,
// code review 22/08, Tier 2) ─────────────────────────────────────────────
// Prima /griglia e GET /:id non restituivano affatto trattamento/tipo
// camera venduto — il planning non aveva modo di mostrarli. crea() (POST
// /api/prenotazioni, prenotazione manuale da reception) non accetta questi
// due campi: si simula uno stato "come se venisse dal Booking Engine
// Diretto" con un UPDATE diretto, stesso principio già usato altrove nella
// suite per campi non impostabili via API.

describe('Trattamento + tipo camera venduto in griglia/dettaglio', () => {
  const SUFFISSO_TCV = `_${Date.now().toString().slice(-6)}`;
  let tipoVendutoId;
  let prenotazioneTcvId;
  let soggiornoTcvId;

  beforeAll(async () => {
    const db = getPool();
    const tipo = await db.query(`INSERT INTO tipi_camera (nome) VALUES ($1) RETURNING id`, [`TipoVendutoTest${SUFFISSO_TCV}`]);
    tipoVendutoId = tipo.rows[0].id;

    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-03-01', data_partenza: '2099-03-03' },
    });
    prenotazioneTcvId = creata.body.id;
    soggiornoTcvId = creata.body.soggiorno.id;

    await db.query(
      `UPDATE soggiorni SET trattamento = 'mezza_pensione', tipo_camera_venduto_id = $2 WHERE id = $1`,
      [soggiornoTcvId, tipoVendutoId]
    );
  });

  afterAll(async () => {
    const db = getPool();
    // Il soggiorno di test (cancellato più avanti dall'afterAll di modulo,
    // via prenotazioniCreate) referenzia ancora questo tipo tramite
    // tipo_camera_venduto_id — va sganciato prima di poter cancellare il
    // tipo, altrimenti la FK soggiorni_tipo_camera_venduto_id_fkey blocca la DELETE.
    await db.query('UPDATE soggiorni SET tipo_camera_venduto_id = NULL WHERE tipo_camera_venduto_id = $1', [tipoVendutoId]);
    await db.query('DELETE FROM tipi_camera WHERE id = $1', [tipoVendutoId]);
  });

  test('GET /api/prenotazioni/griglia include trattamento e tipo_camera_venduto_nome', async () => {
    const res = await request(app)
      .get('/api/prenotazioni/griglia?data_inizio=2099-03-01&data_fine=2099-03-05')
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    const riga = res.body.find(r => r.soggiorno_id === soggiornoTcvId);
    expect(riga).toBeDefined();
    expect(riga.trattamento).toBe('mezza_pensione');
    expect(riga.tipo_camera_venduto_nome).toBe(`TipoVendutoTest${SUFFISSO_TCV}`);
  });

  test('GET /api/prenotazioni/:id include trattamento e tipo_camera_venduto_nome per soggiorno', async () => {
    const res = await request(app).get(`/api/prenotazioni/${prenotazioneTcvId}`).set(authHeader.receptionist());
    expect(res.status).toBe(200);
    const soggiorno = res.body.soggiorni.find(s => s.id === soggiornoTcvId);
    expect(soggiorno).toBeDefined();
    expect(soggiorno.trattamento).toBe('mezza_pensione');
    expect(soggiorno.tipo_camera_venduto_nome).toBe(`TipoVendutoTest${SUFFISSO_TCV}`);
  });
});

// ─── GET /api/prenotazioni/:id/conto (riepilogo economico, 14/08/2026) ──────

describe('GET /api/prenotazioni/:id/conto', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/prenotazioni/1/conto');
    expect(res.status).toBe(401);
  });

  test('portiere_notte → 403 (stessi permessi di pagamenti/addebiti_extra lettura)', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-02-10', data_partenza: '2099-02-11' },
    });
    expect(creata.status).toBe(201);

    const res = await request(app)
      .get(`/api/prenotazioni/${creata.body.id}/conto`)
      .set(authHeader.portiere_notte());
    expect(res.status).toBe(403);
  });

  test('id inesistente → 404', async () => {
    const res = await request(app).get('/api/prenotazioni/999999999/conto').set(authHeader.titolare());
    expect(res.status).toBe(404);
  });

  test('receptionist → 200, camera + addebiti extra − pagamenti = saldo corretto (tassa non calcolata → 0)', async () => {
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-02-12', data_partenza: '2099-02-14', tariffa_totale: 200 },
    });
    expect(creata.status).toBe(201);
    const soggiornoId = creata.body.soggiorno.id;
    const prenotazioneId = creata.body.id;

    const addebito = await request(app)
      .post(`/api/soggiorni/${soggiornoId}/addebiti/rapido`)
      .set(authHeader.receptionist())
      .send({ descrizione: 'Minibar test', importo: 15.5 });
    expect(addebito.status).toBe(201);

    const pagamento = await request(app)
      .post(`/api/prenotazioni/${prenotazioneId}/pagamenti`)
      .set(authHeader.receptionist())
      .send({ importo: 100, metodo: 'contanti', tipo: 'caparra' });
    expect(pagamento.status).toBe(201);

    const res = await request(app)
      .get(`/api/prenotazioni/${prenotazioneId}/conto`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.camera.totale).toBe(200);
    expect(res.body.addebiti_extra.totale).toBe(15.5);
    expect(res.body.addebiti_extra.voci.length).toBe(1);
    expect(res.body.pagamenti.totale).toBe(100);
    expect(res.body.tassa_soggiorno.dovuta).toBe(0);
    expect(res.body.tassa_soggiorno.soggiorni[0].calcolata).toBe(false);
    // saldo = (200 camera + 15.5 extra) − 100 pagato + 0 tassa = 115.5
    expect(res.body.saldo_da_incassare).toBe(115.5);
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

// ─── POST /api/prenotazioni — min/max cartellino (23/08/2026) ────────────────
// Setup dedicato: cameraTestId (in cima al file) non ha tipo_camera_id, quindi
// verificaLimitiListino non troverebbe mai un min/max da controllare — qui
// serve una camera con un vero tipo_camera_id e una fascia in `tariffe` con
// prezzo_minimo/prezzo_massimo per le date del test.

describe('POST /api/prenotazioni — min/max cartellino', () => {
  let tipoCameraLimitiId;
  let cameraLimitiId;

  beforeAll(async () => {
    const db = getPool();
    const tipo = await db.query(`INSERT INTO tipi_camera (nome) VALUES ($1) RETURNING id`, [`TipoLimitiPren${SUFFISSO}`]);
    tipoCameraLimitiId = tipo.rows[0].id;
    const camera = await db.query(
      `INSERT INTO camere (numero, nome, piano, tipo_camera_id) VALUES ($1, 'Camera Test Limiti Prenotazioni', 9, $2) RETURNING id`,
      [`TEST-PREN-LIM${SUFFISSO}`, tipoCameraLimitiId]
    );
    cameraLimitiId = camera.rows[0].id;
    await db.query(
      `INSERT INTO tariffe (tipo_camera_id, data_inizio, data_fine, prezzo_notte, prezzo_minimo, prezzo_massimo)
       VALUES ($1, '2093-01-01', '2093-03-31', 100, 100, 300)`,
      [tipoCameraLimitiId]
    );
  });

  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (SELECT id FROM soggiorni WHERE camera_id = $1)', [cameraLimitiId]);
    await db.query('DELETE FROM soggiorni WHERE camera_id = $1', [cameraLimitiId]);
    await db.query('DELETE FROM tariffe WHERE tipo_camera_id = $1', [tipoCameraLimitiId]);
    await db.query('DELETE FROM camere WHERE id = $1', [cameraLimitiId]);
    await db.query('DELETE FROM tipi_camera WHERE id = $1', [tipoCameraLimitiId]);
  });

  test('tariffa_totale sopra il massimo dichiarato, senza conferma → 409', async () => {
    const res = await request(app)
      .post('/api/prenotazioni')
      .set(authHeader.receptionist())
      .send({
        canale_origine: 'diretta',
        soggiorno: {
          camera_id: cameraLimitiId, ospite_id: ospiteTestId,
          data_arrivo: '2093-01-10', data_partenza: '2093-01-12',
          tariffa_totale: 999999,
        },
      });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('minimo');
    expect(res.body).toHaveProperty('massimo');
  });

  test('tariffa_totale sopra il massimo, con confermato:true → 201', async () => {
    const res = await request(app)
      .post('/api/prenotazioni')
      .set(authHeader.receptionist())
      .send({
        canale_origine: 'diretta',
        soggiorno: {
          camera_id: cameraLimitiId, ospite_id: ospiteTestId,
          data_arrivo: '2093-02-10', data_partenza: '2093-02-12',
          tariffa_totale: 999999, confermato: true,
        },
      });
    expect(res.status).toBe(201);
    prenotazioniCreate.push(res.body.id);
  });

  test('tariffa_totale non passata → nessun controllo, 201', async () => {
    const res = await request(app)
      .post('/api/prenotazioni')
      .set(authHeader.receptionist())
      .send({
        canale_origine: 'diretta',
        soggiorno: {
          camera_id: cameraLimitiId, ospite_id: ospiteTestId,
          data_arrivo: '2093-03-10', data_partenza: '2093-03-12',
        },
      });
    expect(res.status).toBe(201);
    prenotazioniCreate.push(res.body.id);
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

  // 15/08/2026 — gruppo_id gestito undefined-safe (CASE, non COALESCE):
  // deve poter essere impostato E poi rimosso esplicitamente con null,
  // senza che un PATCH successivo che non lo tocca lo azzeri per sbaglio.
  test('gruppo_id: assegnazione, invarianza su PATCH successivo senza il campo, rimozione con null esplicito', async () => {
    const db = getPool();
    const gruppo = await db.query(
      `INSERT INTO gruppi_prenotazione (nome) VALUES ($1) RETURNING id`,
      [`Gruppo Test PATCH${SUFFISSO}`]
    );
    const gruppoId = gruppo.rows[0].id;

    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-06-20', data_partenza: '2099-06-25' },
    });

    const assegna = await request(app)
      .patch(`/api/prenotazioni/${creata.body.id}`)
      .set(authHeader.admin())
      .send({ gruppo_id: gruppoId });
    expect(assegna.status).toBe(200);
    expect(assegna.body.gruppo_id).toBe(gruppoId);

    // PATCH successivo che non menziona gruppo_id: deve restare invariato,
    // non azzerarsi (il campo undefined non deve mai fare CASE → null).
    const soloNote = await request(app)
      .patch(`/api/prenotazioni/${creata.body.id}`)
      .set(authHeader.admin())
      .send({ note: 'altra nota' });
    expect(soloNote.status).toBe(200);
    expect(soloNote.body.gruppo_id).toBe(gruppoId);

    // Sganciamento esplicito con null.
    const sgancia = await request(app)
      .patch(`/api/prenotazioni/${creata.body.id}`)
      .set(authHeader.admin())
      .send({ gruppo_id: null });
    expect(sgancia.status).toBe(200);
    expect(sgancia.body.gruppo_id).toBeNull();

    await db.query('DELETE FROM gruppi_prenotazione WHERE id = $1', [gruppoId]);
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

  test('check_in valorizza soggiorni.check_in_effettuato_at (migration 035, prerequisito regola 24h/6h Alloggiati Web)', async () => {
    // Date 15-19 ottobre, deliberatamente diverse da 01-05 ottobre usato dal
    // test 'interrotta' più sotto — stessa cameraTestId di default: date
    // sovrapposte avrebbero fatto fallire la creazione per il vincolo
    // EXCLUDE su camera+intervallo (migration 017), lasciando creata.body.id
    // undefined e facendo esplodere in modo criptico un test successivo e
    // apparentemente scollegato (bug reale trovato dal titolare 13/08/2026).
    const creata = await creaPrenotazione(authHeader.receptionist(), {
      soggiorno: { data_arrivo: '2099-10-15', data_partenza: '2099-10-19' },
    });
    const id = creata.body.id;
    const db = getPool();

    const prima = await db.query(
      'SELECT check_in_effettuato_at FROM soggiorni WHERE prenotazione_id = $1', [id]
    );
    expect(prima.rows[0].check_in_effettuato_at).toBeNull();

    await request(app).patch(`/api/prenotazioni/${id}/stato`).set(authHeader.titolare()).send({ stato: 'confermata' });
    const dopoConfermata = await db.query(
      'SELECT check_in_effettuato_at FROM soggiorni WHERE prenotazione_id = $1', [id]
    );
    expect(dopoConfermata.rows[0].check_in_effettuato_at).toBeNull(); // solo check_in lo valorizza, non confermata

    await request(app).patch(`/api/prenotazioni/${id}/stato`).set(authHeader.titolare()).send({ stato: 'check_in' });
    const dopoCheckIn = await db.query(
      'SELECT check_in_effettuato_at FROM soggiorni WHERE prenotazione_id = $1', [id]
    );
    expect(dopoCheckIn.rows[0].check_in_effettuato_at).not.toBeNull();
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
