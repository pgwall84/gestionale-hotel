# Riassunto evolutive/fix — indice ricostruito (16/08/2026)

Questo file NON sostituisce `docs/EVOLUTIVE.md` o `docs/DIARIO_SESSIONI.md` —
resta lì il dettaglio tecnico completo di ogni voce. Questo è un indice
ricostruito leggendo tutti i documenti del progetto in un colpo solo, per
rispondere a una sola domanda: **cosa è ancora aperto oggi, e su cosa
esattamente è fermo**. Nasce da un problema concreto: `EVOLUTIVE.md` è
ormai ~1660 righe in ordine puramente cronologico, senza indice — la stessa
informazione può comparire, essere corretta o essere superata in tre punti
diversi del file, e trovarla richiede di ricordarsela o rileggere tutto.

**Come è stato costruito**: lettura integrale di `EVOLUTIVE.md`,
`DIARIO_SESSIONI.md` (4415 righe), `PIANO_MIGRAZIONE_DICEMBRE_2026.md`,
`DOMANDE_APERTE_07-08-2026.md`, `PRENOTAZIONI_FASE2.md`,
`RICHIESTA_WUBOOK.md`, `mail_acube_preventivo.md`,
`mail_statistiche_liguria.md`, `RICERCA_REPORTISTICA_COMPETITOR.md`,
`RICERCA_ANAGRAFICA_CLIENTI_COMPETITOR.md`, `RICERCA_HACCP_MERCATO_LEGALE.md`,
`DEPLOY_VPS_NETCUP.md`, `PROVISIONING_DIPENDENTI_AGOSTO_2026.md`. Dove due
documenti si contraddicevano, ho tenuto la versione più recente/più
specifica, non la media delle due — sezione 0 qui sotto elenca ogni caso
trovato, con la fonte di entrambe le versioni.

**Limite di questo file**: è una fotografia al 16/08/2026. Non si
aggiorna da solo — richiede di essere rigenerato (stessa lettura completa)
quando torna a sembrare vecchio, non ogni piccola modifica a EVOLUTIVE.md.
Se qualcosa qui sotto sembra sbagliato rispetto a quello che sai per certo,
fidati della tua memoria e correggimi: è più probabile che questa
ricostruzione abbia un errore che il contrario.

---

## 0. Contraddizioni/informazioni superate trovate in questa lettura

**ROSS1000 vs RIMOVCLI** (l'esempio che hai segnalato tu). Conclusione
corretta, confermata dal 13/08/2026 e mai smentita dopo: per la categoria
Hotel, il canale giusto per le statistiche turistiche Regione Liguria è
**RIMOVCLI** (upload manuale di un file XML su
`flussituristici.regione.liguria.it/importc59-prod/login.c59`, modello
ISTAT C/59), **non ROSS1000/webservice `checkinV2`** (piattaforma
nazionale condivisa da altre regioni, quella già codificata in
`ross1000Xml.js`/`ross1000Controller.js`). Fonte primaria:
`EVOLUTIVE.md` righe 481-518 e `docs/mail_statistiche_liguria.md`.
`PIANO_MIGRAZIONE_DICEMBRE_2026.md` (§0.6, §12) e
`DOMANDE_APERTE_07-08-2026.md` (§1, §6) — entrambi del 07/08/2026, quindi
scritti PRIMA della scoperta del 13/08 — parlano ancora di "ROSS1000,
credenziali HTTP Basic per checkinV2": sono superati, non aggiornati dopo
il 13/08. Il codice (`ross1000Xml.js`, `ross1000Controller.js`, route
`/api/ross1000`, voce sidebar "Statistiche Liguria" → `/impostazioni/ross1000`)
resta **deliberatamente non rinominato/non toccato** in attesa della
risposta di Regione Liguria (email pronta in `mail_statistiche_liguria.md`,
**mai inviata** — manca nome/telefono/email del titolare da inserire).
**Prossima azione reale**: sei tu a dover completare e inviare quella mail,
non un compito tecnico.

**Pagina Report — due voci per lo stesso argomento**. `EVOLUTIVE.md` riga
608 (14/08/2026) descrive una visione completa a 9 punti per una pagina
Report (occupazione storica, ADR/RevPAR, mix canali, revenue per centro di
profitto, forecast, P&L, demografia ospiti, export, dashboard realtime).
La voce più recente (riga 1584, 16/08/2026) racconta cosa è stato
effettivamente costruito oggi: solo il punto 2 (ADR/RevPAR, + TRevPAR
aggiunto). Le due voci ora si linkano a vicenda nel file — non erano in
contraddizione, solo la seconda non esisteva ancora quando ho scritto
questo indice la prima volta. Gli altri 8 punti restano tutti da fare,
nessuno avviato.

**`PRENOTAZIONI_FASE2.md` — tabella "non ancora costruito" in testa al
documento è superata**. Il documento è datato "al 31/07/2026" in testa, ma
elenca ancora come "non costruiti" moduli 2.4 (Tassa di soggiorno) e 2.5
(Alloggiati Web) che risultano completati in sessioni successive (rispettivamente
01/08 e 13/08/2026, confermato in `DIARIO_SESSIONI.md`). La Parte D dello
stesso documento, più in basso, è stata invece tenuta aggiornata (nota
✅ "Conto ospite" del 14/08). Se consulti quel file, fidati della Parte D,
non della tabella riassuntiva iniziale.

**`RICERCA_ANAGRAFICA_CLIENTI_COMPETITOR.md` — l'intero documento è
superato**. Scritto il 14/08/2026 come "solo ricerca, nessuna proposta di
schema" (7 gap CRM identificati: duplicati, totale speso, tag, VIP/
blacklist, allergie legate all'anagrafica, promemoria compleanno,
segmentazione marketing). Tutti e 7 i punti sono stati **effettivamente
costruiti e testati entro 24-48h** dalla stessa ricerca (14-15/08/2026,
migration 037, 54/54 test verdi, confermato dal titolare). Il documento
non è mai stato aggiornato per dirlo — se lo leggi da solo sembra ancora
tutto da fare. Unica eccezione reale ancora aperta: l'invio automatico via
email del promemoriare compleanno (oggi solo lista in dashboard, l'email
è rimandata "dipende dai testi da scrivere").

