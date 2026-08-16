// Test suite — Modulo 1.8: Dashboard KPI reali
// Copre: GET /api/dashboard/kpi, POST /api/dashboard/incassi, GET /api/dashboard/alert
// Usa date fittizie 2099 (oggi test) e 2098 (anno scorso test) per non toccare dati reali.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');
const { alertInviiAlloggiati, alertChecklistHaccp } = require('../../backend/controllers/dashboardController');

const DATA_TEST        = '2099-11-23';
const DATA_ANNO_SCORSO = '2098-11-23'; // stesso giorno/mese di DATA_TEST, anno-1 — coerente con dashboardController.js:116
const PREFISSO = 'ZZZ_TEST_';

afterAll(async () => {
  const db = getPool();
  await db.query('DELETE FROM incassi_giornalieri WHERE data IN ($1, $2)', [DATA_TEST, DATA_ANNO_SCORSO]);
  await db.query('DELETE FROM ospiti_giornalieri WHERE data IN ($1, $2)', [DATA_TEST, DATA_ANNO_SCORSO]);
  await db.query(`DELETE FROM movimenti_magazzino WHERE prodotto_id IN (
    SELECT id FROM prodotti WHERE nome LIKE $1
  )`, [`${PREFISSO}%`]);
  await db.query('DELETE FROM prodotti WHERE nome LIKE $1', [`${PREFISSO}%`]);
  await chiudiPool();
});

// ─── GET /api/dashboard/kpi ─────────────────────────────────────────────────────

describe('GET /api/dashboard/kpi', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/dashboard/kpi');
    expect(res.status).toBe(401);
  });

  test('qualsiasi ruolo autenticato → 200 (dato aggregato, non sensibile)', async () => {
    const res = await request(app).get('/api/dashboard/kpi').set(authHeader.cameriere());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('camere');
    expect(res.body).toHaveProperty('coperti');
    expect(res.body).toHaveProperty('incasso');
    expect(res.body).toHaveProperty('foodCost');
  });

  test('data senza nessun dato → attuale 0, variazionePercentuale null (mai una divisione per zero)', async () => {
    const res = await request(app)
      .get(`/api/dashboard/kpi?data=${DATA_TEST}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.coperti.attuale).toBe(0);
    expect(res.body.coperti.variazionePercentuale).toBeNull();
    expect(res.body.incasso.attuale).toBe(0);
    expect(res.body.incasso.variazionePercentuale).toBeNull();
  });

  test('con dati oggi e anno scorso → variazionePercentuale calcolata correttamente', async () => {
    const db = getPool();
    await db.query(
      `INSERT INTO ospiti_giornalieri (data, coperti_colazione, coperti_pranzo, coperti_cena)
       VALUES ($1, 5, 5, 10)`,
      [DATA_TEST]
    ); // totale 20
    await db.query(
      `INSERT INTO ospiti_giornalieri (data, coperti_colazione, coperti_pranzo, coperti_cena)
       VALUES ($1, 2, 3, 5)`,
      [DATA_ANNO_SCORSO]
    ); // totale 10 → variazione attesa +100%

    const res = await request(app)
      .get(`/api/dashboard/kpi?data=${DATA_TEST}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.coperti.attuale).toBe(20);
    expect(res.body.coperti.annoScorso).toBe(10);
    expect(res.body.coperti.variazionePercentuale).toBe(100);
  });

  test('alert magazzino incluso se un prodotto è sotto soglia', async () => {
    const db = getPool();
    const p = await db.query(
      `INSERT INTO prodotti (nome, unita_misura, soglia_minima, qr_code) VALUES ($1, 'kg', 50, $2) RETURNING id`,
      [`${PREFISSO}Farina Dashboard`, `${PREFISSO}QR-DASHBOARD`]
    );
    await db.query(
      `INSERT INTO movimenti_magazzino (prodotto_id, tipo, quantita, user_id) VALUES ($1, 'carico', 5, 1)`,
      [p.rows[0].id]
    );

    const res = await request(app).get('/api/dashboard/alert').set(authHeader.admin());
    expect(res.status).toBe(200);
    const trovato = res.body.alerts.find(a => a.category === 'Magazzino' && a.text.includes('Farina Dashboard'));
    expect(trovato).toBeDefined();
    expect(trovato.link).toBe('/magazzino');
  });
});

// ─── POST /api/dashboard/incassi ────────────────────────────────────────────────

