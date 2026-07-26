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

Modulo 1.7 — Magazzino (evolutive, non ora):
  Storico prezzi per prodotto nel tempo
  Generazione automatica bozza ordine fornitore quando prodotto sotto soglia
  Alert scadenze progressivi (7 giorni, 3 giorni, giorno stesso)
  DA APPROFONDIRE — scansione barcode/QR poco affidabile da foto telefono
    (testato su Samsung + Chrome, stesso errore "no MultiFormat Readers"
    anche con BarcodeDetector nativo attivato e immagine ridimensionata).
    Per ora: inserimento manuale del codice come via primaria (già in
    produzione). Da valutare in futuro: pistola/lettore barcode dedicato
    hardware invece della fotocamera del telefono, se il volume di scansioni
    giornaliere rende l'inserimento manuale troppo lento in pratica.

Modulo 1.3 — Camere:
  Robustezza query camere: GET /api/camere usa CAST(numero AS INTEGER) senza
  gestione errore — un valore non numerico in camere.numero rompe l'intero
  endpoint con 500 invece di un errore leggibile. Scoperto incidentalmente
  il 16/07/2026 con dati di scarto di test, non ancora capitato in
  produzione. Da sistemare quando si tocca di nuovo il modulo Camere
  (validazione a monte sull'INSERT, o query più difensiva).

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
  **Eccezione non coperta dal fix**: `frontend/app/login/page.jsx` non usa
  `err.message` — legge `err?.response?.data?.errore || 'Errore di
  connessione. Riprova.'` con la STESSA chiave sbagliata ma un fallback
  hardcoded diverso. Resta silenziosamente sbagliata: un login fallito per
  password errata mostra ancora il fuorviante "Errore di connessione.
  Riprova." invece del motivo reale. Non toccata, da correggere quando si
  tocca di nuovo il modulo login (stesso fix: `err?.response?.data?.error`).

tests/e2e/login.spec.js — getByLabel non trova i campi (scoperto
17/07/2026, non corretto):
  `frontend/app/login/page.jsx` ha due `<label>` (Email, Password) senza
  `htmlFor`/`id` a collegarli ai rispettivi `<input>` — nessuna
  associazione programmatica. `login.spec.js` usa `page.getByLabel(/email/i)`
  e `page.getByLabel(/password/i)`, che quindi non trovano mai i campi e
  vanno in timeout (verificato: lo stesso identico errore si riproduce nel
  nuovo `tests/e2e/planning-camere.spec.js` finché non è stato riscritto
  con `getByPlaceholder`). `login.spec.js` esistente molto probabilmente
  fallisce già oggi in CI/locale, indipendentemente da questa sessione.
  Fix quando si riprende: aggiungere `htmlFor="email"`/`id="email"` (e
  coppia analoga per password) in `login/page.jsx`, oppure riscrivere il
  test con `getByPlaceholder`/selettore diretto sull'input.

Modulo 1.8 — Dashboard (evolutive, non ora):
  Food cost % sul fatturato (spesa materie prime / ricavi ristorante × 100)
  — evolutiva quando ci sarà storico incassi reale. Oggi mostra
  correttamente €/coperto invece di una % che sarebbe fuorviante senza
  incassi storici affidabili.

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
  - Punti ancora da scegliere: provider italiano certificato per
    l'intermediario Alloggiati Web (modulo 2.5); formato dati richiesto dal
    Comune per la tassa di soggiorno (modulo 2.4)

Fase 2 (dopo go-live e test in produzione) — moduli non ancora avviati:
  2.2 Planning camere: tariffe, stagionalità, pacchetti all-inclusive
    (il CRUD+griglia di base sono fatti, manca la parte prezzi/pacchetti)
  2.3 Integrazione WuBook/WooDoo channel manager OTA
  2.4 Tassa di soggiorno custom
  2.5 Alloggiati Web via intermediario REST certificato (note implementative
    già verificate sui manuali ufficiali, vedi docs/PRENOTAZIONI_FASE2.md)
  2.6 Export ROSS1000/ISTAT
  3.1 Integrazione A-Cube API corrispettivi (scontrini — sostituisce Hugin RT-K50)
  3.2 Fatturazione B2B (rivalutare A-Cube vs Fatture in Cloud con commercialista)
  3.3 Pagamenti online Nexi + Stripe via WuBook
  4.1 Booking engine (Next.js + WuBook API)
  4.2 Welcome Book digitale multilingua
  5.1 Check-in/check-out digitale + housekeeping
  5.2 Pre check-in digitale + OCR + Omnitec (verificare API disponibili)
  5.3 Email/SMS automatici (Brevo o SendGrid — piano gratuito sufficiente)

  Retention dati ospiti — calcolata a runtime, nessun job automatico per
  ora (vedi docs/PRENOTAZIONI_FASE2.md). Un job di anonimizzazione/
  cancellazione automatica alla scadenza è rimandato, il volume attuale
  (20 camere) non lo giustifica.

Fase 3 (futuro):
  6.1 HACCP avanzato (temperature, scongelo, cotture)
  6.2 Agente AI interno per titolare e staff
  6.3 Revenue management (RevPAR, suggerimenti tariffari)
```
