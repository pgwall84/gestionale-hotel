// tests/lib/prenotazioni/confermaPrenotazione.test.js
// Fixture via tests/helpers/db.js (pool separato, stesso DB di sviluppo —
// vedi tests/setup.js). confermaPrenotazione.js usa invece il pool di
// backend/config/db.js (stesso pool dell'app in produzione), chiuso
// centralmente da tests/setup-after-env.js: qui chiudiamo solo il pool dei
// helper, mai quello dell'app.
const { getPool, chiudiPool } = require('../../helpers/db');
const { confermaPrenotazione } = require('../../../backend/lib/prenotazioni/confermaPrenotazione');

const prenotazioniCreate = [];

// Fixture minima: prenotazioni non richiede soggiorni/camere/ospiti per
// esistere (unico NOT NULL oltre le colonne con default e' canale_origine,
// vedi database/migrations/016_prenotazioni_fase2.sql) — confermaPrenotazione
// tocca solo prenotazioni/pagamenti (e soggiorni, ma un UPDATE senza righe
// corrispondenti non fallisce), quindi il test non ha bisogno di crearne.
// canale_origine='test_interno': convenzione del progetto per dati di test,
// esclusa esplicitamente dai job schedulati reali (jobs/invioAlloggiatiWeb.js).
async function creaPrenotazioneConHold({ minutiScadenza, statoIniziale = 'opzione' }) {
  const db = getPool();
  const { rows } = await db.query(
    `INSERT INTO prenotazioni (canale_origine, stato, data_scadenza_opzione)
     VALUES ('test_interno', $1, NOW() + make_interval(mins => $2))
     RETURNING id`,
    [statoIniziale, minutiScadenza]
  );
  prenotazioniCreate.push(rows[0].id);
  return rows[0].id;
}

async function creaPagamentoPending(prenotazioneId, externalPaymentId) {
  const db = getPool();
  await db.query(
    `INSERT INTO pagamenti (prenotazione_id, importo, tipo, stato, external_payment_id)
     VALUES ($1, 10.00, 'caparra', 'pending', $2)`,
    [prenotazioneId, externalPaymentId]
  );
}

describe('confermaPrenotazione', () => {
  afterAll(async () => {
    const db = getPool();
    if (prenotazioniCreate.length) {
      await db.query('DELETE FROM pagamenti WHERE prenotazione_id = ANY($1::int[])', [prenotazioniCreate]);
      await db.query('DELETE FROM soggiorni WHERE prenotazione_id = ANY($1::int[])', [prenotazioniCreate]);
      await db.query('DELETE FROM prenotazioni WHERE id = ANY($1::int[])', [prenotazioniCreate]);
    }
    await chiudiPool();
  });

  test('conferma normale: opzione non scaduta -> confermata + pagamento completato', async () => {
    const prenotazioneId = await creaPrenotazioneConHold({ minutiScadenza: 15 });
    await creaPagamentoPending(prenotazioneId, 'EXT-1');

    const risultato = await confermaPrenotazione({ prenotazioneId, externalPaymentId: 'EXT-1' });

    expect(risultato.esito).toBe('confermata');
    const db = getPool();
    const p = await db.query(`SELECT stato FROM prenotazioni WHERE id = $1`, [prenotazioneId]);
    expect(p.rows[0].stato).toBe('confermata');
    const pag = await db.query(`SELECT stato FROM pagamenti WHERE prenotazione_id = $1`, [prenotazioneId]);
    expect(pag.rows[0].stato).toBe('completato');
  });

  test('hold scaduto ma ancora in stato opzione (cron non ancora passato) -> scaduta, prenotazione interrotta', async () => {
    const prenotazioneId = await creaPrenotazioneConHold({ minutiScadenza: -1 });
    await creaPagamentoPending(prenotazioneId, 'EXT-2');

    const risultato = await confermaPrenotazione({ prenotazioneId, externalPaymentId: 'EXT-2' });

    expect(risultato.esito).toBe('scaduta');
    expect(risultato.pagamentoId).toBeDefined();
    const db = getPool();
    const p = await db.query(`SELECT stato FROM prenotazioni WHERE id = $1`, [prenotazioneId]);
    expect(p.rows[0].stato).toBe('interrotta');
    const pag = await db.query(`SELECT stato FROM pagamenti WHERE prenotazione_id = $1`, [prenotazioneId]);
    expect(pag.rows[0].stato).toBe('pending');
  });

  test('race: cron ha gia interrotto la prenotazione prima della conferma -> race, pagamento resta pending', async () => {
    const prenotazioneId = await creaPrenotazioneConHold({ minutiScadenza: 15, statoIniziale: 'interrotta' });
    await creaPagamentoPending(prenotazioneId, 'EXT-3');

    const risultato = await confermaPrenotazione({ prenotazioneId, externalPaymentId: 'EXT-3' });

    expect(risultato.esito).toBe('race');
    expect(risultato.pagamentoId).toBeDefined();
  });

  test('prenotazione inesistente -> non_trovata', async () => {
    const risultato = await confermaPrenotazione({ prenotazioneId: 999999999, externalPaymentId: 'EXT-X' });
    expect(risultato.esito).toBe('non_trovata');
  });

  test('evento duplicato: stato gia non-opzione e nessun pagamento pending corrispondente -> gia_gestita', async () => {
    const prenotazioneId = await creaPrenotazioneConHold({ minutiScadenza: 15, statoIniziale: 'confermata' });
    const risultato = await confermaPrenotazione({ prenotazioneId, externalPaymentId: 'EXT-INESISTENTE' });
    expect(risultato.esito).toBe('gia_gestita');
  });
});
