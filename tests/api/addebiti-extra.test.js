// Test suite — Modulo Addebiti extra (10/08/2026).
// Copre: catalogo addebiti rapidi (CRUD, permessi), addebito rapido su
// soggiorno (percorso bar/camera diretto), lista addebiti per soggiorno,
// e il percorso da comanda reale (addebito_camera su riga, blocco
// omaggio/autoconsumo, generazione dell'addebito alla chiusura normale).
// Vedi database/migrations/031_ristorante_addebiti.sql.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

let pool;
const SUFFISSO = `_${Date.now().toString().slice(-6)}`;

let cameraTestId;
let ospiteTestId;
let soggiornoTestId;
let configId;
let tavoloId;
let categoriaTestId;
let piattoId;
let catalogoVoceId;

async function pulisci(sql, params = []) {
  try { await pool.query(sql, params); } catch (_) {}
}

beforeAll(async () => {
  pool = await getPool();

  const camera = await pool.query(
    `INSERT INTO camere (numero, nome, piano) VALUES ($1, 'Camera Test Addebiti', 9) RETURNING id`,
    [`TEST-ADD${SUFFISSO}`]
  );
  cameraTestId = camera.rows[0].id;

  const ospite = await pool.query(
    `INSERT INTO ospiti (nome, cognome) VALUES ('Mario', $1) RETURNING id`,
    [`TestAddebiti${SUFFISSO}`]
  );
  ospiteTestId = ospite.rows[0].id;

  const prenRes = await request(app)
    .post('/api/prenotazioni')
    .set(authHeader.receptionist())
    .send({
      canale_origine: 'diretta',
      soggiorno: {
        camera_id: cameraTestId,
        ospite_id: ospiteTestId,
        data_arrivo: '2099-02-10',
        data_partenza: '2099-02-15',
        num_ospiti: 1,
        tariffa_totale: 300,
      },
    });
  soggiornoTestId = prenRes.body.soggiorno.id;

  // Config sala + tavolo + piatto, per il percorso da comanda reale
  const cfgRes = await pool.query(`
    INSERT INTO configurazioni_sala (nome, attiva, is_default)
    VALUES ('Config Test Addebiti', true, false) RETURNING id
  `);
  configId = cfgRes.rows[0].id;

  const tavRes = await pool.query(
    `INSERT INTO tavoli (numero, coperti, posizione_x, posizione_y, configurazione_id, attivo)
     VALUES (951, 2, 0, 0, $1, true) RETURNING id`,
    [configId]
  );
  tavoloId = tavRes.rows[0].id;

  // 14/08/2026 — prima creava una categoria a titolo fisso 'Cat Test Addebiti'
  // con "ON CONFLICT DO NOTHING": la tabella menu_categorie non ha un vincolo
  // UNIQUE su titolo (verificato: nessun conflitto poteva mai scattare), quindi
  // ogni esecuzione della suite ne inseriva una copia in più, senza che
  // afterAll la ripulisse mai. Il titolare l'ha trovata duplicata ~14 volte
  // nel filtro categorie della pagina Menu reale. Corretto con lo stesso
  // pattern SUFFISSO già in uso in questo file: titolo univoco per ogni run,
  // id tracciato e cancellato esplicitamente in afterAll — niente più bisogno
  // di un vincolo DB per essere idempotente.
  const catIns = await pool.query(
    `INSERT INTO menu_categorie (titolo, ordine) VALUES ($1, 99) RETURNING id`,
    [`Cat Test Addebiti${SUFFISSO}`]
  );
  categoriaTestId = catIns.rows[0].id;
  const piattoRes = await pool.query(
    `INSERT INTO menu_piatti (nome, prezzo, disponibile, categoria_id)
     VALUES ('Extra Test', 10.00, true, $1) RETURNING id`,
    [categoriaTestId]
  );
  piattoId = piattoRes.rows[0].id;
});

