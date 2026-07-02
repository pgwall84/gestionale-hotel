// Entry point del server Express.
// Importa l'app configurata da app.js e avvia il listener sulla porta.
// I test usano app.js direttamente tramite Supertest — senza occupare porte.

const app  = require('./app');
const PORT = process.env.PORT || 7001;

app.listen(PORT, () => {
  console.log(`Server gestionale hotel avviato sulla porta ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
