// Test suite — Modulo 6.1: Registro HACCP (temperature su anagrafica
// apparecchiature, scongelamento/cottura, impostazioni HACCP).
// Ricostruita il 16/08/2026: registro_temperature è passato da
// punto_controllo (stringa fissa) ad apparecchiatura_id (anagrafica reale,
// vedi migration 041/042) — i test NON usano più le apparecchiature seedate
// in produzione (frigo/freezer reali del titolare), creano le proprie
// (prefisso ZZZ_TEST_) per restare isolati e deterministici indipendentemente
// da quante apparecchiature reali esistano o vengano aggiunte in futuro.
//
// DATA_TEST dedicata (2026-12-16), diversa da DATA_HACCP_TEST di hr.test.js
// (2026-12-15) per non condividere fixture tra le due suite.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader, creaToken } = require('../helpers/auth');
const { creaUtenteDiTest, pulisciDatiTest, chiudiPool, getPool } = require('../helpers/db');

const DATA_TEST = '2026-12-16';

let utenteTest, tokenCuoco, tokenTitolare;
let categoriaId, piattoId;
let frigoTestId, freezerTestId;

beforeAll(async () => {
  utenteTest = await creaUtenteDiTest({
    email: `registro_haccp_${Date.now()}@test.hotel`,
    ruolo: 'cuoco',
  });
  // Stesso id reale (necessario per l'INSERT, che referenzia users(id) con
  // ON DELETE RESTRICT), token diversi per simulare ruoli diversi — stesso
  // pattern già usato in hr.test.js per la checklist HACCP.
  tokenCuoco    = creaToken({ id: utenteTest.id, ruolo: 'cuoco',    email: utenteTest.email });
  tokenTitolare = creaToken({ id: utenteTest.id, ruolo: 'titolare', email: utenteTest.email });

  const db = getPool();
  const cat = await db.query(
    `INSERT INTO menu_categorie (titolo) VALUES ('ZZZ_TEST_Registro_Haccp') RETURNING id`
  );
  categoriaId = cat.rows[0].id;
  const piatto = await db.query(
    `INSERT INTO menu_piatti (categoria_id, nome) VALUES ($1, 'ZZZ_TEST_Branzino') RETURNING id`,
    [categoriaId]
  );
  piattoId = piatto.rows[0].id;

  // Apparecchiature di test dedicate — NON quelle reali seedate in
  // migration 041, per non dipendere da quante ce ne sono in produzione o
  // da modifiche future fatte dal titolare in /impostazioni/haccp.
  const frigo = await db.query(
    `INSERT INTO apparecchiature_haccp (nome, tipo, ubicazione) VALUES ('ZZZ_TEST_Frigo', 'frigo', 'Test') RETURNING id`
  );
  frigoTestId = frigo.rows[0].id;
  const freezer = await db.query(
    `INSERT INTO apparecchiature_haccp (nome, tipo, ubicazione) VALUES ('ZZZ_TEST_Freezer', 'freezer', 'Test') RETURNING id`
  );
  freezerTestId = freezer.rows[0].id;
});

afterAll(async () => {
  const db = getPool();
  await db.query('DELETE FROM registro_temperature WHERE data = $1', [DATA_TEST]);
  await db.query('DELETE FROM registro_cottura WHERE data = $1', [DATA_TEST]);
  await db.query('DELETE FROM registro_ricevimento_merci WHERE data = $1', [DATA_TEST]);
  await db.query('DELETE FROM registro_buffet WHERE data = $1', [DATA_TEST]);
  await db.query('DELETE FROM registro_manutenzioni WHERE data = $1', [DATA_TEST]);
  await db.query('DELETE FROM registro_formazione WHERE data = $1', [DATA_TEST]);
  await db.query('DELETE FROM registro_infestanti WHERE data = $1', [DATA_TEST]);
  await db.query('DELETE FROM apparecchiature_haccp WHERE id IN ($1, $2)', [frigoTestId, freezerTestId]);
  await db.query('DELETE FROM menu_piatti WHERE id = $1', [piattoId]);
  await db.query('DELETE FROM menu_categorie WHERE id = $1', [categoriaId]);
  // Il blocco "Impostazioni HACCP" valorizza configurazione_moduli_haccp.
  // aggiornato_da con l'utente di test (PUT modulo) ma lo ripristina solo su
  // attivo — senza questo azzeramento, pulisciDatiTest() fallisce sul
  // vincolo configurazione_moduli_haccp_aggiornato_da_fkey quando prova a
  // cancellare l'utente @test.hotel. Diagnosticato dal titolare il 16/08/2026.
  await db.query('UPDATE configurazione_moduli_haccp SET aggiornato_da = NULL WHERE aggiornato_da = $1', [utenteTest.id]);
  await pulisciDatiTest();
  await chiudiPool();
});

// ─── Temperature ────────────────────────────────────────────────────────────

