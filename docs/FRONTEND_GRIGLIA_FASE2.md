# Contratto Frontend — Vista Griglia Planning (Sessione 5, Fase 2)

Preparato 16/07/2026. Definisce cosa deve fare la vista prima di lanciare
l'implementazione — a differenza delle sessioni backend, qui alcune scelte
tecniche (libreria drag-and-drop, struttura componenti) restano aperte per
il piano di Claude Code, perché è la prima UI interattiva complessa di
questo tipo nel progetto e non c'è un pattern esistente da riusare 1:1.
Riferimento: `MOCKUP_VISTE_FASE2.md` punto 2, `API_PRENOTAZIONI_FASE2.md`
Sezione 2 (endpoint griglia + state machine).

---

## Scope di questa sessione

Solo la vista griglia/planning delle prenotazioni camere. **Non** incluse
in questa sessione (viste future, mockup punti 1/3/4/5/6): riorganizzazione
sidebar completa, scheda Ospiti, vista Pulizie, Conto ospite, Report.
L'unica parte del punto 1 (sidebar) necessaria qui è aggiungere la voce
"Prenotazioni" (camere) nella sezione OSPITALITÀ — senza fare l'intera
riorganizzazione.

---

## Layout

- **Righe**: camere, raggruppate visivamente per `piano` (campo aggiunto in
  migration 017 — va popolato a mano per le 20 camere esistenti *prima* di
  questa sessione, altrimenti tutte le camere finiscono in un gruppo
  "non specificato").
## Range di date — selettore, non fisso (deciso 16/07/2026)

Non un range fisso: un **selettore in alto a sinistra del pannello** con
tre opzioni — **7 giorni** (default), **14 giorni**, **vista mensile** — che
lascia decidere all'utente. Frecce avanti/indietro per scorrere restano,
funzionano su qualunque ampiezza sia selezionata.

## Colori per stato — confermati

| Stato prenotazione | Colore |
|---|---|
| `opzione` | ambra |
| `confermata` | blu/accent |
| `check_in` | verde/success |
| `check_out` | grigio chiaro |
| `chiusa` | grigio scuro/muted |

`interrotta` non compare mai in griglia (backend già esclude
`cancellato=true`).

## Interazione — click

Click sulla barra apre un pannello/modale con (dati già disponibili da
`GET /api/prenotazioni/:id`): nome ospite intestatario, camera, date,
numero ospiti, stato, riepilogo pagamenti (`pagamenti: []` — Sessione 4),
canale di provenienza. Azioni rapide: **Check-in** (chiama
`PATCH /api/prenotazioni/:id/stato` con `{"stato":"check_in"}`) e
**Modifica** (apre form di modifica — riusa `PATCH /api/prenotazioni/:id`
per note/canale, `PATCH /api/soggiorni/:id` per date/camera).

## Interazione — drag and drop

Trascinare una barra su un'altra camera e/o altre date chiama
`PATCH /api/soggiorni/:id`. Punti da gestire obbligatoriamente:

- **Conflitto (409)**: se il backend rifiuta lo spostamento (camera già
  occupata), la barra deve **tornare visivamente alla posizione originale**
  e mostrare un messaggio chiaro ("Camera già occupata in queste date") —
  mai lasciare uno stato visivo incoerente con quello confermato dal
  backend, anche per un istante prolungato.
  - **Aggiornamento ottimistico con rollback su errore** (deciso
    16/07/2026): la barra si sposta subito nella UI, poi conferma col
    backend; se il backend rifiuta (409), rollback immediato alla
    posizione originale + messaggio d'errore.
- **Permessi**: solo admin/titolare/receptionist possono trascinare.
  `portiere_notte` vede la griglia ma le barre non sono trascinabili (sola
  lettura) — verificare che il permesso sia applicato lato frontend
  (disabilitare l'interazione) E che il backend rifiuti comunque la
  richiesta se qualcuno la forzasse via API diretta (già garantito dai
  permessi già implementati in `soggiorniController.js`).

## Dati e fetch

- `GET /api/prenotazioni/griglia?data_inizio=&data_fine=` per popolare la
  griglia nel range visibile — include già `camere.piano` (Sezione 2 del
  contratto API, aggiornata il 16/07).
- Refetch dopo ogni azione che modifica lo stato (drag-drop completato,
  check-in da pannello dettaglio) — non tenere uno stato locale
  disallineato dal backend più del necessario.

---

## Prerequisito: popolamento `camere.piano`

Da fare **prima** di questa sessione (o come primo passo della sessione
stessa), altrimenti la griglia raggruppa tutto sotto "non specificato":

```sql
UPDATE camere SET piano = 1 WHERE numero BETWEEN 101 AND 105;
UPDATE camere SET piano = 2 WHERE numero BETWEEN 106 AND 110;
UPDATE camere SET piano = 3 WHERE numero BETWEEN 111 AND 115;
UPDATE camere SET piano = 4 WHERE numero BETWEEN 116 AND 121;  -- 117 non esiste, nessun errore
-- Appartamento A1: unità esterna a ~20m dall'hotel, in gestione ma non
-- dentro l'edificio — "piano" non ha senso qui, resta NULL di proposito
-- (non un dimenticato: tutte le altre 19 camere sono popolate, quindi un
-- NULL residuo dopo l'UPDATE identifica solo A1, senza ambiguità).
```

**Nota UI**: il raggruppamento per piano nella griglia deve trattare questo
NULL come un gruppo a sé con etichetta esplicita ("Appartamento esterno" o
simile), non genericamente "piano non specificato" — altrimenti diventa
indistinguibile da un vero dato mancante/dimenticato in futuro.

⚠️ **Attenzione al tipo di colonna, confermata ora**: `A1` è alfanumerico,
quindi `camere.numero` è quasi certamente `VARCHAR`/`TEXT`, non `INTEGER` —
coerente con quanto già segnalato in CLAUDE.md Sezione 14 sul `CAST` fragile
di `GET /api/camere`. Lo script sopra usa `BETWEEN 101 AND 105` con
letterali numerici: se `numero` è testo, Postgres in alcuni casi converte
automaticamente ma non è garantito, e comunque un confronto lessicografico
su stringhe non sempre coincide con quello numerico (es. `'116' < '99'` è
vero come stringhe, falso come numeri — non un problema in questo range
specifico ma una trappola generale). **Prima di eseguire**: verificare il
tipo reale con `\d camere` in psql, e se è testo riscrivere come
`WHERE CAST(numero AS INTEGER) BETWEEN 101 AND 105` per le righe numeriche
(questo CAST fallirebbe su `A1`, quindi va comunque eseguito come
UPDATE separato, dopo gli altri, senza il CAST — coerente con lo script
sopra che già lo tratta come caso a parte).

---

## Libreria drag-and-drop — da valutare in fase di piano

Nessuna libreria di questo tipo è ancora presente nel progetto. Il piano di
Claude Code deve:
1. Cercare come i PMS competitor (Cloudbeds, Mews, RoomRaccoon, ecc. — già
   guardati in fase di ricerca il 16/07) implementano la loro griglia
   drag-and-drop, che libreria/tecnica usano se identificabile.
2. Proporre 2-3 opzioni concrete per questo progetto (Next.js + Tailwind,
   niente altre librerie UI pesanti finora) con pro/contro — inclusa
   l'opzione "implementazione nativa con eventi HTML5 drag" se
   ragionevole, per evitare una dipendenza se non strettamente necessaria.
3. Motivare la scelta finale nel piano, coerente con la convenzione del
   progetto di giustificare ogni nuova dipendenza.
