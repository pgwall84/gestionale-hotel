# Evolutive future — non sviluppare ora

Backlog di gap noti, bug minori non bloccanti e miglioramenti rimandati
deliberatamente. Spostato qui il 26/07/2026 dalla ex Sezione 14 di
CLAUDE.md per tenere quel file leggero. Nulla qui è urgente — è materiale
da consultare quando si torna a toccare il modulo in questione, non da
lavorare proattivamente.

```
Modulo 1.4 — ZTL:
  ✅ [FATTO 15/08/2026] Switch temporaneo modalità import (Excel TS ↔
  Planning interno). Segnalato dal titolare: il testo fisso "Importa il
  planning da TeamSystem con il pulsante Import TS" non rifletteva più la
  situazione — ZTL dipende al 100% dall'export Excel di TeamSystem, zero
  riferimenti a `soggiorni` in `ztlController.js`, anche se il gestionale
  ha ormai un proprio modulo Prenotazioni funzionante. Confermato dal
  titolare: oggi le prenotazioni reali restano su TS (non ancora la
  migrazione, modulo 2.3), quindi Import TS resta corretto per ora — ma
  ZTL va preparato per il giorno in cui non lo sarà più, così la migrazione
  non lo blocca. Migration `038_ztl_configurazione.sql` (tabella a riga
  singola `configurazione_ztl`, NON storicizzata — è un interruttore
  operativo temporaneo, non un dato fiscale come `configurazione_tassa_
  soggiorno`). `ztlController.js`: estratta la logica di upsert comune
  (`upsertPrenotazioneZtl`, per camera_numero+data_arrivo, mai sovrascrive
  una riga già 'inviata'/'conclusa') riusata sia da `importExcel` sia dalla
  nuova `sincronizzaDaPlanning` (legge `soggiorni` non cancellati con
  arrivo nei prossimi 30 giorni, un solo ospite per soggiorno — stessa
  semplificazione già in uso altrove per il nucleo familiare). Nuove rotte
  `GET/PATCH /api/ztl/configurazione` (lettura a chiunque acceda a ZTL,
  scrittura solo titolare/admin) e `POST /api/ztl/sincronizza-planning`
  (solo titolare/admin). Frontend `/ztl`: bottone "Import TS" o
  "Sincronizza da Planning" a seconda della modalità attiva, stesso modale
  di riepilogo risultati per entrambi (stessa forma di risposta:
  nuove/aggiornate/saltate/camereConflitto/errori), piccolo switch in
  fondo alle azioni titolare con conferma esplicita e testo "temporaneo"
  per non perderne il motivo tra qualche mese. Verificato con `node -c` e
  `tsc --noEmit` — non ancora verificato in UI dal titolare (né la
  modalità Excel, che non dovrebbe essere cambiata dal refactor
  dell'upsert condiviso, né la nuova modalità Planning interno).

  **RIMOZIONE FUTURA (post-migrazione, quando TS non serve più)**: togliere
  il bottone "Import TS", lo switch, `POST /api/ztl/import`, il parsing
  Excel (dipendenza `xlsx` in `ztlController.js`) e la tabella
  `configurazione_ztl` — tenere solo `sincronizzaDaPlanning` (o renderla
  automatica, es. ad ogni apertura pagina o via job). Annotato qui apposta
  per non doverlo re-scoprire quel giorno.

Modulo 1.6 — Ristorante:
  ✅ **Questa voce era STALE, corretta il 15/08/2026** — segnalata di nuovo
  al titolare come "da fare" durante un riepilogo evolutive, verificato nel
  codice prima di ripeterla: `salaController.eliminaConfig` era già
  completo dalla sessione del 06/08/2026 (blocca su Standard/is_default,
  su configurazione attiva, e su tavoli ancora associati — messaggio
  chiaro invece del 500 generico da violazione FK). Questa voce non era
  mai stata aggiornata dopo quel fix. Nessun codice toccato oggi, solo
  la voce corretta per non ripresentarla una terza volta.

Modulo 1.7 — Magazzino:
  ✅ [FATTO 06/08/2026] Storico prezzi per prodotto (GET
    /api/magazzino/prodotti/:id/storico-prezzi, nessuna nuova tabella — i
    prezzi erano già in movimenti_magazzino.costo_unitario), alert scadenze
    progressivi scaduto/urgente(≤3gg)/attenzione(≤7gg) (GET
    /api/magazzino/scadenze) e bozza ordine fornitori raggruppata (GET
    /api/magazzino/bozza-ordine, quantità suggerita = soglia_minima -
    giacenza). Limite noto sulla bozza ordine: `prodotti` non ha un
    fornitore in anagrafica (schema non lo prevede) — il fornitore per
    riga è inferito dall'ultimo carico con fornitore per quel prodotto; se
    non esiste mai stato un carico con fornitore, il prodotto finisce nel
    gruppo "Fornitore non determinato" invece di sparire. Limite noto
    sull'alert scadenze: nessun tracciamento a lotti nel gestionale — mostra
    i carichi registrati con data_scadenza, non "cosa resta davvero di quel
    lotto in giacenza" (stesso limite già esistente per l'alert sottoscorta,
    basato su giacenza aggregata). UI in frontend/app/magazzino/page.jsx:
    banner scadenze, tap su un prodotto apre lo storico prezzi, pulsante
    "Bozza ordine fornitori" (visibile solo se c'è almeno un prodotto sotto
    soglia). Non ancora eseguiti test automatici (da fare al prossimo giro
    con Marco, stesso pattern manuale usato per il modulo Manutenzione).
  DA APPROFONDIRE — scansione barcode/QR poco affidabile da foto telefono
    (testato su Samsung + Chrome, stesso errore "no MultiFormat Readers"
    anche con BarcodeDetector nativo attivato e immagine ridimensionata).
    Per ora: inserimento manuale del codice come via primaria (già in
    produzione). Da valutare in futuro: pistola/lettore barcode dedicato
    hardware invece della fotocamera del telefono, se il volume di scansioni
    giornaliere rende l'inserimento manuale troppo lento in pratica.

frontend/lib/api.js — messaggi di errore backend (scoperto 17/07/2026,
CORRETTO in quella sessione, ma verificare l'impatto visibile):
  L'helper leggeva `json?.errore` (chiave italiana) per costruire
  `err.message`, ma TUTTI i controller backend rispondono con
  `{ error: '...' }` (inglese, Sezione 5 di CLAUDE.md). Risultato: da
  quando esiste `api.js`, `err.message` è sempre stato esattamente la
  stringa generica `Errore ${status}` (es. "Errore 400", "Errore 409"),
  MAI il messaggio specifico scritto dai controller — non un fallimento
  silenzioso, ma un messaggio sempre generico e mai informativo, in ogni
  modulo del gestionale. Corretto in `frontend/lib/api.js` (`json?.error`).
  ⚠️ **Impatto**: 13 pagine leggono `err.message` (direttamente o via
  `err.response?.data?.errore || err.message`, che risolveva comunque
  sempre a `err.message` per lo stesso motivo) — archivio, personale,
  timbratura, home, magazzino, magazzino/scansiona, ristorante, sala,
  cucina, prenotazioni (ristorante), ztl, utenti, planning-camere. Da ora
  mostrano il messaggio specifico del backend invece di "Errore
  400/409/500" generico. **La prossima volta che si tocca uno di questi
  moduli, verificare se l'utente segnala un messaggio d'errore "nuovo" o
  "mai visto prima"**: è questo bug che finalmente si vede, non una
  regressione introdotta dal tocco successivo.
  ✅ **Eccezione risolta il 31/07/2026**: `frontend/app/login/page.jsx`
  aveva la stessa chiave sbagliata (`err?.response?.data?.errore`) con un
  fallback hardcoded diverso — corretta in `.error`.

  ⚠️ **Correzione alla nota sopra (06/08/2026)**: la premessa "TUTTI i
  controller rispondono con `{ error: '...' }`" era falsa già allora o è
  regredita da allora — verificato oggi: 22 file controller usano `errore:`
  (italiano, 230 occorrenze) contro 18 file che usano `error:` (inglese,
  170 occorrenze), alcuni file usano entrambe. La modifica del 17/07 a
  `api.js` (leggere solo `.error`) quindi mostrava il messaggio "Errore
  {status}" generico per metà circa degli endpoint, non per nessuno —
  scoperto costruendo `DELETE /api/ristorante/config/:id` (risponde
  `errore`, i messaggi specifici non arrivavano all'utente). Corretto
  definitivamente in modo non fragile: `api.js` ora legge
  `json?.errore || json?.error`, funziona con entrambe le convenzioni
  invece di richiedere di uniformare 40 file controller. Non urgente
  uniformare i controller a una sola chiave — se si tocca comunque un
  controller per altri motivi, preferire `error` (inglese) perché è quello
  documentato in CLAUDE.md Sezione 5, ma non è più bloccante.

✅ tests/e2e/login.spec.js — getByLabel non trovava i campi (scoperto
17/07/2026, CORRETTO il 31/07/2026): aggiunti `htmlFor`/`id` su
`label`/`input` email e password in `login/page.jsx`, più `role="alert"`
sul banner di errore (necessario perché il terzo test, "credenziali
errate", lo cercasse con successo — non comparabile prima con nessuno dei
selettori `[role="alert"], .errore, .error` usati dal test). Non ancora
rieseguito con Playwright reale in questa sessione (nessun accesso a
dev server/browser dal sandbox) — verificare al prossimo giro locale.

Modulo 1.8 — Dashboard:
  Food cost % sul fatturato (spesa materie prime / ricavi ristorante × 100)
  — evolutiva quando ci sarà storico incassi reale. Oggi mostra
  correttamente €/coperto invece di una % che sarebbe fuorviante senza
  incassi storici affidabili.

  ✅ [FATTO 06/08/2026] Aggiunti 3 nuovi alert a GET /api/dashboard/alert
  (dashboardController.js), su richiesta esplicita del titolare dopo
  revisione di cosa mostrava la dashboard: (1) Prenotazioni — opzioni in
  scadenza entro 48h (prenotazioni.data_scadenza_opzione, nessun cambio di
  stato automatico, solo promemoria — il cron di scadenza automatica resta
  da fare, vedi voce sopra "Modulo Prenotazioni"); (2) Alloggiati Web —
  ospiti in arrivo oggi con documento incompleto (sostituisce la richiesta
  originale "invii Alloggiati Web in sospeso": la tabella `alloggiati_invii`
  è vuota perché il modulo 2.5 Fase 2 — invio reale — non è ancora iniziato,
  quindi un alert su quella tabella sarebbe sempre vuoto e fuorviante;
  questo alert copre lo stesso bisogno reale, "siamo pronti per la
  schedina?", controllando i dati anagrafica invece dell'invio); (3) Pre
  check-in — richieste compilate dall'ospite in attesa di revisione
  reception (pre_checkin_richieste.stato = 'in_attesa').

  ⚠️ **Non implementato, segnalato al titolare**: un quarto alert per
  ROSS1000/export in sospeso, richiesto insieme agli altri tre, non è
  costruibile allo stato attuale — non esiste nessuna tabella che registra
  quando è stato generato l'ultimo export XML (ross1000Controller.js lo
  genera al volo, senza salvare nulla). Servirebbe una piccola tabella di
  log (es. `ross1000_export_log`, una riga per export generato) prima di
  poter mostrare un alert reale invece di uno sempre vuoto o sempre pieno.
  **Deciso dal titolare (06/08/2026): rimandato a quando il gestionale sarà
  operativo con dati reali** (dopo 1.10 Deploy VPS) — non ha senso tracciare
  export su dati di test. Non riproporlo prima di allora.

Modulo 1.1 — HR Timbrature:
  ✅ Geolocalizzazione timbratura — implementata (Haversine + blocco raggio 50m
  dalle coordinate hotel).
  ✅ Griglia turni visuale — implementata (TabTurni, personale/page.jsx).
  ✅ Notifiche approvazione ferie — implementata (riquadro "Ultime decisioni" in TabFerie).
  ✅ Report mensile presenze — implementato (colonna Ritardi in reportMensile()).

  Evolutiva futura, non ora:
  Notifica push nativa (service worker) al titolare ad ogni timbratura — da
  sviluppare insieme al service worker per notifiche cameriere ristorante
  (nessuna dipendenza da email/SMS Fase 2, può usare Brevo/SendGrid solo se
  si preferisce un canale email invece di push).

Modulo Prenotazioni (Fase 2) — evolutive non ancora implementate:
  Cron scadenza automatica prenotazioni "Opzione" (node-cron, ogni 30 min)
  — passa lo stato da 'opzione' a 'interrotta' se non confermate entro
  24-48h (campo prenotazioni.data_scadenza_opzione, già in migration 016).
  Ogni riga aggiornata va loggata in audit_log. Da implementare quando si
  riprende in mano il modulo — dipendenza nuova (node-cron) da introdurre
  solo a quel punto, motivandola nel piano di quella sessione.

  Check-out anticipato / annullamento post check-in — non ancora gestito:
  oggi "Annulla prenotazione" è disponibile solo per stato 'opzione' o
  'confermata' (coerente con la state machine). Se un ospite con check_in
  già fatto deve interrompere il soggiorno prima della data prevista, non
  c'è un flusso dedicato — richiede probabilmente una transizione diversa
  (check_in → check_out anticipato, non verso 'interrotta') e va progettata
  a parte quando serve davvero, non è banale come l'annullamento pre-arrivo.

  'chiusa' non ha una transizione UI per scelta — va collegata
  all'emissione fattura reale (modulo 2.5/A-Cube), non a un click manuale,
  per non creare un dato fiscalmente fuorviante.

  Check-in oggi non verifica che i dati documento dell'ospite siano stati
  registrati (obbligo normativo reale per Alloggiati Web, ma il modulo
  Ospiti/documento non ha ancora una UI per inserirli in questo flusso).
  Quando si costruisce la scheda Ospite completa (vedi
  docs/PRENOTAZIONI_FASE2.md Parte D), valutare se aggiungere un controllo
  (bloccante o solo un avviso) su questa transizione — oggi il controllo è
  solo professionale/manuale da parte della reception.

  Viste Ospiti/Pulizie/Conto ospite/Report avanzati — mai costruite, vedi
  docs/PRENOTAZIONI_FASE2.md Parte D per la specifica completa.

Decisioni strategiche già confermate per la Fase 2 (recuperate 26/07/2026 da
appunti di sessioni precedenti, non ancora attuate — utili quando si
riprendono i moduli 2.3/3.2/4.1):
  - Channel manager: WuBook/WooDoo, ~21€/mese
  - Booking engine: WuBook Opzione 3, ~27€/mese
  - Pagamenti: Nexi (default) + Stripe (alternativa), entrambi via WuBook
  - Documenti commerciali: A-Cube API (sostituisce il registratore Hugin
    RT-K50 attuale, non integrabile via API)
  - Fatturazione B2B: Fatture in Cloud, da rivalutare con il commercialista
    (punto aperto: capire se il commercialista accede diretto a Fatture in
    Cloud o preferisce ricevere export file)
  - Switch-off di TeamSystem Hospitality: finestra novembre 2026 o
    febbraio 2027 — **mai in estate** (alta stagione, nessun cambio di
    sistema critico durante il periodo di massimo carico)
  - Punti ancora da scegliere: formato dati richiesto dal Comune per la
    tassa di soggiorno (modulo 2.4). Alloggiati Web (2.5): deciso SOAP
    diretto a WS_ALLOGGIATI, nessun intermediario — vedi voce dedicata
    sotto "Modulo 2.5" per lo stato reale.

  ⚠️ **Verifica prezzi dal vivo (09/08/2026)**, prima di fidarsi di
  qualunque cifra sopra — controllati i siti reali dei fornitori, nessun
  pagamento effettuato:
  - WuBook e A-Cube: **restano senza listino pubblico**, solo "contattaci"
    — le cifre ~21€/mese (channel manager) e ~27€/mese (booking engine)
    sono ancora solo una stima storica, non confermabile senza contattare
    davvero il commerciale (vedi `docs/DOMANDE_APERTE_07-08-2026.md`).
  - Stripe: confermato 1,5%+0,25€ per carte SEE, 2,5%+0,25€ extra-SEE —
    listino pubblico e trasparente.
  - Nexi: **nessuna commissione per transazione pubblicata** da nessuna
    parte del sito — solo tramite contratto commerciale, a differenza di
    Stripe. Da chiedere per iscritto prima di dare per buono qualunque
    numero nel confronto costi.
  - Fatture in Cloud: listino attuale (09/08/2026) è Forfettari 4€,
    Standard 12€, Premium 21€, Premium Plus 29€, Complete 51€/mese.
    **Nessuno di questi piani, con IVA, corrisponde ai 500€/anno che il
    titolare paga oggi** — il più vicino è Premium Plus (348€+IVA ≈
    425€/anno) o Complete (612€+IVA ≈ 747€/anno). Probabile piano
    precedente/bloccato a un prezzo diverso, o add-on utenti extra sopra
    Premium Plus — da verificare sull'ultima fattura reale, non
    assumere quale piano sia.
  - Iubenda: soglia del piano Essentials più alta di quanto scritto altrove
    in questo repo — **25.000 pageview/mese**, non 1.000 (vedi anche
    `sito-hotel/docs/EVOLUTIVE.md`, da allineare). Cifra esatta in euro non
    verificata per un problema di rendering della pagina in questa sessione.
  - VPS gestionale (1.10): Hetzner ha tolto la fascia economica dal listino
    (CX, "Cost-Optimized", segnata "currently not available") — confermato
    **netcup VPS Lite 1 G12s** (2vCPU/4GB/80GB, 5€/mese, impegno minimo 6
    mesi fatturati in un'unica soluzione) al posto di Hetzner CPX22
    (24,39€/mese per le stesse specifiche). Alternativa italiana valutata:
    Aruba Cloud VPS O2A4 (2vCPU/4GB/40GB, 6,29€+IVA/mese ≈ 7,67€/mese) —
    scartata per il doppio del prezzo di netcup a parità di specifiche
    salvo preferenza esplicita per supporto in italiano. Dettaglio
    completo in `docs/PIANO_MIGRAZIONE_DICEMBRE_2026.md`.

Planning camere — vista Mese (31/07/2026): colonne giorno a 32px minimo
  (LARGHEZZA_COLONNA_MIN_MESE) per stare senza scroll orizzontale, con solo
  il numero del giorno in header (niente giorno settimana). Non ancora
  verificato su tablet stretti/mobile se resta leggibile e se il tocco sulla
  barra prenotazione resta comodo a quella larghezza — da controllare alla
  prima verifica visiva in vista Mese, eventualmente alzare leggermente il
  minimo se troppo stretto in pratica.

Modulo 2.2 — Tariffe/pacchetti (codice scritto 31/07/2026, evolutiva non
  ora — SOSPESA su richiesta esplicita il 31/07/2026, non implementare senza
  prima tornare a discuterne):
  Il drag-and-drop della griglia planning (PATCH /api/soggiorni/:id) non
  ricalcola automaticamente la tariffa quando si sposta una prenotazione a
  un'altra camera/data — resta manuale come prima del modulo 2.2.
  L'auto-calcolo da listino oggi vale solo nel form "Nuova prenotazione".
  Punto aperto segnalato dal titolare: prima di implementare il ricalcolo
  automatico va deciso cosa succede quando lo spostamento è tra camere di
  TIPOLOGIA/DIMENSIONE diversa (es. doppia → matrimoniale, o camere con
  capienza diversa) — ricalcolare silenziosamente al prezzo della nuova
  categoria potrebbe non essere quello che si vuole (es. differenza di
  prezzo verso l'ospite da gestire esplicitamente, o spostamento consentito
  solo se compatibile per numero ospiti). Da riprendere con una domanda
  esplicita al titolare su come deve comportarsi in questo caso, prima di
  scrivere la logica di ricalcolo.

Tabella `camere` non tracciata da nessuna migration (scoperto 31/07/2026,
  riordino Impostazioni▸Camere): in `database/migrations/` esiste solo un
  `ALTER TABLE camere ADD COLUMN piano` (migration 017), nessun `CREATE
  TABLE camere` — probabile setup manuale in una sessione precedente non
  documentata. La migration 019 (colonna `attivo`) non ha tentato di
  ricreare la tabella per non rischiare un disallineamento con lo schema
  reale già in uso. Non urgente (la tabella esiste e funziona), ma da
  sanare se si arriva a dover ricostruire il DB da zero (es. nuovo
  ambiente, disaster recovery) — servirebbe uno `pg_dump --schema-only`
  della tabella reale trasformato in una migration retroattiva.

Fase 2 (dopo go-live e test in produzione) — moduli non ancora avviati:
  2.3 Integrazione WuBook/WooDoo channel manager OTA — la mappatura
    tipo_camera.id ↔ canale ↔ codice_esterno è pronta (migration 020,
    tabella tipi_camera_canali, UI in /tariffe — 31/07/2026), sostituisce il
    vecchio appunto manuale in tipi_camera.note. Restano da fare: Fase 0
    (sottoscrizione WuBook — non ancora fatta dal titolare, bloccante),
    poi ricezione prenotazioni via webhook, invio disponibilità/tariffe.
  2.4 Tassa di soggiorno custom
  2.5 Alloggiati Web — Fase 2: NON PIÙ "non ancora avviato", superato
    dai fatti del 13/08/2026 — vedi voce dedicata "Modulo 2.5 — Fase 2,
    stato al 13/08/2026" più sotto per lo stato reale (Test validato
    contro il servizio vero, invio reale implementato con interruttore
    di sicurezza spento di default, coda manuale funzionante; restano
    4 gap noti con piano concordato).
  2.6 Export ROSS1000/ISTAT — riaperto il 13/08/2026: emerso un conflitto
    tra il canale già implementato (webservice checkinV2) e la
    documentazione ufficiale Liguria (sistema RIMOVCLI, upload manuale),
    vedi voce dedicata "Modulo 2.6 — RIMOVCLI vs ROSS1000" più sotto.
  3.1 Integrazione A-Cube API corrispettivi (scontrini — sostituisce Hugin RT-K50)
  3.2 Fatturazione B2B (rivalutare A-Cube vs Fatture in Cloud con commercialista)
  3.3 Pagamenti online Nexi + Stripe via WuBook
  4.1 Booking engine (Next.js + WuBook API)
  4.2 Welcome Book digitale multilingua
  ✅ 5.1 Check-in/check-out digitale + housekeeping (03/08/2026)
  ✅ 5.2 Fase A — scansione documento con OCR (04/08/2026, vedi voce dedicata
    più sotto). Omnitec escluso dallo scope (chiavi camera, software
    separato). Fase B (form self-service remoto + email) non iniziata.
  5.3 Email/SMS automatici (Brevo o SendGrid — piano gratuito sufficiente)

  Retention dati ospiti — calcolata a runtime, nessun job automatico per
  ora (vedi docs/PRENOTAZIONI_FASE2.md). Un job di anonimizzazione/
  cancellazione automatica alla scadenza è rimandato, il volume attuale
  (20 camere) non lo giustifica.

Modulo 2.5 — Alloggiati Web, Fase 1b (codice completo 01/08/2026):
  ✅ **Tabelle di codifica popolate con dati reali** (02/08/2026): il
  titolare ha fornito 4 CSV reali (`stati.csv`, `comuni.csv`,
  `documenti.csv`, `tipo_alloggiato.csv`, esportati dal portale web, non
  dal SOAP) in `docs/alloggiati web/`. Importati in `alloggiati_codici`
  con `backend/scripts/importaCodiciAlloggiatiCsv.js` (script una tantum,
  stesso upsert usato da "Sincronizza ora" — rieseguibile senza rischi,
  la sincronizzazione reale sovrascrive semplicemente questi dati).
  Verificato: pagina Impostazioni ▸ Alloggiati Web mostra correttamente lo
  stato "sincronizzato" per le 3 tabelle, tendine in `/clienti` popolate.
  ⚠️ **Resta MAI TESTATA la sincronizzazione SOAP reale** contro
  `WS_ALLOGGIATI` — quanto sopra usa CSV scaricati a mano dal portale, non
  una chiamata `GenerateToken`/`Tabella`. Nessuna credenziale è mai stata
  usata nell'ambiente di sviluppo. Prima di considerare la sincronizzazione
  automatica davvero conclusa, il titolare deve:
  - compilare `ALLOGGIATI_UTENTE`/`ALLOGGIATI_PASSWORD`/`ALLOGGIATI_WSKEY`
    in `backend/.env` con le credenziali reali (già in possesso)
  - premere "Sincronizza ora" in locale e verificare che `GenerateToken` e
    `Tabella` rispondano come previsto dal client scritto a mano
    (`backend/lib/alloggiatiSoapClient.js`) — in particolare l'header
    `Content-Type`/`action` SOAP è un'assunzione dai manuali, mai
    verificata contro il servizio vero
  - verificare `MANUALEPASSAGGIO.pdf` (aggiunto 02/08/2026 in docs/alloggiati
    web/): descrive una migrazione del login portale da certificato
    digitale a "codici dispositivo" — da capire se riguarda anche
    l'autenticazione SOAP (`GenerateToken`) prima del primo sync reale
  Il parsing CSV (separatore auto-rilevato `;`/`,`, colonna1=codice/
  colonna2=descrizione) è stato verificato contro i 4 file reali — questo
  punto non è più un'ipotesi. Se la prima sincronizzazione reale fallisce,
  il problema è quindi isolato all'autenticazione/trasporto SOAP, non al
  parsing. Vedi docs/DIARIO_SESSIONI.md, voci 01/08/2026 e 02/08/2026, per
  il dettaglio tecnico completo.
  ✅ **Non più bloccante per l'operatività** (corretto 01/08/2026, vedi voce
  sotto "Modulo 2.5 — testo libero"): prima di questo fix, senza
  sincronizzazione i campi documento/nazionalità in `/clienti` non erano
  proprio scrivibili. Ora lo sono sempre — la sincronizzazione resta
  comunque da fare per abbinare i codici ufficiali, necessari solo
  quando si arriverà all'invio reale della schedina (Fase 2).

Modulo 2.5 — testo libero per documento/nazionalità (fix 01/08/2026,
  segnalato dal titolare): la Fase 1b iniziale rendeva i campi
  stato/comune di nascita, cittadinanza, tipo documento e luogo di
  rilascio compilabili SOLO scegliendo un codice da `alloggiati_codici`
  — se quella tabella era vuota (sincronizzazione mai fatta), la
  reception non poteva registrare alcun dato di documento. Corretto:
  aggiunte colonne `*_testo` (migration 023) sempre scrivibili a mano,
  indipendenti dalla sincronizzazione; il codice ufficiale si abbina solo
  se il testo corrisponde a un suggerimento sincronizzato — un'icona ✓
  nel campo indica quando è successo. Punto aperto per il futuro,
  esplicitamente rimandato: prima dell'invio reale della schedina (Fase
  2) andrà aggiunto un controllo che segnali i campi con testo ma senza
  codice abbinato, perché vadano completati prima di poter inviare.

✅ Modulo 2.5 — lettura automatica documento al check-in: RISOLTA dal
  modulo 5.2 Fase A (04/08/2026). `ScannerDocumento.jsx` (OCR client-side
  su foto del documento, con ritaglio manuale della zona MRZ prima della
  lettura) precompila proprio i campi `*_testo` di `/clienti` — esattamente
  l'idea qui sotto, confermata sul campo.

Modulo 5.2 — limiti noti dell'OCR documento, dopo test reali su CIE
  (04/08/2026, non bloccanti — il form resta sempre modificabile a mano):
  - Il numero documento non viene MAI precompilato, per scelta: è sulla
    riga MRZ più vicina al codice a barre, risultata la meno leggibile in
    assoluto nei test reali (carte lucide/olografiche). Rischio di
    prefillare un dato sbagliato giudicato peggiore di lasciarlo vuoto.
  - Il nome a volte esce con rumore residuo (es. "S MICHELE LLLKLS" invece
    di "MICHELE") quando l'OCR legge il separatore cognome/nome con
    caratteri spuri in mezzo — sempre comunque riconoscibile e correggibile
    a mano, mai un campo silenziosamente sbagliato senza indizi.
  - Il titolare valuterà in futuro l'acquisto di un lettore ottico MRZ
    hardware dedicato (es. Regula, DENSO WAVE) se il volume di check-in
    reali renderà la correzione manuale troppo lenta in pratica — stessa
    logica già adottata per il barcode/QR magazzino (modulo 1.7 sopra).
    Nessuna azione da intraprendere ora.
  - Dettaglio tecnico completo dell'iterazione (Otsu, ritaglio, modello
    OCR-B, parsing tollerante): `docs/DIARIO_SESSIONI.md`, voce 04/08/2026.

Modulo 2.5 — Fase 2, stato al 13/08/2026: implementato e in uso in modo
  controllato, con 4 gap noti e un piano concordato per chiuderli.
  ✅ Fatto: generatore schedina (`alloggiatiSchedina.js`), client SOAP con
  `GenerateToken`/`Test`/`Send` (`alloggiatiSoapClient.js`), `Test`
  validato contro il servizio reale (1/1 schedine valide, 13/08/2026),
  invio reale (`eseguiInvioReale`) con pattern Test-before-Send, blocco di
  sicurezza contro i dati di test (`canale_origine='test_interno'`,
  verificato con test di regressione sia a livello di funzione che HTTP),
  job notturno (`invioAlloggiatiWeb.js`) dietro un interruttore esplicito
  `ALLOGGIATI_JOB_ATTIVO` (spento di default — non parte da solo dopo un
  deploy/riavvio), coda manuale in Impostazioni ▸ Alloggiati Web
  ("Invia ora" per singolo soggiorno, sempre con conferma esplicita).
  Prenotazioni di test (script `creaPrenotazioneTestAlloggiati.js` e
  `seedPrenotazioniTest.js`) possono restare nel database: bloccate a
  livello di funzione, non solo di lista, quindi mai inviabili per errore.

  Gap noti, con piano concordato il 13/08/2026 (ordine di sviluppo
  D→A→B→C, un giro al giorno per il job — non due). **D, A, B eseguite
  nella stessa sessione ("parti pure"), non ancora verificate contro
  Postgres reale dal titolare — vedi `docs/DIARIO_SESSIONI.md` voce
  "Fasi D, A, B del piano eseguite" per il dettaglio tecnico completo.**
  - ✅ **D — cattura ora check-in** (13/08/2026): migration 035, colonna
    `soggiorni.check_in_effettuato_at`, valorizzata alla transizione verso
    `check_in`. Solo cattura dato, enforcement 24h/6h ancora da costruire
    quando servirà davvero (nessuna prenotazione day-use reale oggi).
  - ✅ **A — retry vero con tentativi visibili** (13/08/2026):
    `eseguiInvioReale` scrive sempre una riga (anche esito `'errore_rete'`
    sugli errori di rete, prima invisibile), `GET /api/alloggiati/coda`
    mostra `tentativi_falliti` consecutivi. Un giro al giorno confermato.
  - ✅ **B — ricevute scaricate e archiviate** (13/08/2026): scoperta
    chiave dalla lettura del manuale — la ricevuta WS_ALLOGGIATI è UN PDF
    PER GIORNO (non per soggiorno), scaricabile solo "ultimi 30gg escluso
    il giorno corrente". Nuova tabella `alloggiati_ricevute` (migration
    036, chiave per data), job notturno esteso per scaricare le ricevute
    pendenti dopo il giro di invio, nuova card "Ricevute" in
    Impostazioni▸Alloggiati Web.
  - ✅ **C — dashboard con pallino verde/giallo** (14/08/2026): nuovo
    blocco in `dashboardController.alert()`, riusa l'`AlertItem` esistente
    (dot rosso/ambra, stesso meccanismo già in uso per ZTL/Magazzino/HR —
    nessun componente nuovo). Diverso dall'alert "documento incompleto" del
    06/08 (quello è readiness prima dell'arrivo, questo è invio mancato
    dopo il check-in). Termine legale = 24h da `check_in_effettuato_at`
    (Fase D) se presente, altrimenti da `data_arrivo` 00:00 per i soggiorni
    più vecchi. Rosso se scaduto, ambra se ancora in coda ma nei termini.
    **Deliberatamente NON implementata la regola delle 6h per il day-use**
    (arrivo e partenza lo stesso giorno) — stessa scelta già fatta per la
    Fase D, nessuna prenotazione così esiste oggi nel sistema. Esclude
    sempre `canale_origine='test_interno'`. Nuovi test in
    `tests/api/dashboard.test.js` (4 casi: rosso, ambra, esclusione esito
    'ok', esclusione test_interno) — non ancora eseguiti contro Postgres
    reale dal titolare.

    **Seguito 14/08/2026 — bug di isolamento test, non applicativo**: nel
    DB di sviluppo esistono 6 soggiorni reali mai inviati (termine
    risalente a fine luglio/inizio agosto) che riempivano da soli il
    LIMIT 5 della query, escludendo i fixture dei test. Estratta la query
    in `alertInviiAlloggiati()` con un filtro opzionale `soggiornoIds`
    usato solo dai test — `alert()` in produzione invariato. Nessun dato
    reale toccato.

    **Domanda di prodotto aperta, non decisa**: se in produzione si
    accumula un backlog cronico di soggiorni mai inviabili (dati
    insufficienti, bloccati in `errore` per sempre), il LIMIT 5 ordinato
    per urgenza li mostrerebbe per sempre, nascondendo i problemi nuovi.
    Non affrontabile ora — serve osservare un backlog reale di produzione
    per capire se è uno scenario concreto o solo teorico. Da rivedere dopo
    il go-live se il titolare nota l'alert "bloccato" sugli stessi
    soggiorni per giorni.

Modulo 2.6 — RIMOVCLI vs ROSS1000, conflitto scoperto il 13/08/2026: il
  codice esistente (`ross1000Xml.js`, `ross1000Controller.js`, generazione
  XML ✅ fatta) punta al webservice SOAP `turismows.regione.liguria.it/
  ws/checkinV2?wsdl`, piattaforma nazionale ROSS1000/Turismo5 (GIES)
  condivisa da altre regioni. Il titolare ha però trovato nella
  documentazione ufficiale Liguria (`docs/ross1000/regione liguria/`) un
  sistema diverso, RIMOVCLI: upload MANUALE di file XML su un portale
  dedicato (`flussituristici.regione.liguria.it/importc59-prod/
  login.c59`), non un webservice, con obbligo di certificazione preventiva
  del software (elenco delle "software house" compatibili). Confermato
  dal titolare: per la categoria Hotel in Liguria il canale corretto è
  RIMOVCLI, non il webservice già implementato.

  Prima domanda aperta: se un hotel possa far certificare un gestionale
  sviluppato internamente (non commercializzato ad altre strutture),
  senza essere una "software house" in senso tradizionale — l'elenco
  regionale contiene anche ditte individuali (es. "Guazzi di Stefano
  Guazzi", "CSG di Giulio Frusi"), ma nessuna voce è "un hotel che usa
  solo il proprio gestionale interno": la situazione non ha un precedente
  chiaro nell'elenco. Mail preparata e salvata in
  `docs/mail_statistiche_liguria.md`, indirizzata al referente corretto
  per le richieste tecniche (Mario Schenone, Settore Politiche Turistiche
  Regione Liguria — diverso dall'ufficio territoriale che gestisce
  l'adesione di chi usa un gestionale già in elenco). Non ancora inviata:
  il titolare deve completare nome/telefono/email prima dell'invio.

  Bloccato in attesa di risposta, nessuna stima possibile. Nel frattempo,
  a rischio zero: rinominare i riferimenti UI/commenti da "ROSS1000" a
  "RIMOVCLI / Statistiche turistiche Regione Liguria" per non fuorviare —
  NON toccare `ross1000Xml.js`/`ross1000Controller.js` prima della
  risposta, perché non è confermato che il generatore XML esistente resti
  valido per RIMOVCLI (stesso modello ISTAT C/59 di base, ma da
  verificare, non da assumere). Due scenari alla risposta: canale manuale
  confermato → basta l'export XML già esistente, nessuna nuova
  integrazione da scrivere; canale automatizzabile alternativo confermato
  → nuovo modulo vero (nuovo client, nuove credenziali), non un ritocco.

Modulo 5.1 — riordino menu/sidebar (segnalato dal titolare 03/08/2026, non
  sviluppare ora). Aggiungendo "Arrivi/Partenze" la sezione OSPITALITÀ della
  sidebar arriva a 7 voci — il titolare ha notato che il menu sta
  diventando ampio. Nessuna richiesta specifica di come riorganizzarlo,
  solo la segnalazione. Da riprendere in una sessione dedicata quando si
  hanno più voci da raggruppare (es. dopo i due punti sotto).
  Nota emersa nella stessa conversazione: esiste già oggi un'ambiguità di
  naming, non introdotta da questa sessione — la sidebar ha due voci
  entrambe chiamate "Prenotazioni": una in OSPITALITÀ (oggi rinominata
  CLIENTI E PRENOTAZIONI) → `/planning-camere` (griglia camere) e una in
  RISTORANTE → `/prenotazioni` (prenotazioni tavoli). Nota storica sulla
  bottom-nav mobile: da verificare, in `Sidebar.tsx` oggi (15/08/2026)
  `VOCI_MOBILE` per receptionist/portiere_notte punta "Prenotaz." a
  `/planning-camere`, non a `/prenotazioni` — probabilmente corretto in una
  sessione successiva al 03/08 non documentata qui, non riproporre come
  problema aperto senza riverificare.

  ✅ **RISOLTA la parte naming (15/08/2026)**: voce RISTORANTE →
  `/prenotazioni` rinominata da "Prenotazioni" a "Prenota Tavolo" in
  `Sidebar.tsx` (SEZIONI_MENU, sezione RISTORANTE). Nessun'altra pagina
  mostrava il testo "Prenotazioni" per questa rotta (AppShell/Topbar di
  `frontend/app/prenotazioni/page.jsx` non passa un `titolo`, quindi la
  sidebar era l'unico punto da correggere). Resta aperto solo il resto del
  riordino sidebar (7 voci in CLIENTI E PRENOTAZIONI), non richiesto ora.

Modulo 5.1 — pagina "Prenotazioni" dedicata in forma di tabella (idea
  futura del titolare, 03/08/2026, non sviluppare ora). Oggi l'unico modo
  di consultare le prenotazioni camere è la griglia visuale
  `/planning-camere` (drag-and-drop, pensata per pianificare). Il titolare
  immagina anche una vista tabellare (elenco ricercabile/ordinabile,
  filtri per stato/canale/data) per una consultazione più rapida —
  complementare alla griglia, non un sostituto. Nessuno schema/endpoint
  nuovo necessario: stessa fonte `GET /api/prenotazioni/griglia` o una
  query simile, solo una presentazione diversa.

Modulo 5.1 — sezione marketing invio email/SMS/WhatsApp: ✅ PARZIALMENTE
  RISOLTA (04/08/2026, estensione modulo 5.3). Realizzata la parte email:
  sezione sidebar "MARKETING" ▸ Offerte (invio a clienti specifici o a tutti
  quelli con consenso marketing, storico invii) + Impostazioni ▸ Testi email
  (oggetto/corpo delle 3 email automatiche + footer comune, editabili da
  admin/titolare). SMS e WhatsApp restano non implementati — richiederebbero
  un provider a pagamento, fuori dalla sequenza di moduli gratuiti seguita
  finora (stessa ragione per cui 5.3 non include SMS). Dettaglio tecnico:
  `docs/DIARIO_SESSIONI.md`, voce 04/08/2026.

Menu mobile — assegnazione ruolo↔voci provvisoria (fix 04/08/2026, non
  ritoccare senza chiederlo). Corretta la bottom nav mobile (icone rapide
  disallineate dal menu desktop, vedi diario 04/08/2026), ma sia le 4 icone
  rapide per ruolo sia, più in generale, cosa vede ciascun ruolo nel
  gestionale sono state scelte "a naso" in questa sessione. Il titolare ha
  chiesto esplicitamente di rivederle quando il progetto sarà a regime (uso
  quotidiano consolidato, non più fase di test) — non trattarle come
  definitive nel frattempo.

Modulo 5.3 — Offerte dedicate, limiti noti (04/08/2026, non ora):
  Invio sincrono: POST /api/offerte-email invia e attende tutti i
    destinatari uno per uno (pausa di 150ms tra un invio e l'altro) prima
    di rispondere — per una lista di poche centinaia di clienti è
    accettabile, ma se la lista dei clienti con consenso marketing crescesse
    molto andrebbe spostato su un job in background (stesso pattern di
    backend/jobs/promemoriaEmail.js) invece di tenere la richiesta HTTP
    aperta.
  Modalità "tutti i clienti con consenso" non coperta da test automatici
    (tests/api/offerte-email.test.js copre solo la selezione manuale, per
    non scrivere righe reali nello storico di produzione durante i test) —
    verificata solo manualmente dal titolare via UI.
  SMS/WhatsApp non implementati, vedi voce sopra "sezione marketing".

Modulo 5.2 Fase B — testo consenso privacy nel form pubblico di pre check-in
  (segnalato dal titolare 04/08/2026, non bloccante): il testo GDPR/TULPS
  mostrato all'ospite in frontend/app/pre-checkin/[token]/page.jsx è stato
  scritto in modo pragmatico durante lo sviluppo, MAI fatto verificare da un
  legale/DPO. Da rivedere prima che il form sia davvero raggiunto da ospiti
  reali (quindi comunque non prima di 1.10 Deploy VPS).

Trasversale — CampoData (selettore anno sui calendari, 05/08/2026):
  segnalato dal titolare che il calendario nativo del browser costringe ad
  andare indietro mese per mese per cambiare anno (problema soprattutto
  sulle date di nascita, fino a 110 anni indietro). Soluzione attuale:
  nuovo componente frontend/components/ui/CampoData.jsx — input
  type="date" nativo + un <select> anno separato accanto, applicato a
  tutti e 30 i campi data del gestionale (14 file). Funziona ed è stato
  implementato, ma il titolare non è convinto esteticamente/UX
  ("non mi piace molto come soluzione") — da considerare provvisoria.
  Da valutare in futuro: un vero componente calendario custom (libreria
  o fatto in casa) con navigazione anno più fluida/integrata invece del
  select accostato. Nessuna libreria valutata finora — se si riprende,
  ricordare la convenzione CLAUDE.md di motivare ogni nuova dipendenza
  nel piano prima di installarla.

Pagina "Report" dedicata (14/08/2026, richiesta dal titolare dopo
`docs/RICERCA_REPORTISTICA_COMPETITOR.md` — non sviluppare ora). Oggi il
gestionale non ha nessun report storico di ricavi/occupazione — verificato
nel codice: `dashboard.js` espone solo un KPI di oggi (`/kpi`), non
un'aggregazione su periodo. Tutti e 5 i concorrenti confrontati (Mews,
Cloudbeds, RoomRaccoon, Slope, TeamSystem Hospitality — quest'ultimo già
pagato oggi) offrono queste 9 categorie come denominatore comune, tutte da
includere nella nuova pagina `/report`:
  1. Occupazione su periodo scelto, con confronto storico (oggi solo
     istantanea di oggi nel widget dashboard).
  2. ADR/RevPAR — tariffa media giornaliera e ricavo per camera
     disponibile, metrica standard di settore mai calcolata oggi.
  3. Mix canali — quanto arriva da diretto/Booking/telefono/ecc. e quanto
     rende ciascuno (`prenotazioni.canale_origine` già popolato, dato
     pronto).
  4. Revenue per centro di profitto — camere separate da ristorante/extra
     (`pagamenti`, `addebiti_extra`, `comande` già distinti per fonte).
  5. Forecast — proiezione occupazione/ricavi sui prossimi giorni/mesi in
     base a quanto già prenotato. Diverso da 6.3 "revenue management
     automatico" (che ricalcola le tariffe da solo) — qui è solo guardare
     avanti, non decidere al posto del titolare.
  6. Report finanziario/P&L semplificato — entrate/uscite/redditività. Si
     scontra subito col limite di `incassi_giornalieri` (vedi voce
     dedicata sotto, appena affrontata in parte il 14/08/2026).
  7. Demografia ospiti — provenienza, ripetizione, stagionalità. Dato già
     raccolto per obbligo Alloggiati Web (2.5), riusabile senza nuova
     raccolta.
  8. Export PDF/Excel con un click — pattern già disponibile dopo l'export
     PDF del planning camere (14/08/2026, stesso giorno), riusabile come
     base tecnica.
  9. Dashboard in tempo reale — il gestionale ce l'ha già per *oggi*
     (widget Dashboard); il gap è lo storico su periodo arbitrario, non
     la tempestività del dato singolo.
  Dettaglio competitor per prodotto, fonti e cosa esiste già nel DB
  riusabile senza nuovo schema: `docs/RICERCA_REPORTISTICA_COMPETITOR.md`.
  Nessuna decisione presa su priorità/ordine di sviluppo tra i 9 punti.

  **Aggiornamento 16/08/2026**: punto 2 (ADR/RevPAR) avviato, con TRevPAR
  aggiunto — la pagina `/report` esiste ora davvero (prima era solo
  concetto), ma copre solo questo punto dei 9 elencati sopra. Vedi voce
  dedicata più sotto "ADR / RevPAR / TRevPAR + pagina Report (16/08/2026)"
  per il dettaglio implementativo — quella voce è la fonte più aggiornata
  per lo stato di `/report`, questa resta valida per gli altri 8 punti
  ancora tutti da fare, nessuno avviato.

Fase 3 (futuro):
  6.1 HACCP avanzato (temperature, scongelo, cotture) — funzionalità
    identificate da ricerca di mercato/normativa dedicata (14/08/2026),
    dettaglio completo (competitor, quadro legale, prezzi sensori, fonti)
    in `docs/RICERCA_HACCP_MERCATO_LEGALE.md`. Non è un obbligo di legge —
    lo è il piano di autocontrollo, non il software — ma la prassi 2026
    penalizza la compilazione differita in ispezione. Elenco funzionalità
    da costruire, ordinato per impatto reale in ispezione ASL5 Spezzino:
    1. ✅ [RICOSTRUITO 16/08/2026 su registri_HACCP_A1_A8.xlsx + CSV soglie
       del titolare — sostituisce la versione del 15/08] Registro
       temperature — da lista fissa di 4 stringhe a vera anagrafica
       apparecchiature: nuova tabella `apparecchiature_haccp` (migration
       041, CRUD in `configurazioneHaccpController.js`/`routes/
       configurazioneHaccp.js`, pagina `/impostazioni/haccp`), seedata coi
       12 apparecchi reali del titolare (3 frigo, 3 freezer, abbattitore,
       cappa, piano cottura, forno, lavastoviglie, zona rifiuti — editabile
       da UI). `registro_temperature` ora referenzia `apparecchiatura_id`
       (migration 042; `punto_controllo` resta come colonna storica per le
       righe di test già inserite, non droppata, il codice non la scrive
       più). **Soglie CONFERMATE dal titolare il 16/08/2026** (CSV
       allegato): frigo ≤ +4°C, freezer ≤ −18°C — `SOGLIE_TEMPERATURA` in
       `registroHaccpController.js` ora popolata per tipo (non più per
       singolo apparecchio), `fuoriSoglia()` attiva per frigo/freezer.
       **Abbattitore deliberatamente escluso** dal confronto min/max: il
       suo limite critico è un tempo di discesa (+65°C→+10°C in ≤2h), non
       un range statico — resta registrabile ma senza giudizio fuori-soglia
       finché non si costruisce un controllo a tempo dedicato (fuori scope,
       segnalato non improvvisato). Alert dashboard
       `alertRegistroTemperature()` aggiornato di conseguenza, stesso
       pattern testabile (override `oraCorrente`/`data`). Test riscritti in
       `tests/api/registro-haccp.test.js` con apparecchiature dedicate
       (prefisso ZZZ_TEST_), non più dipendenti dal seed reale. **Eseguiti
       contro Postgres reale il 16/08/2026: 35/35 verdi** (dopo un secondo
       bug di isolamento trovato dal titolare — il blocco "Impostazioni
       HACCP" valorizzava `configurazione_moduli_haccp.aggiornato_da` con
       l'utente di test senza azzerarlo, facendo fallire `pulisciDatiTest()`
       sulla FK in `afterAll`; fix: `UPDATE ... SET aggiornato_da = NULL`
       prima della pulizia utenti).
    2. ✅ [COSTRUITO 16/08/2026] Registro scongelamento/cottura — nuova
       tabella `registro_cottura` (migration 040), collegata a
       `menu_piatti(id)` con `ON DELETE SET NULL` (confermato dal titolare:
       `ricette` non è più in uso, il menu attivo è `menu_piatti`), campo
       piatto opzionale — non blocca la compilazione se il prodotto non è
       a menu. Stesso controller/route/tab del punto 1 (secondo tab della
       pagina `/registro-haccp`). Test in `tests/api/registro-haccp.test.js`
       (CRUD, permessi per ruolo, storico, collegamento al piatto menu,
       alert dashboard con override orario) — **eseguiti contro Postgres
       reale il 16/08/2026, 23/23 verdi**. Trovato e corretto un bug di
       isolamento tra test (il test storico lasciava una rilevazione senza
       ripulirla, inquinando il conteggio dei punti mancanti nel blocco
       `alertRegistroTemperature`) — fix: `beforeAll` dedicato che pulisce
       `registro_temperature` per la data di test prima di quel blocco.
    3. ✅ [FATTO IN PARTE 15/08/2026] Checklist pulizie/sanificazione —
       audit fatto su `haccp_checklist` prima di sviluppare alla cieca (la
       tabella/pagina esistevano già dalla Fase 1). Trovati 2 gap reali,
       non 0 come lasciava supporre la voce originale: (a) l'API
       restituiva già `nome`/`cognome` di chi ha salvato ma il frontend
       non li mostrava mai — aggiunta riga "Compilata da: Nome Cognome"
       in `frontend/app/checklist/page.jsx` (nessun backend nuovo, dato
       già disponibile); attenzione: attribuisce l'INTERA checklist del
       giorno a chi preme "Salva" una volta, non riga per riga — non è
       una vera firma per singola voce, solo attribuzione a livello di
       giornata; (b) nessun reminder se la checklist non viene compilata
       — aggiunta `alertChecklistHaccp()` in `dashboardController.js`
       (estratta come funzione a sé per essere testabile in isolamento
       dall'ora reale, stesso pattern già usato per `alertInviiAlloggiati`
       Fase C del 14/08), soglie orarie **15→ambra, 22→rosso** (ipotesi
       non confermata dal titolare, va bene finché non si dimostra sbagliata
       nell'uso reale — sono due costanti, non un redesign). 5 test nuovi
       in `tests/api/dashboard.test.js` (mattina/pomeriggio/sera/già
       compilata/nessun override), verificati con `node -c` + `npx esbuild
       --jsx=automatic` sui due file `.jsx` toccati — **non ancora
       eseguiti contro Postgres reale né visti in UI dal titolare**.
    4. ✅ [VERIFICATO+CHIUSO 16/08/2026] Tracciabilità lotti e fornitori —
       audit: `movimenti_magazzino` (modulo 1.7) aveva già `fornitore_id`,
       `ddt_numero`, `data_scadenza` per ogni carico — nessuna nuova
       anagrafica serviva. Mancava solo un modo per farli emergere insieme
       agli altri registri in vista ispezione: risolto dal punto 6 sotto
       (foglio "Tracciabilità fornitori" nell'export).
    5. ✅ [VERIFICATO 15/08/2026, non serviva sviluppo] Scadenze formazione
       HACCP dipendenti — audit fatto prima di aprire una sessione di
       sviluppo: la tabella `scadenze` (migration 002) è già generica
       (`tipo` testo libero, "corso_haccp" già citato come esempio nel
       commento SQL originale), la UI Personale▸Scadenze la gestisce e la
       Dashboard mostra già in automatico ogni scadenza entro 30 giorni
       sotto "HR · Scadenze" — zero righe di backend mancanti. Unico
       rischio reale: il campo "Tipo" era testo libero senza suggerimenti,
       quindi la stessa formazione avrebbe potuto finire salvata con
       grafie diverse tra un dipendente e l'altro, rompendo il futuro
       filtro per il registro export ispezione (punto 6 sotto). Corretto
       con una `<datalist>` di suggerimento (Corso HACCP, Visita medica,
       Corso antincendio, Contratto) su `frontend/app/personale/page.jsx`
       — il testo libero resta, non blocca inserimenti diversi.
    6. ✅ [COSTRUITO 16/08/2026] Generazione automatica registri per
       ispezione — pulsanti "Esporta Excel"/"Esporta PDF" dentro
       `/registro-haccp`, filtrabili per periodo, riservati al titolare.
       Un unico pacchetto: checklist pulizie, temperature, scongelamento/
       cottura, tracciabilità fornitori (DDT/scadenza, punto 4), formazione
       HACCP dello staff (punto 5). Backend: `datiIspezione()` in
       `registroHaccpController.js` aggrega le query già esistenti (nessuna
       nuova tabella), export Excel con libreria `xlsx` già in uso nel
       progetto (stesso pattern di `timbratureController.exportExcel`).
       Frontend: PDF costruito lato client con `jsPDF` (stesso pattern già
       in uso in planning-camere/menu, nessuna libreria PDF lato server).
       **Non ancora eseguito contro Postgres reale** — solo `node -c` +
       `npx esbuild`, come per il resto della sessione 3/4.
    7. ✅ [VERIFICATO 16/08/2026, nessun codice necessario] Conservazione a
       norma — controllato che nessun job/cron nel backend cancelli mai
       automaticamente righe da `haccp_checklist`, `registro_temperature`,
       `registro_cottura` o `movimenti_magazzino`: il requisito "conservare
       ≥3 anni" è già rispettato di fatto, i dati restano finché qualcuno
       non li cancella a mano dall'interfaccia. Se in futuro verrà
       introdotta una pulizia automatica di vecchi dati, va escluso
       esplicitamente questo gruppo di tabelle.
    ⚠️ **RIPIANIFICATO 16/08/2026**: il titolare ha fornito due documenti
    (`docs/HACCP/haccp - requisiti e leggi.md`, normativa CE 852/2004 +
    178/2002 + Regione Liguria per un hotel a Lerici) e un template esatto
    (`docs/HACCP/registri_HACCP_A1_A8.xlsx`, 8 fogli con lo schema di campi
    ufficiale per ogni registro) più un CSV con le soglie di temperatura
    confermate. Confronto con i 7 punti sopra: coprono bene A.2/A.3 (in
    parte) ma A.1 (ricevimento merci) non aveva mai il controllo vero
    all'arrivo, A.4 (buffet) zero copertura, A.5/A.6/A.7 più deboli del
    template, A.8 (infestanti) mai pianificato. Nuovo piano in 4 sessioni
    per costruire tutti gli 8 registri A.1-A.8 secondo lo schema esatto del
    template, con pagina unica "Registri HACCP" a tab e export per singolo
    controllo + omnicomprensivo. A.1/A.2/A.3/A.5/A.7/A.8 obbligatori per il
    titolare, A.4/A.6 costruiti ma con on/off da `/impostazioni/haccp`
    (`configurazione_moduli_haccp`, migration 041) in attesa di verifica sul
    piano HACCP reale dell'hotel. Sessione 1 (anagrafica apparecchiature +
    redesign registro temperature) fatta lo stesso giorno, vedi punto 1
    sopra.
    ✅ **Sessione 2 (16/08/2026) — A.1 Ricevimento merci + A.4 Buffet**:
    nuove tabelle `registro_ricevimento_merci` e `registro_buffet`
    (migration 043), CRUD in `registroHaccpController.js`, route in
    `routes/registroHaccp.js`, due nuovi tab nella pagina `/registro-haccp`
    (`Truck`/`UtensilsCrossed`). A.1 sempre attivo (obbligatorio); "esito"
    (conforme/non conforme) resta una valutazione manuale dell'operatore —
    il template non distingue refrigerato da congelato con un campo
    dedicato, quindi niente fuori-soglia automatico calcolato dalla sola
    temperatura, stesso principio già usato per la cottura (nessuna soglia
    inventata dove lo schema non la supporta in modo pulito). A.4 è un
    modulo "in forse": soglie **confermate dal titolare** (CSV) freddo
    ≤ +5°C / caldo ≥ +60°C, calcolate come frigo/freezer (`fuoriSogliaBuffet`
    in `registroHaccpController.js`, non salvate in tabella). Corretto un
    buco di permessi di Sessione 1: `GET /impostazioni/haccp/moduli` era
    riservato al solo titolare (`soloTitolare` globale sulla route), ma il
    tab A.4 nel frontend deve poterlo leggere per chiunque abbia accesso
    alla sezione haccp per decidere se mostrarsi — ora `richiedeSezione
    ('haccp')` solo su quella GET, `soloTitolare` resta su tutto il resto
    (anagrafica apparecchiature, PUT moduli). Doppio controllo lato server
    su `creaBuffet`: 403 se il modulo è spento, non solo tab nascosto lato
    UI. Test nuovi in `tests/api/registro-haccp.test.js` (CRUD, permessi,
    validazione, fuori-soglia, 403 a modulo spento con ripristino stato) —
    ✅ **Eseguiti contro Postgres reale: tutti verdi (confermato dal
    titolare).** Export Excel/PDF per questi due registri rimandato apposta
    alla sessione 4 (dove si rifà l'intero export ispezione sul formato
    esatto del template, non ha senso costruirlo due volte).
    ✅ **Sessione 3 (16/08/2026) — A.6 Manutenzioni programmate + A.7
    Formazione + A.8 Infestanti**: nuove tabelle `registro_manutenzioni`,
    `registro_formazione`, `registro_infestanti` (migration 044), CRUD in
    `registroHaccpController.js`, route in `routes/registroHaccp.js`, tre
    nuovi tab in `/registro-haccp` (Manutenzioni/Formazione/Infestanti).
    A.6 riusa l'anagrafica `apparecchiature_haccp` condivisa con A.2 (nessuna
    seconda anagrafica "attrezzatura" testuale) — nuovo endpoint `GET
    /registro-haccp/apparecchiature` (tutti i tipi attivi, non filtrato su
    frigo/freezer/abbattitore come `/temperature`) per popolare il select
    del form, leggibile da chiunque abbia la sezione haccp. A.6 è modulo "in
    forse" (`manutenzioni_programmate`): stesso doppio controllo di A.4 (tab
    nascosto se spento + 403 lato server su `creaManutenzione`). A.7/A.8
    sempre attivi (obbligatori). Campi "ditta_operatore"/"firma_responsabile"
    (A.6, A.8) e "nome_cognome" (A.7) restano testo libero e non FK verso
    `users`/apparecchiature esterne: possono riferirsi a ditte esterne o
    personale non ancora censito nel gestionale, stesso principio già usato
    per fornitore/prodotto in A.1. "attestato"/"firma_partecipante" (A.7)
    sono flag booleani, non documenti — nessuna gestione allegati in questa
    sessione. Test nuovi in `tests/api/registro-haccp.test.js` (CRUD,
    permessi, validazione, 403 a modulo A.6 spento con ripristino stato) —
    ✅ **Eseguiti contro Postgres reale: 70/70 verdi (confermato dal
    titolare).**
    ✅ **Sessione 4 (16/08/2026) — pagina unica a 8 tab + export esatto
    template + arricchimento A.3/A.5**: `/registro-haccp` ora ha un tab per
    ognuno degli 8 registri (aggiunto il tab Pulizie, riusa GLI STESSI
    endpoint `/hr/haccp` della pagina storica `/checklist` — nessuna
    tabella nuova, `/checklist` resta raggiungibile com'era, due UI
    temporaneamente sullo stesso backend). Migration 045: arricchiti A.3
    (`registro_cottura` + `lotto_partita`/`limite_critico`/
    `tempo_cottura_min`/`azione_correttiva`) e A.5 (`haccp_checklist` +
    `ora`/`prodotto_utilizzato`/`dosaggio`/`tempo_contatto_min`/
    `firma_responsabile`) per allinearli al template — solo ALTER additivi,
    nessuna riga esistente rotta. "limite_critico" di A.3 resta testo
    libero compilato dall'operatore (stesso principio già usato altrove:
    manca un campo categoria per calcolarlo automaticamente).
    **Export completamente rifatto**: l'export "ispezione" ad-hoc della
    sessione precedente (intestazioni italiane inventate, solo 5 registri su
    8, formazione presa dalle scadenze invece che dal registro A.7 vero) è
    stato eliminato e sostituito da `backend/controllers/
    esportazioneHaccpController.js` — una configurazione `REGISTRI` unica
    (nome foglio, intestazioni ESATTE lette dal template con openpyxl,
    query) usata sia per l'export di un singolo registro
    (`GET /registro-haccp/export/:registro/excel|dati`, Excel un foglio o
    dati JSON per il PDF lato client) sia per l'omnicomprensivo
    (`GET /registro-haccp/export/omnicomprensivo/excel|dati`, 8 fogli in un
    file, stesso ordine A.1→A.8). Riservato al titolare, come lo storico.
    A.2 dell'export filtra solo frigo/freezer (l'abbattitore non ha soglia
    statica, non appartiene al foglio "Temp_frigo_freezer"); A.3 filtra solo
    tipo='cottura' (lo scongelamento non ha un limite critico da valutare).
    La vecchia "Tracciabilità fornitori" (da `movimenti_magazzino`) non è
    più un foglio dell'omnicomprensivo: non fa parte degli 8 registri del
    template, i dati restano comunque disponibili da Magazzino — nessuna
    perdita, solo non più duplicati qui. Frontend: nuovo blocco unico
    "Export per ispezione" con selettore registro + Excel/PDF singolo, più
    due pulsanti "tutti gli 8 registri". Il PDF (jsPDF, nessuna libreria
    lato server) è generico: disegna qualunque {label, headers, righe} come
    testo `campo: valore` per riga, riusato identico per singolo registro e
    omnicomprensivo — non 8 layout scritti a mano.
    Test nuovi in `tests/api/registro-haccp.test.js`: un caso per registro
    (`test.each`) che verifica intestazioni ESATTE + valori della riga di
    fixture, permessi, 404 su chiave registro inesistente, content-type
    Excel, ordine A.1→A.8 dell'omnicomprensivo, guardia di regressione
    sull'ordine delle rotte (`/export/omnicomprensivo/*` deve essere
    registrata prima di `/export/:registro/*` in `routes/registroHaccp.js`,
    altrimenti Express la instraderebbe come se "omnicomprensivo" fosse il
    nome di un registro). **Eseguiti contro Postgres reale: tutti verdi
    (confermato dal titolare).**
    Modulo 6.1 (A.1-A.8) COMPLETO secondo lo schema del template fornito dal
    titolare — codice+test verificati, ma **mai visto in UI dal titolare**:
    nessuna delle 4 sessioni è stata controllata a schermo finora, solo
    tramite API/test automatici. Resta in attesa di: (a) conferma A.4/A.6
    restano attivi o vengono spenti dopo verifica sul piano HACCP reale
    dell'hotel (`/impostazioni/haccp`); (b) integrazione sensori IoT,
    deliberatamente fuori scope finché non si sceglie l'hardware (vedi
    sotto).
    ✅ **Navigazione unificata (16/08/2026, segnalato dal titolare)**: la
    sessione 4 aveva lasciato in sidebar due voci HACCP separate ("HACCP" →
    `/checklist`, "Registro HACCP" → `/registro-haccp`) nonostante A.5
    (pulizie) fosse ormai un tab dentro `/registro-haccp` — duplicazione
    inutile, corretta in `frontend/components/layout/Sidebar.tsx`: rimossa
    la voce desktop `/checklist`, l'icona rapida mobile del ruolo cuoco
    aggiornata da `/checklist` a `/registro-haccp`, unica voce rimasta
    rinominata "HACCP" (prima "Registro HACCP", ridondante ora che è l'unica).
    Aggiornato anche il link dell'alert dashboard "Checklist HACCP non
    ancora compilata" (`alertChecklistHaccp` in `dashboardController.js`) da
    `/checklist` a `/registro-haccp`, per coerenza.
    ✅ **`/checklist` cancellata (16/08/2026, richiesta esplicita del
    titolare)**: la pagina `frontend/app/checklist/page.jsx` era rimasta
    come URL orfano dopo l'unificazione sopra — il titolare ha chiesto di
    eliminarla del tutto invece di lasciarla raggiungibile digitando
    l'indirizzo. Spostata (non cancellabile direttamente da qui) in
    `_to_delete/checklist_<timestamp>/` nella cartella del progetto sul suo
    PC; va cancellata manualmente quella sottocartella quando vuole. Il
    BACKEND non è stato toccato: `haccpController.js`, `routes/hr.js`
    (`/hr/haccp`, `/hr/haccp/storico`) e `tests/api/hr.test.js` restano
    tutti come sono, perché sono lo stesso backend che ora serve il tab
    Pulizie dentro `/registro-haccp` — cancellarli avrebbe rotto quel tab.
    Deliberatamente non nell'elenco per ora: integrazione sensori IoT in
    tempo reale — dipende da quale hardware si sceglierà (vedi sotto),
    costruirla prima rischia di legarsi a un protocollo specifico che poi
    cambia. Gli endpoint POST dei registri sono comunque già utilizzabili
    da un gateway sensori quando arriverà, nessuna rilavorazione prevista.
    ⚠️ **Sensoristica — NON ancora scelta, serve ricerca mirata quando si
    riprende questo modulo**: unico prezzo confermato oggi è Hanna
    Instruments HI144 (data logger da parete singolo punto, 52-80 €+IVA,
    no abbonamento). Le alternative wireless con app/cloud viste
    (HaccpOK/Freeasy, Digitron HLX2015, Testo Saveris, Selin Milano
    RF300, Tecnafoodstore) non pubblicano prezzo online — vanno chieste a
    preventivo diretto, verificando sempre le condizioni di recesso prima
    di firmare (HaccpOK ha un pattern di vincolo 24 mesi con penali
    aggressive, visto nella ricerca). Prima di comprare, decidere quanti
    punti servono davvero (stima 6-8: frigo cucina, celle, abbattitore) e
    se conviene hardware one-off senza abbonamento (~400-650€ con HI144)
    o un sistema wireless con canone ricorrente ma integrazione più
    diretta nel gestionale.
  6.2 Agente AI interno per titolare e staff
  6.3 Revenue management (RevPAR, suggerimenti tariffari)

Evolutive competitive — gap rispetto ai leader PMS internazionali (Mews,
Cloudbeds, RoomRaccoon), emerse da un confronto esplicito il 05/08/2026.
Non funzionalità mancanti per andare in produzione — quello resta la
Sezione 8 di CLAUDE.md — ma differenziali che i PMS di riferimento hanno
oggi e questo gestionale no. Da NON lavorare proattivamente, stesso
principio del resto di questo file: si consultano quando si torna a
discutere la direzione del progetto, o quando il titolare chiede
esplicitamente "cosa manca" oltre agli aspetti funzionali di lancio.

  PRIORITÀ ALTA (impatto ricavi/operatività alto, costo di sviluppo
  contenuto o nessuna nuova dipendenza a pagamento):
  - [FATTO 06/08/2026] Modulo manutenzione/guasti: nuova tabella
    `segnalazioni_manutenzione` (migration 030), controller/route
    `/api/manutenzione`, pagina `/manutenzione`, alert Dashboard. Tutto il
    personale segnala (camera o area comune — bar/sala ristorante/cucina/
    lavanderia/lavaggio piatti/magazzino/garage/altro — foto opzionale);
    gestione stato (presa in carico/risolta) riservata ad admin/titolare
    (shared/ruoli.js sezione `manutenzione`). Bug reale corretto durante i
    test: `PATCH .../stato` falliva sempre con 500 (parametro `$1` usato
    sia in `SET stato = $1` sia in `CASE WHEN $1 = 'risolta'` — Postgres
    non deduce un tipo unico tra `character varying` e `text` e rifiuta la
    query in fase di parsing) — corretto con cast esplicito `$1::VARCHAR`.
    20/20 test verdi in locale (`tests/api/manutenzione.test.js`, scritto
    a mano: lo script `genera-test.js` non ha funzionato in questa sessione
    per credito esaurito sull'account Anthropic usato dallo script).
  - Upsell automatico in-stay (upgrade camera, late checkout, cena al
    ristorante triggerati a un punto preciso del soggiorno, non solo
    campagna email manuale come oggi "Offerte"): si appoggia
    all'infrastruttura Resend già in produzione (modulo 5.3), solo nuova
    logica di trigger — nessuna nuova dipendenza a pagamento.
  - ✅ [FATTO 14-15/08/2026] CRM ospiti con preferenze/tag — i 7 gap
    emersi da `docs/RICERCA_ANAGRAFICA_CLIENTI_COMPETITOR.md` (confronto
    Mews/Cloudbeds/RoomRaccoon/Slope) implementati come un'unica voce, su
    decisione esplicita del titolare — non 7 sviluppi separati. Migration
    `037_crm_ospiti.sql` (colonne `vip`, `blacklist`, `blacklist_motivo`,
    `allergie`, `tag TEXT[]` con indice GIN, `duplicato_di`); endpoint
    `GET /api/ospiti` esteso con filtri `tag/vip/blacklist/consenso_marketing/
    allergia/ordina/direzione/limit` (fino a 200, whitelist colonne
    ordinamento contro SQL injection sugli identificatori); nuovo
    `GET /api/ospiti/tag` (suggerimenti), `GET /api/ospiti/duplicati-sospetti`
    (gruppi per nome+cognome+data di nascita uguali, richiede data di nascita
    per evitare falsi positivi solo sul nome) e `POST /api/ospiti/:id/unisci`
    (permesso dedicato `ospiti.unisci`, solo admin/titolare — **mai una
    cancellazione**: il record "perdente" resta nel DB con `duplicato_di`
    valorizzato, tutte le FK — soggiorni, soggiorno_ospiti, offerte email,
    pre check-in — riassegnate in transazione, scelta deliberata perché
    l'identità ospite è legata a dati legali/Alloggiati Web dove una perdita
    silenziosa di storico sarebbe un rischio serio). `totale_speso` ora
    calcolato lato backend (soggiorni + addebiti_extra, prima un `reduce()`
    frontend che ignorava gli addebiti extra — bug reale corretto in questo
    giro). Frontend: `/clienti` con filtri tag/VIP/blacklist/ordinamento e
    banner duplicati sospetti; `/clienti/:id` con toggle VIP/blacklist,
    motivo blacklist, allergie collegate al cliente (non solo
    `ospiti_giornalieri`, azzerata ogni giorno), tag con autocomplete;
    nuova pagina `/clienti/duplicati` con scelta manuale del "vincitore" per
    gruppo e conferma esplicita prima di unire; alert compleanno (prossimi 7
    giorni) in Dashboard, calcolato interamente in SQL con
    `generate_series` per evitare la solita insidia UTC/fuso sull'attraversamento
    capodanno; Marketing▸Offerte con una terza modalità "Segmento" (filtro
    tag/VIP, riusa `GET /ospiti` esteso, nessuna modifica al backend delle
    offerte — popola la stessa lista `selezionati` della ricerca manuale).
    Verificato con `tsc --noEmit` (frontend) e `node -c` (backend) puliti su
    tutti i file toccati. **Verificato manualmente dal titolare in locale
    (15/08/2026), esito positivo su tutti i punti** — inclusi due bug reali
    trovati e corretti durante la verifica: migration 037 non applicata
    (Clienti e lista Dashboard alert davano errore, la seconda perché
    `alert()` raccoglie tutto in un unico try/catch e la query compleanni
    falliva su colonna mancante, portando giù anche gli alert Alloggiati
    Web che non c'entravano), e ricerca in `/clienti` che non trovava nulla
    cercando "nome cognome" insieme (fix: ricerca per parole invece di un
    solo ILIKE sull'intera stringa, vedi `docs/DIARIO_SESSIONI.md`).
    **Batteria di test scritta ed eseguita il 15/08/2026** — estesa
    `tests/api/anagrafica-ospiti.test.js` (stesso file del resto del modulo
    2.1, non un file a parte) con ricerca per parole, filtri tag/vip,
    `totale_speso`, `GET /ospiti/tag`, `GET /ospiti/duplicati-sospetti`,
    `POST /ospiti/:id/unisci` incluso il caso a 3 candidati nello stesso
    gruppo, permessi per ruolo, e i casi limite booleano/array
    (`blacklist=false` esplicito, `tag=[]` esplicito vs omesso).
    **54/54 verdi in locale**, confermato dal titolare — un solo fallimento
    al primo giro (asserzione `length===1` di un test preesistente non
    aggiornata per le nuove fixture CRM, che condividono il prefisso di
    cognome usato nella ricerca), diagnosticato dal titolare/tab Code e
    corretto stringendo il termine di ricerca invece di allentare
    l'asserzione — vedi `docs/DIARIO_SESSIONI.md`. Modulo CRM ospiti
    considerato chiuso: costruito, verificato manualmente, coperto da test
    automatici verdi. I 7 punti originari, per riferimento:
    1. Rilevamento/merge duplicati ospiti — oggi la ricerca in `/clienti`
       è solo `nome ILIKE / cognome ILIKE`
       (`anagraficaOspitiController.js`), nessun controllo automatico.
       **Il più urgente dei 7**: il modulo 2.3 (WuBook/OTA) creerà ospiti
       automaticamente da prenotazioni esterne — lo stesso cliente
       prenotato una volta diretto e una volta da un canale OTA rischia
       di diventare più schede distinte senza che nessuno se ne accorga.
       Meglio risolverlo prima che 2.3 parta, non dopo che il database ha
       già duplicati silenziosi.
    2. Totale speso per cliente esposto da un endpoint (oggi solo un
       `reduce()` lato frontend nella scheda singola, non ordinabile/
       filtrabile in lista — "chi sono i miei 10 clienti migliori" oggi
       richiede di aprire ogni scheda a mano).
    3. Tag/etichette libere sul cliente (oggi esiste solo un'"etichetta"
       sul nucleo familiare, concetto diverso — per gruppi di ospiti
       dello stesso soggiorno, non riusabile come tag su un singolo
       cliente nel tempo).
    4. Flag VIP/blacklist visibile in reception all'apertura scheda —
       nessun campo dedicato oggi.
    5. Allergie/preferenze alimentari collegate all'anagrafica cliente,
       non solo a `ospiti_giornalieri.note_allergie` (tabella dei coperti
       del giorno corrente, azzerata ogni giorno) — un ospite abituale
       con un'allergia nota deve rifarla presente ogni volta.
    6. Promemoria compleanno — `data_nascita` è già raccolta (obbligo
       Alloggiati Web), il dato c'è, semplicemente non viene ancora
       usato per altro.
    7. Segmentazione dinamica per Marketing▸Offerte (5.3) oltre a "tutti
       col consenso" o selezione manuale — es. per periodo di soggiorno,
       spesa, allergia. Dipende dai punti 2 e 5: senza spesa/preferenze
       strutturate non c'è nulla su cui segmentare, va quindi sviluppato
       dopo quei due, non in parallelo.

  PRIORITÀ MEDIA (valore reale, ma richiede integrazioni esterne o
  costo/complessità maggiore):
  - Messaggistica WhatsApp Business per comunicazioni pre-arrivo/durante
    il soggiorno: standard de facto in Italia, spesso più economico di un
    provider SMS dedicato (già escluso in 5.3 per costo) — ma richiede
    comunque account WhatsApp Business API e provider terzo, quindi non
    è "gratis" come il resto della sequenza 01/08/2026.
  - Gestione reputazione/recensioni aggregata (Google/Booking/TripAdvisor
    in un unico cruscotto con alert su recensioni negative): oggi solo un
    widget TripAdvisor statico sul sito. Richiede integrazioni API terze,
    spesso a pagamento (es. TrustYou) — da valutare il costo prima.

  PRIORITÀ BASSA / FUTURA (alto valore ma alta complessità, o dipende da
  altro lavoro non ancora fatto):
  - Revenue management realmente automatico (ricalcolo tariffe più volte
    al giorno in base a domanda/pace/competitor, non solo "suggerimenti"):
    è già 6.3 in roadmap Fase 3, ma lì è scritto come consiglio al
    titolare dopo un anno di storico — i PMS di riferimento lo fanno agire
    da solo. Da riprendere in ottica più ambiziosa quando si arriva a 6.3,
    non prima.
  - Rate shopping / monitoraggio prezzi competitor in zona: poco utile da
    solo, ha senso soprattutto abbinato al punto sopra — stessa sequenza.
  - Deposito cauzionale/no-show protection con carta virtuale: alto
    valore per proteggere le prenotazioni dirette, ma dipende
    tecnicamente dai pagamenti online (Nexi/Stripe via WuBook, già
    bloccati su sottoscrizione non fatta — vedi Fase 2 sopra). Non
    sviluppabile prima di quello.
  - API pubblica / webhook verso terzi: bassa urgenza finché l'unico
    partner esterno pianificato resta WuBook (già previsto ad hoc in 2.3).

✅ [FATTO 14/08/2026] Test preesistenti falliti, scoperti il 10/08/2026
durante il bump di sicurezza bcrypt/Next.js (tab Code) — 590/613 test
verdi, 3 suite rosse: `email-prenotazioni`, `email-template`,
`pre-checkin`. Root cause diagnosticata e corretta nella stessa sessione
in cui è stata scritta la voce sopra (non una sessione "dedicata"
separata come previsto): `email-template` non riconosceva il tipo
`pre_checkin` introdotto dal modulo 5.2 Fase B — confermato in codice,
`emailTemplateController.js` oggi gestisce esplicitamente `pre_checkin`.
Verifica per il titolare: `npm run test:api -- tests/api/email-template.test.js
tests/api/email-prenotazioni.test.js tests/api/pre-checkin.test.js` (o la
suite completa) deve dare tutte e tre le suite verdi.

Evolutive competitive — confronto con Slope (10/08/2026). A differenza del
confronto con Mews/Cloudbeds/RoomRaccoon (sopra), Slope è un concorrente
diretto italiano che copre già nativamente Alloggiati Web/ISTAT/tassa di
soggiorno — confronto più mirato. Fonti: sito ufficiale slope.it e una
recensione dettagliata di un receptionist utente da 3 anni
(storiedireception.com). Stesso principio delle altre sezioni competitive:
non da lavorare proattivamente, si consulta quando richiesto o quando si
torna a discutere la direzione del prodotto.

  PRIORITÀ ALTA (gap reale, nessuna dipendenza da WuBook/pagamenti,
  sfrutta infrastruttura già esistente):
  - Preventivi multiproposta con follow-up automatico: Slope invia un
    preventivo con più opzioni di soggiorno (date/camere/tariffe) e manda
    da solo email di follow-up dopo l'invio. Oggi gestito a mano in
    reception via email/telefono. Si appoggerebbe a Resend, già in
    produzione dal modulo 5.3 — nessun nuovo provider.
  - Firma digitale raccolta insieme al modulo privacy nel pre check-in:
    Slope raccoglie la firma del cliente insieme allo scan documento. Il
    pre check-in oggi raccoglie consenso marketing ma non una firma legata
    all'informativa GDPR/TULPS — il cui testo, ricordo, è già segnato
    altrove in questo file come "mai verificato da un legale".

  PRIORITÀ MEDIA:
  - Rooming list online per gruppi: il capogruppo compila i dati di tutti
    gli ospiti in una volta sola. Estenderebbe l'infrastruttura di
    pre check-in già esistente (oggi pensata per singolo soggiorno) ai
    gruppi (`gruppi_prenotazione`).
  - ✅ **DECISO (10/08/2026)**: addebito extra su prenotazione/camera non è
    più in contrasto con "nessun conto, prezzo incluso nella camera" — il
    titolare ha confermato la nuova politica: gli extra oltre il
    trattamento (specialmente bar) si accumulano sul conto camera e si
    saldano al check-out, con evidenza in una ricevuta di cortesia (non
    fiscale — i pasti inclusi restano dentro il documento fiscale della
    camera). Piano scritto lo stesso giorno (vedi
    `docs/DIARIO_SESSIONI.md`, voce 10/08/2026): migration
    `031_ristorante_addebiti.sql` (comande.soggiorno_id/nome_cliente_esterno,
    comande_righe.addebito_camera, tabelle addebiti_extra e
    catalogo_addebiti_rapidi), due percorsi verso addebiti_extra (comanda
    reale con addebito_camera per gli extra a tavola in ristorante; griglia
    rapida a quadratoni per il bar/camera, senza passare da comanda/cucina).
    ✅ **FATTO E IN PRODUZIONE (10/08/2026)**: 21/21 test verdi, verificato
    manualmente in locale (login reale, catalogo, griglia, addebito
    salvato), migration applicata anche sul VPS (hdgolfo-gestionale.com),
    deploy confermato con health check + pagina nuova entrambi 200. Resta
    volutamente non fatto: UI nel flusso comanda ristorante normale per
    soggiorno/esterno + toggle addebito camera (deprioritizzato dal
    titolare rispetto al bar — vedi voce "MEDIA" sopra, ora comunque
    superata dal fatto che il percorso principale è deciso e in uso).
  - Stampa comande su stampante termica in cucina/bar (oggi solo monitor
    SSE su tablet): richiede hardware, non solo software — da valutare
    solo se il monitor a schermo si rivela insufficiente in pratica con
    volumi reali.

  Confermato dal confronto, non nuovo (già tracciato altrove in questo
  file/in CLAUDE.md): fatturazione elettronica nativa (Slope ce l'ha già
  in produzione, qui dipende da A-Cube/Fatture in Cloud, moduli 3.1/3.2),
  channel manager/booking engine (stessa dipendenza WuBook già nota),
  invio reale Alloggiati Web e ROSS1000 (Fase 2 di entrambi, bloccate su
  credenziali).

4 QUESTIONI APERTE DA RIPRENDERE INSIEME (raggruppate esplicitamente dal
titolare il 10/08/2026 a fine sessione — "non fare nulla ora", solo
segnate per una revisione congiunta futura, nessuna investigata/toccata):

1. Toggle "addebita a camera" nel flusso comanda ristorante normale
   (apertura comanda con scelta soggiorno/cliente esterno, marcatura riga)
   — backend già pronto (modulo Addebiti extra, vedi sotto), solo la UI
   nel flusso comanda standard non è stata costruita, deprioritizzata dal
   titolare rispetto al bar.

2. Tariffe per camera/canale di provenienza — CHIARITA 19/08/2026 (era
   rimasta vaga dal 10/08). Non è "prezzo differenziato per canale" né
   "prezzo per singola camera fisica": è la UI di `/tariffe` da rendere più
   semplice da leggere per il titolare — capire a colpo d'occhio quale
   tariffa è impostata, per quale tipo camera, in quale periodo (oggi è una
   lista di righe testuali, non c'è una vista calendario/timeline). Il
   motore sotto (stagionalità per tipo camera, modulo 2.2) resta corretto e
   invariato — è solo un problema di leggibilità/UX per chi la usa senza
   essere uno sviluppatore. Da riprendere come evolutiva UI, non richiede
   nessuna modifica di schema o logica di calcolo.

   Collegata (stessa area, ma funzionalità diversa, discussa lo stesso
   giorno): "cosa mostrare online in un periodo" — oggi `tipi_camera_camere`
   (shared inventory, migration 050, vedi voce Booking Engine v2 sotto) è
   una mappatura fissa, non legata a date. Il titolare vorrebbe poter, per
   periodo: aprire temporaneamente la vendita online di un tipo oggi
   riservato a reception (es. Matrimoniale su 15/16/19/20 in bassa
   stagione, quando il rischio di cannibalizzazione è basso), o chiudere la
   vendita online di un tipo che oggi è aperto (es. Singola in alta
   stagione, per spingere le tariffe più alte). Confermato che è lo stesso
   concetto di "stop-sell per tipo+periodo" già discusso quel giorno come
   alternativa più semplice a un calendario di allotment completo (vedi
   ricerca competitor nella conversazione — pooled inventory + stop-sell è
   il pattern standard, non un allotment statico). Non implementata: nessun
   bisogno operativo concreto e immediato al momento della richiesta, solo
   segnata per quando servirà davvero. Se ripresa, naturale accorparla alla
   stessa evolutiva UI di `/tariffe` sopra — stesso posto dove il titolare
   già guarda per capire prezzi/periodi.

3. ✅ [FATTO 14/08/2026] Monitor cucina (`/cucina`, SSE) non funzionava
   in produzione: il titolare segnalava "connessione in corso" senza mai
   visualizzare nulla, diverso dal comportamento in locale. Root cause
   reale, diversa dalle ipotesi Nginx/Cloudflare scritte qui sotto quando
   il problema è stato segnalato: `frontend/app/cucina/page.jsx` costruiva
   l'URL dell'EventSource con la porta 7001 hardcodata, violazione della
   stessa regola di rete di CLAUDE.md Sezione 12 già trovata altrove (7
   file HR il 13/08/2026) — in produzione, dietro Nginx, la porta 7001 non
   è esposta, quindi la connessione SSE falliva sempre. Corretto usando
   `getApiUrl()` come ovunque altro nel gestionale, confermato dal
   titolare: "funziona in produzione, io vedo che va". Le ipotesi
   Nginx/Cloudflare sotto restano solo come nota storica, non erano la
   causa reale.

4. Manca un punto centrale per gestire lo stato e i conti di tutti i
   tavoli contemporaneamente durante un pasto — espande quanto già
   segnato subito sotto ("procedura di accesso da planning-camere") con
   una cornice più ampia data dal titolare oggi: non solo la UX di un
   singolo pulsante, ma "la dinamica dei vari passaggi" del flusso
   ristorante (apertura tavolo → comanda → cucina → conto → chiusura →
   incasso) da rivedere nel suo complesso — il titolare stesso ha detto
   di non essersi spiegato bene, quindi la prima cosa da fare quando si
   riprende è capire con lui cosa esattamente non funziona nella pratica
   quotidiana, non proporre soluzioni a priori.

Modulo Addebiti extra — procedura di accesso da planning-camere da
rivedere (segnalato dal titolare 10/08/2026, non ora). Il pulsante
"Addebiti extra" nel pannello dettaglio soggiorno di /planning-camere
funziona come concordato (apre /addebiti-extra col soggiorno già
risolto), ma il titolare lo trova scomodo nell'uso reale — verificato
dopo il primo giro di test, nessuna proposta ancora su come cambiarlo.
Da riprendere con una domanda esplicita su cosa esattamente non
convince (troppi passaggi per arrivarci? posizione del pulsante? manca
un ingresso più diretto tipo "camera → addebita" senza passare dal
dettaglio prenotazione?) prima di riprogettare qualcosa.

✅ [FATTO IN PARTE 14/08/2026] Modulo 1.8/1.6 — incassi_giornalieri
precompilato (solo camere). Segnalato dal titolare 10/08/2026, approfondito
e sviluppato in parte il 14/08/2026 dopo la ricerca competitor sulla
reportistica (`docs/RICERCA_REPORTISTICA_COMPETITOR.md`).

Verificato nel codice prima di scegliere l'approccio: `pagamenti` ha
`metodo` (contanti/pos/bonifico/altro) e `importo`, alimentata dal
check-out camera (`PannelloCheckOut`) — automatizzabile. Il ristorante NO:
`comande_righe` non salva mai un prezzo (calcolato a runtime da
`menu_piatti.prezzo`, mai persistito) e non ha nessun campo metodo di
pagamento, perché chiude ancora sul registratore fisico Hugin RT-K50, non
integrato col gestionale (lo sostituirà A-Cube, modulo 3.1, non ancora
iniziato). Quindi la scelta tra "sostituire" e "precompilare+conferma"
(le due opzioni lasciate aperte il 10/08) è stata decisa dal vincolo
tecnico stesso, non da una preferenza: **precompilare, mai sostituire** —
un calcolo automatico completo oggi darebbe sempre un numero sbagliato
per difetto (manca tutto il ristorante), quindi il controllo umano alla
conferma resta necessario per definizione, non per prudenza.

Fatto: `GET /api/dashboard/incassi/suggerimento?data=YYYY-MM-DD`
(`dashboardController.js`, stessi permessi di `registraIncasso` —
admin/titolare) somma `pagamenti` per metodo nel giorno richiesto
(`stato='completato'`), restituisce `{ contanti, pos, altri: {bonifico,
altro} }`. `BottomSheetIncasso` (home/page.jsx) lo interroga
all'apertura e precompila i campi contanti/POS solo se c'è un valore da
suggerire (un form con due zeri sembrerebbe già confermato) — resta
sempre modificabile/cancellabile. Se ci sono pagamenti bonifico/altro nel
giorno, un avviso ambra li segnala esplicitamente invece di ometterli in
silenzio ("non incluso nel suggerimento: €X — verifica se va sommato a
mano"). Nessuna nuova migration, nessuna nuova colonna.

**Resta esplicitamente non fatto**: la parte ristorante resta manuale al
100% come prima — non diventerà automatizzabile finché `comande` non
persiste un totale con metodo di pagamento (cambio più ampio al flusso di
chiusura conto, non fatto qui) oppure finché A-Cube (3.1) non sostituisce
Hugin come fonte reale. Non riproporre "automatizziamo anche il
ristorante" senza prima uno di questi due prerequisiti. Verificato solo
con `tsc --noEmit`/`node -c` (0 errori) — **non ancora visto in UI dal
titolare**, in particolare se il suggerimento risulta effettivamente utile
nell'uso reale o se disturba più di quanto aiuti.

Modulo 1.6 — rivisitazione flusso pagamento/chiusura conti ristorante
(segnalato dal titolare 10/08/2026, non ora). Il titolare non è sicuro che
il funzionamento attuale sia chiaro, e in particolare manca un punto
centrale per vedere tutti i tavoli aperti e il loro conto (in euro)
contemporaneamente durante un pasto. Verificato nel codice: `/sala`
(`GET /api/ristorante/tavoli`, salaController.js `listaTavoli`) mostra
stato tavolo/piatti in attesa/pronti per ciascun tavolo, ma MAI un totale
in euro — per vedere il conto di un tavolo bisogna aprire la sua comanda
singolarmente (`GET /api/ristorante/conto/:id`). Non esiste oggi una vista
aggregata "tutti i tavoli con il loro conto in tempo reale". Da riprendere
con una sessione dedicata a mappare l'intero flusso attuale (apertura →
ordini → chiusura → incasso) prima di proporre modifiche — il titolare ha
detto esplicitamente di non essere sicuro di come funzioni oggi, quindi
prima chiarire lo stato attuale insieme a lui, poi progettare la vista
aggregata.

Infrastruttura test — email di test condivise tra file (13/08/2026).
`npm test`/`npm run test:api` ora forzano `--runInBand` (package.json) dopo
che una corsa parallela ha fatto fallire 10 test per race condition su un
utente di test con email tipo `%@test.hotel`, creato/cancellato da più
worker Jest in contemporanea — non un bug applicativo, confermato con
`--runInBand` sequenziale: 738/738 verdi. La causa di fondo resta: più
file di test condividono la stessa email fissa invece di generarne una
univoca per file (pattern già usato in `tests/api/alloggiati.test.js` con
un suffisso timestamp, non generalizzato altrove). Con `--runInBand` come
default il problema non si presenta più nell'uso normale, ma tornerebbe se
qualcuno eseguisse due suite in parallelo manualmente o un CI futuro non
rispettasse questo script — non urgente ora, da sistemare alla radice
(email/utenti di test univoci per file) se si introduce un CI parallelo.

Dashboard a gruppi di widget (14/08/2026) — due punti aperti, non urgenti:
1. "Altri alert" (ex "Alert del giorno") tenuta sotto ai widget invariata:
   il titolare non ha deciso se toglierla ora che gran parte del suo
   contenuto è duplicato nei widget dedicati (ZTL, magazzino, Alloggiati
   Web, manutenzione, pre check-in). Restano lì solo per completezza
   scadenze HR, opzioni prenotazione in scadenza, documenti Alloggiati
   incompleti, menu non configurato, pre check-in da rivedere (diverso da
   "da inviare" — quello è la richiesta già compilata dall'ospite, non il
   link da mandare). Da rivedere quando il titolare deciderà se tenerla,
   ridurla alle sole voci non coperte, o toglierla del tutto.
2. "Tavoli occupati ora" nel widget Ristorante è un proxy, non il dato
   letterale chiesto ("quanti clienti stanno mangiando ora"): nessuna
   tabella traccia i coperti effettivamente seduti, `comande` ha solo lo
   stato aperta/chiusa. Se in futuro serve un vero conteggio persone,
   servirebbe aggiungere un campo "coperti reali" alla comanda (chiesto al
   cameriere in apertura tavolo) — non fatto ora, nessuna richiesta
   esplicita in questo senso, solo la constatazione che il dato attuale è
   un'approssimazione onesta ma non lo stesso numero.

✅ **Tre correzioni mirate alla dashboard (16/08/2026)** — nate da un audit
del report KPI in `docs/kpi/report.docx` fatto col titolare: prima di
implementare qualunque cosa il report proponeva si è verificato cosa c'era
già (la griglia widget del 14/08 copriva già la maggior parte del punto
"dashboard riorganizzata + numeri cliccabili" del report). Risultato: tre
modifiche minime, nessuna migration.
1. **Alert ordinati per gravità** — `alert()` in `dashboardController.js`
   accodava i blocchi in ordine fisso per categoria (ZTL→HACCP→Menu→HR→
   Magazzino→Prenotazioni→Alloggiati→Pre check-in→Compleanni→Manutenzione),
   un rosso urgente in fondo alla lista si vedeva solo scrollando. Aggiunto
   `alerts.sort(...)` prima di `res.json` (rosso sempre prima di ambra,
   ordine stabile a parità di tipo — Array.sort è stabile in Node/V8 da
   tempo). Nessun'altra modifica alla dashboard: il resto (5 gruppi con
   `stato`/`href` già cliccabili) già faceva quello che il report chiedeva.
2. **Manutenzione visibile in Stato Camere** — `segnalazioni_manutenzione`
   era già visibile in `/manutenzione` e nell'alert dashboard, ma non nella
   pagina operativa `/camere` dove lavora la cameriera/reception giorno per
   giorno. `camereController.lista()` ora fa un `LEFT JOIN LATERAL` sulla
   segnalazione aperta/in_lavorazione più urgente per quella camera (stesso
   criterio già usato nell'alert: priorità alta prima, poi la più vecchia),
   ritorna `manutenzione_priorita`/`manutenzione_descrizione`. Badge chiave
   inglese in `camere/page.jsx`, rosso/ambra in base alla priorità, link a
   `/manutenzione` per il dettaglio — non gestibile da lì, solo visibile.
   Non filtrato per data: una segnalazione aperta resta rilevante
   indipendentemente dal giorno visualizzato.
3. **Quadratura incasso** — nuovo endpoint `GET
   /api/dashboard/incassi/quadratura` (soloTitolare, stessa restrizione di
   `/incassi/suggerimento`), riusa le stesse due fonti già lette da
   `suggerimentoIncasso()` (nessuna query nuova): confronta
   `incassi_giornalieri` (dichiarato a mano) con la somma di `pagamenti`
   completati del giorno (atteso). Soglia fissa di 10€ (non percentuale —
   un 5% su un giorno da 40€ è un'inezia, un 5% su un giorno da 2000€
   nasconderebbe un ammanco vero) sotto la quale lo scostamento non è
   segnalato come anomalia. **Limite esplicito, ripetuto in ogni commento e
   nella risposta JSON (`copreRistorante: false`) per non farlo passare per
   una quadratura completa**: `pagamenti` è alimentata solo dal check-out
   camere, il ristorante chiude ancora sul registratore fisico Hugin
   RT-K50, fuori sistema (lo sostituirà A-Cube, modulo 3.1, non iniziato).
   Se `incassi_giornalieri` non ha ancora una riga per il giorno,
   `dichiarato`/`scostamento` sono `null`, non zero — un dato mancante e
   un'anomalia sono due cose diverse. Tessera "Incasso oggi" nel gruppo
   Costi di `home/page.jsx` mostra un badge verde/ambra con lo scostamento;
   nessun `href` aggiunto lì (la registrazione resta nel bottom sheet già
   esistente dietro "+ Registra incasso", non serve una pagina dedicata).
   Test in `tests/api/dashboard.test.js`: permessi, caso senza dati
   dichiarati, scostamento sotto soglia, scostamento sopra soglia (i due
   ultimi condizionati all'esistenza di almeno una prenotazione reale nel
   DB per la FK di `pagamenti.prenotazione_id`, coerente con l'ambiente di
   sviluppo che li esegue).
Deliberatamente rimandati (il titolare ha chiesto di riprenderli dopo aver
inquadrato tutto il resto): scorte con giorni di autonomia, calendario
occupazione 30 giorni, food cost teorico per piatto (richiede `ricette` con
grammature — costo organizzativo prima che tecnico, la raccolta dati può
partire in parallelo) — e i KPI direzionali del report (GOPPAR, RevPAR,
pickup/pace, channel manager), volutamente non prima di aver consolidato
quanto sopra.

✅ [FATTO 16/08/2026] Bug alert compleanni — "tra NaN giorni" invece del
numero, segnalato dal titolare in UI dopo il rilascio dei tre punti sopra
(non causato da quei tre punti — bug preesistente del 14/08/2026, mai
notato prima perché l'alert era nuovo). Causa: la query calcolava
`gs.giorno - CURRENT_DATE`, e `gs.giorno` (prodotto da `generate_series` con
argomenti timestamp) è un timestamp, non un date — timestamp meno date in
Postgres è un INTERVAL, non un intero. `backend/config/db.js` registra un
type parser custom solo per DATE (oid 1082) e BIGINT (oid 20), non per
INTERVAL: arrivava in JS come oggetto (`{days: ...}` dal pacchetto
`postgres-interval` usato internamente da node-postgres), e `Number()` su
quell'oggetto è sempre `NaN`. Il blocco "scadenze HR" nella stessa funzione
usava già il pattern corretto (`s.data_scadenza::date - CURRENT_DATE`,
date meno date = integer) — bastava applicare lo stesso cast:
`gs.giorno::date - CURRENT_DATE`. Un solo carattere di query mancante
(`::date`), non un problema di logica. Aggiunto un test dedicato in
`tests/api/dashboard.test.js` che inserisce un ospite di test con
compleanno fra 3 giorni e verifica che il testo dell'alert non contenga mai
"NaN" — prima non esisteva nessun test HTTP su questo alert specifico.

✅ **Punti 4 e 5 evolutiva dashboard (16/08/2026)** — calendario occupazione
30 giorni e scorte con giorni di autonomia. Un correzione a quanto detto
nella sessione precedente prima di descriverli: avevo detto che il food
cost teorico per piatto (punto 6, ancora rimandato) avrebbe richiesto
costruire da zero una tabella `ricette` — falso, `ricette` e
`ricette_ingredienti` esistono già dalla migration 004 (le primissime del
progetto), semplicemente non le usa nessun controller. Il lavoro rimasto
per il punto 6 è quindi solo applicativo (UI + logica), non di schema —
cambia la stima di complessità data prima, in meglio.
1. **Scorte con giorni di autonomia** — `magazzinoController.listaProdotti()`
   ora calcola, per prodotto, il consumo medio giornaliero (somma degli
   `scarico` in `movimenti_magazzino` negli ultimi 30 giorni ÷ 30) e i
   giorni di autonomia stimati (giacenza ÷ consumo medio). Nessuna nuova
   tabella. `giorniAutonomia` è `null`, non 0 né "infinito", quando non c'è
   nessuno scarico registrato negli ultimi 30 giorni — un prodotto mai
   scaricato non è automaticamente "sicuro", è semplicemente non stimabile
   con i dati disponibili. Badge colorato (rosso ≤3gg, ambra ≤7gg) nella
   card prodotto di `magazzino/page.jsx`. Test in `tests/api/magazzino.test.js`:
   caso con consumo calcolabile e caso senza.
2. **Calendario occupazione prossimi 30 giorni** — **zero endpoint nuovi**:
   riusa `GET /prenotazioni/griglia` (la stessa fonte dati di
   `/planning-camere` e dell'export PDF "Planning mensile" del 14/08),
   aggregata client-side in `home/page.jsx` (`calcolaOccupazione30Giorni`)
   in percentuale-occupata per ciascuno dei 30 giorni. Fascia orizzontale
   sola-lettura sotto la griglia widget, intensità del colore proporzionale
   all'occupazione — deliberatamente NON i colori di stato rosso/ambra/verde
   dell'app: un'alta occupazione è una buona notizia, riusarli avrebbe letto
   come un allarme. Link generico a `/planning-camere` per il dettaglio/
   editing, che resta lo strumento operativo — questa fascia è solo un
   colpo d'occhio. **Limite di test**: essendo aggregazione client-side pura
   (nessuna nuova query backend), non ha un test HTTP dedicato — verificata
   solo per sintassi (esbuild) e per lettura della logica, non con un test
   automatico della funzione di aggregazione. Se in futuro emergono bug qui,
   vale la pena valutare uno unit test JS lato frontend (oggi il progetto
   non ha infrastruttura di test frontend, solo `tests/api/*` via supertest).

⏸️ **Punto 6 rimandato deliberatamente (16/08/2026) — food cost teorico per
piatto**: NON è un blocco tecnico, è in attesa che il titolare decida CHI
inserisce le grammature ricetta per ricetta (chef? chi altro?) — costruirlo
ora sarebbe lavoro sprecato senza quella decisione, prima ancora che i dati
esistano. Analisi già fatta, da riprendere pari pari quando si sblocca,
senza rifare l'audit:
- `ricette`/`ricette_ingredienti` esistono già dalla migration 004
  (mai usate da nessun controller) — non serve crearle.
- **Decisione di schema necessaria prima di scrivere codice**:
  `ricette.nome_piatto` è testo libero, senza FK verso `menu_piatti.id` —
  matchare per nome scritto a mano è fragile. Proposto: aggiungere
  `ricette.menu_piatto_id` (FK nullable, additiva, nessun rischio sui dati
  esistenti — la tabella oggi è vuota o quasi).
- **Il "top 10 piatti" NON serve deciderlo a occhio**: `comande_righe
  (piatto_id, quantita)` esiste già e traccia ogni riga di ogni comanda —
  si può ricavare automaticamente dai piatti più venduti reali (es. ultimi
  90 giorni, comande non annullate), non da una supposizione dello chef.
- **Due assunzioni tecniche da confermare prima di implementare** (sbagliarle
  produce numeri falsati senza errore visibile):
  1. Unità di misura: `ricette_ingredienti.unita_misura` è un campo libero
     separato da `prodotti.unita_misura`, senza tabella di conversione.
     Proposto: richiedere in UI la STESSA unità del prodotto in magazzino,
     validato non silenzioso — nessuna conversione automatica per ora.
  2. Costo da usare: `prodotti` non ha un "costo attuale", vive dentro
     `movimenti_magazzino.costo_unitario` per ogni carico. Proposto: ultimo
     carico con costo registrato (stesso criterio di `storicoPrezzi()`),
     non una media.
- Lavoro tecnico stimato quando si sblocca: una migration additiva (FK), un
  controller CRUD ricette/ingredienti (solo admin/titolare, come anagrafica
  prodotti), calcolo costo teorico + margine per piatto, vista "top 10"
  teorico vs effettivo del mese (l'effettivo aggregato esiste già in
  `dashboard/kpi`, `foodCost.euroPerCoperto`) — piccolo, il collo di
  bottiglia resta solo l'inserimento dati.

✅ [FATTO 14/08/2026] Planning camere — export PDF stampabile. Pulsante
  "Esporta" nel toolbar (prima di "Nuova prenotazione", visibile a tutti i
  ruoli con accesso alla pagina, non solo a chi trascina), apre un piccolo
  menu con due opzioni indipendenti dalla vista attiva:
  - **Planning mensile**: sempre il mese di riferimento della vista
    corrente (non il range 7/14gg eventualmente selezionato), fetch
    dedicato su `/prenotazioni/griglia` per l'intero mese, A4 orizzontale,
    una riga per camera (raggruppate per piano come a schermo) e una
    colonna per giorno. Ogni soggiorno è disegnato come un'unica barra
    (stessa geometria di `calcolaBarra` usata a schermo), non una cella
    ripetuta per ogni giorno. Formato deciso col titolare: cognome dentro
    la barra, font ridotto automaticamente finché non entra nello spazio
    disponibile (`adattaFontATesto`, 7pt→4pt), troncamento con "..." solo
    come rete di sicurezza oltre il font minimo (non richiesto
    esplicitamente, evita testo sovrapposto sui cognomi più lunghi).
  - **Elenco prenotazioni**: rispetta i filtri attivi in `VistaElenco`
    (ricerca/date/stato) tramite un callback `onFiltriCambiati` che
    aggiorna un ref nel componente padre — nessun sollevamento di stato,
    `VistaElenco` resta proprietaria dei propri filtri. Non la
    paginazione a schermo: riparte da pagina 1 con `per_pagina=200` (il
    massimo consentito dal backend) per esportare il set filtrato più
    ampio possibile in un'unica chiamata.
  Nessuna nuova dipendenza: `jspdf` già in uso per il QR del menu
  (`frontend/app/menu/page.jsx`), stesso pattern `const { jsPDF } = await
  import('jspdf')` + disegno manuale (nessuna libreria di tabelle tipo
  autotable). Nessuna modifica backend — entrambi gli export riusano
  endpoint già esistenti (`/prenotazioni/griglia`, `/prenotazioni`).
  Verificato solo con `tsc --noEmit` (0 errori) dal sandbox. ✅ **Accettato
  dal titolare così com'è (15/08/2026)**: "per il momento mi accontento di
  quello che vedo" — non un collaudo formale riga per riga, ma nessuna
  richiesta di ulteriore verifica a breve. Non riproporre come "da
  verificare" finché non emerge un problema concreto nell'uso reale.

  ✅ **Confermato dal titolare come export di base** (14/08/2026), con
  richiesta esplicita di segnare possibili ottimizzazioni future (non ora,
  non specificate nel dettaglio — da chiarire quando si riprende):
  - Planning mensile: oggi l'export prende sempre e solo il mese
    correntemente visualizzato a schermo (`ancora`) — nessun selettore
    mese/anno indipendente nel menu Esporta. Per esportare un mese diverso
    da quello aperto, oggi bisogna prima navigarci sopra a schermo.
    Eventualmente anche un filtro per piano/gruppo di camere (oggi sempre
    tutte).
  - Elenco prenotazioni: già rispetta i filtri di `VistaElenco`
    (ricerca/date/stato) — un'ottimizzazione qui sarebbe forse la scelta
    delle colonne da includere, o un limite diverso dal fisso 200.
  Nessuna delle due è stata richiesta in modo specifico — prima domanda da
  fare quando si riprende: cosa esattamente manca nell'uso reale.

✅ [FATTO 15/08/2026] Planning camere — icona gruppo sulla barra. Aggiunto
`p.gruppo_id` al SELECT di `GET /api/prenotazioni/griglia`
(`prenotazioniController.js`, nessun nuovo parametro/endpoint) e una
piccola icona `Users` (lucide, 10px) prima del cognome nella `Barra`
quando `soggiorno.gruppo_id` è valorizzato, più una riga nel tooltip
("Fa parte di un gruppo"). Rimosso `truncate` dal contenitore flex della
barra (non funzionava più correttamente con due figli, icona+testo) e
spostato sullo `<span>` del cognome con `min-w-0` (necessario perché un
figlio flex non si restringe sotto la sua larghezza di contenuto senza
`min-width:0` esplicito). Verificato con `tsc --noEmit`. ✅ **Confermato dal
titolare in UI (15/08/2026)**: "esiste e c'è, è ok" — visto su una
prenotazione di gruppo reale, nessun problema segnalato.

Planning camere — gestione "prenotazioni non assegnate" (14/08/2026, da
costruire insieme al modulo 2.3 — channel manager WuBook, non prima).
Cloudbeds/Mews mostrano un pannello dedicato per le prenotazioni OTA che
arrivano senza una camera specifica assegnata, da smistare manualmente.
Oggi non è un gap reale: ogni prenotazione nel gestionale nasce già con una
camera scelta (form "Nuova prenotazione" la richiede sempre). Diventerà
rilevante solo quando le prenotazioni inizieranno ad arrivare da un canale
esterno (webhook WuBook) che potrebbe non specificare la camera — a quel
punto valutare uno stato "camera_id NULL" su `soggiorni` (oggi NOT NULL,
servirebbe una migration) e un pannello "Da assegnare" nella griglia/elenco.

Modulo Ristorante — toggle "addebita a camera" nel flusso comanda normale
(14/08/2026, dallo stesso confronto competitivo del riepilogo economico).
Oggi solo la griglia rapida bar/camera scrive su `addebiti_extra`
(`POST /api/soggiorni/:id/addebiti/rapido`) — il flusso comanda standard
del cameriere (selezione piatti dal menu, cucina, ecc.) non ha un modo di
marcare una riga come "addebita alla camera invece che pagare al tavolo".
Richiede una modifica al modulo Ristorante esistente (tag `soggiorno_id`
sulla comanda + flag per riga), non solo un'aggiunta — da trattare come
sessione a sé, tocca `comandeController.js`/`comande_righe`.

Dashboard home — receptionist/cuoco/dipendente senza contenuto dedicato
(14/08/2026, emerso rispondendo a una domanda del titolare sulla riga
KPI). Questi tre ruoli non rientrano né nella griglia widget (solo
admin/titolare) né in `RiepilogoCamere` (solo cameriere/portiere notte):
la loro home ha solo 2 KPI generici (Camere movimenti, Coperti oggi), non
tagliati sul lavoro specifico di ciascuno (es. il cuoco non ha bisogno di
sapere i movimenti camere, la receptionist trarrebbe più valore da
arrivi/check-in che da coperti). Non è la priorità di questa sessione
(centrata su admin/titolare) — da riprendere se il titolare vuole
dashboard più mirate per questi ruoli.

Tooling — nessun controllo statico reale sui file .jsx (15/08/2026,
scoperto da un bug reale in produzione: `risposta is not defined` in
planning-camere/page.jsx, mai catturato da `tsc --noEmit` nonostante fosse
stato lanciato ed esito pulito). Causa: `tsconfig.json` include solo
`**/*.ts`/`**/*.tsx` — `allowJs: true` permette ai file TS di importare JS,
non estende il type-checking ai `.jsx`. Il progetto non ha ESLint
configurato (nessuno script `lint`, nessun file di configurazione) — la
regola che avrebbe preso questo bug specifico è `no-undef`, tipicamente
ESLint. Tutte le voci precedenti in questo file e in DIARIO_SESSIONI.md
con "verificato con tsc --noEmit" su file `.jsx` vanno lette come verifica
di sintassi/JSX, non di variabili referenziate correttamente — la verifica
reale su quei file resta solo quella manuale/visiva. Da valutare
l'aggiunta di ESLint (nuova dipendenza, da discutere col titolare prima —
CLAUDE.md Sezione 2 richiede di descrivere il motivo prima di installare).
Aggiornamento stesso giorno: da questa sessione la verifica sintattica dei
file `.jsx` usa anche `npx esbuild --jsx=automatic` (nessuna nuova
dipendenza permanente, `npx` scarica ed esegue al volo) — conferma parsing
e JSX validi cosa che `tsc` non fa per `.jsx`, ma **non è un sostituto di
ESLint/no-undef**: esbuild non fa risoluzione di scope tra identificatori,
quindi un bug come `risposta is not defined` non verrebbe comunque preso
da solo. La difesa reale contro questa classe di bug resta l'audit manuale
(grep di tutte le `await api.*` senza variabile assegnata, poi verifica
incrociata di ogni uso di `.data`/`.body` a valle).

[FATTO 15/08/2026] Modulo Prenotazioni — ModalDettaglioGruppo senza
"aggiungi camera". Costruita la sezione "+ Aggiungi camera" dentro
ModalDettaglioGruppo (stesso pattern di WizardGruppo.aggiungiCameraGruppo,
POST /prenotazioni con gruppo_id già valorizzato, mai
/prenotazioni/:id/soggiorni). Nella stessa sessione: fix di un bug reale
sull'aggregazione dei pagamenti di gruppo (gruppiController.dettaglio()
sommava solo pagamenti.gruppo_id, escludendo i pagamenti "solo questa
camera" con prenotazione_id — corretto), nuova pagina /gruppi (elenco con
statistiche aggregate, voce sidebar sotto CLIENTI E PRENOTAZIONI). ✅
**Confermato dal titolare in UI (15/08/2026)**: "fatto e funziona" —
dettaglio completo in
DIARIO_SESSIONI.md, voce "Seguito: chiuso il gap ModalDettaglioGruppo...".

Limiti noti della pagina /gruppi e di GET /api/gruppi (15/08/2026):
`gruppiController.lista()` resta a `LIMIT 30` senza paginazione — va bene
per l'autocomplete di ModalAssegnaGruppo e per il volume atteso di un
hotel di 20 camere, ma se in futuro i gruppi storici superassero questa
soglia la pagina ne mostrerebbe solo i 30 più recenti senza avvisare.
`pagamentiController.listaPerGruppo` (GET /gruppi/:id/pagamenti) resta
volutamente diversa: mostra solo i pagamenti con gruppo_id valorizzato,
non quelli per singola camera — oggi non è usata da nessuna UI, ma se in
futuro serve uno storico pagamenti completo per un gruppo va corretta con
la stessa query di dettaglio().

WizardGruppo — referente→ospite auto-link impreciso per organizzazioni/
doppi cognomi (15/08/2026). Lo split automatico "ultima parola = cognome"
del nome del referente (usato per creare/riusare l'ospite intestatario
senza richiederlo due volte) funziona bene per "Mario Rossi" ma produce un
cognome sbagliato per nomi con più parole (es. "Maria De Santis" →
cognome "Santis", nome "Maria De") o per ragioni sociali. Non bloccante
(il campo resta sempre modificabile dopo la creazione), ma da tenere
presente se un gruppo viene creato con un referente dal nome composito.
```

ADR / RevPAR / TRevPAR + pagina Report (16/08/2026, richiesta esplicita:
"predisporrei ora il calcolo ADR/RevPAR/TrevPAR..."). Primi 3 indicatori
costi/ricavi del report KPI (docs/kpi/report.docx) costruiti — gli unici,
tra tutti quelli discussi in una sessione precedente lo stesso giorno, che
non dipendono da WuBook/A-Cube/nessuna mail in sospeso (quel ragionamento
era stato fatto solo in conversazione, non era mai stato scritto qui — va
tenuto presente per il futuro: se una discussione produce una conclusione
che conta, va salvata subito, non solo detta).

- **Backend**: `GET /api/dashboard/revenue?data=YYYY-MM-DD`
  (`dashboardController.revenueKpi`, mese in corso — dal giorno 1 a
  `data` — confrontato con lo stesso periodo dell'anno scorso). Stessa
  policy di accesso di `kpi()`: tutti i ruoli autenticati (dati aggregati,
  non sensibili), il frontend li mostra solo ad admin/titolare.
  - **ADR** = ricavo camere / camere-notte vendute.
  - **RevPAR** = ricavo camere / camere-notte disponibili.
  - **TRevPAR** = ricavo totale (camere+ristorante) / camere-notte disponibili.
  - Ricavo camere: `soggiorni.tariffa_totale` NON si somma per prenotazione
    (un soggiorno può attraversare due mesi) — si prorata sulle notti
    (tariffa_totale / notti totali) e si somma solo la quota-notti che
    cade nel periodo, con clamp GREATEST/LEAST invece di generate_series
    (una sola query aggregata, niente subquery per riga).
  - Camere disponibili nel periodo = camere attive OGGI × giorni del
    periodo — approssimazione nota, stesso limite già esistente di
    `camereTotali` in `kpi()`: non c'è uno storico di quando una camera è
    stata attivata/disattivata. Esposta in risposta (`periodo.camereAttive`)
    invece di restare un dettaglio nascosto.
  - **TRevPAR — punto da aggiornare quando l'integrazione sarà completa**:
    oggi il ricavo totale viene da `incassi_giornalieri` (inserimento
    manuale, camere+ristorante insieme, come già per `quadraturaIncasso`).
    Isolato apposta in una funzione a sé (`ricavoTotalePeriodo()`,
    commentata esplicitamente nel codice): quando WuBook (camere) e A-Cube
    (ristorante) saranno collegati, basterà cambiare la query dentro quella
    funzione con una SUM su `pagamenti` reali — il resto del calcolo (ADR/
    RevPAR/TRevPAR, la pagina Report, il widget dashboard) non richiede
    nessuna modifica, perché consuma solo il numero che quella funzione
    restituisce. Questo era il vincolo esplicito della richiesta ("andrà
    aggiornato correttamente il calcolo senza numeri manuali a
    integrazione completata") — non rifarlo diversamente in futuro.
- **Widget dashboard**: nuovo gruppo "Ricavi" in `GrigliaWidget`
  (`frontend/app/home/page.jsx`) — 3 tessere ADR/RevPAR/TRevPAR del mese
  in corso con badge di trend vs anno scorso (verde/rosso), click-through
  su `/report`.
- **Pagina `/report`** (nuova, `frontend/app/report/page.jsx`): selettore
  mese (mesi precedenti inclusi), i 3 indicatori con variazione %,
  dettaglio numerico (camere-notte vendute/disponibili, ricavo camere,
  ricavo totale, confronto anno scorso), nota metodologica esplicita sulle
  due approssimazioni (fonte manuale TRevPAR, camere disponibili
  "storiche" approssimate). In fondo, sezione "Altri indicatori (in
  programma)" con GOPPAR/Net RevPAR/CPOR/Pace-Pickup come tessere
  `sviluppato=false` (stesso pattern onesto già usato in dashboard) — non
  costruiti ora su richiesta esplicita, restano solo elencati qui sotto.
- **Navigazione**: nuova voce "Report" nel gruppo STRUTTURA della sidebar
  (`frontend/components/layout/Sidebar.tsx`), `href: '/report'`, riservata
  ad admin/titolare (`ruoli: AT`) — stessa policy dei dati finanziari già
  ristretti in dashboard (Incasso oggi, Registra incasso), non una nuova
  restrizione inventata apposta.
- **Impostazioni ▸ Report — deciso di NON crearla ora**: i 3 indicatori di
  oggi sono rapporti puri (ricavo/camere-notte), non hanno nessun
  parametro configurabile — una pagina impostazioni vuota non avrebbe
  senso. Diventerà necessaria quando arriveranno indicatori che richiedono
  un input manuale del titolare: GOPPAR e CPOR avranno bisogno di un costo
  del personale allocato alle camere (oggi assente da qualunque tabella),
  Net RevPAR di una % di commissione per canale — a quel punto la pagina
  impostazioni serve per inserire quei parametri, non prima. Da riaprire
  quando si sblocca uno di quei due indicatori, non prima.
- **Test**: `tests/api/dashboard.test.js`, describe `GET
  /api/dashboard/revenue` — copre proration su un soggiorno a cavallo di
  mese (5 notti totali, solo 2 nel periodo), esclusione dei soggiorni
  cancellato=true, coerenza RevPAR/TRevPAR con `camereAttive`/`giorni`
  dichiarati in risposta (non un numero assoluto ignoto — il conteggio
  reale delle camere attive del DB di sviluppo non è sotto controllo del
  test), periodo senza alcun dato (adr null, revpar/trevpar 0, nessun
  errore), permessi (kpi()-style, non ristretto a soloTitolare).
  Anno fittizio 2099 in tutte le fixture, stesso principio di isolamento
  già usato altrove nel file.

Booking Engine v2 — Tipi camera e tariffe, revisione con il titolare (19/08/2026):
  Consolidamento Singola/Doppia uso singola (migration 048, eseguita con
  successo — vedi docs/DIARIO_SESSIONI.md) ha sistemato solo la
  duplicazione fisica delle 4 stanze (2, 7, 12, 21). Restano aperti, da
  affrontare con il titolare quando la sessione lo consente:
  - Policy di prezzo tra tipi camera: oggi un solo prezzo per la stanza
    consolidata "Matrimoniale Piccola" indipendentemente dal numero di
    occupanti (1 o 2 adulti) — il titolare ha deciso così per ora, ma ha
    detto esplicitamente che la questione va rivista con calma.
  - prezzoBase dei documenti Sanity (Matrimoniale 90€, Tripla/Quadrupla
    110€, per persona/notte in mezza pensione) — dati dal titolare come
    "quasi a caso, tranne i 90€": servono a valorizzare il campo Sanity
    "Prezzo a partire da" per la pagina marketing /camere, NON sono usati
    dal motore tariffe del gestionale (quello resta sempre la fonte reale
    per il booking engine). Da aggiornare quando il titolare ha un listino
    vero. Nessuna tariffa vera creata/modificata nella tabella `tariffe`
    in questa sessione.
  - Il campo Sanity `prezzoBase` non distingue "a persona" da "a camera" né
    il tipo di pensione (mezza/completa) — oggi è solo un numero. Se in
    futuro serve mostrarlo correttamente sul sito, va rivista la modellazione
    (nuovo campo o testo esplicito accanto al prezzo).
  - Matrimoniale Piccola non ha ancora un prezzoBase: il titolare non ha
    dato un numero per questa tipologia, lasciato vuoto in Sanity apposta
    (mai inventato) — vedi `backend/scripts/creaContenutiCamereMancanti.js`.

Modulo tariffe derivate — periodi/trattamento/bambini (20/08/2026), aperto
a fine sessione, non urgente ma da chiudere prima di fidarsi del clamp:
  - Range min/max dichiarati alla Regione: predisposti (`regole_derivazione_
    tariffe.prezzo_minimo/prezzo_massimo`), ma NESSUNO popolato — il clamp
    di compliance è quindi inattivo su tutti i tipi derivati (Singola,
    Doppia uso singola, Tripla, Quadrupla) finché il titolare non li
    inserisce da `/tariffe` ▸ Regole di derivazione.
  - Sconto bambini 3-11 anni sul supplemento trattamento: seminato a 0%
    (nessuno sconto) con nota esplicita in `configurazione_bambini` — il
    titolare non ha ancora dato la percentuale reale, solo un "x%"
    generico in chat.
  - Bambini 12-17 anni: nessuna regola specifica data dal titolare —
    trattati oggi come un adulto a tutti gli effetti (capienza e
    supplemento pieno), assunzione mia da riconfermare.
  - ~~Suite di test~~ — **18/18 verdi, confermato dal titolare (tab Code),
    nessuna correzione necessaria.** Punto chiuso.
  - Verifica manuale end-to-end: **prima prenotazione reale fatta dal
    titolare (20/08/2026)** — Matrimoniale Piccola, un periodo stagionale
    creato e collegato alla tariffa (`tariffe.periodo_id`), "sembra
    funzionare". Chiarito con il titolare cosa copre esattamente: solo B&B
    (nessun trattamento selezionato). Matrimoniale Piccola NON è un tipo
    derivato (tariffa propria in `tariffe`, non passa da
    `regole_derivazione_tariffe`) — quindi questa prova verifica periodi
    stagionali + collegamento tariffa↔periodo, ma NON il clamp sul range
    dichiarato né il cambio di percentuale tra periodi (quelli riguardano
    solo Singola/Doppia uso singola/Tripla/Quadrupla) né il supplemento
    trattamento/sconto bambini (mai selezionato in questo test). Il
    titolare ha detto esplicitamente di accontentarsi per ora — non
    riproporre finché non lo riporta lui.
  - UI `/tariffe` — redesign, chiuso (20/08/2026) dopo TRE tentativi, i
    primi due bocciati. Primo tentativo (tendine): Periodi/Regole di
    derivazione/Supplemento trattamento come sezioni separate da navigare
    tra loro — bocciato ("non riesco a capire come utilizzare tutte queste
    tendine"). Secondo tentativo: timeline dell'anno con trascinamento mese
    per mese (`TimelinePeriodi.jsx`) — bocciato anche questo appena visto
    ("non ci siamo... siamo sempre punto a capo"), mai arrivato a un test
    reale. Terzo tentativo, implementato e confermato dal titolare su
    mockup prima di toccare codice: ogni tipologia è una scheda
    auto-contenuta (`SchedaPrezzoTipologia.jsx`/`SchedaTrattamento.jsx`)
    con i periodi come ETICHETTE cliccabili (`ChipPeriodi.jsx`), "+ nuovo
    periodo" apre un form inline (nome + due date) invece di un calendario
    da trascinare; le tipologie camera sono una fila di etichette in alto,
    una scheda visibile alla volta (non tutte impilate, per non ricreare
    l'illeggibilità del primo tentativo da un'altra porta). Codice del
    secondo tentativo (`TimelinePeriodi.jsx`, `PannelloPrezzoTipologia.jsx`,
    `PannelloSupplementoTrattamento.jsx`) lasciato nel repository come stub
    non referenziato invece che eliminato (la cancellazione richiede
    conferma esplicita dell'utente, non necessaria per file già non
    importati). Verificato solo con `esbuild`/`tsc --noEmit` (puliti) — NON
    ancora verificato in UI dal titolare: in particolare il form "+ nuovo
    periodo" e l'anteprima di calcolo sulla scheda derivata.
  - Idea del titolare, deliberatamente rimandata (20/08/2026): sotto i
    pannelli di configurazione, una vista tipo planning (come
    `/planning-camere`) con righe = tipologie camera, colonne = mesi o
    trimestri, celle = prezzo definito in quel periodo; al passaggio del
    mouse tutte le info (min/max/percentuale per le derivate, solo il
    prezzo per la madre — il tooltip NON è uniforme riga per riga, va
    disegnato sapendo che il contenuto cambia per tipo di riga). Utile
    soprattutto per vedere colpo d'occhio i buchi di copertura (mesi senza
    prezzo configurato). Il titolare ha detto esplicitamente di andare
    prima ai pannelli delle varie situazioni — non è ancora uno spec da
    costruire, solo un'idea da tenere per dopo.
  - Code review 22/08/2026 (tab Code) — Tier 1 (fix #4 e #1) chiuso il
    22/08, **Tier 2/3 chiuso il 23/08/2026** (dettaglio completo
    `docs/DIARIO_SESSIONI.md`, voce 23/08/2026): nome ospite non
    sanificato nella mail di conferma (rischio HTML injection, era in
    `inviaNotificaHoldScaduto`) — ✅ corretto; chiamata Stripe eseguita
    dentro una transazione DB aperta — era in
    `bookingPubblicoController.prenota()`, non nel webhook come diceva la
    sintesi originale — ✅ corretta; assunzione di migration 050 "Singola
    sopravvive sempre a 048" mai verificata esplicitamente — ✅ nuovo test
    dedicato (`tests/api/migrazioneShareInventory.test.js`); camera nuova
    non collegata automaticamente alla vendita online — ✅ auto-
    collegamento additivo in `camereController.crea()`/`aggiornaTipo()`;
    percentuale caparra 30% duplicata a mano tra `sito-hotel` e gestionale
    — ✅ nuovo endpoint `GET /api/booking-pubblico/configurazione`, letto a
    runtime da `BookingWidget.tsx`; `/planning-camere` senza indicazione di
    trattamento/tipo camera venduto — ✅ aggiunto sia nel dettaglio
    prenotazione sia nel tooltip della barra; tripla query di calcolo
    prezzo per tipologia (bb/mezza pensione/pensione completa) — ✅ nuova
    `calcolaTariffaPerTrattamenti` (prezzo camera calcolato una sola volta).
    **Scritto e verificato solo con `node -c`/`esbuild` dal sandbox Cowork
    — nessuna esecuzione reale della suite Jest da qui: resta da confermare
    dal tab Code.** Item scartato da Code ma non confermato come
    non-problema, ANCORA APERTO (non toccato in questa sessione):
    `prezzo_notte: 0` trattato come "nessun valore" via COALESCE,
    potenzialmente raggiungibile dalla nuova UI schede/chip — serve il
    file:riga esatto citato da Code prima di chiudere o riaprire.
