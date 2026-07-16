# Contratto API — Modulo Prenotazioni (Fase 2)

Preparato 16/07/2026. Definisce path, metodi, permessi e forma delle
risposte per tutti gli endpoint del modulo Prenotazioni, prima di iniziare
l'implementazione — così ogni sessione Claude Code ha un contratto fisso da
seguire invece di deciderlo al volo. Basato su `SCHEMA_PRENOTAZIONI_FASE2.md`
(tabelle già create in migration 016) e sul pattern controller/route già in
uso nel progetto (CLAUDE.md Sezione 5).

Legenda ruoli: **A**=admin, **T**=titolare, **R**=receptionist,
**P**=portiere_notte, **C**=cameriere, **K**=cuoco, **D**=dipendente.

---

## Convenzioni generali

- Tutte le route sotto `/api/*`, autenticazione JWT via `verificaToken`
  (coerente con pattern esistente).
- Risposte liste: `res.json(result.rows)` — array diretto, no wrapper.
- Risposte singolo record: `res.json(result.rows[0])` dopo `RETURNING *`.
- Errori: `res.status(xxx).json({ error: '...' })`, coerente col pattern
  esistente (`getLista error:`, ecc. in console.error).
- Nessun `DELETE` fisico su prenotazioni/soggiorni — solo transizione a
  stato `interrotta`. Coerente con "mai cancellare dati senza motivo" e con
  la necessità di tracciabilità (una prenotazione cancellata è comunque
  storia, non deve sparire).
- Date in formato ISO `YYYY-MM-DD` in query string e body.
- Il `documento_numero` di `ospiti` non viene **mai** incluso per default
  nelle risposte JSON — va mascherato lato backend (es. `CI · ••••1847`)
  tranne che nell'endpoint dedicato "svela documento".

---

## 1. Ospiti

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| GET | `/api/ospiti?search=` | A,T,R,P (lettura) | Ricerca per nome/cognome, per autocomplete in UI. Max 20 risultati, documento mascherato. |
| GET | `/api/ospiti/:id` | A,T,R,P (lettura) | Dettaglio ospite + storico soggiorni (join su `soggiorni`/`soggiorno_ospiti`). Documento mascherato. |
| POST | `/api/ospiti` | A,T,R | Crea nuovo ospite. Body: tutti i campi di `ospiti` (Sezione 1 schema) tranne id/timestamp. |
| PATCH | `/api/ospiti/:id` | A,T,R | Aggiorna dati ospite esistente. |
| POST | `/api/ospiti/:id/svela-documento` | A,T,R **(non P)** | Restituisce `documento_numero` in chiaro. Scrive riga in `audit_log` (chi, quando, quale ospite) — obbligatorio, non opzionale. |

**Nota permessi**: `portiere_notte` ha accesso in lettura per il check-in
notturno ma **mai** l'azione "svela documento" — coerente con la decisione
presa in Sezione 16 ("Ruoli e permessi", 16/07/2026).

---

## 2. Prenotazioni

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| GET | `/api/prenotazioni/griglia?data_inizio=&data_fine=` | A,T,R,P | Vista planning (mockup punto 2): tutti i `soggiorni` che intersecano l'intervallo, con `camera_id`, `camere.piano` (per il raggruppamento visivo per piano in UI), `stato` prenotazione, nome ospite intestatario, date. Usa l'indice `idx_soggiorni_date`. |
| GET | `/api/prenotazioni/:id` | A,T,R,P | Dettaglio completo: prenotazione + soggiorni + ospiti (via `soggiorno_ospiti`) + pagamenti associati. |
| POST | `/api/prenotazioni` | A,T,R | Crea prenotazione + primo soggiorno in un'unica transazione. Vedi payload sotto. |
| PATCH | `/api/prenotazioni/:id` | A,T,R | Modifica campi non di stato: `note`, `canale_origine`. |
| PATCH | `/api/prenotazioni/:id/stato` | A,T,R **+ P solo per `check_in`** | Transizione di stato esplicita. Body: `{ "stato": "confermata" }`. Il controller valida che la transizione sia ammessa (vedi state machine sotto) — non è un semplice UPDATE libero. |

