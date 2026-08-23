// Test suite — Modulo Camere
// Copre: lista camere con stato, oggi (arrivi/partenze), aggiornaStato (soloTitolare), segnaPronte,
// PATCH :id/tipo (modulo 2.2), e anagrafica camere — crea/modifica/attiva-disattiva
// (modulo Impostazioni▸Camere, 31/07/2026, task preliminare al modulo 2.3).
// Dipendenze: tabella camere (seed — 21 camere fisse + colonna attivo, migration 019), stato_camere

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader, creaToken } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const OGGI = new Date().toISOString().split('T')[0];
let primaCamera; // id della prima camera reale nel DB

beforeAll(async () => {
  const db = getPool();
  const r = await db.query('SELECT id FROM camere ORDER BY id LIMIT 1');
  primaCamera = r.rows[0]?.id ?? 1;
});

afterAll(async () => {
  // Rimuove eventuali record stato_camere creati dai test. aggiornato_da 2/3/6
  // = id fittizi di titolare/receptionist/portiere_notte in tests/helpers/auth.js
  // (aggiunti receptionist/portiere_notte il 31/07/2026 col permesso esteso su
  // POST /api/camere/stato — vedi describe più sotto).
  const db = getPool();
  await db.query(`DELETE FROM stato_camere WHERE data = $1 AND aggiornato_da = ANY($2)`, [OGGI, [2, 3, 6]]);
  await chiudiPool();
});

// ─── GET /api/camere ──────────────────────────────────────────────────────────

describe('GET /api/camere', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/camere');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con array camere', async () => {
    const res = await request(app)
      .get('/api/camere')
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('camere');
    expect(Array.isArray(res.body.camere)).toBe(true);
    expect(res.body.camere.length).toBeGreaterThan(0);
  });

  test('ogni camera ha numero, nome, arrivo, partenza, pronta', async () => {
    const res = await request(app)
      .get('/api/camere')
      .set(authHeader.receptionist());
    const c = res.body.camere[0];
    expect(c).toHaveProperty('numero');
    expect(c).toHaveProperty('nome');
    expect(c).toHaveProperty('arrivo');
    expect(c).toHaveProperty('partenza');
    expect(c).toHaveProperty('pronta');
  });

  test('con parametro data → 200', async () => {
    const res = await request(app)
      .get('/api/camere?data=2026-07-15')
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.data).toBe('2026-07-15');
  });

  // Regressione fix 31/07/2026 (docs/EVOLUTIVE.md): l'ORDER BY faceva
  // CAST(numero AS INTEGER) su tutto ciò che non fosse esattamente 'app' —
  // un numero non numerico rompeva l'intero endpoint con 500. Verifica che
  // un valore non numerico e diverso da 'app' non faccia più fallire la query.
  describe('regressione — numero camera non numerico', () => {
    const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
    let cameraTestId;

    beforeAll(async () => {
      const db = getPool();
      const r = await db.query(
        `INSERT INTO camere (numero, nome) VALUES ($1, 'Camera Test NumeroStrano') RETURNING id`,
        [`XYZ${SUFFISSO}`]
      );
      cameraTestId = r.rows[0].id;
    });

    afterAll(async () => {
      const db = getPool();
      await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
    });

    test('GET /api/camere → 200 anche con un numero non numerico in elenco', async () => {
      const res = await request(app)
        .get('/api/camere')
        .set(authHeader.receptionist());
      expect(res.status).toBe(200);
      expect(res.body.camere.some(c => c.id === cameraTestId)).toBe(true);
    });
  });
});

