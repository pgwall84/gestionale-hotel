# Design — Invio tariffe/disponibilità/restrizioni a Beds24 (Modulo 2.3, Fase 2/3)

Data: 03/09/2026
Stato: approvato da Marco in sessione di brainstorming. In attesa di piano di implementazione (writing-plans).

## Contesto

Segue `docs/superpowers/specs/2026-08-30-beds24-integrazione-design.md` (Fase 1 —
lettura prenotazioni), completata e in produzione dal 02-03/09/2026. Quella
spec lasciava esplicitamente fuori scope i punti 2 e 3 del modulo 2.3
("scrivere disponibilità verso Beds24" e "scrivere prezzi verso Beds24"):
questo documento li copre insieme, essendo emerso in sessione che sono
troppo intrecciati per due spec separate (stessa configurazione per
tipologia camera, stesso job periodico, stessa vista frontend).

Obiettivo di Marco, dette le sue parole: "impostare le tariffe sul
gestionale e poi darle a Beds24" — il gestionale resta l'unica fonte di
verità su prezzi e disponibilità, mai il contrario (già deciso "non ora"
nella spec Fase 1, confermato qui).

Vincolo di business dichiarato da Marco: Beds24 fattura su base + costo per
camera/unità aperta — la struttura aprirà ragionevolmente ~5 unità (una per
tipologia), non tutte le camere fisiche.

**Non è nello scope di questo documento decidere quando attivare la
connessione Beds24↔Booking.com.** Quella resta una decisione operativa
separata di Marco, presa solo quando le tariffe inviate saranno verificate
corrette (vedi corrispondenza con la sezione "Gestione errori" più sotto).
Vedi anche lo scambio con il supporto Beds24 (Eleni, 02-03/09/2026): una
volta attivata la connessione, i prezzi non sono più modificabili a mano
nell'extranet di Booking.com — da quel momento la fonte è sempre e solo
Beds24 (e quindi il gestionale, a monte).

Groundwork già esistente, verificato nel codice il 03/09/2026:
- `planning_tariffe_giorni` (migration 053) — già modella, per
  tipo_camera+trattamento+giorno: `prezzo_notte`, `min_stay`,
  `chiuso_arrivo`, `chiuso_partenza`, `stop_sell`. Oggi usata solo dal
  motore di prenotazione diretto (`bookingPubblicoController.js`), nessuna
  nozione di canale.
- `tariffe` + `periodi_stagionali` (migration 018, 051) — prezzo base per
  stagione quando non c'è un override in `planning_tariffe_giorni`.
- `tipi_camera_canali` (migration 020) — già mappa tipo_camera↔roomId
  Beds24 per le 5 tipologie in vendita (Fase 1).
- `beds24Client.js` — solo lettura oggi (`getBookings`, gestione token).
  Nessun metodo di scrittura verso Beds24.
- Endpoint Beds24 reale per l'invio: `POST /inventory/rooms/calendar`
  (confermato sulla loro documentazione pubblica, non ancora sullo Swagger
  reale — da verificare con Marco prima di scrivere il client, stesso
  procedimento già seguito per `getBookings` in Fase 1).

## Scope

**Dentro:**
- Due canali soltanto: `diretto` (comportamento attuale, invariato) e
  `beds24` (nuovo — rappresenta l'intera distribuzione OTA: Beds24 fa da
  channel manager e smista lui a Booking.com/Airbnb/Expedia con le sue
  regole interne, il gestionale non integra le OTA singolarmente).
- Due piani tariffari verso Beds24 per tipologia camera: B&B e Mezza
  Pensione. Pensione Completa resta solo sul canale diretto (le OTA non la
  supportano come piano vendibile — vincolo di piattaforma, non solo
  scelta di semplificazione).
- Disponibilità per tipologia camera verso Beds24, capped: `min(camere
  fisiche libere quel giorno, tetto configurato per quella tipologia)`.
- Prezzo verso Beds24: prezzo base (stessa fonte del diretto,
  `planning_tariffe_giorni`/`tariffe`) più una maggiorazione percentuale
  configurabile per tipologia camera, pensata per assorbire la commissione
  Beds24/OTA. Nessun prezzo manuale slegato dal diretto in questa fase.