**Gestione conflitto camera (aggiunta 16/07/2026)**: `POST /api/prenotazioni`
può fallire con **`409 Conflict`** se la camera richiesta è già occupata
nell'intervallo di date (vincolo `EXCLUDE` a livello DB, vedi
`SCHEMA_PRENOTAZIONI_FASE2.md` Sezione 3). Il controller deve intercettare
l'errore Postgres specifico (constraint `excl_soggiorni_camera_overlap`) e
tradurlo in un messaggio chiaro per il frontend — non un generico `500`. La
transizione `PATCH .../stato` verso `interrotta` deve impostare
`cancellato = true` su tutti i soggiorni collegati, nella stessa
transazione (vedi regola di sincronizzazione nello schema).

### Payload `POST /api/prenotazioni`

```json
{
  "canale_origine": "diretta",
  "external_booking_id": null,
  "gruppo_id": null,
  "note": "",
  "soggiorno": {
    "camera_id": 12,
    "ospite_id": 34,
    "data_arrivo": "2026-08-10",
    "data_partenza": "2026-08-15",
    "num_ospiti": 2,
    "tariffa_totale": 450.00
  }
}
```

Risposta: prenotazione creata (stato iniziale `opzione`, `data_scadenza_opzione`
= now + 48h, calcolata lato backend non passata dal client) + soggiorno
creato + riga in `soggiorno_ospiti` con `tipo_alloggiato='17'` (capofamiglia)
per l'ospite indicato — creata automaticamente dal controller, il client non
la gestisce esplicitamente in questa chiamata.

### State machine — transizioni valide per `PATCH .../stato`

```
opzione      → confermata | interrotta
confermata   → check_in   | interrotta
check_in     → check_out
check_out    → chiusa
```

Qualsiasi altra transizione richiesta (es. `chiusa → confermata`) deve
restituire `400` con messaggio esplicito, non essere silenziosamente
accettata. Questa tabella va tradotta in codice come mappa/oggetto nel
controller, non if/else sparsi.

---

## 3. Soggiorni (sub-risorsa)

Per prenotazioni multi-camera (raro ma possibile: stesso gruppo, camere diverse).

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| POST | `/api/prenotazioni/:id/soggiorni` | A,T,R | Aggiunge un altro soggiorno (camera) alla stessa prenotazione. Stesso payload `soggiorno` di sopra. |
| PATCH | `/api/soggiorni/:id` | A,T,R | Modifica `camera_id`/`data_arrivo`/`data_partenza`/`tariffa_totale` — **questo è l'endpoint che il drag-and-drop della griglia planning chiamerà** per spostare una prenotazione su un'altra camera e/o altre date. Può restituire `409 Conflict` per lo stesso motivo di `POST /api/prenotazioni` (vedi sopra). |

---

## 4. Soggiorno_ospiti (componenti gruppo/famiglia)

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| GET | `/api/soggiorni/:id/ospiti` | A,T,R,P | Lista ospiti collegati al soggiorno (per generare poi la schedina Alloggiati Web, modulo 2.5). |
| POST | `/api/soggiorni/:id/ospiti` | A,T,R | Aggiunge un ospite al soggiorno. Body: `{ "ospite_id": 56, "tipo_alloggiato": "19" }`. Se `ospite_id` non esiste ancora, creare prima via `POST /api/ospiti`. |
| DELETE | `/api/soggiorni/:id/ospiti/:ospiteId` | A,T,R | Rimuove un ospite dal soggiorno (es. errore di inserimento). |

**Vincolo applicativo (non CHECK a livello DB, va validato nel controller)**:
ogni soggiorno deve avere esattamente un ospite con `tipo_alloggiato IN
('16','17','18')` — il controller rifiuta con `400` un tentativo di
aggiungere un secondo capofamiglia/singolo/capogruppo allo stesso soggiorno,
o di rimuovere l'unico presente lasciando il soggiorno senza intestatario.

---