// Manutenzione visibile in Stato Camere (16/08/2026, punto 2 evolutiva
// dashboard) — segnalazioni_manutenzione aperte/in_lavorazione ora fanno
// JOIN dentro lista() invece di essere visibili solo in /manutenzione e
// nell'alert dashboard. Non filtrato per data: una segnalazione aperta è
// rilevante indipendentemente dal giorno visualizzato in Stato Camere.
describe('GET /api/camere — manutenzione aperta (16/08/2026)', () => {
  const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
  let cameraTestId;
  let segnalazioneId;

  beforeAll(async () => {
    const db = getPool();
    const r = await db.query(
      `INSERT INTO camere (numero, nome) VALUES ($1, 'Camera Test Manutenzione') RETURNING id`,
      [`MAN${SUFFISSO}`]
    );
    cameraTestId = r.rows[0].id;
    const s = await db.query(
      `INSERT INTO segnalazioni_manutenzione (luogo_tipo, camera_id, descrizione, priorita, stato, segnalato_da)
       VALUES ('camera', $1, 'Rubinetto che perde', 'alta', 'aperta', 2) RETURNING id`,
      [cameraTestId]
    );
    segnalazioneId = s.rows[0].id;
  });

  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM segnalazioni_manutenzione WHERE id = $1', [segnalazioneId]);
    await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  });

  test('la camera con segnalazione aperta ha manutenzione_priorita e manutenzione_descrizione', async () => {
    const res = await request(app)
      .get('/api/camere?tutte=true')
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    const camera = res.body.camere.find(c => c.id === cameraTestId);
    expect(camera).toBeDefined();
    expect(camera.manutenzione_priorita).toBe('alta');
    expect(camera.manutenzione_descrizione).toBe('Rubinetto che perde');
  });

  test('una camera senza segnalazioni aperte ha manutenzione_priorita null', async () => {
    const res = await request(app)
      .get('/api/camere')
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    const altraCamera = res.body.camere.find(c => c.id !== cameraTestId);
    expect(altraCamera).toBeDefined();
    expect(altraCamera.manutenzione_priorita).toBeNull();
  });

  test('una segnalazione risolta non compare più in Stato Camere', async () => {
    const db = getPool();
    await db.query(`UPDATE segnalazioni_manutenzione SET stato = 'risolta' WHERE id = $1`, [segnalazioneId]);
    const res = await request(app)
      .get('/api/camere?tutte=true')
      .set(authHeader.receptionist());
    const camera = res.body.camere.find(c => c.id === cameraTestId);
    expect(camera.manutenzione_priorita).toBeNull();
    // Ripristina per non alterare gli altri test del blocco/afterAll
    await db.query(`UPDATE segnalazioni_manutenzione SET stato = 'aperta' WHERE id = $1`, [segnalazioneId]);
  });
});

// ─── GET /api/camere/oggi ─────────────────────────────────────────────────────

describe('GET /api/camere/oggi', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/camere/oggi');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con array camere oggi', async () => {
    const res = await request(app)
      .get('/api/camere/oggi')
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('camere');
    expect(Array.isArray(res.body.camere)).toBe(true);
  });
});

// ─── POST /api/camere/stato ───────────────────────────────────────────────────
// Modulo 5.1 (03/08/2026): non salva più arrivo/partenza (calcolati sempre
// da `soggiorni`, vedi describe dedicato più sotto) — solo `note`. Se il
// body invia ancora arrivo/partenza (client vecchi), vengono ignorati in
// silenzio: nessun errore, semplicemente senza effetto.

describe('POST /api/camere/stato', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/camere/stato').send({});
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (limitata a "segna pronta", niente note)', async () => {
    const res = await request(app)
      .post('/api/camere/stato')
      .set(authHeader.cameriere())
      .send({ camera_id: primaCamera, note: 'test' });
    expect(res.status).toBe(403);
  });

  // Permesso esteso il 31/07/2026 (era soloTitolare) — vedi shared/ruoli.js
  // sezione 'camere' e backend/routes/camere.js.
  test('receptionist → 200 (permesso esteso, era soloTitolare)', async () => {
    const res = await request(app)
      .post('/api/camere/stato')
      .set(authHeader.receptionist())
      .send({ camera_id: primaCamera, data: OGGI, note: 'test receptionist' });
    expect(res.status).toBe(200);
    expect(res.body.stato.note).toBe('test receptionist');
  });

  test('portiere_notte → 200 (permesso esteso, era soloTitolare)', async () => {
    const res = await request(app)
      .post('/api/camere/stato')
      .set(authHeader.portiere_notte())
      .send({ camera_id: primaCamera, data: OGGI, note: 'test portiere' });
    expect(res.status).toBe(200);
    expect(res.body.stato.note).toBe('test portiere');
  });

  test('camera_id mancante → 400', async () => {
    const res = await request(app)
      .post('/api/camere/stato')
      .set(authHeader.titolare())
      .send({ note: 'senza camera' });
    expect(res.status).toBe(400);
  });

  test('titolare aggiorna la nota → 200, arrivo/partenza sempre presenti nella risposta (calcolati)', async () => {
    const res = await request(app)
      .post('/api/camere/stato')
      .set(authHeader.titolare())
      .send({ camera_id: primaCamera, data: OGGI, note: 'test' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stato');
    expect(res.body.stato.note).toBe('test');
    expect(res.body.stato).toHaveProperty('arrivo');
    expect(res.body.stato).toHaveProperty('partenza');
  });

  test('upsert — secondo aggiornamento stessa camera/data → 200, nota sovrascritta', async () => {
    const res = await request(app)
      .post('/api/camere/stato')
      .set(authHeader.titolare())
      .send({ camera_id: primaCamera, data: OGGI, note: 'nota aggiornata' });
    expect(res.status).toBe(200);
    expect(res.body.stato.note).toBe('nota aggiornata');
  });

  // Regressione: un client che invia ancora arrivo/partenza (comportamento
  // pre-5.1) non deve rompersi — vengono semplicemente ignorati, la nota si
  // salva comunque.
  test('arrivo/partenza nel body vengono ignorati, non causano errore', async () => {
    const res = await request(app)
      .post('/api/camere/stato')
      .set(authHeader.titolare())
      .send({ camera_id: primaCamera, data: OGGI, arrivo: true, partenza: true, note: 'ignorati i flag' });
    expect(res.status).toBe(200);
    expect(res.body.stato.note).toBe('ignorati i flag');
  });
});