- Restrizioni per canale: `min_stay`, `chiuso_arrivo`, `chiuso_partenza`,
  `stop_sell` possono differire tra diretto e Beds24 per la stessa
  tipologia/trattamento/giorno (es. stop-sell solo su Beds24, diretto
  ancora aperto).
- Invio disponibilità: immediato, agganciato a ogni creazione/modifica/
  cancellazione di soggiorno — qualunque origine (diretto o Beds24 stesso
  via `processaBooking`, stessa funzione per tutti, nessun caso speciale).
- Invio tariffe + restrizioni: job periodico (pattern identico alla
  riconciliazione notturna Fase 1), frequenza da definire in fase di piano
  (candidato: ogni 2-4 ore).
- Orizzonte di invio: fino a una data di fine stagione impostata a mano da
  Marco (`beds24_config`, nuovo campo) — nessun avanzamento automatico
  della finestra in questa fase.
- Log dedicato di ogni invio (successo o errore), stesso principio di
  `webhook_log` — nulla sparisce silenziosamente.
- UI: vista canale Beds24 nel planning tariffe, con Pensione Completa
  nascosta e un modo per impostare eccezioni per canale senza dover
  ripetere ogni riga del calendario (vedi sezione Frontend).

**Fuori scope (rimandato):**
- Attivazione della connessione Beds24↔Booking.com — decisione operativa
  separata di Marco.
- Integrazione diretta con singole OTA (Booking/Airbnb/Expedia) — Beds24
  resta l'unico canale a cui il gestionale parla.
- Avanzamento automatico dell'orizzonte stagionale.
- Prezzo Beds24 manuale indipendente dal diretto (solo % di maggiorazione
  per ora).
- Sincronizzazione di ritorno da modifiche fatte a mano nel pannello
  Beds24 — resta "non ora", come deciso in Fase 1.

## Modello dati

**`tipi_camera_canali`** (esistente, migration 020) — due colonne nuove:
- `unita_esposte SMALLINT` — tetto massimo di unità vendibili su quel
  canale per quella tipologia. `NULL` = nessun tetto oltre la disponibilità
  fisica reale (utile se in futuro si aggiungono canali senza vincoli di
  costo per unità).
- `maggiorazione_percentuale NUMERIC(5,2) NOT NULL DEFAULT 0` — applicata
  al prezzo base per ottenere il prezzo da inviare su quel canale.