describe('Registro temperature (/api/registro-haccp/temperature)', () => {
  test('GET senza token → 401', async () => {
    const res = await request(app).get('/api/registro-haccp/temperature');
    expect(res.status).toBe(401);
  });

  test('GET receptionist → 403 (stessa sezione haccp della checklist: solo admin/titolare/cuoco)', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/temperature?data=${DATA_TEST}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('GET senza rilevazioni oggi → la mia apparecchiatura di test è tra i puntiMancanti', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/temperature?data=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);
    expect(res.body.letture).toEqual([]);
    expect(res.body.puntiMancanti.some(a => a.id === frigoTestId)).toBe(true);
    expect(res.body.apparecchiature.some(a => a.id === frigoTestId)).toBe(true);
  });

  test('POST senza apparecchiatura_id/valore → 400', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/temperature')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ data: DATA_TEST });
    expect(res.status).toBe(400);
  });

  test('POST receptionist → 403', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/temperature')
      .set(authHeader.receptionist())
      .send({ apparecchiatura_id: frigoTestId, valore: 3.5, data: DATA_TEST });
    expect(res.status).toBe(403);
  });

  let idTemperaturaCreata;

  test('POST valido su frigo (cuoco), dentro soglia (0/+4°C) → 201, fuoriSoglia false', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/temperature')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ apparecchiatura_id: frigoTestId, valore: 3.5, data: DATA_TEST, note: 'Controllo di test' });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.temperatura.valore)).toBe(3.5);
    expect(res.body.temperatura.user_id).toBe(utenteTest.id);
    // Soglie frigo/freezer confermate dal titolare il 16/08/2026 (CSV
    // allegato) — 3.5°C è dentro la soglia frigo (≤ +4°C).
    expect(res.body.temperatura.fuoriSoglia).toBe(false);
    idTemperaturaCreata = res.body.temperatura.id;
  });

  test('POST valido su frigo, FUORI soglia (8°C > 4°C) → fuoriSoglia true', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/temperature')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ apparecchiatura_id: frigoTestId, valore: 8, data: DATA_TEST, azione_correttiva: 'Prodotti spostati in altro frigo' });
    expect(res.status).toBe(201);
    expect(res.body.temperatura.fuoriSoglia).toBe(true);
    // Ripristino la riga "dentro soglia" per non alterare gli altri test:
    await request(app).delete(`/api/registro-haccp/temperature/${res.body.temperatura.id}`).set({ Authorization: `Bearer ${tokenCuoco}` });
  });

  test('POST su apparecchiatura inesistente → 404', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/temperature')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ apparecchiatura_id: 999999, valore: 3, data: DATA_TEST });
    expect(res.status).toBe(404);
  });

  test('GET dopo l\'inserimento → la rilevazione compare e il frigo esce da puntiMancanti', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/temperature?data=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);
    expect(res.body.letture.some(l => l.id === idTemperaturaCreata && l.apparecchio_nome === 'ZZZ_TEST_Frigo')).toBe(true);
    expect(res.body.puntiMancanti.some(a => a.id === frigoTestId)).toBe(false);
    expect(res.body.puntiMancanti.some(a => a.id === freezerTestId)).toBe(true);
  });

  test('DELETE rimuove la rilevazione', async () => {
    const res = await request(app)
      .delete(`/api/registro-haccp/temperature/${idTemperaturaCreata}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);

    const verifica = await request(app)
      .get(`/api/registro-haccp/temperature?data=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(verifica.body.letture.find(l => l.id === idTemperaturaCreata)).toBeUndefined();
  });

  test('GET storico — cuoco → 403 (riservato al titolare, coerente con la checklist)', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/temperature/storico?da=${DATA_TEST}&a=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(403);
  });

  test('GET storico (titolare) → include le rilevazioni del periodo, con nome apparecchio', async () => {
    await request(app)
      .post('/api/registro-haccp/temperature')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ apparecchiatura_id: freezerTestId, valore: -20, data: DATA_TEST });

    const res = await request(app)
      .get(`/api/registro-haccp/temperature/storico?da=${DATA_TEST}&a=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenTitolare}` });
    expect(res.status).toBe(200);
    const riga = res.body.storico.find(r => r.apparecchiatura_id === freezerTestId);
    expect(riga).toBeDefined();
    expect(riga.apparecchio_nome).toBe('ZZZ_TEST_Freezer');
    expect(riga.fuoriSoglia).toBe(false); // -20°C è dentro la soglia freezer (≤ -18°C)
  });
});

// ─── Scongelamento / cottura ────────────────────────────────────────────────