afterAll(async () => {
  await pulisci('DELETE FROM addebiti_extra WHERE soggiorno_id = $1', [soggiornoTestId]);
  await pulisci('DELETE FROM comande_righe WHERE comanda_id IN (SELECT id FROM comande WHERE tavolo_id = $1)', [tavoloId]);
  await pulisci('DELETE FROM comande WHERE tavolo_id = $1', [tavoloId]);
  await pulisci('DELETE FROM tavoli WHERE id = $1', [tavoloId]);
  await pulisci('DELETE FROM menu_piatti WHERE id = $1', [piattoId]);
  await pulisci('DELETE FROM menu_categorie WHERE id = $1', [categoriaTestId]);
  await pulisci('DELETE FROM configurazioni_sala WHERE id = $1', [configId]);
  await pulisci('DELETE FROM catalogo_addebiti_rapidi WHERE id = $1', [catalogoVoceId]);
  await pulisci('DELETE FROM soggiorno_ospiti WHERE soggiorno_id = $1', [soggiornoTestId]);
  await pulisci('DELETE FROM soggiorni WHERE id = $1', [soggiornoTestId]);
  await pulisci('DELETE FROM prenotazioni WHERE id = (SELECT prenotazione_id FROM soggiorni WHERE id = $1)', [soggiornoTestId]);
  await pulisci('DELETE FROM ospiti WHERE id = $1', [ospiteTestId]);
  await pulisci('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  await chiudiPool();
});

// ── Catalogo addebiti rapidi ─────────────────────────────────────────────────

describe('GET /api/impostazioni/catalogo-addebiti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/impostazioni/catalogo-addebiti');
    expect(res.status).toBe(401);
  });

  test('cameriere (lettura consentita) → 200', async () => {
    const res = await request(app).get('/api/impostazioni/catalogo-addebiti').set(authHeader.cameriere());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.catalogo)).toBe(true);
  });

  test('portiere_notte (non incluso in lettura) → 403', async () => {
    const res = await request(app).get('/api/impostazioni/catalogo-addebiti').set(authHeader.portiere_notte());
    expect(res.status).toBe(403);
  });
});

describe('POST /api/impostazioni/catalogo-addebiti', () => {
  test('cameriere (scrittura riservata ad admin/titolare) → 403', async () => {
    const res = await request(app).post('/api/impostazioni/catalogo-addebiti')
      .set(authHeader.cameriere()).send({ nome: 'Birra Test', prezzo: 4 });
    expect(res.status).toBe(403);
  });

  test('titolare, nome mancante → 400', async () => {
    const res = await request(app).post('/api/impostazioni/catalogo-addebiti')
      .set(authHeader.titolare()).send({ prezzo: 4 });
    expect(res.status).toBe(400);
  });

  test('titolare, prezzo negativo → 400', async () => {
    const res = await request(app).post('/api/impostazioni/catalogo-addebiti')
      .set(authHeader.titolare()).send({ nome: 'Birra Test', prezzo: -1 });
    expect(res.status).toBe(400);
  });

  test('titolare, voce valida → 201', async () => {
    const res = await request(app).post('/api/impostazioni/catalogo-addebiti')
      .set(authHeader.titolare()).send({ nome: `Birra Test${SUFFISSO}`, prezzo: 4 });
    expect(res.status).toBe(201);
    expect(res.body.voce.attivo).toBe(true);
    catalogoVoceId = res.body.voce.id;
  });

  test('PATCH modifica prezzo e disattiva → 200, sparisce dalla lista attivi', async () => {
    const res = await request(app).patch(`/api/impostazioni/catalogo-addebiti/${catalogoVoceId}`)
      .set(authHeader.titolare()).send({ prezzo: 4.5, attivo: false });
    expect(res.status).toBe(200);
    expect(Number(res.body.voce.prezzo)).toBe(4.5);

    const lista = await request(app).get('/api/impostazioni/catalogo-addebiti').set(authHeader.titolare());
    expect(lista.body.catalogo.find(v => v.id === catalogoVoceId)).toBeUndefined();

    const listaTutti = await request(app).get('/api/impostazioni/catalogo-addebiti?tutti=true').set(authHeader.titolare());
    expect(listaTutti.body.catalogo.find(v => v.id === catalogoVoceId)).toBeDefined();

    // riattiva per i test successivi
    await request(app).patch(`/api/impostazioni/catalogo-addebiti/${catalogoVoceId}`)
      .set(authHeader.titolare()).send({ attivo: true });
  });
});

