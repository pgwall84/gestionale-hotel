// backend/lib/beds24PrezziDisponibilita.js
// Calcolo puro di disponibilità/prezzo/restrizioni per il push verso
// Beds24 — Modulo 2.3, Fase 2/3. Vedi
// docs/superpowers/specs/2026-09-03-invio-tariffe-beds24-design.md,
// sezioni "Calcolo disponibilità", "Calcolo prezzo", "Calcolo restrizioni".

const pool = require('../config/db');
const { calcolaPrezzoDirettoPerNotte, calcolaSupplementoTrattamento } = require('../controllers/tariffeController');

function isoData(valore) {
  return valore instanceof Date ? valore.toISOString().slice(0, 10) : String(valore);
}

// Precedenza confermata da Marco il 04/09/2026: stop_sell (blackout) vince
// su tutto; poi entrambi chiuso_arrivo+chiuso_partenza; poi il singolo;
// altrimenti none. Beds24 non ha campi booleani indipendenti come i nostri
// — un solo enum per camera/giorno, vedi sezione "Calcolo restrizioni"
// della spec per la perdita di espressività accettata.
function calcolaOverrideBeds24({ chiuso_arrivo, chiuso_partenza, stop_sell }) {
  if (stop_sell) return 'blackout';
  if (chiuso_arrivo && chiuso_partenza) return 'noCheckInOrCheckOut';
  if (chiuso_arrivo) return 'noCheckIn';
  if (chiuso_partenza) return 'noCheckOut';
  return 'none';
}

// Disponibilità per Beds24, giorno per giorno: conta le camere fisiche
// attive del tipo non occupate da un soggiorno non cancellato (stessa
// condizione di trovaCameraLibera in beds24SyncController.js, ma COUNT
// invece di selezionare una riga con FOR UPDATE SKIP LOCKED — qui non
// stiamo assegnando una camera, solo contando), poi cappata a
// unita_esposte se configurata. Mai il numero esposto supera la
// disponibilità fisica reale, anche con un tetto più alto configurato.
async function calcolaDisponibilitaBeds24Range(tipoCameraId, dataDa, dataFineEsclusiva) {
  const [liberoResult, canaleResult] = await Promise.all([
    pool.query(
      `SELECT n.notte::date AS notte,
              COUNT(c.id) FILTER (
                WHERE NOT EXISTS (
                  SELECT 1 FROM soggiorni s
                  WHERE s.camera_id = c.id AND s.cancellato = false
                    AND daterange(s.data_arrivo, s.data_partenza, '[)') @> n.notte::date
                )
              ) AS libere
       FROM generate_series($2::date, $3::date - INTERVAL '1 day', INTERVAL '1 day') AS n(notte)
       CROSS JOIN camere c
       JOIN tipi_camera_camere tcc ON tcc.camera_id = c.id AND tcc.tipo_camera_id = $1
       WHERE c.attivo = true
       GROUP BY n.notte
       ORDER BY n.notte`,
      [tipoCameraId, dataDa, dataFineEsclusiva]
    ),
    pool.query(
      `SELECT unita_esposte FROM tipi_camera_canali WHERE tipo_camera_id = $1 AND canale = 'beds24'`,
      [tipoCameraId]
    ),
  ]);

  const unitaEsposte = canaleResult.rows[0]?.unita_esposte;
  return liberoResult.rows.map(r => ({
    giorno: isoData(r.notte),
    numAvail: unitaEsposte != null ? Math.min(Number(r.libere), unitaEsposte) : Number(r.libere),
  }));
}

