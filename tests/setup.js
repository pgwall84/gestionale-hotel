// Setup globale Jest — eseguito una volta prima di tutti i test.
// Imposta NODE_ENV=test (disabilita rate limit) e carica le variabili d'ambiente.

const path = require('path');

module.exports = async () => {
  process.env.NODE_ENV = 'test';

  // Carica il .env del backend
  require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

  // Verifica che le variabili critiche siano presenti
  const richieste = ['DB_HOST', 'DB_NAME', 'JWT_SECRET'];
  const mancanti = richieste.filter(v => !process.env[v]);
  if (mancanti.length > 0) {
    throw new Error(
      `Variabili d'ambiente mancanti per i test: ${mancanti.join(', ')}\n` +
      `Controllare il file backend/.env`
    );
  }

  console.log(`✓ Setup test completato — NODE_ENV=test, DB: ${process.env.DB_NAME}@${process.env.DB_HOST}`);
};
