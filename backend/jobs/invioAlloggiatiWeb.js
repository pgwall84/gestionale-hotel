// Job notturno — invio automatico Alloggiati Web (modulo 2.5 Fase 2, invio
// reale — 13/08/2026, su richiesta esplicita del titolare dopo aver
// verificato manualmente che Test funziona end-to-end). Stesso pattern di
// jobs/promemoriaEmail.js: avviato solo da server.js, mai da app.js (Jest
// userebbe app.js per i test — un cron avviato lì girerebbe anche durante
// npm test, rischio di chiamate SOAP reali durante la suite).
//
// SICUREZZA NON NEGOZIABILE: la query sotto esclude sempre
// canale_origine = 'test_interno'. I dati generati da
// backend/scripts/creaPrenotazioneTestAlloggiati.js e
// backend/scripts/seedPrenotazioniTest.js usano entrambi quel valore
// apposta — se questo filtro venisse rimosso, la prima esecuzione notturna
// proverebbe a registrare come reali, presso la Polizia di Stato, decine
// di ospiti inventati. Non rimuovere/aggirare questo filtro senza aver
// prima eliminato ogni dato di test dal database.
//
// Logica di retry: un soggiorno rientra tra i "da inviare" se non ha mai
// un tentativo con esito 'ok'. eseguiInvioReale (alloggiatiController.js)
// scrive SEMPRE una riga in alloggiati_invii quando arriva al punto di
// contattare WS_ALLOGGIATI — esito 'ok'/'parziale'/'errore' (dati
// respinti) o, da Fase A (13/08/2026), 'errore_rete' (portale non
// raggiungibile/timeout/credenziali rifiutate). Prima gli errori di rete
// non scrivevano nulla — "retry-safety" ma invisibile, nessun contatore.
// Ora restano comunque "da reinviare" alla notte successiva (la query
// sotto considera qualunque esito diverso da 'ok'), ma il tentativo e il
// motivo sono visibili nella coda di Impostazioni ▸ Alloggiati Web, con
// il numero di tentativi falliti consecutivi. Un giro al giorno, non due
// (deciso il 13/08/2026 — non raddoppiare le chiamate al portale finché
// non emerge un bisogno reale).

const cron = require('node-cron');
const pool = require('../config/db');
const { eseguiInvioReale, scaricaRicevutePendenti } = require('../controllers/alloggiatiController');

// Soggiorni con arrivo già avvenuto, non cancellati, non di test, il cui
// ultimo tentativo (se esiste) non è 'ok' — stessa query di codaInvii in
// alloggiatiController.js, qui semplificata perché serve solo l'id.
async function trovaSoggiorniDaInviare() {
  const result = await pool.query(
    `WITH ultimo_tentativo AS (
       SELECT DISTINCT ON (soggiorno_id) soggiorno_id, esito
       FROM alloggiati_invii
       ORDER BY soggiorno_id, data_invio DESC
     )
     SELECT s.id
     FROM soggiorni s
     JOIN prenotazioni p ON p.id = s.prenotazione_id
     LEFT JOIN ultimo_tentativo ut ON ut.soggiorno_id = s.id
     WHERE s.cancellato = false
       AND s.data_arrivo <= CURRENT_DATE
       AND p.canale_origine != 'test_interno'
       AND (ut.esito IS NULL OR ut.esito != 'ok')`
  );
  return result.rows.map(r => r.id);
}

