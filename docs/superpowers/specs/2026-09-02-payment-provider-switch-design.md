# Design — Switch provider di pagamento (Stripe ⇄ Nexi XPay)

Data: 02/09/2026
Stato: approvato da Marco in sessione di brainstorming, in attesa di piano di implementazione.

## Contesto

Il Booking Engine Diretto (vedi
`docs/superpowers/specs/2026-08-19-booking-engine-diretto-design.md`) è in
produzione con Stripe per la caparra del 30%. In parallelo, l'integrazione
Nexi XPay Build (Alias + Chiave MAC, flusso nonce/pagaNonce verso
`ecommerce.nexi.it` — non il vecchio "Build v3" con dominio
`xpaysandbox.nexigroup.com`, scartato) è stata verificata funzionante in
un path di test isolato (`/xpay-test` su sito-hotel, `/api/xpay-test/*` su
gestionale-hotel), ora sul branch `feat/nexi-xpay-build-test`, non ancora
integrata nel booking engine reale.

Nexi non ha ancora fornito credenziali di produzione né deciso se attivare
"Incasso senza Pensieri" (prodotto dedicato per garanzie/no-show
alberghiero) — quella decisione resta bloccata e non è oggetto di questo
documento. L'obiettivo qui è più stretto: avere backend e frontend pronti
a passare da Stripe a Nexi (o viceversa) con un solo cambio di
configurazione, quando Marco deciderà, senza dover toccare codice.

## Scope

Dentro: un solo provider di pagamento attivo alla volta per la caparra del
booking engine, selezionabile via variabile d'ambiente sul backend;
comportamento invariato per le prenotazioni già aperte al momento di un
cutover; un endpoint pubblico che il frontend consulta per sapere quale
componente di raccolta-carta montare, così backend e frontend non possono
disallinearsi.

Fuori scope (scartato esplicitamente da Marco il 02/09/2026): routing
simultaneo per origine carta (Nexi per carte europee, Stripe per
extra-UE), rilevamento geografico/BIN, due motori attivi insieme. Un solo
provider alla volta. Fuori scope anche: la decisione su "Incasso senza
Pensieri" e qualunque logica di storno/no-show che ne dipenda — restano
bloccate sulla risposta di Nexi e non sono trattate qui.

## Architettura

### Selezione del provider (backend)

`backend/lib/payments/index.js` legge `PAYMENT_PROVIDER` (`stripe` |
`nexi`) una volta al boot ed espone il modulo del provider attivo.
Non esiste un'interfaccia comune forzata tra `stripeProvider.js` (nuovo,
wrapper attorno a `lib/stripeClient.js` esistente) e `nexiProvider.js`
(nuovo): i due flussi sono strutturalmente diversi — Stripe è asincrono
via webhook, Nexi è sincrono via nonce/pagaNonce — e forzarli dietro la
stessa firma di funzione nasconderebbe quella differenza invece di
gestirla esplicitamente nei controller che li usano.

### Conferma prenotazione unificata

La logica di conferma oggi imprigionata dentro
`controllers/stripeWebhookController.js` (transizione
`prenotazioni.stato`: `opzione` → `confermata`, il lock `FOR UPDATE`
contro il cron `jobs/scadenzaHoldBookingEngine.js`, scrittura righe
`pagamenti`/`soggiorni`) viene estratta in una funzione condivisa,
`backend/lib/prenotazioni/confermaPrenotazione.js`. Il webhook Stripe la
chiama in modo asincrono quando arriva `payment_intent.succeeded`; il
controller Nexi (adattato da `controllers/xpayTestController.js`, oggi
solo di test) la chiama in modo sincrono subito dopo aver ricevuto
`esito.esito === 'OK'` da `pagaNonce`. Stessa transizione di stato, due
modi diversi di arrivarci.

### Endpoint pubblico di configurazione

`GET /api/booking-pubblico/config` → `{ provider: "stripe" | "nexi" }`,
letto dalla stessa `PAYMENT_PROVIDER` del backend. La pagina di
prenotazione su sito-hotel lo chiama all'avvio dello step di pagamento e
monta il componente corrispondente (Stripe Elements, già in produzione,
oppure il form XPay Build già verificato funzionante in `/xpay-test`).
Deciso esplicitamente contro una variabile `NEXT_PUBLIC_PAYMENT_PROVIDER`
duplicata lato frontend: con due repository separati (gestionale-hotel e
sito-hotel) una var duplicata rischia di disallinearsi durante un
cutover, con conseguenza booking che falliscono silenziosamente. Un solo
posto dove si cambia il valore elimina il rischio per costruzione.

### Tracciamento del provider per pagamento

La colonna `pagamenti.metodo VARCHAR(30)` esiste già nello schema
(migration `016_prenotazioni_fase2.sql`) ma non è mai valorizzata
dall'INSERT attuale in `bookingPubblicoController.js`. Verrà popolata con
`'stripe'` o `'nexi'` in base al provider usato per quel pagamento
specifico. Nessuna nuova migration necessaria.

## Comportamento sul cutover

Cambiare provider = cambiare `PAYMENT_PROVIDER` + restart del backend.
Le prenotazioni con hold già aperto prima del restart non sono toccate:
il cron di scadenza hold e la logica di conferma leggono
`pagamenti.metodo` sulla singola riga, non la `PAYMENT_PROVIDER` corrente
— un cutover a metà flusso non fa "atterrare" una prenotazione aperta con
un provider su un motore diverso da quello con cui è stata iniziata.

## Ambienti di test → produzione

Credenziali sandbox/produzione separate per provider, stesso meccanismo
già in uso per Stripe: `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`
(esistenti) e, per Nexi, `XPAY_ALIAS`/`XPAY_MAC_KEY`/`XPAY_BASE_URL`
(sandbox vs produzione — da aggiungere quando Nexi fornirà le credenziali
reali). Passare da test a reale è cambiare quelle variabili, stesso
meccanismo del cutover di provider: nessun codice da toccare.

## Testing

- Verifica che una prenotazione con hold aperto (stato `opzione`) prima
  di un cutover si risolva correttamente (conferma o scadenza) dopo il
  restart con provider diverso.
- Verifica dell'endpoint `/api/booking-pubblico/config` e del montaggio
  del componente corretto lato frontend per entrambi i valori.
- Test end-to-end completo per ciascun provider dentro il booking engine
  reale (non nel path isolato `/xpay-test`) — per Nexi, ripetere la
  verifica già fatta in isolamento (pagamento accettato e pagamento
  rifiutato) ma dentro il flusso `prenotazioni`/`soggiorni`/`pagamenti`
  reale.

## Decisioni scartate

- **Config a DB con pannello admin per switch "a caldo"**: scartato.
  Marco ha confermato che il cambio di provider è una decisione presa con
  calma quando serve, non un toggle da azionare mentre il sito è già in
  produzione con prenotazioni in corso — una env var con restart è
  sufficiente e più semplice.
- **Routing simultaneo EU/extra-UE (doppio binario permanente)**:
  scartato il 02/09/2026 per ridurre complessità — introduceva un
  problema di rilevamento (IP vs BIN vs selezione utente) non necessario
  per l'obiettivo attuale (essere pronti a passare a Nexi quando sarà il
  momento).
- **Variabile d'ambiente duplicata lato frontend**: scartata a favore
  dell'endpoint di configurazione, per eliminare il rischio di
  disallineamento tra i due repository durante un cutover.

## Nota sul processo di questa sessione

Il documento è stato scritto ma non committato da questa sessione Cowork,
per la regola in vigore di non eseguire mai operazioni git da qui. Va
committato da Marco o dalla sessione "Code tab" parallela.
