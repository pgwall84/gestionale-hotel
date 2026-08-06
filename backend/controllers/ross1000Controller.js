// Controller Export ROSS1000/ISTAT (modulo 2.6, Fase 1 — 04/08/2026).
// Genera e restituisce il file XML per verifica manuale — NESSUN invio reale
// (vedi backend/lib/ross1000Xml.js). Accessibile solo ad admin/titolare
// (dati di pubblica sicurezza/ISTAT, shared/ruoli.js sezione 'ross1000').

const { generaXml } = require('../lib/ross1000Xml');

// GET /api/ross1000/export?data_inizio=YYYY-MM-DD&data_fine=YYYY-MM-DD&giorni_chiusura=YYYY-MM-DD,YYYY-MM-DD
// data_fine è ESCLUSIVA (stesso criterio già usato per /api/prenotazioni/griglia).
// giorni_chiusura è opzionale: elenco di date da forzare come apertura="NO"
// (nessun calendario chiusure persistito in questa Fase 1).
const esporta = async (req, res) => {
  const { data_inizio, data_fine, giorni_chiusura } = req.query;
  if (!data_inizio || !data_fine) {
    return res.status(400).json({ error: 'data_inizio e data_fine sono obbligatori (data_fine esclusiva).' });
  }
  if (data_fine <= data_inizio) {
    return res.status(400).json({ error: 'data_fine deve essere successiva a data_inizio.' });
  }
  const giorniChiusura = giorni_chiusura ? giorni_chiusura.split(',').map(s => s.trim()).filter(Boolean) : [];

  try {
    const { xml, avvisi } = await generaXml({ dataInizio: data_inizio, dataFineEsclusiva: data_fine, giorniChiusura });
    res.json({ xml, avvisi, nome_file: `ross1000_${data_inizio}_${data_fine}.xml` });
  } catch (err) {
    console.error('esporta ross1000 error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

module.exports = { esporta };
