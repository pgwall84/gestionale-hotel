# STATO_PROGETTO.md — Hotel del Golfo — Gestionale

> Fotografia dello stato attuale, NON cronaca. Il "come/perché" di ogni
> riga è in `docs/DIARIO_SESSIONI.md` (cercare per data) o
> `docs/EVOLUTIVE.md` (backlog/gap aperti — dettaglio tecnico ricco, non
> materiale da sfoltire, vedi nota in fondo). CLAUDE.md §16 rimanda qui:
> leggere entrambi a inizio sessione.
>
> Aggiornato a ogni sessione. Se supera ~200 righe, le voci più vecchie
> migrano nel diario come puntatore di una riga (regola in CLAUDE.md §15).

## Fase 1 — Operatività interna

CHIUSA (09/08/2026). Deploy VPS in produzione: HTTPS su
`hdgolfo-gestionale.com` (netcup VPS Lite 1 G12s), audit di sicurezza
pre-produzione incluso. Guida server: `docs/DEPLOY_VPS_NETCUP.md`.

## Fase 2A — Prenotazioni e OTA

| Modulo | Stato reale | Dettaglio |
|---|---|---|
| 2.1 Anagrafica ospiti / CRM | ✅ Fatto, esteso 14-15/08 con VIP/blacklist/tag/dedup | diario 01/08, 14-15/08 |
| 2.2 Planning + Tariffe/stagionalità | ✅ Fatto e verificato (74 test, 31/07) | diario 31/07 |
| 2.3 Channel manager (OTA) | Fase 1 (mappatura camere↔canale, `tipi_camera_canali`) ✅, resta valida a prescindere dal fornitore. **Fornitore cambiato 19/08/2026**: WuBook/WooDoo scartato (**verificato direttamente con WuBook**, non solo dedotto — accettano solo fornitori certificati multi-cliente), stessa risposta da RoomCloud, Octorate escluso (richiede comprare il loro gestionale in bundle, ~160€/mese) — **Beds24 scelto al suo posto, spec non ancora scritta** | EVOLUTIVE.md correzione 19/08; `sito-hotel/SPEC_SITO_HOTEL.md` §10 (fonte più aggiornata) |
| 2.4 Tassa di soggiorno | ✅ Fatto (01/08). Formato export Comune di Lerici ancora sconosciuto — export Excel generico nel frattempo | diario 01/08 |
| 2.5 Alloggiati Web (SOAP) | ⚠️ **Più avanti di quanto dica CLAUDE.md §8**: Fase 1b ✅, **Fase 2 (schedina+invio reale) già costruita e in uso controllato** dal 13/08 — Test validato contro il servizio vero (1/1), invio reale dietro interruttore `ALLOGGIATI_JOB_ATTIVO` spento di default, coda manuale funzionante. 4 gap noti (D/A/B/C) chiusi 13-14/08, **non ancora verificati da Marco contro Postgres reale** | EVOLUTIVE.md "Fase 2, stato 13/08/2026"; diario 13-14/08 |
| 2.6 ROSS1000/ISTAT | ⚠️ **AGGIORNATO 27/08/2026 (bis, stessa giornata)**: costruito il generatore RIMOVCLI reale (Marco: "avvia questo blocco"). Nuovi file: `backend/lib/rimovcliResidenza.js` (mappatura codici residenza — comune_residenza_codice/stato_residenza_codice a 9 cifre di `ospiti` → codici ISTAT a 3 cifre di `rigac59@residenza`, via `docs/alloggiati web/comuni.csv`+`stati.csv` già nel repo e due nuove tabelle `docs/rimovcli/province.json`+`stati_esteri.json` convertite da `ISTAT - PROVINCE.XLSX`/`stati esteri excel.xls`; nessun abbinamento indovinato, un ospite non risolvibile è escluso e segnalato, mai un codice a caso), `backend/lib/rimovcliC59.js` (aggregazione arrivati/partiti/presenti/diurni per giorno e provenienza, continuità giorno-su-giorno verificata — vale per costruzione se i conteggi derivano dagli stessi dati con lo stesso criterio di intervallo, non serve riconciliazione esplicita), `backend/scripts/generaC59.js` (CLI: `node scripts/generaC59.js YYYY-MM-DD [IDSTRUTTURA]`). **Validato con dati sintetici** (continuità matematica confermata, XML validato con `xmllint --schema ModelloC59.xsd`) e con la mappatura reale del repo (Lerici→SP→011, Germania→004, girata sul tuo computer) — **non con una query reale sul DB**: il Postgres locale resta irraggiungibile dalla sessione Cowork (stesso `ECONNREFUSED` di prima, sembra un limite della VM non un servizio da avviare). **Prossimo passo per Marco**: lanciare `node scripts/generaC59.js YYYY-MM-DD` in locale per un file con dati veri, controllare gli avvisi in testa al file (ospiti esclusi dal conteggio per residenza non risolvibile — se capitano paesi esteri non riconosciuti, ampliare `ALIAS_STATI` in `rimovcliResidenza.js`), poi inviarlo per la certificazione. `ross1000Xml.js`/`ross1000Controller.js` restano non toccati e non riusabili. Nessun `idstruttura` reale finché il test non ha esito positivo. **AGGIORNATO 28/08/2026**: dai dati veri emerso che 8 ospiti erano esclusi per stato di residenza mancante (campo facoltativo) — Marco ha chiesto di renderlo obbligatorio. Fatto in tre punti: check-in (`prenotazioniController.js`, blocca la transizione se manca per l'intestatario), pre-checkin (`preCheckinPubblicoController.js`/`applica()`, vedi riga Fase 2D sotto) e scheda cliente completa (`clienti/[id]/page.jsx`, `salvaModifiche()` — solo lato client, solo sul salvataggio della scheda intera). **Deliberatamente NON toccato**: `anagraficaOspitiController.js` `crea()`/`aggiorna()` sul backend e i toggle singoli (VIP/blacklist/tag) — `planning-camere/page.jsx` crea clienti apposta con solo nome+cognome (creazione rapida in griglia, auto-creazione del referente camera) e bloccarli lì avrebbe rotto quei flussi | EVOLUTIVE.md "RIMOVCLI vs ROSS1000"; `docs/rimovcli`; `docs/ross1000/test-certificazione`; diario 24/08/2026, 27/08/2026, 27/08/2026 (bis), 28/08/2026 **AGGIORNATO 28/08/2026 (ter)**: costruita la pagina operativa "Statistiche Liguria" (frontend `app/statistiche-liguria/page.jsx`, backend `routes/rimovcliC59.js`+`controllers/rimovcliC59Controller.js`, permesso `shared/ruoli.js` sezione `rimovcli`) — genera l'XML C/59 su un intervallo di date (un file XML per giorno, coerente con lo schema RIMOVCLI) più uno zip per il caricamento in batch. La vecchia voce menu "Statistiche Liguria" (che puntava a `/impostazioni/ross1000`, tracciato nazionale) è stata rinominata "ROSS1000" e NON eliminata — resta utile per l'appartamento con flussi turistici diversi. Ancora nessun invio reale: idstruttura resta 'DA_CONFIGURARE' finché la certificazione non ha esito positivo (vedi passo 1-2 del piano sopra). **AGGIORNATO 28/08/2026 (quater)**: dati reali hanno mostrato ospiti esclusi dal generatore per residenza mancante anche su familiari (non solo intestatari) — verificato contro la documentazione RIMOVCLI (ModelloC59.xsd + Manuale Utente ImportC59.pdf + Specifiche Import Gestionali Alberghieri.pdf): nessuna eccezione prevista, ogni persona va contata. Estesi i tre vincoli di obbligatorietà residenza da "solo intestatario" a "ogni ospite del soggiorno", aggiunto anche il controllo sul comune (mancava) — `prenotazioniController.js` (check-in), `preCheckinController.js` (`applica()`), `preCheckinPubblicoController.js` (`invia()`). Form pubblico `app/pre-checkin/[token]/page.jsx` riorganizzato con un primo blocco "Referente principale" (documento + tutti i campi) e blocchi ridotti per gli altri ospiti (niente documento, richiesto da Alloggiati Web solo per intestatari — vedi `lib/alloggiatiSchedina.js` `TIPI_CON_DOCUMENTO`), con una spunta "deriva residenza dal referente principale" per velocizzare l'inserimento; stessa spunta aggiunta anche in `app/pre-checkin/page.jsx` (revisione/applica lato reception, deriva dall'intestatario della camera). Nessuna migration necessaria: le colonne residenza erano già su `pre_checkin_ospiti` dalla 029. **Punto aperto**: "check-in" in gestionale non ha una schermata multi-ospite propria (la reception corregge dati mancanti dalla scheda cliente singola) — la spunta "deriva" lì non è stata aggiunta per mancanza di un secondo ospite nello stesso contesto, da chiarire con Marco se serve una schermata dedicata. Non ancora provato con `npm run dev` reale (nessun accesso DB da Cowork). **AGGIORNATO 28/08/2026 sera**: Marco ha verificato in locale tutti e tre i punti — check-in bloccato senza residenza (soggiorno 3886/camera 4, Elena Costa), applica pre-checkin bloccato + spunta "deriva dall'intestatario" funzionante, form pubblico bloccato + spunta "deriva dal referente principale" funzionante. Effetto collaterale trovato durante i test e risolto: i test manuali esaurivano il rate limit pubblico del pre-checkin (30/15min) — vedi sezione "Verifiche pendenti" (Rate limit pubblici) per il dettaglio dei 3 rate limit allargati in sviluppo/test. Restano da fare: validazione xmllint contro ModelloC59.xsd su dati reali (finora solo sintetici), continuità giorno-su-giorno su un intervallo reale, invio modulo adesione RIMOVCLI e primo file per certificazione (passi 1-2 del piano). **AGGIORNATO 28/08/2026 (notte)**: xmllint su dati reali (file generato dalla pagina Statistiche Liguria) → valida senza errori contro ModelloC59.xsd. Continuità giorno-su-giorno verificata su 3 giorni reali consecutivi (26→27→28/08): formula presenti(oggi)=presenti(ieri)+arrivati(oggi)-partiti(oggi) torna esatta su tutti i codici comuni. Trovato e risolto un bug distinto durante i test: il form pubblico pre-checkin (`app/pre-checkin/[token]/page.jsx`) filtrava silenziosamente le righe ospite senza nome/cognome prima dell'invio — un ospite lasciato incompleto spariva senza avviso. Corretto su due livelli: frontend valida che il numero di righe combaci esattamente con `soggiorni.num_ospiti` (già affidabile da booking online o da inserimento reception per prenotazioni telefoniche) e che ogni riga sia completa, con contatore live "X/N compilati" per camera; backend (`preCheckinPubblicoController.js`, `invia()`) applica lo stesso controllo di conteggio dentro la transazione come difesa indipendente. Verificato da Marco in locale, tutti i casi (riga incompleta, righe in meno, righe in più, invio corretto) bloccano/passano come previsto. **Restano solo le azioni di Marco fuori dal codice**: compilare/inviare il modulo di adesione RIMOVCLI, inviare un primo file per la certificazione a movimentoturistico.istat@regione.liguria.it. |

## Fase 2B — Fiscale e pagamenti

Non iniziata. 3.1 (A-Cube), 3.2 (fatturazione B2B), 3.3 (pagamenti
Nexi/Stripe via WuBook) — dipendono in parte da 2.3.

## Fase 2C — Canale diretto

| Modulo | Stato reale | Dettaglio |
|---|---|---|
| 4.1 Booking engine | 🔶 Costruito come "Booking Engine Diretto v2" su `sito-hotel` (19-20/08, caparra 30% Stripe) — CLAUDE.md §8 non lo segna ancora. Dal 24/08 il prezzo legge anche `planning_tariffe_giorni` (Piano 4/4bis, vedi sotto), non più solo il motore `/tariffe`, e Piano 4bis è confermato coerente con dati reali (override Matrimoniale → Tripla/Quadrupla derivate correttamente, sia in prenotazione sia nel "consigliato" di griglia). **Importante**: il DB del server di produzione è oggi quasi vuoto (nessun trattamento/tariffa/planning-tariffe reale) — Marco configura tutto in locale e carica in produzione solo periodicamente, e `sito-hotel` su Vercel punta al gestionale di produzione. Per verificare il booking engine con dati veri va usato `sito-hotel` in locale con `NEXT_PUBLIC_GESTIONALE_API_URL` puntato al gestionale locale, mai la versione Vercel. Aperto: suite `bookingPubblico.test.js` scritta ma mai eseguita (e non aggiornata per il Piano 4/4bis), range min/max tariffe e sconto bambini 3-11 (oggi 0%) da popolare, verifica end-to-end `/prenota` non fatta, restrizioni min_stay/chiusure mai testate su una prenotazione reale, dati di produzione da popolare prima che il booking live serva ospiti veri. **Nuovo 24/08/2026 (piano date-range picker)**: aggiunto `GET /api/booking-pubblico/disponibilita-mese` (stesso file, stesso pattern EXISTS inventario/capienza di `disponibilita()`, adattato con `generate_series` per un booleano per notte su un mese intero, senza calcolo prezzo) — alimenta il nuovo calendario di `sito-hotel` (Piano `sito-hotel/docs/superpowers/plans/2026-08-24-date-range-picker-componente.md`, non ancora eseguito). **Eseguito e verificato per davvero dal titolare (24/08/2026)**: `npx jest` in locale ha trovato un bug reale nel test aggiunto (assumeva erroneamente che l'endpoint fosse isolato per tipologia, mentre è aggregato su tutte le tipologie attive per design — fix: capienza di test calcolata come `MAX(capienza_max reali)+1` invece di un valore fisso) e, separatamente, un bug preesistente non correlato nel blocco "Tariffe derivate" (INSERT cieco su una tabella condivisa con la configurazione reale, corretto con lo stesso pattern salva/ripristina già in uso per `configurazione_bambini`). Commit reali `43c6a5e` + `d84bb92`. **Suite completa finale: 35/35 suite, 969/969 test, nessuna regressione** — la voce "scritta ma mai eseguita" sopra non vale più per questo endpoint, resta vera solo per la parte di `bookingPubblico.test.js` scritta prima del 24/08 (range min/max tariffe, sconto bambini, verifica end-to-end `/prenota`, restrizioni min_stay/chiusure — vedi sopra). Piano 1 chiuso, si passa al Piano 2 (`sito-hotel`, `DateRangePicker.tsx`) | diario 19-20/08, 24/08, 24/08 (bis), 24/08 (ter) |
| 4.2 Welcome Book | ✅ Fatto, in produzione su Vercel (dominio provvisorio) | diario 02/08 |

## Fase 2D — Esperienza ospite

✅ Tutto fatto: 5.1 check-in/out + housekeeping (03/08), 5.2 pre check-in
OCR+self-service entrambe le fasi (04-05/08), 5.3 email automatiche +
testi editabili + Offerte (04/08).

**AGGIORNATO 28/08/2026**: stato di residenza reso obbligatorio (richiesta
Marco, seguita al gap trovato nel generatore RIMOVCLI — vedi 2.6), in tre
punti. Check-in (5.1, `prenotazioniController.js`): blocca se manca per
l'intestatario del soggiorno. Pre-checkin (5.2): il form pubblico
(`preCheckinPubblicoController.js` `invia()` + `pre-checkin/[token]/page.jsx`)
non sa ancora chi sarà l'intestatario — tipo_alloggiato viene assegnato
dopo in revisione — quindi richiede la residenza al primo ospite inserito
per camera (stessa convenzione già usata dalla reception come default);
`preCheckinController.js` `applica()` richiede comunque la residenza per
chi viene effettivamente assegnato come intestatario in revisione,
coprendo il caso in cui la reception lo cambi. Scheda cliente
(`clienti/[id]/page.jsx`): richiesta solo nel salvataggio della scheda
completa (`salvaModifiche()`, lato client) — non nel PATCH generico dei
toggle singoli né in `anagraficaOspitiController.js` `crea()`/`aggiorna()`
sul backend, per non rompere la creazione rapida di clienti con dati
minimi già in uso altrove (`planning-camere/page.jsx`). **Aggiunta
successiva stesso giorno**: contatore "Clienti da completare" in
`/clienti` (`GET /api/ospiti/da-completare-count` + filtro
`senza_residenza` su `GET /api/ospiti`) per i clienti storici già senza
residenza — clic sul contatore applica il filtro sulla stessa pagina.
Segnalato al titolare come rattoppo mirato, non soluzione strutturale —
vedi `docs/EVOLUTIVE.md` "Modulo 2.1 — Anagrafica clienti da evolvere".

## Verifiche pendenti (scritto/costruito, non ancora confermato)

- **Rate limit pubblici — dimensionamento da verificare sul campo (28/08/2026)**:
  tre endpoint pubblici condividono lo stesso pattern (`express-rate-limit`,
  finestra 15 minuti, per IP): login (`app.js`, max **5**/15min, conta solo
  i tentativi falliti — `skipSuccessfulRequests: true`), pre-checkin
  pubblico (`routes/preCheckinPubblico.js`, max **30**/15min — conta anche
  `GET /codici`, chiamato ad ogni digitazione nei campi con suggerimenti,
  non solo l'invio) e booking pubblico (`routes/bookingPubblico.js`, max
  **30**/15min). Questi sono i valori che varranno IN PRODUZIONE — mai
  stati verificati contro un volume di traffico reale, scelti a mano
  durante lo sviluppo (04/08, 19/08). Allargati a 1000/15min ovunque
  NODE_ENV non sia `production` (prima erano stretti anche in sviluppo,
  allargati solo in test) — segnalato da Marco: durante i test manuali del
  vincolo residenza RIMOVCLI la quota di pre-checkin pubblico si esauriva
  in pochi minuti. Da rivedere quando ci sarà traffico reale da osservare
  (post 1.10 Deploy VPS): 5 tentativi di login/15min è tipico ma può
  essere stretto per un utente che sbaglia password più volte da mobile;
  30 richieste/15min sul pre-checkin pubblico è già tarato pensando anche
  alle chiamate di autocomplete, ma non verificato con un utente reale che
  compila il form da telefono.

- Prenotazioni di gruppo (15/08): solo `tsc`/`node -c` — wizard gruppo +
  pagamento gruppo/camera mai visti in UI da Marco.
- Booking Engine Diretto v2 (19-20/08): vedi riga 4.1 sopra. Manca anche
  un **mini-audit di sicurezza mirato pre-go-live** (rate limit, firma
  webhook, scope PCI) — dichiarato esplicitamente FUORI da quel piano,
  da programmare a parte prima di sostituire il widget TS con il bottone
  reale (CLAUDE.md §7).
- Alloggiati Web Fase 2 (13/08): vedi riga 2.5 sopra. Sincronizzazione
  SOAP reale (`GenerateToken`/`Test`/`Send`) mai testata con credenziali
  vere, solo simulata nei test.
- Le due modalità ZTL (Import TS vs "Sincronizza da Planning", 15/08):
  mai verificate in UI dopo il refactor.
- **Intero modulo HACCP 6.1 (A.1-A.8)**: verificato solo via API/test
  automatici in 4 sessioni (16/08) — mai visto in UI da Marco. Soglie
  alert checklist (15:00 ambra, 22:00 rossa) sono un'ipotesi non
  confermata dall'uso reale.
- Calendario occupazione 30gg in Dashboard: aggregazione solo lato
  frontend, nessun test HTTP dedicato (nessuna infrastruttura di test
  frontend nel progetto).
- ✅ **Code review 22/08 Tier 2/3 — CONFERMATO PIENAMENTE (23/08)**:
  commit `5892dd9` su `main`, suite completa **34/34 suite, 952/952 test
  verdi** (include `camere.test.js`, chiude il dubbio lasciato aperto
  poco sopra nello stesso giorno). Un bug reale trovato durante
  l'esecuzione (nel test, non nel codice applicativo): l'`afterAll` del
  describe `'Trattamento + tipo camera venduto in griglia/dettaglio'`
  (`tests/api/prenotazioni.test.js`) cancellava `tipi_camera` prima che
  l'`afterAll` esterno del file cancellasse la prenotazione/soggiorno che
  lo referenzia ancora via `tipo_camera_venduto_id` — ordine di pulizia
  sbagliato, introdotto insieme al nuovo test. Fix: azzerare il
  riferimento prima della DELETE. `sito-hotel`: nessuna suite in questo
  repo, commit `a08e842` su `master`. **Nota non verificata**: il conteggio
  suite è salito da 33 (audit 22/08) a 34 — nessuna nuova suite segnalata
  esplicitamente in questa sessione, probabilmente solo un ricalcolo
  corretto, non un problema.
- ✅ **Revisione colori planning-camere (23/08/2026, fatta in Cowork, non
  nel tab Code) — CONFERMATA A VIDEO da Marco stesso giorno**:
  `STATI_COLORI` (confermata→viola, check_out→blu, aggiunta
  interrotta→rosso) e `PopupStatoCamera` (Fermata/Partenza→grigio neutro,
  Pronta→verde) riscritti per separare il colore-stato-prenotazione dal
  colore-stato-pulizia — dettaglio e motivazione in
  `docs/DIARIO_SESSIONI.md`. Resta comunque solo `esbuild` come verifica
  automatica (nessuna suite Jest dedicata ai colori, sono solo stile).
- ✅ **Posizione fissa bottoni — pannello dettaglio prenotazione (23/08/2026,
  fatta in Cowork, non nel tab Code) — CONFERMATA A VIDEO da Marco lo
  stesso giorno**: footer fisso in fondo al pannello (primario a destra
  colore brand, annulla/distruttivo a sinistra), condiviso tra modalità
  vista e modifica — dettaglio in `docs/DIARIO_SESSIONI.md`.
- **Pagamento misto non segnalato visivamente nel riepilogo economico
  (segnalato da Marco 23/08/2026)**: `RiepilogoEconomico` (usata sia nel
  pannello dettaglio sia in `PannelloCheckOut`) mostrava "Già pagato" come
  un unico totale aggregato — lo spacchettamento per modalità di pagamento
  esisteva già nei dati (`conto.pagamenti.voci[].metodo`, stessa fonte
  della ricevuta di cortesia) ma era nascosto dentro un `<details>` chiuso
  di default, mentre la ricevuta elenca ogni pagamento sempre visibile:
  stessi dati, resa diversa, non un bug del backend. Fix: quando i metodi
  distinti sono più di uno, accanto a "Già pagato" compare "(misto: X + Y)"
  e il dettaglio pagamenti si apre già espanso. Solo `esbuild`, **zero
  verifica visiva** — da controllare su una prenotazione reale con almeno
  due pagamenti di modalità diversa.
- **Piano 1 — Min/max cartellino, CHIUSO (24/08/2026)**: alert
  bloccante-superabile (con log override in `audit_log`) quando un prezzo
  scritto a mano esce dal min/max del cartellino — sia in `/tariffe` (tipo
  madre) sia sulla `tariffa_totale` di prenotazione (4 punti in
  `planning-camere/page.jsx`, uno in più dei 3 previsti dal piano scritto,
  trovato leggendo il codice). Dettaglio completo, task per task, in
  `docs/DIARIO_SESSIONI.md` 23/08/2026. **Confermato dal tab Code**:
  migration 052 applicata, `npx jest --runInBand` sull'intera suite con
  il fix del conflitto date in `tariffe.test.js` (2092→2095) — tutto
  verde. Non ancora fatto, ma non bloccante: provare a video tutti i
  punti 409→conferma→retry (incluso "utente annulla il confirm");
  confermare la riga `audit_log` dopo un override.
- **Piano 2 — Griglia statica `/tariffe`, implementato non verificato
  (24/08/2026)**: sostituita la sezione "Prezzi per tipologia" (fila di
  chip + una scheda alla volta) con una tabella statica — righe = tipi
  camera, colonne = periodi stagionali + "Tutto l'anno" (solo righe
  derivate) — celle cliccabili che aprono in un modal la stessa
  `SchedaPrezzoTipologia` di sempre, invariata salvo un nuovo prop
  opzionale `periodoIniziale`. `SchedaTrattamento` non toccata. Piano in
  `docs/superpowers/plans/2026-08-24-tariffe-griglia-statica.md`,
  dettaglio in `docs/DIARIO_SESSIONI.md` 24/08/2026. Verificato solo con
  `esbuild --bundle --jsx=automatic` (nessun test frontend esiste in
  questo repo, nessuna build Next reale, **zero verifica visiva** — da
  fare dal tab Code: aprire `/tariffe`, controllare che la tabella si
  popoli, che il click su una cella apra il modal sul periodo giusto, e
  che il salvataggio/eliminazione dentro il modal si comporti come prima).
- **Piano 3 — Planning tariffe giorno-per-giorno, implementato non
  verificato (24/08/2026)**: nuova pagina `/planning-tariffe` — griglia
  editabile giorno per giorno, prezzo e restrizioni (min stay, CTA, CTD,
  stop-sell) per tipo camera E trattamento (Solo pernottamento/Mezza
  pensione/Pensione completa), alimentata come "prezzo consigliato" dal
  motore esistente di `/tariffe`, liberamente sovrascrivibile cella per
  cella (doppio click) o in blocco (trascinamento + drawer). Nuova
  tabella `planning_tariffe_giorni` (migration 053), nuovo controller/
  route `/api/planning-tariffe`, riuso di `verificaLimitiListino` (Piano
  1) per l'alert bloccante-superabile sul prezzo. Piano in
  `docs/superpowers/plans/2026-08-24-planning-tariffe-giorno-per-giorno.md`,
  dettaglio in `docs/DIARIO_SESSIONI.md` 24/08/2026. **Scope
  deliberatamente ridotto**: NON è ancora la fonte di verità del prezzo
  mostrato a un ospite reale (il motore `calcolaTariffaPerTrattamenti` del
  booking engine non legge ancora questa tabella) e le restrizioni non
  sono ancora collegate alla disponibilità reale delle prenotazioni —
  entrambe rimandate a un piano separato, deliberatamente, per non
  toccare un percorso di prezzo/disponibilità live senza un giro di
  verifica reale. Verificato solo con `node -c` (backend) ed `esbuild
  --bundle` (frontend, incluso `Sidebar.tsx` per la nuova voce di
  navigazione) — nessun accesso a Postgres, nessuna build Next reale,
  **zero verifica visiva/interattiva del drag-select** (richiede un
  browser vero). Da fare dal tab Code: applicare la migration 053; aprire
  `/planning-tariffe`; provare doppio click su una cella prezzo, click
  singolo su una cella restrizioni, trascinamento su una riga → drawer;
  confermare che il 409 su un prezzo fuori cartellino compaia e si superi
  col confirm, come nei Piani 1-2. **SUPERATO 24/08/2026, stesso giorno,
  vedi voce sotto**: il gap "non ancora la fonte di verità del prezzo
  mostrato a un ospite" è stato chiuso su richiesta esplicita del
  titolare — non era più un rimando volontario a un piano futuro.
- **Piano 4bis + fix griglia consigliato — propagazione override
  planning-tariffe ai tipi derivati, implementato E confermato coerente
  con dati reali (24/08/2026, stessa giornata del Piano 4)**: il Piano 4
  aveva un gap — il motore di prenotazione ricadeva su
  `calcolaPrezzoCameraPerNotte` "nuda" per le notti senza override
  diretto, che per un tipo DERIVATO (Tripla/Quadrupla) risolve la Madre
  sempre dalla tabella storica `tariffe`, mai da un override
  planning-tariffe sulla Madre stessa — un override su Matrimoniale non
  arrivava mai ai tipi che ne derivano. Corretto duplicando la logica in
  due nuove funzioni interne a `planningTariffeController.js`:
  `prezzoBasePerNotteConPlanning` e `calcolaPrezzoCameraPerNotteConPlanning`
  (stesso anti-loop/clamp min-max dell'originale, ma base risolta con
  l'override quando c'è). Stesso identico bug trovato poi anche nel
  "prezzo consigliato" mostrato dalla griglia planning-tariffe (`griglia()`
  chiamava ancora la funzione "nuda") — corretto allo stesso modo,
  `griglia()` ora chiama `calcolaPrezzoCameraPerNotteConPlanning`. **A
  differenza del Piano 4, qui la coerenza è stata confermata con dati
  reali di Marco**: override Matrimoniale bb 160€ → Tripla (+30%) 208€,
  Quadrupla (+50%) 240€, esattamente i valori mostrati sia in prenotazione
  sia (ora) nella griglia come consigliato — non più solo verificato a
  livello di codice/sintassi.
  **Scoperta collaterale, non un bug di codice**: la ragione per cui i
  test precedenti di Marco non tornavano affatto (numeri 150/120/180/195
  completamente slegati da qualsiasi override) è che stava testando dal
  sito su Vercel, che punta al gestionale di PRODUZIONE — il cui database
  è oggi quasi vuoto (nessun trattamento, nessuna tariffa, nessun
  planning-tariffe reale). Marco lavora e configura tutto in un'istanza
  locale di gestionale-hotel (backend + Postgres locali) e carica sul
  server di produzione solo periodicamente. **Per testare il booking
  engine con dati reali va usato `sito-hotel` in locale (`npm run dev`)
  con `NEXT_PUBLIC_GESTIONALE_API_URL` puntato al gestionale locale, non
  la versione Vercel** — non è un fix di codice, è una correzione di
  procedura di test, ma vale la pena tenerla qui perché ha causato ore di
  debug apparentemente inspiegabile.
  File toccato in più rispetto al Piano 4:
  `backend/controllers/planningTariffeController.js` (nuove funzioni +
  `griglia()` aggiornata + import ripulito). Verificato solo con `node -c`
  — nessun accesso DB diretto da questo sandbox, i numeri di verifica sopra
  vengono dai test reali di Marco in locale, non da una query eseguita qui.
- **Piano 4 — sincronizzazione booking engine ↔ planning-tariffe,
  implementato non verificato (24/08/2026, stesso giorno del Piano 3,
  su richiesta esplicita del titolare dopo aver notato "prezzi delle
  camere in vendita a caso")**: `bookingPubblicoController.disponibilita()`
  e `prenota()` non usano più `calcolaTariffaPerTrattamenti`/
  `calcolaTariffa` "nude" (`tariffeController.js`) — usano due nuove
  funzioni in `planningTariffeController.js`
  (`calcolaTariffaPerTrattamentiConPlanning`/`calcolaTariffaConPlanning`)
  che controllano PRIMA un override in `planning_tariffe_giorni` per ogni
  notte+trattamento e ricadono sul motore vecchio solo per le notti senza
  override — stesso principio di merge già usato da `griglia()`, non
  riusato 1:1 per non far dipendere il pannello di pianificazione dal
  percorso di prenotazione live e viceversa (vedi commento sulla funzione
  nel file). Aggiunta anche l'applicazione reale delle restrizioni
  (min_stay/chiuso_arrivo/chiuso_partenza/stop_sell) sia in ricerca sia in
  `prenota()` (409 col motivo specifico se violate) — prima non erano MAI
  controllate dal booking engine. **[Ipotesi, da riconfermare col
  titolare]**: le restrizioni sono lette per tipo_camera+trattamento+data
  (unica granularità che esiste nello schema `planning_tariffe_giorni`,
  non esiste un concetto di restrizione unica per camera indipendente dal
  trattamento); `min_stay`/`chiuso_arrivo` verificati sulla riga della
  prima notte del soggiorno, `chiuso_partenza` sulla riga dell'ultima
  notte, `stop_sell` blocca se vero su qualunque notte — convenzione
  scelta qui in assenza di una specifica esplicita, va verificata la
  prima volta che il titolare imposta una di queste restrizioni su date
  realmente prenotabili sul sito.
  **Bug correlato corretto nello stesso intervento**: `disponibilita()`
  avvolgeva il calcolo prezzo di TUTTI i tipi camera in un solo
  `Promise.all`/try-catch — se anche un solo tipo camera aveva una
  configurazione tariffaria rotta (es. la catena di derivazione
  Quadrupla←Tripla segnalata da Marco lo stesso giorno, mai corretta nel
  DB da questo sandbox — nessun accesso Postgres), l'eccezione lanciata da
  `calcolaPrezzoCameraPerNotte` faceva rispondere 500 "Errore interno" a
  TUTTA la ricerca disponibilità del sito, per qualunque data, non solo al
  prezzo di quel tipo. Ora ogni tipo camera è isolato nel proprio
  try/catch: un tipo rotto viene escluso dai risultati, il resto della
  ricerca funziona comunque. **Questo non sostituisce la correzione
  manuale della riga Quadrupla←Tripla nel DB, che Marco deve ancora
  fare.**
  File toccati: `backend/controllers/planningTariffeController.js`
  (nuove funzioni), `backend/controllers/bookingPubblicoController.js`
  (`disponibilita()`/`prenota()` aggiornate, import del motore vecchio
  rimosso), `sito-hotel/components/booking/BookingWidget.tsx` (nuovo
  campo opzionale `motivi_non_disponibile`, mostrato al posto del
  messaggio generico "non disponibile" quando un trattamento è bloccato
  da una restrizione — testo in italiano non tradotto per le altre 3
  lingue del sito, stesso limite già presente per gli altri messaggi di
  errore di questo widget, non una regressione introdotta qui).
  Verificato solo con `node -c` (i due file backend) ed `esbuild --bundle
  --jsx=automatic` (il file frontend, 79.5kb, pulito) — **nessun accesso a
  Postgres, nessuna query reale eseguita, nessuna build Next reale, zero
  verifica end-to-end del flusso di prenotazione/pagamento Stripe**. Da
  fare dal tab Code, PRIMA di considerare il flusso davvero pronto:
  aprire `/prenota`, cercare disponibilità su date con e senza override in
  `/planning-tariffe`, confermare che il prezzo mostrato coincida con
  quello del pannello; impostare una restrizione di test (es. min_stay) su
  date future non ancora prenotate e verificare che il sito la rispetti
  davvero (sia in ricerca sia provando a forzare una prenotazione più
  breve via `prenota()`); eseguire (mai fatto finora, vedi riga 4.1 sopra)
  la suite `bookingPubblico.test.js` se ancora valida dopo questo cambio.
- **Piano 3 — 3 fix dopo prima verifica a video, implementati non
  verificati (24/08/2026)**: (1) **bug reale corretto** — `caricaGriglia`
  in `/planning-tariffe` passava `{params:{...}}` a `api.get`, ma
  `frontend/lib/api.js` tratta il secondo argomento come header, non come
  query axios-style: la query string non partiva mai, causa esatta del
  400 "tipo_camera_id, data_da e data_a sono obbligatori" visto da Marco.
  Corretto costruendo la query string a mano (`URLSearchParams`), stesso
  pattern già in uso in `planning-camere/page.jsx`; (2) aggiunto
  l'intervallo date sotto il nome periodo nelle colonne di `/tariffe`
  (solo markup); (3) tentativo di fix layout su `/planning-camere`
  (pulsante "Nuova prenotazione" che torna a capo) restringendo
  ulteriormente il campo ricerca (`w-40`→`w-28`) e i gap della toolbar
  (`gap-2`→`gap-1.5`) — **NON verificabile da qui, nessun browser reale
  disponibile**: potrebbe non bastare alla larghezza finestra reale di
  Marco. Dettaglio completo in `docs/DIARIO_SESSIONI.md` 24/08/2026.
  Verificato solo con `esbuild --bundle` sui 3 file toccati.
  **Aggiornamento stesso giorno — secondo bug reale trovato dopo il fix
  1**: risolto il 400, `/planning-tariffe` dava poi 500 "errore
  interno". Causa: `calcolaPrezzoCameraPerNotte` (usata da
  `planningTariffeController.griglia`) non era nell'elenco
  `module.exports` di `backend/controllers/tariffeController.js` —
  destrutturata come `undefined`, `TypeError` al primo uso, mai emerso
  prima perché il bug 1 impediva alla richiesta di arrivare fin qui.
  Aggiunta all'export (riga sola, nessuna logica toccata). Verificato
  solo `node -c` — **nessun accesso a Postgres da qui**, il resto della
  funzione `griglia()` non è stato eseguito realmente nemmeno ora.
  Dettaglio in `docs/DIARIO_SESSIONI.md` 24/08/2026. Da fare dal tab
  Code: aprire `/planning-tariffe` e confermare che la griglia si
  popoli senza errore 400; aprire `/tariffe` e controllare l'intervallo
  date sotto ogni periodo; aprire `/planning-camere` e verificare che
  "Nuova prenotazione" resti sulla stessa riga — se ancora a capo, serve
  la larghezza finestra/zoom esatti per un secondo giro mirato.
  **Aggiornamento stesso giorno — riscrittura per aderenza al mockup, 6
  punti**: Marco vede la griglia a video e la respinge ("non è venuto
  come nel mockup"), riscrittura strutturale completa da tipologia-alla-
  volta a tutte-le-tipologie-impilate come nel mockup di riferimento:
  sigla giorno settimana, popover restrizioni riscritto in
  `position:fixed` (era `absolute` dentro un contenitore
  `overflow-x-auto`, causa reale del clipping), menu ⚡ propagazione
  riga/colonna reintrodotto, drawer "✎ Modifica" multi-tipologia
  reintrodotto, freccine collassa tipologia/trattamento reintrodotte.
  Dettaglio punto-per-punto in `docs/DIARIO_SESSIONI.md` 24/08/2026.
  Verificato solo `esbuild --bundle` (46.3kb, pulito) — **nessuna
  verifica a video di questa riscrittura**, la più grande del Piano 3
  finora: da fare dal tab Code con attenzione a popover restrizioni in
  ogni posizione di scroll, valorizzazione min-stay (diagnosi solo
  probabile) e che propagazione/drawer producano le stesse PATCH di
  prima.
  **Aggiornamento stesso giorno — 5 piccoli dettagli dopo conferma
  Marco**: badge restrizioni ricolorati come la legenda (blu/ambra/
  viola invece di grigio uniforme); ordinamento tipologie richiesto da
  Marco (Matrimoniale, Matrimoniale uso singola, Tripla, Quadrupla,
  Doppia uso singola, Singola) implementato in modo fail-safe tramite
  mappatura nome→priorità con alias — **[Ipotesi] non verificabile da
  qui**: la migration 048 ha consolidato "Singola"/"Doppia uso singola"
  in una riga sola rinominata "Matrimoniale Piccola", non è confermabile
  da questo sandbox se oggi esistano ancora come tipi attivi distinti,
  quindi un nome non riconosciuto finisce in coda invece di sparire o
  far crashare la pagina; etichetta trattamento "Solo pernottamento" →
  "Camera e colazione" (solo testo, non tocca il valore DB `bb`); frecce
  ‹/› laterali che scorrono la griglia di 15 colonne già caricate
  (distinte dalle ‹/› di toolbar, che invece ricaricano dal backend).
  Dettaglio in `docs/DIARIO_SESSIONI.md` 24/08/2026. Verificato solo
  `esbuild --bundle` (49.8kb, pulito) — **zero verifica visiva**, in
  particolare il punto ordine-tipologie va confermato a video con
  priorità perché basato su un'ipotesi sullo stato reale dei tipi
  camera in produzione.
  **Aggiornamento stesso giorno — bug reale trovato su /tariffe
  (Piano 1/2)**: Marco segnala popup "Il prezzo undefined€ esce dal
  range dichiarato (—–—€)" su qualsiasi prezzo provi a impostare, OK
  non risolve, popup torna. Causa reale confermata leggendo il codice:
  `SchedaPrezzoTipologia.jsx` trattava QUALSIASI 409 di `/api/tariffe`
  come violazione min/max, ma quell'endpoint risponde 409 anche per un
  motivo diverso (sovrapposizione date tra fasce, vincolo Postgres
  23P01) il cui corpo non ha `minimo`/`massimo`/`valore` — da cui
  "undefined" e il loop (il flag `confermato` sblocca solo il controllo
  min/max, non il conflitto date). Aggiunto lo stesso guardrail già
  presente in 4 punti di `planning-camere/page.jsx`
  (`err.response?.data?.minimo !== undefined`): ora un 409 diverso
  mostra il messaggio vero del backend nel banner rosso invece del
  popup rotto. **[Probabile] non confermabile da qui** (nessun accesso
  a Postgres): la causa di fondo è probabilmente una fascia tariffaria
  pre-esistente (da prima che esistessero i periodi stagionali, date
  dirette non allineate) che collide con il nuovo periodo — con questo
  fix il messaggio vero sarà visibile al primo tentativo, da lì si potrà
  individuare la fascia in conflitto dal tab Code.
  **Aggiornamento stesso giorno — freccine vista Mese segnalate
  assenti, nessun difetto trovato**: riletto il file consegnato
  direttamente dal dispositivo (non una cache locale) — il markup delle
  frecce è presente e non condizionato al modo 14gg/Mese, dovrebbe
  comparire in entrambe le viste. Controllato anche `AppShell.tsx` per
  clipping CSS: offset delle frecce (-4px) ben dentro il padding
  dell'area principale, non dovrebbe uscirne. Nessun difetto individuato
  nel codice da questo sandbox — ipotesi più probabile è build/cache
  Next.js non aggiornata lato Marco, da verificare con un refresh
  forzato del browser o riavvio del dev server prima di trattarlo come
  bug. Dettaglio in `docs/DIARIO_SESSIONI.md` 24/08/2026.

## Pattern UI competitor — stato dei 4 punti (23/08/2026)

Discussione con il titolare su 4 pattern UI dei PMS competitor. Ordine di
lavoro deciso insieme, non tutti e 4 hanno la stessa priorità.

Tutti e 4 confermati a video da Marco il 23/08/2026, incluso il punto 4
con una ricerca reale eseguita contro Postgres (non solo apertura pannello
— nome/numero camera cercato ha restituito la riga giusta).

1. ✅ Drawer laterale (pannello principale) — già così da prima di questa
   discussione.
2. ✅ Posizione fissa bottoni — fatto e confermato sul pannello principale.
3. ✅ Drawer coerenti sui pannelli annidati — fatto dopo il mockup:
   `PannelloCheckOut`/`ModalAssegnaGruppo`/`ModalDettaglioGruppo` ora
   drawer da destra come il pannello principale (dettaglio in
   `docs/DIARIO_SESSIONI.md`).
4. ✅ CMD+K (ricerca universale) — endpoint `GET /api/ricerca?q=`
   (ospiti/camere/prenotazioni, non "fatture" — modulo non costruito),
   componente `RicercaGlobale.tsx` montato in `AppShell`, apribile da
   `Cmd+K`/`Ctrl+K` o dal pulsante centrato in Topbar. Dettaglio completo
   in `docs/DIARIO_SESSIONI.md`. **Confermato con ricerca reale** — le
   query SQL restituiscono risultati corretti da Postgres, non solo
   verifica di sintassi.

## Decisioni in sospeso da Marco (nessun blocco tecnico, solo sua scelta)

- Food cost teorico per piatto: chi inserisce le grammature ricetta per
  ricetta (chef? altro?) — analisi tecnica già pronta, solo la decisione
  manca (`docs/EVOLUTIVE.md`, punto 6 "Fase 3").
- Tariffe per canale/camera: la richiesta originale non è mai stata
  chiarita del tutto — prezzo differenziato per canale OTA, per singola
  camera fisica, o solo leggibilità UI di `/tariffe`? Nessun piano
  possibile finché non si scioglie il dubbio.
- Ristorante — conti aperti: manca un punto centrale per vedere il totale
  di tutti i tavoli insieme, ma Marco ha detto di non essersi spiegato
  bene — prossimo passo è una conversazione dedicata, non una proposta al buio.
- Bottone "Addebiti extra" in planning-camere: segnalato "scomodo" senza
  specificare cosa cambiare.
- Sensori HACCP (hardware): nessuna scelta tra le opzioni valutate (Hanna
  HI144 senza abbonamento vs. HaccpOK/Digitron/Testo Saveris/Selin
  Milano con abbonamento — attenzione al vincolo 24 mesi di HaccpOK).
- Moduli HACCP A.4 (buffet) e A.6 (manutenzioni): costruiti "in forse",
  in attesa che Marco li confronti col piano HACCP reale dell'hotel.

## Bloccato su terzi (mail inviate o da inviare, in attesa di risposta)

- 2.3: nessuna sottoscrizione WuBook da fare più — resta da scrivere la
  spec Beds24, nessuna mail ancora inviata a Beds24.
- 2.5 Fase 2: Marco deve compilare le credenziali reali in `.env` e
  testare "Sincronizza ora" in locale — già in suo possesso.
- 2.6: **RIAPERTO come "in attesa di risposta" (24/08/2026)** — mail
  reale di Regione Liguria (Dott.ssa Elena Tagliano) confermata: RIMOVCLI
  conferma XML costruibile dal gestionale interno, test via email a
  movimentoturistico.istat@regione.liguria.it. Resta però da chiarire se
  l'invio quotidiano A REGIME (dopo l'abilitazione) è automatizzabile o
  resta upload manuale sul portale — non specificato né dai documenti né
  dalla mail. Mail di richiesta pronta in
  `docs/mail preventivi/mail_rimovcli_domanda_invio_automatico.md`,
  **non ancora inviata** (deve partire dall'indirizzo di Carmine Muro,
  titolare, che ha ricevuto la mail originale). Solo dopo questa risposta
  ha senso pianificare il generatore XML conforme a `ModelloC59.xsd`
  (vedi riga 2.6 sopra e diario 24/08/2026).
- A-Cube (corrispettivi, sostituisce Hugin RT-K50): mail pronta in
  `docs/mail preventivi/mail_acube_preventivo.md`, **mai inviata**,
  stesso blocco (dati di contatto mancanti).
- LivelloUno (trasferimento dominio `hoteldelgolfolerici.com`): **AGGIORNATO
  24/08/2026** — Marco ha ricevuto il codice di migrazione per trasferire
  il dominio da Vercel a quello dell'hotel. Non più "in attesa di
  risposta": resta da eseguire il trasferimento vero e proprio (fuori
  portata di questo sandbox, nessun accesso a DNS/registrar) — una volta
  fatto si sblocca DNS sito, GA4, Iubenda. **Nota di rischio**: finché il
  dominio reale non è collegato, `sito-hotel` su Vercel non serve ospiti
  veri — vedi il caveat in 4.1 sul DB di produzione quasi vuoto: prima di
  completare questo trasferimento va popolato il DB di produzione con
  tariffe/trattamenti/planning-tariffe reali, altrimenti il sito
  diventerebbe pubblico con prezzi non configurati.
- Nexi: **AGGIORNATO 24/08/2026** — attivata XPay Pro (canone zero,
  commissione 1,10% + 0,24€ a operazione su carte, più 7,5€ una tantum e
  2,5€/mese di commissione di acquiring, inclusiva nel programma
  Protection Plus). In attesa che Nexi invii i documenti al titolare;
  dopo la ricezione arriveranno le specifiche tecniche di integrazione,
  su cui basare la scelta finale tra Nexi e Stripe (vantaggio/comodità da
  confrontare, non ancora deciso).
- Commercialista: 5 domande aperte (A-Cube sostitutivo Hugin? piano
  Fatture in Cloud reale? import automatico? account Aruba di chi?
  contratto dipendenti "a chiamata"?) — `docs/DOMANDE_APERTE_07-08-2026.md` §4.
- ASL5 Spezzino/consulente HACCP: mai chiesto se il ristorante rientra
  nell'obbligo di "riconoscimento" CE 853/2004 (lavorazioni carne/pesce in
  loco) invece della semplice SCIA — punto emerso dalla ricerca 14/08/2026
  (`docs/RICERCA_HACCP_MERCATO_LEGALE.md` §3), recuperato 23/08/2026,
  nessuna mail ancora scritta.
- Dominio `sito-hotel`, Iubenda: rimandati da Marco (vedi memoria di
  progetto — non riproporre finché non li riporta lui).

## Item aperto, non chiarito

Il tab Code (22/08) ha segnalato `prezzo_notte: 0` trattato come "nessun
valore" via COALESCE — non accettato come non-problema senza il file:riga
esatto citato da Code. Non in task list, resta da chiarire.

---

**Nota sulle voci ✅ di `docs/EVOLUTIVE.md`**: NON vanno cancellate. File
letto integralmente il 23/08/2026 per un progetto di sfoltimento — quasi
ogni voce ✅ porta con sé limiti noti, decisioni di prodotto o avvertimenti
ancora operativamente rilevanti ("non riproporre X senza Y", prezzi
verificati, motivazioni di scelte tecniche), non solo narrativa di cosa è
stato fatto. Cancellarle avrebbe perso informazione viva, non solo
cronaca — decisione presa in sessione con Marco, 23/08/2026.

---

*Ultimo aggiornamento: 23/08/2026 — file creato, migrato da CLAUDE.md §16
(che nella vecchia forma pesava 617 righe/40 KB). Corretti in questo
passaggio due status che CLAUDE.md §8 aveva stale (2.5 Fase 2 e 2.6 —
vedi righe sopra); §8 aggiornato di conseguenza nella stessa sessione.*
