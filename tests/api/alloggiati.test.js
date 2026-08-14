// Test suite — Modulo 2.5 Fase 1b: tabelle di codifica Alloggiati Web.
// Copre: GET /api/alloggiati/codici, GET /api/alloggiati/stato,
//        POST /api/alloggiati/sincronizza.
// Estesa 13/08/2026 (Fase 2, invio automatico) con:
// GET /api/alloggiati/coda, eseguiInvioReale (retry-safety),
// jobs/invioAlloggiatiWeb.trovaSoggiorniDaInviare — la garanzia più
// importante testata qui è che canale_origine='test_interno' NON compaia
// MAI nella coda né nel job: senza questa garanzia il job notturno
// proverebbe a inviare come reali i soggiorni generati dagli script di
// test (creaPrenotazioneTestAlloggiati.js, seedPrenotazioniTest.js).
// Nota: sincronizzaTabelle chiama il servizio SOAP esterno WS_ALLOGGIATI —
// nei test NON si eseguono chiamate di rete reali (nessuna credenziale
// ALLOGGIATI_* impostata nell'ambiente di test). Si verifica solo il ramo
// "credenziali mancanti → 400", che è deterministico e non tocca la rete.
// codici/stato sono invece testati contro righe seminate direttamente in
// alloggiati_codici, senza passare da una sincronizzazione reale.

const request = require('supertest');

// Mock del client SOAP (Fase A, 13/08/2026) — serve solo al blocco
// "eseguiInvioReale — errore di rete" più sotto, per simulare un
// generaToken che fallisce senza toccare il servizio reale. Sicuro per
// tutti gli altri test di questo file: nessuno di loro arriva mai a
// chiamare generaToken/testSchedine/inviaSchedine, perché le credenziali
// ALLOGGIATI_* sono sempre vuote in backend/.env.test (per design, vedi
// commento in testa al file) — quindi si fermano prima, su
// credenzialiAlloggiati() che ritorna null. Sostituire qui il modulo
// invece di fare jest.isolateModules + require una seconda volta di
// alloggiatiController (che avrebbe ri-richiesto anche config/db.js,
// aprendo un secondo Pool Postgres mai chiuso — rischio concreto di far
// restare Jest appeso a fine suite).
jest.mock('../../backend/lib/alloggiatiSoapClient', () => ({
  generaToken: jest.fn(),
  testSchedine: jest.fn(),
  inviaSchedine: jest.fn(),
  scaricaTabella: jest.fn(),
  parseCsv: jest.fn(),
  autenticationTest: jest.fn(),
  scaricaRicevuta: jest.fn(),
}));

const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');
const alloggiatiSoapClient = require('../../backend/lib/alloggiatiSoapClient');

// Reset globale del mock dopo OGNI test di questo file (bug trovato dal
// titolare 13/08/2026): senza questo, un mockRejectedValueOnce/
// mockResolvedValueOnce impostato in un test ma non consumato — perché
// un'asserzione precedente nello stesso test falliva prima di arrivare
// alla chiamata — restava in coda e veniva consumato dalla chiamata
// generaToken/testSchedine di un test SUCCESSIVO, completamente estraneo,
// causando lì un crash che sembrava un bug diverso. jest.resetAllMocks()
// pulisce sia lo storico chiamate sia le implementazioni "Once" in coda,
// così ogni test riparte da una lavagna vuota indipendentemente da come è
// finito quello prima.
afterEach(() => {
  jest.resetAllMocks();
  // Stessa logica delle "Once" in coda ma per process.env: alcuni test
  // impostano ALLOGGIATI_UTENTE/PASSWORD/WSKEY finte e le cancellano a
  // fine test — se un'asserzione precedente falliva, quel delete non
  // veniva mai raggiunto, lasciando le credenziali finte attive per TUTTI
  // i test successivi (anche di altri file, --runInBand condivide lo
  // stesso processo). Qui la pulizia è incondizionata, non dipende da dove
  // il test si è fermato.
  delete process.env.ALLOGGIATI_UTENTE;
  delete process.env.ALLOGGIATI_PASSWORD;
  delete process.env.ALLOGGIATI_WSKEY;
  delete process.env.ALLOGGIATI_JOB_ATTIVO;
});

