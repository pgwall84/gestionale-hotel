# Ricerca competitor — anagrafica clienti / CRM ospiti

> Ricerca commissionata da Marco il 14/08/2026. Confronta cosa offrono i
> PMS leader (Mews, Cloudbeds, RoomRaccoon) e il concorrente diretto
> italiano (Slope) sull'anagrafica clienti/CRM ospiti, contro lo stato
> reale del modulo `/clienti` (verificato nel codice, non a memoria).
> Molto di quanto emerge qui **non è nuovo**: la voce "CRM ospiti con
> preferenze/tag" era già in `docs/EVOLUTIVE.md` come PRIORITÀ ALTA dal
> confronto competitivo del 05/08/2026 — questa ricerca la dettaglia con
> gap concreti, non la sostituisce.

---

## 1. Il punto scomodo

[Certo] Due gap non sono "funzionalità in più che sarebbe carino avere" —
sono limiti che peggiorano da soli col tempo, verificati nel codice:

- **Nessun rilevamento duplicati**: la ricerca in `/clienti` è
  `WHERE nome ILIKE $1 OR cognome ILIKE $1` (`anagraficaOspitiController.js`),
  nient'altro. Oggi con inserimento solo manuale in reception il rischio è
  contenuto. Ma il modulo 2.3 (WuBook/OTA) creerà ospiti automaticamente
  da prenotazioni esterne — lo stesso cliente prenotato una volta diretto,
  una volta da Booking.com, rischia di diventare due o tre schede diverse
  senza che nessuno se ne accorga, esattamente il problema che Cloudbeds
  risolve con un merge automatico notturno. Meglio saperlo ora che quando
  il database ha già centinaia di duplicati silenziosi.
- **Il "quanto ha speso" non è mai stato reso una domanda che il
  gestionale sa rispondere**: `totale speso` esiste solo come `reduce()`
  lato frontend nella scheda del singolo cliente (`[id]/page.jsx`), non
  in un endpoint, non nella lista/ricerca. Non puoi oggi ordinare o
  filtrare i clienti per spesa — "chi sono i miei 10 clienti migliori"
  richiederebbe di aprire ogni scheda una per una.

---

## 2. Cosa offrono i concorrenti

| Prodotto | Cosa propone | Dettaglio rilevante |
|---|---|---|
| **Mews** | "Guest CRM" e "Guest profiles" indicati esplicitamente come punti di forza del prodotto | Storico prenotazioni consolidato, dato riusato per personalizzazione |
| **Cloudbeds** | Guest Marketing CRM — contatti, stato, storico prenotazioni su tutte le strutture del gruppo in un unico posto | **Deduplica automatica ogni notte** delle schede ospite (stesso ospite arrivato da OTA/diretta/agenzia non diventa 3 persone). Sistema di **tag personalizzabili** applicabili a ospiti/prenotazioni/camere (es. "VIP Guest", "Long-Stay") |
| **RoomRaccoon** | CRM di base integrato nel PMS — profilo, storico prenotazioni, preferenze, note | Per marketing automation avanzata rimanda a CRM esterni via integrazione — non tutto è nativo nemmeno lì |
| **Slope** (concorrente diretto italiano) | CRM integrato nel PMS — storico prenotazioni e richieste passate, invio preventivi/offerte personalizzate dai dati raccolti | Esplicita l'importanza di CRM+PMS integrati per "non perdere interazioni" — stesso principio già rispettato qui (unico sistema, non un CRM separato) |
| **Standard di settore (fonti generiche)** | Profili costruiti automaticamente nel tempo: preferenze alimentari/allergie, compleanno, spesa media, per messaggi automatici mirati (camera pronta, ristorante preferito, promemoria spa) | Non specifico di un prodotto, ma citato come prassi ormai comune, non avanguardia |

---

## 3. Gap concreti — cosa manca rispetto al confronto

Verificato nel codice (`ospiti`, `anagraficaOspitiController.js`,
`frontend/app/clienti/**`), non assunto:

1. **Rilevamento/merge duplicati** — assente (vedi punto 1). Nessun
   concorrente lo tratta come funzione avanzata, è la base.
2. **Totale speso non esposto da un endpoint** — solo calcolato ad hoc
   nel frontend, non ordinabile/filtrabile in lista.
3. **Nessun tag/etichetta libera sul cliente** — solo un'"etichetta" sul
   nucleo familiare (concetto diverso, per gruppi di ospiti dello stesso
   soggiorno), non un sistema di tag riusabili tipo "VIP", "abituale",
   "problematico" applicabile a un singolo cliente.