function aggiungiGiornoIso(dataIso) {
  const d = new Date(dataIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Prezzo + restrizioni per Beds24, giorno per giorno. Precedenza (vedi
// spec, sezioni "Calcolo prezzo"/"Calcolo restrizioni"): riga
// canale='beds24' > riga canale IS NULL > calcolato al volo. Un prezzo
// letto da planning_tariffe_giorni (qualunque canale) è già un valore
// FINALE impostato a mano — non viene mai ri-maggiorato: la
// maggiorazione_percentuale si applica solo al prezzo calcolato/derivato
// dal motore diretto (calcolaPrezzoDirettoPerNotte), per lo stesso motivo
// per cui griglia() (planningTariffeController.js) non ricalcola un
// prezzo già sovrascritto a mano.
// Mappatura price1/price2 decisa in spec: price1 = bb, price2 =
// mezza_pensione. Supplemento mezza pensione con la stessa convenzione
// "occupazione standard" già in uso per il prezzo consigliato del
// planning (2 adulti, 0 bambini — vedi commento in cima a
// planningTariffeController.js).
async function calcolaPrezziRestrizioniBeds24Range(tipoCameraId, dataDa, dataFineEsclusiva) {
  const [diretti, maggiorazioneResult, overrideResult] = await Promise.all([
    calcolaPrezzoDirettoPerNotte(tipoCameraId, dataDa, dataFineEsclusiva),
    pool.query(`SELECT maggiorazione_percentuale FROM tipi_camera_canali WHERE tipo_camera_id = $1 AND canale = 'beds24'`, [tipoCameraId]),
    pool.query(
      `SELECT trattamento, data, canale, prezzo_notte, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell
       FROM planning_tariffe_giorni
       WHERE tipo_camera_id = $1 AND data >= $2 AND data < $3
         AND trattamento IN ('bb', 'mezza_pensione') AND (canale IS NULL OR canale = 'beds24')`,
      [tipoCameraId, dataDa, dataFineEsclusiva]
    ),
  ]);

  const maggiorazione = Number(maggiorazioneResult.rows[0]?.maggiorazione_percentuale || 0);

  const overridePerChiave = new Map();
  for (const r of overrideResult.rows.filter(r => r.canale === null)) {
    overridePerChiave.set(`${r.trattamento}|${isoData(r.data)}`, r);
  }
  for (const r of overrideResult.rows.filter(r => r.canale === 'beds24')) {
    overridePerChiave.set(`${r.trattamento}|${isoData(r.data)}`, r);
  }

  const prezzoDirettoPerGiorno = new Map(diretti.map(n => [isoData(n.notte), n.prezzo_notte]));

  const righe = [];
  for (const giorno of prezzoDirettoPerGiorno.keys()) {
    const overrideBb = overridePerChiave.get(`bb|${giorno}`);
    const overrideMp = overridePerChiave.get(`mezza_pensione|${giorno}`);

    let price1 = overrideBb?.prezzo_notte != null
      ? Number(overrideBb.prezzo_notte)
      : prezzoDirettoPerGiorno.get(giorno);
    if (price1 != null && overrideBb?.prezzo_notte == null) {
      price1 = Math.round(price1 * (1 + maggiorazione / 100) * 100) / 100;
    }

    let price2 = null;
    if (overrideMp?.prezzo_notte != null) {
      price2 = Number(overrideMp.prezzo_notte);
    } else if (price1 != null) {
      const supplemento = await calcolaSupplementoTrattamento(tipoCameraId, giorno, aggiungiGiornoIso(giorno), 'mezza_pensione', 2, []);
      if (supplemento.notti_scoperte.length === 0) {
        const base = overrideBb?.prezzo_notte != null ? Number(overrideBb.prezzo_notte) : prezzoDirettoPerGiorno.get(giorno);
        const mpNonMaggiorato = base + supplemento.totale;
        price2 = Math.round(mpNonMaggiorato * (1 + maggiorazione / 100) * 100) / 100;
      }
    }

    righe.push({
      giorno,
      minStay: overrideBb?.min_stay ?? null,
      override: calcolaOverrideBeds24({
        chiuso_arrivo: !!overrideBb?.chiuso_arrivo,
        chiuso_partenza: !!overrideBb?.chiuso_partenza,
        stop_sell: !!overrideBb?.stop_sell,
      }),
      price1,
      price2,
    });
  }
  return righe;
}

module.exports = { calcolaOverrideBeds24, calcolaDisponibilitaBeds24Range, calcolaPrezziRestrizioniBeds24Range };