const TABELLA_TEST = `Test_Tabella_${Date.now()}`;
const CODICE_TEST = 'Z999';
const DESCRIZIONE_TEST = 'STATO DI PROVA PER TEST AUTOMATICI';

beforeAll(async () => {
  const db = getPool();
  await db.query(
    `INSERT INTO alloggiati_codici (tabella, codice, descrizione, dati_extra)
     VALUES ($1, $2, $3, $4)`,
    [TABELLA_TEST, CODICE_TEST, DESCRIZIONE_TEST, JSON.stringify({ codice: CODICE_TEST, descrizione: DESCRIZIONE_TEST })]
  );
});

afterAll(async () => {
  const db = getPool();
  await db.query('DELETE FROM alloggiati_codici WHERE tabella = $1', [TABELLA_TEST]);
  await chiudiPool();
});

// ─── GET /api/alloggiati/codici ─────────────────────────────────────────────

describe('GET /api/alloggiati/codici', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get(`/api/alloggiati/codici?tabella=${TABELLA_TEST}`);
    expect(res.status).toBe(401);
  });

  test('dipendente → 403 (sezione alloggiati non consentita)', async () => {
    const res = await request(app)
      .get(`/api/alloggiati/codici?tabella=${TABELLA_TEST}`)
      .set(authHeader.dipendente());
    expect(res.status).toBe(403);
  });

  test('portiere_notte (lettura consentita) → 200', async () => {
    const res = await request(app)
      .get(`/api/alloggiati/codici?tabella=${TABELLA_TEST}&search=prova`)
      .set(authHeader.portiere_notte());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('senza parametro tabella → 400', async () => {
    const res = await request(app)
      .get('/api/alloggiati/codici')
      .set(authHeader.receptionist());
    expect(res.status).toBe(400);
  });

  test('?search= trova per descrizione (case-insensitive)', async () => {
    const res = await request(app)
      .get(`/api/alloggiati/codici?tabella=${TABELLA_TEST}&search=stato di prova`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].codice).toBe(CODICE_TEST);
    expect(res.body[0].descrizione).toBe(DESCRIZIONE_TEST);
  });

  test('?codice= fa un lookup esatto', async () => {
    const res = await request(app)
      .get(`/api/alloggiati/codici?tabella=${TABELLA_TEST}&codice=${CODICE_TEST}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].descrizione).toBe(DESCRIZIONE_TEST);
  });

  test('?codice= inesistente → array vuoto (non 404)', async () => {
    const res = await request(app)
      .get(`/api/alloggiati/codici?tabella=${TABELLA_TEST}&codice=NON_ESISTE`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  test('tabella diversa non trova il codice seminato (isolamento per tabella)', async () => {
    const res = await request(app)
      .get(`/api/alloggiati/codici?tabella=Luoghi&codice=${CODICE_TEST}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });
});

// ─── GET /api/alloggiati/stato ───────────────────────────────────────────────

describe('GET /api/alloggiati/stato', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/alloggiati/stato');
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (stato è azione sincronizza, più ristretta della lettura)', async () => {
    const res = await request(app).get('/api/alloggiati/stato').set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('titolare → 200, la tabella di test compare con conteggio corretto', async () => {
    const res = await request(app).get('/api/alloggiati/stato').set(authHeader.titolare());
    expect(res.status).toBe(200);
    const riga = res.body.find(r => r.tabella === TABELLA_TEST);
    expect(riga).toBeDefined();
    expect(Number(riga.numero_codici)).toBe(1);
  });
});

// ─── POST /api/alloggiati/sincronizza ───────────────────────────────────────

describe('POST /api/alloggiati/sincronizza', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/alloggiati/sincronizza');
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (sincronizza è riservata ad admin/titolare)', async () => {
    const res = await request(app).post('/api/alloggiati/sincronizza').set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('admin senza credenziali configurate → 400, nessuna chiamata di rete effettuata', async () => {
    // Ambiente di test: ALLOGGIATI_UTENTE/PASSWORD/WSKEY non impostate.
    // Verifica il fail-fast prima di qualunque tentativo di connessione a
    // WS_ALLOGGIATI — se questo test fallisce con un errore diverso da 400,
    // vuol dire che le variabili sono state impostate nell'ambiente di test
    // per errore (rischio di chiamata di rete reale durante `npm test`).
    expect(process.env.ALLOGGIATI_UTENTE).toBeFalsy();
    const res = await request(app).post('/api/alloggiati/sincronizza').set(authHeader.admin());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/credenziali/i);
  });
});