describe('POST /api/dashboard/incassi', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/dashboard/incassi').send({});
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (solo titolare/admin)', async () => {
    const res = await request(app)
      .post('/api/dashboard/incassi')
      .set(authHeader.cameriere())
      .send({ data: DATA_TEST, contanti: 100, pos: 200 });
    expect(res.status).toBe(403);
  });

  test('titolare registra incasso → 200', async () => {
    const res = await request(app)
      .post('/api/dashboard/incassi')
      .set(authHeader.titolare())
      .send({ data: DATA_TEST, contanti: 300, pos: 450.50, note: 'Test dashboard' });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.incasso.contanti)).toBe(300);
    expect(parseFloat(res.body.incasso.pos)).toBe(450.5);
  });

  test('KPI riflette l\'incasso appena registrato', async () => {
    const res = await request(app)
      .get(`/api/dashboard/kpi?data=${DATA_TEST}`)
      .set(authHeader.admin());
    expect(res.body.incasso.attuale).toBe(750.5);
  });

  test('admin aggiorna lo stesso giorno (upsert) → 200, nessun duplicato', async () => {
    const res = await request(app)
      .post('/api/dashboard/incassi')
      .set(authHeader.admin())
      .send({ data: DATA_TEST, contanti: 500, pos: 0 });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.incasso.contanti)).toBe(500);

    const db = getPool();
    const r = await db.query('SELECT COUNT(*) FROM incassi_giornalieri WHERE data = $1', [DATA_TEST]);
    expect(parseInt(r.rows[0].count)).toBe(1);
  });
});