describe('Registro cottura (/api/registro-haccp/cottura)', () => {
  test('GET senza token → 401', async () => {
    const res = await request(app).get('/api/registro-haccp/cottura');
    expect(res.status).toBe(401);
  });

  test('POST tipo mancante → 400', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/cottura')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ prodotto: 'Branzino', data: DATA_TEST });
    expect(res.status).toBe(400);
  });

  test("POST tipo non valido ('scottatura') → 400", async () => {
    const res = await request(app)
      .post('/api/registro-haccp/cottura')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ tipo: 'scottatura', prodotto: 'Branzino', data: DATA_TEST });
    expect(res.status).toBe(400);
  });

  test('POST prodotto mancante → 400', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/cottura')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ tipo: 'cottura', data: DATA_TEST });
    expect(res.status).toBe(400);
  });

  let idCotturaCreata;

  test('POST valido con piatto collegato (cuoco) → 201', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/cottura')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({
        tipo: 'cottura',
        prodotto: 'Filetto di branzino',
        menu_piatto_id: piattoId,
        metodo: 'forno',
        temperatura_cuore: 74.5,
        data: DATA_TEST,
      });
    expect(res.status).toBe(201);
    expect(res.body.registrazione.menu_piatto_id).toBe(piattoId);
    idCotturaCreata = res.body.registrazione.id;
  });

  test('GET del giorno → mostra il nome del piatto collegato (JOIN menu_piatti)', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/cottura?data=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);
    const riga = res.body.registrazioni.find(r => r.id === idCotturaCreata);
    expect(riga).toBeDefined();
    expect(riga.piatto_nome).toBe('ZZZ_TEST_Branzino');
  });

  test('POST valido senza piatto collegato (scongelamento) → 201, piatto_nome assente', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/cottura')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ tipo: 'scongelamento', prodotto: 'Gamberi surgelati', metodo: 'frigo', data: DATA_TEST });
    expect(res.status).toBe(201);
    expect(res.body.registrazione.menu_piatto_id).toBeNull();

    const verifica = await request(app)
      .get(`/api/registro-haccp/cottura?data=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    const riga = verifica.body.registrazioni.find(r => r.id === res.body.registrazione.id);
    expect(riga.piatto_nome).toBeNull();
  });

  test('DELETE rimuove la registrazione', async () => {
    const res = await request(app)
      .delete(`/api/registro-haccp/cottura/${idCotturaCreata}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);

    const verifica = await request(app)
      .get(`/api/registro-haccp/cottura?data=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(verifica.body.registrazioni.find(r => r.id === idCotturaCreata)).toBeUndefined();
  });
});

// ─── A.1 — Ricevimento merci (sessione 2, 16/08/2026) ──────────────────────

describe('Registro ricevimento merci (/api/registro-haccp/ricevimento)', () => {
  test('GET senza token → 401', async () => {
    const res = await request(app).get('/api/registro-haccp/ricevimento');
    expect(res.status).toBe(401);
  });

  test('POST fornitore/prodotto mancanti → 400', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/ricevimento')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ esito: 'conforme', data: DATA_TEST });
    expect(res.status).toBe(400);
  });

  test('POST esito mancante → 400', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/ricevimento')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ fornitore: 'ZZZ_TEST_Fornitore', prodotto: 'Latte', data: DATA_TEST });
    expect(res.status).toBe(400);
  });

  let idRicevimentoCreato;

  test('POST valido (cuoco) → 201', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/ricevimento')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({
        fornitore: 'ZZZ_TEST_Fornitore', prodotto: 'Latte fresco', lotto: 'L123',
        quantita: 10, unita_misura: 'l', temp_ricevimento: 3.5,
        integrita_confezione: 'integra', esito: 'conforme', data: DATA_TEST,
      });
    expect(res.status).toBe(201);
    expect(res.body.ricevimento.user_id).toBe(utenteTest.id);
    expect(res.body.ricevimento.esito).toBe('conforme');
    idRicevimentoCreato = res.body.ricevimento.id;
  });

  test('GET del giorno → include il ricevimento appena creato con nome operatore', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/ricevimento?data=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);
    const riga = res.body.ricevimenti.find(r => r.id === idRicevimentoCreato);
    expect(riga).toBeDefined();
    expect(riga.operatore_nome).toBe(utenteTest.nome);
  });

  test('DELETE rimuove la registrazione', async () => {
    const res = await request(app)
      .delete(`/api/registro-haccp/ricevimento/${idRicevimentoCreato}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);

    const verifica = await request(app)
      .get(`/api/registro-haccp/ricevimento?data=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(verifica.body.ricevimenti.find(r => r.id === idRicevimentoCreato)).toBeUndefined();
  });

  test('GET storico — cuoco → 403 (riservato al titolare)', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/ricevimento/storico?da=${DATA_TEST}&a=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(403);
  });
});

// ─── A.4 — Buffet (sessione 2, 16/08/2026) ─────────────────────────────────
// Modulo "in forse": i test forzano il modulo attivo prima di partire e
// ripristinano lo stato originale alla fine, per non dipendere da come il
// titolare l'ha lasciato in produzione né interferire col blocco
// "Impostazioni HACCP" più sotto (che lo spegne/riaccende a sua volta, ma
// dopo, quindi senza sovrapposizione).
describe('Registro buffet (/api/registro-haccp/buffet)', () => {
  let statoOriginaleBuffet;

  beforeAll(async () => {
    const db = getPool();
    const r = await db.query(`SELECT attivo FROM configurazione_moduli_haccp WHERE modulo = 'buffet'`);
    statoOriginaleBuffet = r.rows[0]?.attivo ?? true;
    if (!statoOriginaleBuffet) {
      await db.query(`UPDATE configurazione_moduli_haccp SET attivo = true WHERE modulo = 'buffet'`);
    }
  });

  afterAll(async () => {
    const db = getPool();
    await db.query(`UPDATE configurazione_moduli_haccp SET attivo = $1 WHERE modulo = 'buffet'`, [statoOriginaleBuffet]);
  });

  test('GET senza token → 401', async () => {
    const res = await request(app).get('/api/registro-haccp/buffet');
    expect(res.status).toBe(401);
  });

  test("POST tipologia_buffet non valida → 400", async () => {
    const res = await request(app)
      .post('/api/registro-haccp/buffet')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ tipologia_buffet: 'tiepido', prodotto_vaschetta: 'Yogurt', temp_rilevata: 4, data: DATA_TEST });
    expect(res.status).toBe(400);
  });

  let idBuffetCreato;

  test('POST buffet freddo dentro soglia (4°C ≤ 5°C) → 201, fuoriSoglia false', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/buffet')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ tipologia_buffet: 'freddo', prodotto_vaschetta: 'ZZZ_TEST_Yogurt', temp_rilevata: 4, data: DATA_TEST });
    expect(res.status).toBe(201);
    expect(res.body.rilevazione.fuoriSoglia).toBe(false);
    idBuffetCreato = res.body.rilevazione.id;
  });

  test('POST buffet caldo FUORI soglia (55°C < 60°C) → fuoriSoglia true', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/buffet')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ tipologia_buffet: 'caldo', prodotto_vaschetta: 'ZZZ_TEST_Sugo', temp_rilevata: 55, data: DATA_TEST, azione_correttiva: 'Piastra riaccesa' });
    expect(res.status).toBe(201);
    expect(res.body.rilevazione.fuoriSoglia).toBe(true);
    await request(app).delete(`/api/registro-haccp/buffet/${res.body.rilevazione.id}`).set({ Authorization: `Bearer ${tokenCuoco}` });
  });

  test('GET del giorno → include la rilevazione con fuoriSoglia calcolato', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/buffet?data=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);
    const riga = res.body.rilevazioni.find(r => r.id === idBuffetCreato);
    expect(riga).toBeDefined();
    expect(riga.fuoriSoglia).toBe(false);
  });

  test('DELETE rimuove la rilevazione', async () => {
    const res = await request(app)
      .delete(`/api/registro-haccp/buffet/${idBuffetCreato}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);
  });

  test('POST con modulo buffet spento → 403', async () => {
    const db = getPool();
    await db.query(`UPDATE configurazione_moduli_haccp SET attivo = false WHERE modulo = 'buffet'`);
    const res = await request(app)
      .post('/api/registro-haccp/buffet')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ tipologia_buffet: 'freddo', prodotto_vaschetta: 'ZZZ_TEST_Burro', temp_rilevata: 3, data: DATA_TEST });
    expect(res.status).toBe(403);
    await db.query(`UPDATE configurazione_moduli_haccp SET attivo = true WHERE modulo = 'buffet'`);
  });
});

