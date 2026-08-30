// Entry point del server Express.
// Importa l'app configurata da app.js e avvia il listener sulla porta.
// I test usano app.js direttamente tramite Supertest — senza occupare porte.

const app  = require('./app');
const { avviaJobPromemoriaEmail } = require('./jobs/promemoriaEmail');
const { avviaJobInvioAlloggiatiWeb } = require('./jobs/invioAlloggiatiWeb');
const { avviaJobScadenzaHoldBookingEngine } = require('./jobs/scadenzaHoldBookingEngine');
const { avviaJobRiconciliazioneBeds24 } = require('./jobs/beds24Riconciliazione');
const PORT = process.env.PORT || 7001;

app.listen(PORT, () => {
  console.log(`Server gestionale hotel avviato sulla porta ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);

  // Job email (modulo 5.3) — avviato solo qui, mai in app.js: app.js è
  // importato anche dai test Jest (Supertest), un cron avviato lì girerebbe
  // anche durante la suite di test.
  avviaJobPromemoriaEmail();

  // Job invio automatico Alloggiati Web (modulo 2.5 Fase 2, 13/08/2026) —
  // stesso motivo, mai in app.js. Esclude sempre canale_origine=test_interno,
  // vedi commento in testa a jobs/invioAlloggiatiWeb.js.
  avviaJobInvioAlloggiatiWeb();

  // Job pulizia blocchi scaduti Booking Engine Diretto (modulo 19/08/2026)
  // — stesso motivo, mai in app.js.
  avviaJobScadenzaHoldBookingEngine();

  // Job riconciliazione notturna Beds24 (modulo 2.3, Fase 1) — mai in
  // app.js, stesso motivo degli altri job: girerebbe anche durante i test.
  avviaJobRiconciliazioneBeds24();
});
