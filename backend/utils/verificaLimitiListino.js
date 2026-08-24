// backend/utils/verificaLimitiListino.js
// Calcola il range [minimo, massimo] dichiarato per il cartellino di un
// tipo camera, su un intervallo di notti, sommando eventuale supplemento
// trattamento — e confronta un valore (tariffa_totale) contro quel range.
// Usata dai punti di scrittura umana sulla prenotazione
// (prenotazioniController.crea/aggiungiSoggiorno, soggiorniController.aggiorna)
// — il form /tariffe fa un controllo più semplice, auto-contenuto sulla riga
// che sta salvando (vedi tariffeController.js).
//
// Un tipo camera è "madre" se non ha righe in regole_derivazione_tariffe
// (min/max diretti da `tariffe`), "derivato" altrimenti (min/max diretti
// dalla regola di derivazione — NON dal tipo base: il min/max è la
// dichiarazione del cartellino DI QUELLA tipologia, indipendente da come si
// arriva al prezzo calcolato). Stesso principio "dedotto dai dati, mai da
// un elenco fisso di nomi" già usato in frontend/app/tariffe/page.jsx.
//
// Se una notte non ha alcun min/max configurato, quella notte non contribuisce
// al range (somma solo sulle notti che HANNO un limite) — se NESSUNA notte ha
// un limite, il range è [null, null] (nessun controllo, coerente con il resto
// del codebase dove null = "nessun vincolo", mai un blocco per dati mancanti).

const pool = require('../config/db');
const { calcolaSupplementoTrattamento } = require('../controllers/tariffeController');

async function verificaLimitiListino({ tipoCameraId, trattamento, dataArrivo, dataPartenza, valore, db = pool }) {
  const regoleResult = await db.query(
    `SELECT periodo_id, prezzo_minimo, prezzo_massimo FROM regole_derivazione_tariffe WHERE tipo_camera_id = $1`,
    [tipoCameraId]
  );
  const isDerivata = regoleResult.rows.length > 0;

  const nottiResult = await db.query(
    `SELECT n.notte::date AS notte, per.id AS periodo_id
     FROM generate_series($1::date, $2::date - INTERVAL '1 day', INTERVAL '1 day') AS n(notte)
     LEFT JOIN periodi_stagionali per ON n.notte::date BETWEEN per.data_inizio AND per.data_fine
     ORDER BY n.notte`,
    [dataArrivo, dataPartenza]
  );

  let minimoTotale = null;
  let massimoTotale = null;

  if (isDerivata) {
    const perPeriodo = new Map();
    let fallback = null;
    for (const r of regoleResult.rows) {
      if (r.periodo_id === null) fallback = r;
      else perPeriodo.set(r.periodo_id, r);
    }
    for (const { periodo_id } of nottiResult.rows) {
      const regola = (periodo_id !== null && perPeriodo.get(periodo_id)) || fallback;
      if (!regola) continue;
      if (regola.prezzo_minimo !== null) minimoTotale = (minimoTotale ?? 0) + Number(regola.prezzo_minimo);
      if (regola.prezzo_massimo !== null) massimoTotale = (massimoTotale ?? 0) + Number(regola.prezzo_massimo);
    }
  } else {
    const tariffeResult = await db.query(
      `SELECT n.notte::date AS notte, t.prezzo_minimo, t.prezzo_massimo
       FROM generate_series($2::date, $3::date - INTERVAL '1 day', INTERVAL '1 day') AS n(notte)
       LEFT JOIN tariffe t
         ON t.tipo_camera_id = $1
        AND n.notte::date BETWEEN t.data_inizio AND t.data_fine
       ORDER BY n.notte`,
      [tipoCameraId, dataArrivo, dataPartenza]
    );
    for (const r of tariffeResult.rows) {
      if (r.prezzo_minimo !== null) minimoTotale = (minimoTotale ?? 0) + Number(r.prezzo_minimo);
      if (r.prezzo_massimo !== null) massimoTotale = (massimoTotale ?? 0) + Number(r.prezzo_massimo);
    }
  }

  if (trattamento && trattamento !== 'bb' && (minimoTotale !== null || massimoTotale !== null)) {
    const supplemento = await calcolaSupplementoTrattamento(tipoCameraId, dataArrivo, dataPartenza, trattamento, 2, []);
    if (minimoTotale !== null) minimoTotale = Math.round((minimoTotale + supplemento.totale) * 100) / 100;
    if (massimoTotale !== null) massimoTotale = Math.round((massimoTotale + supplemento.totale) * 100) / 100;
  }

  const conforme =
    (minimoTotale === null || Number(valore) >= minimoTotale) &&
    (massimoTotale === null || Number(valore) <= massimoTotale);

  return { conforme, minimo: minimoTotale, massimo: massimoTotale };
}

module.exports = { verificaLimitiListino };