// ─── A.6 — Manutenzioni programmate (sessione 3, 16/08/2026) ───────────────
// Stesso principio del blocco Buffet sopra: forza il modulo attivo prima di
// partire, ripristina lo stato originale alla fine. Riusa frigoTestId
// (apparecchiatura di test già creata in beforeAll) invece di crearne una
// terza — nessun bisogno di un'anagrafica dedicata diversa da quella già
// usata per il tab Temperature.
describe('Registro manutenzioni (/api/registro-haccp/manutenzioni)', () => {
  let statoOriginaleManutenzioni;

  beforeAll(async () => {
    const db = getPool();
    const r = await db.query(`SELECT attivo FROM configurazione_moduli_haccp WHERE modulo = 'manutenzioni_programmate'`);
    statoOriginaleManutenzioni = r.rows[0]?.attivo ?? true;
    if (!statoOriginaleManutenzioni) {
      await db.query(`UPDATE configurazione_moduli_haccp SET attivo = true WHERE modulo = 'manutenzioni_programmate'`);
    }
  });

  afterAll(async () => {
    const db = getPool();
    await db.query(`UPDATE configurazione_moduli_haccp SET attivo = $1 WHERE modulo = 'manutenzioni_programmate'`, [statoOriginaleManutenzioni]);
  });

  test('GET senza token → 401', async () => {
    const res = await request(app).get('/api/registro-haccp/manutenzioni');
    expect(res.status).toBe(401);
  });

  test('POST apparecchiatura_id mancante → 400', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/manutenzioni')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ esito: 'eseguita', data: DATA_TEST });
    expect(res.status).toBe(400);
  });

  test('POST esito non valido → 400', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/manutenzioni')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ apparecchiatura_id: frigoTestId, esito: 'boh', data: DATA_TEST });
    expect(res.status).toBe(400);
  });

  test('POST su apparecchiatura inesistente → 404', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/manutenzioni')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ apparecchiatura_id: 999999, esito: 'eseguita', data: DATA_TEST });
    expect(res.status).toBe(404);
  });

  let idManutenzioneCreata;

  test('POST valida (cuoco) → 201', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/manutenzioni')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({
        apparecchiatura_id: frigoTestId, tipo_intervento: 'ordinaria',
        ditta_operatore: 'ZZZ_TEST_Ditta', esito: 'eseguita', data: DATA_TEST,
      });
    expect(res.status).toBe(201);
    expect(res.body.manutenzione.user_id).toBe(utenteTest.id);
    idManutenzioneCreata = res.body.manutenzione.id;
  });

  test('GET del giorno → include l\'intervento con nome apparecchio', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/manutenzioni?data=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);
    const riga = res.body.manutenzioni.find(m => m.id === idManutenzioneCreata);
    expect(riga).toBeDefined();
    expect(riga.apparecchio_nome).toBe('ZZZ_TEST_Frigo');
  });

  test('DELETE rimuove la registrazione', async () => {
    const res = await request(app)
      .delete(`/api/registro-haccp/manutenzioni/${idManutenzioneCreata}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);
  });

  test('POST con modulo manutenzioni spento → 403', async () => {
    const db = getPool();
    await db.query(`UPDATE configurazione_moduli_haccp SET attivo = false WHERE modulo = 'manutenzioni_programmate'`);
    const res = await request(app)
      .post('/api/registro-haccp/manutenzioni')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ apparecchiatura_id: frigoTestId, esito: 'eseguita', data: DATA_TEST });
    expect(res.status).toBe(403);
    await db.query(`UPDATE configurazione_moduli_haccp SET attivo = true WHERE modulo = 'manutenzioni_programmate'`);
  });

  test('GET storico — cuoco → 403 (riservato al titolare)', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/manutenzioni/storico?da=${DATA_TEST}&a=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(403);
  });
});

// ─── A.7 — Formazione (sessione 3, 16/08/2026) ─────────────────────────────

describe('Registro formazione (/api/registro-haccp/formazione)', () => {
  test('GET senza token → 401', async () => {
    const res = await request(app).get('/api/registro-haccp/formazione');
    expect(res.status).toBe(401);
  });

  test('POST nome_cognome/titolo_corso mancanti → 400', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/formazione')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ data: DATA_TEST });
    expect(res.status).toBe(400);
  });

  let idFormazioneCreata;

  test('POST valida (cuoco) → 201, attestato/firma di default false', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/formazione')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ nome_cognome: 'ZZZ_TEST_Dipendente', titolo_corso: 'Corso HACCP base', data: DATA_TEST });
    expect(res.status).toBe(201);
    expect(res.body.formazione.attestato).toBe(false);
    expect(res.body.formazione.firma_partecipante).toBe(false);
    idFormazioneCreata = res.body.formazione.id;
  });

  test('GET del giorno → include la formazione appena creata', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/formazione?data=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);
    expect(res.body.formazioni.some(f => f.id === idFormazioneCreata)).toBe(true);
  });

  test('DELETE rimuove la registrazione', async () => {
    const res = await request(app)
      .delete(`/api/registro-haccp/formazione/${idFormazioneCreata}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);
  });

  test('GET storico — cuoco → 403 (riservato al titolare)', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/formazione/storico?da=${DATA_TEST}&a=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(403);
  });
});