// ─── Calcolo automatico fermata/partenza da soggiorni (modulo 5.1, 03/08/2026) ─
// arrivo/partenza non sono più impostabili a mano: si calcolano da soggiorni
// non cancellati. Camere e ospite dedicati al test, per non toccare dati reali.

describe('Calcolo automatico fermata/partenza da soggiorni', () => {
  const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
  let cameraFermataId, cameraPartenzaId, cameraTurnoverId, ospiteId, prenotazioneTestId;
  const soggiorniCreati = [];

  beforeAll(async () => {
    const db = getPool();
    const cf = await db.query(`INSERT INTO camere (numero, nome) VALUES ($1, 'Test Fermata') RETURNING id`, [`T-FER${SUFFISSO}`]);
    cameraFermataId = cf.rows[0].id;
    const cp = await db.query(`INSERT INTO camere (numero, nome) VALUES ($1, 'Test Partenza') RETURNING id`, [`T-PAR${SUFFISSO}`]);
    cameraPartenzaId = cp.rows[0].id;
    const ct = await db.query(`INSERT INTO camere (numero, nome) VALUES ($1, 'Test Turnover') RETURNING id`, [`T-TUR${SUFFISSO}`]);
    cameraTurnoverId = ct.rows[0].id;
    const os = await db.query(`INSERT INTO ospiti (nome, cognome) VALUES ('Test', $1) RETURNING id`, [`Calcolo${SUFFISSO}`]);
    ospiteId = os.rows[0].id;
    // Una prenotazione "contenitore" dedicata al test, solo per rispettare
    // il vincolo NOT NULL REFERENCES di soggiorni.prenotazione_id — il suo
    // stato non è rilevante per questi test (guardano solo soggiorni).
    const pr = await db.query(
      `INSERT INTO prenotazioni (canale_origine, stato) VALUES ('diretta', 'confermata') RETURNING id`
    );
    prenotazioneTestId = pr.rows[0].id;

    // Fermata: soggiorno che copre oggi ma non parte oggi (arrivato ieri, parte fra 2 giorni)
    const rf = await db.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
       VALUES ($1, $2, $3, (CURRENT_DATE - 1), (CURRENT_DATE + 2), 1) RETURNING id`,
      [prenotazioneTestId, cameraFermataId, ospiteId]
    );
    soggiorniCreati.push(rf.rows[0].id);

    // Partenza: soggiorno che finisce oggi (arrivato ieri, parte oggi)
    const rp = await db.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
       VALUES ($1, $2, $3, (CURRENT_DATE - 1), CURRENT_DATE, 1) RETURNING id`,
      [prenotazioneTestId, cameraPartenzaId, ospiteId]
    );
    soggiorniCreati.push(rp.rows[0].id);

    // Turnover: chi parte oggi (arrivato ieri) + chi arriva oggi e si ferma
    // (parte fra 2 giorni) sulla STESSA camera — range adiacenti '[)', non
    // sovrapposti, ammessi dall'EXCLUDE anti-overbooking.
    const rt1 = await db.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
       VALUES ($1, $2, $3, (CURRENT_DATE - 1), CURRENT_DATE, 1) RETURNING id`,
      [prenotazioneTestId, cameraTurnoverId, ospiteId]
    );
    soggiorniCreati.push(rt1.rows[0].id);
    const rt2 = await db.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
       VALUES ($1, $2, $3, CURRENT_DATE, (CURRENT_DATE + 2), 1) RETURNING id`,
      [prenotazioneTestId, cameraTurnoverId, ospiteId]
    );
    soggiorniCreati.push(rt2.rows[0].id);
  });

  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM soggiorni WHERE id = ANY($1)', [soggiorniCreati]);
    await db.query('DELETE FROM prenotazioni WHERE id = $1', [prenotazioneTestId]);
    await db.query('DELETE FROM ospiti WHERE id = $1', [ospiteId]);
    await db.query('DELETE FROM camere WHERE id = ANY($1)', [[cameraFermataId, cameraPartenzaId, cameraTurnoverId]]);
  });

  test('camera con soggiorno in corso (non parte oggi) → arrivo=true (Fermata), partenza=false', async () => {
    const res = await request(app).get(`/api/camere?data=${OGGI}`).set(authHeader.receptionist());
    const c = res.body.camere.find(x => x.id === cameraFermataId);
    expect(c.arrivo).toBe(true);
    expect(c.partenza).toBe(false);
  });

  test('camera con soggiorno che finisce oggi → partenza=true, arrivo=false', async () => {
    const res = await request(app).get(`/api/camere?data=${OGGI}`).set(authHeader.receptionist());
    const c = res.body.camere.find(x => x.id === cameraPartenzaId);
    expect(c.partenza).toBe(true);
    expect(c.arrivo).toBe(false);
  });

  test('turnover stesso giorno (chi parte + chi arriva e si ferma) → arrivo=true E partenza=true', async () => {
    const res = await request(app).get(`/api/camere?data=${OGGI}`).set(authHeader.receptionist());
    const c = res.body.camere.find(x => x.id === cameraTurnoverId);
    expect(c.arrivo).toBe(true);
    expect(c.partenza).toBe(true);
  });

  test('GET /api/camere/oggi include le camere con attività calcolata da soggiorni', async () => {
    const res = await request(app).get('/api/camere/oggi').set(authHeader.receptionist());
    const numeri = res.body.camere.map(c => c.numero);
    expect(numeri).toEqual(expect.arrayContaining([`T-FER${SUFFISSO}`, `T-PAR${SUFFISSO}`, `T-TUR${SUFFISSO}`]));
  });
});

