// Test suite — Pre check-in self-service (modulo 5.2 Fase B, 04/08/2026).
// Copre: flusso pubblico (GET/POST /api/pre-checkin-pubblico/:token, senza
// autenticazione), coda di revisione lato reception (/api/pre-checkin),
// applica (crea/aggiorna ospiti + soggiorno_ospiti + nucleo familiare),
// scarta, e gli endpoint di /api/nuclei-familiari. Il token in chiaro non è
// mai esposto da un endpoint HTTP (solo il suo hash è in DB) — nei test si
// ottiene chiamando direttamente backend/lib/preCheckin.js.assicuraToken,
// bypassando l'invio email reale (RESEND_API_KEY rimossa per la durata
// della suite, stesso pattern di email-prenotazioni.test.js).

const request = require('supertest');
const app     = require('../../backend/app');
const { authHeader } = require('../helpers/auth');
const { getPool, chiudiPool } = require('../helpers/db');
const { assicuraToken } = require('../../backend/lib/preCheckin');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let cameraTestId;
let ospiteCapofamigliaId;
let resendApiKeyOriginale;
const prenotazioniCreate = [];
const nucleiCreati = [];

// overrides opzionale (11/08/2026): le chiamate successive a beforeAll
// riusavano data_arrivo/data_partenza fissi sulla stessa camera, violando
// il vincolo anti-overbooking (migration 017) dalla seconda in poi —
// stesso bug, stessa causa, già trovato e corretto in
// tests/api/email-prenotazioni.test.js. Pattern overrides allineato a
// tests/api/prenotazioni.test.js.
async function creaPrenotazione(ospiteId, overrides = {}) {
  const { soggiorno: soggiornoOverride, ...restOverrides } = overrides;
  const res = await request(app)
    .post('/api/prenotazioni')
    .set(authHeader.receptionist())
    .send({
      canale_origine: 'diretta',
      soggiorno: {
        camera_id: cameraTestId,
        ospite_id: ospiteId,
        data_arrivo: '2099-03-10',
        data_partenza: '2099-03-15',
        num_ospiti: 2,
        ...soggiornoOverride,
      },
      ...restOverrides,
    });
  if (res.status === 201) prenotazioniCreate.push(res.body.id);
  return res;
}

beforeAll(async () => {
  resendApiKeyOriginale = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  const db = getPool();
  // Prefisso accorciato (11.08.2026): "TEST-PRECHECKIN"+SUFFISSO (22 char)
  // superava camere.numero VARCHAR(20) — root cause della intera suite rossa
  // (INSERT falliva in beforeAll, cameraTestId restava undefined, ogni test
  // a valle vedeva 400/500 a cascata). Stesso limite rispettato dagli altri
  // file (es. TEST-ROSS1000+6 cifre = 20 char esatti).
  const camera = await db.query(
    `INSERT INTO camere (numero, nome, piano) VALUES ($1, 'Camera Test Pre-Checkin', 9) RETURNING id`,
    [`TEST-PRECHK${SUFFISSO}`]
  );
  cameraTestId = camera.rows[0].id;

  const ospite = await db.query(
    `INSERT INTO ospiti (nome, cognome) VALUES ('Anna', $1) RETURNING id`,
    [`TestPreCheckinCapofamiglia${SUFFISSO}`]
  );
  ospiteCapofamigliaId = ospite.rows[0].id;
});

afterAll(async () => {
  if (resendApiKeyOriginale !== undefined) process.env.RESEND_API_KEY = resendApiKeyOriginale;

  const db = getPool();
  await db.query('DELETE FROM pre_checkin_ospiti WHERE richiesta_id IN (SELECT id FROM pre_checkin_richieste WHERE prenotazione_id = ANY($1))', [prenotazioniCreate]);
  await db.query('DELETE FROM pre_checkin_richieste WHERE prenotazione_id = ANY($1)', [prenotazioniCreate]);
  await db.query('DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (SELECT id FROM soggiorni WHERE camera_id = $1)', [cameraTestId]);
  await db.query('DELETE FROM soggiorni WHERE camera_id = $1', [cameraTestId]);
  if (prenotazioniCreate.length) {
    await db.query('DELETE FROM prenotazioni WHERE id = ANY($1)', [prenotazioniCreate]);
  }
  // Sgancia il nucleo dagli ospiti creati durante il test prima di cancellarli.
  await db.query(`UPDATE ospiti SET nucleo_familiare_id = NULL WHERE cognome LIKE $1`, [`TestPreCheckin%${SUFFISSO}`]);
  await db.query('DELETE FROM ospiti WHERE cognome LIKE $1', [`TestPreCheckin%${SUFFISSO}`]);
  await db.query('DELETE FROM ospiti WHERE id = $1', [ospiteCapofamigliaId]);
  if (nucleiCreati.length) {
    await db.query('DELETE FROM nuclei_familiari WHERE id = ANY($1)', [nucleiCreati]);
  }
  await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  await chiudiPool();
});