// ─── A.8 — Controllo infestanti (sessione 3, 16/08/2026) ───────────────────

describe('Registro infestanti (/api/registro-haccp/infestanti)', () => {
  test('GET senza token → 401', async () => {
    const res = await request(app).get('/api/registro-haccp/infestanti');
    expect(res.status).toBe(401);
  });

  test('POST esito mancante → 400', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/infestanti')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({ tipo_controllo: 'ispezione visiva', data: DATA_TEST });
    expect(res.status).toBe(400);
  });

  let idInfestantiCreato;

  test('POST valido (cuoco) → 201', async () => {
    const res = await request(app)
      .post('/api/registro-haccp/infestanti')
      .set({ Authorization: `Bearer ${tokenCuoco}` })
      .send({
        tipo_controllo: 'ispezione visiva', punti_controllati: 'ZZZ_TEST_Cucina',
        esito: 'nessuna_traccia', data: DATA_TEST,
      });
    expect(res.status).toBe(201);
    expect(res.body.controllo.user_id).toBe(utenteTest.id);
    idInfestantiCreato = res.body.controllo.id;
  });

  test('GET del giorno → include il controllo appena creato', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/infestanti?data=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);
    expect(res.body.controlli.some(c => c.id === idInfestantiCreato)).toBe(true);
  });

  test('DELETE rimuove la registrazione', async () => {
    const res = await request(app)
      .delete(`/api/registro-haccp/infestanti/${idInfestantiCreato}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(200);
  });

  test('GET storico — cuoco → 403 (riservato al titolare)', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/infestanti/storico?da=${DATA_TEST}&a=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(403);
  });
});

// ─── Export registri (sessione 4, 16/08/2026) ──────────────────────────────
// Una riga di fixture per registro, inserita direttamente in DB (bypassa le
// API, più veloce/diretto per un test che verifica solo la FORMA
// dell'export, non la logica di scrittura già coperta sopra). Tutte le
// tabelle sono già ripulite per DATA_TEST nell'afterAll globale in cima al
// file — nessun cleanup duplicato qui.
describe('Export registri HACCP (/api/registro-haccp/export)', () => {
  beforeAll(async () => {
    const db = getPool();
    await db.query(
      `INSERT INTO registro_ricevimento_merci (fornitore, prodotto, esito, data, user_id)
       VALUES ('ZZZ_TEST_Fornitore', 'ZZZ_TEST_Prodotto', 'conforme', $1, $2)`,
      [DATA_TEST, utenteTest.id]
    );
    await db.query(
      `INSERT INTO registro_temperature (apparecchiatura_id, valore, data, user_id)
       VALUES ($1, 3.0, $2, $3)`,
      [frigoTestId, DATA_TEST, utenteTest.id]
    );
    await db.query(
      `INSERT INTO registro_cottura (tipo, prodotto, temperatura_cuore, limite_critico, tempo_cottura_min, data, user_id)
       VALUES ('cottura', 'ZZZ_TEST_Pollo', 75, '>= 74°C', 20, $1, $2)`,
      [DATA_TEST, utenteTest.id]
    );
    await db.query(
      `INSERT INTO registro_buffet (tipologia_buffet, prodotto_vaschetta, temp_rilevata, data, user_id)
       VALUES ('freddo', 'ZZZ_TEST_Yogurt', 4, $1, $2)`,
      [DATA_TEST, utenteTest.id]
    );
    await db.query(
      `INSERT INTO haccp_checklist (attrezzatura, user_id, data, completata, prodotto_utilizzato)
       VALUES ('ZZZ_TEST_Banco', $1, $2, true, 'ZZZ_TEST_Detergente')`,
      [utenteTest.id, DATA_TEST]
    );
    await db.query(
      `INSERT INTO registro_manutenzioni (apparecchiatura_id, esito, data, user_id)
       VALUES ($1, 'eseguita', $2, $3)`,
      [frigoTestId, DATA_TEST, utenteTest.id]
    );
    await db.query(
      `INSERT INTO registro_formazione (nome_cognome, titolo_corso, data, user_id)
       VALUES ('ZZZ_TEST_Dipendente', 'ZZZ_TEST_Corso', $1, $2)`,
      [DATA_TEST, utenteTest.id]
    );
    await db.query(
      `INSERT INTO registro_infestanti (esito, data, user_id)
       VALUES ('nessuna_traccia', $1, $2)`,
      [DATA_TEST, utenteTest.id]
    );
  });

  // Senza questa pulizia, la rilevazione di registro_temperature su
  // frigoTestId e la riga di haccp_checklist restano su DATA_TEST dopo
  // questo describe: la prima falsa i test di alertRegistroTemperature
  // sotto (il frigo di test risulterebbe già rilevato), la seconda fa
  // fallire la afterAll di livello suite sul vincolo
  // haccp_checklist_user_id_fkey quando prova a cancellare l'utente di test.
  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM registro_ricevimento_merci WHERE data = $1', [DATA_TEST]);
    await db.query('DELETE FROM registro_temperature WHERE data = $1', [DATA_TEST]);
    await db.query('DELETE FROM registro_cottura WHERE data = $1', [DATA_TEST]);
    await db.query('DELETE FROM registro_buffet WHERE data = $1', [DATA_TEST]);
    await db.query('DELETE FROM haccp_checklist WHERE data = $1', [DATA_TEST]);
    await db.query('DELETE FROM registro_manutenzioni WHERE data = $1', [DATA_TEST]);
    await db.query('DELETE FROM registro_formazione WHERE data = $1', [DATA_TEST]);
    await db.query('DELETE FROM registro_infestanti WHERE data = $1', [DATA_TEST]);
  });

  test('GET dati registro senza token → 401', async () => {
    const res = await request(app).get('/api/registro-haccp/export/A1_Ricevimento_merci/dati');
    expect(res.status).toBe(401);
  });

  test('GET dati registro, cuoco → 403 (export riservato al titolare)', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/export/A1_Ricevimento_merci/dati?da=${DATA_TEST}&a=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(403);
  });

  test('GET dati su chiave registro inesistente → 404', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/export/registro_inventato/dati?da=${DATA_TEST}&a=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenTitolare}` });
    expect(res.status).toBe(404);
  });

  // Un caso per registro: verifica che le intestazioni siano ESATTAMENTE
  // quelle del template (non una traduzione/abbellimento) e che la riga di
  // fixture compaia con i valori attesi nella colonna giusta.
  const CASI = [
    {
      registro: 'A1_Ricevimento_merci',
      headers: ['id_riga', 'data', 'fornitore', 'prodotto', 'lotto', 'scadenza_tmc', 'quantita', 'unita_misura', 'temp_ricevimento', 'integrita_confezione', 'esito', 'azione_correttiva', 'operatore', 'note'],
      trovaRiga: righe => righe.find(r => r[2] === 'ZZZ_TEST_Fornitore'),
      verificaRiga: riga => expect(riga[3]).toBe('ZZZ_TEST_Prodotto'),
    },
    {
      registro: 'A2_Temp_frigo_freezer',
      headers: ['id_riga', 'data', 'ora', 'apparecchio', 'tipo_apparecchio', 'ubicazione', 'temp_rilevata', 'limite_critico', 'esito', 'azione_correttiva', 'operatore', 'note'],
      trovaRiga: righe => righe.find(r => r[3] === 'ZZZ_TEST_Frigo'),
      verificaRiga: riga => { expect(riga[6]).toBe(3); expect(riga[8]).toBe('Conforme'); },
    },
    {
      registro: 'A3_Temp_cottura',
      headers: ['id_riga', 'data', 'prodotto', 'lotto_partita', 'temp_cuore_rilevata', 'limite_critico', 'tempo_cottura_min', 'esito', 'azione_correttiva', 'operatore', 'note'],
      trovaRiga: righe => righe.find(r => r[2] === 'ZZZ_TEST_Pollo'),
      verificaRiga: riga => { expect(riga[4]).toBe(75); expect(riga[5]).toBe('>= 74°C'); expect(riga[6]).toBe(20); },
    },
    {
      registro: 'A4_Temp_buffet',
      headers: ['id_riga', 'data', 'ora', 'tipologia_buffet', 'prodotto_vaschetta', 'temp_rilevata', 'limite_critico', 'esito', 'azione_correttiva', 'operatore', 'note'],
      trovaRiga: righe => righe.find(r => r[4] === 'ZZZ_TEST_Yogurt'),
      verificaRiga: riga => { expect(riga[6]).toBe('≤ +5°C'); expect(riga[7]).toBe('Conforme'); },
    },
    {
      registro: 'A5_Pulizie',
      headers: ['id_riga', 'data', 'ora', 'area_attrezzatura', 'operatore', 'prodotto_utilizzato', 'dosaggio', 'tempo_contatto_min', 'esito', 'firma_operatore', 'firma_responsabile', 'note'],
      trovaRiga: righe => righe.find(r => r[3] === 'ZZZ_TEST_Banco'),
      verificaRiga: riga => { expect(riga[5]).toBe('ZZZ_TEST_Detergente'); expect(riga[8]).toBe('Eseguita'); },
    },
    {
      registro: 'A6_Manutenzioni',
      headers: ['id_riga', 'data', 'attrezzatura', 'ubicazione', 'tipo_intervento', 'descrizione_intervento', 'ditta_operatore', 'pezzi_sostituiti', 'esito', 'prossima_manutenzione', 'firma_responsabile', 'note'],
      trovaRiga: righe => righe.find(r => r[2] === 'ZZZ_TEST_Frigo'),
      verificaRiga: riga => expect(riga[8]).toBe('Eseguita'),
    },
    {
      registro: 'A7_Formazione',
      headers: ['id_riga', 'data', 'nome_cognome', 'qualifica_ruolo', 'titolo_corso', 'durata_ore', 'contenuti', 'docente_ente', 'attestato', 'numero_attestato', 'firma_partecipante', 'note'],
      trovaRiga: righe => righe.find(r => r[2] === 'ZZZ_TEST_Dipendente'),
      verificaRiga: riga => { expect(riga[4]).toBe('ZZZ_TEST_Corso'); expect(riga[8]).toBe('No'); },
    },
    {
      registro: 'A8_Infestanti',
      headers: ['id_riga', 'data', 'tipo_controllo', 'punti_controllati', 'esito', 'azioni_effettuate', 'prossimo_controllo', 'firma_operatore', 'firma_responsabile', 'note'],
      trovaRiga: righe => righe.find(r => r[4] === 'Nessuna traccia'),
      verificaRiga: riga => expect(riga).toBeDefined(),
    },
  ];

  test.each(CASI)('$registro — intestazioni esatte e riga di fixture presente', async ({ registro, headers, trovaRiga, verificaRiga }) => {
    const res = await request(app)
      .get(`/api/registro-haccp/export/${registro}/dati?da=${DATA_TEST}&a=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenTitolare}` });
    expect(res.status).toBe(200);
    expect(res.body.headers).toEqual(headers);
    const riga = trovaRiga(res.body.righe);
    expect(riga).toBeDefined();
    verificaRiga(riga);
  });

  test('GET Excel singolo registro → 200, content-type xlsx', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/export/A1_Ricevimento_merci/excel?da=${DATA_TEST}&a=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenTitolare}` });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });

  test('GET dati omnicomprensivo → 200, tutti gli 8 registri presenti nell\'ordine A1→A8', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/export/omnicomprensivo/dati?da=${DATA_TEST}&a=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenTitolare}` });
    expect(res.status).toBe(200);
    expect(res.body.registri.map(r => r.registro)).toEqual(CASI.map(c => c.registro));
  });

  test('GET Excel omnicomprensivo → 200, content-type xlsx', async () => {
    const res = await request(app)
      .get(`/api/registro-haccp/export/omnicomprensivo/excel?da=${DATA_TEST}&a=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenTitolare}` });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });

  test('GET omnicomprensivo/dati NON viene intercettato dalla rotta generica /export/:registro/dati', async () => {
    // Guardia di regressione: le rotte omnicomprensivo sono registrate PRIMA
    // di quella generica in routes/registroHaccp.js apposta per questo.
    const res = await request(app)
      .get(`/api/registro-haccp/export/omnicomprensivo/dati?da=${DATA_TEST}&a=${DATA_TEST}`)
      .set({ Authorization: `Bearer ${tokenTitolare}` });
    expect(res.body.registri).toBeDefined();
    expect(res.body.headers).toBeUndefined();
  });
});