4. **Nessun flag VIP/blacklist** — nessun campo dedicato, nessuna
   segnalazione visibile in reception all'apertura scheda.
5. **Allergie/preferenze alimentari NON collegate all'anagrafica cliente**
   — esistono solo in `ospiti_giornalieri.note_allergie`, tabella
   separata per i coperti del giorno corrente, azzerata ogni giorno. Un
   ospite abituale con un'allergia nota deve farla ridire ogni volta,
   il sistema non se la ricorda da un soggiorno all'altro.
6. **Nessun promemoria compleanno** — `data_nascita` è già raccolta
   (obbligo Alloggiati Web), il dato c'è, semplicemente non viene usato
   per nient'altro.
7. **Segmentazione marketing limitata** — Marketing▸Offerte (modulo 5.3)
   sa mandare a "tutti con consenso" o a una selezione manuale, non a un
   segmento dinamico (es. "ospiti che hanno soggiornato ad agosto",
   "ospiti con spesa sopra i 500€", "ospiti con una certa allergia").
   Dipende in parte dai punti 2 e 5 sopra — senza spesa/preferenze
   strutturate non c'è nulla su cui segmentare.

## 4. Cosa già copre bene il gestionale (non tutto è gap)

Verificato per correttezza, non solo i limiti:

- Documento mascherato con svela audit-logged — nessun concorrente
  citato nella ricerca lo descrive con lo stesso livello di dettaglio;
  probabilmente Hotel del Golfo è già più attento qui che alla media.
- Storico soggiorni per cliente — presente e funzionante
  (`dettaglio()` con JOIN soggiorni/camere/prenotazioni).
- "Quante volte è stato qui" (numero_soggiorni) — già esposto in lista,
  solo "quanto ha speso" manca allo stesso livello.
- Note libere sulla scheda cliente — presenti, anche se non strutturate
  in tag/categorie.

## 5. Non affrontato in questa ricerca

- Nessuna proposta di schema/migration — solo ricognizione, come
  richiesto.
- Non ho verificato prezzi: come per la reportistica, è funzionalità
  interna già pagata, non un prodotto a parte da comprare.
- Il collegamento con l'evolutiva "CRM ospiti con preferenze/tag" già
  esistente (05/08/2026, PRIORITÀ ALTA) va aggiornato con questo
  dettaglio, non duplicato — lasciato a una scelta esplicita di Marco.

## Fonti principali

- Cloudbeds — cloudbeds.com/articles/hotel-crm-system, cloudbeds.com/articles/guest-profiles, myfrontdesk.cloudbeds.com (Attribute Tagging, Guest Profile Deduplication)
- Mews / Cloudbeds comparativa — hoteltechreport.com/compare/cloudbeds-myfrontdesk-vs-mews
- RoomRaccoon — roomraccoon.com (guide PMS, integrazioni CRM)
- Slope — slope.it (articoli CRM, importazione dati)
- Prassi generale di settore — qualitando.com/guest-profile-management-hotel

---

## Parte 2 — Aggiornamento stato + acquisizione visiva dei dati (08/09/2026)

> Richiesta di Marco: "l'anagrafica è ancora un po' scarna" — verificare lo
> stato reale dei 7 punti sopra (non dato per scontato) e allargare la
> ricerca competitor a un aspetto che la Parte 1 non copriva: **come i
> concorrenti facilitano visivamente l'acquisizione dei dati**, non solo
> quali dati hanno.

### 2.1 — Stato reale dei 7 punti, verificato nel codice (non nella Parte 1)

[Certo] 5 dei 7 gap della Parte 1 risultano **chiusi**, costruiti dopo
questa ricerca ma non tornati a documentarla qui — la premessa "è ancora
scarna" va quindi corretta su questo punto, anche se resta vera su altri
due:

1. Rilevamento/merge duplicati — **fatto**: `GET /api/ospiti/duplicati-sospetti`
   (nome+cognome+data di nascita) e `POST /api/ospiti/:id/unisci` (merge
   manuale, mai automatico, coerente con la policy "mai cancellazione").
2. Totale speso esposto/ordinabile — **fatto**: campo `totale_speso` nel
   `SELECT` di `GET /api/ospiti`, ordinabile via `?ordina=totale_speso`.