// ─── alertInviiAlloggiati — Alloggiati Web, invii (Fase C, 14/08/2026) ──────
// Diverso dai fixture 2099 sopra: la query di questo blocco filtra
// `s.data_arrivo <= CURRENT_DATE` (nessun parametro data), quindi qui serve
// per forza CURRENT_DATE reale, non la data fittizia futura usata da kpi().
// Ogni fixture usa una camera dedicata (stesso accorgimento già adottato in
// alloggiati.test.js dopo il bug di collisione date del 13/08/2026) per non
// rischiare un conflitto EXCLUDE con altri dati di test/reali.
//
// Chiama alertInviiAlloggiati() DIRETTAMENTE con soggiornoIds, non
// l'endpoint HTTP /api/dashboard/alert — bug trovato dal titolare
// 14/08/2026: nel DB di sviluppo esistono soggiorni REALI (non di test)
// mai inviati, con termine scaduto da settimane. La query ha un LIMIT 5
// ordinato per urgenza: quei soggiorni reali riempivano da soli tutti gli
// slot, escludendo i fixture appena creati dal test — non un bug
// applicativo, un problema di isolamento. Filtrando esplicitamente sugli
// id creati qui, il test verifica la logica (rosso/ambra/esclusioni)
// indipendentemente da quanto backlog reale esiste in un dato momento nel
// DB di sviluppo — alert() in produzione continua a chiamare la stessa
// funzione SENZA filtro, comportamento invariato.
describe('alertInviiAlloggiati (Fase C)', () => {
  const SUFF = Date.now().toString().slice(-6);
  const oreFa = (ore) => new Date(Date.now() - ore * 3600 * 1000);

  const NUM_ROSSO = `DSHR${SUFF}`; // check-in 30h fa, mai inviato → termine scaduto
  const NUM_AMBRA = `DSHA${SUFF}`; // check-in 2h fa, mai inviato → termine non ancora scaduto
  const NUM_OK    = `DSHO${SUFF}`; // check-in 30h fa MA esito 'ok' → nessun alert
  const NUM_TEST  = `DSHT${SUFF}`; // check-in 30h fa, canale_origine test_interno → nessun alert

  let camere = [], ospiti = [], prenotazioni = [], soggiorni = [];
  let sogRossoId, sogAmbraId, sogOkId, sogTestId;

  beforeAll(async () => {
    const db = getPool();

    async function crea(numero, canale, oreDalCheckIn, esito) {
      const cam = await db.query(
        `INSERT INTO camere (numero, nome) VALUES ($1, 'Camera Test Dashboard Alloggiati') RETURNING id`,
        [numero]
      );
      camere.push(cam.rows[0].id);
      const osp = await db.query(
        `INSERT INTO ospiti (nome, cognome) VALUES ('Prova', $1) RETURNING id`,
        [`Dashboard${numero}`]
      );
      ospiti.push(osp.rows[0].id);
      const pren = await db.query(
        `INSERT INTO prenotazioni (canale_origine, stato) VALUES ($1, 'check_in') RETURNING id`,
        [canale]
      );
      prenotazioni.push(pren.rows[0].id);
      const sog = await db.query(
        `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti, check_in_effettuato_at)
         VALUES ($1, $2, $3, CURRENT_DATE - 2, CURRENT_DATE + 1, 1, $4) RETURNING id`,
        [pren.rows[0].id, cam.rows[0].id, osp.rows[0].id, oreFa(oreDalCheckIn)]
      );
      soggiorni.push(sog.rows[0].id);
      if (esito) {
        await db.query(`INSERT INTO alloggiati_invii (soggiorno_id, esito) VALUES ($1, $2)`, [sog.rows[0].id, esito]);
      }
      return sog.rows[0].id;
    }

    sogRossoId = await crea(NUM_ROSSO, 'diretta', 30);
    sogAmbraId = await crea(NUM_AMBRA, 'diretta', 2);
    sogOkId    = await crea(NUM_OK, 'diretta', 30, 'ok');
    sogTestId  = await crea(NUM_TEST, 'test_interno', 30);
  });

  // Tutti e 4 gli id insieme in ogni chiamata: il filtro soggiornoIds si
  // somma alle condizioni WHERE già esistenti (canale_origine, esito) —
  // non le bypassa. Verifica quindi in un colpo solo sia la selezione
  // giusta (rosso+ambra dentro, ok+test fuori) sia che il filtro non
  // interferisca con la business logic.
  const tuttiGliId = () => [sogRossoId, sogAmbraId, sogOkId, sogTestId];

  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM alloggiati_invii WHERE soggiorno_id = ANY($1::int[])', [soggiorni]);
    await db.query('DELETE FROM soggiorni WHERE id = ANY($1::int[])', [soggiorni]);
    await db.query('DELETE FROM prenotazioni WHERE id = ANY($1::int[])', [prenotazioni]);
    await db.query('DELETE FROM camere WHERE id = ANY($1::int[])', [camere]);
    await db.query('DELETE FROM ospiti WHERE id = ANY($1::int[])', [ospiti]);
  });

  test('termine scaduto (check-in 30h fa, mai inviato) → alert rosso', async () => {
    const alerts = await alertInviiAlloggiati({ soggiornoIds: tuttiGliId() });
    const alert = alerts.find(a => a.text.includes(`Camera ${NUM_ROSSO}`));
    expect(alert).toBeDefined();
    expect(alert.category).toBe('Alloggiati Web · Invio');
    expect(alert.type).toBe('red');
    expect(alert.text).toMatch(/in ritardo/);
    expect(alert.link).toBe('/impostazioni/alloggiati');
  });

  test('termine non ancora scaduto (check-in 2h fa, mai inviato) → alert ambra', async () => {
    const alerts = await alertInviiAlloggiati({ soggiornoIds: tuttiGliId() });
    const alert = alerts.find(a => a.text.includes(`Camera ${NUM_AMBRA}`));
    expect(alert).toBeDefined();
    expect(alert.type).toBe('amber');
    expect(alert.text).toMatch(/da inviare/);
  });

  test("esito 'ok' già registrato → NESSUN alert anche se il check-in è vecchio", async () => {
    const alerts = await alertInviiAlloggiati({ soggiornoIds: tuttiGliId() });
    const alert = alerts.find(a => a.text.includes(`Camera ${NUM_OK}`));
    expect(alert).toBeUndefined();
  });

  test("canale_origine='test_interno' → NESSUN alert anche se il termine è scaduto", async () => {
    const alerts = await alertInviiAlloggiati({ soggiornoIds: tuttiGliId() });
    const alert = alerts.find(a => a.text.includes(`Camera ${NUM_TEST}`));
    expect(alert).toBeUndefined();
  });

  test('senza filtro soggiornoIds, la funzione resta utilizzabile da alert() in produzione (nessuna eccezione, LIMIT 5 di default)', async () => {
    // Non asserisce sul contenuto (dipende dal backlog reale del DB in quel
    // momento, vedi commento in testa al describe) — verifica solo che la
    // chiamata "di produzione" (nessun filtro) non generi errori dopo
    // l'estrazione della funzione.
    const alerts = await alertInviiAlloggiati();
    expect(Array.isArray(alerts)).toBe(true);
  });
});

