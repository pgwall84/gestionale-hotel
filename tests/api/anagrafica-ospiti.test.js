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

// CRM ospiti (14-15/08/2026) — fixture dedicate, stesso cognome-radice ma
// suffisso diverso: la pulizia in afterAll usa `cognome = $1` (uguaglianza
// esatta) per l'ospite originale, quindi questi non collidono, ma per
// chiarezza restano comunque sotto COGNOME_TEST per essere riconoscibili.
let ospiteId;
let ospiteCreatoId; // creato dal test POST, ripulito a parte
let cameraTestId;
let prenotazioneTestId;
let ospiteCrmId;       // vip/blacklist/tag/allergie/totale_speso
let soggiornoCrmId;
let addebitoExtraId;
let dupId1, dupId2, dupId3; // stesso nome+cognome+data_nascita, per duplicati-sospetti/unisci

afterAll(async () => {
  const db = getPool();
  await db.query(`DELETE FROM audit_log WHERE risorsa_tipo = 'ospiti' AND risorsa_id = ANY($1)`, [
    [ospiteId, ospiteCrmId, dupId1, dupId2, dupId3].filter(Boolean),
  ]);
  if (addebitoExtraId) await db.query('DELETE FROM addebiti_extra WHERE id = $1', [addebitoExtraId]);
  await db.query('DELETE FROM soggiorni WHERE ospite_id = ANY($1)', [
    [ospiteId, ospiteCrmId, dupId1, dupId2, dupId3].filter(Boolean),
  ]);
  if (prenotazioneTestId) await db.query('DELETE FROM prenotazioni WHERE id = $1', [prenotazioneTestId]);
  if (cameraTestId) await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  // duplicato_di è una FK self-reference: azzerarla prima di cancellare,
  // altrimenti la DELETE fallisce se un test ha lasciato un'unione a metà.
  await db.query('UPDATE ospiti SET duplicato_di = NULL WHERE cognome LIKE $1', [`${COGNOME_TEST}%`]);
  await db.query('DELETE FROM ospiti WHERE cognome LIKE $1', [`${COGNOME_TEST}%`]);
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

  // ── Fixture CRM ospiti (14-15/08/2026) ──────────────────────────────────

  // Ospite dedicato a vip/blacklist/tag/allergie/totale_speso — separato da
  // ospiteId per non interferire con i test già esistenti sopra (COALESCE
  // di cognome/telefono ecc.), e con un soggiorno + un addebito extra
  // propri per verificare che totale_speso sommi entrambi (soggiorni.
  // tariffa_totale + addebiti_extra.importo), non solo la camera.
  const ospiteCrm = await db.query(
    `INSERT INTO ospiti (nome, cognome, email, telefono, consenso_marketing)
     VALUES ('Crm', $1, 'crm.test@test.hotel', '3335554433', true)
     RETURNING id`,
    [`${COGNOME_TEST}_Crm`]
  );
  ospiteCrmId = ospiteCrm.rows[0].id;

  const soggiornoCrm = await db.query(
    `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti, tariffa_totale)
     VALUES ($1, $2, $3, '2098-04-01', '2098-04-05', 1, 300)
     RETURNING id`,
    [prenotazioneTestId, cameraTestId, ospiteCrmId]
  );
  soggiornoCrmId = soggiornoCrm.rows[0].id;

  const addebitoExtra = await db.query(
    `INSERT INTO addebiti_extra (soggiorno_id, origine, descrizione, importo)
     VALUES ($1, 'altro', 'Extra di test', 30) RETURNING id`,
    [soggiornoCrmId]
  );
  addebitoExtraId = addebitoExtra.rows[0].id;

  // Tre ospiti con stesso nome+cognome+data di nascita — gruppo per
  // duplicati-sospetti/unisci. Nessun soggiorno su dup2/dup3: verifica che
  // unisci() non fallisca quando il perdente non ha nulla da riassegnare.
  const dupNome = 'Duplicato';
  const dupCognome = `${COGNOME_TEST}_Dup`;
  const dupNascita = '1980-01-01';
  const dup1 = await db.query(
    `INSERT INTO ospiti (nome, cognome, data_nascita, email) VALUES ($1, $2, $3, 'dup1.test@test.hotel') RETURNING id`,
    [dupNome, dupCognome, dupNascita]
  );
  dupId1 = dup1.rows[0].id;
  const dup2 = await db.query(
    `INSERT INTO ospiti (nome, cognome, data_nascita, telefono) VALUES ($1, $2, $3, '3330001111') RETURNING id`,
    [dupNome, dupCognome, dupNascita]
  );
  dupId2 = dup2.rows[0].id;
  const dup3 = await db.query(
    `INSERT INTO ospiti (nome, cognome, data_nascita) VALUES ($1, $2, $3) RETURNING id`,
    [dupNome, dupCognome, dupNascita]
  );
  dupId3 = dup3.rows[0].id;

  // Un soggiorno su dup2, per verificare che unisci() lo riassegni a dup1.
  await db.query(
    `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti, tariffa_totale)
     VALUES ($1, $2, $3, '2098-05-01', '2098-05-03', 1, 100)`,
    [prenotazioneTestId, cameraTestId, dupId2]
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
    // Ricerca su "Mario ${COGNOME_TEST}" (nome+cognome), non solo il
    // cognome: dal 14-15/08/2026 il beforeAll aggiunge altre fixture CRM
    // con cognome che INIZIA per COGNOME_TEST (${COGNOME_TEST}_Crm,
    // ${COGNOME_TEST}_Dup ×3) — una ricerca per solo cognome ne trova 5,
    // non più 1 (bug del test, non del codice: il match per sottostringa è
    // corretto, l'asserzione a length===1 dava per scontato un solo
    // fixture con quel prefisso). "Mario" lo distingue: solo ospiteId ha
    // nome='Mario', le altre fixture hanno nome 'Crm'/'Duplicato' — sfrutta
    // la ricerca per parole (AND tra parole) invece di allentare
    // l'asserzione, così il test resta un controllo rigido "trova
    // esattamente uno", non solo "lo trova tra altri".
    const res = await request(app)
      .get(`/api/ospiti?search=${encodeURIComponent(`Mario ${COGNOME_TEST}`)}`)
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

  // Scrittura estesa a portiere_notte il 29/08/2026 (schermata multi
  // check-in, decisione esplicita del titolare) — prima 403, vedi
  // shared/ruoli.js sezione 'ospiti'.scrittura.
  test('portiere_notte → 201 (scrittura estesa 29/08/2026, multi check-in)', async () => {
    const res = await request(app)
      .post('/api/ospiti')
      .set(authHeader.portiere_notte())
      .send({ nome: 'Luigi', cognome: `${COGNOME_TEST}_portiere_notte` });
    expect(res.status).toBe(201);
    await getPool().query('DELETE FROM ospiti WHERE id = $1', [res.body.id]);
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

  // Scrittura estesa a portiere_notte il 29/08/2026 (schermata multi
  // check-in, decisione esplicita del titolare) — prima 403. Stesso valore
  // già usato dal test admin sotto: idempotente, non sposta lo stato per
  // quel test.
  test('portiere_notte → 200 (scrittura estesa 29/08/2026, multi check-in)', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteId}`)
      .set(authHeader.portiere_notte())
      .send({ telefono: '3339999999' });
    expect(res.status).toBe(200);
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

// ═══════════════════════════════════════════════════════════════════════════
// CRM ospiti (14-15/08/2026) — vip/blacklist/allergie/tag, ricerca per
// parole, totale_speso, duplicati-sospetti, unisci. Vedi docs/EVOLUTIVE.md
// voce "CRM ospiti con preferenze/tag" per il contesto completo.
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/ospiti — ricerca, filtri e ordinamento CRM ────────────────────

describe('GET /api/ospiti — ricerca per parole, filtri e ordinamento CRM', () => {
  test('ricerca "nome cognome" insieme trova l\'ospite (bug reale corretto 15/08/2026)', async () => {
    const res = await request(app)
      .get(`/api/ospiti?search=${encodeURIComponent(`Mario ${COGNOME_TEST}`)}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.find(o => o.id === ospiteId)).toBeDefined();
  });

  test('ricerca con le parole in ordine invertito (cognome nome) trova comunque l\'ospite', async () => {
    const res = await request(app)
      .get(`/api/ospiti?search=${encodeURIComponent(`${COGNOME_TEST} Mario`)}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.find(o => o.id === ospiteId)).toBeDefined();
  });

  test('ricerca con una parola che non corrisponde a nulla → nessun risultato per quell\'ospite', async () => {
    const res = await request(app)
      .get(`/api/ospiti?search=${encodeURIComponent(`Mario ParolaCheNonEsiste123`)}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.find(o => o.id === ospiteId)).toBeUndefined();
  });

  test('filtro tag trova solo gli ospiti con quel tag', async () => {
    const tagUnico = `tag_test_${Date.now()}`;
    await request(app).patch(`/api/ospiti/${ospiteCrmId}`).set(authHeader.admin()).send({ tag: [tagUnico] });

    const res = await request(app)
      .get(`/api/ospiti?tag=${encodeURIComponent(tagUnico)}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.map(o => o.id)).toEqual([ospiteCrmId]);
  });

  test('filtro vip=true trova solo gli ospiti vip', async () => {
    await request(app).patch(`/api/ospiti/${ospiteCrmId}`).set(authHeader.admin()).send({ vip: true });

    const res = await request(app)
      .get(`/api/ospiti?search=${encodeURIComponent(COGNOME_TEST)}&vip=true`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.find(o => o.id === ospiteCrmId)).toBeDefined();
    expect(res.body.find(o => o.id === ospiteId)).toBeUndefined(); // non vip
  });

  test('totale_speso somma soggiorni.tariffa_totale + addebiti_extra.importo', async () => {
    const res = await request(app).get(`/api/ospiti/${ospiteCrmId}`).set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(Number(res.body.totale_speso)).toBe(330); // 300 (soggiorno) + 30 (addebito extra)
  });

  test('ordina=totale_speso&direzione=desc → l\'ospite CRM (330) viene prima di quello con solo 250', async () => {
    const res = await request(app)
      .get(`/api/ospiti?search=${encodeURIComponent(COGNOME_TEST)}&ordina=totale_speso&direzione=desc&limit=50`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(200);
    const posCrm = res.body.findIndex(o => o.id === ospiteCrmId);
    const posBase = res.body.findIndex(o => o.id === ospiteId);
    expect(posCrm).toBeGreaterThanOrEqual(0);
    expect(posBase).toBeGreaterThanOrEqual(0);
    expect(posCrm).toBeLessThan(posBase);
  });
});

// ─── GET /api/ospiti/tag ─────────────────────────────────────────────────────

describe('GET /api/ospiti/tag', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/ospiti/tag');
    expect(res.status).toBe(401);
  });

  test('receptionist → 200, contiene il tag assegnato a ospiteCrmId', async () => {
    const tagUnico = `tag_suggeriti_${Date.now()}`;
    await request(app).patch(`/api/ospiti/${ospiteCrmId}`).set(authHeader.admin()).send({ tag: [tagUnico] });

    const res = await request(app).get('/api/ospiti/tag').set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toContain(tagUnico);
  });
});

// ─── PATCH /api/ospiti/:id — vip/blacklist/allergie/tag ──────────────────────

describe('PATCH /api/ospiti/:id — CRM (vip, blacklist, allergie, tag)', () => {
  test('imposta blacklist=true + blacklist_motivo → 200, entrambi salvati', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteCrmId}`)
      .set(authHeader.admin())
      .send({ blacklist: true, blacklist_motivo: 'Motivo di test' });
    expect(res.status).toBe(200);
    expect(res.body.blacklist).toBe(true);
    expect(res.body.blacklist_motivo).toBe('Motivo di test');
  });

  test('rimette blacklist=false esplicito → 200, resta false (non collassa a null/invariato)', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteCrmId}`)
      .set(authHeader.admin())
      .send({ blacklist: false });
    expect(res.status).toBe(200);
    expect(res.body.blacklist).toBe(false);
  });

  test('imposta allergie → 200, salvata', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteCrmId}`)
      .set(authHeader.admin())
      .send({ allergie: 'Allergia ai crostacei' });
    expect(res.status).toBe(200);
    expect(res.body.allergie).toBe('Allergia ai crostacei');
  });

  test('imposta tag=["a","b"] → 200, salvati entrambi', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteCrmId}`)
      .set(authHeader.admin())
      .send({ tag: ['a_test', 'b_test'] });
    expect(res.status).toBe(200);
    expect(res.body.tag.sort()).toEqual(['a_test', 'b_test']);
  });

  test('PATCH che omette tag → tag resta invariato (COALESCE, non azzerato)', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteCrmId}`)
      .set(authHeader.admin())
      .send({ telefono: '3330000000' });
    expect(res.status).toBe(200);
    expect(res.body.tag.sort()).toEqual(['a_test', 'b_test']);
  });

  test('imposta tag=[] esplicito → 200, tag svuotato per davvero', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteCrmId}`)
      .set(authHeader.admin())
      .send({ tag: [] });
    expect(res.status).toBe(200);
    expect(res.body.tag).toEqual([]);
  });

  test('tag non è un array → 400', async () => {
    const res = await request(app)
      .patch(`/api/ospiti/${ospiteCrmId}`)
      .set(authHeader.admin())
      .send({ tag: 'non-un-array' });
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/ospiti/duplicati-sospetti ──────────────────────────────────────

describe('GET /api/ospiti/duplicati-sospetti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/ospiti/duplicati-sospetti');
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (permesso unisci, più stretto della lettura)', async () => {
    const res = await request(app).get('/api/ospiti/duplicati-sospetti').set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('titolare → 200, trova il gruppo dei 3 ospiti di test (stesso nome+cognome+data di nascita)', async () => {
    const res = await request(app).get('/api/ospiti/duplicati-sospetti').set(authHeader.titolare());
    expect(res.status).toBe(200);
    const gruppo = res.body.find(g => g.candidati.some(c => c.id === dupId1));
    expect(gruppo).toBeDefined();
    const idsGruppo = gruppo.candidati.map(c => c.id).sort((a, b) => a - b);
    expect(idsGruppo).toEqual([dupId1, dupId2, dupId3].sort((a, b) => a - b));
  });
});

// ─── POST /api/ospiti/:id/unisci ─────────────────────────────────────────────

describe('POST /api/ospiti/:id/unisci', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post(`/api/ospiti/${dupId1}/unisci`).send({ con_id: dupId2 });
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (permesso unisci, solo admin/titolare)', async () => {
    const res = await request(app)
      .post(`/api/ospiti/${dupId1}/unisci`)
      .set(authHeader.receptionist())
      .send({ con_id: dupId2 });
    expect(res.status).toBe(403);
  });

  test('vincitore === perdente → 400', async () => {
    const res = await request(app)
      .post(`/api/ospiti/${dupId1}/unisci`)
      .set(authHeader.titolare())
      .send({ con_id: dupId1 });
    expect(res.status).toBe(400);
  });

  test('titolare unisce dupId2 in dupId1 → 200, soggiorno riassegnato, dupId2 marcato duplicato_di', async () => {
    const res = await request(app)
      .post(`/api/ospiti/${dupId1}/unisci`)
      .set(authHeader.titolare())
      .send({ con_id: dupId2 });
    expect(res.status).toBe(200);
    expect(res.body.vincitore_id).toBe(dupId1);
    expect(res.body.perdente_id).toBe(dupId2);

    const db = getPool();
    const soggiorno = await db.query('SELECT ospite_id FROM soggiorni WHERE data_arrivo = $1', ['2098-05-01']);
    expect(soggiorno.rows[0].ospite_id).toBe(dupId1);

    const perdente = await db.query('SELECT duplicato_di FROM ospiti WHERE id = $1', [dupId2]);
    expect(perdente.rows[0].duplicato_di).toBe(dupId1);
  });

  test('dupId2 (assorbito) escluso dalla lista di default, presente con includi_duplicati=true', async () => {
    const senzaFlag = await request(app)
      .get(`/api/ospiti?search=Duplicato&limit=50`)
      .set(authHeader.receptionist());
    expect(senzaFlag.body.find(o => o.id === dupId2)).toBeUndefined();

    const conFlag = await request(app)
      .get(`/api/ospiti?search=Duplicato&limit=50&includi_duplicati=true`)
      .set(authHeader.receptionist());
    expect(conFlag.body.find(o => o.id === dupId2)).toBeDefined();
  });

  test('unione registrata in audit_log', async () => {
    const db = getPool();
    const log = await db.query(
      `SELECT * FROM audit_log WHERE risorsa_tipo = 'ospiti' AND risorsa_id = $1 AND azione = 'unisci_ospiti'
       ORDER BY created_at DESC LIMIT 1`,
      [dupId1]
    );
    expect(log.rows.length).toBe(1);
  });

  test('gruppo a 3 candidati: unisce anche dupId3 in dupId1 → entrambi i perdenti puntano allo stesso vincitore', async () => {
    const res = await request(app)
      .post(`/api/ospiti/${dupId1}/unisci`)
      .set(authHeader.titolare())
      .send({ con_id: dupId3 });
    expect(res.status).toBe(200);

    const db = getPool();
    const perdenti = await db.query('SELECT id, duplicato_di FROM ospiti WHERE id = ANY($1)', [[dupId2, dupId3]]);
    for (const p of perdenti.rows) {
      expect(p.duplicato_di).toBe(dupId1);
    }
  });
});