describe('Flusso pubblico — GET/POST /api/pre-checkin-pubblico/:token', () => {
  let prenotazioneId;
  let token;

  beforeAll(async () => {
    const creata = await creaPrenotazione(ospiteCapofamigliaId);
    expect(creata.status).toBe(201);
    prenotazioneId = creata.body.id;
    const link = await assicuraToken(prenotazioneId);
    token = link.split('/').pop();
  });

  test('token inesistente → 404', async () => {
    const res = await request(app).get('/api/pre-checkin-pubblico/token-che-non-esiste');
    expect(res.status).toBe(404);
  });

  test('token valido → 200, elenco soggiorni, giaInviato false', async () => {
    const res = await request(app).get(`/api/pre-checkin-pubblico/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.giaInviato).toBe(false);
    expect(Array.isArray(res.body.soggiorni)).toBe(true);
    expect(res.body.soggiorni.length).toBe(1);
  });

  test('POST senza consenso → 400', async () => {
    const res = await request(app).post(`/api/pre-checkin-pubblico/${token}`).send({
      consenso_privacy_accettato: false,
      ospiti: [{ soggiorno_id: 1, nome: 'Test', cognome: 'Test' }],
    });
    expect(res.status).toBe(400);
  });

  test('POST senza ospiti → 400', async () => {
    const res = await request(app).post(`/api/pre-checkin-pubblico/${token}`).send({
      consenso_privacy_accettato: true,
      ospiti: [],
    });
    expect(res.status).toBe(400);
  });

  test('POST valido → 201, ok:true', async () => {
    const dettaglio = await request(app).get(`/api/pre-checkin-pubblico/${token}`);
    const soggiornoId = dettaglio.body.soggiorni[0].id;

    const res = await request(app).post(`/api/pre-checkin-pubblico/${token}`).send({
      consenso_privacy_accettato: true,
      note_referente: 'Arriviamo tardi',
      ospiti: [
        { soggiorno_id: soggiornoId, nome: 'Anna', cognome: `TestPreCheckinCapofamiglia${SUFFISSO}`, sesso: 'F', cittadinanza_testo: 'Italia' },
        { soggiorno_id: soggiornoId, nome: 'Bruno', cognome: `TestPreCheckinFamiliare${SUFFISSO}`, sesso: 'M' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  test('GET dopo invio → giaInviato true', async () => {
    const res = await request(app).get(`/api/pre-checkin-pubblico/${token}`);
    expect(res.body.giaInviato).toBe(true);
  });

  test('secondo POST sulla stessa prenotazione → 409', async () => {
    const dettaglio = await request(app).get(`/api/pre-checkin-pubblico/${token}`);
    const res = await request(app).post(`/api/pre-checkin-pubblico/${token}`).send({
      consenso_privacy_accettato: true,
      ospiti: [{ soggiorno_id: dettaglio.body.soggiorni[0].id, nome: 'X', cognome: 'Y' }],
    });
    expect(res.status).toBe(409);
  });

  describe('Coda di revisione — /api/pre-checkin (autenticato)', () => {
    test('senza token → 401', async () => {
      const res = await request(app).get('/api/pre-checkin');
      expect(res.status).toBe(401);
    });

    test('cuoco → 403', async () => {
      const res = await request(app).get('/api/pre-checkin').set(authHeader.cuoco());
      expect(res.status).toBe(403);
    });

    test('titolare → 200, contiene la richiesta appena creata', async () => {
      const res = await request(app).get('/api/pre-checkin?stato=in_attesa').set(authHeader.titolare());
      expect(res.status).toBe(200);
      const trovata = res.body.find(r => r.prenotazione_id === prenotazioneId);
      expect(trovata).toBeTruthy();
      // COUNT(*) di Postgres torna bigint. Fino al 14/08/2026 node-pg lo
      // restituiva come stringa (nessun type parser per OID 20 in
      // backend/config/db.js) — da quella data c'è, quindi questo sarebbe
      // già un number anche senza Number(...). Lasciato esplicito: non fa
      // male (Number(5) === 5) e non lega il test all'implementazione
      // interna del parser globale.
      expect(Number(trovata.numero_ospiti)).toBe(2);
    });

    test('titolare, dettaglio → include capofamiglia_id esistente sulla prima riga', async () => {
      const lista = await request(app).get('/api/pre-checkin?stato=in_attesa').set(authHeader.titolare());
      const richiestaId = lista.body.find(r => r.prenotazione_id === prenotazioneId).id;

      const res = await request(app).get(`/api/pre-checkin/${richiestaId}`).set(authHeader.titolare());
      expect(res.status).toBe(200);
      expect(res.body.ospiti.length).toBe(2);
      expect(res.body.ospiti[0].capofamiglia_id).toBe(ospiteCapofamigliaId);
    });

    test('titolare, applica → crea nuovo ospite, aggiorna capofamiglia esistente, collega entrambi allo stesso nucleo', async () => {
      const lista = await request(app).get('/api/pre-checkin?stato=in_attesa').set(authHeader.titolare());
      const richiesta = lista.body.find(r => r.prenotazione_id === prenotazioneId);
      const dettaglio = await request(app).get(`/api/pre-checkin/${richiesta.id}`).set(authHeader.titolare());
      const [primo, secondo] = dettaglio.body.ospiti;

      const res = await request(app).post(`/api/pre-checkin/${richiesta.id}/applica`).set(authHeader.titolare()).send({
        ospiti: [
          { pre_checkin_ospiti_id: primo.id, soggiorno_id: primo.soggiorno_id, ospite_id_esistente: ospiteCapofamigliaId, tipo_alloggiato: '17', nome: primo.nome, cognome: primo.cognome },
          { pre_checkin_ospiti_id: secondo.id, soggiorno_id: secondo.soggiorno_id, tipo_alloggiato: '19', nome: secondo.nome, cognome: secondo.cognome },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.nucleo_familiare_id).toBeTruthy();
      nucleiCreati.push(res.body.nucleo_familiare_id);

      const db = getPool();
      const ospiti = await db.query('SELECT id, nucleo_familiare_id FROM ospiti WHERE id = ANY($1)', [res.body.ospiti_creati]);
      expect(ospiti.rows.every(o => o.nucleo_familiare_id === res.body.nucleo_familiare_id)).toBe(true);

      const collegamenti = await db.query('SELECT tipo_alloggiato FROM soggiorno_ospiti WHERE soggiorno_id = $1 AND ospite_id = ANY($2)', [primo.soggiorno_id, res.body.ospiti_creati]);
      expect(collegamenti.rows.length).toBe(2);
    });

    test('titolare, riapplicare la stessa richiesta → 400 (già applicata)', async () => {
      const lista = await request(app).get('/api/pre-checkin?stato=applicata').set(authHeader.titolare());
      const richiesta = lista.body.find(r => r.prenotazione_id === prenotazioneId);
      const res = await request(app).post(`/api/pre-checkin/${richiesta.id}/applica`).set(authHeader.titolare()).send({ ospiti: [{ soggiorno_id: 1, nome: 'x', cognome: 'y', tipo_alloggiato: '19' }] });
      expect(res.status).toBe(400);
    });
  });
});

describe('Scarta — POST /api/pre-checkin/:id/scarta', () => {
  test('titolare scarta una richiesta in attesa → 200, poi un nuovo invio pubblico è di nuovo possibile', async () => {
    const creata = await creaPrenotazione(ospiteCapofamigliaId, { soggiorno: { data_arrivo: '2099-04-10', data_partenza: '2099-04-15' } });
    const link = await assicuraToken(creata.body.id);
    const token = link.split('/').pop();
    const dettaglio = await request(app).get(`/api/pre-checkin-pubblico/${token}`);

    const invio = await request(app).post(`/api/pre-checkin-pubblico/${token}`).send({
      consenso_privacy_accettato: true,
      ospiti: [{ soggiorno_id: dettaglio.body.soggiorni[0].id, nome: 'Scarta', cognome: 'Test' }],
    });
    expect(invio.status).toBe(201);

    const lista = await request(app).get('/api/pre-checkin?stato=in_attesa').set(authHeader.titolare());
    const richiesta = lista.body.find(r => r.prenotazione_id === creata.body.id);

    const scarto = await request(app).post(`/api/pre-checkin/${richiesta.id}/scarta`).set(authHeader.titolare()).send({ motivo: 'dati incompleti' });
    expect(scarto.status).toBe(200);

    // Dopo lo scarto, un nuovo invio sulla stessa prenotazione è di nuovo ammesso.
    const secondoInvio = await request(app).post(`/api/pre-checkin-pubblico/${token}`).send({
      consenso_privacy_accettato: true,
      ospiti: [{ soggiorno_id: dettaglio.body.soggiorni[0].id, nome: 'Scarta2', cognome: 'Test2' }],
    });
    expect(secondoInvio.status).toBe(201);
  });
});

describe('/api/nuclei-familiari', () => {
  test('crea, dettaglio, aggiorna etichetta', async () => {
    const creato = await request(app).post('/api/nuclei-familiari').set(authHeader.titolare()).send({ etichetta: 'Famiglia Test' });
    expect(creato.status).toBe(201);
    nucleiCreati.push(creato.body.id);

    const dettaglio = await request(app).get(`/api/nuclei-familiari/${creato.body.id}`).set(authHeader.titolare());
    expect(dettaglio.status).toBe(200);
    expect(dettaglio.body.etichetta).toBe('Famiglia Test');
    expect(dettaglio.body.membri).toEqual([]);

    const aggiornato = await request(app).patch(`/api/nuclei-familiari/${creato.body.id}`).set(authHeader.titolare()).send({ etichetta: 'Famiglia Test Modificata' });
    expect(aggiornato.status).toBe(200);
    expect(aggiornato.body.etichetta).toBe('Famiglia Test Modificata');
  });

  test('dettaglio nucleo inesistente → 404', async () => {
    const res = await request(app).get('/api/nuclei-familiari/999999999').set(authHeader.titolare());
    expect(res.status).toBe(404);
  });
});

describe('POST /api/ospiti/:id/nucleo', () => {
  test('collega e scollega un cliente esistente', async () => {
    const nucleo = await request(app).post('/api/nuclei-familiari').set(authHeader.titolare()).send({});
    nucleiCreati.push(nucleo.body.id);

    const collegato = await request(app).post(`/api/ospiti/${ospiteCapofamigliaId}/nucleo`).set(authHeader.titolare()).send({ nucleo_familiare_id: nucleo.body.id });
    expect(collegato.status).toBe(200);
    expect(collegato.body.nucleo_familiare_id).toBe(nucleo.body.id);

    const scollegato = await request(app).post(`/api/ospiti/${ospiteCapofamigliaId}/nucleo`).set(authHeader.titolare()).send({ nucleo_familiare_id: null });
    expect(scollegato.status).toBe(200);
    expect(scollegato.body.nucleo_familiare_id).toBeNull();
  });
});

describe('POST /api/prenotazioni/:id/invia-pre-checkin (invio manuale reale)', () => {
  test('receptionist → 200, senza RESEND_API_KEY ok:false, non lancia', async () => {
    const creata = await creaPrenotazione(ospiteCapofamigliaId, { soggiorno: { data_arrivo: '2099-05-10', data_partenza: '2099-05-15' } });
    const res = await request(app).post(`/api/prenotazioni/${creata.body.id}/invia-pre-checkin`).set(authHeader.receptionist());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  test('cuoco → 403', async () => {
    const creata = await creaPrenotazione(ospiteCapofamigliaId, { soggiorno: { data_arrivo: '2099-06-10', data_partenza: '2099-06-15' } });
    const res = await request(app).post(`/api/prenotazioni/${creata.body.id}/invia-pre-checkin`).set(authHeader.cuoco());
    expect(res.status).toBe(403);
  });
});
