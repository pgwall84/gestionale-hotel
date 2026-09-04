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

module.exports = { calcolaOverrideBeds24, calcolaDisponibilitaBeds24Range };