// ── Addebiti su soggiorno (percorso rapido bar/camera) ───────────────────────

describe('POST /api/soggiorni/:id/addebiti/rapido', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post(`/api/soggiorni/${soggiornoTestId}/addebiti/rapido`).send({});
    expect(res.status).toBe(401);
  });

  test('portiere_notte (non incluso in scrittura) → 403', async () => {
    const res = await request(app).post(`/api/soggiorni/${soggiornoTestId}/addebiti/rapido`)
      .set(authHeader.portiere_notte()).send({ descrizione: 'Acqua', importo: 2 });
    expect(res.status).toBe(403);
  });

  test('soggiorno inesistente → 404', async () => {
    const res = await request(app).post('/api/soggiorni/999999999/addebiti/rapido')
      .set(authHeader.cameriere()).send({ descrizione: 'Acqua', importo: 2 });
    expect(res.status).toBe(404);
  });

  test('né catalogo_id né descrizione+importo → 400', async () => {
    const res = await request(app).post(`/api/soggiorni/${soggiornoTestId}/addebiti/rapido`)
      .set(authHeader.cameriere()).send({});
    expect(res.status).toBe(400);
  });

  test('catalogo_id inesistente → 404', async () => {
    const res = await request(app).post(`/api/soggiorni/${soggiornoTestId}/addebiti/rapido`)
      .set(authHeader.cameriere()).send({ catalogo_id: 999999999 });
    expect(res.status).toBe(404);
  });

  test('cameriere, voce libera → 201, origine bar', async () => {
    const res = await request(app).post(`/api/soggiorni/${soggiornoTestId}/addebiti/rapido`)
      .set(authHeader.cameriere()).send({ descrizione: 'Acqua minerale', importo: 2 });
    expect(res.status).toBe(201);
    expect(res.body.addebito.origine).toBe('bar');
    expect(Number(res.body.addebito.importo)).toBe(2);
  });

  test('receptionist, catalogo_id → 201, descrizione/prezzo presi dal catalogo', async () => {
    const res = await request(app).post(`/api/soggiorni/${soggiornoTestId}/addebiti/rapido`)
      .set(authHeader.receptionist()).send({ catalogo_id: catalogoVoceId });
    expect(res.status).toBe(201);
    expect(res.body.addebito.descrizione).toBe(`Birra Test${SUFFISSO}`);
    expect(Number(res.body.addebito.importo)).toBe(4.5);
  });
});

describe('GET /api/soggiorni/:id/addebiti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get(`/api/soggiorni/${soggiornoTestId}/addebiti`);
    expect(res.status).toBe(401);
  });

  test('portiere_notte (non incluso in lettura) → 403', async () => {
    const res = await request(app).get(`/api/soggiorni/${soggiornoTestId}/addebiti`).set(authHeader.portiere_notte());
    expect(res.status).toBe(403);
  });

  test('titolare → 200, totale coerente con gli addebiti creati sopra (2 + 4.5)', async () => {
    const res = await request(app).get(`/api/soggiorni/${soggiornoTestId}/addebiti`).set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.addebiti.length).toBeGreaterThanOrEqual(2);
    expect(res.body.totale).toBeCloseTo(6.5, 2);
  });
});

// ── Percorso da comanda reale (addebito_camera su riga) ──────────────────────

