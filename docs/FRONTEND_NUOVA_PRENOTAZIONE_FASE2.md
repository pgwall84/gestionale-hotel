# Contratto Frontend — Nuova Prenotazione (Sessione 6, Fase 2)

Preparato 16/07/2026. Chiude il buco individuato dopo la Sessione 5: la
griglia planning permette di vedere/spostare/fare check-in su prenotazioni
esistenti, ma non ne esisteva alcuna via per crearne una nuova dalla
reception. Riferimento: `API_PRENOTAZIONI_FASE2.md` Sezione 2
(`POST /api/prenotazioni`, già esistente e testato dalla Sessione 2 — qui
si costruisce solo la UI che lo consuma).

---

## Due punti d'ingresso, stesso form/modale

1. **Pulsante "Nuova prenotazione"**, posizionato in alto nella pagina
   `planning-camere`, **accanto al selettore di vista** (7gg/14gg/mese) —
   apre il form vuoto, nessun campo pre-compilato.
2. **Click su una cella vuota della griglia** (camera + giorno senza
   nessuna barra sopra) — apre lo stesso form, con `camera_id` e
   `data_arrivo` già pre-compilati dalla cella cliccata. `data_partenza`
   resta vuota/con default +1 notte, modificabile.

Stesso componente form in entrambi i casi — cambia solo lo stato iniziale
con cui viene aperto.

## Permessi

Solo admin/titolare/receptionist vedono il pulsante e possono cliccare
celle vuote (coerente con i permessi di `POST /api/prenotazioni`).
`portiere_notte` continua a vedere la griglia in sola lettura come già
implementato — nessuna modifica al suo accesso.

## Campi del form

- **Camera** — selezionata dalla cella (punto 2) o da selezionare
  esplicitamente (punto 1). Mostrare solo camere effettivamente libere nel
  range scelto, se fattibile senza complicare troppo — altrimenti lasciare
  la scelta libera e affidarsi al `409` del backend come rete di sicurezza
  (vedi sotto).
- **Ospite** — ricerca con autocomplete su `GET /api/ospiti?search=`
  (endpoint già esistente, Sessione 1). Se non trovato, link **"+ Nuovo
  ospite"** che apre un mini-form con solo `nome`/`cognome` (gli unici
  campi obbligatori lato backend) — il resto dell'anagrafica (documento,
  cittadinanza, ecc.) si completa più avanti, non blocca la creazione della
  prenotazione. Alla conferma del mini-form, chiama `POST /api/ospiti` e
  usa l'`id` restituito per il campo principale.
- **Date arrivo/partenza** — validazione lato form: partenza sempre dopo
  arrivo (stesso vincolo del CHECK DB, ma niente aspetta una risposta 400
  per dirlo all'utente).
- **Numero ospiti**, **tariffa totale** — campi semplici.
- **Canale origine** — select con default `"diretta"` (gli altri valori,
  WuBook/OTA, non hanno ancora un flusso reale che li usa, ma il campo
  esiste già nello schema).
- **Note** — campo libero opzionale.
- **Gruppo** — **omesso da questo form per ora**, vedi decisione sotto.

## Decisione da confermare: gruppo nel form rapido — sì o no?

Il contratto API (Sezione 6) ha `GET /api/gruppi/:id` (dettaglio) ma **non
un endpoint di lista/ricerca gruppi** — servirebbe per un select "assegna a
un gruppo esistente" in questo form. Dato che i gruppi sono un caso raro
(confermato in sessione precedente), propongo di **lasciarli fuori da
questo form rapido**: si crea la prenotazione singola, e l'assegnazione a
un gruppo (se serve) si fa più avanti come azione separata — evita di dover
aggiungere ora un endpoint di lista solo per un campo che userai raramente.
Se preferisci includerlo subito, va aggiunto un piccolo endpoint
`GET /api/gruppi?search=` prima di questa sessione (stesso pattern di
`ospiti`).

## Invio e gestione errori

- `POST /api/prenotazioni` con il payload già definito nel contratto
  originale (Sezione 2) — `data_scadenza_opzione` resta calcolata dal
  backend, non toccata dal form.
- **`409 Conflict`** (camera occupata — può succedere anche partendo da
  una cella apparentemente vuota, per date che si estendono oltre il
  giorno cliccato): il form **resta aperto** con un messaggio chiaro,
  l'utente corregge camera/date e riprova — non chiudere il form buttando
  via quello che l'utente ha già compilato.
- **`400`** (validazione, es. ospite senza nome/cognome nel mini-form):
  messaggio inline sul campo specifico, stesso principio.
- Al successo: chiudi il form, **refetch della griglia** (stesso pattern
  già usato per drag-drop e check-in), la nuova prenotazione appare subito
  come barra `opzione` (ambra).

## File coinvolti (indicativo, da confermare nel piano)

- Nuovo componente `FormNuovaPrenotazione` (modale, riusabile dai due
  punti d'ingresso)
- Nuovo mini-componente `FormNuovoOspiteRapido` (nome/cognome, dentro il
  form principale)
- Modifica `GrigliaCamere`/`BarraPrenotazione` per rilevare il click su
  cella vuota (oggi probabilmente gestiscono solo il click sulle barre
  esistenti)
- Modifica `page.jsx` per il pulsante in alto e lo stato del modale