**`DEPLOY_VPS_NETCUP.md` §10 — incoerenza interna sull'upgrade Next.js**.
Una frase nella stessa sezione dice l'upgrade a 16.3.0 "non fatto in
questa sessione, non bloccante", un'altra più sotto dice "✅ fatto e
verificato in produzione il 10/08/2026". La seconda è cronologicamente
successiva ed è quella corretta — l'upgrade risulta fatto.

**Deploy VPS Fase 1 — "chiusura" descritta in modo incoerente**.
`PIANO_MIGRAZIONE_DICEMBRE_2026.md` §2 dice ancora "resta da fare
l'audit di sicurezza prima di considerare la Fase 1 chiusa" — ma
`DIARIO_SESSIONI.md` mostra che l'audit è stato completato lo stesso
giorno (09/08/2026), solo più tardi nella sessione. Il paragrafo del Piano
non è mai stato riscritto dopo. **La Fase 1 è chiusa**, l'audit è fatto.

---

## 1. Bloccato su risposta esterna (mail inviate o da inviare, in attesa)

- **WuBook** (channel manager + booking engine) — mail inviata il
  10/08/2026 (`docs/RICHIESTA_WUBOOK.md`), **in attesa di risposta**. È il
  blocco più vecchio del progetto (Fase 0.1) — modulo 2.3 e tutto ciò che
  ne dipende (pagamenti online 3.3, booking engine 4.1, Net RevPAR, pace/
  pickup completo) resta fermo qui.
- **A-Cube** (corrispettivi elettronici, sostituisce il registratore Hugin
  RT-K50) — mail pronta in `docs/mail_acube_preventivo.md`, indirizzo
  corretto il 14/08 a `info@acubeapi.com` (il vecchio `sales@a-cube.io`
  usato in `DOMANDE_APERTE`/`PIANO_MIGRAZIONE` non è mai stato verificato
  come reale). **Non ancora inviata** — manca nome/telefono/email del
  titolare da completare, stesso identico blocco della mail RIMOVCLI sotto.
- **Regione Liguria — RIMOVCLI** — mail pronta in
  `docs/mail_statistiche_liguria.md`, **non ancora inviata** — stesso
  blocco (dati di contatto mancanti). Vedi sezione 0 sopra per il contesto.
- **LivelloUno** (trasferimento dominio `hoteldelgolfolerici.com`, oggi
  bloccato `clientTransferProhibited`/`clientUpdateProhibited`) — mail
  inviata, **in attesa di risposta**. Blocca in cascata: DNS del sito, GA4,
  Iubenda (tutti e tre dipendono dallo sblocco email aziendale che LivelloUno
  gestisce).
- **Nexi** — nessuna commissione per transazione pubblicata da nessuna
  parte, serve chiedere per iscritto prima di confrontare davvero i costi
  con Stripe (che invece pubblica: 1,5%+0,25€ SEE, 2,5%+0,25€ extra-SEE).
  **Non risulta ancora contattato.**