// ─── POST /api/camere/pronta ──────────────────────────────────────────────────
// Modulo 5.1 (03/08/2026): prima aperta a qualunque ruolo autenticato, ora
// ristretta — tutti tranne cuoco (shared/ruoli.js sezione 'camere'.'pulizia').

describe('POST /api/camere/pronta', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/camere/pronta').send({});
    expect(res.status).toBe(401);
  });

  test('cuoco → 403 (escluso dal modulo 5.1, unico ruolo senza accesso)', async () => {
    const res = await request(app)
      .post('/api/camere/pronta')
      .set(authHeader.cuoco())
      .send({ camera_id: primaCamera, data: OGGI, pronta: true });
    expect(res.status).toBe(403);
  });

  test('camera_id mancante → 400', async () => {
    const res = await request(app)
      .post('/api/camere/pronta')
      .set(authHeader.cameriere())
      .send({ pronta: true });
    expect(res.status).toBe(400);
  });

  test('cameriere segna camera pronta → 200', async () => {
    const res = await request(app)
      .post('/api/camere/pronta')
      .set(authHeader.cameriere())
      .send({ camera_id: primaCamera, data: OGGI, pronta: true });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('messaggio');
  });

  test('cameriere segna camera non pronta → 200', async () => {
    const res = await request(app)
      .post('/api/camere/pronta')
      .set(authHeader.cameriere())
      .send({ camera_id: primaCamera, data: OGGI, pronta: false });
    expect(res.status).toBe(200);
  });

  test('dipendente segna camera pronta → 200 (permesso esteso, non solo cameriere)', async () => {
    const res = await request(app)
      .post('/api/camere/pronta')
      .set(authHeader.dipendente())
      .send({ camera_id: primaCamera, data: OGGI, pronta: true });
    expect(res.status).toBe(200);
  });

  test('receptionist e portiere_notte segnano camera pronta → 200', async () => {
    const resR = await request(app)
      .post('/api/camere/pronta')
      .set(authHeader.receptionist())
      .send({ camera_id: primaCamera, data: OGGI, pronta: false });
    expect(resR.status).toBe(200);

    const resP = await request(app)
      .post('/api/camere/pronta')
      .set(authHeader.portiere_notte())
      .send({ camera_id: primaCamera, data: OGGI, pronta: true });
    expect(resP.status).toBe(200);
  });
});