// Un giro completo — esportata a parte per poterla richiamare anche a mano
// (es. da uno script di verifica), non solo dallo scheduler.
async function eseguiGiro() {
  const soggiorniIds = await trovaSoggiorniDaInviare();
  // errore_rete: gestito DENTRO eseguiInvioReale (Fase A) — scrive comunque
  // la riga, torna qui come risultato normale, mai un'eccezione.
  // eccezioni_impreviste: residuo di sicurezza per bug veri/DB irraggiungibile
  // — casi che eseguiInvioReale non ha previsto, non un fallimento SOAP noto.
  const risultati = { ok: 0, parziale: 0, errore: 0, errore_rete: 0, in_attesa: 0, eccezioni_impreviste: 0 };

  for (const id of soggiorniIds) {
    try {
      const esito = await eseguiInvioReale(id);
      risultati[esito.esito] = (risultati[esito.esito] || 0) + 1;
    } catch (err) {
      console.error(`[job invioAlloggiatiWeb] soggiorno #${id} — eccezione imprevista: ${err.message}`);
      risultati.eccezioni_impreviste++;
    }
  }

  console.log(
    `[job invioAlloggiatiWeb] giro completato — candidati: ${soggiorniIds.length}, ` +
    `ok: ${risultati.ok}, parziale: ${risultati.parziale}, errore: ${risultati.errore}, ` +
    `errore_rete: ${risultati.errore_rete}, in_attesa (dati incompleti): ${risultati.in_attesa}, ` +
    `eccezioni impreviste: ${risultati.eccezioni_impreviste}`
  );

  // Fase B (13/08/2026) — dopo l'invio, prova a scaricare le ricevute dei
  // giorni passati non ancora coperte (mai il giorno corrente, il servizio
  // non lo permette — vedi scaricaRicevutaGiorno). Avvolto in try/catch
  // proprio: un problema sulle ricevute non deve mai far sembrare fallito
  // il giro di invio, che è la parte critica.
  try {
    const ricevute = await scaricaRicevutePendenti();
    if (ricevute.length > 0) {
      console.log(`[job invioAlloggiatiWeb] ricevute — ${ricevute.map(r => `${r.data}: ${r.scaricata ? 'ok' : r.motivo}`).join('; ')}`);
    }
  } catch (err) {
    console.error('[job invioAlloggiatiWeb] scaricaRicevutePendenti — errore imprevisto:', err.message);
  }

  return risultati;
}

// Avvia lo scheduler — ogni notte alle 02:00, stessa fascia oraria a bassa
// occupazione usata dagli altri gestionali del settore (vedi ricerca
// 13/08/2026). Chiamata solo da server.js, mai in fase di test.
//
// INTERRUTTORE OBBLIGATORIO (aggiunto 13/08/2026, su richiesta esplicita
// del titolare — "il pulsante deve cmq essere inattivo per evitare
// problemi"): il job NON si registra se ALLOGGIATI_JOB_ATTIVO non vale
// esattamente 'true' in .env. Di default, quindi, è SPENTO — anche dopo
// un deploy che include questo file. Motivo: trovaSoggiorniDaInviare()
// non ha un limite di data inferiore, solo "arrivo già avvenuto e nessun
// invio con esito 'ok'" — la prima esecuzione con l'interruttore attivo
// tenterebbe di inviare in un colpo solo TUTTO l'arretrato di soggiorni
// reali già presenti, non solo quelli di quella notte. Va acceso solo dopo
// aver verificato un invio reale singolo e mirato tramite "Invia ora"
// nella coda di Impostazioni ▸ Alloggiati Web.
function avviaJobInvioAlloggiatiWeb() {
  if (process.env.ALLOGGIATI_JOB_ATTIVO !== 'true') {
    console.log(
      'Job invio automatico Alloggiati Web NON avviato — ALLOGGIATI_JOB_ATTIVO non è "true" in .env ' +
      '(spento di default per sicurezza, vedi commento in jobs/invioAlloggiatiWeb.js).'
    );
    return;
  }
  cron.schedule('0 2 * * *', () => {
    eseguiGiro().catch(err => console.error('[job invioAlloggiatiWeb] errore imprevisto:', err.message));
  });
  console.log('Job invio automatico Alloggiati Web pianificato (ogni notte alle 02:00).');
}

module.exports = { avviaJobInvioAlloggiatiWeb, eseguiGiro, trovaSoggiorniDaInviare };
