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

module.exports = { calcolaOverrideBeds24 };