// ─── alertRegistroTemperature — dashboard (modulo 6.1 punto 1) ─────────────
// Riscritto 16/08/2026: l'alert ora considera TUTTE le apparecchiature
// attive di tipo frigo/freezer/abbattitore, comprese quelle reali seedate in
// produzione (migration 041) — impossibile assumere un totale fisso. I test
// filtrano gli alert sulla PROPRIA apparecchiatura di test (per nome) invece
// di contare il totale, così restano validi indipendentemente da quante
// apparecchiature reali esistono.
describe('alertRegistroTemperature (dashboard, modulo 6.1 punto 1)', () => {
  const { alertRegistroTemperature } = require('../../backend/controllers/dashboardController');

  test('la mia apparecchiatura di test, ora 10 (mattina) → nessun alert per lei', async () => {
    const alerts = await alertRegistroTemperature({ data: DATA_TEST, oraCorrente: 10 });
    expect(alerts.find(a => a.text.includes('ZZZ_TEST_Frigo'))).toBeUndefined();
  });

  test('la mia apparecchiatura di test, non rilevata, ora 16 → alert ambra per lei', async () => {
    const alerts = await alertRegistroTemperature({ data: DATA_TEST, oraCorrente: 16 });
    const mio = alerts.find(a => a.text.includes('ZZZ_TEST_Frigo'));
    expect(mio).toBeDefined();
    expect(mio.type).toBe('amber');
    expect(mio.category).toBe('HACCP · Temperature');
  });

  test('la mia apparecchiatura di test, non rilevata, ora 23 → alert rosso per lei', async () => {
    const alerts = await alertRegistroTemperature({ data: DATA_TEST, oraCorrente: 23 });
    const mio = alerts.find(a => a.text.includes('ZZZ_TEST_Frigo'));
    expect(mio).toBeDefined();
    expect(mio.type).toBe('red');
  });

  test('rilevata dentro soglia → esce dagli alert "non rilevato" e non genera "fuori soglia"', async () => {
    const db = getPool();
    await db.query(
      `INSERT INTO registro_temperature (apparecchiatura_id, valore, data, user_id) VALUES ($1, $2, $3, $4)`,
      [frigoTestId, 3.0, DATA_TEST, utenteTest.id]
    );

    const alerts = await alertRegistroTemperature({ data: DATA_TEST, oraCorrente: 23 });
    expect(alerts.find(a => a.text.includes('ZZZ_TEST_Frigo') && a.text.includes('nessuna rilevazione'))).toBeUndefined();
    expect(alerts.find(a => a.text.includes('ZZZ_TEST_Frigo') && a.text.includes('fuori soglia'))).toBeUndefined();

    await db.query('DELETE FROM registro_temperature WHERE apparecchiatura_id = $1 AND data = $2', [frigoTestId, DATA_TEST]);
  });

  test('rilevata FUORI soglia → alert rosso "fuori soglia", indipendente dall\'ora', async () => {
    const db = getPool();
    await db.query(
      `INSERT INTO registro_temperature (apparecchiatura_id, valore, data, user_id) VALUES ($1, $2, $3, $4)`,
      [frigoTestId, 9.5, DATA_TEST, utenteTest.id]
    );

    const alerts = await alertRegistroTemperature({ data: DATA_TEST, oraCorrente: 10 }); // mattina, ma fuori soglia è sempre urgente
    const mio = alerts.find(a => a.text.includes('ZZZ_TEST_Frigo') && a.text.includes('fuori soglia'));
    expect(mio).toBeDefined();
    expect(mio.type).toBe('red');

    await db.query('DELETE FROM registro_temperature WHERE apparecchiatura_id = $1 AND data = $2', [frigoTestId, DATA_TEST]);
  });

  test('senza override oraCorrente, la funzione resta utilizzabile da alert() in produzione (nessuna eccezione)', async () => {
    const alerts = await alertRegistroTemperature();
    expect(Array.isArray(alerts)).toBe(true);
  });
});