// ─── alertChecklistHaccp — checklist HACCP non compilata (modulo 6.1 punto 3, 15/08/2026) ──
// Usa DATA_TEST (2099, in alto) per non toccare haccp_checklist reale — a
// differenza di alertInviiAlloggiati sopra, questa query filtra su `data`
// (parametro), non su CURRENT_DATE, quindi la data fittizia funziona qui.
// oraCorrente è sempre passato esplicitamente ai test: la soglia dipende
// dall'ora reale quando NON viene passato, che renderebbe questi test
// non deterministici (falliscono o passano secondo l'ora in cui girano) —
// vedi commento in testa alla funzione in dashboardController.js.
describe('alertChecklistHaccp (modulo 6.1 punto 3)', () => {
  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM haccp_checklist WHERE data = $1', [DATA_TEST]);
  });

  test('nessuna checklist, ora 10 (mattina) → nessun alert', async () => {
    const alerts = await alertChecklistHaccp({ data: DATA_TEST, oraCorrente: 10 });
    expect(alerts).toEqual([]);
  });

  test('nessuna checklist, ora 16 (pomeriggio) → alert ambra', async () => {
    const alerts = await alertChecklistHaccp({ data: DATA_TEST, oraCorrente: 16 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('amber');
    expect(alerts[0].category).toBe('HACCP');
    expect(alerts[0].link).toBe('/registro-haccp');
  });

  test('nessuna checklist, ora 23 (sera tardi) → alert rosso', async () => {
    const alerts = await alertChecklistHaccp({ data: DATA_TEST, oraCorrente: 23 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('red');
  });

  test('checklist già compilata → NESSUN alert anche a ora 23', async () => {
    const db = getPool();
    await db.query(
      `INSERT INTO haccp_checklist (attrezzatura, user_id, data, completata) VALUES ('Frigorifero cucina', 1, $1, true)`,
      [DATA_TEST]
    );

    const alerts = await alertChecklistHaccp({ data: DATA_TEST, oraCorrente: 23 });
    expect(alerts).toEqual([]);
  });

  test('senza override oraCorrente, la funzione resta utilizzabile da alert() in produzione (nessuna eccezione)', async () => {
    const alerts = await alertChecklistHaccp();
    expect(Array.isArray(alerts)).toBe(true);
  });
});

// ─── GET /api/dashboard/gruppi — dashboard a gruppi di widget (14/08/2026) ──
// Copertura di primo livello: forma della risposta e presenza dei placeholder
// onesti (sviluppato: false) per i due moduli non ancora costruiti (OTA e
// fabbisogno pasti). Non ri-verifica qui il conteggio di ogni singola query
// (arrivi/partenze/camere da fare/ecc.): sono le stesse tabelle già testate
// altrove (camereController, tassaSoggiornoController, alertInviiAlloggiati
// sopra) — un test di forma basta a intercettare un endpoint rotto senza
// duplicare l'intera batteria di fixture per ogni modulo coinvolto.
describe('GET /api/dashboard/gruppi', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/dashboard/gruppi');
    expect(res.status).toBe(401);
  });

  test('qualsiasi ruolo autenticato → 200, con tutti e 5 i gruppi', async () => {
    const res = await request(app).get('/api/dashboard/gruppi').set(authHeader.cameriere());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('clienti');
    expect(res.body).toHaveProperty('adempimenti');
    expect(res.body).toHaveProperty('hotel');
    expect(res.body).toHaveProperty('ristorante');
  });

  test('prenotazioni OTA e fabbisogno pasti dichiarati non sviluppati, non nascosti né a zero finto', async () => {
    const res = await request(app).get('/api/dashboard/gruppi').set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.clienti.prenotazioniOta.sviluppato).toBe(false);
    expect(res.body.clienti.prenotazioniOta.messaggio).toMatch(/non sviluppato/i);
    expect(res.body.hotel.fabbisognoPasti.sviluppato).toBe(false);
    expect(res.body.hotel.fabbisognoPasti.messaggio).toMatch(/non sviluppato/i);
  });

  test('statistiche Liguria: sviluppato ma non automatico, distinto dai placeholder veri', async () => {
    const res = await request(app).get('/api/dashboard/gruppi').set(authHeader.titolare());
    expect(res.body.adempimenti.statisticheLiguria.sviluppato).toBe(true);
    expect(res.body.adempimenti.statisticheLiguria.automatico).toBe(false);
  });

  test('alloggiati Web: stato semaforo è uno tra verde/ambra/rosso', async () => {
    const res = await request(app).get('/api/dashboard/gruppi').set(authHeader.titolare());
    expect(['verde', 'ambra', 'rosso']).toContain(res.body.adempimenti.alloggiatiWeb.stato);
    expect(typeof res.body.adempimenti.alloggiatiWeb.daInviare).toBe('number');
  });

  test('conteggi numerici sono sempre numeri, mai stringhe (parseInt/Number applicato ovunque)', async () => {
    const res = await request(app).get('/api/dashboard/gruppi').set(authHeader.titolare());
    expect(typeof res.body.clienti.arriviOggi).toBe('number');
    expect(typeof res.body.clienti.partenzeOggi).toBe('number');
    expect(typeof res.body.clienti.checkInDaFare).toBe('number');
    expect(typeof res.body.clienti.preCheckinDaInviare).toBe('number');
    expect(typeof res.body.hotel.camereDaFare).toBe('number');
    expect(typeof res.body.hotel.manutenzioniAperte).toBe('number');
    expect(typeof res.body.hotel.magazzinoSottoScorta).toBe('number');
    expect(typeof res.body.ristorante.copertiColazione).toBe('number');
    expect(typeof res.body.ristorante.tavoliOccupatiOra).toBe('number');
    expect(typeof res.body.ristorante.menuPronto).toBe('boolean');
  });
});