// ─── GET /api/alloggiati/coda + retry-safety (Fase 2, 13/08/2026) ───────────

describe('GET /api/alloggiati/coda', () => {
  // numero è VARCHAR(20) — prefisso corto + soli 6 cifre, mai "TEST-CODA-R"
  // + "_coda######" (22 caratteri, superava il limite e faceva fallire ogni
  // test del blocco prima ancora di arrivare alla logica da verificare).
  const SUFF = Date.now().toString().slice(-6);
  let cameraRealeId, cameraTestId, ospiteRealeId, ospiteTestId, sogRealeId, sogTestId;
  const prenotazioniCreate = [];

  beforeAll(async () => {
    const db = getPool();

    const camReale = await db.query(
      `INSERT INTO camere (numero, nome) VALUES ($1, 'Camera Test Coda Reale') RETURNING id`,
      [`TCR${SUFF}`]
    );
    cameraRealeId = camReale.rows[0].id;
    const camTest = await db.query(
      `INSERT INTO camere (numero, nome) VALUES ($1, 'Camera Test Coda Fittizia') RETURNING id`,
      [`TCT${SUFF}`]
    );
    cameraTestId = camTest.rows[0].id;

    const ospReale = await db.query(`INSERT INTO ospiti (nome, cognome) VALUES ('Prova', $1) RETURNING id`, [`RealeCoda${SUFF}`]);
    ospiteRealeId = ospReale.rows[0].id;
    const ospTest = await db.query(`INSERT INTO ospiti (nome, cognome) VALUES ('Prova', $1) RETURNING id`, [`FittizioCoda${SUFF}`]);
    ospiteTestId = ospTest.rows[0].id;

    // Soggiorno "reale" (canale_origine diretta), arrivo ieri → DEVE comparire.
    const prenReale = await db.query(
      `INSERT INTO prenotazioni (canale_origine, stato) VALUES ('diretta', 'check_in') RETURNING id`
    );
    prenotazioniCreate.push(prenReale.rows[0].id);
    const sogReale = await db.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
       VALUES ($1, $2, $3, CURRENT_DATE - 1, CURRENT_DATE + 2, 1) RETURNING id`,
      [prenReale.rows[0].id, cameraRealeId, ospiteRealeId]
    );
    sogRealeId = sogReale.rows[0].id;

    // Soggiorno di TEST (canale_origine test_interno, stesso pattern degli
    // script creaPrenotazioneTestAlloggiati.js/seedPrenotazioniTest.js),
    // arrivo ieri → NON deve MAI comparire né in coda né nel job.
    const prenTest = await db.query(
      `INSERT INTO prenotazioni (canale_origine, stato) VALUES ('test_interno', 'check_in') RETURNING id`
    );
    prenotazioniCreate.push(prenTest.rows[0].id);
    const sogTest = await db.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
       VALUES ($1, $2, $3, CURRENT_DATE - 1, CURRENT_DATE + 2, 1) RETURNING id`,
      [prenTest.rows[0].id, cameraTestId, ospiteTestId]
    );
    sogTestId = sogTest.rows[0].id;
  });

  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM alloggiati_invii WHERE soggiorno_id = ANY($1)', [[sogRealeId, sogTestId]]);
    await db.query('DELETE FROM soggiorno_ospiti WHERE soggiorno_id = ANY($1)', [[sogRealeId, sogTestId]]);
    await db.query('DELETE FROM soggiorni WHERE id = ANY($1)', [[sogRealeId, sogTestId]]);
    await db.query('DELETE FROM prenotazioni WHERE id = ANY($1)', [prenotazioniCreate]);
    await db.query('DELETE FROM camere WHERE id = ANY($1)', [[cameraRealeId, cameraTestId]]);
    await db.query('DELETE FROM ospiti WHERE id = ANY($1)', [[ospiteRealeId, ospiteTestId]]);
  });

  test('senza token → 401', async () => {
    const res = await request(app).get('/api/alloggiati/coda');
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (azione invio riservata ad admin/titolare)', async () => {
    const res = await request(app).get('/api/alloggiati/coda').set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('admin → 200, il soggiorno reale compare in daInviare, quello test_interno MAI', async () => {
    const res = await request(app).get('/api/alloggiati/coda').set(authHeader.admin());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.daInviare)).toBe(true);
    const ids = res.body.daInviare.map(r => r.soggiorno_id);
    expect(ids).toContain(sogRealeId);
    expect(ids).not.toContain(sogTestId);
  });

  test('jobs/invioAlloggiatiWeb.trovaSoggiorniDaInviare — stessa garanzia a livello di job', async () => {
    const { trovaSoggiorniDaInviare } = require('../../backend/jobs/invioAlloggiatiWeb');
    const ids = await trovaSoggiorniDaInviare();
    expect(ids).toContain(sogRealeId);
    expect(ids).not.toContain(sogTestId);
  });

  test('eseguiInvioReale con credenziali mancanti → esito "in_attesa", NESSUNA riga scritta (retry-safety)', async () => {
    const { eseguiInvioReale } = require('../../backend/controllers/alloggiatiController');
    const db = getPool();
    expect(process.env.ALLOGGIATI_UTENTE).toBeFalsy();

    const prima = await db.query('SELECT COUNT(*) FROM alloggiati_invii WHERE soggiorno_id = $1', [sogRealeId]);
    const risultato = await eseguiInvioReale(sogRealeId);
    expect(risultato.esito).toBe('in_attesa');
    expect(risultato.scritto).toBe(false);

    const dopo = await db.query('SELECT COUNT(*) FROM alloggiati_invii WHERE soggiorno_id = $1', [sogRealeId]);
    expect(Number(dopo.rows[0].count)).toBe(Number(prima.rows[0].count));
  });

  test('eseguiInvioReale su soggiorno test_interno → blocca SEMPRE, anche chiamata diretta (non solo via coda/job)', async () => {
    // Verifica il punto di blocco vero e proprio, non solo che le query di
    // elenco lo nascondano: se qualcuno passasse questo id a mano (es.
    // POST /soggiorni/:id/invia con conferma_dati_reali:true, bypassando
    // sia la coda che il job), l'invio deve comunque fermarsi qui.
    const { eseguiInvioReale } = require('../../backend/controllers/alloggiatiController');
    await expect(eseguiInvioReale(sogTestId)).rejects.toThrow(/test_interno|dato di test/i);
  });

  test('POST /api/alloggiati/soggiorni/:id/invia su soggiorno test_interno, con conferma → 502 bloccato, non silenziosamente inviato', async () => {
    const res = await request(app)
      .post(`/api/alloggiati/soggiorni/${sogTestId}/invia`)
      .set(authHeader.admin())
      .send({ conferma_dati_reali: true });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/test_interno|dato di test/i);
  });

  test('POST /api/alloggiati/soggiorni/:id/invia senza conferma_dati_reali → 400, nessuna generazione tentata', async () => {
    const res = await request(app)
      .post(`/api/alloggiati/soggiorni/${sogRealeId}/invia`)
      .set(authHeader.admin())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/conferma/i);
  });

  test('avviaJobInvioAlloggiatiWeb — interruttore SPENTO di default, non pianifica nulla senza ALLOGGIATI_JOB_ATTIVO=true', () => {
    // Garanzia richiesta dal titolare (13/08/2026): il job non deve mai
    // partire in automatico solo perché il server viene distribuito/
    // riavviato — serve un'accensione esplicita in .env. Qui si verifica
    // solo il ramo "non attivo" (il valore di default nell'ambiente di
    // test): non chiama cron.schedule, si limita a loggare il motivo.
    //
    // jest.isolateModules (non jest.resetModules) — bug reale trovato dal
    // titolare 13/08/2026: resetModules() svuota il registro moduli
    // dell'INTERO file, non solo di questo test. Il mock di
    // alloggiatiSoapClient catturato una volta in testa al file
    // (jest.mock + require riga 32-45) resta legato alla vecchia
    // "generazione" del registro — ogni require successivo di
    // alloggiatiController (nei test di Fase A/B più sotto) otteneva
    // un'istanza NUOVA e diversa del client SOAP mockato, su cui
    // mockRejectedValueOnce/mockResolvedValueOnce non era mai stato
    // impostato: le chiamate risultavano `undefined` invece di rifiutare o
    // risolvere come previsto. isolateModules resetta il registro SOLO
    // dentro il callback, senza toccare quello condiviso dal resto del file.
    delete process.env.ALLOGGIATI_JOB_ATTIVO;
    let avviaJobInvioAlloggiatiWeb, spy;
    jest.isolateModules(() => {
      const cron = require('node-cron');
      // mockImplementation: senza, spyOn chiama comunque il cron.schedule
      // reale, che crea un task con un interval attivo — mai fermato da
      // spy.mockRestore() (che ripristina solo il riferimento alla funzione,
      // non ferma il task già creato). Era la causa del processo Jest
      // rimasto appeso in uscita dopo l'introduzione di questo test
      // (13/08/2026) — corretto 14/08/2026, non "comportamento di sempre".
      spy = jest.spyOn(cron, 'schedule').mockImplementation(() => ({ stop: jest.fn() }));
      ({ avviaJobInvioAlloggiatiWeb } = require('../../backend/jobs/invioAlloggiatiWeb'));
    });

    avviaJobInvioAlloggiatiWeb();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('avviaJobInvioAlloggiatiWeb — con ALLOGGIATI_JOB_ATTIVO=true pianifica il cron', () => {
    process.env.ALLOGGIATI_JOB_ATTIVO = 'true';
    let avviaJobInvioAlloggiatiWeb, spy;
    jest.isolateModules(() => {
      const cron = require('node-cron');
      // Vedi commento nel test precedente: mockImplementation evita di
      // creare un cron task reale (interval attivo, mai fermato) mentre
      // continua a verificare che schedule() sia stato chiamato con i
      // parametri giusti.
      spy = jest.spyOn(cron, 'schedule').mockImplementation(() => ({ stop: jest.fn() }));
      ({ avviaJobInvioAlloggiatiWeb } = require('../../backend/jobs/invioAlloggiatiWeb'));
    });

    avviaJobInvioAlloggiatiWeb();

    expect(spy).toHaveBeenCalledWith('0 2 * * *', expect.any(Function));
    spy.mockRestore();
    delete process.env.ALLOGGIATI_JOB_ATTIVO;
  });
});