## 5. Pagamenti

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| GET | `/api/prenotazioni/:id/pagamenti` | A,T,R | Lista pagamenti associati alla prenotazione. |
| POST | `/api/prenotazioni/:id/pagamenti` | A,T,R | Registra un pagamento manuale (es. caparra in contanti alla reception). Body: `{ "importo": 100.00, "metodo": "contanti", "tipo": "caparra" }`. Stato iniziale sempre `completato` per pagamenti registrati manualmente (i pagamenti online via WuBook arriveranno da webhook in modulo 2.3, con `stato` gestito diversamente — non in questo contratto). |
| GET | `/api/gruppi/:id/pagamenti` | A,T,R | Lista pagamenti registrati a livello di gruppo (non spezzati sulle singole prenotazioni). |
| POST | `/api/gruppi/:id/pagamenti` | A,T,R | Registra un pagamento a livello di gruppo — stesso payload di sopra, ma popola `gruppo_id` invece di `prenotazione_id` (vincolo CHECK XOR nello schema). |

---

## 6. Gruppi di prenotazione

Caso raro (squadre, comitive, eventi con più camere e un unico pagatore) —
vedi `SCHEMA_PRENOTAZIONI_FASE2.md` Sezione 1c.

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| GET | `/api/gruppi/:id` | A,T,R,P | Dettaglio gruppo + elenco prenotazioni collegate (`prenotazioni.gruppo_id`) + totale addebiti/pagamenti aggregati. |
| POST | `/api/gruppi` | A,T,R | Crea un nuovo gruppo. Body: `{ "nome": "...", "referente_nome": "...", "referente_email": "...", "referente_telefono": "..." }`. |
| PATCH | `/api/gruppi/:id` | A,T,R | Aggiorna dati referente/nome gruppo. |

**Nota**: le singole prenotazioni del gruppo si creano normalmente via
`POST /api/prenotazioni` (Sezione 2), passando `gruppo_id` nel body al posto
di ometterlo — non c'è un endpoint separato "crea prenotazione di gruppo",
è la stessa route con un campo opzionale in più.

---

## Tabella riepilogativa permessi per ruolo

| Ruolo | Ospiti | Prenotazioni | Soggiorni/ospiti | Gruppi | Pagamenti |
|---|---|---|---|---|---|
| admin, titolare, receptionist | lettura+scrittura+svela | lettura+scrittura+stato | lettura+scrittura | lettura+scrittura | lettura+scrittura |
| portiere_notte | sola lettura, no svela | lettura + solo transizione `check_in` | sola lettura | sola lettura | nessun accesso |
| cameriere, cuoco, dipendente | nessun accesso | nessun accesso | nessun accesso | nessun accesso | nessun accesso |

Da tradurre in `shared/ruoli.js` come nuove chiavi (`ospiti` già prevista in
sessione precedente; aggiungere `prenotazioni`, `soggiorni`, `pagamenti`)
seguendo il pattern già usato per `magazzino`/`archivio` (array di ruoli per
azione, non un unico array per intera sezione, dato che qui servono
permessi diversi per lettura vs scrittura vs azioni specifiche come
check-in).

---

## Cosa NON è in questo contratto (rimandato)

- Endpoint webhook WuBook/A-Cube (`POST /api/webhooks/wubook`, ecc.) —
  modulo 2.3, quando si arriva davvero all'integrazione OTA.
- Generazione/invio schedine Alloggiati Web — modulo 2.5.
- Cron scadenza automatica Opzioni (`node-cron`) — già documentato come
  evolutiva separata in CLAUDE.md Sezione 14, non fa parte di questi
  endpoint CRUD.
- Export ROSS1000/ISTAT — modulo 2.6, appena aggiunto alla roadmap.

## Suggerimento per spezzare in sessioni Claude Code

Coerente con "un solo obiettivo per sessione":
1. Sessione 1: Ospiti (Sezione 1 di questo contratto) — è la base, tutto il
   resto referenzia `ospiti.id`.
2. Sessione 2: Prenotazioni + state machine (Sezione 2) — il cuore del
   modulo.
3. Sessione 3: Soggiorni + Soggiorno_ospiti (Sezioni 3-4) — completa il
   supporto multi-ospite/multi-camera.
4. Sessione 4: Pagamenti (Sezione 5) — la più semplice, ultima perché
   dipende da prenotazioni esistenti per essere testata.
5. Sessione 5: vista griglia frontend (mockup punto 2) — consuma tutti gli
   endpoint sopra, va fatta per ultima.
