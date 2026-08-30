// Controller Export RIMOVCLI/ISTAT C/59 (Modulo 2.6, Fase 1 — 28/08/2026).
// Genera l'XML giornaliero (docs/rimovcli/ModelloC59.xsd) per un intervallo
// di date — un file per giorno (upload manuale sul portale RIMOVCLI di
// Regione Liguria, batching settimanale ammesso). Schema COMPLETAMENTE
// DIVERSO da ross1000Controller.js (webservice SOAP nazionale
// ROSS1000/Turismo5, tracciato nominativo per ospite, non toccato — resta
// utile per l'appartamento che ha regole diverse di flussi turistici).
// Riservato ad admin/titolare (shared/ruoli.js sezione 'rimovcli').

const archiver = require('archiver');
const { generaGiornoC59 } = require('../lib/rimovcliC59');

const MAX_GIORNI = 31; // sanità della richiesta — un giorno = una query, evita intervalli enormi per errore

// Elenca le date (YYYY-MM-DD) da data_inizio (incluso) a data_fine_esclusiva
// (escluso) — stesso criterio "data_fine esclusiva" già usato in
// ross1000Controller.js e nelle griglie prenotazioni.
function elencoGiorni(dataInizio, dataFineEsclusiva) {
  const giorni = [];
  let cursore = new Date(`${dataInizio}T00:00:00Z`);
  const fine = new Date(`${dataFineEsclusiva}T00:00:00Z`);
  while (cursore < fine) {
    giorni.push(cursore.toISOString().slice(0, 10));
    cursore.setUTCDate(cursore.getUTCDate() + 1);
  }
  return giorni;
}

function validaIntervallo(req, res) {
  const { data_inizio, data_fine } = req.query;
  if (!data_inizio || !data_fine) {
    res.status(400).json({ error: 'data_inizio e data_fine sono obbligatori (data_fine esclusiva).' });
    return null;
  }
  if (data_fine <= data_inizio) {
    res.status(400).json({ error: 'data_fine deve essere successiva a data_inizio.' });
    return null;
  }
  const giorni = elencoGiorni(data_inizio, data_fine);
  if (giorni.length > MAX_GIORNI) {
    res.status(400).json({ error: `Intervallo troppo ampio (massimo ${MAX_GIORNI} giorni per generazione).` });
    return null;
  }
  return giorni;
}

function idstrutturaDaQuery(req) {
  const v = typeof req.query.idstruttura === 'string' ? req.query.idstruttura.trim() : '';
  // Nessun default indovinato "reale": finché la certificazione con Regione
  // Liguria non ha esito positivo, resta 'DA_CONFIGURARE' (stesso principio
  // già in scripts/generaC59.js).
  return v || 'DA_CONFIGURARE';
}

// GET /api/rimovcli/export-c59?data_inizio=&data_fine=&idstruttura=
// Un oggetto per giorno nell'intervallo (giorno, xml, avvisi, nome_file) —
// un giorno = un file XML, per costruzione dello schema RIMOVCLI (vedi
// backend/lib/rimovcliC59.js).
const esporta = async (req, res) => {
  const giorni = validaIntervallo(req, res);
  if (!giorni) return;
  const idstruttura = idstrutturaDaQuery(req);

  try {
    const risultati = [];
    for (const giorno of giorni) {
      const { xml, avvisi } = await generaGiornoC59({ idstruttura, giorno });
      risultati.push({ giorno, xml, avvisi, nome_file: `${idstruttura}_${giorno.replace(/-/g, '')}.xml` });
    }
    res.json({ giorni: risultati });
  } catch (err) {
    console.error('esporta rimovcli-c59 error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

// GET /api/rimovcli/export-c59.zip?data_inizio=&data_fine=&idstruttura=
// Stesso intervallo di /export-c59, un file XML per giorno dentro allo
// zip — comodo per il caricamento in batch sul portale RIMOVCLI (Regione
// Liguria ammette batching settimanale, vedi memoria progetto). Gli avvisi
// non sono nello zip: vanno controllati prima via /export-c59 (stesso
// principio "verifica poi invia" di ROSS1000 Fase 1).
const esportaZip = async (req, res) => {
  const giorni = validaIntervallo(req, res);
  if (!giorni) return;
  const idstruttura = idstrutturaDaQuery(req);

  try {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="rimovcli_c59_${req.query.data_inizio}_${req.query.data_fine}.zip"`);

    const archive = new archiver.ZipArchive({ zlib: { level: 6 } });
    archive.on('error', err => {
      console.error('Errore archiver rimovcli-c59:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Errore interno del server.' });
    });
    archive.pipe(res);

    for (const giorno of giorni) {
      const { xml } = await generaGiornoC59({ idstruttura, giorno });
      archive.append(xml, { name: `${idstruttura}_${giorno.replace(/-/g, '')}.xml` });
    }
    archive.finalize();
  } catch (err) {
    console.error('esportaZip rimovcli-c59 error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Errore interno' });
  }
};

module.exports = { esporta, esportaZip };
