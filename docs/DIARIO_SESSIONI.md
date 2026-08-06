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