// ─── PATCH /api/camere/:id/tipo (Modulo 2.2, aggiunto 31/07/2026) ─────────────
// Usa una camera e una categoria dedicate al test (non primaCamera): la
// categorizzazione reale delle 21 camere è già stata assegnata a mano dal
// titolare durante la verifica del modulo e non va toccata dai test.

describe('PATCH /api/camere/:id/tipo', () => {
  const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
  let cameraTestId, tipoTestId;

  beforeAll(async () => {
    const db = getPool();
    const tipo = await db.query(`INSERT INTO tipi_camera (nome) VALUES ($1) RETURNING id`, [`TipoCamereTest${SUFFISSO}`]);
    tipoTestId = tipo.rows[0].id;
    const cam = await db.query(
      `INSERT INTO camere (numero, nome) VALUES ($1, 'Camera Test PatchTipo') RETURNING id`,
      [`TEST-PT${SUFFISSO}`]
    );
    cameraTestId = cam.rows[0].id;
  });

  afterAll(async () => {
    const db = getPool();
    // Fix 23/08/2026 (auto-collegamento vendita online, vedi describe più
    // sotto): la PATCH .../tipo di questo blocco ora scrive anche in
    // tipi_camera_camere — va ripulita prima di camere/tipi_camera, che non
    // hanno ON DELETE CASCADE verso quella tabella (migration 050).
    await db.query('DELETE FROM tipi_camera_camere WHERE camera_id = $1', [cameraTestId]);
    await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
    await db.query('DELETE FROM tipi_camera WHERE id = $1', [tipoTestId]);
  });

  test('senza token → 401', async () => {
    const res = await request(app).patch(`/api/camere/${cameraTestId}/tipo`).send({ tipo_camera_id: tipoTestId });
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (solo titolare)', async () => {
    const res = await request(app)
      .patch(`/api/camere/${cameraTestId}/tipo`)
      .set(authHeader.receptionist())
      .send({ tipo_camera_id: tipoTestId });
    expect(res.status).toBe(403);
  });

  test('camera inesistente → 404', async () => {
    const res = await request(app)
      .patch('/api/camere/999999999/tipo')
      .set(authHeader.titolare())
      .send({ tipo_camera_id: tipoTestId });
    expect(res.status).toBe(404);
  });

  test('tipo_camera_id non valido → 400', async () => {
    const res = await request(app)
      .patch(`/api/camere/${cameraTestId}/tipo`)
      .set(authHeader.titolare())
      .send({ tipo_camera_id: 999999999 });
    expect(res.status).toBe(400);
  });

  test('titolare assegna categoria → 200', async () => {
    const res = await request(app)
      .patch(`/api/camere/${cameraTestId}/tipo`)
      .set(authHeader.titolare())
      .send({ tipo_camera_id: tipoTestId });
    expect(res.status).toBe(200);
    expect(res.body.tipo_camera_id).toBe(tipoTestId);
  });

  test('titolare rimuove categoria (tipo_camera_id: null) → 200', async () => {
    const res = await request(app)
      .patch(`/api/camere/${cameraTestId}/tipo`)
      .set(authHeader.titolare())
      .send({ tipo_camera_id: null });
    expect(res.status).toBe(200);
    expect(res.body.tipo_camera_id).toBeNull();
  });
});

// ─── Auto-collegamento vendita online (fix 23/08/2026, code review 22/08) ─────
// Prima, collegare una camera nuova (o riassegnata) a tipi_camera_camere —
// la tabella di idoneità del Booking Engine Diretto — richiedeva sempre un
// passaggio manuale: una camera restava invisibile online pur comparendo
// normalmente in reception/planning. Copre entrambi i punti di ingresso
// (crea() e aggiornaTipo()) e verifica che il collegamento resti sempre
// solo ADDITIVO — mai una DELETE quando si rimuove la categoria.