describe('Comanda con soggiorno + addebito_camera su riga', () => {
  let comandaSenzaSoggiornoId;
  let comandaConSoggiornoId;
  let rigaId;

  afterEach(async () => {
    await pulisci('DELETE FROM comande_righe WHERE comanda_id = ANY($1::int[])', [[comandaSenzaSoggiornoId, comandaConSoggiornoId].filter(Boolean)]);
    await pulisci('DELETE FROM comande WHERE id = ANY($1::int[])', [[comandaSenzaSoggiornoId, comandaConSoggiornoId].filter(Boolean)]);
    comandaSenzaSoggiornoId = null;
    comandaConSoggiornoId = null;
  });

  test('apriComanda con ospite_hotel=true e soggiorno_id → salvato, nome_cliente_esterno forzato a null', async () => {
    const res = await request(app).post('/api/ristorante/comande')
      .set(authHeader.cameriere()).send({ tavolo_id: tavoloId, ospite_hotel: true, soggiorno_id: soggiornoTestId, nome_cliente_esterno: 'Non dovrebbe salvarsi' });
    expect(res.status).toBe(201);
    expect(res.body.comanda.soggiorno_id).toBe(soggiornoTestId);
    expect(res.body.comanda.nome_cliente_esterno).toBeNull();
    comandaConSoggiornoId = res.body.comanda.id;
  });

  test('riga addebito_camera su comanda senza soggiorno_id → 400', async () => {
    const apertura = await request(app).post('/api/ristorante/comande')
      .set(authHeader.cameriere()).send({ tavolo_id: tavoloId, ospite_hotel: false, nome_cliente_esterno: 'Cliente Esterno Test' });
    expect(apertura.status).toBe(201);
    comandaSenzaSoggiornoId = apertura.body.comanda.id;

    const riga = await request(app).post(`/api/ristorante/comande/${comandaSenzaSoggiornoId}/righe`)
      .set(authHeader.cameriere()).send({ piatto_id: piattoId, quantita: 1 });
    expect(riga.status).toBe(201);

    const marca = await request(app).patch(`/api/ristorante/comande/righe/${riga.body.riga.id}/addebito-camera`)
      .set(authHeader.cameriere()).send({ addebito_camera: true });
    expect(marca.status).toBe(400);
  });

  test('chiusura omaggio con riga addebito_camera marcata → 400; chiusura normale → genera addebiti_extra', async () => {
    const apertura = await request(app).post('/api/ristorante/comande')
      .set(authHeader.cameriere()).send({ tavolo_id: tavoloId, ospite_hotel: true, soggiorno_id: soggiornoTestId });
    comandaConSoggiornoId = apertura.body.comanda.id;

    const riga = await request(app).post(`/api/ristorante/comande/${comandaConSoggiornoId}/righe`)
      .set(authHeader.cameriere()).send({ piatto_id: piattoId, quantita: 2 });
    rigaId = riga.body.riga.id;

    const marca = await request(app).patch(`/api/ristorante/comande/righe/${rigaId}/addebito-camera`)
      .set(authHeader.cameriere()).send({ addebito_camera: true });
    expect(marca.status).toBe(200);
    expect(marca.body.riga.addebito_camera).toBe(true);

    // serve la riga prima di poter chiudere
    await request(app).patch(`/api/ristorante/comande/righe/${rigaId}/stato`).set(authHeader.cuoco()).send({ stato: 'in_preparazione' });
    await request(app).patch(`/api/ristorante/comande/righe/${rigaId}/stato`).set(authHeader.cuoco()).send({ stato: 'pronto' });
    await request(app).patch(`/api/ristorante/comande/righe/${rigaId}/stato`).set(authHeader.cameriere()).send({ stato: 'servito' });

    const chiusuraOmaggio = await request(app).patch(`/api/ristorante/comande/${comandaConSoggiornoId}/chiudi`)
      .set(authHeader.titolare()).send({ tipo: 'omaggio', motivo: 'Test' });
    expect(chiusuraOmaggio.status).toBe(400);

    const totalePrima = await request(app).get(`/api/soggiorni/${soggiornoTestId}/addebiti`).set(authHeader.titolare());

    const chiusuraNormale = await request(app).patch(`/api/ristorante/comande/${comandaConSoggiornoId}/chiudi`)
      .set(authHeader.cameriere()).send({});
    expect(chiusuraNormale.status).toBe(200);

    const totaleDopo = await request(app).get(`/api/soggiorni/${soggiornoTestId}/addebiti`).set(authHeader.titolare());
    expect(totaleDopo.body.totale).toBeCloseTo(totalePrima.body.totale + 20, 2); // 2 x 10.00
  });
});