// ─── GET /api/dashboard/alert — ordinamento per gravità (16/08/2026) ────────
// Punto 1 evolutiva dashboard: verifica un invariante strutturale (nessun
// 'amber' prima di un 'red'), non un conteggio — resta valido indipendente
// da quanto backlog reale esiste nel DB di sviluppo in un dato momento
// (stesso motivo per cui alertInviiAlloggiati sopra usa soggiornoIds
// invece di contare sull'endpoint HTTP).
describe('GET /api/dashboard/alert — ordinamento per gravità (16/08/2026)', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/dashboard/alert');
    expect(res.status).toBe(401);
  });

  test('nessun alert ambra precede un alert rosso', async () => {
    const res = await request(app).get('/api/dashboard/alert').set(authHeader.titolare());
    expect(res.status).toBe(200);
    const tipi = res.body.alerts.map(a => a.type);
    const ultimoRosso = tipi.lastIndexOf('red');
    const primoAmbra = tipi.indexOf('amber');
    if (ultimoRosso !== -1 && primoAmbra !== -1) {
      expect(primoAmbra).toBeGreaterThan(ultimoRosso);
    }
  });
});

// ─── GET /api/dashboard/incassi/quadratura (16/08/2026, punto 3) ───────────
// Confronta incassi_giornalieri (dichiarato, già inserito da DATA_TEST nel
// blocco 'POST /api/dashboard/incassi' sopra: contanti=500, pos=0 dopo
// l'upsert dell'ultimo test di quel blocco) con `pagamenti` (atteso). Il
// pagamento di test usa created_at = DATA_TEST esplicito (non NOW()) per
// restare isolato dai dati reali, stesso principio delle date fittizie
// 2099/2098 di tutto il file. prenotazione_id è NOT NULL — riusa una
// prenotazione reale qualsiasi (stesso pattern di camere.test.js che riusa
// `primaCamera`): il test non modifica quella prenotazione, la referenzia
// solo per soddisfare la FK.
describe('GET /api/dashboard/incassi/quadratura', () => {
  let prenotazioneTestId;
  let pagamentoTestId;
  const DATA_QUADRATURA = '2099-12-05'; // giorno dedicato, non condiviso con DATA_TEST di sopra

  beforeAll(async () => {
    const db = getPool();
    const p = await db.query('SELECT id FROM prenotazioni ORDER BY id LIMIT 1');
    prenotazioneTestId = p.rows[0]?.id;
  });

  afterAll(async () => {
    const db = getPool();
    if (pagamentoTestId) {
      await db.query('DELETE FROM pagamenti WHERE id = $1', [pagamentoTestId]);
    }
    await db.query('DELETE FROM incassi_giornalieri WHERE data = $1', [DATA_QUADRATURA]);
  });

  test('senza token → 401', async () => {
    const res = await request(app).get('/api/dashboard/incassi/quadratura');
    expect(res.status).toBe(401);
  });

  test('cameriere → 403 (solo titolare/admin, stessi permessi di suggerimento)', async () => {
    const res = await request(app)
      .get('/api/dashboard/incassi/quadratura')
      .set(authHeader.cameriere());
    expect(res.status).toBe(403);
  });

  test('nessun incasso dichiarato per il giorno → dichiarato e scostamento null, non un falso scostamento', async () => {
    const res = await request(app)
      .get(`/api/dashboard/incassi/quadratura?data=${DATA_QUADRATURA}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.dichiarato).toBeNull();
    expect(res.body.scostamento).toBeNull();
    expect(res.body.copreRistorante).toBe(false);
  });

  test('dichiarato e atteso vicini → scostamento non significativo (sotto soglia 10€)', async () => {
    const db = getPool();
    await db.query(
      `INSERT INTO incassi_giornalieri (data, contanti, pos) VALUES ($1, 100, 50)`,
      [DATA_QUADRATURA]
    );
    if (prenotazioneTestId) {
      const pag = await db.query(
        `INSERT INTO pagamenti (prenotazione_id, importo, metodo, tipo, stato, created_at)
         VALUES ($1, 145, 'contanti', 'saldo', 'completato', $2) RETURNING id`,
        [prenotazioneTestId, DATA_QUADRATURA]
      );
      pagamentoTestId = pag.rows[0].id;
    }

    const res = await request(app)
      .get(`/api/dashboard/incassi/quadratura?data=${DATA_QUADRATURA}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.dichiarato).toEqual({ contanti: 100, pos: 50 });
    if (prenotazioneTestId) {
      // atteso: 145 contanti (test) + 0 pos = 145; dichiarato totale 150 → scostamento +5
      expect(res.body.scostamento).toBe(5);
      expect(res.body.significativo).toBe(false);
    }
  });

  test('scostamento sopra soglia → significativo true', async () => {
    if (!prenotazioneTestId) return; // ambiente senza prenotazioni reali — vedi nota sopra
    const db = getPool();
    // Alza il pagamento reale a 200 (dichiarato resta 150) → scostamento -50
    await db.query('UPDATE pagamenti SET importo = 200 WHERE id = $1', [pagamentoTestId]);

    const res = await request(app)
      .get(`/api/dashboard/incassi/quadratura?data=${DATA_QUADRATURA}`)
      .set(authHeader.titolare());
    expect(res.body.scostamento).toBe(-50);
    expect(res.body.significativo).toBe(true);
  });
});