describe('Auto-collegamento vendita online (POST /api/camere e PATCH /:id/tipo)', () => {
  const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
  let tipoTestId;
  const camereCreate = [];

  beforeAll(async () => {
    const db = getPool();
    const tipo = await db.query(`INSERT INTO tipi_camera (nome) VALUES ($1) RETURNING id`, [`TipoAutoLink${SUFFISSO}`]);
    tipoTestId = tipo.rows[0].id;
  });

  afterAll(async () => {
    const db = getPool();
    // tipi_camera_camere non ha ON DELETE CASCADE (migration 050) — va
    // ripulita PRIMA di camere/tipi_camera, altrimenti la DELETE sotto
    // fallisce con un vincolo di chiave esterna violato.
    if (camereCreate.length) {
      await db.query('DELETE FROM tipi_camera_camere WHERE camera_id = ANY($1)', [camereCreate]);
      await db.query('DELETE FROM camere WHERE id = ANY($1)', [camereCreate]);
    }
    await db.query('DELETE FROM tipi_camera WHERE id = $1', [tipoTestId]);
  });

  test('POST /api/camere con tipo_camera_id → collegata automaticamente a tipi_camera_camere', async () => {
    const res = await request(app)
      .post('/api/camere')
      .set(authHeader.titolare())
      .send({ numero: `TEST-AL${SUFFISSO}`, tipo_camera_id: tipoTestId });
    expect(res.status).toBe(201);
    camereCreate.push(res.body.id);

    const db = getPool();
    const idoneita = await db.query(
      `SELECT 1 FROM tipi_camera_camere WHERE tipo_camera_id = $1 AND camera_id = $2`,
      [tipoTestId, res.body.id]
    );
    expect(idoneita.rows.length).toBe(1);
  });

  test('PATCH /api/camere/:id/tipo → collega automaticamente, e rimuovere la categoria NON scollega (solo additivo)', async () => {
    const creata = await request(app)
      .post('/api/camere')
      .set(authHeader.titolare())
      .send({ numero: `TEST-AL2${SUFFISSO}` });
    expect(creata.status).toBe(201);
    camereCreate.push(creata.body.id);

    const assegna = await request(app)
      .patch(`/api/camere/${creata.body.id}/tipo`)
      .set(authHeader.titolare())
      .send({ tipo_camera_id: tipoTestId });
    expect(assegna.status).toBe(200);

    const db = getPool();
    const idoneitaDopoAssegna = await db.query(
      `SELECT 1 FROM tipi_camera_camere WHERE tipo_camera_id = $1 AND camera_id = $2`,
      [tipoTestId, creata.body.id]
    );
    expect(idoneitaDopoAssegna.rows.length).toBe(1);

    const rimuovi = await request(app)
      .patch(`/api/camere/${creata.body.id}/tipo`)
      .set(authHeader.titolare())
      .send({ tipo_camera_id: null });
    expect(rimuovi.status).toBe(200);
    expect(rimuovi.body.tipo_camera_id).toBeNull();

    // Il collegamento in tipi_camera_camere resta: non è mai una DELETE,
    // per non spezzare un'eventuale associazione shared-inventory decisa
    // a mano dal titolare.
    const idoneitaDopoRimozione = await db.query(
      `SELECT 1 FROM tipi_camera_camere WHERE tipo_camera_id = $1 AND camera_id = $2`,
      [tipoTestId, creata.body.id]
    );
    expect(idoneitaDopoRimozione.rows.length).toBe(1);
  });
});

// ─── Impostazioni▸Camere — anagrafica (aggiunto 31/07/2026) ───────────────────
// Copre: POST /api/camere (crea), PATCH /api/camere/:id (modifica),
// PATCH /api/camere/:id/attivo (attiva/disattiva), filtro attivo=true su
// GET /api/camere e bypass con ?tutte=true. Permesso 'camere'.'anagrafica'
// (admin/titolare) — più ristretto di 'camere'.'scrittura' (che include
// receptionist/portiere_notte) testato sopra.

