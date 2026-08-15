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