// ─── GET /api/dashboard/alert — compleanni, bug "NaN giorni" (16/08/2026) ──
// Segnalato dal titolare in UI. Causa: `(gs.giorno - CURRENT_DATE)` sottraeva
// un CURRENT_DATE (date) da gs.giorno, che generate_series produce come
// timestamp (non date) — date - timestamp in Postgres è un INTERVAL, non un
// intero. node-postgres non ha un parser custom per INTERVAL (vedi
// backend/config/db.js: solo DATE e BIGINT hanno setTypeParser), quindi
// arriva in JS come oggetto {days:...}: `Number(quell'oggetto)` è NaN. Il
// blocco "scadenze HR" poco sopra nello stesso file usa correttamente
// `s.data_scadenza::date - CURRENT_DATE` (date - date = integer) — stesso
// pattern applicato qui col cast `gs.giorno::date`. Anno 2000 per
// data_nascita (bisestile, evita un INSERT che fallisce se "oggi + N
// giorni" cade il 29 febbraio in un anno che bisestile non è).
describe('GET /api/dashboard/alert — compleanni (fix NaN giorni, 16/08/2026)', () => {
  const PREFISSO = 'ZZZ_TEST_';
  let ospiteTestId;
  const GIORNI_ATTESI = 3;

  beforeAll(async () => {
    const db = getPool();
    const oggi = new Date();
    const traNGiorni = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + GIORNI_ATTESI);
    const dataNascitaTest = `2000-${String(traNGiorni.getMonth() + 1).padStart(2, '0')}-${String(traNGiorni.getDate()).padStart(2, '0')}`;
    const r = await db.query(
      `INSERT INTO ospiti (nome, cognome, data_nascita) VALUES ($1, $2, $3) RETURNING id`,
      [`${PREFISSO}Mario`, `${PREFISSO}Compleanno`, dataNascitaTest]
    );
    ospiteTestId = r.rows[0].id;
  });

  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM ospiti WHERE id = $1', [ospiteTestId]);
  });

  // La lista compleanni dell'endpoint è LIMIT 5 (ordinata per giorni_mancanti
  // ASC) — nell'ambiente di test/sviluppo l'anagrafica ospiti reale ha spesso
  // già 5+ compleanni entro pochi giorni, quindi la riga sintetica di questo
  // test può restare fuori dal taglio dei 5 anche se il calcolo è corretto.
  // Per non dipendere dalla quantità di dati reali presenti, la correttezza
  // del cast `::date` si verifica sulla query grezza (stessa di
  // dashboardController.js, non limitata) sul singolo ospite di test; il
  // giro sull'endpoint HTTP resta a verificare — su TUTTI i compleanni
  // realmente restituiti, anche quelli reali — che il bug "NaN" non sia
  // mai tornato, senza assumere quale specifica riga compaia nel taglio.
  test('la query giorni_mancanti calcola un intero corretto, mai NaN (verifica diretta, non limitata)', async () => {
    const db = getPool();
    const r = await db.query(
      `SELECT (gs.giorno::date - CURRENT_DATE) AS giorni_mancanti
       FROM ospiti o
       JOIN LATERAL generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '7 days', INTERVAL '1 day') AS gs(giorno) ON true
       WHERE o.id = $1
         AND EXTRACT(MONTH FROM o.data_nascita) = EXTRACT(MONTH FROM gs.giorno)
         AND EXTRACT(DAY FROM o.data_nascita) = EXTRACT(DAY FROM gs.giorno)`,
      [ospiteTestId]
    );
    expect(r.rows).toHaveLength(1);
    const giorni = Number(r.rows[0].giorni_mancanti);
    expect(Number.isNaN(giorni)).toBe(false);
    expect(giorni).toBe(GIORNI_ATTESI);
  });

  test('nessun alert di compleanno restituito dall\'endpoint contiene mai "NaN" nel testo', async () => {
    const res = await request(app).get('/api/dashboard/alert').set(authHeader.titolare());
    const alertCompleanni = res.body.alerts.filter(a => a.category === 'Clienti · Compleanni');
    expect(alertCompleanni.length).toBeGreaterThan(0);
    for (const a of alertCompleanni) {
      expect(a.text).not.toMatch(/NaN/);
    }
  });
});