describe('POST /api/camere (anagrafica)', () => {
  const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
  const numeroTest = `TEST-CREA${SUFFISSO}`;
  const numeroSenzaNome = `TEST-CREASN${SUFFISSO}`;
  let cameraCreataId, cameraSenzaNomeId;

  afterAll(async () => {
    const db = getPool();
    const ids = [cameraCreataId, cameraSenzaNomeId].filter(Boolean);
    if (ids.length) await db.query('DELETE FROM camere WHERE id = ANY($1)', [ids]);
  });

  test('senza token → 401', async () => {
    const res = await request(app).post('/api/camere').send({ numero: numeroTest });
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (anagrafica è più ristretta di scrittura)', async () => {
    const res = await request(app)
      .post('/api/camere')
      .set(authHeader.receptionist())
      .send({ numero: numeroTest });
    expect(res.status).toBe(403);
  });

  test('numero mancante → 400', async () => {
    const res = await request(app)
      .post('/api/camere')
      .set(authHeader.titolare())
      .send({ nome: 'Senza numero' });
    expect(res.status).toBe(400);
  });

  test('titolare crea camera → 201', async () => {
    const res = await request(app)
      .post('/api/camere')
      .set(authHeader.titolare())
      .send({ numero: numeroTest, nome: 'Camera Test Anagrafica', piano: 2 });
    expect(res.status).toBe(201);
    expect(res.body.numero).toBe(numeroTest);
    expect(res.body.attivo).toBe(true);
    cameraCreataId = res.body.id;
  });

  test('numero duplicato → 409', async () => {
    const res = await request(app)
      .post('/api/camere')
      .set(authHeader.admin())
      .send({ numero: numeroTest });
    expect(res.status).toBe(409);
  });

  // Regressione: `camere.nome` è NOT NULL sullo schema reale (scoperto in
  // verifica locale) — nome "opzionale" in UI deve andare in fallback sul
  // numero, mai una 500 per vincolo NOT NULL violato.
  test('crea senza nome → 201, nome torna uguale al numero (fallback NOT NULL)', async () => {
    const res = await request(app)
      .post('/api/camere')
      .set(authHeader.titolare())
      .send({ numero: numeroSenzaNome });
    expect(res.status).toBe(201);
    expect(res.body.nome).toBe(numeroSenzaNome);
    cameraSenzaNomeId = res.body.id;
  });
});

describe('PATCH /api/camere/:id (anagrafica)', () => {
  const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
  let cameraTestId;

  beforeAll(async () => {
    const db = getPool();
    const r = await db.query(
      `INSERT INTO camere (numero, nome) VALUES ($1, 'Camera Test PatchAnagrafica') RETURNING id`,
      [`TEST-PA${SUFFISSO}`]
    );
    cameraTestId = r.rows[0].id;
  });

  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  });

  test('senza token → 401', async () => {
    const res = await request(app).patch(`/api/camere/${cameraTestId}`).send({ nome: 'Nuovo nome' });
    expect(res.status).toBe(401);
  });

  test('receptionist → 403', async () => {
    const res = await request(app)
      .patch(`/api/camere/${cameraTestId}`)
      .set(authHeader.receptionist())
      .send({ nome: 'Nuovo nome' });
    expect(res.status).toBe(403);
  });

  test('camera inesistente → 404', async () => {
    const res = await request(app)
      .patch('/api/camere/999999999')
      .set(authHeader.titolare())
      .send({ nome: 'Nuovo nome' });
    expect(res.status).toBe(404);
  });

  test('titolare modifica nome/piano → 200', async () => {
    const res = await request(app)
      .patch(`/api/camere/${cameraTestId}`)
      .set(authHeader.titolare())
      .send({ nome: 'Nome aggiornato', piano: 3 });
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Nome aggiornato');
    expect(res.body.piano).toBe(3);
  });

  // Regressione: `nome` è NOT NULL — una modifica che non lo specifica (o
  // lo svuota) non deve mai azzerarlo, resta il valore precedente (COALESCE).
  test('modifica senza specificare nome → nome resta invariato, mai NULL', async () => {
    const res = await request(app)
      .patch(`/api/camere/${cameraTestId}`)
      .set(authHeader.titolare())
      .send({ piano: 5 });
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Nome aggiornato'); // valore impostato dal test precedente
    expect(res.body.piano).toBe(5);
  });
});

