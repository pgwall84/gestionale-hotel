# Design — Integrazione Beds24, Fase 1 (lettura prenotazioni OTA)

Data: 30/08/2026
Stato: approvato da Marco in sessione di brainstorming — scope C, sottoinsieme della strategia A discussa in sessione. In attesa di piano di implementazione (writing-plans).

## Contesto

Modulo 2.3 — Beds24 scelto il 19/08/2026 al posto di WuBook/WooDoo (RoomCloud
escluso, Octorate escluso per costo/bundle) per la sola sincronizzazione OTA
— vedi `docs/EVOLUTIVE.md` correzione 19/08. Spec mai scritta finora: questo
documento la apre, ma solo per una prima fase.

Marco ha un account Beds24 di prova gratuita (14 giorni) e sta collegando
Booking.com prima di iniziare i test — nessun altro OTA collegato al 30/08.
Nessuna API key ancora generata.

Il modulo 2.3 completo (da `docs/EVOLUTIVE.md`/`STATO_PROGETTO.md`) prevede
tre flussi: (1) leggere le prenotazioni dagli OTA via Beds24 e aggiornare il
planning, (2) scrivere disponibilità camere verso Beds24, (3) scrivere prezzi
verso Beds24 (aggancio naturale: `planning_tariffe_giorni`, Piano 3 del
modulo tariffe). **Questo documento copre solo il punto (1).** I punti (2) e
(3) restano fuori scope, spec separata quando si riprendono.

Groundwork già esistente nel gestionale, verificato nel codice il 30/08/2026:
- `prenotazioni.canale_origine` (VARCHAR libero, nessun CHECK a livello DB,
  valori già in uso: `'test_interno'` e altri) e
  `prenotazioni.external_booking_id` (`UNIQUE`, migration 016) — pronti per
  un nuovo valore `'beds24'` senza migration.
- `tipi_camera_canali` (migration 020) mappa categoria camera → codice
  canale esterno, ma oggi è popolata/pensata solo per `'wubook'` (retaggio
  del fornitore scartato — sia il default nello schema sia
  `CANALE_DEFAULT` in `canaliOtaController.js`).
- `webhook_log` (migration 016) esiste già, predisposta apposta per questo
  modulo, mai popolata da nessun controller.

## Scope

**Dentro (Fase 1):**
- Autenticazione verso Beds24 API v2 (invite code → refresh token → token,
  rinnovo automatico).
- Ricezione prenotazioni via Booking Webhooks v2 (POST, near-real-time,
  ritardo medio dichiarato da Beds24 ~1 minuto).
- Job notturno di riconciliazione (`GET /bookings?modifiedSince=...`) come
  rete di sicurezza contro webhook persi.
- Upsert idempotente su `prenotazioni`/`soggiorni`/`ospiti`, anagrafica
  ospite minima (nome+cognome, coerente con la creazione rapida già in uso
  in `planning-camere`).
- Mappatura `roomId` Beds24 → `tipo_camera_id` interno via
  `tipi_camera_canali` (ripopolata per `canale='beds24'`).
- Log grezzo di ogni webhook ricevuto in `webhook_log`.
- Gestione cancellazioni e camere non mappate (vedi sezione dedicata).

**Fuori scope (rimandato, non in questa fase):**
- Scrivere disponibilità verso Beds24 (punto 2) — spec propria quando si
  riprende.
- Scrivere prezzi verso Beds24 (punto 3) — idem; l'aggancio a
  `planning_tariffe_giorni` è già individuato ma non progettato in dettaglio
  qui.
- Sincronizzazione di ritorno da modifiche fatte a mano nel pannello
  Beds24 verso disponibilità/prezzi del gestionale — **deciso
  esplicitamente "non ora" da Marco** in sessione: il gestionale resta
  l'unica fonte di verità su cosa vendere e a quale prezzo.
- Inventory Webhooks di Beds24 (notifiche su cambi disponibilità/prezzo
  lato Beds24) — inutili finché i punti 2/3 non esistono.
- Pannello admin dedicato per revisionare le prenotazioni "da
  revisionare" (camera non mappata) — Fase 1 le salva con un flag, un
  vero pannello è lavoro successivo se il volume lo giustifica.

## Autenticazione

Flusso a due livelli (Beds24 API v2, documentazione ufficiale
`https://wiki.beds24.com/index.php/Category:API_V2`):
1. Invite code generato manualmente da Marco in MARKETPLACE ▸ API nel
   pannello Beds24 — valido 24h, one-shot.
2. Scambio one-shot via `GET /authentication/setup` (header `code:`) →
   restituisce `token` (24h) + `refreshToken`.
3. Da quel momento, refresh automatico via `GET /authentication/token`
   (header con refresh token) prima della scadenza del token corrente.
   Il refresh token resta valido a tempo indeterminato se usato almeno
   una volta ogni 30 giorni.

Lo scambio one-shot dell'invite code lo esegue uno script CLI
(`backend/scripts/beds24Setup.js`, stesso pattern operativo di
`generaC59.js`), lanciato a mano da Marco quando ha il codice pronto — non
un endpoint HTTP esposto, per non lasciare una via per rigenerare
credenziali da remoto.

**Incognita aperta**: le fonti consultate sono discordanti sul base URL
esatto dell'API (`api.beds24.com/v2` vs `beds24.com/api/v2`) — si verifica
con la prima chiamata reale in fase di implementazione, non blocca il
design.

## Architettura

Nessun servizio intermedio, nessuna coda/message broker: un solo VPS con
PM2, il webhook processa inline con try/catch, stesso principio già in uso
per le altre rotte pubbliche del gestionale (`preCheckinPubblico`,
`bookingPubblico`).