- **Commercialista** — quattro domande aperte in un colpo solo
  (`DOMANDE_APERTE_07-08-2026.md` §4): (a) A-Cube è davvero sostitutivo del
  registratore Hugin per la normativa attuale? (b) il piano Fatture in
  Cloud da 500€/anno pagato oggi non corrisponde a nessun piano del listino
  pubblico attuale — quale piano è realmente, va controllato sull'ultima
  fattura; (c) esiste un flusso di importazione automatica da Fatture in
  Cloud? (d) di chi è l'account Aruba Cloud legato alla P.IVA dell'hotel,
  mai identificato (07/08/2026, "da rivalutare tra 6 mesi o prima" se non
  risponde); (e) come funzionano contrattualmente gli straordinari per i
  dipendenti "a chiamata" (il report HR oggi scrive "N/D" invece di
  indovinare, per tua stessa richiesta).
- **ASL5 / consulente HACCP attuale** — chiarire se il ristorante ha
  bisogno di un vero "riconoscimento" CE 853/2004 oltre alla semplice SCIA
  di notifica — non deducibile dai documenti, serve una risposta esterna
  prima di decidere il modulo 6.1 avanzato.

## 2. In attesa di una tua decisione (nessun blocco tecnico)

- **Food cost teorico per piatto** (punto 6, ⏸️ 16/08/2026) — chi inserisce
  le grammature ricetta per ricetta? Analisi tecnica già fatta e pronta,
  vedi `EVOLUTIVE.md` riga 1399 — non c'è altro da capire, solo da
  decidere chi lo fa.
- **Impostazioni ▸ Report** — deciso oggi di NON crearla finché non serve
  un parametro configurabile reale (costo del personale per GOPPAR/CPOR,
  % commissione canale per Net RevPAR). Non è "in attesa": è una decisione
  già presa, riportata qui solo perché l'avevi chiesto di ragionarci.
