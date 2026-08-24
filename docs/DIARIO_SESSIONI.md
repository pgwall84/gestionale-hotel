# Diario sessioni — Hotel del Golfo Gestionale

Cronologia sessione-per-sessione del lavoro svolto: decisioni prese, bug
trovati e risolti, deviazioni dal piano originale. Spostato qui il 26/07/2026
dalla ex Sezione 16 di CLAUDE.md, che stava crescendo senza limite (era già
metà del file da 91KB) mescolando storia e spec permanente. CLAUDE.md resta
la fonte di verità per identità/stack/ruoli/convenzioni/roadmap; qui si
consulta solo quando serve capire *come* si è arrivati allo stato attuale o
*perché* è stata presa una decisione non ovvia dal codice.

Le evolutive/gap noti non urgenti sono in `docs/EVOLUTIVE.md`, non qui. Il
contratto API + schema DB + UI del modulo Prenotazioni è in
`docs/PRENOTAZIONI_FASE2.md`, non qui (questo file ne racconta solo la
cronologia).

---

## STATO AGGIORNATO AL 07/07/2026

### Modulo 1.6 — Ristorante: COMPLETATO ✅

Bug risolti in questa sessione:
- PATCH /comande/:id/chiudi non funzionava dopo migration 011 (tipo_chiusura)
  → causa reale: bug UI (bottom sheet chiusura renderizzato nella vista
    lista comande invece che nel dettaglio), non un bug del backend/migration
- Notifica "Tutto pronto" non arrivava al cameriere
  → tuttoProonto (comandeController.js) trasmetteva un evento aggregato
    senza dati; ora un evento riga_pronta per riga con payload completo
    (piatto_nome, tavolo_numero) — stesso formato di aggiornaStatoRiga
- Vista comanda cameriere: piatti già ordinati nascosti sotto il menu
  → redesign: sezione "Piatti ordinati"/"⚡ Da servire" in cima, menu
    "Aggiungi piatti" collassabile sotto, pulsante "Tutto servito" in batch
    (Promise.allSettled)
- Carrello/pulsante invio non raggiungibile senza scroll su telefono reale
  → causa reale: AppShell.tsx usava h-screen (100vh), non dinamico su mobile
    quando la barra indirizzi del browser si apre/chiude → risolto con
    h-[100dvh]
  → fix finale UX: pulsante "Invia (N)" spostato dal carrello al topbar
    (pattern Toast POS / Square); il carrello in basso resta solo
    header (contatore + totale) + righe piatti, più compatto
- Tab "Normale" nel bottom sheet chiusura ambigua per il cameriere
  (sembrava un pulsante d'azione invece che un selettore)
  → selettore tipo (Normale/Omaggio/Autoconsumo) visibile solo per
    titolare/admin; il cameriere vede un solo pulsante "Chiudi e incassa"
- Tap su tavolo occupato richiedeva un passaggio intermedio inutile
  → tavolo con righe: naviga direttamente alla comanda; tavolo occupato
    con comanda vuota: bottom sheet con "Aggiungi piatti"/"Libera tavolo"
- Badge piatti su mappa sala poco leggibili ("2✓"/"3")
  → testo esplicito "N pronti"/"N in corso"

### Note tecniche mobile

- Windows Firewall: nessuna regola in entrata per node.exe di default —
  serve una regola TCP 7000/7001 per essere raggiungibili da telefono in LAN
  (il server ascolta già su 0.0.0.0, il binding non è il problema).
- `h-screen` vs `h-[100dvh]`: su mobile la barra indirizzi del browser
  mostra/nasconde dinamicamente, cambiando l'altezza visibile reale.
  `100vh` non si aggiorna, `100dvh` sì — usare dvh per layout full-height
  su pagine ad uso mobile (cameriere/cucina/sala). AppShell.tsx ora usa
  h-[100dvh]; le pagine figlie possono restare su altezze percentuali
  (100%) relative al `<main>` di AppShell, senza bisogno di dvh anche lì.
- `allowedDevOrigins` in `frontend/next.config.ts`: Next.js aggiorna
  automaticamente questo campo quando rileva richieste dev da un nuovo IP
  LAN (es. il telefono cambia IP via DHCP) — è normale vederlo cambiare
  tra sessioni, non è un errore.

### Da verificare ancora (prima cosa da fare nella prossima sessione)

Verificare visivamente su telefono reale che il pulsante "Invia (N)" nel
topbar funzioni correttamente (tap, conteggio piatti, stato disabilitato
a carrello vuoto) — finora verificato solo in browser di anteprima desktop
a viewport fisso, non su un dispositivo reale con barra indirizzi dinamica.

### Test batteria moduli 0.1–0.5, 1.1–1.5 (esclude 1.6 Ristorante) — 08/07/2026

Generate ed eseguite batterie di test complete sui moduli già sviluppati (esclusi quelli
di ristorante su cui erano già stati fatti controlli approfonditi):
- Aggiunti tests/api/ospiti.test.js (Modulo 1.2 — note cucina, endpoint /api/hr/ospiti)
  e tests/api/audit.test.js (Modulo 0.2 — audit log, endpoint /api/audit), mancanti finora.
- Rieseguita l'intera suite: 7 test suite, 120 test verdi (auth, hr, camere, ztl, menu,
  ospiti, audit).

Bug di disallineamento trovati e corretti con **database/migrations/012_fix_ruoli_e_tabelle_audit.sql**:
- Il CHECK constraint su users.ruolo in 001_users.sql non includeva 'admin' e
  'portiere_notte' (solo 5 ruoli su 7 — shared/ruoli.js era già corretto con 7).
- Le tabelle audit_log e refresh_tokens (usate dal codice, elencate in CLAUDE.md sez. 6)
  non avevano nessuna migration dedicata — create in passato fuori dal flusso migration.
Migration 012 idempotente (DROP+ADD CONSTRAINT, CREATE TABLE IF NOT EXISTS con schema
esatto introspezionato dal DB reale), applicata in transazione, nessun dato toccato.
120/120 test riverificati verdi dopo l'applicazione. Commit: aad6a36.

### Modulo 1.7 — Magazzino: COMPLETATO ✅ (11/07/2026)

- Migration 013: aggiunto costo_unitario a movimenti_magazzino (nullable —
  serve solo per il calcolo food cost, non blocca la registrazione movimenti
  senza prezzo). Tabelle fornitori/prodotti/movimenti_magazzino esistevano
  già da 004_magazzino.sql, mai usate finora (0 righe).
- Permessi corretti rispetto al piano iniziale: lettura + movimenti
  (carico/scarico) = admin, titolare, cuoco, receptionist, portiere_notte
  (sezione 'magazzino' in shared/ruoli.js, ampliata da [A,T,P] a [A,T,K,R,P]);
  anagrafica prodotti/fornitori e food-cost = solo admin/titolare (soloTitolare).
  Aggiornati anche frontend/lib/ruoli.js (copia) e Sidebar.tsx (voci di menu
  desktop + bottom-nav mobile receptionist, entrambi hardcoded separatamente
  da shared/ruoli.js — occhio a questa duplicazione se si aggiungono sezioni).
- backend/controllers/magazzinoController.js: giacenza calcolata al volo
  (SUM carichi − SUM scarichi via LEFT JOIN, non un campo salvato) — niente
  disallineamenti da UPDATE dimenticati.
- Nuova dipendenza: html5-qrcode (nessuna libreria esistente scansiona QR/
  barcode da fotocamera; qrcode.react genera soltanto, tesseract.js fa OCR
  testo per ZTL).
- Pagina /magazzino/scansiona: due modalità (?modo=barcode per EAN → lookup
  Open Food Facts server-side → crea prodotto; ?modo=qr per scaffale →
  lookup prodotto → registra movimento), interamente autonoma, nessun
  passaggio dati via query string tra pagine.
- Pagina /magazzino-qr-stampa: stesso pattern di /menu-stampa (CSS print
  inline, pulsante no-print, window.print()) — il QR codifica il codice
  interno prodotti.qr_code, non un URL (letto solo dalla fotocamera
  dell'app stessa, non pensato per essere aperto da un telefono qualsiasi).
- 32 nuovi test (tests/api/magazzino.test.js) + 246 test totali verdi
  (tutte le suite, ristorante incluso).
- Verificato manualmente nel browser: creazione prodotto → registrazione
  consegna → giacenza aggiornata in lista, funziona end-to-end.
- Da verificare ancora: scansione fotocamera reale (html5-qrcode) su
  telefono — richiede permesso getUserMedia, testato finora solo il resto
  del flusso (form, salvataggio, giacenza), non lo scan vero e proprio.

### Modulo 1.8 — Dashboard KPI reali: COMPLETATO ✅ (11/07/2026)

- backend/controllers/dashboardController.js: kpi() (camere, coperti, incasso,
  food cost con confronto anno precedente), registraIncasso() (upsert su
  incassi_giornalieri, mancava completamente — nessun endpoint la scriveva),
  alert() esteso con sezione magazzino (giacenza sotto soglia).
- Camere: lo schema attuale (stato_camere) traccia solo arrivo/partenza/pronta
  del giorno, non un calendario occupazione (quello è Fase 2.2, non ancora
  costruito) — KPI rinominato onestamente "movimenti oggi" invece di fingere
  un'occupazione % che i dati non supportano.
- Food cost: mostrato in €/coperto (riusa la stessa logica di magazzino),
  non una % sul fatturato — richiederebbe incassi storici affidabili,
  oggi quasi sempre a 0. Nota aggiunta in docs/EVOLUTIVE.md come evolutiva.
- Coperti "hotel/esterni" del vecchio mock rimosso: ospiti_giornalieri non
  traccia questa distinzione, mostrato solo il totale reale.
- Rilevata (non corretta, per non spendere risorse extra) la stessa
  migration drift già vista con audit_log/refresh_tokens: stato_camere è
  usata dal modulo Camere ma non ha nessuna migration nei file versionati.
- 10 nuovi test (tests/api/dashboard.test.js), 256 test totali verdi.
- Non verificato nel browser in questa sessione (solo sintassi + test
  backend) per contenere il consumo di risorse — da controllare visivamente
  alla prossima occasione.

### Modulo HR — 4 miglioramenti: COMPLETATO ✅ (11/07/2026)

- Migration 014 (geolocalizzazione timbrature) + 015 (data_decisione assenze),
  applicate.
- timbra(): salva lat/lon/distanza opzionali (fidandosi della verifica lato
  client, nessuna validazione server-side della posizione).
- reportMensile(): aggiunta colonna Ritardi (entrata reale vs turno.ora_inizio,
  soglia 15 min) — riusa l'endpoint/pulsante Excel già esistenti (scoperto in
  fase di piano: Miglioramento 4 era già quasi completo, mancava solo questo).
- Griglia turni settimanale (Miglioramento 2): **era già completamente
  implementata** in TabTurni (personale/page.jsx) — righe/colonne, colori
  per tipo, click crea/modifica, navigazione settimana. Nessuna modifica.
- timbratura/page.jsx: Haversine pura + blocco raggio 50m dalle coordinate
  hotel, gestione permesso negato; se il GPS è indisponibile per altri motivi
  (timeout, browser non supportato) la timbratura NON viene bloccata —
  scelta deliberata per non impedire mai la timbratura per un problema
  tecnico transitorio.
- Riquadro "Ultime decisioni" in TabFerie (dipendente): ultimi 30 giorni,
  badge "NUOVO" se decisa nelle ultime 24h.
- 4 nuovi test in hr.test.js (geolocalizzazione persistita, data_decisione) —
  33/33 verdi isolati.

**Diagnosi corretta (16/07/2026):** la causa non è un pool PostgreSQL
condiviso come ipotizzato inizialmente — verificato che il file fallisce
in modo deterministico anche eseguito da solo. Causa reale: DATA_TEST
spostata da 2099-06-15 a 2099-11-23 nel commit del 12/07 (giorno dopo
questa nota), senza allineare DATA_ANNO_SCORSO di conseguenza — il
controller (dashboardController.js:116, logica invariata dall'origine)
cerca i dati 'anno scorso' su 2098-11-23, ma il test li inserisce su
2098-06-15. Bug nel dato fittizio del test, non nella logica applicativa.
Fix: allineare DATA_ANNO_SCORSO a 2098-11-23 in dashboard.test.js.
**Risolto (16/07/2026):** DATA_ANNO_SCORSO allineata a 2098-11-23.
dashboard.test.js 10/10 verdi da solo, suite completa 303/303 verdi.

### Modulo 1.9 — Archivio documentale: COMPLETATO ✅ (11/07/2026)

- Tabella archivio_documenti già esistente (006_archivio_incassi.sql),
  nessuna migration necessaria.
- backend/controllers/archivioController.js + routes/archivio.js: CRUD
  completo (lista con filtri tipo/data, upload multer, download, elimina)
  — stesso pattern di documentiController.js (documenti HR).
- Cartella uploads/archivio/ creata a mano (multer non la crea da sola).
- Permessi ampliati: sezione 'archivio' in shared/ruoli.js e
  frontend/lib/ruoli.js da [admin,titolare] a [admin,titolare,receptionist]
  — aggiornata anche Sidebar.tsx (voce hardcoded separata, stessa
  duplicazione già nota per magazzino).
- OneDrive Microsoft Graph: NON implementato ora, evolutiva futura dopo il
  deploy (serve accesso Azure AD aziendale) — storage su disco VPS per ora.
- 20 nuovi test (tests/api/archivio.test.js), 2 bug di test corretti in
  fase di sviluppo: file fixture con estensione .txt rifiutato dal
  fileFilter multer (solo pdf/jpeg/jpg/png), e un ECONNRESET quando si
  allega un file multipart a una richiesta destinata a un 403 (il server
  chiude la risposta prima di consumare lo stream) — risolto senza allegare
  file nei test di solo permesso.

### Modulo 1.11 — Sito web: COMPLETATO ✅ (progetto separato)

Sviluppato come repository indipendente (`sito-hotel`), non incluso in questo
repo. Stack, deploy (GitHub/Vercel/Sanity) e deviazioni dalla spec originale
documentati nel CLAUDE.md/SPEC_SITO_HOTEL.md di quel repository.

### Deploy VPS — stima costi Hetzner (15/07/2026)

In attesa di conferma costi col titolare. (Il file `STIMA_COSTI_DEPLOY_HETZNER.md`
citato in sessioni precedenti come "dettaglio completo" non è mai stato
effettivamente creato/commesso — questo paragrafo è il dettaglio completo
disponibile.)

Confronto rapido Hetzner vs DigitalOcean (stesso hardware: 2 vCPU, 4GB RAM):
- Hetzner CX22: ~€5,99/mese (~€72/anno) — 20TB traffico incluso, datacenter
  Germania/Finlandia
- DigitalOcean Basic Droplet: ~€22/mese (~€264/anno) — 4TB traffico incluso,
  datacenter Amsterdam

**Raccomandazione: Hetzner CX22** — risparmio netto ~€190/anno a fronte di
specifiche identiche, e il carico di lavoro (20 camere) resta ben entro le
capacità di entrambi.

Stima costo totale annuale: VPS ~€72 + Backblaze B2 (backup DB) ~€0-5 + SSL
Let's Encrypt €0 + snapshot VPS settimanale opzionale ~€14 = **~€75-90/anno**.

Backup DB automatico: cron notturno (pg_dump → gzip → upload rclone su
Backblaze B2), setup one-time (~30 min: bucket B2, install rclone, script
bash, cron), poi completamente automatico. Alternativa "zero setup": backup
gestiti Hetzner (+20% sul costo VPS, snapshot dell'intero server, meno
granulare del backup DB puntuale).

### Architettura Fase 2 — modulo Prenotazioni (15/07/2026)

Punto centrale emerso: **non esiste ancora un vero modulo Prenotazioni**.
"Camere" (Fase 1) ha solo anagrafica + stato giornaliero, non date
arrivo/partenza, dati ospite, tariffe. Tutta la Fase 2 (WuBook, pagamenti,
A-Cube, Alloggiati Web, tassa di soggiorno) deve agganciarsi a questo
modulo, che va costruito.

Flusso: Sorgenti prenotazioni (WuBook channel manager, WuBook booking
engine, reception) → **Prenotazioni** (nuovo, hub centrale) ↔ sync con
Camere (esistente) → Pagamenti (Nexi/Stripe via WuBook) + Adempimenti
fiscali (A-Cube, Alloggiati Web, tassa soggiorno) → Dashboard KPI
(esistente, da alimentare con nuovi dati).

**Ciclo di vita prenotazione (stati proposti):** Opzione (blocco
provvisorio, no pagamento) → Confermata (caparra incassata) → Check-in
(soggiorno in corso) → Check-out (camera liberata) → Chiusa (fatturata,
A-Cube emesso). Stato parallelo: Interrotta (no-show o cancellata, da
Confermata).

**Tre decisioni architetturali prioritarie (fissate prima di scrivere codice):**

1. **PCI scope zero** — il gestionale non deve mai vedere/memorizzare dati
   carta. Con l'integrazione WuBook (media pagamenti Nexi/Stripe) questo è
   probabilmente già garantito by design: il gestionale riceve solo l'esito
   via webhook. Attenzione a non aggiungere in futuro form di pagamento
   "fatti in casa".
2. **Sicurezza webhook** — verifica firma HMAC sui webhook in ingresso
   (WuBook, A-Cube) se supportata; in ogni caso `external_booking_id` come
   barriera anti-duplicazione. Loggare sempre il payload grezzo prima di
   processarlo, per poter rigiocare un evento in caso di problemi.
3. **Dati ospite GDPR-ready** — due basi giuridiche distinte, da NON confondere:
   - **Alloggiati Web / TULPS** (sicurezza pubblica): solo trasmissione, la
     struttura non deve conservare i dati oltre l'invio. La ricevuta di
     trasmissione (protocollo, data, esito) va conservata 5 anni — obbligo
     distinto e separato dall'anagrafica ospite.
   - **Finalità fiscale** (fatturazione/corrispettivi): consente di
     conservare l'anagrafica ospite collegata a documenti fiscali fino a 10
     anni. È la base giuridica che giustifica un'anagrafica ricca, non
     l'obbligo di sicurezza pubblica.
   - **Vietato sempre**, a prescindere dalla finalità: conservare foto o
     scansioni del documento d'identità. Chiarimento Garante Privacy del
     29/04/2026 (docweb 10244289): le strutture ricettive devono
     cancellare/distruggere qualsiasi copia del documento subito dopo
     l'invio ad Alloggiati Web. Solo dati testuali, mai immagini.
   - Se in futuro si costruisce CRM/marketing verso ospiti abituali, serve
     una terza base giuridica (consenso esplicito), separata dalle prime due.
   - Controllo di accesso a livello di campo (non solo di modulo): valutare
     se estendere i ruoli già presenti in HR ai campi sensibili
     dell'anagrafica ospiti (es. governante vede note allergie ma non dati
     fiscali completi).

**Omnitec — chiarito:** non è pre check-in da remoto, è gestione chiavi
magnetiche/accesso struttura. Le chiavi vengono sempre consegnate in
portineria da un receptionist. Nessun conflitto con l'obbligo di riscontro
visivo dell'ospite perché l'identificazione avviene comunque di persona al
banco.

### Viste UX Fase 2 — specifica separata (15/07/2026)

Mockup/UX su come si presenteranno le nuove viste — dettaglio completo
(quali parti fatte/non fatte) ora in `docs/PRENOTAZIONI_FASE2.md` Parte C/D.
Qui resta solo la cronologia: sessione di analisi UX del 15/07/2026 che ha
prodotto lo schema di massima (sidebar riorganizzata, griglia planning,
scheda Ospiti, Pulizie, Conto ospite, Report avanzati), con priorità
Prenotazioni+Ospiti prima di tutto il resto.

### Audit di sicurezza applicativa (15/07/2026)

Primo audit sistematico su gestionale-hotel (il sito web aveva già avuto un
audit separato: header, rate limiting, Dependabot). **Risultato: PULITO su
tutte e 4 le categorie principali.**

- **SQL injection**: ✅ nessuna vulnerabilità. Verificati 21 controller con
  `pool.query`, tutti i valori utente passano come parametri ($1,$2...),
  mai concatenati.
- **XSS**: ✅ nessuna vulnerabilità. Zero `dangerouslySetInnerHTML`/
  `innerHTML`/`eval` nel repo, tutto renderizzato via JSX con escape
  automatico React (verificato in particolare menu pubblico QR e note cucina).
- **IDOR**: ✅ nessuna vulnerabilità. Timbrature derivano sempre l'utente da
  JWT (`req.utente.id`), mai da parametro URL. Documenti hanno controllo
  ownership esplicito. Endpoint sensibili ristretti per ruolo.
- **Rate limiting login**: ✅ già presente (`backend/app.js:43-54`), max 5
  tentativi/15 min per IP con express-rate-limit.

**Corretto in questa sessione:**
- Autorizzazione debole menu toggle: `PATCH /api/menu/piatti/:id/toggle`
  ora richiede ruolo admin/titolare/cuoco/cameriere (prima bastava un token
  valido di qualsiasi ruolo). Test suite `menu.test.js` 20/20 passata.
- Gap di copertura test chiuso il 16/07/2026: aggiunto test negativo
  (`receptionist → 403`) sul toggle sopra, che prima non aveva un caso che
  verificasse il blocco dei ruoli esclusi. Test suite `menu.test.js` 21/21 passata.

**Chiuso in questa sessione:**
- Security header: applicati in `backend/app.js:29-34`. HSTS rafforzato a
  `max-age=63072000; includeSubDomains; preload` (⚠️ da rivedere:
  `includeSubDomains`+`preload` richiede che TUTTI i sottodomini di
  hoteldelgolfolerici.com servano sempre HTTPS senza eccezioni — verificare
  quando il dominio torna sotto controllo diretto, nel dubbio togliere
  `preload` che comunque non ha effetto finché non sottomesso
  manualmente). CSP, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy confermati via curl, zero regressioni.
- CORS: verificato già corretto, nessuna modifica al codice necessaria.
  Aggiunta `FRONTEND_URL` a `backend/.env.example` come promemoria
  obbligatorio per il deploy.
- Backup cifrati B2: da applicare al Modulo 1.10 (il bucket non esiste
  ancora). Procedura: Console B2 → Bucket Settings → Encryption → attivare
  Server-Side Encryption (SSE-B2, gestita da Backblaze, nessuna chiave da
  custodire). Automatico su ogni upload, nessuna modifica a
  `backup-db.sh` richiesta.

**Falso allarme verificato e chiuso:** file `frontend/AGENTS.md` — è una
funzionalità ufficiale di Next.js 16.2+ (annunciata 18/03/2026):
`create-next-app` include di default un AGENTS.md che punta alla
documentazione bundlata in `node_modules/next/dist/docs/`, per evitare che
gli assistenti AI scrivano codice con pattern di training obsoleti.
Origine: commit `fbd4164` (02/07/2026), conversione di `frontend` da
submodule a cartella normale. Nessuna azione necessaria. (Lo stesso file
esiste anche nella root di `sito-hotel` per lo stesso motivo — vedi nota
26/07/2026 più sotto.)

**Processo di sicurezza continuativo — non un controllo una tantum.** Ogni
nuovo modulo riapre le stesse categorie di rischio (SQLi, XSS, IDOR,
autorizzazione). Checkpoint da ricordare nel ciclo di vita del progetto:

1. Automatico e continuo: Dependabot/npm audit sulle dipendenze — da
   attivare anche su gestionale-hotel (oggi presente solo sul sito web),
   gira da solo senza sessioni dedicate.
2. Ad ogni nuovo modulo che tocca dati sensibili o soldi: mini-review
   mirata su autorizzazione (IDOR) e validazione input. In Fase 2 vale
   soprattutto per Prenotazioni, Pagamenti, ricezione webhook — è terreno
   nuovo, più facile introdurre un buco.
3. ⚠️ **Prima del deploy in produzione (Modulo 1.10)**: ripetere l'audit
   completo (SQLi, XSS, IDOR, rate limiting, header, CORS, backup) come
   ultimo checkpoint. Motivo: oggi il gestionale è raggiungibile solo dalla
   LAN dell'hotel (rischio basso), dopo il deploy sarà raggiungibile da
   internet (rischio reale) — stesso codice, esposizione completamente
   diversa. Va rifatto anche se nel frattempo il codice non è cambiato.
4. Dopo modifiche a codice sensibile: login, gestione permessi, logica di
   pagamento — controllo mirato su quella parte specifica dopo ogni modifica.
5. Periodico post go-live: audit completo ogni pochi mesi, o dopo
   aggiornamenti importanti di Next.js/Express/PostgreSQL (le versioni
   nuove possono cambiare comportamenti di sicurezza di default — vedi il
   caso AGENTS.md sopra).
6. Eventi specifici: cambio staff con accesso al sistema (revocare
   credenziali), sospetto incidente, nuova normativa che tocca i dati
   trattati (es. i chiarimenti Garante Privacy di aprile 2026 su documenti
   ospiti).

**Da affrontare prima del go-live Fase 2:**
- Scadenza automatica prenotazioni "Opzione": entro 24-48h se non
  confermate, previene sia abusi (esaurimento inventario) sia problemi
  operativi.
- Bot protection sui form pubblici: honeypot o captcha leggero (es.
  Cloudflare Turnstile, gratuito) su form convenzione lavoro e altri form
  pubblici del sito quando diventeranno form veri.
- Dependency scanning: attivare Dependabot anche su gestionale-hotel (già
  presente sul sito web).

**Bassa priorità per la scala attuale (da tenere a mente, non urgente):**
rotazione periodica secret (JWT, chiavi API), audit log dettagliato azioni
sensibili (utile se cresce lo staff), resistenza a spoofing GPS nelle
timbrature HR.

### Migration 017 — vincolo anti-overbooking, gruppi prenotazione, piano camere: COMPLETATA ✅ (16/07/2026)

- Vincolo `EXCLUDE USING gist` (estensione `btree_gist`) su `soggiorni`:
  impedisce a livello DB due soggiorni non cancellati sulla stessa camera
  con date sovrapposte. Verifica preventiva di overlap eseguita prima
  dell'ALTER, nessun conflitto trovato.
- `soggiorni.cancellato` (bool) — REGOLA OBBLIGATORIA per i controller
  futuri: quando una prenotazione passa a `interrotta`, impostare
  `cancellato = true` su tutti i suoi soggiorni nella stessa transazione,
  altrimenti il vincolo blocca quella camera/date per sempre.
- Nuova tabella `gruppi_prenotazione` + `prenotazioni.gruppo_id`.
- `pagamenti.prenotazione_id` reso nullable + `gruppo_id` + CHECK XOR.
- `camere.piano` aggiunta per raggruppamento visivo nella vista griglia.
- File: `database/migrations/017_overbooking_gruppi_piano.sql`. Dettagli
  architetturali completi ora in `docs/PRENOTAZIONI_FASE2.md`.

### Modulo Ospiti — anagrafica Fase 2 (26/07/2026: contratto consolidato in docs/PRENOTAZIONI_FASE2.md Parte A.1/B.1): COMPLETATO ✅ (16/07/2026)

23/23 test verdi (`tests/api/anagrafica-ospiti.test.js`).

- File: `backend/controllers/anagraficaOspitiController.js`,
  `backend/routes/ospiti.js` (mount `/api/ospiti` in `app.js`).
- Nome file deliberatamente diverso da `ospitiController.js` esistente
  (Modulo 1.2, note cucina, dominio completamente diverso).
- `shared/ruoli.js`: la voce `ospiti` è un oggetto per azione (lettura/
  scrittura/svela_documento), non un array flat. Nuova funzione
  `puoCompiereAzione(ruolo, sezione, azione)` + middleware `richiedeAzione`.
- `documento_numero` mai in chiaro fuori da `svela-documento`: le query di
  lista/dettaglio/crea/aggiorna non selezionano mai la colonna grezza,
  costruiscono `documento_mascherato` lato SQL. Solo `svelaDocumento` legge
  la colonna reale e scrive sempre in `audit_log`.

### Modulo Prenotazioni — Sezione 2 API: COMPLETATO ✅ (16/07/2026)

26/26 test verdi, suite completa 329/329.

- File: `backend/controllers/prenotazioniController.js`,
  `backend/routes/prenotazioni.js`, `tests/api/prenotazioni.test.js`.
- Caso speciale portiere_notte (lettura piena + sola transizione verso
  `check_in`): middleware dedicato `richiedeTransizioneStato`, non il
  generico `richiedeAzione`, perché dipende dal *valore* di `stato` nel body.
- State machine tradotta come mappa/oggetto nel controller.
- Transizione verso `interrotta`: `UPDATE soggiorni SET cancellato=true`
  nella STESSA transazione dell'UPDATE su `prenotazioni`.
- Violazione vincolo anti-overbooking (codice Postgres `23P01`) tradotta
  in `409`, non `500` generico.
- `GET /api/prenotazioni/griglia` esclude sempre `soggiorni.cancellato=true`.

### Modulo Soggiorni + Soggiorno_ospiti — Sezioni 3-4 API: COMPLETATO ✅ (16/07/2026)

25 test nuovi, 354/354 sull'intera suite.

- 5 endpoint: `POST /api/prenotazioni/:id/soggiorni`, `PATCH /api/soggiorni/:id`,
  `GET/POST /api/soggiorni/:id/ospiti`, `DELETE /api/soggiorni/:id/ospiti/:ospiteId`.
- Helper 409 estratto in `backend/utils/erroriDb.js` (`gestisciConflittoCamera`),
  riusato da 3 controller invece di essere inline solo in uno.
- Vincolo "esattamente un capofamiglia/singolo/capogruppo per soggiorno"
  verificato con `SELECT ... FOR UPDATE` dentro la transazione, sia
  aggiungendo un secondo intestatario sia rimuovendo l'unico presente.

### Modulo Gruppi + Pagamenti — Sezioni 5-6 API: COMPLETATO ✅ (16/07/2026)

37 test nuovi, 391/391 sull'intera suite.

- 7 endpoint (gruppi + pagamenti su prenotazione/gruppo).
- `pagamentiController.js` unico riusato da `routes/prenotazioni.js` e
  `routes/gruppi.js`, ognuna delle 4 funzioni valorizza solo il campo id
  giusto (mai entrambi), rispettando il CHECK XOR prima ancora che il DB lo
  scopra.
- `GET /api/gruppi/:id` restituisce due somme distinte (addebiti/pagamenti),
  nessun saldo netto precalcolato — lasciato al frontend.

### Sessione 5 — Vista griglia planning camere: COMPLETATO ✅ (17/07/2026)

- Parte 1: popolamento `camere.piano` — numerazione reale 1-21 (manca il
  17) + unità `'app'`, diversa da quella assunta nel contratto originale
  (che assumeva 101-121+A1). Deciso con l'utente: bande automatiche da 5.
- Parte 2: `frontend/app/planning-camere/page.jsx` (non `/prenotazioni-
  camere`, per non confliggere col prefisso di `/prenotazioni` esistente
  del ristorante). Libreria drag-and-drop: `@dnd-kit/core`.
- `prenotazioniController.griglia()`: cambiata da `JOIN` a `LEFT JOIN` da
  `camere`, per mostrare anche le camere libere (righe della griglia).
- Bug preesistente corretto in `frontend/lib/api.js`: leggeva `json?.errore`
  invece di `json?.error` — da quando esiste il file, `err.message` è
  sempre stato un generico "Errore 400/409/500", mai il messaggio specifico
  del controller, in **13 pagine** del gestionale. Impatto e pagine
  coinvolte: vedi `docs/EVOLUTIVE.md`.
- Verifica: sessione interattiva nel browser + `tests/e2e/planning-camere.spec.js`
  (3 test Playwright verdi). Bug preesistente scoperto in `login.spec.js`
  (non corretto, fuori scope — vedi `docs/EVOLUTIVE.md`).

### Sessione 6 e seguito — Nuova prenotazione + azioni di stato in griglia: COMPLETATO ✅ (17/07/2026)

**Nota di riconciliazione (26/07/2026)**: questi 4 commit erano già stati
fatti e CLAUDE.md era già stato aggiornato (in Sezione 14/Evolutive, con
note puntuali per ciascuno) ma non erano mai stati raccontati per intero
qui nel diario — la sezione "Prossimo step" della sessione precedente
parlava ancora di "tutte le 5 sessioni completate" senza menzionare questo
lavoro aggiuntivo. Aggiunto ora per chiarezza, nessun codice cambiato in
questa riconciliazione.

- `feat: form nuova prenotazione (Fase 2, Sessione 6)` (commit `62317a9`) —
  due punti d'ingresso (pulsante + click su cella vuota), autocomplete
  ospite con mini-form "+ Nuovo ospite", gestione 409 col form che resta
  aperto. Dettaglio contratto ora in `docs/PRENOTAZIONI_FASE2.md` Parte C.
- `feat: pulsante annulla prenotazione` (commit `bee01ed`) — visibile solo
  per `opzione`/`confermata`, admin/titolare/receptionist, conferma
  esplicita prima del PATCH.
- `feat: pulsante check-out` (commit `99dfa83`) — visibile solo per
  `check_in`, admin/titolare/receptionist (portiere_notte escluso, a
  differenza del check-in), nessuna conferma richiesta.
- `feat: pulsante conferma prenotazione` (commit `e04ab35`) — visibile solo
  per `opzione`, stessi permessi delle altre transizioni. Nessuna
  validazione di prerequisiti (caparra/documento).

Tutte le 5 sessioni del contratto API/frontend Prenotazioni originario, più
questo lavoro di rifinitura UI, sono complete. Il modulo Prenotazioni ha
oggi CRUD completo, state machine, griglia planning con drag-and-drop e
tutte le transizioni di stato azionabili da UI.

### Prossimo step (stato al 26/07/2026)

Fase 1 quasi completa — **unico step rimasto: Modulo 1.10 — Deploy VPS**
(Nginx, PM2, SSL, backup automatico) su Hetzner CX22 (~€75-90/anno, vedi
sopra), per gestionale + sito sulla stessa macchina. Prima del deploy,
ripetere l'audit di sicurezza completo (vedi "Processo di sicurezza
continuativo" sopra, punto 3).

Per la Fase 2A: CRUD+state machine+UI del modulo Prenotazioni sono
completi (vedi sopra). Prossimo passo concreto: tariffe/stagionalità/
pacchetti all-inclusive (completamento modulo 2.2, non ancora ✅ in CLAUDE.md
Sezione 8) oppure modulo 2.3 (integrazione WuBook/WooDoo) — da decidere con
l'utente all'inizio della prossima sessione.

### Istruzioni per sessioni efficienti (ridurre consumo token)

1. Ogni sessione ha UN solo obiettivo
2. Messaggi brevi e specifici — no conversazioni lunghe
3. Specificare sempre il file e la funzione esatta
4. Usare sempre il formato plan-then-execute
5. A fine sessione: aggiornare CLAUDE.md/diario + commit + push

### Primo messaggio per la prossima sessione

"Leggi CLAUDE.md. Obiettivo: [una cosa sola].
Piano in 5 righe, attendi conferma."

---

## 26/07/2026 — Razionalizzazione documentazione

Su richiesta dell'utente, riorganizzata la documentazione di entrambi i
repository (gestionale-hotel e sito-hotel), diventata pesante e in parte
duplicata dopo circa due settimane di sessioni:

- Eliminata cartella `verifica/` (non tracciata da git — scratch/bozze di
  sessioni precedenti, già superate dal contenuto in CLAUDE.md) e la copia
  non tracciata di `docs/SPEC_SITO_HOTEL.md` (stale, mancava delle sezioni
  15-17 presenti solo nell'originale nel repo `sito-hotel`).
- Consolidati i 5 contratti Fase2 (`API_PRENOTAZIONI_FASE2.md`,
  `SCHEMA_PRENOTAZIONI_FASE2.md`, `MOCKUP_VISTE_FASE2.md`,
  `FRONTEND_GRIGLIA_FASE2.md`, `FRONTEND_NUOVA_PRENOTAZIONE_FASE2.md`, tutti
  ormai "storia" perché implementati) in un unico `docs/PRENOTAZIONI_FASE2.md`
  con stato implementato/non implementato esplicito. Aggiornati i commenti
  nei file backend che citavano i vecchi nomi file (10 file: controller,
  routes, `shared/ruoli.js`) — non toccate le migration 016/017 (immutabili
  per convenzione).
- CLAUDE.md diviso in tre: la spec permanente resta in CLAUDE.md, la
  cronologia sessione-per-sessione (questo file) e il backlog di gap noti
  (`docs/EVOLUTIVE.md`) vivono altrove — CLAUDE.md torna leggero da rileggere
  ad ogni sessione.
- `sito-hotel/CLAUDE.md` (che conteneva solo `@AGENTS.md`, puntando a un file
  generato automaticamente da Next.js e non correlato al progetto) sostituito
  con istruzioni reali che rimandano a `SPEC_SITO_HOTEL.md` come fonte di
  verità.

---

## 31/07/2026 — Modulo 2.2: Tariffe, stagionalità e pacchetti — COMPLETATO ✅

Scritto interamente in una sessione Cowork (senza accesso diretto a Postgres
locale), poi migration/test/verifica eseguiti dall'utente in locale.

**Decisioni prese con l'utente prima di scrivere codice:**
- Tariffe per **tipo camera** (nuova tabella `tipi_camera`, non un campo
  `VARCHAR` libero su `camere`) e non per singola camera — così restano
  scalabili anche in vista della mappatura OTA del modulo 2.3. Le 5
  categorie concordate: Singola, Doppia uso singola, Matrimoniale, Tripla,
  Quadrupla.
- `soggiorni.tariffa_totale` diventa **calcolo automatico + override**: il
  form "Nuova prenotazione" precompila il totale sommando `tariffe.
  prezzo_notte` notte per notte, ma resta sempre modificabile a mano.
- Pacchetti = **prezzo fisso indipendente** dal calcolo per notte (es.
  "Weekend Relax 2 notti" a 250€ tutto compreso), non un supplemento a
  notte/persona.
- Mappatura vera con le categorie OTA (Booking/Airbnb) rimandata al modulo
  2.3: `tipi_camera.note` è solo un appunto manuale nel frattempo.

**Cosa è stato scritto** (dettaglio contratto in `docs/PRENOTAZIONI_FASE2.md`
Parte A.7-A.10 e B.10-B.12): migration `018_tariffe_pacchetti.sql`
(`tipi_camera` con seed, `tariffe` con `EXCLUDE USING gist` anti-
sovrapposizione, `pacchetti`, `soggiorni.pacchetto_id`); controller+route
per i 3 moduli nuovi; endpoint `PATCH /api/camere/:id/tipo` per assegnare la
categoria; permessi in `shared/ruoli.js` (lettura admin/titolare/
receptionist, scrittura solo admin/titolare, coerente con `pagamenti`);
pagine frontend `/tariffe` e `/pacchetti`; form "Nuova prenotazione" esteso
con selettore pacchetto e auto-calcolo tariffa (sovrascrive il campo solo se
vuoto o invariato dall'ultimo auto-calcolo, mai se l'utente lo ha corretto a
mano).

**Blocco imprevisto e come è stato risolto**: `tests/agent/genera-test.js`
usa l'API Claude per *scrivere* i test, ma non per *eseguirli* — con il
credito Anthropic in `backend/.env` esaurito (`400 credit balance too low`),
lo script era bloccato. Scritti a mano `tests/api/tipiCamera.test.js`,
`tests/api/tariffe.test.js`, `tests/api/pacchetti.test.js` + un'estensione a
`tests/api/camere.test.js` (stesso pattern Jest+Supertest+JWT firmati degli
altri moduli Fase 2, nessuna chiamata API esterna, nessuna dipendenza dal
credito). Da notare: i test usano `authHeader.*` (JWT firmati direttamente,
niente lookup DB) — l'utente receptionist temporaneo creato dall'utente per
la verifica manuale in UI (poi disattivato, non eliminato per il vincolo FK
da `audit_log`) non serviva per i test automatici, solo per il login reale.

**Verifica**: migration eseguita senza errori, schema confermato via `\d`.
74 test automatici verdi su 4 suite (`tipiCamera`, `tariffe`, `pacchetti`,
`camere` esteso) — copertura 401/403/400/404/200/201/204, vincolo
anti-sovrapposizione (409) su `tariffe`, blocco `409` su `DELETE
/tipi-camera/:id` se referenziata, toggle `attivo` sui pacchetti. Warning
Jest "worker process failed to exit gracefully" con `--forceExit` su più
file insieme — non un fallimento (0 test falliti), coerente con lo stesso
comportamento già visto su altre suite multi-file di questo progetto.
Verifica manuale end-to-end in UI: categorie assegnate a 3 camere reali,
fascia tariffaria creata, vincolo anti-sovrapposizione confermato via UI,
auto-calcolo tariffa nel form (150€/notte × 2 notti = 300€), override da
pacchetto (300→250€), permessi receptionist confermati sia in UI che sui 4
endpoint di scrittura via token diretto.

**Non incluso in questa sessione** (evolutiva separata, vedi
`docs/EVOLUTIVE.md`): il drag-and-drop della griglia planning non ricalcola
la tariffa quando si sposta una prenotazione — resta manuale come prima del
modulo 2.2.

### Prossimo step

Fase 2A: **2.3 — Integrazione WuBook/WooDoo** (channel manager OTA) è il
prossimo modulo naturale — includerà anche la vera mappatura
`tipi_camera.id ↔ canale ↔ codice_esterno` (oggi solo un appunto manuale in
`tipi_camera.note`). Da confermare con l'utente a inizio sessione. Resta
anche aperto, indipendentemente, il modulo 1.10 (deploy VPS, Fase 1).

---

## 31/07/2026 — 4 fix: Stato Camere (modulo 1.3) + Planning — COMPLETATO ✅

Stessa giornata del modulo 2.2, sessione separata: 4 richieste puntuali
dell'utente su Camere/Planning, due delle quali erano bug reali diagnosticati
da codice (non riprodotti in prima persona — nessun accesso a Postgres/
browser locali da questa sessione Cowork).

**1 — Sidebar**: voce `/camere` spostata da RISTORANTE a OSPITALITÀ (in
fondo, dopo Prenotazioni/Tariffe/Pacchetti), rinominata "Camere" → "Stato
Camere". Aggiunto `receptionist` ai ruoli (mancava del tutto). Esteso anche
il permesso di scrittura reale: `POST /api/camere/stato` (fermata/partenza/
note) passava da `soloTitolare` a una nuova sezione `camere.scrittura` in
`shared/ruoli.js` = admin/titolare/receptionist/portiere_notte. Cameriere
resta limitato a "segna pronta" (`POST /api/camere/pronta`), invariato.

**2 — Scopetta nel planning**: in ogni riga camera di `/planning-camere`,
icona `BrushCleaning` (lucide-react) accanto al nome — rossa se non pronta,
verde se pronta, sempre riferita a **oggi** (non alla data del range
visualizzato in griglia, che può essere qualunque cosa). Icona `StickyNote`
accanto, solo se c'è una nota. Click apre un popup nuovo (`PopupStatoCamera`)
con le stesse funzionalità della pagina Stato Camere: fermata/partenza/
pronta/note. Stato di oggi caricato una volta all'apertura pagina via
`GET /api/camere?data=oggi`, indipendente dal range/giorni visualizzati.

**3 — Bordo colonna mancante (bug reale)**: diagnosi da codice, non da
screenshot. L'header dei giorni usava `border-l` per colonna, il corpo della
griglia (`RigaCamera`) usava `border-r` — combaciano sulla stessa linea per
tutte le colonne interne, ma nessuno dei due disegna il bordo tra la colonna
"Camera N" e il **primo** giorno visibile (l'header ce l'avrebbe con
`border-l` sulla prima colonna giorno, ma quel bordo non esiste nel corpo).
Dato che la vista parte da oggi di default, il giorno "senza confine visibile
rispetto alle camere" segnalato dall'utente era sempre il primo — che quel
giorno era "Ven 31". Fix: `border-r` aggiunto alla cella nome-camera e alla
cella d'angolo dell'header.

**4 — Pulsante avanti rotto in Stato Camere (bug reale)**: diagnosi
guidata da due domande di chiarimento invece di un fix a tentativi (nessun
accesso diretto per riprodurlo). Causa: `spostaGiorno` e il calcolo di `oggi`
usavano `new Date(...).toISOString().split('T')[0]` — conversione in UTC che
in Italia (UTC+2 d'estate) fa perdere un giorno ad ogni chiamata. Netto per
click: avanti richiede +1, ne perde 1 in conversione → 0 (**"non cambia
nulla"**, confermato dall'utente); indietro richiede −1, ne perde un altro
1 → −2 (**"va indietro di 2gg in 2gg"**, confermato dall'utente) — le due
risposte alle domande di chiarimento hanno combaciato esattamente con
l'ipotesi prima di scrivere qualunque fix. Corretto con la stessa aritmetica
locale (anno/mese/giorno, mai `toISOString()`) già usata in
`spostaData()` di `planning-camere/page.jsx`. Lo stesso identico bug esisteva
anche nella funzione `oggi()` di `planning-camere/page.jsx` (usata per
l'evidenziazione ambra del giorno corrente nell'header) — corretto anche
lì per coerenza, stessa causa del fix #3.

**Verifica**: `tsc --noEmit` sull'intero frontend e `node --check` su tutti
i file backend toccati, entrambi puliti, eseguiti da questa sessione prima
della consegna. Test automatici eseguiti dall'utente in locale: 23 test
verdi su `tests/api/camere.test.js` (inclusi i 2 nuovi per il permesso
esteso a receptionist/portiere_notte). Verifica visiva in UI non ancora
confermata esplicitamente dall'utente in questa sessione — se emergono
scostamenti (in particolare sul posizionamento della scopetta o sul
popup), riprendere da qui.

**Nota tecnica per il futuro**: `new Date().toISOString().split('T')[0]`
per ottenere "la data di oggi in formato locale" è un pattern da evitare
ovunque nel gestionale — converte sempre in UTC, e in Italia (UTC+1/+2)
perde sistematicamente un giorno nelle prime ore di ogni giornata (o lo
guadagna, a seconda del verso). Pattern sicuro già in uso in più file:
costruire/leggere `Date` sempre con anno/mese/giorno locali
(`new Date(y, m-1, g)`, `.getFullYear()/.getMonth()/.getDate()`), mai
`toISOString()` per derivare una data di calendario locale.

### Seguito stesso giorno — 2 fix aggiuntivi al planning

- **Colonne a larghezza dinamica**: la griglia planning aveva colonne giorno
  a larghezza fissa (56px), lasciando una fascia vuota a destra in vista
  7gg/14gg su schermi larghi.
  - Primo tentativo: misurare la larghezza reale del contenitore
    (`ResizeObserver`) e calcolare in JS una larghezza px da applicare sia al
    grid sia al delta del drag-and-drop. **Verificato con screenshot
    dell'utente: non funzionava** — la griglia continuava a non riempire lo
    spazio (causa non isolata con certezza, verosimilmente un problema di
    timing tra misura e render, o il contenitore misurato non corrispondeva
    alla larghezza realmente disponibile).
  - Fix corretto: sostituito con `minmax(LARGHEZZA_COLONNA_MIN, 1fr)` nativo
    di CSS Grid — le colonne si allargano da sole per riempire lo spazio
    disponibile (7gg/14gg), restano al minimo e scrollano se non basta
    (mese), tutto gestito dal browser senza JS. Il calcolo del delta
    drag-and-drop (`handleDragEnd`), che prima leggeva la stessa costante
    fissa usata per il CSS, ora legge la larghezza REALE della prima colonna
    dal DOM (`primaColonnaRef.current.offsetWidth`) nel momento del rilascio
    — sempre allineato a quello che il browser ha davvero disegnato, qualunque
    esso sia.
- **Indicazione mese/anno**: non compariva da nessuna parte (solo "ven 31 –
  gio 6" senza mese). Aggiunta etichetta sopra il range giorno/giorno, es.
  "Luglio 2026" o "Luglio - Agosto 2026" se il periodo attraversa due mesi.
  Non usata la Topbar (`sottotitolo`) perché nascosta sotto i 768px — inserita
  direttamente nel contenuto pagina, visibile anche su mobile/tablet.

Verifica: `tsc --noEmit` sull'intero frontend, 0 errori (rieseguito dopo la
correzione). Verifica visiva della versione corretta (minmax/1fr) non ancora
confermata dall'utente — lo screenshot che ha portato alla correzione era
sulla versione precedente (ResizeObserver).

### Seguito stesso giorno — vista Mese: colonne più strette per stare tutte

Confermata via screenshot la versione minmax/1fr per 7gg/14gg. Richiesta
successiva: estendere lo stesso principio ("riempire lo spazio") alla vista
Mese, ma nella direzione opposta — stringere ulteriormente, non allargare,
perché con 28-31 colonne il minimo di 56px usato per 7gg/14gg (56×31 ≈
1736px) supera quasi sempre la larghezza utile e costringe comunque allo
scroll orizzontale.

- Aggiunta `LARGHEZZA_COLONNA_MIN_MESE = 32` (px), usata solo quando
  `rangeModo === 'mese'` al posto di `LARGHEZZA_COLONNA_MIN` (56px, invariato
  per 7gg/14gg) — sia nel grid esterno sia nel grid interno di `RigaCamera`
  (ora riceve `larghezzaColonnaMin` come prop invece della costante fissa).
  Il fallback nel calcolo del delta drag-and-drop (`handleDragEnd`) usa la
  stessa variabile dinamica.
- A 32px il testo "gio 30" dell'header colonna non ci sta leggibile: in
  vista Mese l'header mostra solo il numero del giorno (`formatGiornoBreve`
  ha un secondo parametro `soloNumero`), il giorno della settimana resta
  solo nel range testuale in alto (che ora mostra comunque mese/anno).

Verifica: parse sintattico via Babel (`next/babel` preset) sul file, nessun
errore. Verifica visiva in vista Mese non ancora confermata dall'utente.

### Seguito stesso giorno — 3 fix da EVOLUTIVE.md (sessioni precedenti)

Chiusura sessione: richiesti 3 fix già presenti nel backlog. **Il fix del
ricalcolo tariffa su drag-and-drop (proposto nel piano di questa sessione)
è stato esplicitamente SOSPESO dal titolare** — va prima deciso come
comportarsi quando lo spostamento avviene tra camere di tipologia/dimensione
diversa (vedi nota aggiornata in EVOLUTIVE.md, sezione Modulo 2.2). Fatti
solo i 3 seguenti:

1. **`backend/controllers/camereController.js`** — `lista()` e `oggi()`
   usavano `CASE WHEN numero='app' THEN 999 ELSE CAST(numero AS INTEGER) END`
   nell'ORDER BY: qualunque valore non numerico diverso da `'app'` rompeva
   la query con 500. Sostituito con lo stesso pattern già in uso in
   `prenotazioniController.js` (griglia): `CASE WHEN numero ~ '^\d+$' THEN
   numero::INTEGER ELSE 999999 END` — mai un CAST che possa fallire.
   Aggiunto test di regressione in `tests/api/camere.test.js` (camera con
   `numero` non numerico, verifica 200 invece di 500).

2. **`frontend/app/login/page.jsx`** — leggeva `err?.response?.data?.errore`
   (chiave italiana) invece di `.error` (inglese, tutti i controller
   rispondono così): un login fallito per password errata mostrava sempre
   il fallback generico "Errore di connessione. Riprova." invece del
   motivo reale restituito dal backend. Stessa famiglia di bug già corretta
   il 17/07/2026 in `frontend/lib/api.js`, qui era rimasta un'eccezione
   isolata (il login non passa da quell'helper).

3. **`tests/e2e/login.spec.js`** — andava in timeout su
   `page.getByLabel(/email/i)`/`page.getByLabel(/password/i)` perché
   `login/page.jsx` non aveva `htmlFor`/`id` a collegare label e input.
   Aggiunti su entrambi i campi. In più, verificando il terzo test
   ("credenziali errate → messaggio di errore visibile"), il locator
   `[role="alert"], .errore, .error` non avrebbe MAI trovato il banner di
   errore esistente (nessuno dei tre selettori corrispondeva alla sua
   classe/attributi) — aggiunto `role="alert"` per chiudere anche questo,
   scoperto solo leggendo con attenzione cosa cercava il test già scritto.

Verifica: `node --check` su `camereController.js` e `camere.test.js`, parse
Babel (`next/babel`) su `login/page.jsx` — tutti puliti. Test Jest e
Playwright non ancora rieseguiti (nessun accesso a Postgres/browser dal
sandbox) — da confermare al prossimo giro locale.

---

## 31/07/2026 — Riordino Impostazioni▸Camere (task preliminare al modulo 2.3) — COMPLETATO ✅

Prima di riprendere il modulo 2.3 (WuBook/WooDoo), il titolare ha proposto di
separare la configurazione strutturale delle camere (numero, categorie,
assegnazione categoria→camera) dalla pagina `/tariffe`, lasciando lì solo
prezzo/listino (e in futuro la gestione WuBook, per sua scelta esplicita —
prezzo e distribuzione restano vicini). Deciso esplicitamente come task a sé,
non come parte della Fase 1 di 2.3, perché tocca un modulo già completato e
testato (2.2 — Tariffe/Pacchetti, 74 test verdi).

Durante la discussione è emerso un secondo punto: l'anagrafica delle camere
fisiche (creare/eliminare una camera: numero, nome, piano) non esisteva in
nessuna UI — le 21 camere (20 + l'appartamento, `numero='app'`) vivevano solo
a DB. Il titolare ha chiesto di costruirla comunque, in ottica di poter
aggiungere in futuro un'altra unità (es. un secondo appartamento) senza
intervento diretto sul database.

**Scoperta collaterale**: la tabella `camere` non risulta creata da nessuna
migration tracciata in `database/migrations/` (solo un `ALTER TABLE camere
ADD COLUMN piano` nella 017) — probabile setup manuale in una sessione
precedente non documentata. La migration 019 non ha tentato di ricreare la
tabella (rischio di disallineamento con lo schema reale), ha fatto solo
l'`ALTER` additivo necessario. Il gap resta aperto, segnalato in
`docs/EVOLUTIVE.md`.

**Cosa è stato fatto:**

1. **Migration `019_impostazioni_camere.sql`** — `ALTER TABLE camere ADD
   COLUMN IF NOT EXISTS attivo BOOLEAN NOT NULL DEFAULT true`. Nessuna vera
   `DELETE` per le camere: "eliminare" una camera significa disattivarla,
   perché resta referenziata da `soggiorni`/`stato_camere` storici.

2. **`shared/ruoli.js`** — nuova azione `camere.anagrafica` (admin/titolare),
   deliberatamente più ristretta di `camere.scrittura` (che include
   receptionist/portiere_notte per fermata/partenza/note): chi gestisce lo
   stato giornaliero non deve poter creare/eliminare una camera.

3. **`backend/controllers/camereController.js`** — aggiunte `crea()`,
   `modifica()`, `attivaDisattiva()`. La disattivazione è bloccata con `409`
   se la camera ha soggiorni non cancellati con partenza odierna o futura
   (stesso principio di guardia già usato per `tipi_camera` con le FK).
   `lista()`/`oggi()` ora filtrano `attivo = true` di default; `lista()`
   accetta `?tutte=true` per includere anche le disattivate (usato dalla
   nuova pagina Impostazioni, che deve poterle vedere per riattivarle).

4. **`backend/routes/camere.js`** — `POST /`, `PATCH /:id`, `PATCH /:id/attivo`,
   tutte gated `richiedeAzione('camere', 'anagrafica')`.

5. **Filtro `attivo` propagato dove serve, non ovunque** — punto delicato,
   verificato leggendo il codice prima di toccarlo: `prenotazioniController.
   griglia()` (righe della griglia planning) e `dashboardController` (conteggio
   camere totali) ora filtrano `attivo = true`, perché sono viste "cosa posso
   prenotare/vedere oggi". Le query storiche con `JOIN` da `soggiorni`
   (`anagraficaOspitiController`, `gruppiController`) NON sono state toccate
   deliberatamente — uno storico deve restare leggibile anche se la camera è
   stata disattivata nel frattempo.

6. **Nuova pagina `frontend/app/impostazioni/camere/page.jsx`** — tre sezioni:
   anagrafica camere (nuova, con toggle attiva/disattiva stile
   `/utenti`), categorie camera e assegnazione categoria→camera (spostate da
   `/tariffe`, codice invariato). Accesso solo admin/titolare — a differenza
   di `/tariffe`, non è visibile nemmeno in lettura a receptionist: è
   configurazione, non consultazione prezzi.

7. **`frontend/app/tariffe/page.jsx` semplificata** — resta solo la sezione
   "Listino e stagionalità". `tipi_camera` resta caricato in sola lettura
   (serve al selettore categoria del listino).

8. **`frontend/components/layout/Sidebar.tsx`** — "Impostazioni" da voce
   singola dentro ALTRO a sezione a sé "IMPOSTAZIONI" con due voci: Utenti
   (invariata) e Camere (nuova, icona `Building2` per non confondersi
   visivamente con "Stato Camere" che usa `BedDouble`).

9. **`tests/api/camere.test.js` esteso** — nuovi `describe` per
   `POST /api/camere`, `PATCH /api/camere/:id`, `PATCH /api/camere/:id/attivo`:
   permessi (401/403 su receptionist), validazione (400), numero duplicato
   (409), blocco disattivazione con soggiorno futuro non cancellato (409,
   creato via `POST /api/prenotazioni` reale come già fa `soggiorni.test.js`,
   non con INSERT diretto), filtro `attivo` di default e bypass `?tutte=true`.

**Verifica**: `node --check`/`tsc --noEmit` puliti da questa sessione (nessun
accesso a Postgres dal sandbox Cowork, come nelle sessioni precedenti); test
Jest rieseguiti dal titolare in locale in tre giri, con 3 bug reali trovati
e corretti — nessuno anticipabile senza uno schema `camere` reale da
interrogare (la tabella non è tracciata da migration, vedi sopra):

1. **Migration 019 non ancora applicata** al primo giro (non un bug — le
   migration in questo progetto sono manuali, non partono da sole). Causava
   quasi tutti i 16 fallimenti iniziali (`la colonna attivo non esiste` su
   `camereController`, `prenotazioniController.griglia`,
   `dashboardController`).
2. **FK violation reale nel test**: l'`afterAll` del blocco `PATCH
   /api/camere/:id/attivo` cancellava `soggiorni` senza prima cancellare
   `soggiorno_ospiti` — stesso ordine già corretto in `soggiorni.test.js`,
   omesso per errore nel copiare il pattern. Faceva fallire l'intera suite
   `camere.test.js`, non solo il singolo test.
3. **`camere.nome` è `NOT NULL` sullo schema reale** — non deducibile dal
   codice esistente (nessuna funzione precedente scriveva su quella colonna).
   `crea()` falliva con 500 (23502) se `nome` non specificato (l'UI lo tratta
   come opzionale). Fix: fallback JS a `numero` se `nome` è vuoto, sia in
   `crea()` che in `modifica()` (quest'ultima con `COALESCE($3, nome)` per
   non azzerarlo mai su una modifica parziale).
4. **Bug di secondo livello nello stesso fix**: il primo tentativo usava
   `COALESCE($2, $1)` in SQL riusando `$1` (già legato al tipo della colonna
   `numero`, `character varying`) anche dentro la `COALESCE` — Postgres
   dedurrebbe due tipi diversi per lo stesso parametro (`42P08`, "tipi di
   dati dedotti... non consistenti", `text` vs `character varying`).
   Corretto calcolando il fallback in JS prima della query, niente riuso di
   parametri con contesti di tipo diversi.

Aggiunti 2 test di regressione per il punto 3 (crea senza nome → nome =
numero; modifica senza nome → nome invariato). **Esito finale confermato dal
titolare: 19/19 suite verdi, 472/472 test verdi.**

### Prossimo step

Torna il modulo **2.3 — Integrazione WuBook/WooDoo**, ora con la struttura
Impostazioni pronta. Bloccato sulla Fase 0 del piano (sottoscrizione WuBook,
non ancora fatta) — l'unica parte eseguibile senza credenziali resta la
mappatura `tipo_camera_id ↔ codice_esterno` per canale, da riprendere quando
il titolare conferma l'account.

---

## 31/07/2026 — 2.3 Fase 1: mappatura camere↔canale OTA — COMPLETATO ✅

Stessa giornata, sessione ancora successiva: su richiesta esplicita del
titolare ("prepariamo la mappatura e poi ci fermiamo"), costruita l'unica
parte del modulo 2.3 eseguibile senza l'account WuBook — sostituisce
l'appunto manuale prima tenuto in `tipi_camera.note`.

1. **Migration `020_mappatura_canali_ota.sql`** — nuova tabella
   `tipi_camera_canali` (`tipo_camera_id` FK con `ON DELETE CASCADE`,
   `canale` VARCHAR default `'wubook'`, `codice_esterno`, UNIQUE su
   `tipo_camera_id`+`canale`). Tabella separata e non una colonna su
   `tipi_camera`, deciso già nella discussione iniziale del modulo: un
   secondo canale in futuro è solo una nuova riga, non una nuova migration.

2. **`shared/ruoli.js`** — nuova sezione `canali_ota` (lettura
   admin/titolare/receptionist, scrittura admin/titolare), stesso pattern
   di `tariffe`/`tipi_camera`.

3. **`backend/controllers/canaliOtaController.js`** (nuovo) — `lista()`
   fa LEFT JOIN da `tipi_camera` così ogni categoria compare anche senza
   codice ancora configurato (mostra subito "Da configurare" in UI, niente
   giro dati separato); `upsert()` fa `ON CONFLICT (tipo_camera_id, canale)
   DO UPDATE`, `codice_esterno` vuoto è ammesso (permette di rimuovere un
   codice inserito per errore, non un errore di validazione).

4. **`backend/routes/canaliOta.js`** (nuovo) + **`backend/app.js`** —
   `GET /api/canali-ota`, `PUT /api/canali-ota/:tipoCameraId`, wired su
   `/api/canali-ota`.

5. **`frontend/app/tariffe/page.jsx`** — nuova sezione "Codici canale OTA"
   in fondo alla pagina (per decisione esplicita del titolare presa
   discutendo il riordino Impostazioni: prezzo e distribuzione OTA restano
   vicini, a differenza di anagrafica/categorie camere che sono finite in
   Impostazioni). Una riga per categoria, input + pulsante Salva per riga
   (stesso pattern di editing inline già in uso altrove), badge
   Configurato/Da configurare. Canale mostrato come badge fisso in
   intestazione ("Canale: WuBook / WooDoo"), non un selettore — con un solo
   canale disponibile oggi un dropdown sarebbe un controllo senza scelta
   reale.

6. **`tests/api/canaliOta.test.js`** (nuovo) — permessi (401/403 su
   receptionist per la scrittura), categoria inesistente (404), upsert
   idempotente (verificato sia via conteggio righe a DB sia via GET dopo un
   secondo PUT), codice vuoto → torna `null` invece di un errore.

**Verifica**: `node --check` pulito su tutti i file backend nuovi/toccati,
`npx tsc --noEmit` sull'intero frontend, 0 errori. Test rieseguiti dal
titolare in locale dopo aver applicato
`database/migrations/020_mappatura_canali_ota.sql`: **20/20 suite e 482/482
test verdi al primo giro**, nessun bug emerso stavolta.

**Nessuna chiamata esterna in questa fase** — i codici restano dati di
configurazione. Il modulo 2.3 resta bloccato oltre questo punto sulla
sottoscrizione WuBook (Fase 0), come da richiesta del titolare di fermarsi
qui per ora.

---

## 31/07/2026 — Fix warning Jest "worker failed to exit gracefully"

Non un bug funzionale (0 test falliti, da qui `--forceExit` in `test:api`
già da tempo), ma un leak di teardown investigato e risolto dal titolare in
locale nella stessa giornata.

**Causa**: `backend/config/db.js` crea un `Pool` pg al `require` e non lo
chiude mai (corretto per il server reale, che vive finché il processo
resta su). Sotto Jest ogni file di test ha un module registry isolato:
`require('../../backend/app')` in ciascuno dei 20 file crea un `Pool`
indipendente, e nessuno viene mai chiuso — da cui l'accumulo di handle TCP
aperti che impedisce a Jest di uscire da solo. `tests/helpers/db.js` ha un
pool separato e viene già chiuso da `chiudiPool()` nei singoli file: non
c'entra con questo leak, un fattore diverso facile da confondere all'inizio.

**Fix**: nuovo `tests/setup-after-env.js`, agganciato via
`setupFilesAfterEnv` in `jest.config.js` (gira nello stesso module registry
del file di test, a differenza di `globalSetup` che gira in un processo
separato) — un `afterAll` globale che chiude il pool di
`backend/config/db.js` alla fine di ogni file.

**Confermato dal titolare**: `npx jest tests/api` senza `--forceExit`
termina pulito, nessun leak residuo (le connessioni SSE di
`ristorante.test.js` non erano un problema). Rimosso `--forceExit` da
`test:api` in `package.json` — root cause risolta, non più necessario.

---

## 01/08/2026 — Modulo 2.4 (Tassa di soggiorno) completato

Prima sessione della nuova sequenza concordata col titolare: sviluppare
prima tutti i moduli residui senza costi esterni, **1.10 Deploy VPS
escluso e rimandato** — deviazione esplicita da CLAUDE.md Sezione 13
("mai Fase 2 prima del go-live Fase 1"), autorizzata dal titolare. Ordine
per le prossime sessioni: 2.4 → 2.6 → 2.5 → 4.2 → 5.1 → 5.2 → 5.3
(parziale, bloccato su WuBook per la parte booking engine).

**Schema**: due tabelle nuove (`database/migrations/021_tassa_soggiorno.sql`).
`configurazione_tassa_soggiorno` è uno storico mai sovrascritto — una nuova
aliquota chiude quella precedente ancora aperta (`valido_al = nuova
valido_dal - 1`) invece di modificarla, così un soggiorno passato resta
calcolato con l'aliquota vigente all'epoca anche se il Comune ne delibera
una nuova. `tasse_soggiorno` congela il calcolo (notti tassabili, ospiti
tassabili, importo dovuto) e si blocca non appena `importo_riscosso` è
valorizzato — un ricalcolo successivo della configurazione non altera più
un importo già incassato.

**Calcolo**: lazy e idempotente (`GET /calcolo/:soggiorno_id`), legge tutti
gli ospiti reali del soggiorno da `soggiorno_ospiti` (non solo
l'intestatario in `soggiorni.ospite_id`) per applicare l'esenzione per età
persona per persona, età calcolata in SQL con `age()` alla data di arrivo.
Notti tassabili = `MIN(notti soggiorno, notti_max_tassabili)` se
configurato. Riscossione con `SELECT ... FOR UPDATE` in transazione per
evitare una doppia riscossione su richieste concorrenti.

**Deviazioni dal piano originale, entrambe motivate**:
- Export Excel con `xlsx` (già installato, pattern preso da
  `timbratureController.js`), non `exceljs` come indicato nello Stack di
  CLAUDE.md Sezione 2 — quella riga risulta disallineata dal codice reale,
  da correggere in una sessione successiva (non urgente).
- Pagina `/tassa-soggiorno`: il download dell'export costruisce l'URL a
  runtime da `window.location.hostname` (stesso calcolo di
  `frontend/lib/api.js`, non esportato da lì) invece di replicare il
  pattern già in uso in `frontend/app/ztl/page.jsx`
  (`process.env.NEXT_PUBLIC_API_URL`, fisso al build) — quel pattern in ZTL
  è un bug preesistente (si romperebbe da telefono/tablet in LAN con IP
  diverso da quello di build, violazione Sezione 12), non replicato qui ma
  nemmeno corretto in ZTL in questa sessione (fuori scope).

**Test**: `tests/api/tassaSoggiorno.test.js` scritto a mano (stesso motivo
di `tariffe.test.js`: contesto già disponibile, evita di consumare
`ANTHROPIC_API_KEY` per uno script che genera codice equivalente). Un solo
fallimento al primo giro, non applicativo: l'assert di test chiamava
`.toISOString()` su `valido_al`, che però arriva come stringa `'YYYY-MM-DD'`
per il type-parser DATE di `backend/config/db.js` (condiviso a livello di
processo `pg` anche dal pool separato di `tests/helpers/db.js`) — corretto
il confronto a stringa diretta. **Confermato dal titolare in locale: 29/29
test verdi.**

**Nota ambiente**: verifica di sintassi (non esecuzione) fatta da Claude in
sessione Cowork — `node --check` sui file backend, `tsc` in modalità sciolta
sulle pagine frontend nuove. L'esecuzione reale dei test non è possibile da
quell'ambiente: `bcrypt` nel `node_modules` del titolare è compilato per
Windows ("invalid ELF header" nel sandbox Linux di Cowork) e non c'è
accesso al Postgres locale del titolare. Verifica finale sempre in locale.

---

## 01/08/2026 — Modulo 2.6 (ROSS1000/ISTAT) in pausa, 2.5 (Alloggiati Web) analizzato, sezione Clienti aggiunta

**2.6 in pausa**: letti i due manuali caricati dal titolare
(`manuale_d_uso_ross_1000_-_caricamento_manuale.pdf`,
`_importazione_file.pdf`) — sono guide utente al portale ROSS1000, non il
tracciato record del file .txt/.xml. Il documento tecnico va scaricato dal
titolare stesso dal portale (menù Manuali, dietro login SPID struttura).
Nessun codice scritto per non rischiare un generatore basato su ipotesi.
Il titolare si è impegnato a recuperarlo.

**2.5 — decisione architetturale**: CLAUDE.md indicava "intermediario REST
certificato (non SOAP diretto)", ma tutta l'analisi già verificata in
`docs/PRENOTAZIONI_FASE2.md` (righe 605-631) riguardava il SOAP diretto
`WS_ALLOGGIATI`, e nessun intermediario REST era mai stato scelto
(`docs/EVOLUTIVE.md` lo segnalava come punto aperto). Ricerca web:
l'integrazione diretta SOAP è quella ufficiale della Polizia di Stato,
gratuita; gli intermediari REST in circolazione sono prodotti commerciali
di terze parti. **Confermato dal titolare: SOAP diretto.** Riletti
`MANUALEWS.pdf` (spec tecnica, 21 pagine) e `MANUALEALBERGHI.pdf` (guida
pratica, 35 pagine) integralmente: tracciato record 168 caratteri
confermato campo per campo, identico in entrambe le fonti (posizione,
lunghezza, obbligatorietà differenziata per tipo_alloggiato 16-17-18 vs
19-20); metodi SOAP `GenerateToken`/`Test`/`Send`/`Ricevuta`/`Tabella` con
esempi XML completi; `GestioneAppartamenti_*` per la casa in affitto
(tracciato diverso, 174 caratteri, con `IdAppartamento`).

Scoperta che allarga lo scope: i campi codificati di `ospiti` (migration
016 — `stato_nascita_codice`, `comune_nascita_codice`,
`documento_tipo_codice` ecc.) non hanno mai avuto una UI in nessuna pagina
del gestionale — solo colonne DB mai esposte. Senza una UI per inserirli
non si può generare una schedina valida. Split concordato col titolare:
**2.5 Fase 1** (prossimo step) = sincronizzazione tabelle di codifica via
SOAP `Tabella` + estensione scheda ospite con le tendine; **2.5 Fase 2** =
generatore schedina + client SOAP + invio reale, quando il titolare userà
le sue credenziali (già in possesso, non ancora usate per cautela —
esplicitamente non vuole "caricare dati non validi ora"). Casa in affitto
rimandata: non ancora registrata come Appartamento sul portale.

**Sezione Clienti (completa modulo 2.1)**: emersa da una domanda del
titolare su un'eventuale sezione CRM clienti e la sua compatibilità GDPR,
prima di procedere con 2.5. Verificato via ricerca web (comunicati Garante
Privacy): i dati già raccolti per soggiorno/obblighi di legge si possono
mostrare in una vista aggregata senza nuovo consenso (stessa finalità); il
marketing attivo richiede invece consenso esplicito, già presente come
campo (`consenso_marketing`) dalla migration 016; mai conservare
copie/scansioni documento (il progetto già lo rispetta — solo testo). `GET
/api/ospiti` esisteva dalla migration 016 (autocomplete "Nuova
prenotazione") ma senza UI di consultazione propria.

Aggiunto: `backend/controllers/anagraficaOspitiController.js` — `lista()`
ora restituisce `numero_soggiorni` (sottoquery `COUNT`, esclude
`cancellato = true`, nessuna modifica a `COLONNE_PUBBLICHE` per non
rompere `dettaglio`/`crea`/`aggiorna` che la riusano senza alias tabella).
`frontend/app/clienti/page.jsx` (ricerca con debounce 300ms, tabella,
form "Nuovo cliente") e `frontend/app/clienti/[id]/page.jsx` (prima pagina
con route dinamica `[id]` nel progetto — usa `useParams()` da
`next/navigation`, non il prop `params`, per restare in un client
component senza gestire la Promise di Next 15+). Deliberatamente NESSUN
campo nazionalità/documento codificato nel form di creazione/modifica —
solo testo libero oggi produrrebbe codici non validi per Alloggiati Web;
arriveranno con le tendine del modulo 2.5 Fase 1. Nessuna migration,
nessun nuovo permesso (riuso sezione `ospiti` di `shared/ruoli.js`,
invariata). Sidebar: voce "Clienti" in OSPITALITÀ, icona `Contact` (nuova,
per non duplicare l'icona `Users` già usata da "Personale").

**Verifica**: `node --check` sul controller e sul test, `tsc` in modalità
sciolta sulle due pagine nuove e sul diff di `Sidebar.tsx` — 0 errori
nuovi. Test estesi in `tests/api/anagrafica-ospiti.test.js` (fixture
soggiorno attivo + cancellato, verifica che il conteggio escluda i
cancellati). **Confermato dal titolare in locale: 24/24 test verdi.**

## 01/08/2026 — Modulo 2.5 Fase 1b: tabelle di codifica Alloggiati Web + tendine scheda ospite

Continuazione della stessa sessione, dopo l'approvazione del titolare
("vaiù") al piano per la Fase 1 concordata sopra (rinominata Fase 1b per
distinguerla dalla sezione Clienti, che di fatto era la vera "Fase 1a").

**Migration `022_alloggiati_codici.sql`**: una sola tabella generica
`alloggiati_codici` (`tabella`, `codice`, `descrizione`, `dati_extra
JSONB`, `sincronizzato_at`, UNIQUE su `tabella+codice`) invece di tabelle
dedicate per Stati/Comuni/Tipi_Documento — scelta perché la struttura CSV
esatta della tabella "Luoghi" (che verosimilmente combina Stati+Comuni)
non è documentata in nessuno dei due manuali ufficiali, solo l'esempio
`ListaAppartamenti`. `dati_extra` preserva tutte le colonne CSV grezze,
così nessuna informazione va persa anche se l'assunzione "colonna 1 =
codice, colonna 2 = descrizione" si rivelasse sbagliata sui dati reali —
verificabile solo al primo sync vero, non fattibile in questa sessione
(niente credenziali, niente accesso di rete al servizio da questo
ambiente).

**Client SOAP** (`backend/lib/alloggiatiSoapClient.js`): scritto a mano,
nessuna nuova dipendenza — richiesta esplicita di CLAUDE.md di motivare
ogni pacchetto nuovo, e per `GenerateToken`/`Tabella` (risposte XML
piatte, un tag per valore) un parser vero non serve: template di envelope
+ estrazione con regex (`estraiTag`), gestione errori tramite ricerca di
`<Fault>`/`<soap:Fault>` nella risposta. Annotato esplicitamente nel codice
che `Test`/`Send` (Fase 2) hanno risposte annidate per riga di schedina e
potrebbero richiedere un parser XML reale — non anticipato ora per non
installare una dipendenza inutile in questa fase. Endpoint e header
`Content-Type`/`action` per le chiamate SOAP sono un'assunzione dai
manuali, non verificata contro il servizio reale.

**Backend**: `alloggiatiController.js` (`sincronizzaTabelle` — legge
`ALLOGGIATI_UTENTE/PASSWORD/WSKEY` da env, 400 chiaro se mancanti invece di
un 500 generico, poi genera token e scarica/upserta `Luoghi`,
`Tipi_Documento`, `Tipi_Alloggiato`; `listaCodici` — ricerca per le
tendine, `?codice=` per lookup esatto usato nell'hydration del componente
frontend; `statoSincronizzazione` — conteggio+ultimo sync per tabella).
Route `/api/alloggiati` con `sincronizza`/`stato` riservati ad
admin/titolare (toccano credenziali/configurazione) e `lettura` estesa
anche a receptionist/portiere_notte (serve durante il check-in).
Nuova sezione `alloggiati` in `shared/ruoli.js` + `frontend/lib/ruoli.js`.

**Frontend**: pagina `impostazioni/alloggiati` (stato sincronizzazione per
tabella, pulsante "Sincronizza ora", riservata admin/titolare, voce
sidebar sotto IMPOSTAZIONI). Componente riutilizzabile
`SelettoreCodiceAlloggiati.jsx` (autocomplete con ricerca debounced 300ms +
hydration via lookup esatto quando arriva già un codice valorizzato, es.
in modifica di un cliente esistente). Usato in `frontend/app/clienti/page.jsx`
(form nuovo cliente, sezione "Documento e nazionalità" aggiunta) e in
`frontend/app/clienti/[id]/page.jsx` (nuova card "Documento e nazionalità"
sia in vista sia in modifica — in vista con un piccolo componente locale
`SoloLettura` che fa solo il lookup esatto senza dropdown, in modifica con
`SelettoreCodiceAlloggiati` pieno). Rimossa la nota ormai obsoleta
"disponibili con l'integrazione Alloggiati Web (modulo 2.5)" dalla card
Documento. Il numero documento resta a scrittura sola andata: la GET non
lo restituisce mai in chiaro (solo `documento_mascherato`), quindi il
campo in modifica parte sempre vuoto — se lasciato vuoto il backend
mantiene il valore esistente via `COALESCE`, coerente con il pattern già
usato per gli altri campi opzionali.

**Verifica**: `node --check` su tutti i file backend toccati, `tsc` in
modalità sciolta sulle pagine/componenti frontend toccati — 0 errori
nuovi. Nuovo `tests/api/alloggiati.test.js`: permessi per ruolo su tutti e
tre gli endpoint, ricerca/lookup esatto/isolamento per tabella su
`listaCodici` (righe seminate direttamente nel DB, nessuna sincronizzazione
reale eseguita), stato con conteggio corretto, e il ramo "credenziali
mancanti → 400" di `sincronizzaTabelle` (unico ramo testabile senza
credenziali reali né accesso di rete a WS_ALLOGGIATI). Aggiunte le tre
variabili `ALLOGGIATI_UTENTE/PASSWORD/WSKEY` a `backend/.env.example`.
**Confermato dal titolare in locale: 14/14 test verdi
(`alloggiati.test.js`) + 24/24 (`anagrafica-ospiti.test.js`, invariato).**

Non testata in questa sessione la sincronizzazione reale contro
WS_ALLOGGIATI (nessuna credenziale nell'ambiente di sviluppo usato) — da
verificare quando il titolare esegue "Sincronizza ora" in locale con le
sue credenziali. Se lo schema `dati_extra`/colonna-codice/colonna-
descrizione si rivela sbagliato sui dati reali, va corretto lì, non prima.

**Prossimo step** (per quando il titolare vorrà riprendere, ordine
concordato in Sezione 16 di CLAUDE.md): 4.2 Welcome Book digitale, oppure
2.5 Fase 2 se si vuole testare l'invio reale ad Alloggiati Web con le
credenziali già disponibili.

## 01/08/2026 — Fix Modulo 2.5: testo libero per documento/nazionalità (difetto di progettazione segnalato dal titolare)

Continuazione della stessa sessione. Il titolare ha provato la Fase 1b
appena consegnata e ha riportato: "né in Alloggiati Web né in Clienti si
salva nulla". Diagnosi in due passaggi:

1. **Alloggiati Web** — il messaggio d'errore rosso era il comportamento
   voluto (`sincronizzaTabelle` fa fail-fast con 400 se
   `ALLOGGIATI_UTENTE/PASSWORD/WSKEY` mancano in `.env`), non un bug.
   Nessuna credenziale reale è mai stata inserita nell'ambiente del
   titolare, quindi `alloggiati_codici` è rimasta a zero righe.
2. **Clienti** — conseguenza diretta del punto 1, ma anche un difetto di
   progettazione vero: la Fase 1b iniziale rendeva stato/comune di
   nascita, cittadinanza, tipo documento e luogo di rilascio compilabili
   SOLO scegliendo un suggerimento da `alloggiati_codici`. Tabella vuota →
   nessun suggerimento → niente da selezionare → niente da salvare.
   Il titolare ha fermato il lavoro qui con un'osservazione più
   fondamentale: l'ordine concettuale era invertito. Non si "carica il
   cliente da Alloggiati Web" — si registra il documento del cliente a
   vista (reception guarda la carta d'identità) e *poi*, eventualmente, lo
   si invia ad Alloggiati Web. Le tabelle di codifica sincronizzate sono
   solo un aiuto per scrivere i codici giusti quando servono (Fase 2), non
   un prerequisito per registrare un ospite oggi. Ha aggiunto due indicazioni
   per il futuro (non sviluppate ora, solo annotate in EVOLUTIVE.md): un
   'evolutiva importante per la lettura automatica del documento (fotocamera
   smartphone o hardware dedicato) per velocizzare il check-in — si
   sovrappone al modulo 5.2 già pianificato; e il principio che le tendine
   vadano sempre valorizzate in modo user-friendly (mai codici grezzi
   visibili all'utente finale) — cosa già vera nell'implementazione (si
   mostra sempre `descrizione`, mai `codice`), ma il vincolo va rispettato
   anche nella correzione.

**Correzione**: migration `023_alloggiati_testo_libero.sql` — 5 colonne
`*_testo` (VARCHAR) companion alle `*_codice` già esistenti dalla
migration 016 su `ospiti` (stato_nascita, comune_nascita, cittadinanza,
documento_tipo, luogo_rilascio). Le colonne `*_testo` sono quello che la
reception scrive sempre; le `*_codice` restano solo per l'invio schedina
futuro, valorizzate quando il testo corrisponde a un suggerimento
sincronizzato.

`backend/controllers/anagraficaOspitiController.js`: `COLONNE_PUBBLICHE`,
`crea()`, `aggiorna()` estesi con le 5 colonne testo (pattern COALESCE
invariato per `aggiorna`, coerente col resto del controller).

`frontend/components/ui/SelettoreCodiceAlloggiati.jsx` ridisegnato da zero:
prima aveva `testo` come stato interno con hydration via lookup di rete
(`?codice=`) al mount; ora `testo` e `codice` sono entrambi prop
controllate dal genitore — `onCambiamento(nuovoTesto, nuovoCodice)`.
Digitare a mano azzera sempre il codice già abbinato (un testo modificato
non garantisce più la corrispondenza); selezionare un suggerimento dal
menu abbina testo e codice insieme, mostrando una piccola icona ✓ nel
campo. Mai bloccante: la ricerca dei suggerimenti resta solo un aiuto,
l'input accetta qualunque testo in qualunque momento.

`frontend/app/clienti/page.jsx` e `frontend/app/clienti/[id]/page.jsx`:
stato raddoppiato (testo+codice per i 5 campi), payload POST/PATCH
aggiornato. In `[id]/page.jsx` la vista sola lettura ora mostra
direttamente `cliente.*_testo` — eliminato il componente `SoloLettura` che
prima faceva un'altra chiamata di rete solo per mostrare una descrizione,
non più necessaria col testo già salvato in chiaro nel DB (semplificazione,
non solo il fix richiesto).

`tests/api/anagrafica-ospiti.test.js`: 2 nuovi test nel blocco PATCH —
salvataggio di un campo a solo testo libero (senza codice) e salvataggio
di testo+codice insieme (caso "suggerimento selezionato").

**Verifica**: `node --check` sul controller e sul test, `tsc` in modalità
sciolta sulle due pagine clienti e sul componente — 0 errori nuovi.
**Confermato dal titolare in locale: 26/26 test verdi
(`anagrafica-ospiti.test.js`, esteso da 24 a 26) — testo libero scritto
("Italia") verificato persistente dopo il salvataggio.**

Punto lasciato aperto per il futuro, annotato in `docs/EVOLUTIVE.md`, non
sviluppato ora: prima dell'invio reale della schedina (2.5 Fase 2) andrà
segnalato quando un campo ha testo ma nessun codice abbinato, perché va
completato prima di poter inviare. Restano validi tutti i punti aperti
già noti sulla sincronizzazione reale mai testata (vedi voce precedente
"Modulo 2.5 Fase 1b" in questo diario).

## 02/08/2026 — Modulo 4.2 (Welcome Book digitale, repo sito-hotel) + primo deploy Vercel

Lavoro svolto nel repo `sito-hotel` (separato da questo), riportato qui
per coerenza con la roadmap di Sezione 8/16 di CLAUDE.md — dettaglio
completo eventualmente da spostare in un diario dedicato a `sito-hotel` se
la cronologia di quel repo cresce (oggi non esiste ancora, vedi nota in
`sito-hotel/CLAUDE.md` Sezione 1).

**Prima versione**: pagina unica `/[locale]/benvenuto` a scorrimento con
tutte le sezioni (WiFi, orari, regole, ristorante, contatti, consigli
Lerici) — nuovo singleton Sanity `welcomeBook`, fuori da sitemap/menu
pubblico, `robots noindex` (contiene la password WiFi). QR stampabile
generato con reportlab+qrcode nel sandbox (script one-off, nessuna
dipendenza aggiunta al repo del sito).

**Feedback del titolare**: voleva una schermata "home" con pulsanti a
icone (mostrato un esempio di prodotto concorrente, tipo hostlabtools.com)
anziché una pagina a scorrimento — bandiere lingua non necessarie, il
sito ha già next-intl. Ristrutturato: `/benvenuto` diventa un hub con
griglia di 6 pulsanti (Orari, WiFi, Regole della casa, Ristorante,
Contatti, Lerici), ognuno con la propria sottopagina
(`/benvenuto/orari`, `/wifi`, `/regole`, `/ristorante`, `/contatti`,
`/lerici`) e link "torna al Welcome Book". Il modello dati Sanity non è
cambiato, solo la presentazione. Aggiunta dipendenza `lucide-react` per
le icone dei pulsanti (motivata nel piano, confermata dal titolare).
Sfruttato il refactor per collegare `infoHotel.orariReception` a
`getInfoHotel()` — il campo esisteva nello schema Sanity dalla prima
versione del sito ma nessuna query lo selezionava mai, restava inutilizzato.

**Installazione lucide-react — intoppo tecnico**: `npm install` nel
sandbox si è bloccato/superato il timeout più volte (probabile lentezza
I/O della cartella montata da Windows), lasciando `node_modules/lucide-react`
scritto ma `package.json`/`package-lock.json` non aggiornati. Risolto
aggiungendo la dipendenza a mano in `package.json` e rigenerando solo il
lockfile con `npm install --package-lock-only --no-audit --no-fund`
(operazione più leggera, completata in pochi secondi) — verificato che
l'entry in `package-lock.json` avesse resolved/integrity corretti prima
di proseguire.

**Primo deploy Vercel**: il titolare ha collegato il repo GitHub
`pgwall84/sito-hotel` a Vercel e impostato le due env var minime
indispensabili perché il sito legga i contenuti da Sanity
(`NEXT_PUBLIC_SANITY_PROJECT_ID=9u8ur4ni`, `NEXT_PUBLIC_SANITY_DATASET=production`
— le uniche due, verificato con un grep di tutti gli usi reali di
`process.env` nel codice: `SANITY_API_TOKEN` della spec originale non è
mai stato usato da nessuna parte). URL provvisorio:
`https://sito-hotel-five.vercel.app`. QR stampabile rigenerato con questo
URL provvisorio (nota visibile in arancione sul PDF, da ristampare quando
sarà attivo `hoteldelgolfolerici.com`). Confermato dal titolare sul sito
reale: la griglia di pulsanti funziona bene da telefono.

**Limite tecnico incontrato e non forzato**: nel sandbox non ci sono
credenziali per fare `git push` verso GitHub (identità diversa dal PC del
titolare), e il connettore Vercel disponibile è di sola lettura (elenca
deploy esistenti, non ne crea/gestisce di nuovi) — l'import del progetto
su Vercel resta quindi un'azione da dashboard, fatta dal titolare. Un
tentativo di `git commit` locale nel sandbox ha incontrato un
`.git/index.lock` risalente al 26/07/2026 che il filesystem montato ha
rifiutato di rimuovere (probabile lock a livello Windows sulla cartella
condivisa) — non forzato, il titolare ha fatto lui commit/push dal proprio
terminale.

**Prossimo step**: il titolare ha detto che vorrà aggiungere altri
pulsanti/sezioni al Welcome Book più avanti — nessuna richiesta specifica
ancora. Quando il dominio finale `hoteldelgolfolerici.com` sarà collegato
a Vercel, rigenerare un'ultima volta il QR stampabile.

---

## 02/08/2026 — Modulo 2.5: correzione tabelle di codifica Alloggiati Web da documenti reali

Il titolare ha aggiunto in `docs/alloggiati web/` 5 nuovi documenti: un
manuale (`MANUALEPASSAGGIO.pdf`, 4 pagine — migrazione login portale da
certificato digitale a "codici dispositivo", segnalato come rischio da
verificare prima del primo sync reale, nessun codice toccato per questo)
e 4 export CSV reali delle tabelle di codifica (`stati.csv`, `comuni.csv`,
`documenti.csv`, `tipo_alloggiato.csv`, scaricati dal portale web, non
dal SOAP). Richiesto di rivedere l'implementazione della Fase 1b alla luce
di questi documenti e correggere quanto necessario. Titolare ha approvato
in sequenza: 1) fix parser, 2) import diretto dei CSV, 3) voci storiche in
fondo alla lista (non nascoste).

**Verifica struttura ufficiale — nessuna correzione necessaria**: ri-letto
integralmente `MANUALEWS.pdf`, confermato l'enum `TipoTabella` (0 Luoghi
= Stati+Comuni insieme, 1 Tipi_Documento, 2 Tipi_Alloggiato, 3 TipoErrore,
4 ListaAppartamenti). La scelta già fatta in migration 022
(`TABELLE_DA_SINCRONIZZARE = ['Luoghi', 'Tipi_Documento', 'Tipi_Alloggiato']`)
era già corretta — l'incertezza segnata nel commento della migration era
ingiustificata, ora rimossa concettualmente (il commento resta ma il dubbio
è risolto).

**1) Fix separatore CSV** (`backend/lib/alloggiatiSoapClient.js`): il
manuale dichiara `;` per la risposta SOAP del metodo `Tabella`, ma i 4 CSV
reali forniti dal titolare usano `,` (probabile export dal portale web
umano, non dal servizio SOAP). Il parser assumeva `;` fisso. Aggiunta
`rilevaSeparatore(primaRiga)` — conta occorrenze di `;` e `,` sulla prima
riga e usa il separatore più frequente — invece di sceglierne uno fisso.
Verificato eseguendo `parseCsv` direttamente contro tutti e 4 i file reali:
righe/colonne/valori di esempio corrispondono alle attese.

**2) Import diretto dei CSV reali** (nuovo `backend/scripts/importaCodiciAlloggiatiCsv.js`,
nuova cartella `backend/scripts/`): script una tantum, idempotente, stesso
upsert di "Sincronizza ora" — quindi completamente sicuro rieseguire la
sincronizzazione reale più avanti (sovrascrive semplicemente questi dati).
Popola `alloggiati_codici` senza aspettare le credenziali WS_ALLOGGIATI
reali, sbloccando le tendine di `/clienti`.

Primo tentativo di esecuzione da parte del titolare fallito:
`SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`.
Causa: `backend/config/db.js` carica `.env` con `dotenv.config({quiet:true})`
senza `path` esplicito → dotenv risolve `.env` rispetto alla cartella da
cui è lanciato `node` (cwd), non a quella dello script. Il titolare aveva
lanciato il comando dalla radice del repo, non da `backend/`, quindi
`backend/.env` non veniva trovato e `DB_PASSWORD` restava undefined.
Corretto: lo script ora carica esplicitamente
`dotenv.config({path: path.join(__dirname, '..', '.env'), quiet:true})`
prima di richiedere `../config/db`, funziona da qualunque cartella di
lancio. Rieseguito con successo dal titolare ("importati").

Dopo l'import, il titolare ha segnalato 404 aprendo Impostazioni ▸
Alloggiati Web. Verificato tutto il percorso (file `page.jsx` al posto
giusto, nessun conflitto di nome/case, voce sidebar corretta, route
`/api/alloggiati` montata in `app.js`) — nessun difetto di codice trovato,
tutto invariato rispetto alla Fase 1b funzionante. Diagnosi: cache stale
del dev server Next.js frontend. Risolto con riavvio del frontend
(`npm run dev`) + hard refresh browser — confermato dal titolare
("funziona e sincronizzato").

**3) Voci storiche in fondo, non nascoste** (`backend/controllers/alloggiatiController.js`):
i CSV di comuni/stati includono una colonna `DataFineVal` (comuni fusi o
rinominati, es. a seguito di fusioni comunali) che finisce già in
`dati_extra` (JSONB, nessuna perdita di colonne CSV non mappate — scelta
architetturale della migration 022). Su richiesta esplicita del titolare,
queste voci restano selezionabili (necessarie per ospiti nati quando quel
codice era valido) ma vanno in fondo alla lista dei suggerimenti, non
nascoste. Aggiunta `ORDINE_STORICO` (espressione SQL `CASE` su
`dati_extra->>'DataFineVal' IS NULL`) come primo criterio di `ORDER BY` in
`listaCodici()`, sia nel ramo di ricerca testuale sia in quello senza
ricerca. Le tabelle senza questa colonna (Tipi_Documento, Tipi_Alloggiato)
non sono affette (`DataFineVal` è NULL per loro, ordine invariato).

**Stato aggiornato**: `docs/EVOLUTIVE.md`, voce "Modulo 2.5 — Alloggiati
Web, Fase 1b" — le tendine sono ora popolate con dati reali e verificate
in UI; resta MAI TESTATA la sincronizzazione SOAP reale (`GenerateToken`/
`Tabella` contro il servizio vero) — quel rischio è distinto e invariato,
ora isolato all'autenticazione/trasporto (il parsing CSV non è più
un'ipotesi, verificato contro dati reali).

**Non fatto in questa sessione, deliberatamente**: nessuna chiamata reale
a `WS_ALLOGGIATI` (nessuna credenziale nell'ambiente di sviluppo);
`MANUALEPASSAGGIO.pdf` letto ma non approfondito oltre — resta un punto
aperto da verificare prima del primo `GenerateToken` reale (vedi
EVOLUTIVE.md).

---

## 03/08/2026 — Modulo 5.1: Check-in/check-out digitale + Housekeeping — COMPLETATO ✅

Prossimo step della sequenza concordata (`sequenza_sviluppo_no_pagamenti`).
Ricerca preliminare in `docs/PRENOTAZIONI_FASE2.md` Parte D ("Viste non
ancora costruite") ha mostrato che le transizioni di stato `check_in`/
`check_out` esistevano già (state machine + pulsanti nel pannello
dettaglio di `/planning-camere`, dal modulo Prenotazioni Fase 2A) — il
lavoro reale di 5.1 era una vista operativa dedicata più le pulizie.

Quattro domande poste al titolare prima del piano, risposte usate per le
decisioni sotto:
1. Nuova pagina "Arrivi/Partenze di oggi" oltre ai pulsanti già nel
   planning → confermato sì. Il titolare ha aggiunto che il menu sta
   diventando ampio e ha in mente anche una pagina "Prenotazioni" in
   forma di tabella e una sezione marketing email/SMS/WhatsApp — idee
   future, loggate in `docs/EVOLUTIVE.md`, non sviluppate ora.
2. Calcolo automatico fermata/partenza da `soggiorni` → confermato, con
   la logica esatta descritta dal titolare (partenza = il cliente va via
   oggi; fermata = rimane un'altra notte) e l'avvertenza che un
   accorciamento di soggiorno (partenza anticipata) deve riflettersi
   subito — soddisfatta per costruzione, essendo calcolato a runtime
   e mai cacheto.
3. Permessi "segna pronta" → il titolare ha indicato esplicitamente:
   admin, titolare, cameriera (cameriere), receptionist, portiere di
   notte possono; "solo il cuoco non può" (per esclusione, anche
   dipendente incluso). Prima l'endpoint non aveva alcuna restrizione.
4. Consolidamento stato camera → confermato ("va consolidato"), con una
   domanda di chiarimento su cosa si intendesse per "fonte soggiorni"
   (spiegato: `/planning-camere` legge già `soggiorni` direttamente, mai
   da `stato_camere` — il disallineamento era solo tra Camere e
   Dashboard, che leggevano `stato_camere`, manuale).

**Backend**:
- `camereController.js` — `lista()`/`oggi()`: `arrivo` (mostrato in UI
  come "Fermata") e `partenza` non sono più letti da `stato_camere`, sono
  calcolati con subquery su `soggiorni` non cancellati (`CALCOLO_FERMATA`/
  `CALCOLO_PARTENZA`, costanti in cima al file). Gestito esplicitamente il
  caso di turnover stesso giorno (chi parte + chi arriva e si ferma sulla
  stessa camera): l'EXCLUDE anti-overbooking ammette range adiacenti `'[)'`
  sulla stessa data, quindi entrambi i flag possono essere veri insieme —
  già previsto dalla UI esistente (colore ambra "haFermata && haPartenza").
  `aggiornaStato()` non accetta più `arrivo`/`partenza` nel body (ignorati
  in silenzio per non rompere client vecchi), solo `note`; la risposta
  include comunque arrivo/partenza ricalcolati, stessa forma di prima.
- `dashboardController.js` — stesso calcolo per il KPI "movimenti camere"
  (prima leggeva `stato_camere`, il commento lì diceva esplicitamente che
  lo schema non tracciava un calendario prenotazioni — superato dal
  modulo 2.2/Fase 2A, ultimo punto rimasto disallineato). `COUNT(DISTINCT
  camera_id)`, non `COUNT(*)`, per non contare due volte una camera in
  turnover (due righe di `soggiorni` soddisfano la condizione, ma è una
  sola camera con movimento).
- `shared/ruoli.js` — nuova azione `camere.pulizia: [A,T,R,C,P,D]` (tutti
  tranne cuoco). `routes/camere.js` — `POST /pronta` ora gated con
  `richiedeAzione('camere','pulizia')` (prima nessuna restrizione).

**Frontend**:
- Nuova pagina `frontend/app/arrivi-partenze/page.jsx` (voce sidebar
  OSPITALITÀ, ruoli admin/titolare/receptionist/portiere_notte): liste
  Arrivi/Partenze di oggi da `GET /api/prenotazioni/griglia?data_inizio=
  oggi&data_fine=domani` (stessa griglia di `/planning-camere`, filtrata
  lato frontend su `data_arrivo`/`data_partenza`), azione check-in/
  check-out via `PATCH /api/prenotazioni/:id/stato` — **nessuna rotta
  backend nuova**, riuso completo degli endpoint del modulo Prenotazioni
  Fase 2A. Check-in ammesso anche a portiere_notte, check-out no (stessa
  regola già in vigore nel pannello dettaglio planning).
- `frontend/app/camere/page.jsx` — tolti i toggle manuali F/P (ora sola
  lettura); pulsante "Segna pronta" abilitato per tutti tranne cuoco.
- `frontend/app/planning-camere/page.jsx` — popup "scopetta"
  (`PopupStatoCamera`): stessa modifica, fermata/partenza da badge
  sola-lettura invece di bottoni, `salva()` non invia più arrivo/partenza
  a `POST /api/camere/stato`.
- `frontend/components/layout/Sidebar.tsx` — nuova voce "Arrivi/Partenze"
  (icona `LogIn`) sotto OSPITALITÀ, tra Prenotazioni e Clienti.

**Test**: `tests/api/camere.test.js` esteso — riscritti i test di
`POST /api/camere/stato` (solo note, arrivo/partenza ignorati senza
errore); nuovo describe "Calcolo automatico fermata/partenza da
soggiorni" con 3 camere/soggiorni dedicati (fermata pura, partenza pura,
turnover) + verifica `GET /api/camere/oggi`; nuovi test permessi
`POST /api/camere/pronta` (cuoco → 403, dipendente/receptionist/
portiere_notte → 200). **536/536 test verdi, 22 suite, confermato dal
titolare** (nessuna regressione sui moduli esistenti).

**Verifica non eseguibile in sandbox**: nessun accesso al PostgreSQL
locale del titolare da questo ambiente — solo sintassi verificata qui
(`node --check` sui file backend, transpile Babel sui file JSX/TSX), la
corsa reale della suite l'ha fatta il titolare in locale.

**Non fatto in questa sessione, deliberatamente** (loggato in
`docs/EVOLUTIVE.md`): riordino più ampio del menu/sidebar (OSPITALITÀ è
arrivata a 7 voci — segnalata anche un'ambiguità preesistente, due voci
"Prenotazioni" diverse in sidebar); pagina "Prenotazioni" dedicata in
forma di tabella; sezione marketing invio email/SMS/WhatsApp.

**Prossimo step**: 5.2 (Pre check-in digitale + OCR + Omnitec) per la
sequenza concordata — verifica finale solo su PC aziendale con Omnitec
installato.

## 04/08/2026 — Menu mobile disallineato + Modulo 5.2 Fase A (scansione documento OCR) — COMPLETATO ✅

**Parte 1 — Bottom nav mobile disallineata dal menu desktop.**

Segnalato dal titolare: da telefono si vedevano solo 5 voci (per il
titolare: Home, Personale, Timbratura, HACCP, Magazzino) mentre il menu
desktop ne ha decine, cresciuto nel tempo con Ospitalità/Impostazioni.
Causa: `VOCI_MOBILE` in `Sidebar.tsx` era una lista fissa, scollegata da
`SEZIONI_MENU` (la fonte del menu desktop), mai aggiornata da quando sono
stati aggiunti quei moduli.

Chiesto al titolare come vuole navigare da telefono tra tante voci: per i
ruoli che vedono tutto (admin/titolare) ha confermato bottom bar + pulsante
"Menu"; per gli altri ruoli stesso meccanismo, ma con le 4 icone rapide
scelte in base all'attività primaria di ciascuno, non riciclando la vecchia
lista. **Fix**: bottom bar ridotta a 4 icone rapide curate per ruolo (es.
receptionist: Timbratura, Arrivi/Partenze, Camere, Clienti — prima puntava
per errore alla pagina prenotazioni *ristorante* invece delle camere) + un
5° pulsante "Menu" che apre un pannello a comparsa con tutte le voci
consentite al ruolo, raggruppate per sezione, letto direttamente da
`SEZIONI_MENU` — non più una seconda lista da mantenere a mano, sarà sempre
completo anche quando si aggiungeranno moduli futuri. **Provvisorio per
esplicita richiesta del titolare**: sia le 4 icone rapide sia, più in
generale, i permessi ruolo↔voci vanno rivisti quando il progetto sarà a
regime — annotato in memoria persistente oltre che qui. Solo `Sidebar.tsx`
toccato, nessuna migration. Verificato con `tsc --noEmit` (pulito), nessun
test automatico dedicato al menu (componente puramente di navigazione).

**Parte 2 — Modulo 5.2 Fase A: scansione documento con OCR, test reale sul
campo.**

Riusato da subito il pattern OCR già esistente in `ztl/page.jsx`
(tesseract.js lato client, foto singola via `capture="environment"`, mai
streaming live per il vincolo HTTPS/LAN già documentato) — nessuna nuova
infrastruttura backend. Chiarito con il titolare che **Omnitec non
c'entra**: è il sistema di chiavi elettroniche per le camere, software
completamente separato senza API note, escluso dallo scope. Confermato
Tesseract.js per l'OCR, Resend per l'invio email della Fase B (rimandata),
form pubblico con token dentro il gestionale (non nel sito). Aggiunto solo
`documento_scadenza` allo schema `ospiti` (migration 024) — la residenza,
proposta inizialmente, non serve per Alloggiati Web e non è stata aggiunta.

Il grosso della sessione è stato iterare sul campo con il titolare
(telefono Android, Galaxy S23, carta d'identità elettronica reale) — una
serie di round di test/fix non anticipabili da codice:

1. **Primi test: OCR completamente inutilizzabile** (testo grezzo
   totalmente senza senso). Diagnosticato passo passo: non era un problema
   di lato della carta (il retro, con la MRZ, era quello giusto fin da
   subito) ma di qualità dello scatto. Aggiunto un secondo tentativo OCR
   automatico con charset ristretto ai caratteri MRZ (`tessedit_char_whitelist`)
   e layout "sparse text" (PSM 11), attivato solo se il primo tentativo
   (layout automatico) non trova nulla.
2. **Primo miglioramento reale**: un tentativo ha letto correttamente
   nome/cognome/data ma con `nazionalità: "1TA"` invece di "ITA" — aggiunta
   `correggiCifreComeLettere()` (0→O, 1→I, 5→S, 8→B), sicura perché il campo
   nazionalità MRZ non può per costruzione contenere cifre.
3. **Regressione apparente** ("tornato come prima"): non era cache stale
   (verificato chiedendo se l'app precompilava anche un solo campo — sì,
   quindi il codice nuovo girava), ma normale variabilità foto-per-foto
   sulla stessa carta lucida/olografica.
4. **Pre-elaborazione immagine aggiunta**: conversione bianco/nero puro con
   soglia di Otsu (si adatta da sola alla luce di ogni scatto, a differenza
   di una soglia fissa) prima di passare l'immagine a tesseract — trovato e
   corretto un bug reale nell'implementazione durante la verifica (uso di
   `<` invece di `<=` nel confronto con la soglia, disallineava la
   classificazione bianco/nero dal calcolo di Otsu stesso).
5. **Debug bloccato dalla UI**: la sezione "testo letto dalla foto" si
   mostrava solo quando l'OCR falliva del tutto — inutile per capire un
   successo parziale/sbagliato. Estesa a mostrarsi sempre in
   `ScannerDocumento.jsx`.
6. **Causa di fondo del "non precompila niente" trovata**: le carte
   lucide perdono spesso i caratteri di riempimento `<` finali (basso
   contrasto) — il controllo che richiedeva righe MRZ di lunghezza ~30
   scartava righe con dati veri solo perché troncate. Aggiunto un
   riconoscimento di riserva in `estraiMrz()` basato sulla FORMA delle
   righe 2/3 del TD1 (pattern data-nascita+sesso+scadenza, pattern
   cognome<<nome) invece che sulla lunghezza — se trovate, si precompila
   anche senza la riga 1 (numero documento, la meno affidabile, vicina al
   codice a barre), lasciata sempre vuota in quel caso.
7. **Richiesta di un ritaglio pre-OCR** (titolare: inquadrare a mano solo
   la fascia MRZ con la fotocamera "non si riesce"): aggiunto in
   `ScannerDocumento.jsx` uno step tra scatto e OCR — foto intera mostrata
   con due maniglie orizzontali trascinabili (`touch-action: none`,
   pointer/touch events), ritaglio fatto via Canvas (percentuali →
   pixel reali dell'immagine originale) prima di invocare `leggiDocumento`.
   Miglioramento netto: da quel punto in poi le letture hanno iniziato a
   restituire più campi corretti.
8. **Confrontato con ricerca di mercato** (competitor: RoomRaccoon, Chekin,
   Slope "iD Scan", Scidoo usano la stessa tecnica foto+OCR, non hardware;
   Regula/DENSO WAVE sono lettori hardware dedicati, più affidabili per via
   di ottica/distanza fissi) e con una checklist esterna portata dal
   titolare — entrambi confermano che l'approccio preso (binarizzazione,
   whitelist caratteri, ritaglio) è quello giusto; unica voce non ancora
   provata era il modello Tesseract ("fast" vs "best" — non applicabile,
   tesseract.js usa già "best" di default).
9. **Bug di parsing trovato con un caso reale** (`MURO<S<MICHELE<<<LLLKLS`
   invece di `MURO<<MICHELE<<<<<<`): il separatore cognome/nome atteso
   `<<` esatto falliva con rumore OCR nel mezzo. Riscritto il parsing per
   dividere su QUALSIASI sequenza di `<` invece che su `<<` letterale —
   risultato peggiore ma non vuoto (es. "S MICHELE LLLKLS" invece di
   "MICHELE"), sempre meglio di un campo vuoto dato che resta sempre
   correggibile a mano.
10. **Test del modello Tesseract specializzato OCR-B** (su richiesta del
    titolare, "poi ci fermiamo"): estratto un solo file
    (`mrz.traineddata.gz`, 1,3 MB) dal pacchetto npm open source
    `web-mrz-reader` (licenza ISC) e ospitato in questo repository
    (`frontend/public/tessdata/`) — non installato il pacchetto intero,
    che dipende da tesseract.js v5 e sarebbe entrato in conflitto con la
    v7 già in uso per ZTL. Usato come terzo tentativo automatico in
    `ocrDocumento.js`, worker dedicato con `langPath` proprio. Risultato:
    nessun miglioramento netto rispetto al modello generico — confermato
    che il numero documento resta il campo strutturalmente meno
    recuperabile (per scelta, non lo si tenta più da quella riga).

**Esito finale, confermato dal titolare su documento reale**: cognome,
sesso, data di nascita, data di scadenza e nazionalità si precompilano in
modo affidabile; il nome a volte richiede una correzione manuale minore
(separatore letto con rumore); il numero documento non si precompila mai,
per scelta. Il form resta sempre interamente compilabile a mano. Il
titolare ha chiuso qui la Fase A e valuterà in futuro un lettore ottico
hardware dedicato se servirà maggiore affidabilità (annotato in
`docs/EVOLUTIVE.md`).

**File toccati**: `frontend/lib/ocrDocumento.js` (pre-elaborazione Otsu,
tre tentativi OCR, parsing tollerante, modello OCR-B), 
`frontend/components/ui/ScannerDocumento.jsx` (step di ritaglio, testo
grezzo sempre visibile), `frontend/public/tessdata/mrz.traineddata.gz`
(nuovo asset statico), `frontend/components/layout/Sidebar.tsx` (menu
mobile). Nessuna migration in questa parte (la migration
`documento_scadenza` era già stata fatta a inizio sessione, vedi sopra).
Nessun test automatico nuovo per l'OCR: è un componente client-side con
input reale (foto/canvas/tesseract.js) difficile da testare in modo
significativo con Jest — la rete di sicurezza è che il form resta sempre
completamente modificabile dall'operatore prima del salvataggio, non un
test automatico sulla precisione della lettura.

**Non fatto in questa sessione, deliberatamente**: Fase B del modulo 5.2
(form self-service da remoto con token pubblico + email automatica via
Resend) — rimandata, nessuna data concordata per riprenderla.

**Prossimo step**: nessuno concordato esplicitamente — il titolare valuterà
se procedere con 5.3 (email/SMS automatici, solo parte non legata al
booking engine) o tornare su 1.10 (deploy VPS) o altro, quando vorrà.

## 04/08/2026 — Modulo 5.3 (email automatiche) + estensione Testi email/Offerte — COMPLETATO ✅

Il titolare ha scelto di procedere con 5.3, limitato a email (niente SMS —
provider a pagamento, fuori dalla sequenza di moduli gratuiti). Provider:
Resend (free tier, 3000 email/mese), dominio ancora di test in questa
sessione (`onboarding@resend.dev`, invii solo verso l'email dell'account
Resend finché non si verifica un dominio proprio).

**Parte 1 — le 3 email automatiche.** Migration `025_email_prenotazioni.sql`
(3 colonne timestamp `email_*_inviata_at` su `prenotazioni`, usate sia come
segno "già inviata" per idempotenza sia come traccia di audit).
`backend/lib/resendClient.js` (fetch nativo verso l'API Resend, nessuna
dipendenza nuova). `backend/lib/emailPrenotazioni.js`: tre funzioni
(conferma/promemoria/recensione), ciascuna "best effort" — logga e ritorna,
mai lancia, non deve mai far fallire una transizione di stato o bloccare un
job. Conferma agganciata a `prenotazioniController.aggiornaStato` in modo
fire-and-forget (chiamata DOPO `res.json()`, mai attesa). Promemoria/
recensione partono da un job giornaliero, `backend/jobs/promemoriaEmail.js`
(node-cron, nuova dipendenza — era già anticipata in EVOLUTIVE.md per
un'altra funzionalità), avviato solo in `server.js` (mai in `app.js`, quindi
mai durante i test Jest). Recipient: referente del gruppo se la prenotazione
appartiene a un gruppo, altrimenti l'ospite capofamiglia del primo
soggiorno. Test in `tests/api/email-prenotazioni.test.js`, con
`RESEND_API_KEY` esplicitamente rimossa per la durata della suite —
nessuna email vera durante i test automatici, indipendentemente dal
contenuto reale di `backend/.env`.

**Parte 2 — pulsante di test manuale.** Il titolare ha verificato in locale
che la conferma funziona, ma promemoria/recensione partono solo dal job in
base a date calcolate — scomodo da testare senza manipolare il DB. Aggiunto
`POST /api/prenotazioni/:id/test-email` (nuova azione `test_email` in
`shared/ruoli.js`, riservata ad admin/titolare), che chiama le stesse
funzioni di invio ma ATTESE (non fire-and-forget), per mostrare l'esito
reale. Tre pulsanti nel pannello dettaglio di `/planning-camere`, visibili
solo ad admin/titolare, bypassano stato/date reali della prenotazione.

**Parte 3 — estensione: testi editabili + offerte dedicate.** Il titolare,
dopo aver verificato che il pulsante di test funziona, ha chiesto di poter
gestire i testi delle 3 email da UI (con un footer "più corposo" coi dati
dell'hotel) e di poter inviare offerte dedicate ai clienti. Chiarito con
domande mirate: oggetto+corpo testo semplice (non HTML) con placeholder;
offerte sia a clienti specifici sia broadcast a tutti quelli con consenso;
storico degli invii.

Migration `026_template_email_offerte.sql`: `email_template` (le 3 righe,
seed coi testi già in uso, editabili da `PATCH /api/email-template/:tipo`),
`impostazioni_email` (riga singola, footer condiviso: indirizzo, telefono,
email, sito, `logo_url` opzionale), `offerte_email` +
`offerte_email_destinatari` (storico, un record per destinatario con esito
individuale). Nuovo `backend/lib/emailLayout.js`: involucro HTML e footer
condivisi tra le email automatiche e le offerte (prima l'involucro viveva
solo dentro `emailPrenotazioni.js`), più `renderizzaCorpoEmail()` che
sostituisce `{nome_ospite}`/`{elenco_soggiorni}`/`{hotel}` nel testo salvato
— stessa funzione usata sia dall'invio reale sia dal pulsante di test, mai
duplicata. `emailPrenotazioni.js` riscritto per leggere oggetto/corpo da
`email_template` invece di stringhe fisse. Nuovo `backend/lib/offerteEmail.js`
per l'invio delle offerte: filtro `consenso_marketing = true` SEMPRE
applicato lato backend, anche in selezione manuale — un cliente scelto a
mano senza consenso viene escluso e segnalato (`esclusi` nella risposta),
mai inviato comunque. Invio sincrono con una pausa di 150ms tra un
destinatario e l'altro (prudenza, non un limite reale di Resend).

Due pagine nuove, entrambe riservate ad admin/titolare (nuove sezioni
`email_template`/`offerte_email` in `shared/ruoli.js`): Impostazioni ▸
Testi email (`/impostazioni/email`, 3 blocchi oggetto/corpo + pulsante
"testo predefinito" + sezione footer) e una sezione sidebar nuova,
MARKETING ▸ Offerte (`/marketing/offerte`, compose + selezione destinatari
+ storico con dettaglio per destinatario). Nota sul logo: il gestionale è
raggiungibile solo da LAN (1.10 Deploy VPS non ancora fatto), quindi
un'immagine ospitata lì non sarebbe visibile ai destinatari reali — il
campo `logo_url` accetta solo un URL pubblico esterno incollato a mano,
lasciato vuoto di default.

Test: `tests/api/email-template.test.js` (permessi, validazione, salvataggio
e rilettura — righe seedate dalla migration, valore originale salvato e
ripristinato in `afterAll` per non alterare i testi reali);
`tests/api/offerte-email.test.js` (permessi, validazione, esclusione per
mancato consenso). Deliberatamente NON testata in automatico la modalità
"tutti i clienti con consenso": in un DB di sviluppo reale può contenere
clienti veri con consenso attivo, e un test scriverebbe righe reali nello
storico di produzione — verificata manualmente dal titolare via UI.

**Verificato dal titolare in locale**: migration applicata, testi
modificati e persistenti da UI, email di prova inviata e ricevuta
correttamente.

**File toccati (riepilogo)**: `database/migrations/025_email_prenotazioni.sql`,
`026_template_email_offerte.sql`; `backend/lib/resendClient.js`,
`emailPrenotazioni.js` (riscritto), `emailLayout.js` (nuovo),
`offerteEmail.js` (nuovo); `backend/jobs/promemoriaEmail.js`;
`backend/controllers/prenotazioniController.js` (conferma + test-email),
`emailTemplateController.js` (nuovo), `offerteEmailController.js` (nuovo);
`backend/routes/prenotazioni.js`, `emailTemplate.js` (nuovo),
`offerteEmail.js` (nuovo); `backend/server.js`, `backend/app.js`,
`backend/.env.example`; `shared/ruoli.js`; `frontend/app/planning-camere/page.jsx`
(pulsanti di test), `frontend/app/impostazioni/email/page.jsx` (nuovo),
`frontend/app/marketing/offerte/page.jsx` (nuovo),
`frontend/components/layout/Sidebar.tsx` (sezione MARKETING); test in
`tests/api/email-prenotazioni.test.js`, `email-template.test.js`,
`offerte-email.test.js`.

**Non fatto in questa sessione, deliberatamente**: SMS/WhatsApp (provider a
pagamento); invio offerte come job in background (oggi sincrono, va bene
per liste piccole — vedi `docs/EVOLUTIVE.md`); dominio Resend verificato
(resta sandbox); parte di 5.3 legata al booking engine (bloccata da WuBook,
non ancora sottoscritto).

**Prossimo step**: nessuno concordato esplicitamente — il titolare valuterà
se procedere con 5.2 Fase B (pre check-in self-service da remoto, può
riusare Resend già configurato), 2.5 Fase 2 (schedina Alloggiati Web),
2.6 (ROSS1000, ancora in pausa) o 1.10 (deploy VPS), quando vorrà.

---

## 06/08/2026 — Nuovo modulo: Manutenzione/guasti (evolutiva competitiva)

Prima voce sviluppata dalla lista "evolutive competitive" (gap vs Mews/
Cloudbeds/RoomRaccoon, aggiunta il 05/08/2026 a `docs/EVOLUTIVE.md`) — non
faceva parte della roadmap originale di CLAUDE.md Sezione 8. Il titolare ha
chiesto esplicitamente: segnalazione aperta a tutto il personale, pagina
dedicata.

**Design deciso col titolare prima di scrivere codice**: gestione stato
(presa in carico/risolta) riservata ad admin/titolare, non a chi segnala;
luogo = camera (selezione dalla lista) oppure una delle aree comuni fisse
dell'hotel (bar, sala ristorante, cucina, lavanderia, lavaggio piatti,
magazzino, garage, altro — lista corretta in corsa: "sale" tolta, aggiunto
"magazzino"); foto opzionale (riusa multer, stesso pattern di
`archivioController.js`); alert in Dashboard per segnalazioni aperte/in
lavorazione, stesso criterio già in uso per le scadenze HR (rosso se
priorità alta).

**File nuovi**: `database/migrations/030_segnalazioni_manutenzione.sql`,
`backend/controllers/manutenzioneController.js`,
`backend/routes/manutenzione.js`, `frontend/app/manutenzione/page.jsx`,
`tests/api/manutenzione.test.js`. **File modificati**: `backend/app.js`,
`shared/ruoli.js`, `frontend/lib/ruoli.js`,
`frontend/components/layout/Sidebar.tsx`,
`backend/controllers/dashboardController.js`.

**Bug reale trovato dai test, non anticipabile da codice**: `PATCH
/api/manutenzione/:id/stato` falliva sempre con 500. Causa: la query
`UPDATE` usava il parametro `$1` sia in `SET stato = $1` sia dentro `CASE
WHEN $1 = 'risolta' THEN now() ELSE risolta_il END` — PostgreSQL non
riesce a dedurre un tipo unico per `$1` tra `character varying` (colonna
`stato`) e `text` (il confronto letterale) e rifiuta la query già in fase
di parsing, prima di guardare il valore reale (per questo falliva anche
con `in_lavorazione`, non solo con `risolta`). Corretto con un cast
esplicito: `CASE WHEN $1::VARCHAR = 'risolta' ...`.

**Test generati a mano, non con lo script agente**: `node
tests/agent/genera-test.js manutenzione` ha fallito per credito esaurito
sull'account Anthropic API configurato in `backend/.env` (separato
dall'abbonamento usato per questa sessione stessa) — non risolvibile da
qui, richiede ricarica su console.anthropic.com. Scritti a mano invece,
stesso schema di copertura richiesto da CLAUDE.md Sezione 9 (auth,
validazione, logica business, permessi per ruolo). Punto tecnico non
ovvio: i token sintetici di `tests/helpers/auth.js` (`authHeader.titolare()`
ecc.) usano id utente fissi (1-7) che non è garantito esistano nel DB reale
del titolare dopo mesi di uso — `segnalato_da`/`gestito_da` hanno una FK su
`users(id)`, quindi le operazioni di scrittura usano invece un utente
reale creato ad hoc con l'helper `creaUtenteDiTest` (già esistente nel
progetto, mai usato finora per questo scopo). **20/20 test verdi,
confermati dal titolare in locale.**

**Scoperta separata, non causata da questa sessione**: preparando il
commit sono emersi 109 file mai committati — sostanzialmente tutti i
moduli da 2.2 in poi (tariffe, pacchetti, Alloggiati Web, pre check-in,
ROSS1000, offerte email, CampoData, scanner OCR documento) esistevano solo
su disco, senza alcuna rete di sicurezza di versionamento. Su richiesta
del titolare, gestito con un commit di recupero storico separato dal
commit pulito del modulo Manutenzione — **verificare al prossimo giro che
entrambi i commit siano stati effettivamente pushati**, non dato per
scontato qui essendo un'operazione lasciata al titolare (i comandi git
dal sandbox lasciano un `.git/index.lock` che né titolare né assistente
riescono a rimuovere in modo pulito — causa mai isolata con certezza,
vedi anche il repo `sito-hotel` per lo stesso sintomo).

**Non fatto in questa sessione, deliberatamente**: nessuna delle altre due
voci "evolutive competitive" priorità alta (CRM ospiti con preferenze/tag,
upsell automatico in-stay) — il titolare ha chiesto di sviluppare prima
solo il modulo manutenzione.

---

## 06/08/2026 — Workflow git/test/deploy, fix ristorante+magazzino, dashboard

**Decisione di workflow (non tecnica, ma permanente)**: da questa sessione
in poi, Cowork progetta e scrive il codice; il tab "Code" (Claude Code
nativo sul PC del titolare, nessun ponte di sincronizzazione) esegue git,
test e deploy del sito — mai più `git` dal sandbox Cowork su questi due
repo, nemmeno in sola lettura (`git status`/`diff` inclusi: hanno
riprodotto lo stesso `.git/index.lock` visto con i comandi di scrittura).
Dettaglio completo del perché: memoria persistente
`feedback_git_write_sito_hotel_da_marco.md`.

**Ristorante — DELETE configurazione sala** (gap segnalato in
`docs/EVOLUTIVE.md`, mai implementato prima: non c'era proprio nessun
endpoint, non solo "senza blocco"). Aggiunto `DELETE
/api/ristorante/config/:id` (`salaController.js` + `routes/ristorante.js`
+ bottone in `frontend/app/sala/page.jsx`): blocca se la configurazione è
quella Standard (`is_default`), se è quella attualmente attiva, o se ha
ancora tavoli associati (il vincolo FK `tavoli.configurazione_id` senza
`ON DELETE` protegge comunque a livello DB, il controllo esplicito serve
solo per un messaggio di errore leggibile invece del 500 generico).

**Bug reale trovato testando il fix sopra — `frontend/lib/api.js`**: la
nota in `docs/EVOLUTIVE.md` (sessione 17/07/2026) dava per risolto un
disallineamento chiave `errore`/`error` tra backend e frontend. Non era
vero, o è regredito: verificato con un conteggio reale, 22 file controller
su 40 rispondono `{ errore: ... }` (italiano, 230 occorrenze) contro 18
che rispondono `{ error: ... }` (inglese, 170 occorrenze) — `api.js`
leggeva solo `.error`, quindi per circa metà del gestionale l'utente ha
sempre visto "Errore {status}" generico invece del messaggio specifico del
controller, incluso il nuovo DELETE configurazione sala appena scritto.
Corretto in un punto solo, senza toccare 40 controller: `api.js` ora legge
`json?.errore || json?.error`. Non urgente uniformare i controller a una
sola chiave.

**Magazzino — 3 evolutive da `docs/EVOLUTIVE.md`, tutte in un colpo**
(storico prezzi, alert scadenze progressivi, bozza ordine fornitore
automatica): 3 nuovi endpoint GET (`storico-prezzi/:id`, `scadenze`,
`bozza-ordine`) + UI in `frontend/app/magazzino/page.jsx` (banner
scadenze, storico prezzi al tap su un prodotto, bottone "Bozza ordine
fornitori" visibile solo se c'è qualcosa sotto soglia). Limite reale non
risolvibile senza una migration: `prodotti` non ha un fornitore fisso in
anagrafica, quindi il fornitore per riga nella bozza ordine è inferito
dall'ultimo carico ricevuto per quel prodotto — se non esiste, il prodotto
finisce in un gruppo "Fornitore non determinato" invece di sparire.

**Dashboard — 3 nuovi alert**, decisi col titolare dopo che gli ho
riassunto cosa mostrava oggi (KPI + alert esistenti, nessuna sorpresa
tecnica lì): prenotazioni in opzione con scadenza entro 48h (promemoria,
nessun cambio di stato — il cron di scadenza automatica resta un'evolutiva
separata), ospiti in arrivo oggi con documento incompleto per Alloggiati
Web (sostituisce la richiesta letterale "invii Alloggiati Web in sospeso":
quella tabella è sempre vuota perché il modulo 2.5 Fase 2 non è ancora
iniziato, un alert lì sarebbe finto), pre check-in compilati in attesa di
revisione reception. **Deliberatamente non aggiunto**: un quarto alert per
export ROSS1000 in sospeso — non esiste nessun log di quando è stato
generato l'ultimo export, servirebbe una tabella nuova; il titolare ha
deciso di rimandarlo a quando il gestionale sarà operativo con dati reali
(dopo 1.10 Deploy VPS).

**Sito (`sito-hotel`) — pulsante WhatsApp flottante**: link diretto
`wa.me` (nessuna WhatsApp Business API, decisione esplicita del titolare —
prima il link gratuito, l'automazione si valuta più avanti separatamente),
`components/ui/WhatsAppButton.tsx`, numero da `infoHotel.telefonoMobile`
(Sanity). Stesso pattern del competitor locale Hotel Florida (verificato
via ricerca: usa `wa.link`, non un'integrazione più complessa). Telegram
richiesto insieme ma non fatto — confermato dal titolare che l'hotel non
ha un account Telegram.

**Iubenda (privacy/cookie policy sito) — approfondito, non implementato**:
verificato via ricerca che il competitor locale Hotel Florida usa
esattamente Iubenda (non un legale, non testo homemade), probabilmente
configurato dalla loro agenzia web come pacchetto standard. Il titolare
vuole creare l'account con la mail aziendale, non disponibile in questa
sessione — rimandato. Nota utile per quando riprende: il piano Free di
Iubenda (<1.000 pageview/mese) probabilmente copre già il sito oggi, dato
il traffico quasi nullo sul dominio provvisorio Vercel.

---

## 09/08/2026 — Modulo 1.10: Deploy VPS netcup — COMPLETATO TECNICAMENTE ✅

Sessione interamente eseguita in diretta con l'utente, comandi copiati/
incollati passo-passo su una sessione SSH — nessun accesso diretto al
server da questa sessione Cowork (limite di rete del sandbox: niente SSH
in uscita). Guida operativa completa, pensata per essere usata da sola in
futuro senza rileggere questa cronologia: `docs/DEPLOY_VPS_NETCUP.md`.

**Provider confermato netcup** (non Hetzner, non Aruba — dettaglio
decisionale completo in `docs/PIANO_MIGRAZIONE_DICEMBRE_2026.md` Fase 1,
incluso l'account Aruba sconosciuto legato alla P.IVA dell'hotel, non
ancora chiarito). VPS Lite 1 G12s, Norimberga, Debian 13 (trixie) di
default (non Ubuntu, non selezionabile in fase d'ordine).

**Problemi reali incontrati e risolti (non nell'ordine di un piano
teorico, nell'ordine in cui sono emersi facendo):**

- **netcup ha due portali separati** (CCP fatturazione, SCP tecnico), non
  documentato in modo ovvio — scoperto solo dopo che l'utente non trovava
  nessuna sezione "Server" nel portale sbagliato (CCP).
- **Copia della chiave SSH fallita silenziosamente**: `type file | ssh
  host "cat >> ..."` da PowerShell Windows non trasferisce il contenuto
  (limite noto del modo in cui PowerShell inoltra le pipe a un eseguibile
  esterno) — `authorized_keys` restava a 0 byte senza errori visibili.
  Fix: copia-incolla manuale del contenuto invece del piping.
- **Incolla multi-riga da PowerShell in una shell remota inaffidabile**:
  più comandi incollati insieme senza andare a capo si sono fusi in uno
  solo più volte (es. un `sed` è diventato `sed...sql_configsed...`).
  Regola adottata per tutta la sessione: un comando per riga, un incolla
  alla volta, aspettare il prompt. Per contenuti multi-riga veri (file di
  configurazione), usare `nano` invece di heredoc/piping da shell — dentro
  un editor il rischio di fusione tra righe non esiste.
- **bcrypt e sharp**: npm 11 blocca di default gli script di installazione
  dei pacchetti nativi (`npm warn allow-scripts`). Senza approvarli
  esplicitamente (`npm approve-scripts --allow-scripts-pending`), bcrypt
  non avrebbe funzionato (login rotto) e sharp nemmeno (ottimizzazione
  immagini Next.js rotta) — scoperto leggendo l'output invece di ignorare
  un warning che sembrava innocuo.
- **`!` nella password rompe bash**: `set +H` necessario, e va rilanciato
  in ogni nuova sub-shell aperta con `su` (non eredita dalla shell padre).
- **Le migration non ricostruiscono lo schema da un database vuoto**:
  scoperto provando a rieseguire le 30 migration in ordine su un database
  pulito — mancano CREATE TABLE iniziali (es. `ztl_prenotazioni`, mai
  creata da nessun file della cartella `migrations/`) e l'ordine di
  `sort -V` non è quello di esecuzione corretto (`005b` prima di `005`).
  Cambiato approccio: `pg_dump` del database locale di sviluppo (fonte di
  verità reale, testato da mesi) → `scp` → `psql -f` sul server, invece di
  rincorrere l'ordine delle migration. **Da approfondire in una sessione
  futura, non urgente**: perché la cartella migrations non è completa (chi
  ha creato `ztl_prenotazioni` e quando, se non un file versionato).
- **`REASSIGN OWNED BY postgres` fallito** su oggetti creati da estensioni
  (`btree_gist`) — comportamento noto di PostgreSQL, non un errore.
  Risolto con `GRANT ALL PRIVILEGES` invece di trasferire la proprietà.
- **Kit di deploy preparato in sessione precedente (15/07/2026,
  `files-deploy-vps/` nel repo) conteneva un bug reale**: il regex Nginx
  per instradare le SSE del monitor cucina/sala cercava
  `/api/(sala|cucina|ristorante)/sse`, ma verificato contro il codice
  reale (`backend/controllers/comandeController.js`) gli endpoint veri
  sono `/api/ristorante/cucina/stream` e `/api/ristorante/sala/stream` —
  corretto prima di attivare la configurazione, altrimenti il monitor
  cucina si sarebbe rotto silenziosamente in produzione.
- **`.env` disallineato da quanto documentato in CLAUDE.md §7**: il codice
  reale usa `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` separati, non un
  `DATABASE_URL` unico, e non usa affatto `JWT_REFRESH_SECRET` né
  `ENCRYPTION_KEY` nonostante siano elencati come richiesti — la sezione
  del documento non è mai stata allineata al codice. Non bloccante, da
  chiarire in una sessione dedicata.

**Risultato finale verificato**: `https://hdgolfo-gestionale.com`
raggiungibile, certificato Let's Encrypt valido (scadenza 07/11/2026,
rinnovo automatico configurato da certbot), backend connesso al database
reale (dump dal locale, non le migration), PM2 persistente al riavvio
(systemd), backup notturno locale programmato (cron 03:00, 14 giorni di
storico). Verificato anche da questa sessione Cowork via richiesta HTTP
diretta (non solo dall'utente).

**Non completato in questa sessione, elenco completo in
`docs/DEPLOY_VPS_NETCUP.md` §10**: audit di sicurezza pre-produzione
(obbligatorio per §7 prima di considerare il modulo davvero chiuso — il
backend ha segnalato 8 vulnerabilità npm, 1 critica, mai esaminate);
backup offsite su Backblaze B2 (account non ancora creato, oggi il backup
è solo locale sullo stesso server); test di ripristino reale di un
backup; primo aggiornamento dell'app in produzione (sequenza scritta ma
mai eseguita davvero).

### Audit di sicurezza pre-produzione — COMPLETATO ✅ (stessa giornata, 09/08/2026)

Ultimo checkpoint della Fase 1 (§7 di CLAUDE.md), fatto subito dopo il
deploy invece di rimandarlo a una sessione separata.

**npm audit backend**: 9 vulnerabilità segnalate durante l'installazione.
Risolte senza breaking change con `npm audit fix`: `body-parser`,
`brace-expansion` (×2), `ip-address` (usata da `express-rate-limit` per
identificare l'IP client — rilevante perché un bug qui poteva in teoria
aiutare a bypassare il rate limit). Lasciate come rischio accettato dopo
analisi, non per pigrizia:
- `tar`/`@mapbox/node-pre-gyp`/`bcrypt` (severità "critica" sulla carta) —
  catena usata solo per compilare il binario nativo di bcrypt in fase di
  `npm install`, mai eseguita a runtime, non raggiungibile da nessun input
  utente.
- `uuid`/`node-cron` (moderata) — `node-cron` la usa internamente per
  generare id dei job pianificati, mai con input controllabile da un
  utente esterno.
- `xlsx`/SheetJS (alta, **nessuna correzione disponibile** — i
  manutentori hanno smesso di pubblicare fix su npm) — verificato dove
  viene usata: `ztlController.js` la usa per **importare** file Excel
  reali (`xlsx.read(req.file.buffer...)`), superficie di attacco vera
  (prototype pollution/ReDoS su un file caricato), ma l'endpoint
  `/api/ztl/import` è protetto da `soloTitolare` — rischio limitato a un
  account admin/titolare compromesso o ingannato, non aperto a chiunque.
  **Scoperta collaterale**: `CLAUDE.md` §2 dice che il progetto usa
  `exceljs` per gli export — falso, `exceljs` non è nemmeno tra le
  dipendenze, si usa `xlsx` ovunque (anche per gli export di tassa di
  soggiorno e timbrature, uso più sicuro perché lì il contenuto lo genera
  il server, non lo legge da un file caricato). Da correggere la
  documentazione; valutare migrazione a `exceljs` in una sessione
  dedicata, non urgente.

**npm audit frontend**: 6 vulnerabilità, tutte nella versione di Next.js
installata (16.2.9) o nelle sue dipendenze bundlate (postcss, sharp) —
incluse una SSRF nei rewrite e una disclosure di endpoint interni delle
Server Function. Fix (`next@16.3.0`) segnalato da npm come "outside the
stated dependency range": non forzato in questa sessione, va testato in
locale (build + verifica funzionale) prima di toccare il server — non
bloccante per il go-live di oggi, ma da programmare presto.

**Controllo diretto sul codice** (non solo dipendenze):
- SQLi: nessuna query costruita con concatenazione/interpolazione di
  input utente su tutti i 38 controller del backend (verificati anche i
  17 aggiunti dopo l'audit del 15/07: alloggiati, ross1000, manutenzione,
  pre-checkin, offerte email, testi email, nuclei familiari).
- XSS: zero `dangerouslySetInnerHTML`/`.innerHTML =`/`eval(` in tutto il
  frontend.
- IDOR/autorizzazione: tutte le nuove route hanno `router.use(verificaToken)`
  + `richiedeAzione` per-endpoint, stesso pattern delle route più vecchie.
- **Approfondimento mirato sulle route pubbliche di pre-checkin**
  (`/api/pre-checkin-pubblico/:token`, l'unica superficie del gestionale
  raggiungibile senza login per design): token generato con
  `crypto.randomBytes(32)` (256 bit, infattibile da indovinare), salvato
  in DB solo come hash SHA-256 (`backend/lib/preCheckin.js`, stesso
  pattern di `refresh_tokens`), rate limit dedicato (30 richieste/15min
  per IP), ogni ospite inviato viene validato contro l'insieme dei
  soggiorni realmente collegati a quel token prima dell'INSERT — non si
  può agganciare dati a una prenotazione diversa. Un nuovo invio invalida
  sempre il precedente (comportamento intenzionale, già noto). Nessun
  problema trovato.
- Secret hardcoded o log di dati sensibili (password/token/documento in
  chiaro): nessuno trovato.

**Bug reale trovato e corretto**: `FRONTEND_URL` non era mai stata
impostata nel `.env` di produzione. Impatto doppio — restringe il CORS in
produzione (`backend/app.js`, mitigato comunque dal fatto che l'auth
principale usa header `Authorization: Bearer`, non un cookie inviato
automaticamente dal browser, e il cookie di refresh ha già
`sameSite: strict`) — e soprattutto genera i link del pre-checkin inviati
via email agli ospiti reali (`backend/lib/preCheckin.js`): senza,
sarebbero stati link tipo `http://localhost:7000/...`, **inutilizzabili
per un ospite vero**. Bug funzionale silenzioso, non solo di sicurezza.
Corretto: `FRONTEND_URL=https://hdgolfo-gestionale.com` in
`backend/.env`, backend riavviato e riverificato (database riconnesso
correttamente, nessun errore nei log).

Dettaglio completo e aggiornato: `docs/DEPLOY_VPS_NETCUP.md` §10.

### Login rotto subito dopo l'audit — 2 bug reali, entrambi mai visibili prima del primo test vero

L'audit di sicurezza aveva verificato codice e configurazione, ma nessuno
aveva ancora provato un vero login attraverso Nginx (solo la home page era
stata testata). Il titolare l'ha fatto subito dopo, ed è emerso che
l'intera API era irraggiungibile — due bug distinti, entrambi presenti fin
dal primo deploy, mascherati dal fatto che la home funzionava lo stesso
(non fa chiamate `/api`):

1. `frontend/lib/api.js` chiamava il backend su una porta diretta
   (`:7001`), corretto per l'uso in LAN ma non raggiungibile in produzione
   (porta chiusa dal firewall, nessun certificato SSL lì) — corretto
   distinguendo produzione (percorso relativo, via Nginx) da sviluppo
   (porta esplicita, invariato).
2. Il blocco Nginx `location /api/` aveva `proxy_pass` con la barra
   finale, che fa perdere il prefisso `/api/` prima di raggiungere
   Express — ogni endpoint rispondeva 404. Il blocco SSE non aveva questo
   problema (nessuna barra finale lì), motivo per cui non era stato
   notato prima.

Dettaglio tecnico completo di entrambi: `docs/DEPLOY_VPS_NETCUP.md` §4 e
§5. **Il fix di `lib/api.js` è stato applicato prima come hotfix diretto
sul server, poi corretto anche nel sorgente locale** — da verificare che
sia stato committato dal tab Code prima del prossimo `git pull` sul
server, altrimenti l'hotfix rischia di sparire.

**Lezione per i prossimi deploy**: verificare sempre almeno una chiamata
API reale (non solo la home page) prima di considerare un deploy
verificato — la home che risponde non garantisce che il reverse proxy
instradi correttamente anche `/api`.

### Login utente reale (carmine.muro) — altri 3 bug reali trovati e corretti

Il titolare admin era riuscito a entrare subito dopo i due fix sopra, ma
un secondo utente reale (`carmine.muro@hotel.it`, ruolo titolare) non
riusciva ad accedere — indagine che ha scoperto una catena di bug
indipendenti, ciascuno mascherato dal precedente finché non è stato
corretto:

1. **`backend/app.js` — `trust proxy` mancante**: Express non si fidava
   di Nginx come reverse proxy, e `express-rate-limit` (con l'header
   `X-Forwarded-For` sempre presente dietro Nginx) lanciava
   `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` invece di identificare
   correttamente l'IP del client — effetto collaterale reale: tutte le
   richieste sembravano arrivare dallo stesso IP (quello locale di
   Nginx), quindi il rate limit del login (5 tentativi/15min) veniva
   condiviso da **tutti** gli utenti insieme invece che per singolo IP.
   Fix: `app.set('trust proxy', 1)` subito dopo la creazione dell'app.
2. **`frontend/app/login/page.jsx` — stessa famiglia del bug
   `errore`/`error`** già noto nel progetto (vedi nota 06/08/2026 più
   sopra su `lib/api.js`), ma in un punto mai toccato da quella
   correzione: leggeva `err?.response?.data?.error` (inglese), mentre
   `authController.js` risponde sempre con `{ errore: '...' }`
   (italiano) — un commento nel codice diceva di averlo già sistemato il
   31/07/2026, ma quella correzione aveva la direzione sbagliata.
   Risultato pratico: qualunque errore di login (anche solo password
   sbagliata) mostrava il fallback generico "Errore di connessione.
   Riprova." — il messaggio che ha inizialmente fatto pensare a un
   problema di rete. Fix: usa direttamente `err?.message` (già calcolato
   correttamente da `lib/api.js`), invece di duplicare la stessa logica
   di estrazione chiave lì.
3. **`frontend/lib/api.js` — il bug vero dietro tutto**: la regola "su
   401 cancella il token e reindirizza a `/login`" (pensata per la
   sessione scaduta su una pagina protetta) scattava **anche sulla
   chiamata di login stesso** quando la password è sbagliata (anche
   quella risponde 401) — la funzione restituiva `undefined` invece di
   lanciare un errore, e `AuthContext.login()` andava in crash provando a
   leggere `res.data` da un `res` indefinito ("Cannot read properties of
   undefined"). Era la causa reale fin dall'inizio: prima del fix #2
   sopra il crash veniva mascherato dal fallback generico "Errore di
   connessione", dopo il fix #2 si è visto l'errore tecnico grezzo. Fix:
   esclusa la rotta `/auth/login` dalla regola di redirect automatico
   (`path !== '/auth/login'`).
4. **Password di Carmine non recuperabile**: il DB di produzione viene
   dal dump del database di sviluppo (vedi sopra), la password reale non
   era nota. Reimpostata una temporanea via script diretto invece che con
   l'endpoint applicativo (nessuna funzione di reset password lato utente
   — evolutiva futura da considerare). **Primo tentativo di reset fallito
   per corruzione manuale dell'hash bcrypt** copiato a mano in un comando
   `psql` (i caratteri `$` dell'hash si prestano a essere alterati nel
   copia-incolla) — verificato con `bcrypt.compareSync` prima di
   insistere oltre, invece di continuare a far ritentare l'utente alla
   cieca. Rifatto con uno script Node autonomo (hash + UPDATE nello stesso
   passaggio, nessun copia-incolla manuale del valore) — funzionante al
   secondo tentativo. Nota tecnica: lo script iniziale usava `dotenv`,
   non installato in produzione (`npm install --omit=dev` esclude le
   devDependencies) — riscritto con un parser `.env` manuale, poche righe,
   nessuna dipendenza nuova.

**Verificato funzionante**: `carmine.muro@hotel.it` accede correttamente
con la password temporanea impostata. Va comunicata a Carmine con
indicazione di cambiarla appena possibile (nessuna UI di cambio password
in autonomia ancora presente — altra evolutiva da considerare).

### Prossimo step

Fase 1 chiusa, login verificato funzionante dopo i due fix sopra.
**Prima cosa da fare alla prossima sessione**: confermare che
`frontend/lib/api.js` sia stato committato/pushato dal tab Code (vedi
sopra). Poi, prossimo modulo da decidere con il titolare a inizio sessione
(2.3 WuBook, resta bloccato sulla sottoscrizione mai fatta; o altro). In
parallelo, indipendente e non bloccante: chiarire con il commercialista
l'account Aruba sconosciuto sulla P.IVA dell'hotel (vedi
`docs/DOMANDE_APERTE_07-08-2026.md`); valutare l'upgrade a Next.js 16.3.0
e la migrazione da `xlsx` a `exceljs` quando ci sarà una sessione libera
per testarli con calma.

## 10/08/2026 — Audit di sicurezza post-deploy, primi fix

Mentre il titolare aspetta risposta da WuBook e LivelloUno (email inviate
in questa sessione, vedi `docs/RICHIESTA_WUBOOK.md` e
`sito-hotel/docs/RICHIESTA_TRASFERIMENTO_DOMINIO.md`), eseguito un vero
`npm audit` (non solo la lista a memoria dei todo lasciati il 9/8) su
backend, frontend e `sito-hotel`. Trovato di più di quanto atteso:

- **CRITICO, mai emerso prima**: `tar` (dipendenza indiretta di `bcrypt`
  tramite `node-pre-gyp`) vulnerabile a path traversal via hardlink/
  symlink. Verificato che si attiva solo in fase di `npm install`
  (compilazione binario nativo), mai a runtime — rischio pratico basso,
  ma da chiudere comunque. Fix: bcrypt 5→6.0.0, changelog verificato
  (elimina `node-pre-gyp`, richiede solo Node >16 già in uso, hash
  esistenti compatibili al 100% — nessun utente dovrà reimpostare la
  password). **Fatto**: `backend/package.json` aggiornato a
  `"bcrypt": "^6.0.0"`.
- **ALTO, in produzione su entrambi i repo**: Next.js 16.2.9 (gestionale)
  e 16.2.10 (sito-hotel) condividono 9 CVE, tra cui SSRF nei rewrites e
  disclosure non autenticata degli endpoint Server Function interni —
  rilevante ora che il gestionale è raggiungibile da internet, non solo
  LAN. **Fatto**: entrambi i `package.json` aggiornati a `"next": "16.3.0"`
  (e `eslint-config-next` allineato su sito-hotel).
- **ALTO, senza fix disponibile**: `xlsx` (SheetJS) — prototype pollution
  + ReDoS, nessuna patch dal maintainer. Mitigato dall'endpoint già
  ristretto a `soloTitolare`, ma resta un problema strutturale. **Non
  toccato in questa sessione** — richiede la migrazione a `exceljs` sul
  controller import ZTL, non un bump di versione: da fare con calma,
  testata, non a caldo insieme al resto.
- Minori: dompurify/nanoid (frontend gestionale) e la toolchain CLI di
  Sanity (js-yaml/adm-zip/uuid, solo build-time, non codice servito ai
  visitatori) — si risolvono da soli con `npm audit fix` in fase di
  install, nessun edit manuale necessario.

Solo i `package.json` sono stati modificati da qui (Cowork) — `npm
install`, l'esecuzione della suite di test e il commit/push restano al
tab Code, come da convenzione (vedi voce 06/08/2026). Vedi il blocco di
comandi lasciato al titolare per il tab Code.

### Prossimo step

Confermare che il tab Code abbia eseguito `npm install` su tutti e tre i
package, che i test passino (in particolare login/auth per via del bump
bcrypt) e che tutto sia stato committato e pushato/deployato. Poi:
migrazione `xlsx`→`exceljs` quando c'è una sessione dedicata; resto della
lista in `docs/DOMANDE_APERTE_07-08-2026.md`.

---

## 10/08/2026 — Modulo Addebiti extra (conto camera): scritto, non ancora testato in locale

Decisione di business presa in questa sessione, non solo tecnica: gli
extra oltre il trattamento incluso (soprattutto bar — acqua, birre,
prosecco) ora si accumulano sul conto camera e si saldano al check-out,
con evidenza in una ricevuta di cortesia NON fiscale (i pasti inclusi
restano dentro il documento fiscale della camera, invariato). Questo
supera — non contraddice più — la vecchia regola "ospiti hotel: nessun
conto" documentata in CLAUDE.md Sezione 11 (Modulo 1.6), che resta valida
solo per il trattamento base.

**Scoperta chiave prima di scrivere codice**: `comande` non aveva alcun
riferimento a `soggiorno_id` — `ospite_hotel` era solo un booleano "non
addebitare", senza sapere quale camera. Impossibile addebitare un extra a
un conto che non si sa identificare. Aggiunto il collegamento come
prerequisito, non come dettaglio implementativo.

**Due percorsi verso `addebiti_extra`**, per una ragione di UX reale:
priorità del titolare è il bar ("il grosso extra sarà lato hotel per il
bar"), il ristorante è secondario ("per il ristorante va bene aggiungere
extra al tavolo se serve"):
1. **Griglia rapida a quadratoni** (`/addebiti-extra`) — tocca un
   prodotto dal catalogo bar, si compila un carrello, conferma → scrive
   diretto in `addebiti_extra`, **nessuna comanda/tavolo/cucina
   coinvolta**. Catalogo (`catalogo_addebiti_rapidi`) deliberatamente
   separato da `menu_piatti`: quella tabella alimenta anche
   `/menu-pubblico` e `/menu-stampa` ("NON toccare", CLAUDE.md Sezione
   12) — un prodotto bar finito lì per un filtro sbagliato comparirebbe
   nel menu stampato o nel QR pubblico.
2. **Comanda reale** (percorso da tavolo, passa da cucina) — righe
   marcabili `addebito_camera` (nuovo toggle), sommate in un unico
   addebito alla chiusura. Incompatibile con chiusura omaggio/autoconsumo
   — bloccata con 400 esplicito invece di ignorare la marcatura in
   silenzio (un "regalo" e un "addebito alla camera" sono in
   contraddizione logica).

**File scritti** (migration `031_ristorante_addebiti.sql`):
`comande.soggiorno_id`/`nome_cliente_esterno`, `comande_righe.
addebito_camera`, tabelle `addebiti_extra` e `catalogo_addebiti_rapidi`.
Backend: `addebitiExtraController.js` (nuovo) + route
`/api/impostazioni/catalogo-addebiti` e `/api/soggiorni/:id/addebiti[/rapido]`;
`comandeController.js` esteso (`apriComanda` accetta soggiorno_id/nome
esterno forzando coerenza server-side con `ospite_hotel` a prescindere da
cosa manda il frontend; nuovo endpoint `addebito-camera` su riga;
`chiudiComanda` genera l'addebito); `camereController.js` `lista()`
estesa con `soggiorno_id`/`ospite_nome`/`ospite_cognome` via `LEFT JOIN
LATERAL` (additiva, nessun campo esistente toccato — serve al selettore
camera della griglia rapida quando non si arriva già con un soggiorno
risolto). Permessi in `shared/ruoli.js`: `addebiti_extra` (lettura
A/T/R, scrittura +cameriere) e `catalogo_addebiti_rapidi` (lettura anche
cameriere, scrittura solo A/T, decisione di prezzo).

Frontend: `/addebiti-extra` (griglia + carrello + voce libera + storico
addebiti già registrati), `/impostazioni/catalogo-addebiti` (CRUD
catalogo, no DELETE reale — solo attivo/disattivo, stesso pattern di
camere/tavoli/prodotti magazzino), pulsante "Addebiti extra" per riga
soggiorno nel pannello dettaglio di `/planning-camere` (soggiorno_id già
risolto, nessun passaggio intermedio), voci sidebar in OSPITALITÀ e
IMPOSTAZIONI. Segnalato al titolare durante la sessione che la sidebar
sta continuando a crescere — riordino già in backlog (EVOLUTIVE.md,
"riordino menu/sidebar"), non affrontato qui.

**Non fatto in questa sessione, deliberatamente**: nessuna UI nel flusso
comanda ristorante normale per scegliere soggiorno/nome esterno
all'apertura o per il toggle "addebita a camera" per riga — il backend lo
supporta già, ma il titolare l'ha esplicitamente deprioritizzato rispetto
al bar. Da riprendere quando serve davvero, non proattivamente.

**Verifica fatta in questa sessione** (nessun accesso a Postgres/browser
locale dal sandbox Cowork): `node --check` su tutti i file backend
toccati, parser Babel (`@babel/parser`, plugin jsx/typescript) su tutti i
file frontend nuovi/modificati — tutti puliti. Scritto anche
`tests/api/addebiti-extra.test.js` (catalogo, addebito rapido, lista per
soggiorno, permessi per ruolo, blocco omaggio/autoconsumo, generazione
dell'addebito alla chiusura normale) — sintassi verificata, **mai
eseguito** (richiede Postgres locale, `DB_HOST=localhost` non raggiungibile
dal sandbox).

**Domanda del titolare non ancora risolta, volutamente accantonata**:
"serve un sistema che associa alla camera il prezzo" (tariffe per
periodo/camera/canale di provenienza) — non è la stessa cosa del modulo
Addebiti extra. Verificato cosa esiste già: modulo 2.2 (stagionalità +
pacchetti per tipo camera/periodo) e modulo 2.3 Fase 1 (mappatura
tipo_camera↔canale OTA, solo identificazione canale, non prezzo
differenziato per canale). Quello che manca — tariffe differenziate per
canale di prenotazione — non è stato scoperto essere un vero gap
confermato dal titolare: la sua ultima risposta ha ribadito la
differenziazione già esistente (capacità/trattamento) senza confermare
quale delle interpretazioni proposte intendesse. Da chiarire prima di
scrivere qualunque piano su questo secondo tema.

### Prossimo step

Eseguire in locale: migration `031_ristorante_addebiti.sql`, `npm test`
(in particolare la nuova suite `addebiti-extra.test.js`, mai girata),
verifica visiva in browser della griglia `/addebiti-extra` e di
`/impostazioni/catalogo-addebiti` (mai viste renderizzate). Poi, se il
titolare vuole procedere: UI ristorante per soggiorno/esterno + toggle
addebito camera (deprioritizzata, task aperta); altrimenti chiarire la
domanda sospesa sulle tariffe per canale prima di pianificarla.

### Seguito stesso giorno — verifica locale, deploy VPS, chiuso ✅

Verifica locale (tab Code): migration applicata pulita, `21/21` verdi su
`addebiti-extra.test.js`, `611/634` sull'intera suite — le uniche 23
rosse sono le 3 note preesistenti (`email-template`, `pre-checkin`,
`email-prenotazioni`), stesso numero della baseline, confermato nessuna
regressione. Verifica visiva del titolare: catalogo creato da
Impostazioni, griglia a quadratoni funzionante, addebito confermato
persiste dopo reload. Unico intoppo, non un bug: il titolare non trovava
la voce "Addebiti extra" in sidebar — cercava nella bottom-nav mobile
(4 icone rapide curate, non mostra mai tutte le voci per scelta), non nel
pannello "Menu" che raggruppa per sezione come il desktop. Nessuna
modifica necessaria, solo chiarito dove guardare.

Feedback del titolare sulla UX, non un bug: il pulsante "Addebiti extra"
nel dettaglio soggiorno di planning-camere funziona come concordato ma
"non è proprio comodo" nell'uso reale — segnato in `docs/EVOLUTIVE.md`
per essere ripreso capendo prima cosa esattamente non va, non
riprogettato a caso ora.

Deploy VPS (tab Code, stessa giornata): backup pre-migration su `/tmp`
invece di `/root` (permessi `700` su `/root`, il comando dato da Cowork
avrebbe fallito — nota utile per la prossima volta), poi spostato come
root. `git pull` fast-forward pulito (nessun hotfix locale in conflitto
questa volta). Migration 031 applicata in produzione, verificata con
`\d`. Nessuna dipendenza nuova quindi install/build rapidi. `pm2 restart
all` → entrambi i processi online, health check backend + pagina
`/addebiti-extra` entrambi 200.

**Modulo Addebiti extra: completo, testato, in produzione.** Aperto solo
quanto già segnato sopra come deliberatamente non fatto: UI ristorante
per soggiorno/esterno + toggle riga (deprioritizzata), UX del pulsante da
planning-camere (da rivedere), più la domanda sospesa sulle tariffe per
camera/canale (mai chiarita dal titolare in questa sessione).

### Seguito stesso giorno — incidente permessi DB post-deploy, risolto ✅

Il titolare ha segnalato "Errore interno del server." su entrambe le
pagine nuove poco dopo il deploy. Diagnosi da log reali (`pm2 logs`, non
a tentativi): `permission denied for table catalogo_addebiti_rapidi`/
`addebiti_extra`, codice Postgres `42501`. Causa: `gestionale_app` (utente
applicativo, non proprietario del DB — vedi §3 di
`docs/DEPLOY_VPS_NETCUP.md`) aveva ricevuto un `GRANT ALL PRIVILEGES` una
tantum il 09/08, che **non si applica automaticamente** alle tabelle
create da migration successive. La 031 è stata la prima migration con
tabelle nuove eseguita dopo quel deploy — le due tabelle nuove sono
risultate illeggibili/inscrivibili nonostante la migration fosse andata a
buon fine senza errori. Nessun bug di codice: la query era corretta, il
permesso mancava a un livello sotto.

**Fix permanente** (non solo per oggi): oltre a ri-eseguire il `GRANT`
sulle due tabelle, impostato `ALTER DEFAULT PRIVILEGES FOR ROLE postgres
IN SCHEMA public GRANT ALL ON TABLES/SEQUENCES TO gestionale_app` — le
migration future con tabelle nuove non avranno più bisogno di questo
passaggio manuale. Documentato in `docs/DEPLOY_VPS_NETCUP.md` §3 e §8.

**Verifica end-to-end reale** (tab Code, nessun accesso browser/
credenziali staff disponibili in quel momento): JWT firmato a mano con lo
stesso payload/segreto del login reale (utente titolare reale, id 4,
Rosetta Doti) — stesso percorso di autorizzazione della UI, non un curl
anonimo. Tre chiamate autenticate: lettura catalogo (500→200, lista
vuota), lettura addebiti soggiorno (500→200, totale 0), scrittura
catalogo (500→201, riga creata e poi cancellata subito, nessun residuo).
Nessun riavvio pm2 necessario — era solo un permesso, non codice.

**Lezione per il prossimo modulo con tabelle nuove in produzione**: non
basta "migration applicata senza errori" — verificare sempre con una
vera chiamata autenticata che tocca la tabella nuova, non solo `\d` o
l'esito del comando di migration. Coerente con
[[feedback_verificare_chiamata_api_reale_prima_deploy_ok]] in memoria, ma
un caso nuovo: qui la migration stessa era perfetta, il fallimento era un
livello sotto (permessi), non nella query o nello schema.

## 13/08/2026 — Audit HR/timbrature, bug SSE/CORS, provisioning dipendenti, contratto e report consulente

Sessione lunga, quattro pezzi distinti.

**Audit completo modulo HR/timbrature** (su richiesta del titolare, prima
di far partire l'uso reale con i dipendenti): letto ogni riga di codice
del modulo, verificata la copertura test (mancava quasi del tutto su
turni/turni-standard/scadenze/documenti/haccp), consegnata una checklist
PDF di 20 scenari da eseguire fisicamente in hotel
(`docs/CHECKLIST_USER_TEST_HR.pdf`). Trovato e chiuso un gap di sicurezza
reale: le route HACCP non avevano **nessuna** restrizione di ruolo a
livello di route, nonostante `shared/ruoli.js` la definisse già — mai
applicata. Scritta la migration mancante `032_turni_standard.sql` (la
tabella esisteva già nel DB ma non in nessuna migration versionata) e la
nuova funzionalità "Applica turno standard" (bulk, un mese intero, non
sovrascrive turni già assegnati a mano — scelta esplicita del titolare).
93/93 test verdi, deployato e verificato in produzione dal titolare.

**Bug reale trovato durante il retest post-deploy**: l'export Excel
timbrature falliva con errore CORS contro un tunnel ngrok defunto da
inizio luglio (OCR pre-checkin). Causa: `frontend/.env.local` aveva
`NEXT_PUBLIC_API_URL` ancora puntato lì, e 7 file frontend leggevano
quella variabile build-time direttamente invece del già esistente
`getApiUrl()` runtime — violazione della regola di rete "non derogabile"
di CLAUDE.md Sezione 12. Sistemato `.env.local` e tutti e 7 i file
(`personale`, `tassa-soggiorno`, `ztl`, `magazzino-qr-stampa`,
`menu-stampa`, `menu-pubblico`, `menu`). Trovato per strada un secondo bug
di produzione mai notato prima, stessa causa radice ma indipendente:
`tassa-soggiorno/page.jsx` aveva una propria copia locale del calcolo URL,
senza il ramo `NODE_ENV === 'production'` — avrebbe sempre tentato la
porta 7001 diretta, chiusa dal firewall in produzione. Corretto riusando
`getApiUrl()`.

**Bug `/utenti` "non raggiungibile in locale"**: la guardia di accesso
della pagina controllava solo `ruolo === 'titolare'`, escludendo admin —
mentre sidebar e backend ammettono entrambi. Corretto con un array
`RUOLI_CONSENTITI`; sistemata anche `LABEL_RUOLI` (mancavano admin e
portiere_notte) e chiuso un buco di privilege-escalation che quella
correzione avrebbe altrimenti aperto (un titolare avrebbe potuto assegnare
il ruolo admin da quella tendina — ora filtrato, come già faceva
`/personale`).

**Specifica nuova del titolare, eseguita in tre fasi dopo un giro di
chiarimenti** (username vs email, ruolo dedicato vs riuso di
'dipendente', orario standard per contratto, calcolo straordinari):

- *Fase A*: provisioning di 10 dipendenti reali + 7 account di test (uno
  per ruolo). Deciso di **non** costruire un vero campo username separato
  — la colonna `email` non ha mai avuto validazione di formato lato
  backend, quindi si usa direttamente come nome utente (`nome.cognome`,
  niente `@dominio`), risparmiando una migration e un cambio di flusso di
  login. Deciso di **non** creare un ottavo ruolo "lavapiatti" — riusato
  `dipendente` (già impiegato come ruolo generico in `pulizie`/
  `camere.pulizia`) mostrando solo l'etichetta "Lavapiatti" in UI, per non
  intestare permanentemente quello slot a una mansione specifica. Aggiunto
  self-service "Cambia password" (`POST /api/auth/cambia-password`, mai
  esistito prima — il reset da admin/titolare invece esisteva già in
  `/utenti`, solo irraggiungibile per il bug sopra). Script
  `backend/scripts/provisionaDipendenti.js` (dry-run di default, non
  sovrascrive mai un account esistente). Eseguito dal titolare via tab
  Code: 17/17 a posto (11 creati, 6 già esistenti rinominati a mano senza
  spostare dati storici). Login e cambio password verificati.
- *Fase B*: nuove colonne `contratto_tipo`/`fascia_oraria` su `users`
  (migration `033_contratto_dipendenti.sql`, entrambe nullable). Il
  pannello "Turni standard" ora propone un default in base al contratto
  quando un dipendente non ha ancora un turno impostato: indeterminato
  diurna 07-15, indeterminato notturna 23-07, part-time 09-14 (confermato
  dal titolare). Nessuna proposta per chiamata/non impostato — resta il
  default generico preesistente. Chi ha già un turno standard salvato non
  viene mai toccato.
- *Fase C*: nuovo foglio "Consulente" nell'export
  `report-mensile` esistente (nessuna modifica UI, stesso pulsante) — due
  righe per dipendente (ore lavorate e straordinari), una colonna per
  ogni giorno del mese più il totale. Straordinari = ore oltre la soglia
  del contratto (8h/5h); per chiamata o contratto non impostato si scrive
  "N/D" invece di inventare una soglia, su indicazione esplicita del
  titolare ("non so come funzionino i contratti a chiamata") — da
  chiarire con il consulente del lavoro, non da indovinare in codice.
  Logica verificata con dati simulati (turni multipli nello stesso
  giorno, contratto nullo, chiamata) prima di consegnarla.

Tutte e tre le fasi verificate solo con `tsc --noEmit` e controlli di
sintassi/logica dal sandbox (nessun accesso al Postgres del titolare da
qui) — **test automatici e verifica end-to-end reale restano da fare dal
titolare/tab Code**, non ancora confermati a fine sessione.

### Seguito stesso giorno — feedback del titolare dopo il primo giro, 6 fix

Il titolare ha provato le Fasi A/B/C e segnalato sei cose in un colpo solo.

**Bug reale trovato e corretto — ordine colonne foglio Consulente**: la
colonna "Dipendente" finiva dopo tutti i giorni invece che all'inizio.
Causa non di XLSX ma del linguaggio: un oggetto JS con chiavi che
sembrano indici ('1', '2', ..., '31') le enumera sempre per prime, in
ordine numerico, prima di qualunque chiave testuale — indipendentemente
dall'ordine di inserimento (`Object.keys({'Dipendente':x,'1':y})` →
`['1','Dipendente']`). `json_to_sheet` eredita quell'ordine.
Riprodotto e verificato con un mini script prima di correggere. Fix:
`aoa_to_sheet` con intestazione esplicita — l'ordine delle colonne
diventa quello dell'array, non più negoziabile dal motore JS.

**Bug preesistente trovato per strada, poi corretto su via libera esplicita
del titolare** ("i dati inseriti ora in locale non sono significativi"):
in `reportMensile()` le ore di un turno venivano attribuite al giorno
della timbratura di **uscita**, non di entrata. Per un turno diurno non
cambiava nulla, ma un notturno (23:00→07:00 del giorno dopo, esattamente
il caso di portiere_notte_test) finiva nella colonna del giorno
*successivo* a quello in cui era iniziato — condiviso da tutti e tre i
fogli, perché condividono `pairsPerUser`. Fix: `openEntry[uid]` ora
memorizza anche il giorno dell'entrata insieme al timestamp, e quel
giorno (non quello ricalcolato sulla riga di uscita) è la chiave con cui
la coppia entrata/uscita viene archiviata. Aggiunto un test di
regressione in `hr.test.js` (turno 23:00→07:00, verifica che le ore
finiscano sul giorno di entrata e non su quello dopo).

### Seguito stesso giorno — scavalco mese/anno, e un secondo bug più grosso trovato verificandolo

Il titolare ha chiesto di sistemare anche lo scavalco di mese/anno (il
limite lasciato aperto sopra). Implementato allargando di un giorno per
lato la finestra di lettura timbrature (`primoGiornoQuery`/
`ultimoGiornoQuery`, `setDate(±1)` — scavalca correttamente anche
Dicembre→Gennaio, `Date` non ha bisogno di casi speciali per l'anno), poi
scartando i giorni cuscinetto fuori dal mese richiesto subito dopo aver
costruito `pairsPerUser` (una sola volta, condiviso dai tre fogli).

**Verificandolo con dati simulati è saltato fuori un bug preesistente più
serio, non legato allo scavalco**: `ultimoGiorno` veniva calcolato con
`new Date(anno, meseNum, 0).toISOString().split('T')[0]` — costruisce
l'ultimo giorno del mese come mezzanotte LOCALE, poi lo converte in UTC
per trasformarlo in stringa. Sul server, fuso Europe/Rome (UTC+1/+2),
questo fa **sempre** slittare la data indietro di un giorno: per luglio
2026 `ultimoGiorno` risultava `'2026-07-30'` invece di `'2026-07-31'`.
Conseguenza concreta, verificata con `TZ=Europe/Rome node -e "..."` prima
di correggere: **l'ultimo giorno di ogni singolo mese è sempre stato
invisibile al report mensile**, anche per un turno diurno normalissimo
senza nessun scavalco di mezzo — non un problema introdotto oggi, c'era
da quando `reportMensile()` è stata scritta. Corretto con lo stesso
`fmtDataLocale()` già introdotto per la finestra allargata (legge i
componenti della data locale invece di passare da UTC). Stessa classe di
bug corretta anche nel calcolo del giorno di un'entrata dentro il loop di
accoppiamento entrata/uscita: un turno iniziato appena dopo mezzanotte
locale (es. 00:30) finiva attribuito al giorno PRIMA per lo stesso motivo
— anche questo verificato con un caso concreto prima di correggere.

Tre nuovi test di regressione in `hr.test.js`: turno l'ultimo giorno del
mese senza scavalco (quello che prima spariva del tutto), scavalco di
fine anno (verifica sia dicembre che gennaio, nessun doppio conteggio),
intestazione con tutte le colonne giorno corrette. Nessuno eseguito
contro un Postgres reale — solo simulazione della stessa identica logica
con `node -e`, stesso fuso orario del server (`TZ=Europe/Rome`).

**Verificato dal titolare in locale: il report ora è corretto.** Ultima
richiesta della sessione: larghezza colonne del foglio Consulente, per
stare su un solo A4 in stampa orizzontale. Aggiunto `ws['!cols']`
(Dipendente 24 caratteri, ogni giorno 4, Totale 8) — verificato
ispezionando l'XML del file generato, le colonne vengono scritte
correttamente. **Limite scoperto per lo stesso motivo**: la libreria xlsx
in uso (SheetJS Community, non quella a pagamento) non scrive
l'orientamento/adatta-a-una-pagina nel file (`!pageSetup` viene ignorato
in scrittura, verificato allo stesso modo) — quell'impostazione resta da
fare a mano in Excel prima di stampare, non automatizzabile con questa
libreria.

**Bug nei test trovato per completezza, corretto prima di consegnare**:
il test "richiamato di nuovo sullo stesso periodo → non duplica" per
`applica-standard`, scritto quando il comportamento era ancora "skip",
si aspettava `creati: 0` alla seconda chiamata sullo stesso periodo — con
la sovrascrittura ora `creati` torna sempre un numero ≥3 (le righe
vengono ricreate ad ogni chiamata, non più saltate). Corretto l'assert e
aggiunta una verifica su `sovrascritti`; il controllo che conta davvero
(nessun turno duplicato, sempre 3 non 6) resta invariato.

**Verifica finale del titolare (tab Code), tutta la sessione confermata**:
`hr.test.js` 100/100, `users.test.js` 10/10, suite completa 727/728 (30
suite su 31 verdi). L'unico fallimento è preesistente e scollegato da
questa sessione: `tests/api/alloggiati.test.js` ha un test-guardia che
verifica che `ALLOGGIATI_UTENTE` non sia valorizzata nell'ambiente di
test (evita chiamate SOAP reali verso WS_ALLOGGIATI durante `npm test`)
— sul `.env` di questa macchina la variabile è ora impostata a
`SP000463` (le credenziali reali, ottenute dal titolare dopo la sessione
del modulo 2.5 Fase 2). Il guardiano sta segnalando esattamente questo:
ambiente di test e di sviluppo condividono lo stesso `.env`. Non toccato
— serve un `.env.test` separato per chiuderlo, scelta di configurazione
rimandata al titolare, non un bug di oggi.

**Sessione 13/08/2026 chiusa**: audit HR/timbrature, provisioning 10
dipendenti + 7 account test, contratto_tipo/fascia_oraria, report
"Consulente" con relativi fix (ordine colonne, attribuzione turni
notturni, scavalco mese/anno, ultimoGiorno sballato dal fuso orario,
larghezza colonne per la stampa), sovrascrittura di "Applica turno
standard" — tutto verificato end-to-end dal titolare, verde.

**"Applica turno standard" — sovrascrittura invece di skip**: decisione
esplicita del titolare, inverte la scelta dell'11/08 ("mai sovrascrivere,
evita di cancellare in silenzio scambi fatti a mano"). Nuova motivazione:
il turno standard deve essere predominante. `turniController.js`
riscritto: DELETE + INSERT in un'unica transazione (solo per i dipendenti
che hanno uno standard configurato — chi non ce l'ha resta intoccato).
Aggiunta una conferma esplicita in UI prima dell'azione (`window.confirm`),
dato che ora è distruttiva; testo del riepilogo aggiornato di conseguenza
("N turni sostituiti" invece di "N giorni già assegnati, non toccati").

**Fix UX — form modifica dipendente invisibile in liste lunghe**: il form
si apriva sempre in cima al contenitore scrollabile, sotto la lista — se
si clicca "Modifica" su un dipendente in fondo, il form si apre fuori
dalla vista corrente. Aggiunto `formRef` + `scrollIntoView` all'apertura.

**Dati di test mancanti per verificare il report a mano**: nuovo script
`backend/scripts/seedTimbratureTest.js` (idempotente, cancella e rigenera
le timbrature nel range ad ogni esecuzione) — popola giugno-luglio 2026
per portiere_notte_test (tempo indeterminato/notturna, turni 23-07 con
straordinari periodici), cameriere_test (part-time, 09-14 con
straordinari periodici), cuoco_test (chiamata, giorni/orari sparsi e
irregolari) — imposta anche il loro `contratto_tipo`/`fascia_oraria`.

**Test automatici per i due gap segnalati**: `tests/api/users.test.js`
(nuovo file — creazione/modifica con `contratto_tipo`/`fascia_oraria`,
validazione, permessi) — scrivendolo, trovato e corretto un bug vero:
`validaContratto()` in `usersController.js` rifiutava una stringa vuota
(400) invece di trattarla come "campo da svuotare", inconsistente con
`contratto_tipo || null` poco sotto che la converte comunque in null.
Esteso anche `tests/api/hr.test.js` con un nuovo describe per il foglio
Consulente (permessi, ordine intestazione, calcolo ore/straordinari,
'N/D' per chiamata) — parsing del buffer xlsx di ritorno via
`res.responseType('blob')` + libreria `xlsx`, pattern nuovo per questa
suite (verificato a parte con un mini server Express prima di fidarsene,
perché supertest+Buffer binari non erano mai stati usati altrove nel
progetto). Aggiunto `xlsx` anche al `package.json` di radice (era solo in
`backend/`) — non strettamente necessario per Jest, che risolve già da
`backend/node_modules` via `modulePaths` in `jest.config.js`, ma utile per
gli script eseguiti con `node` puro dalla radice. Anche questi test non
eseguibili dal sandbox (nessun Postgres raggiungibile) — solo sintassi e
la meccanica di parsing xlsx verificate isolatamente.

**"Sheet Dettaglio vuoto" e "non vedo N/D"**: non replicati né corretti
come bug — ipotesi più probabile è semplicemente l'assenza di dati per
gli utenti di test nel mese controllato (prima di questo seed script non
esisteva nessuna timbratura per loro). Da riverificare dopo aver lanciato
`seedTimbratureTest.js` e generato il report per giugno/luglio 2026.

**Pulizia utenti con email finte (Rosetta Doti, Nency Donato)**: nessuna
azione di codice — solo guidance data al titolare. Il progetto non
cancella mai un utente dal DB (`usersController.cambiaStato`, commento
esplicito: "per mantenere la storicità"), e `turni`/`timbrature`
referenziano `users(id)` con `ON DELETE RESTRICT` — una DELETE diretta
fallirebbe comunque se questi due hanno una qualunque riga storica
collegata. Raccomandato disattivarli (`attivo=false`, già possibile da
`/utenti` col pulsante esistente) invece di cancellarli.

**Titolare (Carmine Muro) e admin rinominati in nome.cognome**: nessuna
azione di codice necessaria — stesso form di modifica già usato per gli
altri 6 in Fase A, il titolare lo fa da sé da `/utenti`.

Tutti i fix di codice verificati solo con `tsc`/`node -c`/sintassi dal
sandbox — nessuno eseguito contro il Postgres reale in questa sessione.

### Seguito stesso giorno — separazione .env test/dev per Alloggiati Web

Il titolare ha ottenuto la WSKEY e ha chiesto di sistemare, prima di
procedere, l'unico punto aperto della verifica finale: il test-guardia di
`tests/api/alloggiati.test.js` che fallisce quando `ALLOGGIATI_UTENTE` è
valorizzata nel `.env` di sviluppo (condiviso con quello di test).

Fix minimo, non invasivo: nuovo file `backend/.env.test` (committato,
nessun segreto — solo `ALLOGGIATI_UTENTE=`, `ALLOGGIATI_PASSWORD=`,
`ALLOGGIATI_WSKEY=` esplicitamente vuote) caricato da `tests/setup.js`
**dopo** `backend/.env`, con `override: true` — sovrascrive a vuoto solo
queste 3 variabili nel processo Jest, senza toccare `backend/.env` reale
né richiedere due file di configurazione separati per tutto il resto
(DB/JWT restano condivisi, invariato). Verificato isolatamente con
`node -e` (variabile impostata a un valore finto, poi confermata vuota e
falsy dopo l'override) — non eseguibile contro Jest vero dal sandbox
(nessun Postgres raggiungibile), confermato dal titolare in locale:
**suite completa 728/728 verdi, 31/31 suite, exit code 0** — il
test-guardia su `ALLOGGIATI_UTENTE` ora passa, nessun fallimento residuo.
Chiuso.

WSKEY inserita in `backend/.env` insieme a Utente/Password già presenti;
titolare ha testato "Verifica credenziali" da
`Impostazioni ▸ Alloggiati Web` (GenerateToken + Authentication_Test,
zero rischio, nessun dato ospite coinvolto). **Esito: "Credenziali
valide", confermato il 13/08/2026 alle 19:14:25.** Primo contatto reale
con WS_ALLOGGIATI riuscito al primo tentativo — l'assunzione sull'header
SOAP action (`alloggiatiSoapClient.js`, commento in cima al file) era
corretta, non serve più trattarla come rischio aperto.

Sblocca il resto del modulo 2.5 Fase 2: prossimo passo naturale è
`testSchedine` (metodo `Test`, sicuro — controllo formato, nessuna
acquisizione, manuale pag. 9) su un soggiorno reale, prima di arrivare a
`inviaSchedine` (`Send`, quello che registra davvero l'ospite alla
Polizia di Stato — solo quando il titolare è pronto a farlo sul serio).

### Seguito stesso giorno — pulsante "Verifica schedina" + soggiorno di test

Il titolare ha chiesto di collegare `Test` all'UI (l'endpoint
`POST /api/alloggiati/soggiorni/:id/test` esisteva già dall'11/08, mai
raggiungibile senza chiamarlo a mano) e di poter provare senza usare un
ospite reale. Chiarito anche un dubbio sulla WSKEY: **non si rigenera ogni
giorno** — riletto `MANUALEALBERGHI.pdf` pag. 28 per essere certi prima di
rispondere: "È possibile generare solo un nuovo codice al giorno" è un
limite su quante volte *puoi rigenerarla* (se serve), non una scadenza
automatica; resta valida finché non cambi la password del portale
("Ad ogni cambio password si dovrà generare un nuovo codice WSKEY").
Nessuna gestione ricorrente necessaria.

**`frontend/app/impostazioni/alloggiati/page.jsx`**: nuova card "Verifica
schedina (Test)" tra "Verifica credenziali" e "Tabelle di codifica" — campo
ID soggiorno + pulsante, mostra avvisi (ospiti esclusi per dati mancanti,
stesso formato di `docs/EVOLUTIVE.md`/ross1000), righe respinte dal
servizio (se il formato non passa) e l'esito "N/M schedine valide". Nessuna
lista soggiorni in questa pagina, deliberatamente — resta una pagina di
sola configurazione, non un punto operativo.

**`backend/scripts/creaPrenotazioneTestAlloggiati.js`** (nuovo): crea una
prenotazione+soggiorno+ospite interamente fittizi (date 2099, stessa
convenzione già in uso nei test automatici — mai sovrapposto a una
prenotazione reale, mai visibile scorrendo il planning quotidiano) per
poter premere "Verifica schedina" senza toccare un ospite vero. Cerca da
solo i codici reali già sincronizzati (comune "Lerici", tipo documento
"carta d'identità") invece di inventarli — se `alloggiati_codici` è vuota
si ferma con l'istruzione di sincronizzare prima. Idempotente
(`external_booking_id` fisso come chiave) + flag `--elimina` per ripulire
tutto a fine test (ordine corretto: soggiorno_ospiti → soggiorni →
prenotazioni → ospiti, unica tabella con FK NOT NULL su quell'ospite).
Marcato ovunque, nei commenti e nel campo `note` salvato nel DB, come
"mai da usare con Send" — è un ospite inventato, un invio reale
registrerebbe dati falsi presso la Polizia di Stato.

Verificato in questa sessione: `node -c` sullo script, parse Babel
(`next/babel`) sulla pagina, `tsc --noEmit` sull'intero frontend — tutti
puliti. Non eseguibile end-to-end dal sandbox (nessun Postgres
raggiungibile): il titolare deve lanciare lo script e provare il pulsante
in locale.

### Seguito stesso giorno — date 2099 rifiutate da WS_ALLOGGIATI, script corretto

Primo test reale del titolare: `Test` ha risposto `ErroreCod 12
SCHEDINA_CAMPO_NON_CORRETTO — Data di Arrivo Errata` sul soggiorno con
data_arrivo 2099. Verificato subito il tracciato (`MANUALEWS.pdf` pag.
19-20): il formato gg/mm/aaaa generato da `formatDataSchedina` è quello
richiesto, quindi non è un problema di formato. **Ipotesi non confermata
esplicitamente dal manuale** (non documenta questo vincolo, l'errore è lo
stesso testo usato come esempio generico nel manuale stesso): il servizio
verifica anche la plausibilità operativa della data, non solo il formato
— 73 anni nel futuro viene respinto.

Riscritto `backend/scripts/creaPrenotazioneTestAlloggiati.js`: invece di
una data lontanissima "sicura per costruzione", ora cerca in automatico
(funzione `trovaCameraLibera`) la prima combinazione camera+data libera a
partire da domani (stessa logica del vincolo EXCLUDE — daterange +
cancellato=false — verificata PRIMA dell'INSERT, con gestione dell'errore
23P01 come rete di sicurezza per una corsa critica). Supporta anche
`--camera=`/`--arrivo=`/`--notti=` per forzare una combinazione a mano.
Effetto collaterale accettato: il soggiorno ora compare per davvero nel
planning reale per la sua finestra (prima, con 2099, non ci sarebbe mai
comparso) — mitigato rendendo il nome ospite il più esplicito possibile
("TEST ALLOGGIATI — NON REALE — ELIMINARE") e ricordando ad ogni run di
eliminarlo con `--elimina` appena finito di testare.

Non ancora rieseguito dal titolare con la versione corretta — da
confermare se la nuova data (vicina) viene accettata da `Test`.

### Seguito stesso giorno — anche "domani" respinta: la vera regola è "mai futura"

Il titolare ha rilanciato con la versione "domani" e ha ricevuto
ESATTAMENTE lo stesso errore (`SCHEDINA_CAMPO_NON_CORRETTO — Data di
Arrivo Errata`). Questo smentisce l'ipotesi precedente ("data troppo
lontana nel futuro") — se anche un solo giorno nel futuro viene respinto,
il problema non è la distanza. Verificato di nuovo il tracciato
(`MANUALEWS.pdf` pag. 19-20, offset byte esatti Campo/DA/A) per escludere
un bug di posizionamento: Tipo Alloggiato occupa 0-1 (2 char), Data Arrivo
2-11 (10 char) — esattamente quello che genera il nostro codice, nessun
disallineamento.

Cercato riscontro esterno prima di azzardare un secondo tentativo alla
cieca (WebSearch): community Airbnb Italia e blog di settore sull'uso di
questo stesso webservice concordano che Alloggiati Web è pensato per
comunicare un arrivo **già avvenuto**, da trasmettere entro 24 ore — "si
ha la possibilità di inserire la data di check-in del giorno prima entro
le 24 ore". **Data Arrivo quindi non può mai essere futura**, andava bene
al massimo oggi o ieri — non documentato esplicitamente nel manuale
tecnico, ma coerente con lo scopo del servizio (comunicazione di
un soggiorno in corso, non prenotazione).

Riscritto `creaPrenotazioneTestAlloggiati.js`: `trovaCameraLibera` non
scorre più in avanti nel tempo, cerca solo tra un piccolo insieme di date
candidate — oggi, poi ieri come fallback — mai oltre. Se l'hotel risulta
pieno su entrambe (possibile in alta stagione, 20 camere), lo script si
ferma con l'istruzione di forzare a mano `--camera=`/`--arrivo=` (non
successivo a oggi) invece di provare a indovinare.

### Seguito stesso giorno — data confermata corretta, ora il Cognome

Riverificato: con data oggi il rifiuto su Data Arrivo è sparito, l'ipotesi
"mai futura" era quella giusta. Il rifiuto si è spostato su un altro
campo: `SCHEDINA_CAMPO_NON_CORRETTO — Cognome con caratteri non validi`.
Causa quasi certa (il manuale non documenta un set di caratteri ammessi
per Cognome, nessuna conferma esplicita trovata): il cognome fittizio
usato nello script, `'NON REALE — ELIMINARE'`, conteneva un trattino lungo
(em dash, carattere Unicode U+2014) — non uno standard per un tracciato a
lunghezza fissa pensato per l'alfabeto latino base. Cambiato in `'TEST'`/
`'ALLOGGIATI NON REALE'` (solo lettere e spazi, nessuna punteggiatura).

**Confermato dal titolare: "Formato verificato — 1/1 schedine valide su 1
ospiti nel soggiorno."** Percorso completo validato end-to-end contro il
servizio reale: generatore tracciato (`alloggiatiSchedina.js`) → client
SOAP (`alloggiatiSoapClient.js`) → metodo `Test` di WS_ALLOGGIATI, esito
positivo. Le due correzioni della sessione (data mai futura, niente
punteggiatura Unicode nei campi testuali) restano valide anche per un
futuro invio reale — stesso generatore, stesso client, usato anche da
`Send`.

**Da ricordare al titolare**: eliminare il soggiorno di test appena
finito — a differenza della vecchia versione con data 2099 (mai visibile
da nessuna parte), questo occupa per davvero una camera reale su una data
reale (oggi o ieri):
```
node backend/scripts/creaPrenotazioneTestAlloggiati.js --elimina
```

**Resta il passo successivo, non ancora fatto, del modulo 2.5 Fase 2**:
`Send` (invio reale) — per costruzione richiede `conferma_dati_reali:
true` esplicito e un ospite vero effettivamente in struttura. `Test`
valida solo il FORMATO: non garantisce che `Send` non trovi altri motivi
di rifiuto (es. duplicati, dati già acquisiti in precedenza) — stesso
tracciato non vuol dire "stesso risultato garantito".

### Seguito stesso giorno — popolamento dati di test per valutare dove mettere il flusso

Prima di decidere dove agganciare il pulsante di invio reale, il titolare
ha chiesto di popolare il DB con prenotazioni realistiche su ±15 giorni da
oggi (passate/in corso/che arrivano domani/future), nomi casuali, per
valutare graficamente il planning — e ha anticipato l'idea di un
indicatore Dashboard (pallino verde/giallo) per l'allineamento Alloggiati
Web/ROSS1000, da costruire in un secondo momento. Il pulsante "Invia
reale" dovrà comunque nascere disattivo di default.

Nuovo script `backend/scripts/seedPrenotazioniTest.js` (crea/`--pulisci`):
per ogni camera attiva, genera una sequenza di soggiorni non sovrapposti
(gap 0-3 giorni + notti 1-5, verificato PRIMA dell'insert con la stessa
query di sovrapposizione del vincolo EXCLUDE) dal 15° giorno prima ad oggi
al 15° giorno dopo — lo stato prenotazione (`check_out`/`check_in`/
`confermata`/`opzione`) deriva automaticamente dalle date rispetto a oggi,
nessuna scelta manuale per singolo record. Simulazione isolata (senza DB,
`/tmp/sim_seed.js`) prima di consegnare: nessun loop infinito, ~145
prenotazioni su 20 camere, tutte e 4 le categorie rappresentate
(check_out 68, check_in 15, confermata 53, opzione 9 in una singola run).

A differenza di `creaPrenotazioneTestAlloggiati.js` (un solo soggiorno,
nome vistosamente marcato "non reale"), qui i nomi sono presi da un pool
italiano plausibile (15 nomi/15 nomi/20 cognomi) — identificabile e
ripulibile comunque tramite `canale_origine='test_interno'` +
`external_booking_id` con prefisso `SEED-TEST-` (mai usato da prenotazioni
vere). Mix intenzionale ~80/20 completo/incompleto e ~85/15 Italia/estero
sui dati anagrafici (nascita + residenza, quest'ultima richiesta solo da
ROSS1000, non da Alloggiati Web) — serve a vedere anche i casi "dati
mancanti" degli avvisi Test/ROSS1000 con dati reali, non solo lo scenario
ideale. Codici presi dinamicamente da `alloggiati_codici` già sincronizzata
(10 città italiane note, 5 paesi esteri, tipi documento) — se la tabella è
vuota lo script avvisa e procede comunque con dati "incompleti" per tutti
(esito comunque utile: mostra l'alert che segnala mancanze).

Nessun rischio di email automatiche: l'inserimento è SQL diretto, bypassa
i controller Express dove vive la logica di invio (5.3) — nessun trigger
DB nel progetto (verificato, stessa convenzione già nota da altre
migration). Non eseguibile dal sandbox (nessun Postgres): il titolare deve
lanciarlo in locale e guardare `/planning-camere`.

### Seguito stesso giorno — invio automatico Alloggiati Web (modulo 2.5 Fase 2, invio reale)

Chiesto un riscontro su come lo fanno gli altri PMS prima di decidere
l'architettura (WebSearch: Lodge Easy, HotelCube, Chekin) — pattern
unanime: raccolta dati al check-in → validazione automatica → **invio
automatico ogni notte** di tutte le schedine accumulate, non un pulsante
manuale come flusso primario; coda con retry automatico se il portale è
irraggiungibile; ricevute scaricate e archiviate (obbligo 5 anni);
dashboard di stato per invio (inviata/in attesa/errore); scadenza 6 ore
(non 24) per soggiorni sotto le 24 ore. Il titolare ha confermato di
implementare questo pattern, col pulsante manuale relegato ai casi
eccezionali in Impostazioni ▸ Alloggiati Web.

**Migration `034_alloggiati_invii_dettaglio.sql`**: aggiunge
`alloggiati_invii.dettaglio_errore TEXT` — serve alla coda per mostrare
SUBITO perché un soggiorno non è ancora stato inviato, senza dover
rilanciare il tentativo per scoprirlo.

**Refactor `alloggiatiController.js`**: estratta `eseguiInvioReale(soggiornoId)`,
riusata sia dall'endpoint HTTP (`inviaSchedineSoggiorno`, pulsante manuale,
richiede sempre `conferma_dati_reali: true`) sia dal job notturno (nessuna
richiesta HTTP di mezzo). Chiama sempre `Test` PRIMA di `Send` — se anche
una sola riga non passa il controllo di formato, `Send` non viene mai
invocato, evitando tentativi di acquisizione su dati che sappiamo già
respinti. Scrive in `alloggiati_invii` **solo** quando riceve una risposta
dal servizio (esito 'ok'/'parziale'/'errore') — **mai** per eccezioni di
rete o credenziali mancanti: quei casi restano "in attesa" e rientrano da
soli nel giro della notte successiva, senza bisogno di una logica di retry
dedicata. Nuovo endpoint `GET /api/alloggiati/coda` (stessa azione
`invio`, admin/titolare) — soggiorni con arrivo passato mai inviati con
successo (esclude sempre `canale_origine = 'test_interno'`) + ultimi
inviati con successo.

**Punto di sicurezza non negoziabile, testato esplicitamente**: sia la
coda sia `backend/jobs/invioAlloggiatiWeb.js` (nuovo, stesso pattern di
`promemoriaEmail.js` — cron avviato solo da `server.js`, mai da `app.js`
usato dai test) escludono sempre `canale_origine = 'test_interno'` — senza
questo filtro, la prima esecuzione notturna avrebbe provato a registrare
come reali, presso la Polizia di Stato, i ~145 soggiorni fittizi appena
generati da `seedPrenotazioniTest.js`. Il job non scrive mai nulla per un
errore di rete (stesso motivo: nessuno stato = retry automatico il giorno
dopo), riprova invece ogni notte anche i casi "in errore" — se nel
frattempo la reception corregge la scheda ospite, il tentativo successivo
passa da solo. Orario scelto: 02:00, in linea con la fascia oraria usata
dagli altri gestionali del settore.

**UI**: `Impostazioni ▸ Alloggiati Web` estesa con la card "Coda invii"
(tra "Verifica schedina" e "Tabelle di codifica") — tabella dei soggiorni
da inviare con motivo dell'ultimo tentativo se presente, pulsante "Invia
ora" per riga con conferma esplicita (stesso identico messaggio di rischio
già presente per l'invio reale), sezione a scomparsa "Inviati di recente"
per riscontro visivo.

**Test** (`tests/api/alloggiati.test.js`, nuovo describe `GET
/api/alloggiati/coda`): permessi (401/403/200), e soprattutto la garanzia
di sicurezza sopra verificata a TRE livelli — endpoint coda, funzione del
job (`trovaSoggiorniDaInviare`), e `eseguiInvioReale` con credenziali
mancanti (verifica che non scriva nessuna riga in `alloggiati_invii`,
il contratto su cui si basa tutto il retry automatico). Verificato con
`node -c`/require isolato dei moduli (nessun DB nel sandbox) — non
eseguibile end-to-end da qui, il titolare deve applicare la migration 034
e rilanciare la suite in locale prima di attivare il job in produzione.

**Non ancora fatto, deliberatamente rimandato**: il metodo SOAP `Ricevuta`
(scarico della ricevuta ufficiale, obbligo di conservazione 5 anni) non è
mai stato implementato — oggi si salva solo l'esito interno (ok/parziale/
errore + dettaglio), non il documento ufficiale scaricato dal portale.
Segnalato esplicitamente, non bloccante per attivare il resto.

### Seguito stesso giorno — gap reale trovato: il filtro test_interno proteggeva solo le liste, non l'invio stesso

Il titolare ha chiesto conferma esplicita ("sei sicuro al 100%?") che i
soggiorni `canale_origine='test_interno'` non potessero mai essere
inviati. Risposta onesta: **no, non lo ero** — a riverificare è emerso un
buco reale, non solo teorico. Il filtro `canale_origine != 'test_interno'`
era presente SOLO nelle due query di elenco (`codaInvii`,
`trovaSoggiorniDaInviare` del job): proteggono chi passa da lì, ma
`POST /api/alloggiati/soggiorni/:id/invia` accetta qualunque id gli venga
passato — anche a mano, es. riusando per sbaglio un vecchio id di test
incollato durante una sessione di "Verifica schedina" — bypassando sia la
coda che il job senza alcun controllo.

Corretto spostando il blocco DENTRO `eseguiInvioReale` stessa (in
`alloggiatiController.js`) — l'unica funzione da cui passano davvero tutti
gli invii, qualunque sia il percorso per arrivarci: legge il
`canale_origine` della prenotazione del soggiorno PRIMA di fare qualunque
altra cosa, e lancia un'eccezione esplicita se è `'test_interno'`, prima
ancora di controllare le credenziali o generare la schedina. Due nuovi
test di regressione mirati proprio su questo, non sulle liste: chiamata
diretta a `eseguiInvioReale(sogTestId)` (deve rigettare) e chiamata HTTP
piena con `conferma_dati_reali: true` su un id di test (deve rispondere
502 col messaggio esplicito, non un invio silenzioso).

**Lezione per il futuro**: quando un controllo di sicurezza serve a
impedire un'azione, va messo nel punto in cui l'azione avviene DAVVERO
(il "choke point"), non solo in ogni punto da cui quell'azione viene
normalmente invocata — le query di elenco filtrano cosa si VEDE, non cosa
è POSSIBILE fare passando l'id direttamente.

### Seguito stesso giorno — piano operativo per i gap residui + scoperta RIMOVCLI

Dopo la chiusura in sicurezza dei due gap sopra (test_interno, interruttore
job), il titolare ha chiesto un audit onesto di cosa mancasse ancora al
modulo 2.5 rispetto allo standard di settore che era stato descritto in
sessione. Risposta: nessuno dei quattro punti era completo — retry vero
solo parziale (nessuna scrittura sugli errori di rete, quindi nessun
contatore/visibilità), ricevute mai implementate, dashboard di stato mai
costruita sul vero Dashboard KPI (solo la coda in Impostazioni, e un alert
che copre un bisogno diverso — dati completi, non invio avvenuto), regola
24h/6h day-use non costruibile oggi perché `data_arrivo` è `DATE`, nessun
orario salvato da nessuna parte.

Concordato un piano in 4 fasi + una quinta bloccata, ordine
D (cattura ora check-in, prerequisito quasi gratuito) → A (retry
visibile, un giro al giorno confermato, non due) → B (ricevute — fase più
rischiosa, richiede prima rileggere il manuale sul metodo SOAP `Ricevuta`,
mai studiato finora) → C (dashboard, volutamente dopo A per non generare
allarmi rumorosi su guasti di rete transitori). Dettaglio completo delle
4 fasi (file coinvolti, migration, rischi) in `docs/EVOLUTIVE.md`, voce
"Modulo 2.5 — Fase 2, stato al 13/08/2026".

Nello stesso scambio, il titolare ha letto la documentazione ufficiale
Liguria (`docs/ross1000/regione liguria/`, 4 PDF: FAQ, elenco software
house, due moduli di adesione) e ha confermato: per la categoria Hotel il
canale corretto è **RIMOVCLI**, non il webservice `checkinV2` già
implementato nel modulo 2.6. RIMOVCLI è upload manuale di un file XML su
un portale dedicato, con obbligo di certificazione preventiva del
software — un sistema diverso, non solo un dettaglio tecnico in più.
Verificato nell'elenco delle software house che esistono anche ditte
individuali (non solo società) ma nessun caso analogo a "un hotel che usa
il proprio gestionale interno" — da qui la mail preparata per Mario
Schenone (Settore Politiche Turistiche, il referente corretto per le
richieste tecniche, diverso dall'ufficio territoriale per l'adesione),
salvata in `docs/mail_statistiche_liguria.md`, non ancora inviata (manca
nome/telefono/email del titolare). Codice del modulo 2.6
(`ross1000Xml.js`, `ross1000Controller.js`) volutamente non toccato: il
titolare ha chiesto esplicitamente di aspettare la risposta di Regione
prima di ripensarlo, per non lavorare due volte se il canale confermato
fosse un altro. Dettaglio completo: `docs/EVOLUTIVE.md`, voce "Modulo
2.6 — RIMOVCLI vs ROSS1000".

Corretto anche, nello stesso scambio, un problema di infrastruttura test
non legato al codice applicativo: `npm test` in modalità parallela
(default Jest) falliva 10 test per race condition su un'email di test
condivisa tra file (`%@test.hotel`, creata/cancellata da più worker in
contemporanea) — confermato con `--runInBand` sequenziale: 738/738 verdi.
Corretto rendendo `--runInBand` il default in `package.json` (`test` e
`test:api`) invece di lasciarlo come fallimento intermittente da
reinterpretare ogni volta — la causa di fondo (email di test non univoche
per file) resta in backlog, non urgente ora che il default è sequenziale.

### Seguito stesso giorno — Fasi D, A, B del piano eseguite ("parti pure")

Su via libera esplicita del titolare, eseguite le prime tre fasi del piano
concordato (ordine D→A→B→C):

**Fase D — cattura ora check-in**: migration `035_soggiorni_ora_checkin.sql`
(`soggiorni.check_in_effettuato_at TIMESTAMP`), valorizzata in
`prenotazioniController.aggiornaStato` alla transizione verso `check_in`
(per tutti i soggiorni della prenotazione insieme — lo stato è per
prenotazione, non per singola camera). Solo cattura dato, nessun
enforcement 24h/6h ancora costruito. Nuovo test di regressione in
`prenotazioni.test.js`.

**Fase A — retry visibile**: `eseguiInvioReale` ora scrive sempre una riga
in `alloggiati_invii` anche sugli errori di rete/servizio (esito
`'errore_rete'`, prima non scriveva nulla — invisibile). La query di retry
esistente già considera "da reinviare" qualunque esito diverso da `'ok'`,
quindi il comportamento non cambia, solo la visibilità. Nuovo campo
`tentativi_falliti` in `GET /api/alloggiati/coda` (CTE che conta i
tentativi falliti consecutivi dall'ultimo `'ok'`, se mai avvenuto),
mostrato in UI quando > 1. Contatore del job rinominato da `errori_rete`
(ambiguo) a `eccezioni_impreviste` (solo bug/DB irraggiungibile, non più i
fallimenti SOAP noti — quelli ora sono un risultato normale, non
un'eccezione). Confermato un giro al giorno, non due. Test con
`jest.mock('../../backend/lib/alloggiatiSoapClient')` a livello di file
(mai una chiamata di rete reale in questa suite, per design — nessun test
esistente ci arrivava comunque, le credenziali sono sempre vuote in
`.env.test`) — scartato deliberatamente un approccio con
`jest.isolateModules`+`jest.doMock` perché avrebbe ri-richiesto anche
`config/db.js`, aprendo un secondo Pool Postgres mai chiuso (rischio di
lasciare Jest appeso a fine suite).

**Fase B — ricevute (obbligo conservazione 5 anni)**: letto per la prima
volta il metodo SOAP `Ricevuta` (`MANUALEWS.pdf` pag. 17) — scoperta
chiave: la ricevuta è **UN PDF PER GIORNO**, non per singolo soggiorno,
copre tutti gli invii della struttura in quella data; scaricabile solo
"ultimi 30gg escluso il giorno corrente" (mai il giorno stesso dell'invio).
Per questo nuova tabella `alloggiati_ricevute` (migration
`036_alloggiati_ricevute.sql`) chiave per `data`, non per `soggiorno_id` —
diverso da come inizialmente ipotizzato nel piano. Nuova funzione
`alloggiatiSoapClient.scaricaRicevuta` (decodifica base64→Buffer del campo
`PDF`). Nel controller: `scaricaRicevutaGiorno(dataStr)` (valida la finestra
30gg PRIMA di contattare il servizio, idempotente — non richiama Ricevuta
se già scaricata), `scaricaRicevutePendenti()` (trova le date con almeno un
invio `ok`/`parziale` non ancora coperte, entro la finestra, e le scarica
una per una senza che un fallimento blocchi le altre). File salvati in
`backend/uploads/alloggiati_ricevute/<data>.pdf` (cartella creata al primo
uso, stesso pattern di `uploads/archivio`). Job notturno esteso: dopo il
giro di invio, prova a scaricare le ricevute pendenti (try/catch separato —
un problema sulle ricevute non deve mai far sembrare fallito il giro di
invio). Nuova azione `alloggiati.ricevute` in `shared/ruoli.js` +
`frontend/lib/ruoli.js` (admin/titolare, come `invio`). Nuove route
`GET /api/alloggiati/ricevute`, `POST .../ricevute/:data/scarica`,
`GET .../ricevute/:data/file` (download autenticato via fetch+Bearer+blob,
stesso pattern già in uso in `archivio/page.jsx` — un `<a href>` semplice
non può allegare l'header Authorization). Nuova card "Ricevute" in
Impostazioni▸Alloggiati Web: elenco scaricate + download manuale di
scorta per una data a scelta.

Migration da applicare (**non ancora fatto dal titolare a fine sessione**):
`035_soggiorni_ora_checkin.sql`, `036_alloggiati_ricevute.sql`. Nessuna
delle modifiche di questa voce è stata eseguita contro Postgres reale —
solo verificata a livello di sintassi/JSX nel sandbox, come sempre.
`npm test` da rilanciare per confermare i nuovi test (Fase D in
`prenotazioni.test.js`, Fase A/B in `alloggiati.test.js`) verdi in locale.

Fase C (dashboard pallino verde/giallo) non ancora iniziata — prossimo
passo quando il titolare conferma che D/A/B funzionano davvero in locale.

### Seguito stesso giorno — 6 test falliti dopo le migration, 3 bug reali (miei, non del tab Code)

Il titolare ha applicato le migration 035/036 e lanciato `npm test`:
742/748 verdi, 6 falliti in 2 suite. Diagnosticati tutti e tre — nessuno è
del tab Code, tutti introdotti in questa sessione:

**1) Igiene dei mock in `alloggiati.test.js` (causa dei 5 fallimenti
lì)**: tre test impostano `ALLOGGIATI_UTENTE/PASSWORD/WSKEY` finte e le
cancellano con `delete process.env...` alla fine del test — ma solo sul
percorso felice. Se un'asserzione PRIMA di quella riga falliva, il delete
non veniva mai raggiunto: le credenziali finte restavano attive per tutti
i test successivi dello stesso processo (`--runInBand` esegue l'intera
suite in un solo processo Node, `process.env` è globale). Stesso principio
per i mock `mockRejectedValueOnce`/`mockResolvedValueOnce` di
`alloggiatiSoapClient`: se non consumati dalla chiamata prevista (perché
il test si era già fermato prima), restavano in coda e venivano consumati
dalla chiamata `generaToken`/`testSchedine` di un test successivo e
completamente estraneo — spiega il crash
`Cannot read properties of undefined (reading 'schedineValide')`
(`alloggiatiController.js:312`): quel test estraneo chiamava `testSchedine`
senza alcun mock configurato, ottenendo `undefined` invece di un errore o
di un esito valido. Corretto con un `afterEach` globale in testa al file:
`jest.resetAllMocks()` (pulisce sia lo storico chiamate sia le
implementazioni "Once" in coda) + cancellazione incondizionata delle 4
variabili d'ambiente `ALLOGGIATI_*`/`ALLOGGIATI_JOB_ATTIVO` dopo OGNI test,
non solo a fine test riuscito.

**2) Guardie difensive aggiunte in `alloggiatiController.js` e
`scaricaRicevutaGiorno`**: a prescindere dalla causa nei test, la funzione
non doveva poter crashare su una risposta inattesa dal client SOAP — ora
`esitoTest`/`esitoSend` senza una `schedineValide` numerica, o un PDF non
valido da `scaricaRicevuta`, vengono trattati esplicitamente come
`errore_rete`/eccezione invece di far esplodere la funzione. Indurimento
utile a prescindere dal bug dei mock: anche un WSDL cambiato in futuro non
deve mai crashare il job notturno.

**3) Collisione di date in `prenotazioni.test.js` (il 6° fallimento)**: il
nuovo test della Fase D (`check_in_effettuato_at`) usava per errore lo
stesso intervallo (1-5 ottobre 2099) e la stessa camera di default già
usato dal test preesistente `'interrotta': imposta cancellato=true...`.
La seconda `POST /api/prenotazioni` falliva per il vincolo EXCLUDE
camera+intervallo (migration 017), `creata.body.id` restava `undefined`,
e la PATCH successiva colpiva letteralmente `/api/prenotazioni/undefined/stato`
— da cui l'errore Postgres "sintassi di input non valida per il tipo
integer: \"undefined\"" alla riga della SELECT in `aggiornaStato`, un
sintomo che sembrava scollegato dalla vera causa. Corretto spostando il
test della Fase D su un intervallo libero (15-19 ottobre).

Nota per il futuro, non solo per questi tre bug: quando un test isolato
sembra rompere un test completamente estraneo, il sospetto numero uno è
stato pescare uno stato condiviso (camera di default, `process.env`, coda
di mock "Once") senza isolarlo — controllare quello prima di ipotizzare un
bug nel codice applicativo.

### Seguito stesso giorno — causa vera dei 4 falliti residui: jest.resetModules() non isolato

Dopo il fix precedente (742→744 verdi), restavano 4 falliti in
`alloggiati.test.js`, tutti con lo stesso sintomo: una risposta mockata
(`mockRejectedValueOnce`/`mockResolvedValueOnce`) non veniva applicata alla
chiamata prevista. Il titolare ha ipotizzato un limite del parser regex del
client SOAP su risposte XML annidate (`Test`/`Ricevuta`) — ipotesi
ragionevole vista la nota già in CLAUDE.md del 01/08, ma verificata e
scartata: questi test mockano `alloggiatiSoapClient` con `jest.mock`, il
parser regex reale non viene mai eseguito lì, non può essere la causa.

Causa vera: due test scritti in una sessione precedente
(`avviaJobInvioAlloggiatiWeb — interruttore...`) chiamavano
`jest.resetModules()` — che svuota il registro moduli dell'INTERO file di
test, non solo del test che lo chiama. Il riferimento a
`alloggiatiSoapClient` catturato UNA VOLA in testa al file (riga 45, subito
dopo `jest.mock`) restava legato alla "generazione" precedente del
registro; ogni `require('../../backend/controllers/alloggiatiController')`
fatto DOPO quei due test (in tutti i miei test di Fase A/B, che lo
richiedono dentro al corpo del test) otteneva una copia FRESCA — e diversa
— del client SOAP mockato, su cui `mockRejectedValueOnce`/
`mockResolvedValueOnce` non era mai stato impostato: le chiamate
risultavano `undefined` invece di rifiutare o risolvere come previsto.
Esattamente lo stesso meccanismo di "coda mock non consumata" già
diagnosticato nel giro precedente, ma con una causa a monte diversa e più
sottile (non igiene dei singoli test, un registro moduli condiviso
resettato in modo non isolato).

Corretto sostituendo `jest.resetModules()` con `jest.isolateModules(() =>
{...})` nei due test del cron: isola il reset SOLO all'interno del
callback (dove vengono ri-richiesti `node-cron` e
`jobs/invioAlloggiatiWeb.js`), senza toccare il registro condiviso dal
resto del file. Corretto anche un dettaglio minore segnalato dal titolare,
innocuo ma da sistemare: `tentativi_falliti` tornava come stringa (tipico
di `COUNT()` non castato in Postgres/node-pg) — cast `::int` nella query,
senza toccare il type parser globale di `config/db.js` (già in backlog
come task separato, non di questa sessione).

Nota per il futuro, più specifica della precedente: `jest.resetModules()`
va quasi sempre sostituito con `jest.isolateModules()` quando il file ha
ALTRI test che dipendono da un `jest.mock()` catturato in una variabile di
modulo — resetModules() è "a livello di file", isolateModules() è "a
livello di blocco". Lezione appresa nel modo più costoso: due test scritti
prima e mai toccati in questa sessione hanno rotto quattro test scritti
dopo, con un sintomo che sembrava indicare tutt'altro (parsing XML).

Confermato dal titolare: 748/748 verdi, 31/31 suite. Segnalato anche un
processo Jest rimasto appeso in uscita, descritto come "comportamento
innocuo di sempre" — verifica diretta del test in questione ha smentito
l'aggettivo "di sempre": il secondo test del cron
(`con ALLOGGIATI_JOB_ATTIVO=true pianifica il cron`, aggiunto oggi) usava
`jest.spyOn(cron, 'schedule')` senza `mockImplementation` — di default lo
spy chiama comunque l'implementazione reale, quindi il test schedulava un
cron job vero su `node-cron` (interval attivo). `spy.mockRestore()`
ripristina solo il riferimento alla funzione, non ferma il task già creato
— quello era l'handle che teneva Jest appeso. Corretto in entrambi i test
del cron con `mockImplementation(() => ({ stop: jest.fn() }))`: verifica
ancora che `cron.schedule` sia chiamato con i parametri giusti, ma senza
creare mai un task reale. Riverificato dal titolare: 748/748, 31/31 suite, exit code 0, processo
Jest terminato pulito da solo. Fix chiuso.

### Fase C — dashboard con pallino verde/giallo (14/08/2026)

Ultimo punto del piano D→A→B→C concordato il 13/08. Nessun componente UI
nuovo: `AlertItem` (frontend) mostra già un dot colorato per riga, stesso
meccanismo di ZTL/Magazzino/HR/Manutenzione — riusato tal quale.

Nuovo blocco in `dashboardController.alert()`, concettualmente diverso
dall'alert "documento incompleto" già esistente dal 06/08 (quello è
readiness PRIMA dell'arrivo — dati pronti per generare la schedina, non
invio avvenuto). Questo copre l'invio vero e proprio DOPO il check-in:
prima di oggi l'unico modo per sapere se qualcosa non era stato inviato
era andare apposta in Impostazioni ▸ Alloggiati Web.

Logica: termine legale = 24h da `check_in_effettuato_at` (colonna Fase D,
13/08) se presente, altrimenti da `data_arrivo` 00:00 per i soggiorni più
vecchi che non l'hanno mai valorizzato. Rosso se il termine è scaduto e
l'invio non è 'ok', ambra se ancora in coda ma nei termini (aspetta il
giro notturno). Esclude sempre `canale_origine='test_interno'`, stesso
principio già applicato ovunque nel modulo.

Scelta deliberata, non una dimenticanza: **non implementata la regola
delle 6h per il day-use** (arrivo e partenza lo stesso giorno) — stessa
decisione già presa per la Fase D, perché nessuna prenotazione così esiste
oggi nel sistema. Implementarla ora avrebbe significato scrivere codice
non verificabile contro un caso reale.

Test aggiunti a `tests/api/dashboard.test.js` (file già esistente, non
creato da questa sessione — probabile lavoro del tab Code in parallelo,
non ancora notato prima): 4 casi nuovi (termine scaduto → rosso, termine
non scaduto → ambra, esito 'ok' già registrato → nessun alert anche con
check-in vecchio, canale test_interno → nessun alert anche con termine
scaduto). Verificata solo la sintassi (`node -c`) e lo schema delle
migration coinvolte (034 `dettaglio_errore`, 035 `check_in_effettuato_at`)
— **non ancora eseguito contro Postgres reale**, da confermare con
`npm test`.

Con questo si chiude il piano concordato il 13/08 (D→A→B→C). Resta solo la
Fase E (RIMOVCLI), bloccata sulla risposta di Regione Liguria — nessuna
azione possibile finché il titolare non invia
`docs/mail_statistiche_liguria.md`.

### Seguito stesso giorno — bug di isolamento test, non applicativo

Primo `npm test` dopo la Fase C: il titolare ha trovato che nel DB di
sviluppo esistono 6 soggiorni REALI (non di test, canale `diretta`/
`telefono`) mai inviati ad Alloggiati Web, con termine (scadenza 24h)
risalente a fine luglio/inizio agosto — molto più vecchio dei fixture dei
nuovi test. La query dell'alert ha `LIMIT 5` ordinato per urgenza: quei 6
soggiorni reali riempivano da soli tutti gli slot, escludendo del tutto i
2 fixture creati dal test (che quindi non comparivano mai nella risposta
HTTP `GET /api/dashboard/alert`, causando `alert.toBeDefined()` falliti).
Non un bug introdotto da questa sessione né dalla migration 035/036 — un
test che presumeva di essere l'unico dato rilevante in un DB che invece
accumula backlog reale mai inviato (il job resta spento di default anche
in sviluppo).

Segnalato anche un punto di prodotto più ampio, non deciso ora: se in
produzione si accumulasse un backlog cronico di soggiorni MAI inviabili
(dati insufficienti, bloccati per sempre in `errore`), quei 5 slot
resterebbero occupati per sempre dagli stessi vecchi problemi, e l'alert
smetterebbe di segnalare i nuovi. Nessuna decisione presa — richiede dati
reali di produzione per essere valutata, non ipotesi. Annotato in
`docs/EVOLUTIVE.md`, non un'azione da fare ora.

Fix applicato: estratta la query in una funzione dedicata
(`alertInviiAlloggiati`, `dashboardController.js`), con un filtro
opzionale `soggiornoIds` — se passato, si somma alle condizioni WHERE già
esistenti (canale_origine, esito), non le sostituisce. `alert()` in
produzione la chiama sempre senza filtro, comportamento identico a prima
dell'estrazione. I test ora chiamano `alertInviiAlloggiati()` direttamente
con gli id dei propri fixture, invece di passare dall'endpoint HTTP e
sperare di rientrare nei primi 5 risultati — deterministico
indipendentemente da quanto backlog reale esiste nel DB di sviluppo in un
dato momento. Nessun dato reale toccato o cancellato. Verificata solo la
sintassi — da confermare con `npm test`.

### Seguito stesso giorno — interruttore obbligatorio sul job, spento di default

Il titolare ha fatto tre domande di seguito ("posso tenere le prenotazioni
di test?", "il job parte col server spento?", "cosa succede stanotte alle
prenotazioni reali?") che hanno fatto emergere un problema più serio del
gap precedente: il job costruito in questa sessione si registrava da solo
ad ogni riavvio del server, senza alcun interruttore — in contraddizione
diretta con quanto il titolare stesso aveva chiesto qualche messaggio
prima ("il pulsante deve cmq essere inattivo per evitare problemi").

Il problema pratico: `trovaSoggiorniDaInviare()` non ha un limite di data
inferiore, solo "arrivo già avvenuto, nessun invio con esito 'ok'". Se
distribuito così com'era, il primo giro utile non avrebbe inviato solo i
soggiorni di quella notte, ma TUTTO l'arretrato di prenotazioni reali
inserite da fine luglio (modulo Prenotazioni) — in un colpo solo, senza
che il titolare avesse mai visto un `Send` reale andare a buon fine
(finora solo `Test`, che verifica il formato senza acquisire nulla).

Corretto aggiungendo un interruttore esplicito in
`avviaJobInvioAlloggiatiWeb()` (`backend/jobs/invioAlloggiatiWeb.js`): il
job NON si registra (niente `cron.schedule`) a meno che
`ALLOGGIATI_JOB_ATTIVO` non valga esattamente `'true'` in `.env` sul
server — di default resta sempre spento, anche dopo un deploy che include
questo file. Va acceso solo dopo aver verificato un invio reale singolo e
mirato tramite "Invia ora" nella coda di Impostazioni▸Alloggiati Web.
Due nuovi test (`tests/api/alloggiati.test.js`, in fondo al file) coprono
entrambi i rami con uno spy su `cron.schedule`: spento di default, attivo
solo con la variabile impostata.

Confermato al titolare anche il comportamento delle prenotazioni di test:
non serve cancellarle per essere al sicuro — il blocco vive ora dentro
`eseguiInvioReale` stessa (vedi sopra), quindi qualunque canale lo
attraversa. La coda "Invia ora" le esclude comunque dalla vista; per test
manuali sulle prenotazioni fittizie resta corretto usare "Verifica
schedina" (Test), mai "Invia ora".

### Riorganizzazione menu — mock prima, codice dopo (14/08/2026)

Il titolare ha segnalato che il menu (sidebar) era diventato troppo lungo
da scorrere — OSPITALITÀ da sola aveva 9 voci. Discusso e mockato (widget
`mcp__visualize`, non codice reale) prima di scrivere una riga: dashboard
riorganizzata in gruppi tematici (Gestione cliente, Adempimenti, Gestione
hotel, Costi, Ristorante) e tre alternative di navigazione per il menu
(accordion con auto-chiusura, rail a sole icone, ricerca rapida) — il
titolare ha scelto la rail a icone, con l'aggiunta di un'etichetta fissa
sotto ogni icona su desktop (su richiesta sua, per non dover imparare a
memoria le icone) e di un tab Cerca separato.

**Sidebar.tsx riscritta**: rail verticale (`var(--sidebar-rail-width)`,
72px) con icona+etichetta per gruppo + tab Cerca, pannello a comparsa
(`var(--sidebar-flyout-width)`, 200px) con le voci del gruppo selezionato
o i risultati di ricerca. Il gruppo aperto si sincronizza da solo con la
route corrente (`useEffect` su `pathname`) — non va ricordato a mano.
`SEZIONI_MENU` resta l'unica fonte di verità (stesso principio di prima):
aggiungere/spostare una voce è una modifica di un array, nessun'altra
parte del componente va toccata. Due nuove CSS variable in `globals.css`
(`--sidebar-rail-width`, `--sidebar-flyout-width`) invece di una larghezza
fissa — la proporzione rail/pannello si cambia in un punto solo, su
richiesta esplicita del titolare di codice "modulare e scalabile".

**Bottom nav mobile INVARIATA** — richiesta esplicita del titolare dopo
aver ragionato sui numeri: 8 gruppi + tab Cerca fanno 9 icone, che su un
telefono (~375-414px) non stanno affiancate a un tap target usabile
(soglia 44px). Il pannello "Menu" mobile (bottom sheet) continua a
leggere `SEZIONI_MENU`, quindi eredita comunque il nuovo raggruppamento.

**8 gruppi** (da 6): PRINCIPALE invariato; OSPITALITÀ divisa in CLIENTI E
PRENOTAZIONI (Prenotazioni, Arrivi/Partenze, Clienti, Pre check-in,
Addebiti extra) e CAMERE E TARIFFE (Stato Camere, Tariffe, Pacchetti);
nuovo gruppo ADEMPIMENTI (Tassa di soggiorno, ZTL Targhe, Alloggiati Web,
Statistiche Liguria) — specchio del widget dashboard omonimo, discusso
nella stessa conversazione; RISTORANTE invariato; ALTRO rinominata
STRUTTURA (HACCP, Archivio, Manutenzione); MARKETING invariato; IMPOSTAZIONI
spostata in fondo (era prima di MARKETING), su richiesta esplicita del
titolare.

**Split pagina Alloggiati Web** (risolve un buco segnalato durante la
discussione dei mock: ADEMPIMENTI aveva bisogno di una pagina operativa
per Alloggiati Web, ma prima esisteva solo Impostazioni▸Alloggiati Web,
una pagina di configurazione). Nuova `/alloggiati-web` (gruppo ADEMPIMENTI):
"Coda invii" + "Ricevute", stessi endpoint di prima, nessuna modifica
backend. `Impostazioni▸Alloggiati Web` resta solo con Verifica credenziali,
Verifica schedina (Test) e Tabelle di codifica — link incrociati tra le
due pagine. "Statistiche Liguria" in ADEMPIMENTI punta ancora a
`/impostazioni/ross1000` (nessuno split possibile finché la Fase E non è
sbloccata) — rimossa la vecchia voce "Export ROSS1000" da IMPOSTAZIONI per
non avere due link alla stessa pagina con due nomi diversi.

Verificato con `tsc --noEmit` sull'intero progetto frontend: 0 errori.
Non verificato in un browser reale (nessun accesso a dev server dal
sandbox) — da controllare visivamente al prossimo giro.

**Dashboard: NON ancora implementata**, fermata deliberatamente prima di
scrivere il backend — un blocco reale emerso rileggendo la richiesta del
titolare per il widget "Gestione cliente": una delle quattro voci chieste
era "prenotazioni arrivate via OTA/booking da visualizzare/gestire", ma
il modulo 2.3 (integrazione WuBook/channel manager) non è mai partito
oltre la Fase 1 (mappatura camere↔canale, 31/07/2026) — non esiste ancora
nessuna ricezione reale di prenotazioni da OTA nel gestionale (nessun
webhook, nessuna tabella popolata). Costruire quel widget oggi
significherebbe mostrare sempre zero o inventare un dato — segnalato al
titolare, in attesa di come vuole gestire questo pezzo prima di
proseguire con il resto della dashboard (tutto il resto è costruibile con
dati reali già esistenti: arrivi/partenze, check-in e pre check-in da
fare, camere da pulire, manutenzioni aperte, magazzino sotto scorta,
incasso/food cost, coperti ristorante).

**Seguito stesso giorno — Dashboard implementata**: il titolare ha sciolto
il blocco con un'istruzione esplicita — procedere con tutti i widget, e
per ciò che non ha ancora dati reali sotto scrivere un placeholder
visibile ("modulo non sviluppato" o simile) invece di ometterlo o
inventare uno zero. Nuovo endpoint `GET /api/dashboard/gruppi`
(`dashboardController.js`, funzione `gruppiWidget`) che aggrega in un
solo JSON i 5 gruppi discussi nei mock (Clienti, Adempimenti, Hotel,
Costi, Ristorante); frontend: due componenti nuovi e riutilizzabili,
`WidgetGruppo.tsx` (pannello) e `WidgetItem.tsx` (singola tessera,
con una modalità placeholder dedicata quando `sviluppato: false`),
`home/page.jsx` riscritta per comporli in griglia sopra la vecchia
lista di alert (rinominata "Altri alert", tenuta per le voci non ancora
coperte da un widget dedicato — scadenze HR, opzioni prenotazione in
scadenza, pre check-in da rivedere, documenti Alloggiati incompleti,
menu non configurato — il titolare non aveva deciso se toglierla, tenuta
per non perdere segnalazioni reali).

Due scostamenti onesti dalla richiesta letterale, entrambi perché il dato
esatto chiesto non è tracciato da nessuna parte del sistema oggi (non
un'omissione, una scelta esplicita):
- "quanti clienti stanno mangiando ora" → nessuna tabella registra i
  coperti effettivamente seduti (`comande` non lo traccia, solo la
  capienza massima del tavolo in `tavoli.coperti`) — sostituito con
  "Tavoli occupati ora" (comande con `stato='aperta'` aperte oggi), un
  numero reale invece di una stima presentata come dato esatto.
- "Statistiche Liguria" nel gruppo Adempimenti non è un placeholder come
  OTA e fabbisogno pasti: la Fase 1 (generazione XML) è completata e
  funzionante, manca solo l'automazione dell'invio (Fase 2, bloccata
  sulle credenziali Regione Liguria) — la tessera lo dice esplicitamente
  ("generazione manuale, nessun invio automatico") invece di essere
  etichettata "non sviluppato" come le due voci davvero assenti, per non
  confondere un modulo completo-ma-manuale con uno mai iniziato.

Query nuove scritte riusando pattern/tabelle già validati altrove, non
inventati: camere da fare rispecchia esattamente la logica arrivo/
partenza di `camereController.js` (migrata da `stato_camere` a
`soggiorni` nel modulo 5.1); tassa di soggiorno da riscuotere aggiunge
una finestra di 30 giorni indietro (altrimenti conterebbe anche
l'arretrato storico pre-modulo 2.4, mai riconciliato); pre check-in da
inviare usa `prenotazioni.pre_checkin_inviato_at IS NULL` (stessa colonna
già scritta dal job promemoria, modulo 5.3) con una finestra di 7 giorni
in avanti per restare azionabile invece di mostrare l'intero futuro.

Nuovi test `tests/api/dashboard.test.js` (forma della risposta, presenza
dei placeholder, tipi numerici) — non una batteria di fixture per ogni
singolo conteggio: le tabelle coinvolte sono già coperte da test altrove
(HR, camere, tassa di soggiorno, Alloggiati Web). Verificato solo con
`tsc --noEmit` (0 errori) e `node -c` sul backend — non eseguibile nel
sandbox contro un database reale, né visto in un browser: il titolare
deve ancora lanciare `npm test` e guardarla dal vivo.

**Seguito stesso giorno — primo giro dal vivo, 3 correzioni** (759/759
test verdi confermati dal titolare). La vecchia riga KPI (Camere
movimenti/Coperti/Incasso/Food cost) e il bottone isolato "Registra
incasso di oggi" erano rimasti sopra la nuova griglia, invariati dalla
versione precedente — non tolti per errore, mai stati nel piano di
rimozione perché servono ancora a cameriere/cuoco/portiere notte (unici
ruoli che non vedono la griglia widget). Per admin/titolare erano però
puro doppione dei nuovi widget: KPI ora `{!isGestione && ...}` (chi ha la
griglia non la vede più due volte, chi non ce l'ha la mantiene
identica). Il bottone "Registra incasso" non è un residuo — è l'unico
modo con cui `incassi_giornalieri` riceve dati (nessuna fonte automatica,
CLAUDE.md §11 modulo 1.8) — ma isolato senza contesto sopra la griglia
non si capiva a cosa servisse: spostato dentro il widget Costi come
azione del gruppo (nuova prop `azione` su `WidgetGruppo.tsx`, un
ReactNode opzionale a destra del titolo — riutilizzabile per altri
gruppi in futuro, non specifico a questo bottone). Riordinati i gruppi
perché il titolare voleva Ristorante affiancato a Gestione hotel: prima
Ristorante aveva `lg:col-span-2` e finiva da solo sulla terza riga
(Hotel+Costi riempivano già la riga 2) — tolto lo span, riordinato
Hotel→Ristorante→Costi così riempiono esattamente la riga 2 fianco a
fianco su schermi `lg`.

Rimasto apertamente in sospeso, non un'azione da fare ora: il titolare
ha detto "rimane il dubbio del testo sul personale e lista alert" senza
chiedere una modifica — Presenze oggi e "Altri alert" restano dove sono
(sotto la griglia, ridotti in prominenza rispetto a prima), in attesa che
li veda dal vivo prima di decidere se toglierli, ridurli o lasciarli.

**Seguito — perché la riga KPI non va tolta ai ruoli non-gestione**: il
titolare ha chiesto se, essendo ridondante per admin/titolare, andasse
cancellata anche per gli altri ruoli invece di solo nascosta. Verificando
il codice per rispondere, trovato un buco preesistente più grande di
quanto pensassi: `receptionist`, `cuoco` e `dipendente` non rientrano né
in `isGestione` né in `isCameriera`/`isPortiere` — per loro la pagina
home aveva SOLO la riga KPI (Camere+Coperti, Incasso/Food cost già
esclusi da prima) più un pannello "Altri alert" mostrato incondizionato
ma mai popolato (`alerts` viene caricato solo `if (isGestione)` — per
gli altri resta `[]` per sempre), quindi diceva sempre "Tutto ok, nessun
alert" senza che l'endpoint fosse mai stato interrogato: una falsa
rassicurazione, non un'informazione mancante onesta. Cancellare anche la
riga KPI per questi ruoli avrebbe lasciato loro una dashboard vuota (solo
saluto e data). Corretto il pezzo sistemabile subito senza allargare lo
scope della sessione: pannello "Altri alert" ora `{isGestione && ...}`
come "Presenze", stesso principio già applicato altrove — mai mostrare
un dato come "ok" se non è mai stato controllato. La riga KPI resta,
unico contenuto reale rimasto per questi tre ruoli. Annotato in
`docs/EVOLUTIVE.md`: una dashboard home dedicata per receptionist/cuoco/
dipendente (oggi coperti solo da 2 KPI generici, non tagliati sul loro
lavoro) è un miglioramento vero ma è un pezzo di scope nuovo, non
deciso in questa sessione.

**Bug reale trovato dal titolare cliccando sul widget "Menu del giorno" —
migration 009 mancante, colmata (14/08/2026)**. La categoria "Cat Test
Addebiti" duplicata ~14 volte nel filtro del menu reale non era un
residuo statico: `tests/api/addebiti-extra.test.js` la creava con
`INSERT ... ON CONFLICT DO NOTHING` assumendo un vincolo UNIQUE su
`menu_categorie.titolo` che non è mai esistito — nessun conflitto poteva
scattare, quindi ogni run della suite ne inseriva una copia in più, mai
ripulita da `afterAll`. Corretto con lo stesso pattern a suffisso
univoco (`SUFFISSO`) già in uso nel resto del file: id tracciato, riga
cancellata esplicitamente in `afterAll`, non serve più un vincolo DB per
essere idempotente. Il titolare deve ancora lanciare in produzione
`DELETE FROM menu_piatti WHERE nome = 'Extra Test'; DELETE FROM
menu_categorie WHERE titolo = 'Cat Test Addebiti';` per ripulire
l'arretrato — non eseguibile da qui.

Cercando il vincolo per capire il bug, trovato un problema più grande e
indipendente: **la migration `009` (CREATE TABLE `menu_categorie` /
`menu_piatti`, modulo 1.5) non è mai esistita nel repo né nella
cronologia git** — la sequenza numerata saltava da 008 a
010_menu_categorie_emoji.sql (che fa solo un ALTER TABLE, presupponendo
le tabelle già presenti). Le due tabelle sono sempre esistite solo nel
database reale. Il titolare ha estratto lo schema vero con uno script
diagnostico usa-e-getta (`backend/scripts/dumpSchemaMenu.js`, scritto e
poi cancellato in questa sessione — non doveva restare nel repo) lanciato
dalla cartella `backend/` (nella root falliva silenziosamente: `.env` non
trovato, `dotenv.config()` senza path esplicito). Confermato dai default
reali un rischio concreto, non solo ipotetico: sia `menu_categorie.attivo`
sia `menu_piatti.disponibile` hanno default `true` — la categoria e il
piatto di test creati dalla suite erano quindi potenzialmente visibili
anche su `/menu-pubblico` ai clienti reali (un piatto "Extra Test" da
10€), non solo nel pannello admin. Il titolare deve ancora verificare se
comparisse davvero lì; la pulizia SQL sopra la risolve comunque. Scritta
`database/migrations/009_menu_categorie_piatti.sql`, retroattiva,
`CREATE TABLE IF NOT EXISTS` con lo schema esatto letto dal titolare
(niente rischio su produzione/sviluppo, dove le tabelle già esistono —
utile per un ambiente ricostruito da zero, che oggi si romperebbe qui).
Titolare: migration eseguita, arretrato pulito, `/menu-pubblico`
verificato — tutto ok, confermato.

**Scorciatoia Dashboard nella rail** (14/08/2026, ultima richiesta della
sessione): dopo aver approvato il menu a rail ("mi piace"), il titolare
ha segnalato che tornare a `/home` da una pagina interna richiedeva
comunque due click (icona gruppo PRINCIPALE → voce Dashboard nel
pannello). Aggiunto un `Link` diretto a `/home` in cima alla rail,
sopra "Cerca" — icona `Home` (non `LayoutDashboard`, già usata
dall'icona del gruppo PRINCIPALE subito sotto, per non avere la stessa
icona due volte sulla rail). Un click da qualunque pagina, per tutti i
ruoli. Nessuna modifica a `SEZIONI_MENU` o al mobile. Verificato solo
con `tsc --noEmit` (0 errori) — arrivata dopo l'ultimo giro di verifica
visiva del titolare sul menu, quindi va guardata anche lei prima del
deploy insieme al resto rimasto in sospeso (checklist data al titolare
nel messaggio precedente: `npm test` aggiornato + controllo visivo
completo della rail).

**Type parser BIGINT centralizzato in `backend/config/db.js`** (14/08/2026,
tolto dalla coda su richiesta esplicita del titolare — era stato segnalato
come annotazione minore mentre si sistemava `pre-checkin.test.js`, non un
bug attivo). `types.setTypeParser(20, val => parseInt(val, 10))`,
simmetrico a quello già esistente per le date (OID 1082). Prima, ogni
`COUNT(*)` (sempre bigint in Postgres) tornava come stringa da node-pg —
dipendeva da ogni controller ricordarsi `Number(...)` a mano, decine di
punti in tutto il codice (inclusi i widget dashboard di oggi stesso).
Sicuro per questo gestionale: i bigint in uso sono conteggi di riga su un
hotel di 20 camere, mai vicini a `Number.MAX_SAFE_INTEGER` — da rivalutare
se un giorno comparisse un vero bigint id di grandi dimensioni, non il
caso oggi. I punti che già facevano `Number(...)` esplicito restano
corretti senza modifiche (`Number(Number(x)) === Number(x)`). Aggiornato
anche il commento in `tests/api/pre-checkin.test.js` che spiegava il
motivo del cast esplicito lì, ormai storicamente superato dalla fix ma
non rimosso (resta innocuo). Verificato solo con `node -c` — è un cambio
di comportamento globale (tocca ogni bigint di ogni query del
gestionale), va rieseguita la suite completa `npm test` per conferma
prima di considerarlo davvero chiuso, non solo i file toccati oggi.

**Contatto A-Cube corretto + mail preparata** (14/08/2026, il titolare ha
chiesto come contattarli per il preventivo del modulo 3.1). Verificato dal
vivo sul sito ufficiale (`acubeapi.com`): l'indirizzo `sales@a-cube.io`
scritto in `docs/DOMANDE_APERTE_07-08-2026.md` e
`docs/PIANO_MIGRAZIONE_DICEMBRE_2026.md` è sbagliato — dominio diverso da
quello reale dell'azienda, nessuna prova sia mai stato valido. Corretto in
entrambi i file: `info@acubeapi.com`, o il form su `acubeapi.com/contatti`
(categoria "E-Receipts"). Scritta `docs/mail_acube_preventivo.md` (stesso
schema di `mail_statistiche_liguria.md`), riusando i volumi camere già
preparati in `DOMANDE_APERTE` e lasciando il dato ristorante esplicitamente
"da recuperare" invece di aspettare di averlo prima di scrivere — i tempi
di risposta commerciale di A-Cube sono già segnalati nel piano come il
rischio meno controllabile, meglio far partire il contatto ora. Non
inviata: nome/telefono/email del titolare ancora da completare, stesso
punto aperto già presente per la mail a Mario Schenone.

**Planning camere vs PMS leader + 3 sviluppi (14/08/2026, ultima parte
della sessione)**. Su richiesta del titolare, confronto mirato tra
`/planning-camere` e Cloudbeds/Mews/Slope prima di proporre una scaletta di
sviluppo — dettaglio dei riferimenti in `docs/EVOLUTIVE.md` (voce "confronto
con Slope" del 10/08/2026, riusata) più tre ricerche web mirate su
Cloudbeds/Mews. Conclusione: la meccanica di base (drag-and-drop, vincolo
anti-overbooking a livello DB, state machine) è già alla pari — i gap reali
stavano nella comodità operativa quotidiana. Il titolare ha approvato tre
dei cinque punti emersi per sviluppo immediato, gli altri due rimandati a
`docs/EVOLUTIVE.md` (icona gruppo sulla barra — rinviabile; gestione
"prenotazioni non assegnate" — solo col modulo 2.3/WuBook).

1. **Elenco prenotazioni (toggle Griglia/Elenco)** — `GET /api/prenotazioni`
   nuovo (`prenotazioniController.lista`), una riga per soggiorno/camera,
   filtri ricerca/data_da/data_a/stato/canale_origine, paginazione. Non una
   voce nuova in sidebar (era già segnalata come troppo affollata, 7 voci)
   — un secondo "modo" della stessa voce Prenotazioni, stesso pattern già
   usato per Alloggiati Web operativa/configurazione. Nuovo componente
   `VistaElenco` in `planning-camere/page.jsx`, click riga → stesso
   `PannelloDettaglio` della griglia (nessun componente duplicato).
2. **Ricerca nella griglia** — casella di ricerca nella toolbar (solo vista
   Griglia), confronto su nome/cognome ospite e numero camera. Evidenzia
   per contrasto (opacità ridotta sulle barre non corrispondenti) invece di
   nascondere — stesso pattern "grayed out" di Cloudbeds, mantiene il
   contesto visivo della griglia. Zero chiamate in più: i dati sono già
   nella risposta di `/griglia`.
3. **Riepilogo economico (conto/folio)** — `GET /api/prenotazioni/:id/conto`
   nuovo, aggrega camera (`soggiorni.tariffa_totale`) + addebiti extra
   (`addebiti_extra`, esistente dal 10/08) + tassa di soggiorno
   (`tasse_soggiorno`, se già calcolata — l'endpoint non la calcola, nessun
   side effect da una lettura) − pagamenti = saldo da incassare. Sostituisce
   nel pannello dettaglio la vecchia lista pagamenti grezza (prima il totale
   camera si vedeva solo nel tooltip al passaggio del mouse, gli addebiti
   extra solo aprendo un'altra pagina, la tassa di soggiorno non compariva
   affatto). La tassa resta un flusso volutamente separato dai pagamenti
   (la sua riscossione non crea una riga in `pagamenti`, tracciata a parte
   nella risposta — `tassa_soggiorno.riscossa`).

File toccati: `backend/controllers/prenotazioniController.js` (+`lista`,
+`conto`), `backend/routes/prenotazioni.js` (+`GET /`, +`GET /:id/conto`),
`frontend/app/planning-camere/page.jsx` (toggle vista, `VistaElenco`,
ricerca griglia con `corrispondeRicerca`, sezione "Riepilogo economico" nel
pannello dettaglio), `tests/api/prenotazioni.test.js` (+13 test nuovi,
inclusa la correzione all'`afterAll`: `addebiti_extra`/`pagamenti` non
hanno `ON DELETE CASCADE` su soggiorno_id/prenotazione_id, la pulizia dei
dati di test doveva succedere PRIMA di quella di soggiorni/prenotazioni, non
dopo — altrimenti la suite avrebbe iniziato a fallire per violazione FK non
appena un test avesse creato un pagamento/addebito). Aggiornato anche
`docs/PRENOTAZIONI_FASE2.md` Parte C (nuove sezioni "Elenco prenotazioni" e
"Ricerca nella griglia") e Parte D ("Conto ospite (folio)" segnato ✅, con
nota su cosa resta aperto: il toggle "addebita a camera" nel flusso comanda
**normale** del Ristorante, oggi solo la griglia rapida bar/camera scrive
su `addebiti_extra` — voce propria in `docs/EVOLUTIVE.md`).

Verificato solo con `tsc --noEmit` (0 errori, frontend) e `node -c`
(backend + file di test, tutti puliti) — **`npm test` non ancora eseguito
dal titolare in locale**, va lanciato prima di considerare il lavoro
davvero chiuso. `tests/api/prenotazioni.test.js` ha 13 test nuovi (elenco +
conto) e testa per la prima volta in questo file la creazione di un
addebito extra e di un pagamento nello stesso giro — punto dell'`afterAll`
più delicato di prima, verificare con attenzione l'esito di quella suite in
particolare.

**Seguito stesso giorno — verifica del titolare (tutto verde) + 2 fix UI +
schermata di check-out (14/08/2026)**. Confermato dal titolare: `npm test`
tutto verde su `tests/api/prenotazioni.test.js`. Due fix di layout su
`/planning-camere` richiesti a seguire: legenda stati spostata dalla riga
toolbar (condivisa con `justify-between`, risultava schiacciata/non
centrata) a una riga propria con `justify-center`; "Nuova prenotazione"
rimasto sulla riga toolbar principale (toggle Griglia/Elenco + range +
ricerca + navigazione), sempre come ultimo elemento a destra.

**Gap reale segnalato dal titolare, confermato da codice**: il check-out
era — fino a questo momento — un singolo `PATCH .../stato` senza nessuna
schermata, nessun riepilogo, nessuna possibilità di stampare qualcosa per
l'ospite (verificato: `fasiCheckOut()` faceva solo il PATCH e chiudeva il
pannello). Anche la "ricevuta di cortesia" già *decisa* nel commento della
migration 031 (10/08/2026) non era mai stata costruita — zero righe di
codice `ricevuta`/`stampa` in `addebiti-extra`. Il titolare ha scelto di
svilupparla subito (non rimandarla alla scaletta).

Costruito `PannelloCheckOut` (nuovo componente in `planning-camere/
page.jsx`): il pulsante Check-out nel pannello dettaglio ora apre questo
modal invece del PATCH diretto. Contenuto: dati ospite/camera/date,
`RiepilogoEconomico` (estratto dal pannello dettaglio in un componente
condiviso, stessa fonte `GET /api/prenotazioni/:id/conto`, zero
duplicazione), un mini-form per registrare un pagamento al volo se
`saldo_da_incassare > 0` (riusa `POST /api/prenotazioni/:id/pagamenti`,
nessun endpoint nuovo — non blocca il check-out se il saldo resta
positivo, resta una scelta della reception), pulsante "Stampa ricevuta di
cortesia" (apre `/ricevuta-cortesia/:id` in una nuova scheda), pulsante
"Conferma check-out" che esegue il PATCH solo a questo punto.

Nuova pagina `frontend/app/ricevuta-cortesia/[id]/page.jsx`: stesso
pattern CSS `@media print` + `window.print()` già collaudato in
`/menu-stampa`, ma protetta da autenticazione (usa `api.get`, non fetch
pubblico — il cookie JWT è condiviso tra schede dello stesso browser,
`window.open` in una nuova scheda eredita la sessione senza bisogno di
passare token). Documento **esplicitamente etichettato non fiscale** in
due punti (sottotitolo e footer): l'emissione fiscale reale è compito del
modulo 3.1/A-Cube (non ancora iniziato), questa ricevuta non la anticipa
né la sostituisce — solo un promemoria di cortesia con lo stesso
riepilogo camera/addebiti extra/tassa di soggiorno/pagamenti/saldo del
modal.

Nessuna migration, nessun endpoint backend nuovo — tutto il lavoro riusa
`GET /api/prenotazioni/:id`, `GET /api/prenotazioni/:id/conto` (di questa
stessa sessione) e `POST /api/prenotazioni/:id/pagamenti` (già esistente).
Verificato solo con `tsc --noEmit` (0 errori) — **non ancora verificato in
UI dal titolare**: apertura del modal al click su Check-out, il mini-form
pagamento, e soprattutto la stampa/anteprima PDF della ricevuta (mai
testata la resa reale su carta/PDF, solo il markup). Aggiornato
`docs/PRENOTAZIONI_FASE2.md` Parte C con la nuova sezione "Check-out —
schermata dedicata".

**Seguito immediato — chiarimento + micro-fix "Registra pagamento"**. Il
titolare ha chiesto conferma su cosa faccia davvero il pulsante "Registra"
nel mini-form del check-out, sospettando non facesse nulla. Chiarito: fa
già una scrittura reale in `pagamenti` — non tocca mai lo stato della
prenotazione (nessun pulsante di questo flusso porta a `chiusa`, quella
transizione resta legata all'emissione fiscale reale/A-Cube, come già
documentato). Causa reale della sensazione "non fa nulla": il box con
form+pulsante è condizionato a `saldo_da_incassare > 0` — se l'importo
copre tutto il saldo il box sparisce di scatto alla risposta, senza
nessuna conferma visibile. Non è (e non deve diventare) un addebito carta
vero: stesso principio già in uso nel resto del gestionale (incasso fisico
fuori sistema, "Registra" è solo la scrittura contabile) — un vero
processore di pagamento è il modulo 3.3 (Nexi/Stripe via WuBook), fuori
scope qui. Fix richiesto e fatto subito: nuovo stato `pagamentoEsito`,
messaggio verde "Pagamento di €X registrato" visibile ~2.5s sia nel caso
di pagamento parziale (il form resta visibile, prima non c'era comunque
nessun segnale) sia nel caso che azzera il saldo (box dedicato che
sostituisce per qualche secondo quello che sta per sparire). Verificato
solo con `tsc --noEmit` (0 errori) — non ancora visto in UI.

**Seguito — ricerca HACCP + export PDF planning**. Su richiesta del
titolare, indagine di mercato/normativa sul modulo futuro 6.1 (HACCP
avanzato): competitor italiani (HaccpOK 25€/mese o 240€/anno con vincolo
24 mesi sulla promo sensore — penali di recesso aggressive, FoodTag,
ePackPro, Blumatica e altri minori), quadro normativo (Reg. CE 852/2004,
D.Lgs. 193/2007, Liguria D.G.R. 476/2017, ASL5 Spezzino come autorità
competente reale — non una generica Liguria, SCIA via SUAP), formazione
(attestati 5 anni, 8h/16h corso base/produzione, rinnovo 4h), sensoristica
(unico prezzo confermato: Hanna Instruments HI144, 52-80€+IVA, gli altri
solo a preventivo). Confermato che il software HACCP non è un obbligo di
legge — lo è il piano di autocontrollo — ma la prassi 2026 penalizza la
compilazione differita in ispezione. Tutto il dettaglio in
`docs/RICERCA_HACCP_MERCATO_LEGALE.md`; le 7 funzionalità individuate
(registro temperature, registro cottura/scongelo, tracciabilità lotti,
scadenze formazione, export automatico per ispezione, retention ≥3 anni,
integrazione sensori rimandata) registrate in `docs/EVOLUTIVE.md` sotto
6.1, sensoristica esplicitamente segnata come "da scegliere con ricerca
mirata quando si riprende", non ora.

Subito dopo, seconda evolutiva chiesta e sviluppata nella stessa sessione:
export PDF dal planning camere. Pulsante "Esporta" nel toolbar (prima di
"Nuova prenotazione"), due opzioni via un piccolo menu — planning mensile
e elenco prenotazioni, vedi dettaglio tecnico completo in
`docs/EVOLUTIVE.md` (voce "Planning camere — export PDF stampabile").
Punto di attenzione sollevato prima di sviluppare, poi confermato dal
titolare: l'elenco è banale da esportare (già una tabella), il planning
mensile no — 20 camere × 30-31 giorni non entra leggibile in A4 orizzontale
a font fisso. Il titolare ha scelto lui il formato esatto (tabella
riassuntiva, non screenshot della griglia; font del cognome che si riduce
finché non entra, non una griglia troncata). Nessuna dipendenza nuova
(`jspdf`, già in uso per il QR del menu), nessun endpoint backend nuovo
(riusa `/prenotazioni/griglia` e `/prenotazioni`). Verificato solo con
`tsc --noEmit` (0 errori) — **la resa reale dei due PDF non è ancora stata
vista dal titolare**, da controllare al primo giro in locale (in
particolare: leggibilità colonne giorno su un mese da 31 giorni,
comportamento su più pagine se le camere aumentano in futuro). Il
titolare ha poi confermato l'export come base valida, segnando due
possibili ottimizzazioni future (selettore mese indipendente, colonne
export elenco) in `docs/EVOLUTIVE.md`, non sviluppate ora.

**Seguito — reportistica competitor + incassi_giornalieri**. Su richiesta
del titolare, ricerca su cosa offrono i concorrenti (Mews, Cloudbeds,
RoomRaccoon, Slope, TeamSystem Hospitality — quest'ultimo il termine di
paragone più importante perché già pagato oggi) in fatto di reportistica
per il proprietario. Punto di partenza scomodo verificato nel codice, non
assunto: `dashboard.js` oggi espone solo un KPI istantaneo di oggi, zero
aggregazione storica su periodo (occupazione/ADR/RevPAR/mix canali).
Tutto il dettaglio, i 5 competitor confrontati e le 9 categorie ricorrenti
in `docs/RICERCA_REPORTISTICA_COMPETITOR.md`; le 9 categorie registrate
come evolutiva per una futura pagina `/report` dedicata (dopo un
chiarimento: il titolare aveva scritto "5 punti" riferendosi ai 5
concorrenti confrontati, non a un sottoinsieme delle 9 categorie).

Tra le 9, la n.6 (report finanziario/P&L) portava dritti a un'evolutiva
già aperta il 10/08 su `incassi_giornalieri` (manuale, scollegata dal
resto). Approfondita su richiesta esplicita del titolare ("forse è ora di
renderlo automatico e collegato"): verificato nel codice — non assunto —
che `pagamenti` (metodo+importo, alimentata dal check-out camera) È
automatizzabile, ma `comande_righe` no: nessun prezzo mai persistito
(calcolato a runtime da `menu_piatti.prezzo`) e nessun metodo di
pagamento, perché il ristorante chiude ancora sul registratore fisico
Hugin RT-K50, non integrato (lo sostituirà A-Cube, modulo 3.1). Questo ha
risolto da solo il bivio lasciato aperto il 10/08 ("sostituire" vs
"precompilare+conferma"): un calcolo automatico oggi sarebbe sempre
sbagliato per difetto (manca tutto il ristorante), quindi la scelta
obbligata è precompilare, mai sostituire.

Fatto: nuovo endpoint `GET /api/dashboard/incassi/suggerimento?data=...`
(`dashboardController.js`, stessi permessi di `registraIncasso`) somma
`pagamenti` per metodo nel giorno; `BottomSheetIncasso` (home/page.jsx) lo
interroga all'apertura e precompila contanti/POS solo se c'è un valore da
suggerire, con un avviso esplicito se ci sono pagamenti bonifico/altro non
inclusi nel suggerimento (mai omessi in silenzio). Nessuna migration,
nessuna nuova colonna. Dettaglio completo, incluso cosa resta
esplicitamente non automatizzabile (il ristorante, finché non cambia
`comande` o arriva A-Cube): `docs/EVOLUTIVE.md`, voce "incassi_giornalieri
precompilato (solo camere)". Verificato solo con `tsc --noEmit`/`node -c`
(0 errori) — **non ancora visto in UI dal titolare**, in particolare se il
suggerimento è davvero utile nell'uso reale o disturba più di quanto
aiuti.

### CRM ospiti — 7 punti competitivi, sviluppati come voce unica (14-15/08/2026)

Stessa sessione del giorno prima: fatta anche una ricerca di mercato
sull'anagrafica clienti (`docs/RICERCA_ANAGRAFICA_CLIENTI_COMPETITOR.md`,
confronto Mews/Cloudbeds/RoomRaccoon/Slope, verificata contro lo schema
`ospiti` reale via subagent — non assunta). 7 gap trovati: nessun
rilevamento duplicati, `totale speso` mai esposto da un endpoint (solo un
`reduce()` frontend), nessun tag, nessun VIP/blacklist, allergie solo
giornaliere (`ospiti_giornalieri`, azzerate ogni giorno — non collegate
all'identità cliente), nessun promemoria compleanno nonostante
`data_nascita` già raccolta, nessuna segmentazione dinamica per
Marketing▸Offerte. Il titolare ha chiesto di unificarli in un'unica voce
evolutiva e poi di svilupparli tutti insieme, non uno per uno — due
chiarimenti raccolti prima di partire: rilevamento duplicati = solo
segnalazione, mai unione automatica (rischio troppo alto, l'identità
ospite è legata a dati legali/Alloggiati Web); promemoria compleanno =
solo lista in dashboard per ora, l'automatismo email rimandato (dipende
dai testi da scrivere).

PIANO scritto e confermato dal titolare, eseguito in 6 fasi:

- **A — Backend**: migration `037_crm_ospiti.sql` (`vip`, `blacklist`,
  `blacklist_motivo`, `allergie`, `tag TEXT[]` con indice GIN,
  `duplicato_di` con indice parziale). `anagraficaOspitiController.js`:
  `lista()` riscritta con filtri `tag/vip/blacklist/consenso_marketing/
  allergia/ordina/direzione/limit` (whitelist colonne ordinamento contro
  SQL injection sugli identificatori, non parametrizzabili normalmente);
  nuovo `totale_speso` calcolato sempre lato server (subquery
  `soggiorni.tariffa_totale + addebiti_extra.importo`) — **bug reale
  corretto**: il vecchio calcolo era solo un `reduce()` frontend che
  ignorava gli addebiti extra, sottostimava la spesa reale; nuovo
  `tagSuggeriti()`, `duplicatiSospetti()` (raggruppa per nome+cognome+data
  di nascita uguali, richiede data di nascita per evitare falsi positivi
  sul solo nome) e `unisci()` (transazione completa: riassegna
  `soggiorni`, `soggiorno_ospiti` — gestendo il vincolo UNIQUE quando il
  vincitore ha già una riga per lo stesso soggiorno —, `offerte_email_
  destinatari`, `pre_checkin_ospiti.applicato_ospite_id`; marca il
  perdente con `duplicato_di`, **mai una DELETE**; audit log obbligatorio).
  Route `/tag` e `/duplicati-sospetti` dichiarate prima di `/:id` (altrimenti
  Express le confonde con un id letterale). Nuovo permesso `ospiti.unisci`
  in `shared/ruoli.js`, solo admin/titolare — più stretto della scrittura
  normale, niente receptionist: un'unione sbagliata sposta lo storico
  documenti di una persona sotto un'altra.
- **B — Frontend `/clienti`**: colonna "Spesa totale", badge VIP/blacklist
  inline, filtri tag (con datalist)/VIP/blacklist, ordinamento, banner
  duplicati sospetti (link a `/clienti/duplicati`, non blocca la pagina se
  la chiamata fallisce). `/clienti/:id`: toggle VIP/blacklist istantanei
  (stesso pattern già in uso per `consenso_marketing`, nessun "Salva"
  separato per un flag), motivo blacklist salvato al blur (non un
  flag/chip istantaneo — testo libero, evita un PATCH ad ogni tasto), tag
  con aggiungi/rimuovi e autocomplete, allergie collegate al cliente
  (campo distinto dalle note allergie giornaliere in cucina, spiegato nel
  placeholder), `totale_speso` letto direttamente dal backend invece del
  vecchio `reduce()`.
- **C — Duplicati sospetti**: nuova pagina `/clienti/duplicati` (solo
  admin/titolare). Per ogni gruppo: candidato "vincitore" suggerito di
  default (più soggiorni registrati, a parità id più basso — identità più
  consolidata), scelta libera con radio button, conferma esplicita a due
  passaggi prima di unire (mai un click solo). Gruppi con più di 2
  candidati: chiamate `unisci` in sequenza sullo stesso vincitore, non in
  parallelo (toccano le stesse righe `soggiorni`/`soggiorno_ospiti`,
  meglio non sovrapporle).
- **D — Alert compleanno**: nuovo blocco in `dashboardController.alert()`
  (stesso endpoint piatto usato da tutti i ruoli, non nel più recente
  `gruppiWidget()` solo admin/titolare — coerente con com'è mostrato oggi
  agli altri alert tipo scadenze/ZTL). Attraversamento capodanno
  (dicembre→gennaio) calcolato **interamente in SQL** con
  `generate_series(CURRENT_DATE, CURRENT_DATE + 7 days)` confrontato per
  mese/giorno estratti da `data_nascita` — deliberatamente non un calcolo
  JS con `toISOString()`, l'insidia UTC/fuso già trovata più volte altrove
  nel progetto (vedi CLAUDE.md, convenzione date). Esclude
  `duplicato_di IS NOT NULL`, stesso filtro di default di `lista()`.
- **E — Segmentazione in Offerte**: `/marketing/offerte` passa da un
  toggle binario "specifici/tutti" a tre modalità aggiungendo "Segmento"
  (filtro tag + VIP, riusa lo stesso `GET /ospiti` esteso del punto A).
  Nessuna modifica al backend delle offerte: il segmento popola la stessa
  lista `selezionati` già usata dalla ricerca manuale, `invia()` continua
  a mandare un array di id — solo chi ha consenso marketing **ed** email
  valida viene aggiunto (chi ha consenso ma non ha email non riceverebbe
  comunque nulla, meglio escluderlo già in fase di ricerca che scoprirlo
  dopo l'invio).

Verificato con `tsc --noEmit` (frontend, pulito dopo ogni fase) e
`node -c` (backend, tutti i file toccati) — 0 errori in entrambi. **Nessuna
batteria di test automatici scritta per questo modulo in questa sessione**
(a differenza di altri moduli recenti con un `tests/api/*.test.js`
dedicato) **e non ancora verificato end-to-end dal titolare in locale**:
prossimo passo prima di considerare il modulo definitivamente chiuso.
Dettaglio completo, incluso il testo originale dei 7 punti: `docs/EVOLUTIVE.md`,
voce "CRM ospiti con preferenze/tag".

**Verifica in locale, stesso giorno (15/08/2026)**: dopo aver applicato la
migration 037 (dimenticata a fine sessione precedente — segnalata dal
titolare come "errore interno" su Clienti e lista Dashboard alert svuotata,
quest'ultima perché `dashboardController.alert()` raccoglie tutti gli
alert in un unico try/catch e la query compleanni falliva su
`o.duplicato_di` mancante, portando giù anche gli alert Alloggiati Web che
non c'entravano nulla) e un riavvio del dev server (routing Next.js non
aggiornato per la cartella nuova `/clienti/duplicati` con server già
acceso), creato `backend/scripts/creaDuplicatiTest.js` (due schede
cliente fittizie stesso nome/cognome/data di nascita, contatti diversi,
idempotente con `--elimina`) per testare l'unione senza aspettare un
duplicato vero — confermato funzionante dal titolare.

Segnalato poi un secondo bug reale: la ricerca in `/clienti` (e ovunque
`GET /ospiti?search=` sia riusato — autocomplete "Nuova prenotazione",
selezione manuale in Offerte) trovava nome o cognome separatamente ma non
"Mario Rossi" insieme, perché il filtro era un solo `ILIKE` sull'intera
stringa digitata contro nome e contro cognome, e nessuna delle due colonne
contiene entrambe le parole. Corretto in `anagraficaOspitiController.lista()`
splittando la ricerca in parole: ogni parola deve comparire in nome O
cognome (AND tra le parole, OR tra le due colonne per ciascuna) — un solo
punto di modifica, beneficia automaticamente tutti i chiamanti di quella
funzione. Verificato con `node -c`, non ancora riverificato in UI dal
titolare dopo il fix.

**Batteria di test + chiusura modulo, stesso giorno**: estesa
`tests/api/anagrafica-ospiti.test.js` con la copertura mancante (ricerca
per parole, filtri tag/vip, `totale_speso`, `/ospiti/tag`,
`/ospiti/duplicati-sospetti`, `unisci` incluso il caso a 3 candidati nello
stesso gruppo, permessi per ruolo, casi limite booleano/array). Non
eseguibile dal sandbox (nessuna rotta verso il Postgres del titolare) —
lanciata dal titolare/tab Code: primo giro 53/54, un fallimento reale ma
non di regressione, diagnosticato con precisione dal titolare/tab Code: il
test preesistente "portiere_notte → 200" cercava per solo cognome e si
aspettava esattamente 1 risultato, ma le nuove fixture CRM aggiunte nel
`beforeAll` (`${COGNOME_TEST}_Crm`, tre `${COGNOME_TEST}_Dup`) condividono
quel prefisso di cognome, portando il conteggio a 5 — bug del test, non
del codice. Corretto stringendo il termine di ricerca a "Mario
${COGNOME_TEST}" (nome+cognome insieme, sfrutta la ricerca per parole
appena aggiunta: solo l'ospite originale ha nome "Mario") invece di
allentare l'asserzione a `find()`, per non perdere il senso del test
("trova esattamente uno", non solo "lo trova"). **Confermato dal
titolare: 54/54 verdi.** Modulo CRM ospiti chiuso: costruito, verificato
manualmente in locale, coperto da test automatici verdi. Dettaglio
tecnico completo: `docs/EVOLUTIVE.md`, voce "CRM ospiti con
preferenze/tag".

### ZTL — switch temporaneo Import TS / Planning interno (15/08/2026)

Segnalazione del titolare durante la stessa sessione: il testo fisso
"Importa il planning da TeamSystem con il pulsante Import TS" nello stato
vuoto di `/ztl` sembrava non aggiornato. Verificato nel codice, non
assunto: `ztlController.js` non ha mai un riferimento a `soggiorni` — ZTL
dipende ancora al 100% dall'Excel di TeamSystem, anche se nel frattempo il
gestionale ha un proprio modulo Prenotazioni funzionante e in uso.
Chiarito col titolare prima di proporre un fix: oggi le prenotazioni reali
restano su TS (la migrazione, modulo 2.3, non è ancora fatta), quindi il
testo è corretto così com'è per ora — ma il titolare ha chiesto di
preparare comunque ZTL al giorno della migrazione, con uno switch
temporaneo tra le due modalità, da rimuovere insieme all'import TS quando
non servirà più. PIANO scritto e confermato prima di toccare codice
(CLAUDE.md Sezione 10).

Fatto: migration `038_ztl_configurazione.sql` (tabella a riga singola,
deliberatamente non storicizzata — è un interruttore operativo, non un
dato fiscale). In `ztlController.js` estratta `upsertPrenotazioneZtl()`
dalla logica già scritta per `importExcel` (upsert per camera_numero+
data_arrivo, mai sovrascrive una riga già 'inviata'/'conclusa' — solo
segnala un conflitto) e riusata anche dalla nuova `sincronizzaDaPlanning()`
(legge `soggiorni` con arrivo nei prossimi 30 giorni). Nota tecnica: il
refactor ha corretto un'imprecisione cosmetica preesistente in
`importExcel` — quando una riga era in conflitto (targa già inviata + date
cambiate), il codice originale contava la riga sia come "conflitto" sia
come "aggiornata" anche se l'UPDATE non toccava nulla per via del filtro
`stato NOT IN ('inviata','conclusa')` nella WHERE; ora viene contata solo
come conflitto — nessun cambiamento nei dati scritti, solo nel conteggio
riportato. Nuove rotte `GET/PATCH /api/ztl/configurazione` e
`POST /api/ztl/sincronizza-planning` (scrittura solo titolare/admin,
stessa soglia di Import TS/Export VigiPass). Frontend: bottone dinamico
(Import TS oppure Sincronizza da Planning a seconda della modalità),
stesso modale di riepilogo risultati per entrambi i percorsi, switch con
conferma esplicita ed etichetta "temporaneo" in coda alle azioni titolare.
Verificato con `node -c`/`tsc --noEmit` — non ancora verificato in UI dal
titolare. Piano di rimozione futura (bottone, switch, import Excel,
tabella configurazione_ztl) già annotato in `docs/EVOLUTIVE.md` per non
doverlo ricostruire da zero il giorno della migrazione.

### Menu — eliminato gruppo PRINCIPALE, HACCP in ADEMPIMENTI (15/08/2026)

Richiesta esplicita del titolare, stessa sessione: gruppo PRINCIPALE
(Dashboard/Timbratura/Personale) eliminato da `Sidebar.tsx` — Timbratura e
Personale spostate in STRUTTURA, HACCP spostata da STRUTTURA ad
ADEMPIMENTI (stesso tema "scadenze/controlli obbligatori" delle altre voci
del gruppo; quando il modulo HACCP avrà un vero widget di controlli, per
ora solo ricerca fatta — `docs/RICERCA_HACCP_MERCATO_LEGALE.md` — caricherà
lì). Verificato prima di eliminare che "PRINCIPALE" non fosse referenziato
altrove nel frontend (solo in `Sidebar.tsx`).

Trovato un gap non esplicitamente richiesto ma necessario per non creare
una regressione silenziosa: la Dashboard non è più dentro nessun gruppo di
`SEZIONI_MENU`, e sulla rail desktop questo va bene — esiste già dal 14/08
un'icona Home dedicata indipendente dai gruppi — ma sulla bottom nav
mobile NON esisteva un equivalente. Le 4 icone rapide per ruolo
(`VOCI_MOBILE`, provvisorie, invariate) includono `/home` solo per
admin/titolare/dipendente: receptionist, cameriere, cuoco e portiere_notte
sarebbero rimasti senza alcun modo di tornare in Dashboard da telefono,
perché il pannello "Menu" mobile elenca solo i gruppi di `SEZIONI_MENU` e
Dashboard non ne fa più parte. Aggiunta un'icona Home persistente in testa
alla bottom nav mobile, stessa logica di quella desktop — non tocca
`VOCI_MOBILE` (la revisione di quelle resta un punto a parte, già in
sospeso). Verificato con `tsc --noEmit`, non ancora visto in UI dal
titolare, in particolare su mobile.

### Due fix minori richiesti dal titolare (15/08/2026)

**Fix 1 — blocco eliminazione configurazione sala con tavoli associati:
nessun codice scritto, voce EVOLUTIVE.md corretta.** Il titolare ha scelto
questo fix da un elenco di evolutive aperte che gli avevo appena ripetuto;
prima di toccare codice ho riletto `salaController.eliminaConfig` per
capire da dove partire e ho trovato il guard già completo dalla sessione
del 06/08/2026 (blocca su configurazione Standard/`is_default`, su
configurazione attiva, e su tavoli ancora associati, con messaggio
specifico per ciascun caso). La voce in `docs/EVOLUTIVE.md` non era mai
stata aggiornata dopo quel fix — corretta oggi per non ripresentarla una
terza volta. Nessuna regressione: il codice era già corretto, solo la
documentazione era ferma a prima del 06/08.

**Fix 3 — icona gruppo sulla barra prenotazione in planning-camere: ✅
Fatto.** `p.gruppo_id` aggiunto al SELECT di `GET /api/prenotazioni/griglia`
(`prenotazioniController.js`, nessuna query né endpoint nuovo). Nel
frontend, componente `Barra` di `planning-camere/page.jsx`: icona `Users`
(lucide, 10px) prima del cognome quando `soggiorno.gruppo_id` è
valorizzato, riga aggiuntiva nel tooltip ("Fa parte di un gruppo").
Necessario un piccolo aggiustamento CSS collaterale: il `truncate` sul
contenitore flex della barra non tronca più correttamente il testo con due
figli (icona + testo) — spostato su uno `<span>` dedicato al cognome con
`min-w-0` (un figlio flex non si restringe sotto la sua larghezza di
contenuto senza `min-width:0` esplicito, altrimenti la barra si sarebbe
allargata oltre la cella o il testo sarebbe traboccato). Verificato con
`tsc --noEmit`, non ancora visto in UI dal titolare su una prenotazione di
gruppo reale. Dettaglio tecnico completo in `docs/EVOLUTIVE.md`.

### Prenotazioni di gruppo complete (15/08/2026, stessa sessione, seguito)

Il titolare, guardando l'icona gruppo appena fatta, ha chiesto: "non c'è
modo di creare una prenotazione di gruppo" — verificato che fosse vero
(nessuna UI da nessuna parte, il backend base c'era già dal modulo
Prenotazioni Fase 2A ma mai collegato). Discussione via mockup (SVG) prima
di scrivere codice, per allineare il modello mentale del titolare con
quello del DB: **famiglia su più camere** (stessa prenotazione, stesso
intestatario) è concettualmente diversa da **comitiva** (prenotazioni
separate collegate da `gruppo_id`, ospiti diversi per camera) — il
titolare ha chiesto entrambe.

**Verifiche prima di scrivere codice (hanno cambiato lo scope)**:
- `aggiungiSoggiorno` (`POST /api/prenotazioni/:id/soggiorni`) esisteva già
  ma non era mai chiamato da nessun punto del frontend — zero risultati
  cercandolo in tutta la cartella `frontend`. Correzione di un errore mio:
  avevo detto al titolare che era "già funzionante", falso.
- `conto()` e `pagamenti` erano già aggregati per `prenotazione_id` (tutti
  i soggiorni non cancellati), non per singolo soggiorno — quindi il
  "conto unico, pagamento unico per famiglia su più camere" chiesto dal
  titolare **funzionava già**, zero righe scritte per quello.
- `POST /api/gruppi/:id/pagamenti` e `POST /api/prenotazioni/:id/pagamenti`
  esistevano già entrambi, indipendenti — la richiesta del titolare di
  poter scegliere "tutto il gruppo o solo questa camera" in fase di
  pagamento è risultata un semplice selettore UI, nessuna nuova regola
  lato server.
- Nessun modo di annullare una singola camera di una prenotazione famiglia
  multi-camera senza annullare l'intera prenotazione (`PATCH
  /api/soggiorni/:id` non tocca mai `cancellato`) — gap reale scoperto
  disegnando il mockup con il pulsante "rimuovi camera prima di salvare",
  colmato con un endpoint nuovo.

**Backend**:
- `prenotazioniController.aggiorna()` esteso con `gruppo_id` — pattern
  undefined-safe (`CASE WHEN $3 THEN $4 ELSE gruppo_id END`, non
  `COALESCE`): deve poter essere impostato esplicitamente a `null` per
  sganciare una prenotazione da un gruppo, non solo valorizzato.
- `prenotazioniController.dettaglio()`: aggiunto `LEFT JOIN
  gruppi_prenotazione` per `gruppo_nome` — `gruppo_id` da solo non basta
  al pannello per mostrare qualcosa di leggibile.
- Nuovo `soggiorniController.annulla()` — `PATCH /api/soggiorni/:id/annulla`:
  annulla un solo soggiorno (`cancellato = true`), bloccato con `400` se è
  l'ultimo soggiorno attivo della prenotazione (in quel caso va annullata
  l'intera prenotazione, altrimenti resterebbe una prenotazione "fantasma"
  senza camere). Verifica con `FOR UPDATE` in transazione contro la race di
  due annullamenti concorrenti sulle ultime due camere.
- Nuovo `gruppiController.lista()` — `GET /api/gruppi?search=` (nome o
  referente, `ILIKE`, `LIMIT 30`): mancava del tutto, senza non si può mai
  agganciare una prenotazione a un gruppo aperto in una chiamata precedente
  (solo cercarlo per id a memoria, non realistico).
- Route nuove: `routes/soggiorni.js` (`PATCH /:id/annulla`),
  `routes/gruppi.js` (`GET /` prima di `GET /:id`). Permessi invariati
  (sezioni `soggiorni`/`gruppi` di `shared/ruoli.js`, già corrette).

**Frontend** (`planning-camere/page.jsx`, tutto in un unico file per
coerenza con `PannelloCheckOut`/`VistaElenco` già lì):
- `FormNuovaPrenotazione`: dopo il primo salvataggio resta aperto in
  modalità "famiglia su più camere" invece di chiudersi — ospite bloccato
  sull'intestatario (niente autocomplete), mini-lista camere con `x` che
  chiama la nuova `annulla` soggiorno (mai sulla prima camera: annullarla
  vorrebbe dire annullare l'intera prenotazione).
- Nuovo `WizardGruppo`: step dati gruppo (`POST /api/gruppi`) → loop
  "aggiungi camera" (ogni camera è una `POST /api/prenotazioni` separata
  con `gruppo_id` e ospite proprio, autocomplete identico a
  `FormNuovaPrenotazione`); `x` su una camera annulla quella prenotazione
  (`PATCH stato → interrotta`, endpoint già esistente).
- `PannelloDettaglio`: nuova sezione "Gruppo" — badge + "Vedi gruppo" se
  assegnata, altrimenti bottone "Assegna a un gruppo" (solo per chi può
  scrivere).
- Nuovo `ModalAssegnaGruppo`: ricerca gruppi esistenti (debounce su
  `GET /api/gruppi?search=`) + mini "+ nuovo gruppo" (solo nome) per non
  dover riaprire il wizard completo solo per agganciare una camera in un
  secondo momento.
- Nuovo `ModalDettaglioGruppo`: elenco camere del gruppo con stato
  (`STATI_COLORI`, stesso badge del pannello singolo) e link "Sgancia"
  (`PATCH gruppo_id: null`); due totali separati (addebiti/pagato, mai un
  saldo netto precalcolato, stessa scelta di `RiepilogoEconomico`); nota
  esplicita che gli extra bar/ristorante restano per-camera; form
  pagamento con selettore "Applica a: tutto il gruppo / solo camera X" che
  instrada verso l'uno o l'altro endpoint pagamenti già esistente.
- Pulsante "Nuovo gruppo" in toolbar accanto a "Nuova prenotazione".

**Test**: estesi `tests/api/prenotazioni.test.js` (`gruppo_id`
undefined-safe: assegnazione, invarianza su PATCH successivo che non lo
menziona, sgancio con `null` esplicito), `tests/api/soggiorni.test.js`
(nuovo describe `PATCH /:id/annulla`: 401/403/404, blocco su unica camera
attiva, annullo della seconda camera di una famiglia con la prima che
resta attiva, doppio annullo → 400), `tests/api/gruppi.test.js` (nuovo
describe `GET /api/gruppi — ricerca`: permessi, match per nome, match per
referente, nessun match su stringa a caso).

Verificato con `tsc --noEmit` sull'intero frontend (zero errori, non solo
sul file toccato) e `node -c` su tutti i file backend modificati. **Non
verificato**: esecuzione reale della suite Jest (il sandbox non raggiunge
il Postgres del titolare, stesso limite di sempre) e verifica in UI del
flusso end-to-end (wizard gruppo, assegnazione, pagamento gruppo/camera) —
da fare dal titolare/tab Code prima di considerare il modulo chiuso.

### Seguito: 88/88 test verdi, poi due bug reali dalla verifica visiva (15/08/2026)

Titolare conferma 88/88 verdi su `prenotazioni`/`soggiorni`/`gruppi.test.js`,
poi durante la verifica visiva:

**Bug 1 — `risposta is not defined` su "Nuova prenotazione" da cella
libera, 500/crash silenzioso**. Causa: `invia()` in `FormNuovaPrenotazione`
chiamava `await api.post('/prenotazioni', {...})` **senza catturare il
risultato**, ma il codice scritto subito dopo (per la nuova modalità
"famiglia su più camere") referenziava `risposta.data` — variabile mai
dichiarata. La POST arrivava comunque a buon fine lato server (la
prenotazione viene creata PRIMA dell'errore JS), quindi al primo tentativo
il DB si sporca silenziosamente con una prenotazione reale mai mostrata
all'utente; al secondo tentativo sulla stessa camera/date, giustamente
`409 camera occupata` — non un bug separato, conseguenza diretta del primo.
Corretto aggiungendo `const risposta =` alla riga 1692. **Non serve alcuna
pulizia manuale del DB**: la prenotazione creata dal primo tentativo è
valida ed esiste già in stato `opzione` — dopo il fix comparirà come barra
normale sulla griglia (basta un refresh), annullabile con il pulsante
"Annulla prenotazione" già esistente se non serve.

**Perché `tsc --noEmit` non l'aveva preso**: verificato `tsconfig.json`
— `include` lista solo `**/*.ts`/`**/*.tsx`, `.jsx` non ne fa parte
nonostante `allowJs: true` (quel flag serve solo a permettere che file TS
importino JS, non estende il type-checking ai `.jsx`). Tutte le sessioni
precedenti che hanno scritto "verificato con `tsc --noEmit`" su file
`.jsx` di questo repo (la maggioranza del frontend, incluso tutto
`planning-camere/page.jsx`) erano quindi una verifica di sintassi/JSX,
**non un controllo reale delle variabili referenziate** — `no-undef` è
tipicamente una regola ESLint, e questo progetto non ha ESLint
configurato (nessuno script `lint`, nessun file di configurazione). Non
c'è oggi nel sandbox un modo statico affidabile di catturare questa
classe di bug sui file `.jsx` — resta la verifica visiva/manuale
l'unico controllo reale finché non si aggiunge ESLint (non fatto qui,
richiederebbe una nuova dipendenza da discutere prima).

**Bug/evolutiva 2 — ospite obbligatorio per ogni camera nel wizard
gruppo, senza prevalorizzazione**. Segnalato dal titolare come "non ha
senso": il form "aggiungi camera" del `WizardGruppo` obbligava a cercare o
creare un ospite da zero per ogni singola camera, anche quando è quasi
sempre lo stesso referente o la persona appena inserita per la camera
precedente. Corretto con `ultimoOspiteUsato` (nuovo state): la prima
camera precompila il campo di ricerca con il nome del referente (non
seleziona in automatico — nomi simili sono ambigui, la scelta resta alla
reception); dalla seconda camera in poi il campo ospite riparte già
selezionato con l'ultimo usato, con "Cambia" sempre disponibile per una
persona diversa. Anche il mini-form "+ Nuovo ospite" ora precompila
nome/cognome spezzando il nome del referente sull'ultima parola
(suggerimento modificabile, non salvato finché non si conferma).
`resetFormCamera()` non azzera più ospite/ricerca dopo ogni aggiunta
riuscita (prima lo faceva, era la causa della frizione lamentata).

Verificato con `tsc --noEmit` (zero errori, stesso limite di verifica
descritto sopra) e un audit manuale mirato: grep di tutte le chiamate
`await api.*` senza cattura del risultato in tutto il file, verificando a
mano che nessuna delle altre fosse seguita da un riferimento a una
variabile non dichiarata (solo quella di `invia()` lo era). Non ancora
riprovato in UI dal titolare dopo questi due fix.

### Seguito: "aggiungi camera" su prenotazione esistente + disponibilità camere (15/08/2026)

Terzo giro nella stessa sessione, su due richieste esplicite del titolare
lasciate aperte dai due fix precedenti.

**Gap reale segnalato: "come faccio ad aggiungere a una prenotazione
un'altra camera? nessuna sezione me lo permette".** Vero — l'aggiunta di
una camera alla stessa famiglia esisteva SOLO nella vista immediatamente
dopo aver creato una nuova prenotazione (`FormNuovaPrenotazione`), mai per
una prenotazione già esistente aperta da `PannelloDettaglio`. Gap mio, non
del titolare: costruendo la Fase B (comitive/famiglie) avevo coperto solo
il momento della creazione. Aggiunta una sezione "+ Aggiungi un'altra
camera" in `PannelloDettaglio` (visibile solo se `puoScrivere` e la
prenotazione NON fa parte di un gruppo — per un gruppo la camera in più è
una prenotazione separata, vedi evolutiva aperta in `EVOLUTIVE.md`), che
riusa `POST /prenotazioni/:id/soggiorni` con l'`ospite_id` dell'intestatario
già esistente (ricavato dal primo soggiorno attivo, stesso criterio già
usato per la card) — nessuna richiesta di reinserire l'ospite. Date
prevalorizzate sull'ultimo soggiorno attivo, come richiesto esplicitamente
dal titolare ("questo delle date vale anche per... modifica delle
famiglie"). Aggiunto anche un pulsante "Annulla questa camera" per
soggiorno (via `PATCH /soggiorni/:id/annulla`, già esistente), visibile
solo quando ce n'è più di una attiva — il backend blocca comunque
l'annullo dell'ultimo soggiorno rimasto. **Bug collaterale trovato e
corretto nello stesso punto**: il render delle card soggiorno non filtrava
`cancellato = true` — da quando esiste l'annullo di un singolo soggiorno,
una camera annullata sarebbe rimasta visibile come scheda fantasma
permanente; ora `dati.soggiorni?.filter(s => !s.cancellato)`, stesso
criterio già in uso in `griglia()`/`conto()` lato backend.

**Richiesta: colorare le camere libere/occupate in fase di scelta data.**
Nuovo endpoint `GET /api/prenotazioni/disponibilita?data_arrivo=&data_
partenza=&escludi_soggiorno_id=` — un booleano `occupata` per camera,
stessa logica di overlap già usata da `griglia()` ma collassata a un
valore invece che per-giorno. Nuovo componente `SelettoreCameraDisponibile`
(chip colorate verde/rosso invece di un `<select>` con `<option>` colorate
— scelta deliberata: lo styling del colore di sfondo sulle `<option>` è
inaffidabile tra browser, in particolare Safari iOS/Android, rilevante
perché il gestionale gira parecchio su tablet). **Collegato solo al
`WizardGruppo`** (creazione comitiva), su indicazione esplicita del
titolare ("mettilo solo in un punto per vedere e poi lo estendiamo") — non
ancora in `FormNuovaPrenotazione`, `PannelloDettaglio` o
`ModalDettaglioGruppo`, tutti e tre ancora con un `<select>` semplice.

**Richiesta: referente del gruppo collegato automaticamente alla
creazione dell'ospite.** Prima, creando un gruppo, alla prima camera si
richiedeva di nuovo lo stesso nome già dato come referente. Ora
`creaGruppo()` cerca un ospite esistente con nome+cognome combacianti
(match esatto case-insensitive); se trovato lo riusa, altrimenti lo crea
splittando il nome sull'ultima parola come cognome. **Attenzione dichiarata
al titolare**: questo split è impreciso per nomi con più parole o ragioni
sociali (es. "Maria De Santis" → cognome "Santis" sbagliato) — non
bloccante, il campo resta sempre modificabile, ma annotato in
`EVOLUTIVE.md`.

Verificato con `npx esbuild --jsx=automatic` (parsing/JSX validi — non un
sostituto di ESLint/no-undef, vedi evolutiva "Tooling" sopra) e `node -c`
su tutti i controller/route backend toccati (`prenotazioniController.js`,
`soggiorniController.js`, `gruppiController.js` e relative route). Audit
manuale mirato sul corpo di `POST /prenotazioni/:id/soggiorni`: il
controller richiede `soggiorno.ospite_id` esplicito (nessuna inferenza
server-side) — verificato che `aggiungiCameraEsistente()` lo passi sempre,
derivandolo dall'intestatario esistente. **Nessuna di queste modifiche è
stata ancora vista in UI dal titolare** — resta da fare, in particolare il
flusso "aggiungi camera" su una prenotazione reale e l'annullo di un
singolo soggiorno. Gap rimasto deliberatamente aperto: `ModalDettaglioGruppo`
non ha un equivalente "aggiungi camera" per un gruppo già esistente
(dettaglio in `EVOLUTIVE.md`).

### Seguito: chiuso il gap ModalDettaglioGruppo, bug reale sui pagamenti di gruppo, pagina /gruppi (15/08/2026)

Quarto giro nella stessa sessione. Titolare conferma: nessun errore
aggiungendo più camere a un gruppo, tutto testato fin qui funziona. Prima
di proseguire chiede di ricordargli di verificare due punti — su entrambi
ho potuto rispondere subito leggendo il codice, senza aspettare un test
live.

**Bug reale confermato e corretto: `totale_pagamenti` del gruppo non
contava i pagamenti "solo questa camera".** `gruppiController.dettaglio()`
sommava `SUM(importo) FROM pagamenti WHERE gruppo_id = $1` — ma un
pagamento registrato scegliendo "solo questa camera" nel selettore di
`ModalDettaglioGruppo` viene salvato con `prenotazione_id` valorizzato e
`gruppo_id` NULL (vincolo XOR della tabella, migration 017). Risultato:
pagare una singola camera di un gruppo non faceva muovere la card "Pagato
dal gruppo", pur essendo un pagamento valido e registrato — esattamente il
tipo di bug di aggregazione che il titolare temeva "più facile da non
notare a occhio". Corretto sommando anche
`prenotazione_id IN (SELECT id FROM prenotazioni WHERE gruppo_id = $1)`.
Stesso gap presente (ma non corretto, perché non usata da nessuna UI oggi)
in `pagamentiController.listaPerGruppo` — lasciata così di proposito, il
suo commento chiarisce che è "solo i pagamenti sul gruppo, non spezzati
sulle prenotazioni", una vista diversa e intenzionale.

**Verifica X rimozione camera: bug reale trovato, non nella parte
verificata prima.** Prima analisi guardava solo `FormNuovaPrenotazione`
(la sessione ephemeral subito dopo aver creato una prenotazione) — corretta
lì (`!c.primo`). Ma il titolare l'ha testato riaprendo una prenotazione
GIÀ SALVATA con due camere (es. Francesco Bianchi, camera 1 e 2, 25-26
agosto) tramite `PannelloDettaglio` — quella è la sezione costruita nel
round precedente (task "Aggiungi un'altra camera"), mai passata dalla
stessa guardia: mostrava la X su entrambe le camere, nessuna protetta.
Corretto: `primoSoggiornoId` = id più basso tra i soggiorni attivi (non
l'ordine restituito dalla query, che è per `data_arrivo` — due camere con
le stesse date sarebbero indistinguibili), X nascosta su quella riga, non
sulle altre. In `WizardGruppo` `rimuoviCameraGruppo` resta corretto senza
alcuna guardia `primo` — lì ogni camera è una prenotazione a sé, annullabile
singolarmente sempre, prima compresa.

**Estensioni richieste dal titolare, tutte fatte:**
1. Disponibilità colorata (`SelettoreCameraDisponibile`) estesa ai due
   punti "aggiungi camera famiglia" rimasti con un `<select>` semplice:
   subform di `FormNuovaPrenotazione` e la nuova sezione di
   `PannelloDettaglio` (round precedente). Riordinate le date prima della
   camera in entrambi, stesso motivo già documentato per `WizardGruppo`.
2. `ModalDettaglioGruppo` — nuova sezione "+ Aggiungi camera" per un
   gruppo già esistente: stesso pattern di `WizardGruppo.aggiungiCameraGruppo`
   (ogni camera è `POST /prenotazioni` con `gruppo_id` già valorizzato, MAI
   `/prenotazioni/:id/soggiorni` — quello resta solo per la famiglia),
   senza il passaggio "crea gruppo" perché esiste già. Ospite prevalorizzato
   sul referente del gruppo la prima volta, poi sull'ultimo usato (stesso
   principio già in `WizardGruppo`). `elencoCamere` ora passato come nuova
   prop a `ModalDettaglioGruppo` (prima non gli serviva).
3. Nuova pagina `/gruppi` (voce sidebar sotto CLIENTI E PRENOTAZIONI,
   permessi da `shared/ruoli.js` sezione `gruppi` già esistente, nessuna
   migration): tabella con ricerca, colonne nome/referente/camere occupate
   ora/storico soggiorni/storico ospiti/pagato/data creazione. Click riga
   naviga a `/planning-camere?gruppo=<id>`, nuovo `useSearchParams` in
   quella pagina che apre `ModalDettaglioGruppo` direttamente (nessuna
   prenotazione "corrente" da cui partire in questo caso) — stesso pattern
   già in uso in `addebiti-extra/page.jsx`. Dato reale, non ipotesi
   dichiarata al titolare: la tabella nasce vuota, oggi non esistono ancora
   gruppi reali nel database — è infrastruttura per quando le comitive
   inizieranno ad accumularsi, non qualcosa che dà valore da subito.
   Backend: `gruppiController.lista()` esteso con colonne aggregate via
   subquery (storico soggiorni/ospiti non cancellati, camere con oggi
   dentro il range di soggiorno per "occupate ora", pagamenti con la stessa
   correzione del bug sopra) — stessa funzione già usata dall'autocomplete
   di `ModalAssegnaGruppo`, colonne aggiuntive non lo rompono. `LIMIT 30`
   invariato, nessuna paginazione: sufficiente per il volume atteso, da
   rivedere se un giorno non lo fosse più.

Verificato con `tsc --noEmit` (stavolta un controllo vero: `Sidebar.tsx` è
un `.tsx` reale, non un `.jsx` come `planning-camere` — 0 errori),
`npx esbuild` su `planning-camere/page.jsx` e sulla nuova `gruppi/page.jsx`
(sintassi/JSX validi) e `node -c` su tutti i controller/route backend
toccati. **Aggiornamento stesso giorno — confermato dal titolare in locale: tutto
torna.** Include il fix della X (vedi voce successiva) verificato riaprendo
Francesco Bianchi (camera 1 e 2, 25-26 agosto): X sparita solo sulla
camera "primo". Confermato anche il caso a 3 camere attive (`Math.min` sugli id regge).
Non testato esplicitamente lo svuotamento fino all'ultima camera rimasta
(quello lo blocca comunque il backend con 400, indipendentemente da quale
sia "primo" — vedi `soggiornoController.annulla`), da tenere presente come
prossimo scenario se emergesse un dubbio.

## 19/08/2026 — Booking Engine Diretto v2: composizione ospiti, contenuti Sanity, tipologie camera reali, shared inventory

Sessione lunga, in continuità diretta con il modulo Booking Engine Diretto
(caparra 30% via Stripe, saldo in hotel) implementato in una sessione
precedente. Tre fasi concordate all'inizio (A/B/C), poi un lavoro molto più
grande emerso durante la Fase B mentre si preparavano i contenuti delle
camere per Sanity: le tipologie camera nel gestionale non riflettevano la
realtà fisica dell'hotel, e sistemarlo ha richiesto due migration
strutturali in più.

**Fase A — Composizione ospiti** (adulti + età di ogni bambino, non più un
singolo numero `ospiti`): migration `046_composizione_ospiti_booking_engine.sql`
(`soggiorni.composizione_ospiti JSONB`), `bookingPubblicoController.js`
(`normalizzaComposizioneOspiti`, validazione capienza server-side),
`BookingWidget.tsx` (selettore età per bambino). Riusata subito da
`calcolaTassaSoggiorno` in `emailPrenotazioni.js` per un calcolo ESATTO
della tassa di soggiorno (esenzione età) quando disponibile, con fallback
onesto a "indicativo" quando non lo è. Bug reale trovato e corretto nello
stesso giro: il ramo "ospite già esistente" di `prenota()` aggiornava solo
il telefono, mai nome/cognome — chi prenotava di nuovo con la stessa email
restava con il nome della prima prenotazione mai fatta.

**Fase B — Contenuti camere (Sanity ↔ gestionale)**: nuovo campo
`tipoCameraId` su `sanity/schemaTypes/documents/camera.ts`, script
`backend/scripts/collegaSanityTipiCamera.js` (dry-run/`--applica`,
abbinamento per nome normalizzato, mai un abbinamento indovinato — i casi
senza corrispondenza restano da collegare a mano in Studio).
`BookingWidget.tsx` arricchito con foto/descrizione/mq/servizi da Sanity
via `tipoCameraId`, fallback alla card semplice se non collegato.

**Fase C — Termini di cancellazione**: migration `047_termini_cancellazione.sql`
(`impostazioni_email.termini_cancellazione`, stessa riga singleton del
footer email), nuovo endpoint pubblico
`GET /api/booking-pubblico/termini-cancellazione`, editor in
Impostazioni ▸ Testi email, mostrati sia nella mail di conferma sia su
`/prenota` prima del pagamento. Default = segnaposto esplicito
`[DA COMPLETARE]`, mai un testo legale inventato.

**Il vero lavoro della sessione — tipologie camera non allineate alla
realtà.** Preparando i contenuti Fase B è emerso che il gestionale aveva 5
tipi camera (Singola, Doppia uso singola, Matrimoniale, Tripla, Quadrupla)
che non corrispondevano a come l'hotel vende davvero le stanze. Ricostruito
con il titolare, con più correzioni in corsa (dettaglio completo nella
conversazione, qui solo l'esito):

- Camere 2, 7, 12, 21 (10mq, letto matrimoniale alla francese): vendibili
  sia come Singola (1 persona) sia come Matrimoniale Piccola (2 persone) —
  stessa stanza fisica, due prezzi diversi.
- Tutte le altre camere "pure" (14mq): vendibili sia come Doppia uso
  singola (1 persona) sia come Matrimoniale (2 persone) — stesso principio.
- Camere 15, 16, 19, 20 (matrimoniale + letti a castello): vendibili come
  Matrimoniale, Tripla (+30% sul prezzo Matrimoniale) o Quadrupla (+20%) —
  ma SOLO Tripla/Quadrupla sul booking engine online, mai Matrimoniale:
  decisione esplicita del titolare per non rischiare che una prenotazione
  online economica "rubi" una stanza che valeva di più a una famiglia
  (cannibalizzazione — vendibili come Matrimoniale solo da reception/
  telefono, dove c'è un giudizio umano). Verificato sui competitor (Cloudbeds
  Split Inventory, RoomBoss Alternative Configuration, Oracle OPERA
  Component Rooms) che questo pattern — più tipi virtuali sulla stessa
  camera fisica — è lo standard di settore per questo esatto problema.
- L'appartamento (casa in affitto, fino a 5 persone) era erroneamente
  l'unica stanza assegnata al tipo "Quadrupla" — se si fosse aggiunta una
  tariffa senza accorgersene, sarebbe diventato prenotabile online come una
  normale camera hotel. Sganciato per primo, prima di qualunque altra cosa.

**Migration `048_consolida_matrimoniale_piccola.sql`**: primo tentativo,
poi in parte superato dalla 050 (Doppia uso singola non era la stessa cosa
di Matrimoniale Piccola, riconosciuto e corretto in corsa). Verifica
automatica integrata (conta tariffe esistenti per decidere quale id tenere,
si ferma con eccezione se il segnale è ambiguo) — bug trovato dal titolare:
`GET DIAGNOSTICS` dentro un blocco `DO` legge il conteggio dell'ultima
istruzione DENTRO quel blocco, non di uno statement esterno precedente. In
048 l'`UPDATE` e il `GET DIAGNOSTICS` erano nello stesso blocco (corretto).
In **`049_sgancia_appartamento_da_quadrupla.sql`** no — l'`UPDATE` era fuori
dal blocco `DO`, quindi la verifica leggeva sempre 0 righe, l'eccezione
scattava sempre, e il `COMMIT` finale faceva rollback anche dell'`UPDATE`
riuscito. Nessun dato rimasto inconsistente (rollback atomico), ma la
migration falliva silenziosamente. Corretto spostando `UPDATE` dentro il
blocco — verificato che 050 non avesse lo stesso difetto (non ce l'aveva).

**Migration `050_camere_idonee_e_supplementi.sql` — shared inventory
vero.** Nuova tabella `tipi_camera_camere` (tipo_camera_id ↔ camera_id):
quali camere fisiche possono soddisfare la ricerca di un dato tipo sulle
rotte pubbliche del booking engine — sostituisce l'uguaglianza diretta su
`camere.tipo_camera_id`, che restava un solo valore fisso per camera
(inadatto a "stessa stanza, più identità"). `camere.tipo_camera_id` non
toccato: resta l'etichetta fisica di default per planning/reception, non
più la fonte di verità per la disponibilità online. Nuove colonne
`tipi_camera.prezzo_base_tipo_id`/`supplemento_percentuale` (Tripla/
Quadrupla non hanno più una tariffa fissa propria — calcolata sempre dal
prezzo Matrimoniale corrente, così non si disallinea quando cambia).
`soggiorni.tipo_camera_venduto_id`: registra quale identità è stata
VENDUTA, indipendente dall'etichetta fisica della camera assegnata —
necessario perché con lo shared inventory una prenotazione "Singola" può
finire su una camera etichettata "Matrimoniale Piccola". Riattivato il tipo
"Singola" (disattivato dalla 048), creato "Doppia uso singola". Capienze
impostate esplicitamente per tutti i tipi coinvolti (uno dei sospetti
iniziali del bug "non trova mai camere per 3/4 adulti", insieme alle
tariffe/idoneità mancanti). Verificata da Marco: conteggi camere idonee
esattamente come previsto (4/4/4/4/14/14), nessuna anomalia.

**Codice applicativo aggiornato di conseguenza**: `tariffeController.
calcolaTariffa` — nuovo ramo ricorsivo per i tipi con `prezzo_base_tipo_id`
(guardia anti-loop inclusa); `bookingPubblicoController.disponibilita()`/
`prenota()` — candidati camera via `tipi_camera_camere` invece che
`camere.tipo_camera_id` diretto, `prenota()` scrive `tipo_camera_venduto_id`;
`emailPrenotazioni.recuperaSoggiorni` — `COALESCE(tipo_venduto, tipo_fisico)`
per il nome mostrato in mail, fallback per i soggiorni storici senza il
nuovo campo. `BookingWidget.tsx`: rimosso l'hack `etichettaCamera` (relabeling
dinamico "Singola"/"Matrimoniale Piccola" in base agli adulti) introdotto
quando i due tipi erano ancora fusi in uno — non serve più, ora sono di
nuovo due tipi distinti con prezzo proprio, la ricerca li restituisce già
separati.

**Prezzi reali**: listino ufficiale 2026 del titolare (solo pernottamento e
colazione) — Singola 70-130€, Doppia uso singola 100-140€, Matrimoniale
90-170€, supplemento 30%/20% su Tripla/Quadrupla dal prezzo Matrimoniale.
Matrimoniale Piccola (80-160€) segnata esplicitamente dal titolare come
"da riverificare". Mezza pensione/pensione completa (dati raccolti ma non
implementati: il motore tariffe ha un solo prezzo per notte, non per
persona/tipo di pensione) restano fuori scope, annotato in
`docs/EVOLUTIVE.md` insieme al resto delle policy ancora da definire con
calma (protezione anti-cannibalizzazione solo "tutto o niente" per ora, non
una soglia parziale — accettato dal titolare come sufficiente per il primo
giro).

**Test**: `tests/api/bookingPubblico.test.js` esteso con un nuovo describe
"Shared inventory (migration 050)" — due tipi sulla stessa camera fisica
(prenotarne uno esaurisce anche l'altro), `tipo_camera_venduto_id` scritto
correttamente, prezzo del tipo con supplemento calcolato dal tipo base.
Bug trovato da Marco durante la prima esecuzione: la fixture PRINCIPALE del
file (usata da tutti i test preesistenti) creava la camera di test solo con
`camere.tipo_camera_id` diretto — non bastava più, il controller ora legge
da `tipi_camera_camere`. Corretto aggiungendo la riga mancante nel
`beforeAll` principale (stesso pattern già usato correttamente nel nuovo
describe). **13/13 test verdi, confermato dal titolare.**

**Da fare, non ancora chiuso**: script `backend/scripts/
creaContenutiCamereMancanti.js` esteso con Singola/Doppia uso singola (in
attesa che il titolare lo esegua con `--applica`); prezzi marketing Sanity
di Tripla/Quadrupla (110€) non ricalcolati sulla formula reale (117/108) —
cosmetico; verifica manuale end-to-end su `/prenota` non ancora fatta dal
titolare con le tipologie reali.

## 20/08/2026 — Modulo tariffe derivate: periodi stagionali, trattamento (B&B/mezza pensione/pensione completa), bambini

**Contesto**: proseguimento diretto della sessione 19/08 — il titolare
aveva chiesto come decidere quale prezzo vendere in un dato periodo, e
quello ha portato a due richieste collegate: (1) rendere il listino più
semplice da capire per periodo (evolutiva già segnata il 10/08, chiarita
oggi — riguarda la leggibilità della UI, non un motore di calcolo nuovo);
(2) aggiungere mezza pensione/pensione completa. Il titolare ha proposto
lui stesso, dopo due giri di chiarimento, un modello "tariffa madre +
derivazione" — un solo prezzo B&B inserito a mano (Matrimoniale/Doppia),
tutto il resto calcolato — con due vincoli confermati esplicitamente: il
supplemento varia per stagione (non una costante fissa come il +30%/+20%
di ieri), e i range min/max del listino sono la dichiarazione ufficiale
fatta alla Regione — mai superabili, non un suggerimento. Confermato anche
il flusso utente online: data+persone → camera adeguata alla capienza →
trattamento (in quest'ordine).

**Periodi stagionali** (nuova tabella `periodi_stagionali`, vuota
all'avvio): entità di riferimento condivisa (nome + date, es. "Alta
stagione" luglio-agosto), decisa liberamente dal titolare — numero e
confini dei periodi NON sono fissati nel codice, come richiesto
esplicitamente ("questo lo decide il titolare nel gestionale impostandolo
come vuole"). Vincolo anti-sovrapposizione stesso pattern già in uso su
`tariffe` (`EXCLUDE USING gist`). `tariffe.periodo_id` nuovo, nullable —
le fasce già inserite restano valide con le loro date dirette.

**Derivazione periodizzata** (nuova tabella `regole_derivazione_tariffe`):
generalizza (rendendola dipendente dal periodo) la coppia
`tipi_camera.prezzo_base_tipo_id`/`supplemento_percentuale` introdotta il
19/08 per Tripla/Quadrupla — da oggi quelle due colonne su `tipi_camera`
sono STORICHE, non più lette dal codice (la migration 051 ha copiato i
dati esistenti come righe di fallback `periodo_id = NULL`, nulla perso).
Ogni regola ha anche `prezzo_minimo`/`prezzo_massimo` — il range
dichiarato, popolato dal titolare da `/tariffe`, non indovinato in
migration: nessun numero di listino è stato scritto a mano nel codice,
proprio perché tocca la dichiarazione alla Regione e un errore lì non è
accettabile. Finché il titolare non li compila, il clamp è semplicemente
inattivo per quel tipo/periodo (non un default prudente — nessun vincolo
applicato, dichiarato esplicitamente sia nel commento della migration sia
nella UI). Il calcolo (`tariffeController.calcolaPrezzoCameraPerNotte`) è
NOTTE PER NOTTE, non più un unico calcolo sull'intero soggiorno: un
soggiorno che attraversa due periodi può avere percentuali diverse notte
per notte, esattamente come richiesto. Clamp automatico + avviso testuale
per ogni notte fuori range (mai un blocco 500 — il prezzo viene riportato
al bordo, l'avviso resta visibile in `/tariffe` per l'admin). Guardia
anti-loop difensiva: un tipo derivato non può derivare da un altro tipo
già derivato (mai il caso nei dati reali, ma se capitasse la notte
risulterebbe scoperta invece di un numero sbagliato).

**Trattamento** (nuova dimensione, `soggiorni.trattamento`, default `'bb'`
retrocompatibile): B&B/mezza pensione/pensione completa. Supplemento a
persona per notte, in una nuova tabella `supplementi_trattamento`, per
CATEGORIA camera ('singola' = capienza_max 1, 'doppia' = capienza_max 2+ —
non per i 6 tipi singolarmente, coerente con come il titolare ha sempre
dato i numeri) e per periodo, stesso meccanismo fallback/specifico delle
regole di derivazione.

**Bambini**, tre decisioni prese in chat (20/08) prima di scrivere
codice: 0-2 anni non contano MAI ai fini della capienza_max (dormono in
culla, sempre gratis su camera e trattamento); 3-11 anni contano
pienamente come un adulto per la scelta della camera, ma hanno uno sconto
sul supplemento trattamento — FISSO tutto l'anno (non periodizzato,
scelta esplicita del titolare per semplicità), in una nuova tabella a riga
singola `configurazione_bambini`, seminata a 0% con nota "DA CONFERMARE
CON IL TITOLARE" (mai un numero indovinato); 12-17 anni trattati come un
adulto a tutti gli effetti — nessuna regola specifica è stata data dal
titolare, annotato come assunzione da riconfermare (anche in
`docs/EVOLUTIVE.md`). `bookingPubblicoController.normalizzaComposizioneOspiti`
ora calcola due conteggi distinti: `totaleOspiti` (invariato, headcount
reale per tassa di soggiorno) e `ospitiChePesanoSuCapienza` (nuovo, esclude
gli 0-2) — usati in punti diversi apposta, non un'unica variabile.

**Bug auto-trovato e corretto prima di consegnare** (non segnalato da
Marco stavolta): la riscrittura di `disponibilita()` cambia la forma della
risposta da `prezzo_totale` singolo a `prezzi: {bb, mezza_pensione,
pensione_completa}` — questo rompeva silenziosamente due punti del test
suite esistente (`tests/api/bookingPubblico.test.js`, il test base di
`GET disponibilita` e il test del supplemento nella describe "Shared
inventory") oltre alla fixture di quella stessa describe, che impostava il
supplemento SOLO sulle vecchie colonne `tipi_camera.prezzo_base_tipo_id`/
`supplemento_percentuale` — non più lette dal nuovo `calcolaPrezzoCameraPerNotte`.
Trovato rileggendo i consumer esistenti prima di dichiarare il lavoro
finito, non durante un'esecuzione reale dei test (che restano da eseguire
dal titolare/tab Code, come da workflow di questo progetto) — corretto
aggiungendo la riga mancante in `regole_derivazione_tariffe` alla fixture
e aggiornando le due asserzioni.

**Codice applicativo**: `tariffeController.calcolaTariffa` riscritto —
firma estesa con `{ trattamento, adulti, bambiniEta }`, nuovi campi di
ritorno `prezzo_camera`/`supplemento_trattamento`/`avvisi` (in aggiunta a
`num_notti`/`prezzo_totale`/`notti_scoperte`, retrocompatibili). Nuovo
controller `tariffeDerivateController.js` + route `/api/tariffe-derivate/*`
(derivazione, trattamento, configurazione-bambini) e
`periodiStagionaliController.js` + `/api/periodi-stagionali` — stessa
azione permesso `tariffe` di sempre, nessuna voce nuova in
`shared/ruoli.js`. `bookingPubblicoController.disponibilita()`/`prenota()`:
capienza su `ospitiChePesanoSuCapienza`, tre prezzi per tipo in un'unica
risposta (nessuna chiamata di rete aggiuntiva quando l'ospite cambia
trattamento sul sito), `prenota()` valida e salva il trattamento scelto.
`emailPrenotazioni.js`: mostra il trattamento scelto (se diverso da B&B)
accanto al nome camera, sia nell'elenco semplice sia nella tabella
dettagliata. `/tariffe` (gestionale): 4 nuove sezioni — Periodi stagionali,
Regole di derivazione, Supplemento trattamento, Bambini — oltre al
listino esistente ora collegabile a un periodo. `BookingWidget.tsx`
(sito-hotel): selettore trattamento dopo la scelta camera (mai prima,
come da flusso confermato), capienza lato client allineata alla stessa
regola bambini 0-2/3+ del backend, prezzo e caparra ricalcolati sul
trattamento scelto — nessuna nuova chiamata di rete.

**Test**: nuova describe "Tariffe derivate — periodi, clamp, trattamento,
bambini" in `tests/api/bookingPubblico.test.js` — percentuale di
derivazione diversa dentro/fuori un periodo, clamp sul massimo dichiarato
con avviso, supplemento trattamento con sconto bambini, capienza 0-2
esclusa/3+ inclusa, `prenota()` che salva il trattamento. **18/18 test
verdi, confermato dal titolare** (5 nuovi + 13 preesistenti) — nessuna
correzione necessaria, il codice del booking engine era già coerente con
la migration 051. Log noise confermato invariato e atteso: sandbox Resend
che rifiuta `@example.com`, firma webhook Stripe finta rifiutata (test
intenzionale).

**Da fare, non ancora chiuso**: migration 051 e suite di test entrambe
confermate dal titolare — resta solo la parte che spetta a lui popolare da
UI, non a un test automatico: il titolare deve popolare da `/tariffe` i
range min/max dichiarati (oggi nessun clamp attivo su nessun tipo
derivato), la percentuale reale di sconto bambini (oggi 0%, placeholder) e
almeno un supplemento trattamento (senza il quale mezza pensione/pensione
completa risultano sempre "non disponibile" su `/prenota`, pur avendo il
motore di calcolo pronto); verifica manuale end-to-end del flusso
trattamento su `/prenota` (sito) non ancora fatta; assunzione bambini
12-17 = adulto a tutti gli effetti da
riconfermare col titolare.

## 20/08/2026 (seguito) — Redesign UI `/tariffe`: timeline visiva al posto
delle tendine

Stessa giornata del modulo tariffe derivate sopra: appena mostrata la prima
versione dell'UI (`SezioneListino`/`SezioneDerivazione`/`SezioneTrattamento`
come sezioni separate, ciascuna con le proprie tendine per tipo camera,
periodo, tipo base), il titolare l'ha bocciata esplicitamente — "non
riesco a capire come utilizzare tutte queste tendine... o l'usabilità per
un albergatore è immediata o diventa complesso, lo è per me che l'ho
progettato". Richiesta esplicita: guardare come si comportano i competitor
(Cloudbeds prima, poi su richiesta anche Slope/Octorate/TeamSystem) e
proporre una direzione diversa prima di toccare codice — coerente con
plan-then-execute, nessuna riga scritta finché non confermata.

Ricerca competitor (WebSearch + web_fetch, nessuna scrittura in questa
fase): Cloudbeds espone una "derived rate plan" con un solo toggle +
dropdown + percentuale, e gestisce la stagionalità con "intervalli"
DENTRO lo stesso rate plan (non un'entità separata da referenziare altrove)
— fonti: myfrontdesk.cloudbeds.com articoli "Rate Plans and Packages" e
"Base Rates and Availability Matrix". Slope non ha aggiunto nulla sul
fronte periodi (stessa logica madre/derivata già implementata, esempio
statico senza stagionalità) — fonte: slope.it, "Come creare il tariffario
per il tuo hotel". Octorate separa esplicitamente "piano tariffario"
(trattamento + politiche cancellazione/incasso) da "regola di derivazione"
(correzione prezzo tra tipologie), con avviso di non compilare la
correzione prezzo in entrambi i posti per non sommarla due volte — fonte:
community.octorate.com, "Piani tariffari e configurazione tariffe". Nessuno
dei tre mostra un selettore visivo dei periodi diverso da un form con due
date — un "Editor Avanzato" di Octorate citato in una ricerca precedente
non è stato ritrovato/confermato in questo giro, quindi non è stato preso
come riferimento.

Sintesi proposta al titolare (mockup via `mcp__visualize__show_widget`,
mai codice reale finché non confermato): un'unica schermata per tipologia,
con una timeline dell'anno su cui si trascina per creare un periodo — il
periodo nasce come conseguenza dell'uso, non come prerequisito da
configurare altrove prima. Confermato ("già meglio di quanto abbiamo ora"),
poi esteso a tutte le tipologie/categorie con tre decisioni chiarite via
piano scritto: (1) il periodo creato è sempre condiviso tra madre/derivate/
trattamento, mai privato di una tipologia; (2) se il trascinamento si
sovrappone a un periodo esistente lo aggancia in automatico SENZA avviso
(il titolare aveva prima chiesto un avviso con scelta, poi ci ha ripensato
esplicitamente: "non mettere avvisi"); (3) la sezione "Periodi" (CRUD
esplicito nome/date) resta ma secondaria, non più la prima cosa che si
vede.

Implementazione, confermata con "si" sul piano:
- `frontend/components/tariffe/TimelinePeriodi.jsx` (nuovo) — striscia di
  12 mesi, granularità mese (non giorno esatto, scelta deliberata per
  restare semplice su tablet). Pointer Events (non mouse/touch separati)
  per drag cross-device: pointerdown su un mese avvia il trascinamento,
  pointermove legge il mese sotto il puntatore via
  `document.elementFromPoint` + `data-mese` sulle celle (non pointerenter
  per-cella, che su touch non si propaga tra elementi diversi), pointerup
  lo finalizza. Colora i blocchi in base a due prop generiche
  (`coloratiIds`: Set di periodo.id "configurati" nel contesto corrente;
  `fallbackAttivo`: sfondo tinto su tutta la striscia se esiste una regola/
  supplemento "sempre valida") — il componente non sa nulla di tariffe/
  regole/supplementi, riceve solo ciò che deve colorare.
- `frontend/components/tariffe/PannelloPrezzoTipologia.jsx` (nuovo) — due
  modalità decise dal genitore in base ai dati (non da un elenco fisso di
  nomi tipo camera): 'madre' mostra prezzo diretto per notte (upsert
  manuale POST/PATCH, perché `/api/tariffe` non fa upsert lato server);
  'derivata' mostra percentuale + min/max, sempre POST (upsert reale lato
  server su tipo+periodo, già presente in `tariffeDerivateController.js`
  dalla mattina). Per 'madre' non esiste il concetto di "sempre valida" —
  semplificazione voluta: da questa UI in poi ogni prezzo diretto nasce
  legato a un periodo, mai più a sole date libere (le vecchie fasce senza
  periodo restano valide e modificabili dalla sezione Periodi secondaria).
- `frontend/components/tariffe/PannelloSupplementoTrattamento.jsx` (nuovo)
  — stessa timeline, selettore mezza pensione/pensione completa dentro il
  pannello (la timeline è condivisa dai due trattamenti della stessa
  categoria, non serve raddoppiarla).
- `frontend/app/tariffe/page.jsx` — riscritto: `SezioneListino` +
  `SezioneDerivazione` sostituite da un'unica `SezionePrezziTipologia`
  (tendina tipologia — l'unica tendina rimasta, di navigazione non di
  inserimento dati, il titolare l'ha accettata esplicitamente prima di
  iniziare); `SezioneTrattamento` riscritta per usare la stessa timeline;
  `SezionePeriodi` spostata in fondo dentro un `<details>` (collassata di
  default, zero dipendenze nuove). `caricaBase()` ora carica tariffe/
  regole di derivazione/supplementi trattamento SENZA filtro (una sola
  chiamata ciascuna, tutto il dataset) invece che per-tipo ad ogni cambio
  di tendina — dataset piccolo (poche tipologie/periodi), preferito a un
  giro di rete ad ogni click sulla timeline.

Creazione periodo dalla timeline: `window.prompt()` nativo per il nome
subito dopo il trascinamento (nessun modale nuovo costruito, per restare
nello scope) — se annullato, il trascinamento non produce nulla.

Verificato solo con `esbuild` (sintassi, tutti e 4 i file puliti) e
`npx tsc --noEmit` (intero frontend, zero errori). **Non ancora verificato
in UI dal titolare** — in particolare: il trascinamento touch su tablet
reale (Pointer Events testati solo per correttezza logica, mai su
hardware), l'aggancio silenzioso in caso di sovrapposizione, e il flusso
end-to-end di un nuovo periodo creato dalla timeline con conferma del nome
via prompt. Dettaglio anche in `docs/EVOLUTIVE.md`.

## 20/08/2026 (terzo tentativo) — Redesign UI `/tariffe`, chiuso: schede +
etichette periodo al posto della timeline

La timeline appena costruita è stata bocciata dal titolare non appena
vista in UI ("non ci siamo, i tuoi mockup iniziali erano molto più
chiari... siamo sempre punto a capo") — mai arrivata a un test reale. La
lezione, esplicitata a me stesso prima di ripartire: ero passato dal
mockup approvato direttamente al codice reale senza fartelo rivedere come
mockup — da qui in avanti tornato su un mockup (`mcp__visualize__show_widget`)
prima di ogni riga di codice, con conferma esplicita ad ogni passaggio.

Iterazione sul mockup (nessun codice toccato in questa fase): prima
versione a "etichette periodo cliccabili" dentro le due card Matrimoniale/
Tripla già mostrate in mattinata — un errore di sintassi nello script del
primo tentativo ha reso il widget silenzioso (si vedevano solo le
intestazioni, niente contenuto), risolto riscrivendo lo script con
`createElement`/`textContent` invece di stringhe HTML concatenate con
virgolette annidate, più fragili da sbagliare. Confermato dal titolare
("questo mi piace di più"). Poi due iterazioni di rifinitura, entrambe
sul mockup prima del codice: rinominate le etichette "Min/Max Regione" in
"Min/Max tariffa" (hanno senso solo sulla scheda derivata, non sulla
madre, dove min/max non esistono); aggiunta la terza scheda "Supplemento
trattamento" nello stesso stile e reso funzionante il flusso "+ nuovo
periodo" (form inline nome+due date, il periodo creato compare come
etichetta condivisa in tutte e tre le schede, vuoto finché non gli si
imposta un valore in ciascuna — dimostrato apposta tenendo le tre schede
impilate nel mockup, cosa che nella pagina vera NON succede, vedi sotto).

Due domande del titolare prima di dare il via libera al codice, entrambe
rispondono a punti non ovvi dell'architettura: (1) con 5 tipologie
derivate/madre più trattamento e bambini, se le schede stessero tutte
impilate sulla pagina vera si tornerebbe al problema di leggibilità del
primo tentativo da un'altra porta — risposto proponendo una fila di
etichette tipologia in alto (non più tendina) che mostra UNA scheda alla
volta, stessa card riusata, accettato; (2) se una futura funzionalità di
stop-sell per tipo/periodo starebbe in questa pagina — risposto che oggi
non esiste da nessuna parte (nessuna tabella), che concettualmente ci
starebbe (stesso bisogno tipologia+periodo) ma tocca `disponibilita()` nel
booking pubblico, non il calcolo prezzo, quindi è un piano a parte quando
il titolare vorrà affrontarlo — non toccato in questa sessione, solo
annotato in `docs/EVOLUTIVE.md`.

Implementazione, via libera con "inizia con questa parte così la
chiudiamo":
- `frontend/components/tariffe/ChipPeriodi.jsx` (nuovo) — riga di
  etichette periodo riutilizzabile da tutte le schede: etichetta "Tutto
  l'anno" opzionale (`allowFallback`, assente per la scheda madre — nessun
  concetto di fallback per il prezzo diretto), un'etichetta per periodo,
  "+ nuovo periodo" con form inline (nome + due `CampoData`). A differenza
  della timeline bocciata, qui non c'è più un gesto di trascinamento da
  agganciare in automatico in caso di sovrapposizione: se le date scritte
  a mano si sovrappongono a un periodo esistente, il backend risponde 409
  e l'errore viene mostrato così com'è — decisione esplicita, "niente
  avvisi" valeva solo per il trascinamento che non esiste più.
- `frontend/components/tariffe/SchedaPrezzoTipologia.jsx` (nuovo,
  sostituisce `PannelloPrezzoTipologia.jsx` + l'uso di `TimelinePeriodi`)
  — scheda auto-contenuta: gestisce da sola lo stato di selezione periodo/
  fallback (non più nella pagina), mostra `ChipPeriodi` + form che cambia
  forma da solo (prezzo diretto per la madre, percentuale+min/max per le
  derivate, dedotto dai dati). Aggiunta rispetto al secondo tentativo:
  anteprima di calcolo dal vivo sulla scheda derivata (prezzo base del
  tipo madre nello stesso periodo → calcolato → eventuale clamp), ma SOLO
  quando è selezionato un periodo specifico — con "Tutto l'anno" il
  prezzo base cambia notte per notte secondo le fasce dirette, non esiste
  un singolo numero onesto da mostrare, quindi l'anteprima resta nascosta
  con una nota invece di mostrare un calcolo potenzialmente sbagliato.
- `frontend/components/tariffe/SchedaTrattamento.jsx` (nuovo, sostituisce
  `PannelloSupplementoTrattamento.jsx` + l'uso di `TimelinePeriodi`) —
  stesso pattern, con i toggle categoria/trattamento sopra `ChipPeriodi`;
  include già il proprio contenitore scheda (`SezioneTrattamento` come
  wrapper separato non serve più, eliminata da `page.jsx`).
- `frontend/app/tariffe/page.jsx` — `SezionePrezziTipologia` non usa più
  una tendina: le tipologie camera sono una fila di etichette in alto,
  UNA `SchedaPrezzoTipologia` visibile alla volta per la tipologia scelta
  (risposta alla prima domanda del titolare sopra). `SezioneTrattamento`
  tolta, sostituita dalla chiamata diretta a `SchedaTrattamento`
  (contiene già la propria card). `SezionePeriodi` invariata, resta
  secondaria e collassata.
- `TimelinePeriodi.jsx`, `PannelloPrezzoTipologia.jsx`,
  `PannelloSupplementoTrattamento.jsx` — non eliminati (la cancellazione
  nella cartella dell'utente richiede conferma esplicita, non necessaria
  per file già non importati da nessuna pagina) ma svuotati in stub con
  commento "SUPERATO", per non lasciare codice morto silenzioso nel
  repository.

Verificato con `esbuild` (4 file nuovi/toccati, tutti puliti) e
`npx tsc --noEmit` (intero frontend, zero errori). **Non ancora verificato
in UI dal titolare** — in particolare il form "+ nuovo periodo" e
l'anteprima di calcolo sulla scheda Tripla. L'idea del titolare di una
vista planning (righe=tipologie, colonne=mesi, celle=prezzo) sotto queste
schede resta annotata in `docs/EVOLUTIVE.md`, deliberatamente non
affrontata in questa sessione su sua stessa indicazione.

## 22/08/2026 — Code review incrociata (tab Code): triage e fix Tier 1 (#4, #1), verifica #3

Il tab Code (sessione Claude Code separata di Marco) ha eseguito una review
di sicurezza/correttezza su entrambi i repo (`gestionale-hotel` e
`sito-hotel`) e riportato 10 finding prioritari più una lista di item
scartati/minori, fermandosi esplicitamente prima di una Fase 2 di verifica
formale per-candidato (sub-agent dedicato per voto CONFIRMED/PLAUSIBLE/
REFUTED) per risparmiare token — riducendo così da ~30 candidati a 10
finding riportati "a fiuto". Marco ha chiesto prima un giudizio indipendente
sulle priorità ("Dimmi cosa ne pensi e quali azioni secondo te sono
prioritarie senza iniziare alcuna operazione correttiva"), poi via libera
esplicito a correggere ("cominciamo a risolvere, poi alla fine fammi
riassunto"). Ri-prioritizzati i 10 finding in tre tier per rischio
economico/dati diretto (non solo l'ordine "dal più grave" di Code, sempre
verificando ogni claim sul codice reale prima di agire, non fidandosi solo
della prosa del report).

### Fix #4 — prezzo derivato preso da una riga non ordinata

Bug **introdotto da questa stessa area di lavoro** il 20/08 (redesign UI
`/tariffe`): `SchedaPrezzoTipologia.jsx` permette di scegliere "Deriva da"
indipendentemente per ciascun periodo di una stessa tipologia derivata —
ma il motore di calcolo lato server, `calcolaPrezzoCameraPerNotte`
(`backend/controllers/tariffeController.js`), risolveva il tipo camera
base UNA SOLA VOLTA leggendo `regoleResult.rows[0]` (query senza
`ORDER BY`), assumendo implicitamente che fallback e tutte le regole
per-periodo di una tipologia condividessero sempre la stessa base. Prima
del redesign questa assunzione era sempre vera (un solo "Deriva da" per
tipologia, impostabile solo globalmente); con la nuova UI è falsa non
appena si sceglie una base diversa per periodi diversi sulla stessa
tipologia — nel peggiore dei casi si addebita all'ospite un prezzo
calcolato sulla base camera sbagliata.

Corretto: la base viene ora risolta **per regola abbinata, notte per
notte** (Map `periodo_id → regola`, fallback separato), non più
globalmente una volta sola; il controllo anti-loop di derivazione (una
tipologia non può derivare — direttamente o indirettamente — da se stessa)
è stato esteso per coprire TUTTE le basi distinte effettivamente in uso
dalle regole di quella tipologia, non solo la prima incontrata. Nuovo test
di regressione in `tests/api/bookingPubblico.test.js`
(`describe('Tariffe derivate — basi diverse tra fallback e periodo...')`):
tre casi — soggiorno solo in fallback (base A), soggiorno solo dentro un
periodo (base B), soggiorno a cavallo tra i due — verificano che il
prezzo per notte usi sempre la base corretta tratto per tratto (il terzo
caso, quello che prima avrebbe fallito silenziosamente, verifica
esplicitamente `prezzo_totale = notte_fallback(base A) + notte_periodo(base B)`).

### Fix #1 — race cron scadenza hold / webhook Stripe

`backend/jobs/scadenzaHoldBookingEngine.js` (cron ogni minuto, per scelta
di design non chiama mai Stripe — vedi commento in testa al file) può
marcare una prenotazione online `'interrotta'` (e i suoi soggiorni
cancellati) PRIMA che il webhook `payment_intent.succeeded` di un
pagamento riuscito nel frattempo venga elaborato — uno scenario
sequenziale realistico sulla finestra di ~60s del cron più la latenza di
consegna Stripe (non una vera race a livello di lock DB istantaneo: il
`SELECT ... FOR UPDATE` del webhook già impedisce l'interleaving
simultaneo). Prima, il ramo `if (stato !== 'opzione')` di
`stripeWebhookController.js` si limitava a fare COMMIT e rispondere 200 in
OGNI caso di stato diverso da `'opzione'`, assumendo sempre un webhook
duplicato o un caso già gestito — ma se il cron aveva già interrotto la
prenotazione e il pagamento non era mai stato marcato `'completato'` né
già rimborsato, l'ospite restava addebitato su Stripe con una prenotazione
morta e nessun rimborso automatico.

Corretto: in quel ramo si verifica ora esplicitamente se esiste ancora una
riga `pagamenti` con quell'`external_payment_id` in stato `'pending'`; se
sì, si marca `'rimborsato'`, si fa COMMIT, poi (fuori dalla transazione
DB, come da pattern già in uso nello stesso file per la chiamata Stripe
post-commit) si chiama `stripe.refunds.create`, si logga con
`console.error` per verifica manuale dello stato camera, e si invia la
stessa notifica già usata per il caso "hold scaduto" — deliberatamente
SENZA tentare di far rivivere la prenotazione (la camera potrebbe essere
già stata riassegnata), stessa filosofia già scelta il 19/08/2026 per il
caso gemello "pagamento arrivato dopo la scadenza" nello stesso file.
Nuovo test in `tests/api/bookingPubblico.test.js`
(`'rimborsa anche se il cron ha già interrotto la prenotazione prima del
webhook (race)'`): crea una prenotazione reale, conferma il PaymentIntent
via API Stripe di test, esegue a mano le stesse due UPDATE del cron per
simulare la race, poi invia il webhook firmato reale e verifica sia il
rimborso sia che un secondo invio dello stesso evento (Stripe può
reinviare) non generi un secondo rimborso.

### #3 — tassa di soggiorno online "solo intestatario": verificato, NON riproducibile

Finding di Code: la tassa di soggiorno stimata nella mail di conferma per
le prenotazioni online conterebbe solo l'intestatario, non l'intera
comitiva. Verifica sul codice attuale: `bookingPubblicoController.prenota`
scrive già, per OGNI prenotazione fatta dal sito, `num_ospiti = totaleOspiti`
(headcount pieno, non 1) e `composizione_ospiti = { adulti, bambini_eta }`
sulla riga `soggiorni` — estensione fatta il 19/08/2026 (Booking Engine v2,
Fase A), un giorno prima della review di Code. `calcolaTassaSoggiorno`
(`backend/lib/emailPrenotazioni.js`, righe ~153-185) usa il ramo esatto
(`adulti + bambiniTassabili`, con esenzione età reale) ogni volta che
`composizione_ospiti.bambini_eta` è un array — condizione sempre vera per
il canale `sito_diretto`. Il ramo di stima (`num_ospiti || 1`) resta
raggiungibile solo da prenotazioni telefoniche/storiche prive di quel
campo, ed è già onestamente etichettato come importo "indicativo"
(`esatta: false`, mostrato in mail) — comportamento voluto e documentato
nel commento in testa alla funzione, non un bug.

Conclusione: nessuna modifica necessaria. Il finding molto probabilmente si
riferiva a uno stato del codice precedente all'estensione del 19/08, o
Code non l'aveva vista. Non riaprire finché non emerge un caso concreto
riprodotto con dati reali.

### Non affrontati in questa sessione (Tier 2/3 del triage)

In attesa di indicazione di Marco su come proseguire: nome ospite non
sanificato nella mail di conferma (rischio HTML injection); chiamata
Stripe eseguita dentro una transazione DB aperta nel webhook (tiene la
connessione impegnata durante una chiamata di rete esterna); l'assunzione
di migration 050 che "Singola sopravvive sempre a 048" mai verificata
esplicitamente; camera nuova non collegata automaticamente alla vendita
online (serve un passaggio manuale in `tipi_camera_camere`); percentuale
caparra 30% duplicata a mano tra `sito-hotel` e gestionale invece di una
sola fonte; `/planning-camere` senza indicazione di trattamento/tipo
camera venduto sulla barra; tripla query di calcolo prezzo per tipologia
(bb/mezza pensione/pensione completa) invece di una sola parametrizzata.
Un ultimo item scartato da Code ("`prezzo_notte: 0` trattato come 'nessun
valore' via COALESCE, ora raggiungibile dalla nuova UI") non è stato
accettato come non-problema senza il file:riga esatto citato da Code —
resta da chiarire quando servirà, non messo in task list.

### Verifica e limiti

Fix scritti e verificati solo con `node -c` (sintassi) dal sandbox Cowork
— nessun accesso al database da qui, per convenzione di progetto. Marco ha
poi fatto eseguire l'intera suite dal tab Code: **940/940 test verdi,
33/33 suite passate (69.9s), nessuna regressione** — inclusi entrambi i
test di regressione dedicati (basi diverse per periodo, race cron/webhook),
confermati contro il DB reale, non solo sintassi.

### Fuori scope — ricerca Numia S.p.A./PayWay (BCC)

Su richiesta di Marco, valutata Numia/PayWay (BCC, dove Hotel del Golfo ha
già un conto) come alternativa a Stripe/Nexi per il booking engine. Il
Foglio Informativo pubblico mostra solo un tetto regolamentare (fino al
6% + 1-2€ a transazione, **+3% specifico per Card Not Present** — esattamente
il caso delle prenotazioni online —, minimo 200€/mese di commissione
indipendentemente dal volume), non il prezzo reale negoziato (Documento di
Sintesi, mai pubblicato online, va richiesto in filiale). L'accesso alle
API richiede un'istruttoria di approvazione, a differenza della
documentazione tecnica aperta di Stripe/Nexi. Confronto dato a Marco:
Stripe 1.5%+0.25€ (carte UE) / 3.25%+0.25€ (extra-UE), nessun fisso/mensile;
Nexi XPay 0-14.90€/mese secondo piano + 1.20-1.35%+0.25-0.40€ a
transazione. Detto esplicitamente a Marco che nessun modello (incluso
Opus) può colmare la lacuna sul prezzo reale Numia: è una cifra
commerciale privata mai pubblicata, non un limite di conoscenza del
modello — l'unico modo per saperlo è chiedere in filiale BCC il Documento
di Sintesi. Nessuna modifica al codice.

Salvata anche una nuova regola comportamentale in memoria persistente, su
richiesta esplicita di Marco nel contesto di questa domanda: avvisare
sempre PRIMA di avviare un'attività (mia o del tab Code) che consumerebbe
la stragrande maggioranza dei suoi token — non bastano più le stime dopo
il via libera.

## 23/08/2026 — Code review 22/08: chiusi tutti e 7 i finding Tier 2/3

Continuazione della sessione 22/08/2026: i 7 finding Tier 2/3 rimasti
aperti dopo i fix Tier 1 sono stati chiusi tutti in questa sessione, 4
"puri" (nessuna decisione da Marco necessaria) seguiti da 3 su cui Marco
ha dato indicazione esplicita prima di scrivere codice.

### I 4 fix puri

- **Nome ospite non sanificato**: non era nella mail di conferma vera e
  propria (`inviaConfermaPrenotazione`, già protetta da
  `renderizzaCorpoEmail`/`escapeTesto`) ma in `inviaNotificaHoldScaduto`
  (`backend/lib/emailPrenotazioni.js`) — l'unica delle email del file a
  interpolare `destinatario.nome` crudo nell'HTML, raggiungibile da un
  ospite anonimo del Booking Engine Diretto (nome auto-inserito nel form
  pubblico). Aggiunto `escapeTesto`, già importato nel file.
- **Chiamata Stripe dentro una transazione DB aperta**: anche qui la
  sintesi originale indicava "nel webhook", ma verificato sul codice reale
  che in `stripeWebhookController.js` ogni chiamata Stripe era già
  post-commit (corretto il 22/08 per il finding #1). Il caso vero era
  `bookingPubblicoController.prenota()`: `stripe.paymentIntents.create`
  girava tra BEGIN e COMMIT, tenendo impegnati connessione DB e lock
  `FOR UPDATE SKIP LOCKED` sulla camera per l'intera round-trip verso
  Stripe. Spostato dopo COMMIT (la camera resta comunque riservata dal
  vincolo di esclusione su `soggiorni` + TTL dell'hold, non dal lock di
  transazione); se la creazione del PaymentIntent fallisce, la
  prenotazione viene liberata subito (non si aspetta la scadenza naturale
  del hold); gestito anche il caso limite "PaymentIntent creato ma riga
  `pagamenti` non scritta" (loggato per intervento manuale).
- **Test dedicato sull'assunzione migration 048→050**: nuovo
  `tests/api/migrazioneShareInventory.test.js`. A differenza del resto
  della suite non usa fixture sintetiche — legge lo stato REALE di
  `tipi_camera`/`camere`/`tipi_camera_camere`, perché è proprio quello
  stato (non un caso inventato) che l'assunzione "dopo 048 esiste ancora
  un tipo chiamato Singola" riguarda. Verifica anche che le 4 camere
  fisiche consolidate (2/7/12/21) puntino tutte a "Matrimoniale Piccola" e
  che il pool condiviso in `tipi_camera_camere` sia corretto.
- **Tripla query di calcolo prezzo per tipologia**: `disponibilita()`
  chiamava `calcolaTariffa` tre volte per ogni tipo camera in lista (una
  per trattamento bb/mezza pensione/pensione completa), ripetendo tre
  volte le stesse query di `calcolaPrezzoCameraPerNotte` — che NON dipende
  dal trattamento. Nuova `calcolaTariffaPerTrattamenti` in
  `tariffeController.js`: calcola il prezzo camera una sola volta e lo
  riusa per tutti i trattamenti richiesti, restano per-trattamento solo le
  chiamate a `calcolaSupplementoTrattamento` (quelle sì dipendono dal
  trattamento). `calcolaTariffa` (usata da `/api/tariffe/calcola` e da
  `prenota()`) ora è un wrapper sopra la nuova funzione, stesso
  comportamento di prima. Test di equivalenza in `tests/api/tariffe.test.js`
  (il risultato per "bb" deve restare identico chiamato da solo o dentro
  un batch con altri trattamenti).

### I 3 fix con decisione di Marco

Marco ha scelto, senza ambiguità sulle prime due, con un chiarimento
richiesto e ottenuto sulla terza:

- **Camera nuova non collegata alla vendita online**: auto-collegamento
  automatico. Nuova funzione `collegaVenditaOnline()` in
  `camereController.js`, chiamata sia da `crea()` (se `tipo_camera_id` è
  passato alla creazione) sia da `aggiornaTipo()` (PATCH `/:id/tipo`, il
  percorso più comune: camera creata senza tipo, assegnato dopo).
  Puramente ADDITIVO — mai una DELETE: una camera può essere idonea per
  più tipi contemporaneamente (shared inventory, migration 050) e le
  associazioni aggiuntive restano una decisione manuale del titolare;
  rimuovere la categoria (`tipo_camera_id: null`) NON scollega
  `tipi_camera_camere`, verificato con un test dedicato. Aggiornati anche
  gli `afterAll` dei test esistenti su `PATCH /:id/tipo`: `tipi_camera_camere`
  non ha `ON DELETE CASCADE` (migration 050), la DELETE su `camere` avrebbe
  iniziato a fallire per vincolo di chiave esterna non pulendo prima
  quella tabella.
- **Percentuale caparra duplicata sito-hotel/gestionale**: endpoint del
  gestionale, letto a runtime — stesso pattern già in uso per
  `termini-cancellazione`. Nuovo `GET /api/booking-pubblico/configurazione`
  (`{ percentuale_caparra: PERCENTUALE_CAPARRA }`), nessuna query DB,
  nessun dato sensibile. `BookingWidget.tsx` lo legge nello stesso
  `useEffect` di `terminiCancellazione`, con 0.3 come fallback locale SOLO
  se la chiamata fallisce (mai bloccare la stima mostrata all'utente per
  un problema di rete — l'importo autorevole resta comunque sempre quello
  restituito da `POST /prenota`, mai questo valore lato client).
- **`/planning-camere` senza indicazione trattamento/tipo venduto**:
  chiesto chiarimento a Marco su dove (colonna camera vs barra
  prenotazione) — risposta: nel dettaglio prenotazione (click) E nel
  tooltip (hover), legati alla prenotazione, non alla riga camera.
  `prenotazioniController.griglia()` e `.dettaglio()` non restituivano
  affatto `trattamento`/tipo camera venduto — aggiunti a entrambe le
  query con lo stesso criterio COALESCE(tcv.nome, tc.nome) già in uso in
  `emailPrenotazioni.js` (preferisce sempre `tipo_camera_venduto_id`,
  ricade sull'etichetta fisica di default solo per soggiorni storici senza
  quel dato) — così mail, planning e dettaglio mostrano sempre lo stesso
  tipo per lo stesso soggiorno. Frontend: nuova mappa
  `ETICHETTA_TRATTAMENTO` (duplicata da quella di `emailPrenotazioni.js`,
  non importabile lato browser — se cambia il testo va aggiornato in
  entrambi i posti), aggiunta una riga nel pannello dettaglio per soggiorno
  e una riga in coda al nome nel tooltip della barra. Nuovo test in
  `tests/api/prenotazioni.test.js` (griglia + dettaglio, campo per campo).

### Verifica e limiti

Come per la sessione 22/08: scritto e verificato solo con `node -c`
(backend) ed `esbuild` — verifica di sintassi/JSX, non di type-checking né
di logica — sui file `.jsx`/`.tsx` toccati (`planning-camere/page.jsx`,
`BookingWidget.tsx`) dal sandbox Cowork. **Nessun accesso al database,
nessuna esecuzione della suite Jest da questo ambiente.** Marco esegue
ora `git add`/`commit`/`push` + test completi dal tab Code — risultato non
ancora confermato a fine sessione.

**Seguito stesso giorno — confermato da Marco/tab Code**: commit, push e
suite di test eseguiti con successo. Un bug reale trovato durante
l'esecuzione (nel test, non nel codice applicativo): causa confermata
l'`afterAll` interno del describe `'Trattamento + tipo camera venduto in
griglia/dettaglio'` (aggiunto in questa stessa sessione, vedi sopra)
cancellava `tipi_camera` prima che l'`afterAll` esterno del file
cancellasse la prenotazione/soggiorno che lo referenzia ancora tramite
`tipo_camera_venduto_id` — ordine di pulizia sbagliato, introdotto insieme
al nuovo test. Corretto azzerando il riferimento prima della DELETE.
Riportato a Marco solo il fix su `prenotazioni.test.js` — non specificato
se la stessa run ha incluso anche `camere.test.js`.

**Chiusura definitiva stesso giorno**: confermato che la run era la suite
completa. **gestionale-hotel: 34/34 suite, 952/952 test verdi**, fix
cleanup FK applicato, commit `5892dd9` su `main`. **sito-hotel**: nessuna
suite di test in questo repo, commit `a08e842` su `master`. Entrambi
pushati. Nessuna regressione.

### Revisione colori planning-camere — due sistemi separati (23/08/2026)

Discussione con il titolare su 4 pattern UI usati dai competitor PMS
(drawer laterale, posizione fissa bottoni, colori di stato universali,
ricerca CMD+K). Sul punto colori, verifica su Mews/Cloudbeds/StayNTouch
(ricerca web) ha confermato che i PMS leader tengono **due sistemi colore
separati**: stato prenotazione vs. stato pulizia/housekeeping della camera,
mai la stessa palette. Verificato poi nel codice esistente che il
gestionale aveva già in parte questa separazione (la "scopetta" sulla riga
camera è un canale a sé) ma con due bug concreti trovati leggendo
`planning-camere/page.jsx`:
1. `STATI_COLORI` (stato prenotazione) usava blu sia per `confermata` che
   concettualmente in conflitto con la richiesta del titolare di riservare
   il blu a check-out; `interrotta` (prenotazione annullata) non aveva
   affatto una voce — ogni lookup ricadeva su `STATI_COLORI.opzione`
   (fallback), mostrando una prenotazione annullata come "Opzione" ambra
   ovunque comparisse in una lista che non la filtra prima (es. tabella
   ricerca).
2. Dentro `PopupStatoCamera` (il popup che apre la scopetta), "Fermata"
   era verde e "Partenza" era rosso — le stesse identiche tinte usate un
   click prima dalla scopetta per "pulita"/"da pulire", ma con un
   significato completamente diverso (occupazione, non pulizia). Il
   toggle "Pronta" nello stesso popup era blu, diverso ancora dal verde
   della scopetta per lo stesso identico stato.

**Corretto (23/08/2026, in Cowork — non nel tab Code)**:
- `globals.css`: nuovo token `--status-violet-bg`/`--status-violet-text`
  (uniche tonalità libere nella palette esistente).
- `STATI_COLORI` in `planning-camere/page.jsx`: `confermata` → viola
  (era blu), `check_out` → blu (era grigio chiaro, nessun significato),
  aggiunta `interrotta` → rosso (mancava del tutto). `opzione` (ambra) e
  `check_in` (verde) invariati — già coerenti con la richiesta del
  titolare. `chiusa` invariata (grigio scuro neutro, nessuna richiesta
  esplicita su questo stato).
- `PopupStatoCamera`: "Fermata"/"Partenza" → grigio neutro (erano
  verde/rosso, in conflitto con "Pronta"); "Pronta" → verde (era blu),
  ora allineata alla scopetta sulla riga camera. Risultato: nell'intera
  pagina il colore è ora riservato esclusivamente allo stato pulizia in
  questo popup/scopetta, mai riusato per altro.

**Verifica e limiti**: come per le sessioni precedenti da questo ambiente,
solo `esbuild --jsx=automatic` sul file `.jsx` toccato (sintassi/JSX, non
type-checking né logica) — **nessun accesso al database, nessuna
esecuzione della suite Jest, nessuna verifica visiva a schermo**. Marco/
tab Code deve confermare a video che i 6 stati del planning si vedano
come previsto e che la scopetta+popup camera restino leggibili. Non
toccata la pagina `/prenotazioni` (prenotazioni RISTORANTE, non camere —
ha un proprio `STATI_BADGE` indipendente con stati diversi: confermata/
in_attesa/completata/cancellata — verificato che non condivide codice con
`STATI_COLORI` di planning-camere, nessuna modifica necessaria lì).
Ambito volutamente limitato a `/planning-camere`, non propagato ad altre
pagine del gestionale (decisione presa nella stessa sessione, vedi sopra
la discussione sui 4 pattern UI).

**Confermato a video da Marco stesso giorno.**

### Posizione fissa bottoni — pannello dettaglio prenotazione (23/08/2026)

Secondo dei 4 pattern UI discussi. Il pannello dettaglio prenotazione in
`planning-camere/page.jsx` aveva i bottoni di azione dentro il flusso
scrollabile del contenuto, in due punti diversi (riga bottoni modalità
vista, riga bottoni modalità modifica), tutti con lo stesso peso visivo
(`flex-1`), nessuna posizione fissa.

**Fatto (in Cowork, non nel tab Code)**:
- Il pannello (`h-full w-full max-w-md ... overflow-y-auto`) diventa
  `flex flex-col`: solo il corpo (`flex-1 overflow-y-auto`) scorre ora,
  header e footer restano sempre visibili.
- Nuovo footer fisso in fondo al pannello, fuori dall'area scrollabile,
  condiviso tra modalità vista e modalità modifica (prima due gruppi di
  bottoni separati nel contenuto): sinistra = Annulla/distruttivo
  (Annulla prenotazione in vista, Annulla in modifica), destra = azione
  primaria colore brand navy/ambra (Conferma prenotazione / Check-in /
  Check-out / Salva, a seconda dello stato — mai più di una visibile
  insieme, sono stadi mutuamente esclusivi del ciclo vita prenotazione),
  con "Modifica" come bottone secondario subito a sinistra della
  primaria. Nessuna logica di stato toccata, solo dove/come i bottoni
  esistenti vengono renderizzati.

**Non toccato in questo passaggio**: `PannelloCheckOut`,
`ModalAssegnaGruppo`, `ModalDettaglioGruppo` restano con i bottoni nel
vecchio schema — decisione di aspettare l'esito della discussione sui
drawer annidati (vedi sotto) prima di rifare anche il loro footer, per
non toccare due volte lo stesso codice.

**Verifica e limiti**: solo `esbuild --jsx=automatic` (sintassi/JSX),
rilettura manuale della porzione modificata per controllare che apertura/
chiusura dei tag tornasse — **nessuna esecuzione della suite Jest,
nessuna verifica visiva a schermo da questo ambiente**. Marco/tab Code
deve verificare a video che il footer resti leggibile e che tutti gli
stati (opzione/confermata/check-in/check-out/modifica) mostrino il
bottone giusto nel posto giusto.

### Mockup per drawer annidati — in attesa di decisione (23/08/2026)

Terzo pattern (drawer coerenti sui pannelli annidati: assegna gruppo,
dettaglio gruppo, check-out — oggi modal centrati) non ancora deciso.
Marco ha chiesto un mockup prima di scegliere — consegnato come file HTML
a parte (non nel repo, materiale di decisione, non codice), confronto
visivo "come è ora" (modal centrato) vs "come diventerebbe" (drawer da
destra) usando l'esempio "Assegna a un gruppo".

**Deciso da Marco dopo il mockup: sì, convertire.** Fatto nella stessa
sessione (23/08/2026, in Cowork, non nel tab Code):
- `PannelloCheckOut`: da modal centrato a drawer da destra, stesso schema
  del pannello principale (`flex flex-col`, corpo scrollabile, footer
  fisso). "Stampa ricevuta di cortesia" resta nel corpo (azione
  ausiliaria, non primaria/distruttiva); "Conferma check-out"/"Annulla"
  spostati nel footer fisso (primaria a destra, annulla a sinistra) —
  bonus non richiesto esplicitamente ma coerente col secondo pattern
  (posizione fissa bottoni) già fatto sullo stesso file.
- `ModalAssegnaGruppo`: da modal centrato a drawer da destra. Nessun
  footer con azione primaria aggiunto: l'assegnazione avviene cliccando
  direttamente una riga risultato, non c'è un singolo "Conferma" da
  fissare in basso — il mini-form "Nuovo gruppo" interno resta dov'era.
- `ModalDettaglioGruppo`: da modal centrato a drawer da destra. Stesso
  discorso: due form interni indipendenti (pagamento, aggiungi camera),
  ognuno col proprio bottone — nessun footer unico applicabile qui.

**Verifica e limiti**: solo `esbuild --jsx=automatic` sui 3 componenti
(sintassi/JSX), rilettura manuale delle porzioni modificate — **nessuna
suite Jest, nessuna verifica visiva a schermo**. Marco/tab Code deve
controllare a video che i 3 pannelli si aprano coerenti col principale e
che lo stacking (z-50/z-[60], un drawer sopra l'altro se aperti insieme)
resti leggibile.

### CMD+K — ricerca universale (23/08/2026)

Quarto e ultimo pattern discusso. Ambito deciso in chat: ospiti, camere,
prenotazioni (non "fatture", modulo fatturazione non ancora costruito).
Richiedeva backend nuovo — verificato prima di scrivere codice che
`GET /api/ospiti?search=` (query multi-parola nome/cognome,
`anagraficaOspitiController.lista`) e `GET /api/prenotazioni?ricerca=`
(nome ospite o numero camera, `prenotazioniController.lista`) esistevano
già e sono riusabili; `camere` non aveva ricerca (tabella piccola, ~20
righe, ILIKE diretto sufficiente).

**Fatto (in Cowork, non nel tab Code)**:
- `backend/controllers/ricercaController.js` (nuovo) — aggrega ospiti/
  camere/prenotazioni in 3 query parallele (`Promise.all`), limite 5 per
  categoria (è un menu a tendina, non una lista paginata). Nessuna logica
  di ricerca reinventata, stesso pattern ILIKE già in uso altrove.
- `backend/routes/ricerca.js` (nuovo) — `GET /api/ricerca?q=`, permesso
  `richiedeAzione('prenotazioni', 'lettura')` (stessi ruoli di
  `ospiti.lettura` in `shared/ruoli.js`: admin/titolare/receptionist/
  portiere_notte; `camere` non ha un permesso di lettura dedicato, già
  aperta a chiunque autenticato).
- `backend/app.js` — montata `/api/ricerca`.
- `frontend/components/ui/RicercaGlobale.tsx` (nuovo) — palette stile
  Spotlight, componente controllato (stato posseduto da `AppShell`, non
  da sé stesso), tre gruppi di risultati con icona e navigazione: ospite
  → `/clienti/:id`, camera/prenotazione → `/planning-camere?ricerca=...`.
- `frontend/components/layout/AppShell.tsx` — possiede lo stato
  `ricercaAperta`, listener globale `Cmd+K`/`Ctrl+K`/`Escape` su
  `window` (funziona da qualunque pagina, non richiede focus su un
  campo), monta `RicercaGlobale` una sola volta per tutta l'app.
- `frontend/components/layout/Topbar.tsx` — nuovo pulsante-pillola
  centrato ("in alto al centro", richiesta esplicita del titolare),
  posizionato in assoluto per restare centrato rispetto all'intera barra
  indipendentemente da titolo/pulsante azione ai lati.
- `frontend/app/planning-camere/page.jsx` — la griglia leggeva già
  `?gruppo=` da URL ma NON `?ricerca=`: senza questa aggiunta, i
  risultati "camera"/"prenotazione" di CMD+K avrebbero navigato sulla
  pagina senza applicare davvero il filtro. Aggiunto un `useEffect` che
  prefilla `ricercaGriglia` da `searchParams.get('ricerca')` una sola
  volta all'apertura (stesso pattern già in uso per `?gruppo=`).

**Icone verificate prima dell'uso** (non date per scontate): `Search` e
`BedDouble` confermati già in uso in `Sidebar.tsx` in questa esatta
versione di `lucide-react` (`^1.21.0`); `CalendarCheck` NON risultava
usato da nessuna parte nel repo — sostituito con `CalendarDays`
(confermato in uso) per non rischiare un import di un'icona inesistente
in questa versione del pacchetto, non verificabile da questo ambiente
(niente `node_modules` staged, nessun modo di eseguire davvero il build).

**Verifica e limiti**: solo `node -c` (backend) ed `esbuild --jsx=automatic`
(frontend) — sintassi, non type-checking, non logica. **Nessun accesso al
database dal container Cowork: le query SQL nuove in
`ricercaController.js` non sono state eseguite contro Postgres reale**,
solo scritte riusando colonne/pattern verificati leggendo il codice
esistente (`c.attivo`, non `c.attiva` — verificato leggendo
`camereController.js` riga per riga prima di scrivere la query, non
assunto). **Nessuna verifica visiva**: Marco/tab Code deve testare
davvero la ricerca (endpoint + tasto CMD+K + click su un risultato) prima
di considerarla chiusa — è il pattern con più superficie nuova toccata
oggi (nuovo endpoint mai eseguito, mai nessun test scritto per esso).

**Aggiornamento stesso giorno — verifica visiva completata da Marco**: i 4
pattern (drawer principale, posizione bottoni, drawer annidati, CMD+K)
sono stati confermati a video, incluso CMD+K con una ricerca reale
(nome/numero camera cercato ha restituito la riga corretta) — non solo
apertura del pannello. Le query in `ricercaController.js` sono quindi
verificate contro Postgres reale, non più solo sintassi. Stato aggiornato
in `STATO_PROGETTO.md`.

### Riepilogo economico — pagamento misto non segnalato visivamente (23/08/2026)

Segnalato da Marco: quando un ospite paga in parte con una modalità e in
parte con un'altra, il pannello di dettaglio/check-out non lo faceva
notare, mentre la ricevuta di cortesia sì.

**Causa (verificata leggendo il codice, non ipotizzata)**: entrambe le
schermate leggono lo stesso `GET /api/prenotazioni/:id/conto` e lo stesso
array `conto.pagamenti.voci[]` (ognuno con il proprio `.metodo`) — non è
un problema di dati o di backend. La differenza è nella resa:
`ricevuta-cortesia/[id]/page.jsx` elenca ogni voce di pagamento come riga
di tabella sempre visibile; `RiepilogoEconomico` (usata sia nel pannello
dettaglio prenotazione sia in `PannelloCheckOut`) invece riduce tutto a un
unico totale "Già pagato" e nascondeva lo spacchettamento per modalità
dentro un `<details>` chiuso di default ("Dettaglio pagamenti (N)") — bisognava
cliccare per accorgersene.

**Fix in `frontend/app/planning-camere/page.jsx`, componente
`RiepilogoEconomico`**: calcolato `metodiPagamentoDistinti` (set dei
`.metodo` univoci tra i pagamenti registrati). Quando sono più di uno:
accanto a "Già pagato" compare "(misto: contanti + POS)" (o quali che
siano i metodi usati), e il `<details>` "Dettaglio pagamenti" si apre già
espanso invece che chiuso — resta comunque richiudibile, non è diventato
un elemento fisso. Nessuna modifica ai dati né al backend: solo resa.

**Verifica e limiti**: solo `esbuild --jsx=automatic` (sintassi). **Zero
verifica visiva** — da controllare su una prenotazione reale con almeno
due pagamenti di modalità diversa, sia nel pannello dettaglio sia in
`PannelloCheckOut` (stesso componente condiviso, quindi in teoria un solo
punto da controllare copre entrambi, ma non è stato visto a video da
nessuno in questa sessione).

### Design min/max cartellino + planning-tariffe giorno-per-giorno (23/08/2026)

Sessione di sola progettazione (`superpowers:brainstorming`), nessun
codice toccato. Partita dalla domanda di Marco su channel manager/booking
engine dopo il fix del pagamento misto: costruiti e verificati con
Playwright 4 mockup HTML successivi del planning-tariffe giorno-per-giorno
(drag-select, doppio click, drawer bulk-edit, restrizioni min-stay/CTA/
CTD/stop-sell) — consegnati solo via file, mai committati, come da
convenzione mockup. Poi Marco ha posto la domanda architetturale vera: se
i prezzi dei tipi derivati devono restare a percentuale o diventare
liberi, e se serve un "Listino Prezzi" annuale con min/max per rispettare
la normativa Liguria sui cartellini prezzi (incollata testualmente da
Marco: nessun limite legale imposto dalla Regione, solo obbligo di
esposizione + sanzione se si supera il massimo esposto — quindi niente
blocco rigido, solo alert bloccante-superabile).

**Correzione a metà sessione, importante**: la prima proposta di design
(tabelle nuove `trattamenti`/`stagioni_listino`/`listino_prezzi`) è stata
scartata dopo aver letto `frontend/app/tariffe/page.jsx` e i componenti
`SchedaPrezzoTipologia.jsx`/`SchedaTrattamento.jsx` — gran parte di quello
che sembrava da costruire esiste già (periodi stagionali, prezzo diretto
per i tipi madre, percentuale+min/max già presenti su
`regole_derivazione_tariffe` ma usati come clamp silenzioso sul calcolo,
non come alert). Andava verificato subito contro il codice reale invece di
progettare sulla sola conversazione — lezione esplicitamente segnalata a
Marco, non nascosta.

Decisioni architetturali finali, dettaglio completo in
`docs/EVOLUTIVE.md` (voce "Modulo min/max cartellino + planning-tariffe
giorno-per-giorno", 23/08/2026): nessuna pagina nuova, si estende
`/tariffe`; si riusano gli stessi campi min/max già esistenti su
`regole_derivazione_tariffe` ma con alert al posto del clamp silenzioso;
`tariffe` (tipi madre) prende min/max nuovi; il supplemento trattamento
resta invariato (fisso per adulto/bambino, non per tipo camera — un mio
tentativo di renderlo un'entità è stato corretto da Marco come
complessità inutile); min/max di Mezza/Pensione completa si calcola, non
si inserisce; validazione centralizzata lato server dentro i controller
di salvataggio, non solo richiamata dal frontend; `/tariffe` avrà un
quarto redesign (dopo i tre chiusi il 20/08) verso una tabella statica
tipologie×periodi, senza drag — che si scopre essere un'idea dello stesso
Marco già parcheggiata il 20/08/2026, non una richiesta nuova.

**Verifica e limiti**: nessuna — è un documento di decisione
architetturale, non codice. Nessun piano di implementazione scritto.
Prossimo passo, quando Marco vorrà partire: `superpowers:writing-plans`
a partire da questa voce di `docs/EVOLUTIVE.md`, non codice diretto.

### Piano 1 — Min/max cartellino: implementazione (23/08/2026)

Piano scritto con `superpowers:writing-plans`
(`docs/superpowers/plans/2026-08-23-min-max-cartellino.md`, 6 task) a
partire dalla voce di design sopra, poi eseguito nella stessa sessione.
**Non con `superpowers:subagent-driven-development`**: la skill richiede
worktree git + commit per task, incompatibile con la regola di questo
progetto ("mai `git` da Cowork su questo repo, lo fa solo il tab Code
locale") — probabile causa anche di un tentativo fallito in precedenza.
Eseguito invece inline, task per task, nella stessa sessione Cowork, senza
subagent e senza alcun comando `git`.

**Task 1 — migration 052**: `database/migrations/052_min_max_cartellino.sql`
aggiunge `tariffe.prezzo_minimo`/`prezzo_massimo` (NUMERIC(10,2), nullable)
+ vincolo CHECK `chk_tariffe_range`, stesso pattern già in uso su
`regole_derivazione_tariffe` (migration 051). Nessun valore popolato.

**Task 2 — `verificaLimitiListino`**: nuova funzione in
`backend/utils/verificaLimitiListino.js` — dato tipo camera/date/trattamento/
valore, calcola il range `[minimo, massimo]` sommando notte per notte (tipo
"madre" da `tariffe`, tipo "derivato" — dedotto dai dati, mai da un elenco
fisso — da `regole_derivazione_tariffe`) + eventuale supplemento
trattamento (stima con `adulti: 2`, annotata nel codice come da rivedere
se imprecisa in uso reale), e confronta. Parametro `db` opzionale per
essere chiamabile dentro una transazione (`client.query`). Aggiunto anche
`calcolaSupplementoTrattamento` a `module.exports` di `tariffeController.js`
(prima non esportata, necessaria qui).

**Task 3 — `tariffeController` (tipo madre)**: `crea`/`aggiorna` accettano
ora `prezzo_minimo`/`prezzo_massimo`/`confermato` nel body; se il prezzo è
fuori range e non `confermato` → `409 { errore, minimo, massimo, valore }`;
se confermato, salva comunque e registra un evento `override_limite_listino`
in `audit_log` (tabella esistente, migration 012, via `logAudit` — nessuna
tabella nuova). `lista` estesa con le due nuove colonne.

**Task 4 — `tariffa_totale` in prenotazione**: stesso meccanismo (409 +
log override) applicato a `prenotazioniController.crea`/`aggiungiSoggiorno`
(dentro la transazione, con `db: client`) e a `soggiorniController.aggiorna`
(scatta solo se `tariffa_totale` è tra i campi passati — il drag-and-drop
del planning che sposta solo camera/date resta invariato).

**Task 5 — frontend `/tariffe` (tipo madre)**: due nuovi campi "Min
cartellino"/"Max cartellino" in `SchedaPrezzoTipologia.jsx` (ramo madre),
stati `prezzoMinimoMadre`/`prezzoMassimoMadre` per non collidere con gli
omonimi del ramo derivato nello stesso componente. `salvaMadre` ora accetta
`confermato` (default `false`) e gestisce il 409 con `confirm()` + retry.
**Bug trovato e corretto durante l'implementazione, non nel piano**: il
bottone "Salva" chiamava `onClick={isDerivata ? salvaDerivata : salvaMadre}`
— passando la funzione direttamente, il click avrebbe passato l'evento DOM
come primo argomento (`confermato`), sempre truthy: OGNI salvataggio
sarebbe risultato "confermato", annullando l'alert. Corretto in
`onClick={() => (isDerivata ? salvaDerivata() : salvaMadre())}`.

**Task 6 — frontend prenotazioni**: stesso pattern 409+conferma+retry
applicato a tre punti indicati dal piano (`aggiungiCameraGruppo` nel
drawer gruppo esistente, `invia` nel form "Nuova prenotazione",
`aggiungiCameraGruppo` nel wizard "Nuovo gruppo") **più un quarto punto
non elencato dal piano**, trovato leggendo il file per intero come
richiesto dal piano stesso: `aggiungiCameraAllaFamiglia`, che scrive
`tariffa_totale` su `POST /api/prenotazioni/:id/soggiorni` — lo stesso
endpoint toccato dal Task 4. Senza questa aggiunta, aggiungere una camera
a una prenotazione famiglia con tariffa fuori range avrebbe prodotto un
409 non gestito. **Stesso bug del Task 5 trovato in tutti e quattro i
punti** (`onClick={aggiungiCameraGruppo}`, `onClick={invia}`,
`onClick={aggiungiCameraAllaFamiglia}` — funzione passata direttamente,
evento come `confermato`): corretto ovunque con `onClick={() => fn()}`.
Distinzione dal 409 "camera già occupata" (già gestito, invariato) fatta
sulla presenza della chiave `minimo` nel body di risposta (`errore` vs
`error`, forma diversa apposta).

**Verifica e limiti — importante, da fare dal tab Code prima di
considerare il piano chiuso**: da questo ambiente Cowork **nessun accesso
reale a PostgreSQL, nessuna esecuzione reale di Jest, nessun controllo
visivo**. Fatto solo: `node -c` su tutti i file backend modificati/creati,
`esbuild --bundle --jsx=automatic` (con `--external` per i pacchetti non
presenti nell'albero di staging parziale, es. `lucide-react`,
`@dnd-kit/*` — presenti nel repo reale) sui due file frontend. Restano da
fare, in ordine: eseguire la migration 052 su Postgres reale; eseguire
`npx jest` sull'intera suite (non solo i file toccati); provare a video il
flusso 409→conferma→retry su tutti e 4+1 i punti (`/tariffe` tipo madre,
"Nuova prenotazione", "aggiungi camera famiglia", drawer gruppo
esistente, wizard nuovo gruppo), incluso il caso "utente annulla il
confirm" (nessuna richiesta ripetuta, nessun dato perso dal form);
confermare a video che il ramo derivato di `/tariffe` resti invariato,
senza alcun alert (comportamento voluto); confermare che dopo un override
compaia la riga in `audit_log` con `azione = 'override_limite_listino'`.
File consegnati via `SendUserFile` + `device_commit_files`, mai con `git`
da questo ambiente.

### Piano 1 — Min/max cartellino: primo giro di verifica reale dal tab Code (23/08/2026)

Marco ha applicato la migration 052 e lanciato `npx jest --runInBand`
sull'intera suite: **34/35 suite, 963/965 test**. Non una regressione di
codice — un conflitto tra date nella stessa suite `tariffe.test.js`,
causato da me: il nuovo blocco `POST /api/tariffe — min/max cartellino`
creava una tariffa `2092-01-01→2092-01-31`, mentre il test preesistente
"periodo senza tariffa configurata" (nello stesso file, describe
successivo) si aspettava che `2092-01-01→2092-01-03` fosse scoperto per
lo stesso `tipoCameraId` — condiviso tra tutti i test del file via
`beforeAll`. Ho scritto il blocco nuovo senza controllare cosa il resto
del file già occupava in quell'intervallo, violando la convenzione che il
file stesso dichiara in testa ("intervalli di date su anni diversi... per
non sovrapporsi mai per errore"). Fix: le tre date del blocco min/max
spostate su un anno non usato altrove nel file (2095, non un aggiustamento
di pochi giorni dentro il 2092) per non ripetere lo stesso rischio con
un'altra suite in futuro. `node -c` pulito, file consegnato e committato,
verificato ri-scaricandolo dal device dopo il commit.

Nessuna altra parte del piano risulta in dubbio da questo giro — i 963
test verdi includono comportamento invariato su tutte le suite non
toccate. Resta da fare: ri-eseguire `tariffe.test.js` con il fix per
confermare 965/965; il resto della checklist "Verifica e limiti" qui
sopra (video, `audit_log`) è ancora tutto da fare.

### Piano 1 — Min/max cartellino: confermato verde, chiuso (24/08/2026)

Marco conferma dal tab Code: `npx jest --runInBand` con il fix delle date
(2092→2095) tutto verde. Piano 1 chiuso.

### Piano 2 — Griglia statica `/tariffe`: piano scritto ed eseguito (24/08/2026)

Richiesto da Marco subito dopo la chiusura del Piano 1 ("passa al piano
2"). Redesign già deciso dal titolare e parcheggiato il 20/08/2026 (vedi
`docs/EVOLUTIVE.md`): quarto tentativo sulla sezione "Prezzi per
tipologia" di `/tariffe` — da "una scheda alla volta" (fila di chip +
`SchedaPrezzoTipologia` unica visibile) a una tabella statica, righe =
tipi camera, colonne = periodi stagionali + "Tutto l'anno" (solo righe
derivate). Piano scritto con `superpowers:writing-plans`, salvato in
`docs/superpowers/plans/2026-08-24-tariffe-griglia-statica.md`, eseguito
inline in questa sessione (nessun subagent, nessun git, come da
convenzione di progetto).

Due file toccati, nessun file nuovo:

- `frontend/components/tariffe/SchedaPrezzoTipologia.jsx` — aggiunto un
  prop opzionale `periodoIniziale` (`undefined | oggetto periodo |
  'fallback'`), consumato nel `useEffect` di inizializzazione esistente.
  Comportamento di default (prop assente) invariato. Nessuna modifica
  alla logica di salvataggio/eliminazione (`salvaMadre`, `salvaDerivata`,
  gestione 409 min/max del Piano 1).
- `frontend/app/tariffe/page.jsx` — rimosso lo stato `tipoSelezionato` da
  `PaginaTariffe` (non più necessario: la griglia mostra tutte le
  tipologie insieme). `SezionePrezziTipologia` riscritta come tabella
  (righe tipi camera, colonne periodi + "Tutto l'anno"); ogni cella è un
  bottone che apre `ModalPrezzoTipologia` (nuova funzione, stesso file),
  che riusa `SchedaPrezzoTipologia` invariata passandole
  `periodoIniziale` calcolato dalla cella cliccata, con `key` su
  `tipo.id`+`periodoId` per un remount pulito ad ogni cella diversa.
  Righe madre: colonna "Tutto l'anno" mostra `—`, non cliccabile (i tipi
  madre non hanno concetto di fallback). `SchedaTrattamento.jsx` e
  `ChipPeriodi.jsx` non toccati, restano invariati.

Verifica fatta da questa sandbox: `npx esbuild --bundle --jsx=automatic`
su entrambi i file (`--external:react/react-dom/next/navigation/
lucide-react`, `--external:@/*` per gli alias Next), exit 0 su entrambi,
nessun errore di sintassi o di risoluzione import. **Nessuna build Next
reale, nessuna esecuzione Jest (non esiste un file `*.test.jsx` in questo
repo — nessun test frontend da eseguire), nessun controllo visivo:**
nessuno dei tre è possibile da questa sandbox. Prima verifica visiva reale
resta da fare da Marco dal tab Code.

### Piano 3 — Planning tariffe giorno-per-giorno: piano scritto ed eseguito (24/08/2026)

Richiesto da Marco subito dopo il Piano 2 ("procedi con tutti i task del 3"
— confermato che il Piano 2 fosse già eseguito prima di partire). Feature
INTERAMENTE NUOVA (non un redesign): una griglia editabile giorno per
giorno — prezzo e restrizioni (min stay, CTA/chiusa arrivo, CTD/chiusa
partenza, stop-sell) per tipo camera e trattamento — su una nuova pagina
`/planning-tariffe`. Design architetturale già deciso il 23/08/2026 (vedi
`docs/EVOLUTIVE.md`), piano scritto con `superpowers:writing-plans` in
`docs/superpowers/plans/2026-08-24-planning-tariffe-giorno-per-giorno.md`,
eseguito inline (nessun subagent, nessun git).

**Scoperta importante durante la scrittura del piano**: i 4 mockup HTML
citati in `EVOLUTIVE.md` ("consegnati solo via file, mai committati")
erano in realtà ancora presenti nella working copy locale del titolare
(`mockup_matrice_tariffe_{drag,v2,v3,v4}.html`, root del repo, non in
git). Letto per intero `mockup_matrice_tariffe_v4.html` (l'ultimo per data
di modifica, con una nota interna che documenta un giro di feedback già
incorporato) come riferimento reale per l'interazione, invece di
affidarmi solo alla sintesi testuale di EVOLUTIVE.md. Differenza
importante emersa dal mockup e non dalla sintesi: prezzo E restrizioni
sono per TRATTAMENTO (Solo pernottamento/Mezza pensione/Pensione
completa), non solo per camera — la chiave della nuova tabella riflette
questo (`tipo_camera_id + trattamento + data`).

**Scope deliberatamente tagliato**, dichiarato nel piano prima di
eseguire: (1) integrazione con il motore di calcolo prezzi reale
(`calcolaTariffaPerTrattamenti`, usato dal booking engine e dal form
prenotazione) — il planning resta per ora un pannello autonomo, non
ancora la fonte di verità del prezzo mostrato a un ospite reale; (2)
wiring delle restrizioni nella disponibilità reale delle prenotazioni;
(3) riga "Disponibilità" del mockup; (4) pulsante "applica a
riga/colonna". Tutti e quattro rimandati a un piano separato — toccano
percorsi di prezzo/disponibilità reali, meritano più tempo di verifica di
quanto questa sessione potesse dare.

Task eseguiti:
- **Backend (additivo, nessun file esistente modificato a parte
  `app.js`)**: migration `053_planning_tariffe_giorni.sql` (tabella
  `tipo_camera_id+trattamento+data`, indice unico); nuovo
  `backend/controllers/planningTariffeController.js` (`griglia` — merge
  override + calcolo "consigliato" da `calcolaPrezzoCameraPerNotte`/
  `calcolaSupplementoTrattamento`, invariati; `aggiorna` — upsert bulk su
  un intervallo di giorni, riusa `verificaLimitiListino` del Piano 1 per
  l'alert bloccante-superabile, 409 con l'elenco di TUTTI i giorni fuori
  range non solo il primo); nuova `backend/routes/planningTariffe.js`
  (stessa sezione permesso `'tariffe'` di `/api/tariffe`); registrata in
  `app.js`.
- **Frontend**: nuova pagina `frontend/app/planning-tariffe/page.jsx` — un
  tipo camera alla volta (selettore), colonne = giorni (14gg/mese,
  navigazione avanti/indietro), righe prezzo+restrizioni per trattamento;
  doppio click su una cella prezzo = edit inline; click singolo su una
  cella restrizioni = popover del giorno; trascinamento (pointerdown/
  pointerenter/pointerup) su una riga = selezione multipla → drawer con
  trattamento/campo multi-selezionabili e range di date, bulk-edit in una
  sola conferma. Interazione tradotta da JS vanilla (mockup) a React
  (hook `useState`/`useEffect`), stesso pattern alert 409→confirm→retry
  già usato nei Piani 1-2. Voce di navigazione aggiunta in
  `frontend/components/layout/Sidebar.tsx` (trovata via `grep`, non nota
  a priori in questa sessione), accanto a "Tariffe", stessi ruoli di
  lettura.

Verifica: `node -c` pulito su tutti i file backend; `npx esbuild --bundle`
pulito (exit 0) su `page.jsx` e su `Sidebar.tsx` (`--loader:.tsx=tsx`).
Un bug reale trovato e corretto durante la scrittura (non dopo): la riga
prezzo e la riga restrizioni per trattamento erano racchiuse in un
frammento JSX abbreviato (`<>...</>`) dentro una `.map` — i frammenti
abbreviati non accettano `key`, necessaria lì essendo l'elemento radice
di ogni iterazione; corretto con `<Fragment key={tr.id}>` esplicito
(`import { Fragment } from 'react'`). **Nessun accesso a Postgres,
nessuna build Next reale, nessuna esecuzione Jest (nessun test frontend
esiste in questo repo), zero verifica visiva/interattiva del
drag-select/drawer — quello richiede un vero browser**, non disponibile
da questa sandbox. Prima verifica reale (migration + video) resta
interamente da fare da Marco dal tab Code.

### Piano 3 — tre fix dopo la prima verifica a video (24/08/2026)

Marco ha applicato la migration 053, la suite Jest è verde, e alla prima
apertura a video ha segnalato 3 problemi in un unico messaggio.

**Fix 1 — bug reale, bloccante, in codice scritto in questa sessione.**
`/planning-tariffe` mostrava a video l'errore grezzo del backend
"tipo_camera_id, data_da e data_a sono obbligatori", nessuna griglia
visualizzata. Causa: `caricaGriglia` in
`frontend/app/planning-tariffe/page.jsx` chiamava
`api.get('/planning-tariffe/griglia', { params: {...} })` assumendo una
firma stile axios — ma `frontend/lib/api.js` (letto per intero per
confermare, non per ipotesi) ha `get: (path, headers = {}) => ...`: il
secondo argomento sono HEADER letti alla lettera, mai una query string.
`{params:{...}}` finiva spalmato (innocuo) negli header HTTP, la query
string non partiva mai → i tre parametri arrivavano `undefined` al
controller, che rispondeva esattamente il 400 osservato. Confermato anche
grep sul resto del frontend: **nessun altro punto del codice usa
`{params}`** — il pattern reale, usato ovunque (es.
`/prenotazioni/griglia` in `planning-camere/page.jsx`), è costruire la
query string a mano nel template literal dell'URL. Corretto con
`new URLSearchParams({...}).toString()` appeso all'URL, stesso pattern.
Verificato con `esbuild --bundle --jsx=automatic`.

**Fix 2 — richiesta UX su `/tariffe` (Piano 2).** Sotto il nome di ogni
periodo, nell'intestazione colonna della griglia "Prezzi per tipologia"
(`SezionePrezziTipologia` in `frontend/app/tariffe/page.jsx`), aggiunto
l'intervallo `data_inizio → data_fine` del periodo, per capire a vista
quali date copre ogni colonna. Nessuna logica toccata, solo markup nel
`<th>`. Verificato con `esbuild --bundle`.

**Fix 3 — regressione layout su `/planning-camere`, esplicitamente
segnalata da Marco come NON collegata al lavoro di questa sessione.** Il
pulsante "Nuova prenotazione" nella toolbar tornava a capo, nonostante un
restringimento del campo ricerca camera fatto in precedenza dal tab Code
proprio per tenere tutto sulla stessa riga. La toolbar (righe ~4155-4298)
ha, quando `vista === 'griglia'`, TRE gruppi affiancati dentro un
contenitore `flex justify-between flex-wrap`: (1) toggle Griglia/Elenco +
toggle 7gg/14gg/Mese + campo ricerca, (2) navigazione mese/date, (3)
Esporta + Nuova prenotazione + Nuovo gruppo — molto contenuto per una
riga sola, per costruzione. Applicato lo stesso tipo di intervento già
fatto in precedenza dal titolare (restringere ulteriormente, non
riprogettare): campo ricerca `w-40`→`w-28`, gap del contenitore esterno e
del primo gruppo `gap-2`→`gap-1.5`. **Questo fix NON è verificabile da
qui in alcun modo**: nessun accesso a un browser reale, quindi nessuna
misura della larghezza finestra di Marco né conferma che il risparmio di
spazio applicato sia sufficiente — solo `esbuild --bundle` per
escludere errori di sintassi. Se continua ad andare a capo, serve sapere
la larghezza finestra/zoom usati per calibrare con un valore preciso
invece di un altro tentativo alla cieca.

Consegna: `frontend/app/planning-tariffe/page.jsx`,
`frontend/app/tariffe/page.jsx`, `frontend/app/planning-camere/page.jsx`
inviati con `SendUserFile` e scritti sul dispositivo di Marco con
`device_commit_files` in un unico blocco.

### Piano 3 — secondo bug reale, 500 su GET griglia (24/08/2026, stesso giorno)

Corretto il bug 1 sopra (query string ora parte), Marco riapre
`/planning-tariffe` e stavolta prende un errore diverso: "errore
interno" — il backend risponde 500 dal `catch` di
`planningTariffeController.griglia`. Il fix precedente aveva solo
sbloccato la richiesta perché arrivasse al controller: la richiesta ora
arriva, ma il controller stesso non aveva mai girato realmente contro il
DB in nessuna sessione precedente (era mascherato dal bug 1 fin dalla
scrittura). Trovato leggendo, non ipotizzando: `planningTariffeController.js`
fa `const { calcolaPrezzoCameraPerNotte, calcolaSupplementoTrattamento } =
require('./tariffeController')`, ma la riga `module.exports` in fondo a
`tariffeController.js` (riga 434) esportava solo `{ lista, calcola,
calcolaTariffa, calcolaTariffaPerTrattamenti, calcolaSupplementoTrattamento,
crea, aggiorna, elimina }` — **`calcolaPrezzoCameraPerNotte` non era in
elenco**, nonostante sia una funzione reale definita nello stesso file
(riga 77, usata internamente da `calcolaTariffaPerTrattamenti`). La
destrutturazione la importava quindi come `undefined`; la prima chiamata
in `griglia()` (`calcolaPrezzoCameraPerNotte(tipo_camera_id, data_da,
dataFineEsclusiva)`) lanciava un `TypeError: ... is not a function`,
catturato dal try/catch del controller → 500 `{errore: 'Errore
interno'}`, esattamente il testo visto da Marco.

Fix: aggiunta `calcolaPrezzoCameraPerNotte` all'elenco di
`module.exports` in `backend/controllers/tariffeController.js` — una
riga, nessuna logica toccata, nessun altro export modificato. Verificato
con `node -c` (pulito). **Nessun accesso a Postgres da qui**: non posso
confermare che il resto di `griglia()` (query di merge override, calcolo
supplemento per trattamento notte per notte) giri senza altri errori una
volta risolto questo — solo lettura statica del codice contro le firme
reali delle funzioni chiamate, nessun errore di forma/parametri trovato
in quella lettura. Prima vera esecuzione resta da fare da Marco.

Consegna: `backend/controllers/tariffeController.js` inviato con
`SendUserFile` e scritto sul dispositivo con `device_commit_files`.

### Piano 3 — riscrittura per aderenza al mockup, 6 punti (24/08/2026, stesso giorno)

Risolti i due bug precedenti, Marco vede finalmente la griglia a video e
respinge l'impostazione: "non è venuto come nel mockup". Feedback in 6
punti, tutti relativi a una scelta strutturale mia (non un bug):
l'implementazione originale mostrava una tipologia alla volta (fila di
pulsanti tipo-camera in alto, una griglia sotto), uno scope-cut esplicito
del piano originale per ridurre il lavoro. Il mockup di riferimento
(`mockup_matrice_tariffe_v4.html`) mostra invece tutte le tipologie
impilate in un'unica schermata, tipologia → trattamento → riga valori,
proprio per evitare — parole di Marco — "almeno 6 click per gestire tutte
le tariffe di un periodo". Riletto il mockup per intero una seconda volta
(747 righe) come riferimento vincolante e riscritta la pagina da zero:

1. **Sigla giorno settimana**: aggiunta riga `Lun/Mar/.../Dom` sopra la
   data in ogni colonna, con evidenziazione weekend (`siglaGiorno`/
   `weekend`/`indiceGiorno` su `GIORNI_LABEL`).
2. **Restrizioni tagliate fuori**: causa reale trovata, non solo
   ipotizzata — il popover restrizioni usava `position:absolute` dentro
   un contenitore `overflow-x-auto`, che lo ritaglia quando sborda oltre
   il bordo. Corretto con `position:fixed` + coordinate calcolate da
   `getBoundingClientRect()` al click, che escono dal clipping
   dell'antenato (nessun antenato in questa pagina imposta `transform`/
   `filter`/`will-change`, che romperebbero questo trucco). Risolto
   insieme il vero problema strutturale: layout riscritto a tipologia in
   colonna (impilata), sotto trattamento, sotto riga valori — via
   `Fragment` con `key` esplicita per riga tipologia/trattamento —
   invece di un pulsante per tipo camera che restringeva la tabella.
3. **Min stay non valorizzato**: lettura statica del codice, prima e dopo
   la riscrittura — la logica di lettura/scrittura di `min_stay` è
   identica. **[Probabile]**, non **[Certo]**: possibile che fosse un
   sintomo dello stesso clipping del punto 2 (popover tagliato = campo
   sembrava vuoto senza esserlo). Corretto dallo stesso fix del punto 2.
   Se ricompare dopo aver verificato a video, serve isolare una causa
   distinta con un test mirato — non presumere risolto solo perché il
   codice sembra corretto.
4. **Propagazione orizzontale/verticale sparita**: reintrodotta come menu
   ⚡ per riga (`menuPropaga` state, `propagaRiga`/`propagaColonna`),
   con `ultimaModifica` per tenere traccia dell'ultimo valore modificato
   da propagare.
5. **Tasto modifica multiplo sparito**: reintrodotto pulsante "✎
   Modifica" in toolbar (`apriDrawerVuoto`), drawer esteso con
   selezione multipla tipologia (`drawerForm.tipologie: Set`, prima solo
   trattamenti) — `applicaDrawer` ora itera il prodotto cartesiano
   tipologie × trattamenti selezionati.
6. **Freccine collassa camere/trattamenti**: reintrodotte come richiesto
   (`collassatiTipologia`/`collassatiTrattamento`, righe header con
   chevron e `colSpan` sull'intera larghezza griglia) — Marco conferma
   che senza il redesign a schermata unica non servirebbero più, ma le
   vuole comunque per chi preferisce comprimere.

Introdotto anche un helper condiviso `salvaConConferma(body,
messaggioConferma)` per centralizzare il pattern di conferma 409 "prezzo
fuori dal cartellino" (riuso di `verificaLimitiListino`, Piano 1) su
edit singola cella, propagazione riga/colonna e drawer bulk-edit — prima
duplicato in più punti.

Verificato con `esbuild --bundle --jsx=automatic` (output 46.3kb,
pulito). **Nessun accesso a Postgres, nessuna build Next reale, zero
verifica visiva da qui** — questa riscrittura è strutturalmente più
grande delle precedenti e non ha ancora avuto un solo giro di verifica a
video: da fare dal tab Code, con particolare attenzione a (a) che il
popover restrizioni non sia più tagliato in nessuna posizione di scroll
orizzontale, (b) che min stay si valorizzi davvero (punto 3, diagnosi
solo probabile), (c) che propagazione e drawer bulk-edit producano le
stesse chiamate PATCH di prima (nessuna logica di salvataggio è stata
toccata, solo la UI che le richiama).

Consegna: `frontend/app/planning-tariffe/page.jsx` (riscrittura
completa) inviato con `SendUserFile` e scritto sul dispositivo con
`device_commit_files`.

### Piano 3 — 5 piccoli dettagli dopo la riscrittura (24/08/2026, stesso giorno)

Marco conferma la riscrittura ("ora ci siamo") e chiede 5 rifiniture su
`/planning-tariffe`:

1. **Colore restrizioni**: i badge min-stay/CTA/CTD nella cella
   "Restrizioni" erano tutti in grigio uniforme, mentre la legenda sotto
   la griglia usa già 3 colori distinti. Sostituito lo `<span>` singolo
   grigio con 3 badge indipendenti (uno per campo valorizzato), stessi
   valori `background`/`color` già usati nella legenda: blu
   (`var(--status-blue-bg)`/`var(--status-blue-text)`) per min-stay,
   ambra (`var(--hotel-amber-light)`/`var(--hotel-amber-dark)`) per CTA,
   viola (`#F1EAFB`/`#6B3FA0`) per CTD — nessun nuovo valore di colore
   inventato.
2. **Ordine tipologie**: richiesto l'ordine Matrimoniale, Matrimoniale
   uso singola, Tripla, Quadrupla, Doppia uso singola, Singola. **[Ipotesi]**
   su un punto: la migration `048_consolida_matrimoniale_piccola.sql` ha
   consolidato le identità storiche "Singola" e "Doppia uso singola"
   (stesse camere fisiche 2/7/12/21) in UNA sola riga `tipi_camera`
   sopravvissuta e **rinominata "Matrimoniale Piccola"**, con l'altra
   disattivata (`attivo = false`, mai cancellata). Da questo sandbox non
   posso verificare contro il DB reale se oggi "Singola" e "Doppia uso
   singola" esistano ancora come due tipi attivi distinti o se uno dei
   due nomi che Marco usa corrisponda invece a "Matrimoniale Piccola".
   Per non rischiare di far sparire una tipologia dalla vista in base a
   un'ipotesi sbagliata, ho implementato l'ordinamento in modo
   **fail-safe**: `ORDINE_TIPOLOGIE` è un elenco di alias per ogni
   posizione (case-insensitive), `prioritaTipologia(nome)` restituisce la
   posizione se il nome corrisponde a uno degli alias attesi, altrimenti
   una priorità "in fondo" — l'ordinamento (`Array.prototype.sort`,
   stabile da ES2019) non nasconde né fa crashare nulla: una tipologia
   con un nome che non riconosco resta visibile, solo in coda anziché
   nella posizione voluta. Se dopo la verifica a video l'ordine non è
   quello giusto, è questa mappatura nomi→posizione da correggere, non la
   logica di ordinamento.
3. **Etichetta trattamento**: `"Solo pernottamento"` → `"Camera e
   colazione"` nell'array `TRATTAMENTI` (markup/testo, nessun impatto sul
   valore salvato in DB, che resta `'bb'`).
4. **Frecce scorrimento vista Mese**: aggiunte due frecce (‹ ›) ai lati
   della griglia che scorrono orizzontalmente il contenitore già
   caricato di 15 colonne per click (`contenitoreGrigliaRef` +
   `scorriGiorni(direzione)`, `scrollBy({left, behavior:'smooth'})`,
   larghezza colonna letta a runtime da `getBoundingClientRect()` sulla
   seconda `<th>` dell'header). **Distinte apposta** dai pulsanti ‹/›
   della toolbar in alto, che invece cambiano l'intervallo date caricato
   e rifanno la fetch dal backend — le nuove frecce non toccano i dati,
   solo lo scroll di ciò che è già a schermo, coerente con quanto detto
   da Marco ("le date non ci stanno tutte, normale").

Verificato con `esbuild --bundle --jsx=automatic` (output 49.8kb,
pulito). **Nessun accesso a Postgres, nessuna build Next reale, zero
verifica visiva da qui** — in particolare il punto 2 (ordine tipologie)
va confermato a video con priorità, essendo basato su un'ipotesi non
verificabile da questo sandbox sullo stato reale delle righe `tipi_camera`
in produzione.

Consegna: `frontend/app/planning-tariffe/page.jsx` inviato con
`SendUserFile` e scritto sul dispositivo con `device_commit_files`.

### Piano 1/2 — bug reale in /tariffe, popup "undefined€" a loop infinito (24/08/2026, stesso giorno)

Marco segnala su `/tariffe` (griglia statica del Piano 2, non
planning-tariffe): qualsiasi prezzo provi a valorizzare, parte il popup
"Il prezzo undefined€ esce dal range dichiarato (—–—€). Confermi
comunque?", cliccare OK non risolve nulla e il popup ritorna.

**Bug reale, confermato leggendo il codice, non ipotizzato**: in
`frontend/components/tariffe/SchedaPrezzoTipologia.jsx`, `salvaMadre`
intercettava QUALSIASI errore 409 da `/api/tariffe` come se fosse la
violazione min/max cartellino (Piano 1), destrutturando
`{minimo, massimo, valore}` dalla risposta senza controllare che la
risposta contenesse davvero quei campi. Ma `/api/tariffe` risponde 409
per DUE motivi distinti (`backend/controllers/tariffeController.js`,
funzioni `crea`/`aggiorna`): (1) violazione min/max cartellino — corpo
`{errore, minimo, massimo, valore}`; (2) vincolo di esclusione Postgres
sulla sovrapposizione date di due fasce tariffarie per lo stesso tipo
camera (`23P01`, riga 355/413) — corpo `{error: 'Le date si
sovrappongono a una fascia tariffaria già esistente per questo tipo
camera.'}`, senza `minimo`/`massimo`/`valore`. Nel secondo caso i tre
campi destrutturati erano tutti `undefined` → esattamente "Il prezzo
undefined€... (—–—€)" visto da Marco. E il loop: `confermato: true`
sblocca solo il controllo min/max lato backend (riga 334/381 di
`tariffeController.js`), non il vincolo di sovrapposizione date — quindi
il secondo tentativo falliva allo stesso modo, stesso ramo di codice,
stesso popup, all'infinito.

Lo stesso guardrail mancante qui è già presente e corretto in 4 punti di
`frontend/app/planning-camere/page.jsx` (`err.response?.status === 409
&& err.response?.data?.minimo !== undefined`), introdotto quando quel
file gestisce lo stesso tipo di 409 min/max insieme ad altri 409 diversi
(camera già occupata). `SchedaPrezzoTipologia.jsx` non aveva mai
adottato lo stesso controllo, e il Piano 2 (riuso dichiarato di questo
componente "senza modificarne la logica di salvataggio") lo ha solo reso
più facile da far scattare, non lo ha introdotto.

Fix: aggiunto lo stesso guardrail — il ramo "min/max, popup di conferma"
scatta solo se `err.response.data.minimo !== undefined`; qualsiasi altro
409 (incluso il vero conflitto di sovrapposizione date) ora passa a
`onErrore(err.message || ...)`, che mostra il messaggio VERO del backend
nel banner rosso in cima alla pagina invece del popup rotto.

**Cosa NON ho potuto verificare da qui**: se la causa di fondo del 409
che Marco incontra sia davvero un conflitto di date (non ho accesso a
Postgres per controllare le fasce `tariffe` esistenti). **[Probabile]**:
è compatibile con l'architettura — `periodi_stagionali` ha un vincolo
`EXCLUDE` che impedisce a due periodi di sovrapporsi tra loro (migration
051), quindi non possono essere i periodi nuovi a scontrarsi; ma le
fasce `tariffe` inserite PRIMA che esistessero i periodi (commento
esplicito in migration 051: "le tariffe già inserite restano valide con
le loro date dirette") possono avere date arbitrarie non allineate ai
periodi, e collidere quando si prova a impostare per la prima volta un
prezzo su un periodo nuovo. Col fix sopra, ora che il messaggio vero
comparirà nel banner rosso invece del popup rotto, la vera causa sarà
visibile a Marco al primo tentativo — se è davvero questo, la fascia
madre in conflitto va individuata ed eventualmente aggiornata/rimossa
dal tab Code (accesso DB reale).

Verificato con `esbuild --bundle --jsx=automatic` (22.7kb, pulito).

Consegna: `frontend/components/tariffe/SchedaPrezzoTipologia.jsx`
inviato con `SendUserFile` e scritto sul dispositivo con
`device_commit_files`.

### Piano 3 — freccine vista Mese non visibili, nessun difetto trovato nel codice (24/08/2026, stesso giorno)

Marco segnala anche: "non ci sono le freccine nel cambio di vista
mensile" su `/planning-tariffe`. Riletto `frontend/app/
planning-tariffe/page.jsx` sul dispositivo (ri-staged per essere sicuro
di leggere la versione consegnata, non una cache locale) — il markup
delle due frecce (righe ~446-461) è presente e NON è condizionato al
modo 14gg/Mese: è nello stesso blocco che renderizza la tabella in
entrambi i casi, quindi dovrebbe comparire identico nelle due viste, non
solo in una. Controllato anche il layout di `AppShell.tsx`: il `<main>`
ha `overflow-y-auto` (che per specifica CSS forza anche `overflow-x` a
`auto`, non `visible`) ma le frecce sono dentro il padding dell'area
principale (`p-4`/`md:p-6`, 16-24px), ben oltre il loro offset di soli
`-4px` — non dovrebbero uscirne. **Nessun difetto individuato nel
codice da qui**: la spiegazione più probabile **[Probabile, non
verificabile da questo sandbox]** è una build/cache non aggiornata lato
Marco (Next.js in sviluppo, più file riscritti in rapida sequenza in
questa sessione) — da provare con un refresh forzato del browser
(Ctrl+Shift+R) o un riavvio del server di sviluppo prima di considerarlo
un bug di codice. Nessuna modifica fatta a questo file in questo
passaggio.

### Piano 4 — sincronizzazione booking engine ↔ planning-tariffe + fix isolamento tipi camera in disponibilita() (24/08/2026, stesso giorno)

Marco, dopo aver risolto un problema separato (variabile d'ambiente
`NEXT_PUBLIC_BOOKING_ENGINE` non impostata su Vercel, causa per cui il
tasto "Prenota" del sito puntava ancora al vecchio widget TeamSystem —
risolto lato Vercel, nessun codice toccato): "i prezzi delle camere in
vendita sono a caso così come i trattamenti selezionabili... c'è da
sincronizzare questi dati con il planning tariffe per prezzi/trattamenti;
e capire dove leggere la disponibilità".

**Disponibilità**: verificata, già reale — `bookingPubblicoController.
disponibilita()`/`prenota()` interrogano `camere`/`tipi_camera_camere`/
`soggiorni` con overlap di date reale (`daterange && daterange`,
`cancellato = false`), stesso meccanismo anti-overbooking del resto del
gestionale. Non c'entra `planning_tariffe_giorni` (quella tabella non ha
dati di occupazione, solo prezzo/restrizioni). Nessuna modifica qui.

**Prezzi**: confermato leggendo il codice che `disponibilita()`/
`prenota()` calcolavano il prezzo con `calcolaTariffaPerTrattamenti`/
`calcolaTariffa` (`tariffeController.js`), lo stesso motore di `/tariffe`
— MAI `planning_tariffe_giorni`. Era uno scope-cut dichiarato nel commento
di apertura di `planningTariffeController.js` e nella voce Piano 3 di
questo diario/STATO_PROGETTO.md: "questa griglia NON è ancora letta dal
motore di calcolo reale delle prenotazioni... rimandata a un piano
separato, deliberatamente". Marco ha chiesto di chiuderlo oggi stesso.

**Bug correlato, più urgente della sincronizzazione**: `disponibilita()`
avvolge il calcolo prezzo di TUTTI i tipi camera trovati in un solo
`Promise.all` dentro un unico blocco try/catch (righe 73-134 prima del
fix). Se anche un solo tipo camera lancia l'eccezione anti-loop già vista
nel Piano 2 di oggi (derivazione a più livelli, caso reale: Quadrupla←
Tripla, segnalato da Marco e MAI corretto nel DB — nessun accesso Postgres
da questo sandbox per farlo), l'intero `Promise.all` va in reject e
l'INTERA ricerca disponibilità del sito risponde 500 "Errore interno", per
qualunque data, non solo il prezzo di quel tipo camera. Corretto isolando
ogni tipo camera nel proprio try/catch: un tipo rotto viene escluso dai
risultati con un log server-side, il resto della ricerca funziona.
**Resta comunque necessario che Marco corregga la riga Quadrupla←Tripla
dal tab Code — questo fix limita il danno, non risolve la causa.**

**Fix implementato — sincronizzazione**: nuove funzioni in
`backend/controllers/planningTariffeController.js`:
- `calcolaTariffaPerTrattamentiConPlanning(tipoCameraId, dataArrivo,
  dataPartenza, trattamenti, opzioni)` — stessa firma/shape di ritorno di
  `calcolaTariffaPerTrattamenti`, ma per ogni notte controlla prima un
  override in `planning_tariffe_giorni` (chiave trattamento+data) e ricade
  sul motore calcolato (`calcolaPrezzoCameraPerNotte` +
  `calcolaSupplementoTrattamento`, con gli adulti/bambini REALI della
  richiesta, non il 2/[] fisso usato dal "prezzo consigliato" di
  `griglia()`) solo per le notti senza override. Include anche
  `valutaRestrizioniTrattamento`, che applica min_stay/chiuso_arrivo (sulla
  prima notte)/chiuso_partenza (sull'ultima notte)/stop_sell (su qualunque
  notte) — **[Ipotesi, da riconfermare col titolare]**: convenzione scelta
  qui perché lo schema non definisce esplicitamente su quale notte
  verificare ciascuna restrizione, la prima volta che Marco imposta una di
  queste su date realmente prenotabili va controllato che il comportamento
  corrisponda a quello che si aspetta.
- `calcolaTariffaConPlanning(...)` — equivalente a `calcolaTariffa` (un
  solo trattamento), usata da `prenota()`.
- Deliberatamente NON riusata la logica di `griglia()` (che pure fa un
  merge simile) — `griglia()` lavora su un range inclusivo/inclusivo per
  la UI di pianificazione e non deve dipendere dal percorso di prenotazione
  live, né viceversa: un bug in uno dei due non deve poter rompere l'altro.

`backend/controllers/bookingPubblicoController.js`: `disponibilita()` e
`prenota()` ora chiamano le nuove funzioni invece del motore "nudo"
(import di `calcolaTariffa`/`calcolaTariffaPerTrattamenti` da
`tariffeController.js` rimosso, sostituito con l'import dalle due nuove
funzioni). `disponibilita()` restituisce anche `motivi_non_disponibile`
(testo del motivo quando un trattamento è bloccato da una restrizione,
non solo da un prezzo mancante). `prenota()` ora rifiuta con 409 e il
motivo specifico se la combinazione data/trattamento viola una
restrizione — prima non veniva MAI controllato, un ospite poteva
prenotare anche in violazione di un minimo notti o una chiusura
arrivo/partenza impostati dal titolare in planning-tariffe.

`sito-hotel/components/booking/BookingWidget.tsx`: aggiunto campo
opzionale `motivi_non_disponibile` al tipo `TipoCameraDisponibile`,
mostrato al posto del messaggio generico "non disponibile" nel selettore
trattamento quando presente. Testo in italiano non tradotto per le altre
3 lingue del sito (EN/DE/FR) — stesso limite già presente per tutti gli
altri messaggi di errore di questo widget (`body.error` mostrato
direttamente, mai passato da next-intl), non una regressione introdotta
qui, ma segnalato perché su un sito multilingua un ospite straniero vedrà
comunque il motivo in italiano.

**Cosa NON ho potuto verificare da qui**: nessun accesso a Postgres,
nessuna query reale eseguita, nessuna esecuzione della suite
`bookingPubblico.test.js` (mai stata eseguita nemmeno prima di questo
cambio, per come risulta da STATO_PROGETTO.md riga 4.1), nessuna verifica
end-to-end del flusso `/prenota` → Stripe. **Il titolare non ha voluto un
piano scritto preventivo per questo intervento** (deciso esplicitamente
in chat, nonostante il dissenso espresso: tocca un percorso di pagamento
Stripe reale su 2 repository) — l'assenza di piano scritto formale è una
scelta sua, documentata qui per completezza.

Verificato con `node -c` su entrambi i file backend ed `esbuild --bundle
--jsx=automatic` sul file frontend (79.5kb, pulito, con gli `--external`
necessari per gli alias `@/lib/*` e i moduli next/next-intl/next-sanity).

Consegna: `backend/controllers/planningTariffeController.js`,
`backend/controllers/bookingPubblicoController.js` (questo repo) e
`sito-hotel/components/booking/BookingWidget.tsx` inviati con
`SendUserFile` e scritti sul dispositivo con `device_commit_files`.

### Piano 4bis — override planning-tariffe su un tipo madre non arrivava ai tipi derivati (24/08/2026, stesso giorno, poche ore dopo la consegna del Piano 4)

Marco riprova il booking engine su 28-29 agosto dopo aver corretto lui
stesso la riga Quadrupla←Tripla nel DB (tab Code): "Prezzo Matrimoniale è
corretto, 150€... tripla dice da 195€, quadrupla da 180€, già così non ha
senso... se clicco su matrimoniale, è selezionabile solo b&b e non gli
altri trattamenti — stessa cosa per tutte le altre tipologie".

**Bug reale #1, confermato leggendo il codice, non ipotizzato**: la
funzione consegnata nel Piano 4
(`calcolaTariffaPerTrattamentiConPlanning`) controllava un override
planning-tariffe solo per il tipo camera RICHIESTO. Per calcolare il
prezzo "camera" di fallback (usato quando quel tipo/trattamento/notte non
ha un override proprio) chiamava però `calcolaPrezzoCameraPerNotte`
"nuda" di `tariffeController.js` — che per un tipo DERIVATO (Tripla,
Quadrupla) risolve il prezzo del tipo BASE sempre e solo da
`calcolaPrezzoDirettoPerNotte` (`backend/controllers/tariffeController.js`
righe 49-58: `LEFT JOIN tariffe t ON t.tipo_camera_id = $1...`, nessun
riferimento a `planning_tariffe_giorni`). Risultato: l'override 150€ che
Marco ha impostato su Matrimoniale in planning-tariffe cambia il prezzo
mostrato SOLO se si cerca Matrimoniale direttamente — Tripla e Quadrupla,
che derivano da Matrimoniale per percentuale, continuavano a calcolare la
propria base dal vecchio prezzo diretto in tabella `tariffe`, mai
aggiornato. Esattamente il gap che il Piano 4 avrebbe dovuto chiudere e
non ha chiuso — non l'avevo previsto quando ho scritto la funzione.

Fix: nuove funzioni in `backend/controllers/planningTariffeController.js`,
`prezzoBasePerNotteConPlanning` e `calcolaPrezzoCameraPerNotteConPlanning`
— stessa logica di derivazione di `calcolaPrezzoCameraPerNotte`
(percentuale sul tipo base, stesso anti-loop, stesso clamp min/max),
duplicata apposta (non richiamata dall'originale, che resta invariata per
`/tariffe` e per `griglia()`) per sostituire l'unico punto che cambia
davvero: la base di un tipo derivato ora si risolve con un override bb in
planning_tariffe_giorni sul tipo BASE, prima di ricadere sul prezzo
diretto storico. `calcolaTariffaPerTrattamentiConPlanning` ora chiama
questa versione al posto di quella nuda. Serviva anche esportare
`calcolaPrezzoDirettoPerNotte` da `tariffeController.js` (non lo era —
modifica additiva al `module.exports`, nessun comportamento esistente
cambiato).

**Attenzione — non risolve tutto da sola**: i numeri 195€/180€ che Marco
ha visto potrebbero già riflettere il 150€ di Matrimoniale (se le
percentuali di derivazione sono +30%/+20%, tornerebbe esattamente questi
valori) — il problema "Quadrupla più economica di Tripla" **[Ipotesi, non
verificabile da qui, nessun accesso a `regole_derivazione_tariffe`]** è
allora quasi certamente una percentuale di derivazione impostata al
contrario tra i due tipi in `/tariffe` ("Deriva da"), non un bug di
codice — va controllato e corretto lì da Marco, il fix di oggi non lo
tocca e non potrebbe: non è compito di questo codice decidere quale
percentuale sia quella giusta.

**Bug reale #2, NON un bug di codice — dato mancante, da verificare da
Marco**: mezza pensione e pensione completa risultavano non selezionabili
per TUTTE le tipologie su 28-29 agosto. Letto il codice di
`calcolaSupplementoTrattamento` (`tariffeController.js` righe 174-219):
se non c'è una riga in `supplementi_trattamento` per la categoria
(singola/doppia, dedotta da `capienza_max`) + quel trattamento, che copra
il periodo di quella notte (né un periodo specifico né una riga
"fallback" con `periodo_id NULL`), la notte risulta scoperta e il
trattamento non è prenotabile — indipendentemente da planning-tariffe, che
non c'entra: quella tabella non contiene i supplementi trattamento, solo
prezzo/restrizioni per notte. **[Probabile, non verificabile da qui,
nessun accesso a Postgres]**: manca una riga di supplemento per la
categoria coinvolta che copra la data richiesta — da controllare in
`/tariffe`, sezione "Trattamenti" (componente `SchedaTrattamento`,
separata dalla griglia tipologie), per categoria doppia (Matrimoniale/
Matrimoniale Piccola/Tripla/Quadrupla — tutte capienza_max > 1) sia per
mezza pensione sia per pensione completa.

Verificato con `node -c` su entrambi i file toccati
(`tariffeController.js`, `planningTariffeController.js`) — nessun accesso
a Postgres, nessuna query reale eseguita, nessuna riverifica end-to-end
sul sito. Consegna: `backend/controllers/tariffeController.js` e
`backend/controllers/planningTariffeController.js` inviati con
`SendUserFile` e scritti sul dispositivo con `device_commit_files`.