Percorso primario: webhook Beds24 → upsert immediato.
Percorso di sicurezza: job notturno (`node-cron` — stessa dipendenza già
prevista per l'evolutiva "scadenza automatica prenotazioni Opzione",
introdotta una volta sola) → stessa funzione di upsert, per non avere due
logiche di scrittura da mantenere allineate.

## Componenti nuovi

- `database/migrations/0XX_beds24_config.sql` — tabella singleton (stesso
  pattern di `configurazione_ztl`): `refresh_token`, `token`,
  `token_scade_at`, `ultima_sincronizzazione_at`.
- `backend/lib/beds24Client.js` — client HTTP: header `token`, refresh
  automatico, rispetto del rate limit (100 crediti/5min per account,
  retry su 429/esaurimento crediti).
- `backend/controllers/beds24SyncController.js` — funzione di upsert
  condivisa da webhook e job notturno.
- `backend/routes/beds24.js` — `POST /api/beds24/webhook/bookings`
  (pubblica, nessun `verificaToken` — è Beds24 che chiama noi, non un
  utente autenticato — con rate limit dedicato, stesso pattern delle
  altre rotte pubbliche).
- `backend/scripts/beds24Setup.js` — scambio one-shot invite code →
  refresh token.
- Dato (non schema): ripopolare `tipi_camera_canali` per
  `canale='beds24'` con i `roomId` reali, una volta che Marco ha
  collegato Booking.com e le camere sono visibili nel pannello Beds24.

## Flusso dati

Beds24 → `POST /api/beds24/webhook/bookings` → riga grezza in
`webhook_log` (traccia sempre, anche se il processing fallisce dopo) →
`beds24SyncController.processaBooking()` → mappa `roomId` → `tipo_camera_id`
→ upsert `prenotazioni` (`canale_origine='beds24'`, match/idempotenza su
`external_booking_id`) + `soggiorni` + `ospiti`.

Il job notturno richiama `GET /bookings?modifiedSince=<ultima_sincronizzazione_at>`
e passa ogni prenotazione modificata nella stessa funzione di upsert,
aggiornando poi `ultima_sincronizzazione_at`.

## Gestione errori — decisioni prese in sessione di brainstorming (30/08/2026)

1. **Cancellazione con check-in già effettuato**: mai automatico. Se
   `soggiorni.check_in_effettuato_at` è già valorizzato, il webhook/job non
   tocca lo stato della prenotazione — la segnala per revisione umana.
   Nessuna nuova transizione automatica `check_in → interrotta` nella
   state machine.
2. **Camera non mappata** (`roomId` senza corrispondenza in
   `tipi_camera_canali`): la prenotazione **non viene scartata** — si
   salva comunque con un flag "da revisionare" e viene segnalata. Stesso
   principio già applicato al fix "ospite vuoto che sparisce" in
   Alloggiati Web (28/08/2026): mai uno scarto silenzioso su dati che
   riguardano occupazione/soldi.
3. **Setup credenziali**: vedi sezione Autenticazione — script CLI
   one-shot, refresh token in tabella DB (ruota), mai in `.env`/Git.
4. **Anagrafica ospite**: creazione minima nome+cognome all'arrivo del
   webhook — i dati regolatori (residenza, documento, Alloggiati Web)
   restano raccolti al pre-checkin/check-in come per ogni altra
   prenotazione, l'OTA raramente li fornisce comunque completi.

## Sicurezza

- Tutte le chiamate verso Beds24 partono dal backend Express, mai dal
  frontend (CLAUDE.md Sezione 7 — vincolo di progetto, non negoziabile).
- Endpoint webhook pubblico: nessuna `verificaToken`, ma loggato su
  `webhook_log` e con rate limit dedicato. **Incognita aperta**: non è
  documentato se Beds24 firma le chiamate webhook in uscita (header
  secret/HMAC) — da verificare quando si abilita il webhook nel pannello
  Beds24 (in fase di implementazione, non blocca il design). Se non
  esiste firma, si valuta un token condiviso nell'URL del webhook come
  mitigazione minima.
- Refresh token mai in Git — tabella DB dedicata, non `.env` (un file
  statico non regge un valore che ruota).

## Testing

`tests/api/beds24.test.js`, stesso schema degli altri moduli:
- Payload valido → upsert corretto (nuova prenotazione).
- `external_booking_id` duplicato → aggiornamento, nessun doppione.
- `roomId` non mappato → flag "da revisionare", nessun crash, nessuno
  scarto silenzioso.
- Cancellazione pre check-in → `stato='interrotta'`.
- Cancellazione post check-in → nessuna transizione automatica, solo
  segnalazione.
- Job di riconciliazione → recupera una modifica "persa" dal webhook.

## Incognite ancora aperte (verificabili solo con l'account reale)

- Base URL esatto dell'API (vedi Autenticazione).
- Formato esatto del payload webhook e presenza/assenza di una firma di
  sicurezza sulla chiamata in arrivo.
- Nomi esatti dei campi disponibilità nel payload di
  `POST /inventory/rooms/calendar` (visti solo `price1`/`minStay` in un
  esempio reale, `numAvail`/`stopSell` solo descritti) — rilevante solo
  quando si affronteranno i punti 2/3, non blocca questa Fase 1.
- Politica di retry di Beds24 sui webhook che il nostro endpoint non
  conferma (timeout, errore 500 nostro, ecc.).

## Prossimi passi

1. Marco completa il collegamento di Booking.com nell'account di prova.
2. Marco genera un invite code e lo passa per il primo scambio via
   `beds24Setup.js`.
3. Si passa al piano di implementazione (skill `writing-plans`) per
   questa Fase 1 — nessun codice scritto prima di quel piano.
