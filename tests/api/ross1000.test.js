// Test suite — Export ROSS1000/ISTAT (modulo 2.6, Fase 1, 04/08/2026).
// Copre solo la generazione XML (GET /api/ross1000/export) e i permessi —
// nessun invio reale al webservice regionale (non implementato in questa
// Fase 1, vedi backend/lib/ross1000Xml.js). Non asserisce valori globali di
// cameredisponibili/lettidisponibili (dipendono da tutte le camere attive
// nel DB di test, non isolabili) — solo la presenza/struttura dei dati del
// fixture creato qui.

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let cameraTestId;
let prenotazioneId;
let soggiornoId;
let ospiteCompletoId;
let ospiteIncompletoId;

const DATA_ARRIVO = '2099-04-20';
const DATA_PARTENZA = '2099-04-25';

beforeAll(async () => {
  const db = getPool();

  const camera = await db.query(
    `INSERT INTO camere (numero, nome, piano, attivo) VALUES ($1, 'Camera Test ROSS1000', 9, true) RETURNING id`,
    [`TEST-ROSS1000${SUFFISSO}`]
  );
  cameraTestId = camera.rows[0].id;

  const prenotazione = await db.query(
    `INSERT INTO prenotazioni (canale_origine, stato) VALUES ('diretta', 'confermata') RETURNING id`
  );
  prenotazioneId = prenotazione.rows[0].id;

  // Ospite con tutti i dati obbligatori del tracciato — deve comparire in <arrivi>.
  const ospiteCompleto = await db.query(
    `INSERT INTO ospiti (nome, cognome, sesso, data_nascita, cittadinanza_codice,
                          stato_residenza_codice, comune_residenza_codice,
                          stato_nascita_codice, comune_nascita_codice)
     VALUES ('Carlo', $1, 'M', '1980-05-01', '100000100', '100000100', '403015146', '100000100', '403015146')
     RETURNING id`,
    [`TestRoss1000Completo${SUFFISSO}`]
  );
  ospiteCompletoId = ospiteCompleto.rows[0].id;

  // Ospite senza cittadinanza/residenza — deve essere escluso con un avviso.
  const ospiteIncompleto = await db.query(
    `INSERT INTO ospiti (nome, cognome, sesso, data_nascita) VALUES ('Mara', $1, 'F', '1990-01-01') RETURNING id`,
    [`TestRoss1000Incompleto${SUFFISSO}`]
  );
  ospiteIncompletoId = ospiteIncompleto.rows[0].id;

  const soggiornoReale = await db.query(
    `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
     VALUES ($1, $2, $3, $4, $5, 2) RETURNING id`,
    [prenotazioneId, cameraTestId, ospiteCompletoId, DATA_ARRIVO, DATA_PARTENZA]
  );
  soggiornoId = soggiornoReale.rows[0].id;

  await db.query(
    `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1, $2, '17')`,
    [soggiornoId, ospiteCompletoId]
  );
  await db.query(
    `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1, $2, '19')`,
    [soggiornoId, ospiteIncompletoId]
  );
});

afterAll(async () => {
  const db = getPool();
  await db.query('DELETE FROM soggiorno_ospiti WHERE soggiorno_id = $1', [soggiornoId]);
  await db.query('DELETE FROM soggiorni WHERE id = $1', [soggiornoId]);
  await db.query('DELETE FROM prenotazioni WHERE id = $1', [prenotazioneId]);
  await db.query('DELETE FROM ospiti WHERE id = ANY($1)', [[ospiteCompletoId, ospiteIncompletoId]]);
  await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  await chiudiPool();
});

describe('GET /api/ross1000/export', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/ross1000/export?data_inizio=2099-04-01&data_fine=2099-04-30');
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (riservato ad admin/titolare)', async () => {
    const res = await request(app).get('/api/ross1000/export?data_inizio=2099-04-01&data_fine=2099-04-30')
      .set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('titolare, senza date → 400', async () => {
    const res = await request(app).get('/api/ross1000/export').set(authHeader.titolare());
    expect(res.status).toBe(400);
  });

  test('titolare, data_fine <= data_inizio → 400', async () => {
    const res = await request(app)
      .get('/api/ross1000/export?data_inizio=2099-04-20&data_fine=2099-04-01')
      .set(authHeader.titolare());
    expect(res.status).toBe(400);
  });

  test('titolare, intervallo valido → 200, XML con struttura/arrivi/partenze', async () => {
    const res = await request(app)
      .get(`/api/ross1000/export?data_inizio=${DATA_ARRIVO}&data_fine=2099-04-30`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(typeof res.body.xml).toBe('string');
    expect(res.body.xml).toContain('<movimenti>');
    expect(res.body.xml).toContain('<codice>');
    expect(res.body.xml).toContain(`<data>${DATA_ARRIVO.replace(/-/g, '')}</data>`);
    // Ospite completo (capofamiglia, tipo 17) presente in arrivi.
    expect(res.body.xml).toContain('<tipoalloggiato>17</tipoalloggiato>');
    // Ospite incompleto (tipo 19, senza cittadinanza/residenza) escluso, con avviso.
    expect(Array.isArray(res.body.avvisi)).toBe(true);
    expect(res.body.avvisi.some(a => a.includes('cittadinanza') || a.includes('residenza'))).toBe(true);
  });

  test('titolare, intervallo con partenza → XML contiene <partenze>', async () => {
    const res = await request(app)
      .get(`/api/ross1000/export?data_inizio=${DATA_PARTENZA}&data_fine=2099-04-30`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.xml).toContain('<partenze>');
  });

  test('titolare, giorno di chiusura forzato → apertura NO', async () => {
    const res = await request(app)
      .get(`/api/ross1000/export?data_inizio=2099-04-01&data_fine=2099-04-03&giorni_chiusura=2099-04-01`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.xml).toContain('<apertura>NO</apertura>');
  });
});