// ─── GET /api/dashboard/revenue — ADR/RevPAR/TRevPAR (16/08/2026) ──────────
// Periodo di test: novembre 2099 (anno fittizio, come DATA_TEST in alto —
// nessuna prenotazione reale può cadere nel 2099, isola completamente dai
// dati di produzione). Tre soggiorni pensati per coprire i due casi che
// contano davvero nella logica di proration:
//   A) tutto dentro il periodo (5 notti, tariffa 500 → 100/notte)
//   B) a cavallo tra ottobre e novembre (5 notti totali, ma solo 2 cadono
//      nel periodo richiesto → verifica che il calcolo prorata per notte,
//      non per prenotazione intera)
//   C) cancellato (deve essere escluso, stessa condizione cancellato=false
//      usata ovunque nel resto del progetto)
// camereAttive non è noto a priori (dipende dai dati reali del DB), quindi
// i test che dipendono da RevPAR/TRevPAR ricalcolano l'atteso a partire dal
// `periodo.camereAttive` restituito dalla risposta stessa — stesso principio
// dei test "strutturali" già usati per l'ordinamento degli alert sopra:
// verificano la relazione interna, non un numero assoluto ignoto.
describe('GET /api/dashboard/revenue', () => {
  const MESE_INIZIO = '2099-11-01';
  // NON 23 (= DATA_TEST in cima al file): il blocco POST /api/dashboard/incassi
  // sopra registra un incasso proprio per DATA_TEST e lo ripulisce solo
  // nell'afterAll di modulo (fine file), quindi resterebbe visibile qui e
  // gonfierebbe ricavoTotale in modo silenzioso. Qualsiasi giorno del mese
  // dopo la fine dei soggiorni di fixture (10) e prima del 23 va bene.
  const MESE_FINE   = '2099-11-20';
  const PREFISSO = 'ZZZ_TEST_';

  let cameraId, ospiteId;
  let prenotazioniIds = [], soggiorniIds = [];

  beforeAll(async () => {
    const db = getPool();
    const cam = await db.query(
      `INSERT INTO camere (numero, nome) VALUES ($1, 'Camera Test Dashboard Revenue') RETURNING id`,
      [`${PREFISSO}REV`]
    );
    cameraId = cam.rows[0].id;
    const osp = await db.query(
      `INSERT INTO ospiti (nome, cognome) VALUES ($1, 'DashboardRevenue') RETURNING id`,
      [`${PREFISSO}Prova`]
    );
    ospiteId = osp.rows[0].id;

    async function creaSoggiorno(arrivo, partenza, tariffa, cancellato) {
      const pren = await db.query(
        `INSERT INTO prenotazioni (canale_origine, stato) VALUES ('diretta', 'confermata') RETURNING id`
      );
      prenotazioniIds.push(pren.rows[0].id);
      const sog = await db.query(
        `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti, tariffa_totale, cancellato)
         VALUES ($1, $2, $3, $4, $5, 1, $6, $7) RETURNING id`,
        [pren.rows[0].id, cameraId, ospiteId, arrivo, partenza, tariffa, cancellato]
      );
      soggiorniIds.push(sog.rows[0].id);
    }

    // A) tutto dentro novembre: 5 notti, 500 → 100/notte
    await creaSoggiorno('2099-11-05', '2099-11-10', 500, false);
    // B) a cavallo ottobre/novembre: 5 notti totali (29,30,31 ott + 1,2 nov),
    // solo 2 cadono nel periodo richiesto → 250/5 = 50/notte, 2 notti = 100
    await creaSoggiorno('2099-10-29', '2099-11-03', 250, false);
    // C) cancellato: deve essere escluso anche se cade in pieno nel periodo
    await creaSoggiorno('2099-11-06', '2099-11-08', 999, true);

    await db.query(
      `INSERT INTO incassi_giornalieri (data, contanti, pos) VALUES ($1, 300, 200), ($2, 400, 100)`,
      ['2099-11-05', '2099-11-15']
    );
  });

  afterAll(async () => {
    const db = getPool();
    await db.query('DELETE FROM soggiorni WHERE id = ANY($1::int[])', [soggiorniIds]);
    await db.query('DELETE FROM prenotazioni WHERE id = ANY($1::int[])', [prenotazioniIds]);
    await db.query('DELETE FROM camere WHERE id = $1', [cameraId]);
    await db.query('DELETE FROM ospiti WHERE id = $1', [ospiteId]);
    await db.query('DELETE FROM incassi_giornalieri WHERE data IN ($1, $2)', ['2099-11-05', '2099-11-15']);
  });

  test('senza token → 401', async () => {
    const res = await request(app).get('/api/dashboard/revenue');
    expect(res.status).toBe(401);
  });

  test('accessibile a un ruolo non-gestione (stessa policy di kpi())', async () => {
    const res = await request(app).get(`/api/dashboard/revenue?data=${MESE_FINE}`).set(authHeader.cameriere());
    expect(res.status).toBe(200);
  });

  test('ADR prorata correttamente le notti a cavallo di mese, esclude i cancellati', async () => {
    const res = await request(app).get(`/api/dashboard/revenue?data=${MESE_FINE}`).set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.periodo.inizio).toBe(MESE_INIZIO);
    expect(res.body.periodo.fine).toBe(MESE_FINE);
    // 5 notti (A) + 2 notti (B) = 7 camere-notte vendute; 500 + 100 = 600 di ricavo
    expect(res.body.dettaglio.camereNotteVendute).toBe(7);
    expect(res.body.dettaglio.ricavoCamere).toBeCloseTo(600, 2);
    expect(res.body.adr.attuale).toBeCloseTo(600 / 7, 2);
  });

  test('RevPAR e TRevPAR sono coerenti con camereAttive e camereNotteDisponibili dichiarati in risposta', async () => {
    const res = await request(app).get(`/api/dashboard/revenue?data=${MESE_FINE}`).set(authHeader.titolare());
    const { periodo, dettaglio, revpar, trevpar } = res.body;
    const camereNotteAttese = periodo.camereAttive * periodo.giorni;
    expect(dettaglio.camereNotteDisponibili).toBe(camereNotteAttese);
    expect(revpar.attuale).toBeCloseTo(dettaglio.ricavoCamere / camereNotteAttese, 2);
    // Ricavo totale del periodo = 300+200+400+100 = 1000 (i due incassi_giornalieri di fixture)
    expect(dettaglio.ricavoTotale).toBeCloseTo(1000, 2);
    expect(trevpar.attuale).toBeCloseTo(1000 / camereNotteAttese, 2);
  });

  test('periodo senza alcun dato (2097, mai popolato) → adr null, revpar/trevpar 0, nessun errore', async () => {
    const res = await request(app).get('/api/dashboard/revenue?data=2097-06-15').set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.adr.attuale).toBeNull();
    expect(res.body.revpar.attuale).toBe(0);
    expect(res.body.trevpar.attuale).toBe(0);
  });

  test('note.trevparFonte dichiara esplicitamente la fonte manuale (da sostituire a integrazione completata)', async () => {
    const res = await request(app).get(`/api/dashboard/revenue?data=${MESE_FINE}`).set(authHeader.titolare());
    expect(res.body.note.trevparFonte).toBe('manuale');
    expect(res.body.note.camereDisponibiliApprossimate).toBe(true);
  });
});