describe('PATCH /api/camere/:id/attivo (anagrafica)', () => {
  const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
  let cameraTestId, cameraInUsoId, ospiteTestId;
  const prenotazioniCreate = [];

  beforeAll(async () => {
    const db = getPool();
    const r = await db.query(
      `INSERT INTO camere (numero, nome) VALUES ($1, 'Camera Test AttivaDisattiva') RETURNING id`,
      [`TEST-AD${SUFFISSO}`]
    );
    cameraTestId = r.rows[0].id;

    const r2 = await db.query(
      `INSERT INTO camere (numero, nome) VALUES ($1, 'Camera Test AttivaDisattiva InUso') RETURNING id`,
      [`TEST-ADU${SUFFISSO}`]
    );
    cameraInUsoId = r2.rows[0].id;

    const ospite = await db.query(
      `INSERT INTO ospiti (nome, cognome) VALUES ('Test', $1) RETURNING id`,
      [`AttivaDisattiva${SUFFISSO}`]
    );
    ospiteTestId = ospite.rows[0].id;

    // Soggiorno futuro non cancellato — blocca la disattivazione di cameraInUsoId
    const res = await request(app)
      .post('/api/prenotazioni')
      .set(authHeader.titolare())
      .send({
        canale_origine: 'diretta',
        soggiorno: {
          camera_id: cameraInUsoId,
          ospite_id: ospiteTestId,
          data_arrivo: '2099-01-10',
          data_partenza: '2099-01-15',
          num_ospiti: 1,
          tariffa_totale: 100,
        },
      });
    if (res.status === 201) prenotazioniCreate.push(res.body.id);
  });

  afterAll(async () => {
    const db = getPool();
    // soggiorno_ospiti va cancellata prima di soggiorni (FK) — stesso ordine
    // già usato in tests/api/soggiorni.test.js, omesso qui per errore.
    await db.query(
      `DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (
         SELECT id FROM soggiorni WHERE camera_id = ANY($1)
       )`,
      [[cameraTestId, cameraInUsoId]]
    );
    await db.query('DELETE FROM soggiorni WHERE camera_id = ANY($1)', [[cameraTestId, cameraInUsoId]]);
    if (prenotazioniCreate.length) {
      await db.query('DELETE FROM prenotazioni WHERE id = ANY($1)', [prenotazioniCreate]);
    }
    await db.query('DELETE FROM camere WHERE id = ANY($1)', [[cameraTestId, cameraInUsoId]]);
    await db.query('DELETE FROM ospiti WHERE id = $1', [ospiteTestId]);
  });

  test('senza token → 401', async () => {
    const res = await request(app).patch(`/api/camere/${cameraTestId}/attivo`).send({ attivo: false });
    expect(res.status).toBe(401);
  });

  test('receptionist → 403', async () => {
    const res = await request(app)
      .patch(`/api/camere/${cameraTestId}/attivo`)
      .set(authHeader.receptionist())
      .send({ attivo: false });
    expect(res.status).toBe(403);
  });

  test('attivo non booleano → 400', async () => {
    const res = await request(app)
      .patch(`/api/camere/${cameraTestId}/attivo`)
      .set(authHeader.titolare())
      .send({ attivo: 'no' });
    expect(res.status).toBe(400);
  });

  test('disattivazione bloccata (409) se ci sono soggiorni futuri non cancellati', async () => {
    const res = await request(app)
      .patch(`/api/camere/${cameraInUsoId}/attivo`)
      .set(authHeader.titolare())
      .send({ attivo: false });
    expect(res.status).toBe(409);
  });

  test('titolare disattiva camera senza soggiorni → 200', async () => {
    const res = await request(app)
      .patch(`/api/camere/${cameraTestId}/attivo`)
      .set(authHeader.titolare())
      .send({ attivo: false });
    expect(res.status).toBe(200);
    expect(res.body.attivo).toBe(false);
  });

  test('camera disattivata non compare in GET /api/camere di default', async () => {
    const res = await request(app).get('/api/camere').set(authHeader.receptionist());
    expect(res.body.camere.some(c => c.id === cameraTestId)).toBe(false);
  });

  test('camera disattivata compare in GET /api/camere?tutte=true', async () => {
    const res = await request(app).get('/api/camere?tutte=true').set(authHeader.receptionist());
    const trovata = res.body.camere.find(c => c.id === cameraTestId);
    expect(trovata).toBeDefined();
    expect(trovata.attivo).toBe(false);
  });

  test('admin riattiva la camera → 200', async () => {
    const res = await request(app)
      .patch(`/api/camere/${cameraTestId}/attivo`)
      .set(authHeader.admin())
      .send({ attivo: true });
    expect(res.status).toBe(200);
    expect(res.body.attivo).toBe(true);
  });
});
