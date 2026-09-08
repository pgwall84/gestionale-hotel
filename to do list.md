# To Do List — Hotel del Golfo (gestionale)

> Elenco puntato di lettura rapida, versione sintetica di `STATO_PROGETTO.md`
> e `docs/EVOLUTIVE.md` — quelli restano la fonte di dettaglio tecnico
> (cosa è stato fatto, perché, con quali limiti). Questo file va tenuto
> aggiornato insieme agli altri documenti di progetto ad ogni sessione
> in cui si chiude o si apre un punto.
>
> Ultimo aggiornamento: 08/09/2026.

## Fix e verifiche da chiudere (piccole, non nuovo sviluppo)

- Beds24 Fase 1 (lettura prenotazioni OTA) — implementata e unita a
  `main` il 30/08/2026: webhook + job notturno di riconciliazione,
  upsert idempotente con cancellazioni mai automatiche dopo il
  check-in, coda `beds24_prenotazioni_da_revisionare` per le
  prenotazioni non assegnabili (**nessuna UI per questa coda**, solo
  `GET/PATCH /api/beds24/da-revisionare`, mai costruita in Fase 1 né
  dopo). Resta solo la verifica con credenziali reali (invite code,
  scope `bookings`+`bookings-personal`, webhook abilitato, nomi campo
  confermati contro un booking vero) — vedi Task 12 in
  `docs/superpowers/plans/2026-08-30-beds24-integrazione-fase1.md`.
- Beds24 Fase 2/3 (scrittura tariffe/disponibilità/restrizioni verso
  Beds24, punti 2-3 del modulo 2.3) — implementata e unita a `main` il
  08/09/2026, 13 task, 1047/1047 test verdi. Migration 056→059
  **applicate in produzione (confermato da Marco, 08/09/2026)**. Resta
  solo una **decisione di Marco, non tecnica**: quando attivare la
  connessione Beds24↔Booking.com nel pannello Beds24 — il prerequisito
  tecnico (tariffe corrette inviate) c'è già.

- Rate limit pubblici di produzione (login 5, pre-checkin 30, booking 30
  ogni 15min) mai tarati su traffico reale — allargati solo in dev/test
  il 28/08/2026.
- Tre pezzi del modulo tariffe implementati ma mai visti in UI da Marco:
  griglia statica `/tariffe`, planning-tariffe giorno-per-giorno (serve
  anche applicare la migration 053), badge "pagamento misto" nel
  riepilogo economico.
- `bookingPubblico.test.js`: range min/max tariffe e sconto bambini 3-11
  (oggi 0%) da popolare, verifica end-to-end `/prenota` mai fatta,
  restrizioni min_stay/chiusure mai testate su una prenotazione reale.
- Mini-audit di sicurezza pre-go-live del booking engine diretto (rate
  limit, firma webhook, scope PCI) — dichiarato fuori scope del piano
  originale, va fatto a parte prima di sostituire il widget TS.
- Prenotazioni di gruppo, le due modalità ZTL (Import TS / Sincronizza
  da Planning) e l'intero modulo HACCP 6.1 — verificati solo via test
  automatici, mai visti in UI da Marco.
- Item segnalato dal tab Code e mai chiarito: `prezzo_notte: 0` trattato
  come "nessun valore" via COALESCE — serve il file:riga esatto per
  giudicare se è un problema.
- Fix "ospite vuoto che sparisce" applicato solo al form pubblico
  pre-checkin, non alla schermata reception per l'inserimento manuale —
  da estendere solo se richiesto.
- Alloggiati Web Fase 2: sincronizzazione SOAP reale mai testata con
  credenziali vere — Marco deve compilarle in `.env` e provare
  "Sincronizza ora" in locale.
- **PROMEMORIA per Marco (aggiunto 08/09/2026), nessuna azione tecnica
  possibile da qui**: RIMOVCLI/ISTAT C/59 (modulo 2.6) — codice pronto e
  verificato da settimane, resta solo da compilare/inviare il modulo di
  adesione RIMOVCLI e inviare il primo file per la certificazione a
  movimentoturistico.istat@regione.liguria.it.

## Evolutive da sviluppare (feature nuove, serve brainstorming dedicato)

- **BLOCCATO — non fare finché il sito con booking engine non è live in
  produzione (anche solo con Stripe)** (nota di Marco, 08/09/2026):
  switch di provider di pagamento Stripe/Nexi (un solo gateway attivo
  alla volta via `PAYMENT_PROVIDER` — il routing per nazionalità
  valutato il 29/08 è stato scartato da Marco il 02/09/2026, non serve
  più raccogliere paese/residenza in `BookingWidget.tsx`). Costruito e
  Nexi verificato end-to-end il 07/09/2026, **solo in locale/sandbox**.
  **Il motivo del blocco**: Nexi fornisce le credenziali di produzione
  solo dopo che il sito è live con un booking engine funzionante — quindi
  prima va fatto quello (anche restando su Stripe), poi si chiedono le
  credenziali a Nexi, poi si riprende questo punto. Quando arriva quel
  momento, restano da chiudere 3 dei 5 casi del checklist di verifica
  manuale (Task 9,
  `docs/superpowers/plans/2026-09-02-payment-provider-switch.md`) senza
  evidenza reale — flusso Stripe con `PAYMENT_PROVIDER=stripe`, scenario
  di cutover a metà prenotazione, coerenza `.env.example`;
  `NexiPaymentStep.tsx` (sito-hotel) ancora non committato.
- Cron di scadenza automatica delle prenotazioni "Opzione" → "interrotta"
  dopo 24-48h (dipendenza nuova: node-cron).
- Check-out anticipato / annullamento dopo il check-in — flusso non
  gestito, serve una transizione di stato dedicata.
- Collegare la transizione a "chiusa" all'emissione fattura reale
  (A-Cube) invece che a un click manuale.
- Viste Ospiti / Pulizie / Conto ospite / Report avanzati — mai
  costruite (specifica già in `docs/PRENOTAZIONI_FASE2.md` Parte D).
- Notifica push nativa (service worker) al titolare ad ogni timbratura HR.
- Magazzino: scansione barcode/QR da fotocamera telefono inaffidabile —
  valutare un lettore hardware dedicato se il volume lo giustifica.
- Alert ROSS1000/export in sospeso — rimandato, serve una tabella di log
  export prima di poterlo costruire.
- ZTL: rimozione futura del bottone "Import TS"/switch/parsing Excel
  quando la migrazione da TeamSystem sarà completa.