3. Tag liberi sul cliente — **fatto**: `ospiti.tag TEXT[]`, aggiunta/rimozione
   da `clienti/[id]/page.jsx`, filtro in lista con `<datalist>` di
   autocomplete sui tag già usati.
4. Flag VIP/blacklist — **fatto**: colonne dedicate, visibili in scheda.
5. Allergie collegate all'anagrafica persistente — **fatto**: `ospiti.allergie`,
   non più solo `ospiti_giornalieri.note_allergie`.
6. **Ancora aperto**: promemoria compleanno. `data_nascita` c'è dal 2026-08,
   nessun cron/notifica la usa — verificato, zero occorrenze di
   "compleanno"/"birthday" nel backend.
7. **Ancora aperto**: segmentazione dinamica per Marketing▸Offerte.
   `offerteEmailController.js` accetta solo `destinatari: 'tutti'` o un
   array di id scelti a mano — nessun filtro per tag/spesa/allergia, pur
   avendo ORA tutti i dati per farlo (punto 2 e 3 sopra, mancanti ad
   agosto, sono la base che serviva).

### 2.2 — Come i concorrenti rendono facile *inserire* questi dati (nuovo)

**Tag — Cloudbeds vs Hotel del Golfo**: in Cloudbeds i tag NON sono testo
libero — un amministratore li predefinisce in Impostazioni, lo staff in
scheda sceglie solo da un menu ("+", poi selezione, poi Salva). Hotel del
Golfo fa l'opposto: testo libero con autocomplete sui tag già usati
(`<datalist>`). Più flessibile, ma rischia frammentazione ("vip", "VIP",
"Vip" come tre tag diversi) che Cloudbeds evita per costruzione — un
gap concreto e piccolo da chiudere (case-insensitive + trim lato backend
prima di salvare, o una vista "canonicalizza tag" in Impostazioni).

**Deduplica — automatica vs assistita**: Cloudbeds fonde in automatico ogni
notte (soglia di confidenza sopra il 90%, confronto nome+cognome+telefono+
email+paese+indirizzo, fuzzy match tipo "John"/"Jon"), senza schermata di
revisione per i casi sopra soglia — solo i casi dubbi restano a un merge
manuale. Hotel del Golfo ha SOLO il percorso manuale (`duplicati-sospetti`
suggerisce, un operatore deve sempre confermare `unisci`). Più prudente,
ma più lavoro umano — probabilmente giusto così per una struttura di 20
camere (il volume non giustifica un job notturno), ma vale la pena saperlo
è una scelta, non un limite subito.

**Il punto più concreto trovato — un canale già costruito e non
sfruttato**: Duve/Akia/Canary Technologies (leader nel pre-arrival digital
check-in) raccolgono proprio i dati che qui restano indietro — allergie,
preferenze, orario di arrivo — con un form mobile via link SMS/email,
passo-passo con barra di avanzamento, scansione documento con autofill,
e tutto confluisce subito nel profilo ospite del PMS. **Hotel del Golfo
ha già l'equivalente tecnico** (modulo 5.2, pre-checkin pubblico con OCR e
form self-service, in uso reale dagli ospiti) — verificato ora nel codice:
`preCheckinPubblicoController.js` non tocca mai `allergie`, non lo chiede.
È l'unico gap dei 7 che si chiuderebbe quasi gratis: aggiungere un campo
allergie/preferenze al form di pre-checkin già esistente e scriverlo su
`ospiti.allergie` invece che lasciarlo assente, invece di costruire un
canale di raccolta nuovo da zero.

### 2.3 — Non affrontato qui

- Nessuna proposta di UI per il promemoria compleanno o la segmentazione
  Offerte — solo ricognizione, come nella Parte 1. Se Marco vuole
  procedere, serve un brainstorming dedicato (schema, dove appare il
  promemoria, motore di filtro per la segmentazione).
- Non ricontrollato se `GET /api/ospiti/tag` normalizza già maiuscole/
  minuscole prima del confronto — solo notato come gap potenziale dal
  confronto con Cloudbeds, non verificato riga per riga.

### Fonti aggiuntive (Parte 2)

- Cloudbeds — Attribute Tagging (Tags), Guest Profile Deduplication Overview, Guest Profiles overview (myfrontdesk.cloudbeds.com, cloudbeds.com/articles/guest-profiles)
- Hotel Tech Report — confronto contactless check-in (Duve, Akia, Canary Technologies), hoteltechreport.com/guest-experience/contactless-checkin
