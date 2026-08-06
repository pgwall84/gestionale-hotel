// Setup per-file (stesso module registry del test, a differenza di globalSetup).
// Ogni file di test require('../../backend/app') crea un proprio Pool pg isolato
// (backend/config/db.js) — senza chiuderlo esplicitamente resta come TCPWRAP
// aperto e Jest non esce mai da solo. Un afterAll per file lo chiude.

afterAll(async () => {
  const pool = require('../backend/config/db');
  await pool.end();
});