- **Tariffe per canale/camera** — la tua richiesta originale ("serve un
  sistema che associa alla camera il prezzo") non è mai stata chiarita del
  tutto: intendevi prezzo differenziato per canale OTA, prezzo per singola
  camera fisica, o altro? Nessun piano possibile finché non si scioglie
  questo dubbio.
- **Ristorante — gestione conti aperti** — hai segnalato più volte che non
  è chiaro vedere il totale in euro di tutti i tavoli aperti insieme (oggi
  bisogna aprire ogni comanda singolarmente), ma hai detto anche di non
  esserti spiegato bene. Prossimo passo è una conversazione dedicata per
  capire cosa esattamente non funziona nell'uso reale, non una proposta
  tecnica al buio.
- **"Addebita a camera" nel flusso comanda normale** (non solo la griglia
  rapida bar/camera) — tecnicamente pronto da fare quando serve, oggi
  deprioritizzato. Nessun blocco, solo mai richiesto con urgenza.
- **Bottone "Addebiti extra"** — hai detto che "non è proprio comodo" così
  com'è, ma senza specificare cosa cambiare. Da riprendere capendo prima
  cosa non va.
- **Sensori HACCP (hardware)** — nessuna scelta fatta tra le opzioni
  valutate (Hanna Instruments HI144 senza abbonamento, vs. HaccpOK/
  Freeasy/Digitron/Testo Saveris/Selin Milano con abbonamento — attenzione
  al vincolo contrattuale 24 mesi di HaccpOK). Serve una decisione tua
  prima di comprare qualunque cosa.
- **A.4 (buffet) e A.6 (manutenzioni programmate HACCP)** — moduli
  costruiti come "in forse" (attivabili/disattivabili da Impostazioni ▸
  HACCP), in attesa che tu li confronti col piano HACCP reale dell'hotel
  e decida se tenerli attivi.
- **ESLint** — un bug reale in produzione (`risposta is not defined`) non
  sarebbe mai stato preso né da `tsc --noEmit` né da `esbuild` sui file
  `.jsx` — solo ESLint lo avrebbe intercettato. Nessuna nuova dipendenza
  installata senza prima discuterne con te (convenzione CLAUDE.md).
- **"Alert del giorno" (lista sotto la griglia widget)** — molto del suo
  contenuto è ormai duplicato nei widget dedicati. Non hai chiesto di
  toglierla, resta lì finché non decidi se accorciarla o eliminarla.
- **Riordino sidebar OSPITALITÀ/menu mobile** — provvisorio "a naso" da
  quando il progetto era più piccolo, da rivedere quando l'uso quotidiano
  sarà a regime.

## 3. Lavoro tecnico pronto da riprendere (nessun blocco, solo non fatto)

- Cron di scadenza automatica prenotazioni "Opzione" (24-48h senza
  conferma → 'interrotta').
- Creazione retroattiva della migration per la tabella `camere` (esiste in
  produzione, mai creata da una migration tracciata — stesso pattern già
  visto per `menu_categorie`/`menu_piatti`, risolto quello).
- Pulizia futura del modulo ZTL "Import TS" quando TeamSystem non servirà
  più (rimuovere bottone, switch, parsing Excel, tabella
  `configurazione_ztl` — annotato apposta in `EVOLUTIVE.md` riga 41 per
  non doverlo re-scoprire).
- Paginazione di `GET /api/gruppi` (oggi fisso a `LIMIT 30`, andrebbe bene
  finché i gruppi storici non superano quella soglia).
- Fix dello split automatico "ultima parola = cognome" per il referente di
  un gruppo (sbaglia con nomi composti/ragioni sociali) — non bloccante,
  il campo resta modificabile a mano.
- Uniformare i 40 file controller su una sola chiave di errore (`error`
  invece di un mix `errore`/`error`) — non urgente, il frontend gestisce
  già entrambe le forme.
- Unicità delle email nei file di test (oggi condivisa, mitigata con
  `--runInBand`, non risolta alla radice) — riemergerebbe solo se in
  futuro i test girassero in parallelo.

## 4. "Fatto" ma mai verificato dal vivo (UI reale o Postgres reale)

Voce utile perché in questo progetto "fatto" spesso significa "passa i
test automatici", non "verificato da un umano che lo guarda funzionare".
Elenco di cosa è in questa zona grigia oggi:

- Sincronizzazione SOAP reale con Alloggiati Web (`WS_ALLOGGIATI`) — mai
  testata con credenziali vere, solo simulata nei test.
- Le fasi D/A/B di Alloggiati Web Fase 2 (timestamp check-in, retry
  visibile, ricevute PDF) — verificate solo contro dati di test, non
  ancora "contro Postgres reale" da te.
- Le due modalità ZTL (Import TS vs "Sincronizza da Planning") — mai
  verificate in UI dopo il refactor del 15/08.
- L'intero modulo HACCP 6.1 (A.1-A.8) — verificato solo via API/test
  automatici in 4 sessioni, **mai visto in UI da te**.
- Soglie alert checklist HACCP (15:00 ambra, 22:00 rossa) — ipotesi non
  ancora confermata dall'uso reale.
- Calendario occupazione 30gg (dashboard) — aggregazione solo lato
  frontend, nessun test HTTP dedicato (il progetto non ha infrastruttura
  di test frontend).

## 5. Indicatori/KPI costi-ricavi — stato per singolo indicatore

| Indicatore | Stato | Blocco |
|---|---|---|
| ADR | ✅ costruito (16/08/2026) | nessuno |
| RevPAR | ✅ costruito (16/08/2026) | nessuno |
| TRevPAR | ✅ costruito, ma ricavo totale da fonte manuale | si aggiorna da solo quando WuBook/A-Cube saranno collegati |
| Occupazione su periodo storico | non costruito | nessun blocco tecnico, solo non fatto (punto 1 dei 9 di "Pagina Report") |
| Mix canali (diretto/OTA) | non costruito | dato già pronto (`prenotazioni.canale_origine`), solo da aggregare |
| Food cost teorico per piatto | ⏸️ in pausa | tua decisione su chi inserisce le grammature |
| GOPPAR / CPOR | non costruibile | manca qualunque dato di costo del personale in anagrafica |
| Net RevPAR | non costruibile | manca la % commissione per canale (arriva con WuBook) |
| Pace / Pickup | parziale (solo dirette) | completo solo con WuBook (prenotazioni OTA) |
| P&L semplificato | non costruibile in automatico | `incassi_giornalieri` non scorpora camere/ristorante |
| Demografia ospiti | non costruito | dato già raccolto per Alloggiati Web, solo da aggregare |

## 6. Deciso di NON fare (per ora) — esclusioni esplicite, non dimenticanze

- Riconciliazione automatica dell'incasso ristorante — impossibile finché
  il ristorante chiude sul registratore fisico Hugin, non integrato
  (arriverà con A-Cube, modulo 3.1).
- Retention/anonimizzazione automatica dei dati ospiti — non giustificata
  al volume attuale (20 camere).
- SMS/WhatsApp Business — richiedono un provider a pagamento, fuori dalla
  sequenza "gratis" seguita finora.
- Revenue management automatico (ricalcolo tariffe multiplo al giorno) —
  esplicitamente rimandato a una fase più ambiziosa (6.3), non nella
  roadmap attuale.
- Alert automatico "ROSS1000/export in sospeso" — rimandato a quando il
  gestionale sarà operativo con dati reali (dopo il deploy, che ora è
  fatto — da poter riconsiderare, ma nessuna richiesta esplicita finora).
