// Helper condiviso per tradurre errori Postgres specifici in risposte HTTP
// coerenti, invece di lasciarli ricadere nel generico 500. Estratto da
// prenotazioniController.crea (era inline) per essere riusato anche da
// soggiorniController — vedi SCHEMA_PRENOTAZIONI_FASE2.md Sezione 3.

// Codice Postgres 23P01 = exclusion_violation, err.constraint identifica
// il vincolo specifico violato.
const VINCOLO_OVERLAP_CAMERA = 'excl_soggiorni_camera_overlap';

// Se err è la violazione del vincolo anti-overbooking, scrive la risposta
// 409 e ritorna true (il chiamante deve fermarsi). Altrimenti ritorna false
// e lascia che il chiamante gestisca l'errore (es. log + 500 generico).
function gestisciConflittoCamera(err, res) {
  if (err.code === '23P01' && err.constraint === VINCOLO_OVERLAP_CAMERA) {
    res.status(409).json({ error: 'Camera già occupata in queste date' });
    return true;
  }
  return false;
}

module.exports = { gestisciConflittoCamera, VINCOLO_OVERLAP_CAMERA };
