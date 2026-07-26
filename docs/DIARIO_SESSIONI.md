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
