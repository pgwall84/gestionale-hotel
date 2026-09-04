// backend/jobs/beds24InvioTariffe.js
// Job periodico invio tariffe/restrizioni a Beds24 — Modulo 2.3, Fase 2/3.
// Stesso pattern di beds24Riconciliazione.js (cron, avviato solo da
// server.js, mai da app.js). A differenza della disponibilità (push
// immediato, evento per evento — beds24PushDisponibilita.js), le tariffe
// si inviano in batch su tutto l'orizzonte configurato
// (beds24_config.orizzonte_invio_tariffe_fino_a): un errore isolato su una
// tipologia non deve fermare le altre, rete di sicurezza contro un push
// immediato perso.
const cron = require('node-cron');
const pool = require('../config/db');
const beds24Client = require('../lib/beds24Client');
const { calcolaPrezziRestrizioniBeds24Range } = require('../lib/beds24PrezziDisponibilita');
const { scriviInvioLog } = require('../lib/beds24InvioLog');

function domaniIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function eseguiInvioTariffe() {
  const config = await pool.query(`SELECT orizzonte_invio_tariffe_fino_a FROM beds24_config WHERE id = 1`);
  const orizzonte = config.rows[0]?.orizzonte_invio_tariffe_fino_a;
  if (!orizzonte) {
    console.log('Invio tariffe Beds24: nessun orizzonte configurato (beds24_config.orizzonte_invio_tariffe_fino_a), salto questo giro.');
    return;
  }
  const orizzonteIso = new Date(orizzonte).toISOString().slice(0, 10);
  const dataDa = domaniIso();
  if (orizzonteIso < dataDa) {
    console.log('Invio tariffe Beds24: orizzonte configurato è nel passato, salto questo giro.');
    return;
  }
  // dataFineEsclusiva = il giorno DOPO l'orizzonte (orizzonte è inclusivo,
  // stessa convenzione di calendario di planning_tariffe_giorni/tariffe).
  const fine = new Date(orizzonteIso + 'T00:00:00Z');
  fine.setUTCDate(fine.getUTCDate() + 1);
  const dataFineEsclusiva = fine.toISOString().slice(0, 10);

  const mappature = await pool.query(
    `SELECT tipo_camera_id, codice_esterno FROM tipi_camera_canali WHERE canale = 'beds24' AND codice_esterno IS NOT NULL`
  );

  for (const { tipo_camera_id: tipoCameraId, codice_esterno: codiceEsterno } of mappature.rows) {
    try {
      const righe = await calcolaPrezziRestrizioniBeds24Range(tipoCameraId, dataDa, dataFineEsclusiva);
      if (!righe.length) continue;

      const calendar = righe.map((r, idx) => ({
        from: r.giorno,
        to: idx < righe.length - 1 ? righe[idx + 1].giorno : r.giorno,
        minStay: r.minStay ?? undefined,
        override: r.override,
        price1: r.price1 ?? undefined,
        price2: r.price2 ?? undefined,
      }));

      const risultato = await beds24Client.pushCalendario([{ roomId: Number(codiceEsterno), calendar }]);
      await scriviInvioLog({ tipo: 'tariffe', tipoCameraId, esito: 'successo', dettaglio: risultato.risposta });

      // Rate limiting a crediti (spec, sezione "Gestione errori"): sotto
      // soglia di sicurezza ci fermiamo qui invece di continuare a
      // bruciare crediti per le tipologie restanti — al giro successivo
      // (prossima esecuzione cron) riprende dalle tipologie non ancora
      // coperte questo giro.
      if (risultato.creditiRimanenti != null && risultato.creditiRimanenti < 50) {
        console.warn(`Invio tariffe Beds24: crediti rimanenti sotto soglia (${risultato.creditiRimanenti}), interrompo questo giro.`);
        break;
      }
    } catch (err) {
      await scriviInvioLog({ tipo: 'tariffe', tipoCameraId, esito: 'errore', dettaglio: { messaggio: err.message } });
      console.error(`Invio tariffe Beds24 — errore su tipo_camera_id ${tipoCameraId}:`, err.message);
      // continua con la tipologia successiva — un errore isolato non deve
      // lasciare l'intero orizzonte non sincronizzato, vedi spec.
    }
  }
}

function avviaJobInvioTariffeBeds24() {
  // Ogni 3 ore — candidato indicato in spec (2-4 ore), a metà range:
  // abbastanza frequente da recuperare in giornata un push immediato
  // perso, non così frequente da rischiare il rate limit a crediti su un
  // orizzonte stagionale intero ad ogni giro.
  cron.schedule('0 */3 * * *', eseguiInvioTariffe);
}

module.exports = { avviaJobInvioTariffeBeds24, eseguiInvioTariffe };