// ─── Fase A (13/08/2026) — retry visibile, esito 'errore_rete' ─────────────
// Prima un errore di rete/servizio non scriveva nulla in alloggiati_invii
// (retry-safety silenziosa). Ora scrive una riga con esito 'errore_rete',
// visibile in coda con il conteggio dei tentativi falliti — resta comunque
// "da reinviare" alla notte successiva, stessa query di prima.
describe("eseguiInvioReale — errore di rete (Fase A)", () => {
  let cameraId, ospiteId, prenotazioneId, soggiornoId;
  const SUFF = Date.now().toString().slice(-6);

  beforeAll(async () => {
    const db = getPool();
    const cam = await db.query(
      `INSERT INTO camere (numero, nome) VALUES ($1, 'Camera Test Errore Rete') RETURNING id`,
      [`TER${SUFF}`]
    );
    cameraId = cam.rows[0].id;

    // Ospite con dati sufficienti a generare una riga schedina valida: tipo
    // alloggiato '19' (familiare) non richiede documento (vedi
    // TIPI_CON_DOCUMENTO in alloggiatiSchedina.js), e uno stato di nascita
    // diverso dall'Italia evita l'obbligo di comune/provincia di nascita —
    // il minimo indispensabile per superare campiObbligatoriMancanti()
    // senza dover popolare l'intera anagrafica.
    const osp = await db.query(
      `INSERT INTO ospiti (nome, cognome, sesso, data_nascita, stato_nascita_codice, cittadinanza_codice)
       VALUES ('Prova', $1, 'M', '1990-01-01', '999999999', '999999999') RETURNING id`,
      [`ErroreRete${SUFF}`]
    );
    ospiteId = osp.rows[0].id;

    const pren = await db.query(
      `INSERT INTO prenotazioni (canale_origine, stato) VALUES ('diretta', 'check_in') RETURNING id`
    );
    prenotazioneId = pren.rows[0].id;
    const sog = await db.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
       VALUES ($1, $2, $3, CURRENT_DATE - 1, CURRENT_DATE + 2, 1) RETURNING id`,
      [prenotazioneId, cameraId, ospiteId]
    );
    soggiornoId = sog.rows[0].id;
    await db.query(
      `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1, $2, '19')`,
      [soggiornoId, ospiteId]
    );
  });

  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM alloggiati_invii WHERE soggiorno_id = $1', [soggiornoId]);
    await db.query('DELETE FROM soggiorno_ospiti WHERE soggiorno_id = $1', [soggiornoId]);
    await db.query('DELETE FROM soggiorni WHERE id = $1', [soggiornoId]);
    await db.query('DELETE FROM prenotazioni WHERE id = $1', [prenotazioneId]);
    await db.query('DELETE FROM camere WHERE id = $1', [cameraId]);
    await db.query('DELETE FROM ospiti WHERE id = $1', [ospiteId]);
  });

  test('generaToken che fallisce per rete scrive esito errore_rete, non lancia, resta "da reinviare"', async () => {
    process.env.ALLOGGIATI_UTENTE = 'utente_test';
    process.env.ALLOGGIATI_PASSWORD = 'password_test';
    process.env.ALLOGGIATI_WSKEY = 'wskey_test';
    alloggiatiSoapClient.generaToken.mockRejectedValueOnce(new Error('ECONNREFUSED — portale non raggiungibile'));

    const { eseguiInvioReale } = require('../../backend/controllers/alloggiatiController');
    const db = getPool();
    const risultato = await eseguiInvioReale(soggiornoId);

    expect(risultato.esito).toBe('errore_rete');
    expect(risultato.scritto).toBe(true);
    expect(risultato.dettaglio).toMatch(/ECONNREFUSED/);

    const righe = await db.query(
      `SELECT esito, dettaglio_errore FROM alloggiati_invii WHERE soggiorno_id = $1`, [soggiornoId]
    );
    expect(righe.rows.length).toBe(1);
    expect(righe.rows[0].esito).toBe('errore_rete');
    expect(righe.rows[0].dettaglio_errore).toMatch(/ECONNREFUSED/);

    delete process.env.ALLOGGIATI_UTENTE;
    delete process.env.ALLOGGIATI_PASSWORD;
    delete process.env.ALLOGGIATI_WSKEY;
  });

  test('GET /api/alloggiati/coda mostra tentativi_falliti > 0 dopo il test precedente', async () => {
    const res = await request(app).get('/api/alloggiati/coda').set(authHeader.admin());
    expect(res.status).toBe(200);
    const riga = res.body.daInviare.find(r => r.soggiorno_id === soggiornoId);
    expect(riga).toBeDefined();
    expect(riga.ultimo_esito).toBe('errore_rete');
    expect(riga.tentativi_falliti).toBeGreaterThanOrEqual(1);
  });
});

// ─── Fase B (13/08/2026) — ricevute (obbligo conservazione 5 anni) ─────────
describe('Ricevute Alloggiati Web (Fase B)', () => {
  const fs = require('fs');
  const path = require('path');
  const CARTELLA_RICEVUTE = path.join(__dirname, '../../backend/uploads/alloggiati_ricevute');

  // Date locali (mai toISOString: fa slittare indietro di un giorno sul
  // fuso Europe/Rome, stesso bug già corretto altrove nel progetto).
  function dataLocale(offsetGiorni) {
    const d = new Date();
    d.setDate(d.getDate() + offsetGiorni);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const oggi = dataLocale(0);
  const ieri = dataLocale(-1);
  const troppoVecchia = dataLocale(-31);

  // Fixture minima dedicata SOLO a soddisfare il vincolo NOT NULL/FK di
  // alloggiati_invii.soggiorno_id nel test scaricaRicevutePendenti più
  // sotto — qui non serve un ospite valido, nessuna schedina viene mai
  // generata da questo percorso (scaricaRicevutaGiorno non chiama
  // generaSchedineSoggiorno). Deliberatamente NON un "SELECT id FROM
  // soggiorni LIMIT 1": pescare un soggiorno reale a caso avrebbe inquinato
  // (temporaneamente) la sua storia invii vera.
  let cameraRicevuteId, prenotazioneRicevuteId, soggiornoRicevuteId, ospiteRicevuteId;
  const SUFF_RIC = Date.now().toString().slice(-6);

  beforeAll(async () => {
    const db = getPool();
    const cam = await db.query(
      `INSERT INTO camere (numero, nome) VALUES ($1, 'Camera Test Ricevute') RETURNING id`,
      [`TRC${SUFF_RIC}`]
    );
    cameraRicevuteId = cam.rows[0].id;
    const osp = await db.query(
      `INSERT INTO ospiti (nome, cognome) VALUES ('Prova', $1) RETURNING id`, [`Ricevute${SUFF_RIC}`]
    );
    ospiteRicevuteId = osp.rows[0].id;
    const pren = await db.query(
      `INSERT INTO prenotazioni (canale_origine, stato) VALUES ('diretta', 'check_in') RETURNING id`
    );
    prenotazioneRicevuteId = pren.rows[0].id;
    const sog = await db.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
       VALUES ($1, $2, $3, CURRENT_DATE - 2, CURRENT_DATE + 1, 1) RETURNING id`,
      [prenotazioneRicevuteId, cameraRicevuteId, ospiteRicevuteId]
    );
    soggiornoRicevuteId = sog.rows[0].id;
  });

  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM alloggiati_invii WHERE soggiorno_id = $1', [soggiornoRicevuteId]);
    await db.query('DELETE FROM soggiorni WHERE id = $1', [soggiornoRicevuteId]);
    await db.query('DELETE FROM prenotazioni WHERE id = $1', [prenotazioneRicevuteId]);
    await db.query('DELETE FROM camere WHERE id = $1', [cameraRicevuteId]);
    await db.query('DELETE FROM ospiti WHERE id = $1', [ospiteRicevuteId]);
  });

  afterEach(async () => {
    // Pulizia difensiva — evita che un test lasci una riga/file che
    // sporca il test successivo di idempotenza.
    const db = getPool();
    await db.query('DELETE FROM alloggiati_ricevute WHERE data = $1', [ieri]);
    const filePath = path.join(CARTELLA_RICEVUTE, `${ieri}.pdf`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  test('scaricaRicevutaGiorno — data di oggi → non ancora scaricabile, nessuna chiamata SOAP', async () => {
    const { scaricaRicevutaGiorno } = require('../../backend/controllers/alloggiatiController');
    const risultato = await scaricaRicevutaGiorno(oggi);
    expect(risultato.scaricata).toBe(false);
    expect(risultato.motivo).toMatch(/oggi/i);
    expect(alloggiatiSoapClient.generaToken).not.toHaveBeenCalled();
  });

  test('scaricaRicevutaGiorno — data oltre 30gg fa → fuori finestra, nessuna chiamata SOAP', async () => {
    const { scaricaRicevutaGiorno } = require('../../backend/controllers/alloggiatiController');
    const risultato = await scaricaRicevutaGiorno(troppoVecchia);
    expect(risultato.scaricata).toBe(false);
    expect(risultato.motivo).toMatch(/30/);
  });

  test('scaricaRicevutaGiorno — data valida ma credenziali mancanti → esito chiaro, nessuna eccezione', async () => {
    expect(process.env.ALLOGGIATI_UTENTE).toBeFalsy();
    const { scaricaRicevutaGiorno } = require('../../backend/controllers/alloggiatiController');
    const risultato = await scaricaRicevutaGiorno(ieri);
    expect(risultato.scaricata).toBe(false);
    expect(risultato.motivo).toMatch(/credenziali/i);
  });

  test('scaricaRicevutaGiorno — successo: scrive il PDF su disco e la riga in DB; la 2a chiamata è idempotente (nessuna nuova chiamata SOAP)', async () => {
    process.env.ALLOGGIATI_UTENTE = 'utente_test';
    process.env.ALLOGGIATI_PASSWORD = 'password_test';
    process.env.ALLOGGIATI_WSKEY = 'wskey_test';
    alloggiatiSoapClient.generaToken.mockResolvedValueOnce('token_finto');
    alloggiatiSoapClient.scaricaRicevuta.mockResolvedValueOnce(Buffer.from('%PDF-finto'));

    const { scaricaRicevutaGiorno } = require('../../backend/controllers/alloggiatiController');
    const db = getPool();

    const primo = await scaricaRicevutaGiorno(ieri);
    expect(primo.scaricata).toBe(true);
    expect(primo.percorso_file).toBe(`${ieri}.pdf`);

    const filePath = path.join(CARTELLA_RICEVUTE, `${ieri}.pdf`);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('%PDF-finto');

    const riga = await db.query('SELECT * FROM alloggiati_ricevute WHERE data = $1', [ieri]);
    expect(riga.rows.length).toBe(1);

    const chiamateGeneraToken = alloggiatiSoapClient.generaToken.mock.calls.length;
    const secondo = await scaricaRicevutaGiorno(ieri);
    expect(secondo.scaricata).toBe(false);
    expect(secondo.motivo).toMatch(/già/i);
    expect(alloggiatiSoapClient.generaToken.mock.calls.length).toBe(chiamateGeneraToken); // nessuna nuova chiamata

    delete process.env.ALLOGGIATI_UTENTE;
    delete process.env.ALLOGGIATI_PASSWORD;
    delete process.env.ALLOGGIATI_WSKEY;
  });

  test('GET /api/alloggiati/ricevute — senza token 401, receptionist 403, admin 200', async () => {
    const senzaToken = await request(app).get('/api/alloggiati/ricevute');
    expect(senzaToken.status).toBe(401);

    const receptionist = await request(app).get('/api/alloggiati/ricevute').set(authHeader.receptionist());
    expect(receptionist.status).toBe(403);

    const admin = await request(app).get('/api/alloggiati/ricevute').set(authHeader.admin());
    expect(admin.status).toBe(200);
    expect(Array.isArray(admin.body)).toBe(true);
  });

  test('GET /api/alloggiati/ricevute/:data/file — 404 se la ricevuta non esiste', async () => {
    const res = await request(app).get(`/api/alloggiati/ricevute/${dataLocale(-5)}/file`).set(authHeader.admin());
    expect(res.status).toBe(404);
  });

  test('scaricaRicevutePendenti — trova una data con invio ok non ancora coperta da ricevuta e la scarica', async () => {
    process.env.ALLOGGIATI_UTENTE = 'utente_test';
    process.env.ALLOGGIATI_PASSWORD = 'password_test';
    process.env.ALLOGGIATI_WSKEY = 'wskey_test';
    alloggiatiSoapClient.generaToken.mockResolvedValueOnce('token_finto');
    alloggiatiSoapClient.scaricaRicevuta.mockResolvedValueOnce(Buffer.from('%PDF-finto-2'));

    const db = getPool();
    // Un invio 'ok' fittizio di ieri sul soggiorno fixture di questo blocco
    // — qui interessa solo la data, non i dati ospite (mai letti da questo
    // percorso).
    const inserito = await db.query(
      `INSERT INTO alloggiati_invii (soggiorno_id, esito, data_invio)
       VALUES ($1, 'ok', $2::date + TIME '10:00')
       RETURNING id`,
      [soggiornoRicevuteId, ieri]
    );
    expect(inserito.rows.length).toBe(1);

    try {
      const { scaricaRicevutePendenti } = require('../../backend/controllers/alloggiatiController');
      const risultati = await scaricaRicevutePendenti();
      const perIeri = risultati.find(r => r.data === ieri);
      expect(perIeri).toBeDefined();
      expect(perIeri.scaricata).toBe(true);
    } finally {
      await db.query('DELETE FROM alloggiati_invii WHERE id = $1', [inserito.rows[0].id]);
      delete process.env.ALLOGGIATI_UTENTE;
      delete process.env.ALLOGGIATI_PASSWORD;
      delete process.env.ALLOGGIATI_WSKEY;
    }
  });
});