// ─── Impostazioni HACCP — apparecchiature + moduli (16/08/2026) ────────────
describe('Impostazioni HACCP (/api/impostazioni/haccp)', () => {
  test('GET apparecchiature senza token → 401', async () => {
    const res = await request(app).get('/api/impostazioni/haccp/apparecchiature');
    expect(res.status).toBe(401);
  });

  test('GET apparecchiature, cuoco → 403 (riservato al titolare, come le altre pagine Impostazioni)', async () => {
    const res = await request(app)
      .get('/api/impostazioni/haccp/apparecchiature')
      .set({ Authorization: `Bearer ${tokenCuoco}` });
    expect(res.status).toBe(403);
  });

  test('GET apparecchiature, titolare → 200, include la mia apparecchiatura di test', async () => {
    const res = await request(app)
      .get('/api/impostazioni/haccp/apparecchiature')
      .set({ Authorization: `Bearer ${tokenTitolare}` });
    expect(res.status).toBe(200);
    expect(res.body.apparecchiature.some(a => a.id === frigoTestId)).toBe(true);
  });

  test('POST apparecchiatura con tipo non valido → 400', async () => {
    const res = await request(app)
      .post('/api/impostazioni/haccp/apparecchiature')
      .set({ Authorization: `Bearer ${tokenTitolare}` })
      .send({ nome: 'ZZZ_TEST_Invalida', tipo: 'inventato' });
    expect(res.status).toBe(400);
  });

  let idNuovaApparecchiatura;

  test('POST apparecchiatura valida → 201, attiva di default', async () => {
    const res = await request(app)
      .post('/api/impostazioni/haccp/apparecchiature')
      .set({ Authorization: `Bearer ${tokenTitolare}` })
      .send({ nome: 'ZZZ_TEST_Cappa', tipo: 'cappa', ubicazione: 'Cucina test' });
    expect(res.status).toBe(201);
    expect(res.body.apparecchiatura.attivo).toBe(true);
    idNuovaApparecchiatura = res.body.apparecchiatura.id;
  });

  test('PUT disattiva apparecchiatura → attivo false, non più in solo_attive=true', async () => {
    const put = await request(app)
      .put(`/api/impostazioni/haccp/apparecchiature/${idNuovaApparecchiatura}`)
      .set({ Authorization: `Bearer ${tokenTitolare}` })
      .send({ attivo: false });
    expect(put.status).toBe(200);
    expect(put.body.apparecchiatura.attivo).toBe(false);

    const lista = await request(app)
      .get('/api/impostazioni/haccp/apparecchiature?solo_attive=true')
      .set({ Authorization: `Bearer ${tokenTitolare}` });
    expect(lista.body.apparecchiature.some(a => a.id === idNuovaApparecchiatura)).toBe(false);

    // pulizia
    await getPool().query('DELETE FROM apparecchiature_haccp WHERE id = $1', [idNuovaApparecchiatura]);
  });

  test('GET moduli → include buffet e manutenzioni_programmate (seed migration 041)', async () => {
    const res = await request(app)
      .get('/api/impostazioni/haccp/moduli')
      .set({ Authorization: `Bearer ${tokenTitolare}` });
    expect(res.status).toBe(200);
    expect(res.body.moduli.map(m => m.modulo)).toEqual(expect.arrayContaining(['buffet', 'manutenzioni_programmate']));
  });

  test('PUT modulo inesistente → 404', async () => {
    const res = await request(app)
      .put('/api/impostazioni/haccp/moduli/modulo_inventato')
      .set({ Authorization: `Bearer ${tokenTitolare}` })
      .send({ attivo: false });
    expect(res.status).toBe(404);
  });

  test('PUT modulo esistente → spegne e riaccende senza errori', async () => {
    const spegni = await request(app)
      .put('/api/impostazioni/haccp/moduli/buffet')
      .set({ Authorization: `Bearer ${tokenTitolare}` })
      .send({ attivo: false });
    expect(spegni.status).toBe(200);
    expect(spegni.body.modulo.attivo).toBe(false);

    // Ripristino esplicito: non lasciare un modulo reale spento per colpa dei test.
    const riaccendi = await request(app)
      .put('/api/impostazioni/haccp/moduli/buffet')
      .set({ Authorization: `Bearer ${tokenTitolare}` })
      .send({ attivo: true });
    expect(riaccendi.status).toBe(200);
    expect(riaccendi.body.modulo.attivo).toBe(true);
  });
});
