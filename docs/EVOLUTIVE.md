# Evolutive future — non sviluppare ora

Backlog di gap noti, bug minori non bloccanti e miglioramenti rimandati
deliberatamente. Spostato qui il 26/07/2026 dalla ex Sezione 14 di
CLAUDE.md per tenere quel file leggero. Nulla qui è urgente — è materiale
da consultare quando si torna a toccare il modulo in questione, non da
lavorare proattivamente.

```
Modulo 1.6 — Ristorante (gap noti, da completare prima del go-live):
  Eliminazione configurazione sala: bloccare se ha tavoli associati,
  consentire solo se vuota. (eliminaConfigurazione non implementata)

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
  2.5 Alloggiati Web — Fase 2 (generatore schedina + client SOAP + invio
    reale Test/Send), vedi voce dedicata "Modulo 2.5" più sotto per lo
    stato Fase 1b e il test reale ancora da fare
  2.6 Export ROSS1000/ISTAT
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

Modulo 5.1 — riordino menu/sidebar (segnalato dal titolare 03/08/2026, non
  sviluppare ora). Aggiungendo "Arrivi/Partenze" la sezione OSPITALITÀ della
  sidebar arriva a 7 voci — il titolare ha notato che il menu sta
  diventando ampio. Nessuna richiesta specifica di come riorganizzarlo,
  solo la segnalazione. Da riprendere in una sessione dedicata quando si
  hanno più voci da raggruppare (es. dopo i due punti sotto).
  Nota emersa nella stessa conversazione: esiste già oggi un'ambiguità di
  naming, non introdotta da questa sessione — la sidebar ha due voci
  entrambe chiamate "Prenotazioni": una in OSPITALITÀ → `/planning-camere`
  (griglia camere) e una in RISTORANTE → `/prenotazioni` (prenotazioni
  tavoli), e la bottom-nav mobile di receptionist/portiere_notte punta
  "Prenotaz." a `/prenotazioni` (ristorante), non al planning camere. Utile
  chiarire quando si affronta il riordino.

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

Fase 3 (futuro):
  6.1 HACCP avanzato (temperature, scongelo, cotture)
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
  - CRM ospiti con preferenze/tag (piano alto, allergie ricorrenti,
    occasioni speciali): oggi `ospiti` ha solo consenso marketing, nessun
    campo per preferenze riutilizzabili. Propedeutico a personalizzare
    upsell e comunicazioni — basso costo (solo schema + UI), alto valore
    per una struttura di dimensioni piccole dove il rapporto ospite è
    diretto.

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

Test preesistenti falliti, scoperti il 10/08/2026 durante il bump di
sicurezza bcrypt/Next.js (tab Code) — 590/613 test verdi, 3 suite rosse:
`email-prenotazioni`, `email-template`, `pre-checkin`. Verificato via
`git diff` che le uniche modifiche di quella sessione erano righe di
versione in `package.json` (nessun codice applicativo toccato), quindi
non è una regressione introdotta dal bump — erano già rotti prima. Almeno
una causa nota: `email-template` non riconosce ancora il tipo
`pre_checkin` introdotto dal modulo 5.2 Fase B. Da investigare e
sistemare in una sessione dedicata — non bloccante per il deploy di
sicurezza in corso, ma non ignorare: se un giorno questi tre tornano verdi
senza che nessuno li abbia toccati esplicitamente, verificare comunque
cosa è cambiato prima di fidarsi.

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
    In esecuzione.
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

Modulo 1.8/1.6 — incassi_giornalieri da automatizzare (segnalato dal
titolare 10/08/2026, non ora — dopo il modulo Fondamenta addebiti extra).
Oggi `incassi_giornalieri` è un inserimento manuale del titolare (una riga
al giorno, contanti+pos), scollegato da `pagamenti`/`comande`/
`addebiti_extra` — nessun incrocio automatico tra "cosa dice la cassa
fisica" e "cosa dice il gestionale". Il titolare vuole automatizzarla.
Punto da decidere quando si riprende: sostituire l'inserimento manuale con
un calcolo automatico (rischioso — la cassa fisica include contanti che il
sistema non vede, es. mance, o discrepanze reali da segnalare), oppure
pre-compilare i campi da pagamenti+comande e lasciare al titolare solo la
conferma/correzione (più sicuro, mantiene la riconciliazione come
controllo). Non implementare senza chiarire quale delle due.

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
```