**`planning_tariffe_giorni`** (esistente, migration 053) — una colonna
nuova:
- `canale VARCHAR(20)` — `NULL` (default, tutte le righe esistenti restano
  valide senza migrazione dati) significa "vale per tutti i canali". Un
  valore esplicito (`'beds24'`) è un'eccezione che ha precedenza sulla riga
  `NULL` per la stessa combinazione tipo_camera/trattamento/data. Vincolo:
  indice univoco esteso a `(tipo_camera_id, trattamento, data, canale)`
  (oggi è su `(tipo_camera_id, trattamento, data)` — la migration deve
  gestire `NULL` come valore distinto, non collassabile con `'beds24'`
  nello stesso indice univoco: Postgres tratta `NULL` come "non uguale a
  se stesso" nell'unicità di default, verificare in fase di piano se serve
  un indice parziale o basta l'indice univoco standard).

**`beds24_config`** (esistente, migration del setup Fase 1) — un campo
nuovo:
- `orizzonte_invio_tariffe_fino_a DATE` — ultima data fino a cui il job
  periodico invia dati. Aggiornato a mano da Marco.

**Tabella nuova — log invii** (nome indicativo `beds24_invio_log`, stesso
principio di `webhook_log`): traccia ogni chiamata a
`POST /inventory/rooms/calendar` — tipo (`disponibilita`/`tariffe`),
payload inviato, esito, errore. Da rifinire in fase di piano (potrebbe
riusare `webhook_log` con un valore diverso di `fonte`, invece di una
tabella nuova — verificare se lo schema esistente si adatta senza
snaturarlo).

## Calcolo disponibilità

Per tipo_camera + giorno: conta le camere fisiche di quel tipo (`camere`
JOIN `tipi_camera_camere`, `attivo = true`) non occupate da un soggiorno
non cancellato che copre quella data — stessa logica già scritta in
`trovaCameraLibera` (`beds24SyncController.js`), ma che conta invece di
selezionarne una con `FOR UPDATE SKIP LOCKED`. Il risultato finale è
`min(camere libere, unita_esposte)` — mai il numero esposto supera la
disponibilità fisica reale, anche se il tetto configurato è più alto.

## Calcolo prezzo

Riusa la logica di calcolo prezzo già esistente per il diretto
(`tariffeController.js`, `calcolaPrezzoDirettoPerNotte` e le funzioni di
supplemento trattamento) per ottenere il prezzo base B&B e Mezza Pensione
per tipo_camera/notte — stessa fonte dati del sito, nessuna duplicazione
di logica di pricing. Il prezzo inviato a Beds24 è
`prezzo_base * (1 + maggiorazione_percentuale / 100)`.

## Calcolo restrizioni

Confermato su Swagger (04/09/2026, sezione Request/Response di
`POST /inventory/rooms/calendar`): Beds24 non ha campi booleani separati
per `chiuso_arrivo`/`chiuso_partenza`/`stop_sell` come i nostri. Ha un
unico campo enum `override` per camera/giorno:
`none | blackout | exception | noCheckIn | noCheckOut | noCheckInOrCheckOut`.

Mappatura verso Beds24 (in attesa di conferma finale di Marco sulla
precedenza — vedi "Incognite ancora aperte"):
- `stop_sell = true` → `override: "blackout"` (precedenza massima —
  ignora gli altri due flag)
- `chiuso_arrivo = true` e `chiuso_partenza = true` (stop_sell false) →
  `override: "noCheckInOrCheckOut"`
- solo `chiuso_arrivo = true` → `override: "noCheckIn"`
- solo `chiuso_partenza = true` → `override: "noCheckOut"`
- nessuno dei tre → `override: "none"`

Questa è una perdita di espressività accettata consapevolmente: il
nostro schema permette combinazioni che Beds24 non può rappresentare
(es. stop_sell insieme a chiuso_arrivo restano indistinguibili lato
Beds24 — entrambe diventano `blackout`). Non è un problema per il
diretto (che legge le righe originali, non passa da questa
traduzione).

## Frontend

La vista canale Beds24 nel planning tariffe mostra solo B&B e Mezza
Pensione (Pensione Completa nascosta, non solo disabilitata — le OTA non
la supportano). Le eccezioni per canale (righe con `canale = 'beds24'` in
`planning_tariffe_giorni`) vanno segnalate senza appesantire la vista di
default — es. un indicatore visivo sulle celle dove esiste un'eccezione,
non una colonna sempre visibile che raddoppia la griglia. Dettaglio di
interazione (come si crea/rimuove un'eccezione) da definire in fase di
piano con mockup, non in questo documento.

## Gestione errori

Confermato su Swagger (04/09/2026): Beds24 fattura le chiamate API in
crediti su finestre di 5 minuti, esposti negli header di risposta
(`X-FiveMinCreditLimit`, `X-FiveMinCreditLimit-Remaining`,
`X-FiveMinCreditLimit-ResetsIn`, `X-RequestCost`). Il job periodico
tariffe, che invia per 5 tipologie × tutto l'orizzonte stagionale, deve
leggere questi header e rallentare (o mettere in coda) quando si
avvicina al limite, altrimenti rischia di perdere invii proprio nel
batch pensato come rete di sicurezza. Il push disponibilità immediato,
essendo un evento singolo per prenotazione, è meno a rischio ma va
comunque contato nello stesso budget di crediti.

La risposta del `POST` restituisce anche `errors[]`/`warnings[]`/`info[]`
strutturati per campo (`action`, `field`, `message`), non un messaggio
generico — il log va scritto usando questi campi così com'è, non
appiattito in una stringa unica: è più facile da leggere e da correlare
in futuro con la riga di `planning_tariffe_giorni` che l'ha generato.

Un invio fallito (rete, errore Beds24, token scaduto non rinnovabile) non
deve bloccare silenziosamente: va sempre loggato con l'errore specifico
(stesso principio di `webhook_log`/coda di revisione già in uso in Fase
1). Il job periodico tariffe, se fallisce su un giorno/tipologia, continua
sugli altri invece di abortire tutto il batch — un errore isolato non deve
lasciare l'intero orizzonte non sincronizzato. Il push disponibilità
immediato, se fallisce, non deve bloccare la creazione/cancellazione del
soggiorno che l'ha generato (stesso pattern già in uso per il webhook: la
scrittura sul nostro DB ha sempre priorità, l'invio a Beds24 è
best-effort con log dell'errore) — il job periodico tariffe, girando su
tutto l'orizzonte, funge anche da rete di sicurezza per una disponibilità
non arrivata.

## Testing

Le funzioni di calcolo (disponibilità capped, prezzo con maggiorazione)
sono logica pura, testabili in isolamento senza mock verso Beds24. Il
nuovo metodo di `beds24Client.js` va testato con lo stesso pattern già
in uso per `getBookings` (mock della risposta HTTP). I job (disponibilità
immediata, tariffe periodico) vanno testati sullo stesso modello dei test
esistenti per `beds24Riconciliazione.js` e per il webhook — verificare sia
il percorso di successo sia quello di errore isolato che non blocca il
resto del batch.

## Incognite ancora aperte

- ~~Formato esatto del body di `POST /inventory/rooms/calendar`~~ —
  **Risolto (04/09/2026)** via Swagger reale: payload sparso
  `[{roomId, calendar: [{from, to, ...soli campi da cambiare}]}]`.
  Disponibilità = `numAvail`. Min/max stay = `minStay`/`maxStay`.
  Restrizioni arrivo/partenza/stop-sell = campo unico `override` (enum
  — vedi sezione "Calcolo restrizioni" sopra, mappatura in attesa di
  conferma di Marco sulla precedenza). Risposta con `errors`/`warnings`
  strutturati per campo e header di rate limiting a crediti — vedi
  "Gestione errori".
- **Ancora aperta**: cosa rappresentano `price1`...`price16` (16 slot di
  prezzo per camera/giorno, tipo `number`, nessuna descrizione su
  Swagger) — non possiamo assumere che siano i nostri 2 piani tariffari
  (B&B, Mezza Pensione). Da verificare da Marco su Beds24 Setup → Rooms
  → pricing di una delle 5 tipologie reali, guardando le etichette degli
  slot di prezzo nell'interfaccia (ospiti vs piani tariffari). Blocca la
  sezione "Calcolo prezzo" finché non è chiarito.
- ~~Se Beds24 fattura anche per piano tariffario oltre che per
  unità/camera~~ — **Risolto (04/09/2026)**: la pagina Account > Billing
  di Marco mostra la fatturazione mensile scomposta in Monthly Account
  Fee, Monthly Sub Account Fee, Properties (per rooms/proprietà), Channel
  Management (per link) e Private Label Booking Domain — nessuna voce
  legata a piano tariffario/rate plan. Avere 2 piani (B&B, Mezza
  Pensione) sulla stessa tipologia camera non comporta costi aggiuntivi.
  Nota operativa emersa dallo stesso controllo, **risolta (04/09/2026)**:
  la voce "Properties" mostrava 8 rooms fatturate contro le 5 tipologie
  realmente in vendita. Marco ha verificato su Setup → Room Types: sono
  5 tipologie reali più 3 room template vuoti e non collegati a nessun
  canale (la voce "Channel Management" conta infatti già solo 5 links).
  Non è un prerequisito del modulo né tocca `tipi_camera_canali` — è
  spreco puro, indipendente da questo design, da eliminare su Beds24
  quando Marco vuole (azione operativa, fuori da questa spec).
- Indice univoco su `planning_tariffe_giorni` con `canale` nullable — la
  semantica esatta (indice parziale vs standard) va verificata in fase di
  piano, non solo descritta qui.

## Prossimi passi

Revisione di Marco su questo documento, poi passaggio a `writing-plans` per
il piano di implementazione a task.
