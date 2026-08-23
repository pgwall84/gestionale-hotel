// Test suite — assunzione di ordine tra le migration 048 e 050 (code review
// 22/08/2026, Tier 2: "assunzione fragile mai verificata con un test
// dedicato"). A differenza degli altri test di questo progetto, NON crea
// fixture proprie: legge lo schema/i dati REALI prodotti dalle due
// migration, perché è proprio quello stato — non un caso sintetico — che
// l'assunzione riguarda.
//
// Contesto (vedi database/migrations/048_consolida_matrimoniale_piccola.sql
// e 050_camere_idonee_e_supplementi.sql, e docs/EVOLUTIVE.md):
// - 048 consolida le camere fisiche 2/7/12/21 (stessa stanza, due nomi su
//   Booking.com) su UN SOLO tipi_camera. Quale dei due id sopravvive
//   (Singola o Doppia uso singola) dipende da quale dei due aveva già
//   tariffe configurate — non è deciso a priori nel codice. Il
//   sopravvissuto viene SEMPRE rinominato "Matrimoniale Piccola";
//   l'eliminato viene solo disattivato (attivo=false), mai rinominato né
//   cancellato.
// - 050 presuppone che, DOPO 048, esista ancora un tipi_camera chiamato
//   esattamente 'Singola' (lo cerca con SELECT ... WHERE nome = 'Singola'
//   e si ferma con RAISE EXCEPTION se non lo trova). Questo è vero in tutti
//   i casi TRANNE uno: se "Singola" era il tipo con le tariffe già
//   configurate, allora è lui il sopravvissuto — e 048 lo rinomina via
//   "Matrimoniale Piccola" PRIMA che 050 lo cerchi. Su un ambiente dove
//   quel ramo si verifica (es. un DB di sviluppo fresco, non quello di
//   produzione dove le migration sono già state eseguite con successo),
//   048 andrebbe a buon fine ma 050 fallirebbe con un errore esplicito
//   (comportamento sicuro — non corrompe nulla — ma bloccante e mai
//   verificato con un'asserzione automatica).
//
// Questo test non re-imita le migration (richiederebbe un DB usa-e-getta
// dedicato, non disponibile in questa suite): verifica che l'INVARIANTE da
// cui dipende 050 — e da cui dipende tutta la disponibilità online delle
// camere 2/7/12/21 — sia effettivamente vera nel DB su cui gira la suite.
// Se un giorno qualcuno rinomina/cancella una di queste righe, o le
// migration vengono rieseguite su un DB fresco imboccando il ramo opposto,
// questo test si rompe SUBITO invece di scoprirlo solo quando il booking
// pubblico smette di trovare le camere 2/7/12/21.

const { getPool, chiudiPool } = require('../helpers/db');

afterAll(async () => {
  await chiudiPool();
});

describe('Migration 048 → 050 — assunzione "Singola sopravvive a 048" (code review 22/08/2026)', () => {
  test('esiste un tipi_camera chiamato "Singola" dopo 048 (precondizione di 050)', async () => {
    const db = getPool();
    const res = await db.query(`SELECT id, attivo FROM tipi_camera WHERE nome = 'Singola'`);
    // Se questa riga non esiste, la migration 050 non potrebbe nemmeno
    // essere stata applicata con successo su questo DB (fallisce con
    // RAISE EXCEPTION alla stessa ricerca) — un fallimento qui segnala che
    // l'ambiente di test non è nello stato che il resto della suite (es.
    // "Shared inventory (migration 050)" in bookingPubblico.test.js) dà
    // per scontato.
    expect(res.rows.length).toBe(1);
  });

  test('"Singola" e "Matrimoniale Piccola" sono due righe distinte (048 ha consolidato, non self-mergiato)', async () => {
    const db = getPool();
    const singola = await db.query(`SELECT id FROM tipi_camera WHERE nome = 'Singola'`);
    const matrimonialePiccola = await db.query(`SELECT id FROM tipi_camera WHERE nome = 'Matrimoniale Piccola'`);
    expect(singola.rows.length).toBe(1);
    expect(matrimonialePiccola.rows.length).toBe(1);
    // Se coincidessero, vorrebbe dire che "Singola" era il sopravvissuto di
    // 048 (rinominato "Matrimoniale Piccola") — il ramo esatto che rompe la
    // precondizione di 050 descritta in testa al file.
    expect(singola.rows[0].id).not.toBe(matrimonialePiccola.rows[0].id);
  });

  test('le 4 camere fisiche consolidate da 048 (2,7,12,21) puntano tutte a "Matrimoniale Piccola"', async () => {
    const db = getPool();
    const matrimonialePiccola = await db.query(`SELECT id FROM tipi_camera WHERE nome = 'Matrimoniale Piccola'`);
    const idMatrimonialePiccola = matrimonialePiccola.rows[0].id;

    const camere = await db.query(
      `SELECT numero, tipo_camera_id FROM camere WHERE numero IN ('2', '7', '12', '21') ORDER BY numero`
    );
    expect(camere.rows.length).toBe(4);
    for (const riga of camere.rows) {
      expect(riga.tipo_camera_id).toBe(idMatrimonialePiccola);
    }
  });

  test('tipi_camera_camere collega le stesse 4 camere sia a "Singola" sia a "Matrimoniale Piccola" (pool condiviso di 050)', async () => {
    const db = getPool();
    const singola = await db.query(`SELECT id FROM tipi_camera WHERE nome = 'Singola'`);
    const matrimonialePiccola = await db.query(`SELECT id FROM tipi_camera WHERE nome = 'Matrimoniale Piccola'`);

    const numeriAttesi = ['2', '7', '12', '21'];
    for (const tipoId of [singola.rows[0].id, matrimonialePiccola.rows[0].id]) {
      const idonee = await db.query(
        `SELECT c.numero FROM tipi_camera_camere tcc
         JOIN camere c ON c.id = tcc.camera_id
         WHERE tcc.tipo_camera_id = $1
         ORDER BY c.numero`,
        [tipoId]
      );
      expect(idonee.rows.map(r => r.numero).sort()).toEqual([...numeriAttesi].sort());
    }
  });

  test('"Doppia uso singola" esiste, è distinta da "Singola"/"Matrimoniale Piccola", capienza 1 (creata da 050)', async () => {
    const db = getPool();
    const doppiaUsoSingola = await db.query(`SELECT id, capienza_max FROM tipi_camera WHERE nome = 'Doppia uso singola'`);
    expect(doppiaUsoSingola.rows.length).toBe(1);
    expect(doppiaUsoSingola.rows[0].capienza_max).toBe(1);

    const singola = await db.query(`SELECT id FROM tipi_camera WHERE nome = 'Singola'`);
    const matrimonialePiccola = await db.query(`SELECT id FROM tipi_camera WHERE nome = 'Matrimoniale Piccola'`);
    expect(doppiaUsoSingola.rows[0].id).not.toBe(singola.rows[0].id);
    expect(doppiaUsoSingola.rows[0].id).not.toBe(matrimonialePiccola.rows[0].id);
  });
});
