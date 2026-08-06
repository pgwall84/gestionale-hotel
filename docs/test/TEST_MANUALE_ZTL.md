# TEST MANUALE — Modulo ZTL (Targhe)
# Eseguire con: Chrome (titolare/receptionist) + Telefono (per OCR targa)

## PREREQUISITI
- [ ] Backend e frontend avviati
- [ ] Almeno 3 prenotazioni presenti nel sistema (con e senza targa)
- [ ] Portale VigiPass del Comune accessibile (per verifica invio)

## DISPOSITIVI
- PC Chrome → titolare@hoteldelgolfo.com o receptionist@hoteldelgolfo.com
- Telefono → stessa sessione per test OCR fotocamera

---

## TEST 1 — Import prenotazioni da Excel

### 1A — Import file Excel da TS Hospitality
- [ ] Titolare va su /ztl
- [ ] Clicca "Importa Excel"
- [ ] Carica file Excel esportato da TeamSystem
- [ ] Prenotazioni importate correttamente ✓ o ✗
- [ ] Merge intelligente: prenotazioni già presenti NON duplicate ✓ o ✗
- [ ] Nuovo import stesso file → nessuna duplicazione ✓ o ✗

### 1B — Verifica stati dopo import
- [ ] Prenotazioni senza targa → stato "mancante" (alert rosso) ✓ o ✗
- [ ] Prenotazioni con targa → stato "da_inviare" ✓ o ✗

---

## TEST 2 — Inserimento targa con OCR

### 2A — OCR da fotocamera
- [ ] Receptionist clicca su prenotazione con stato "mancante"
- [ ] Pulsante "Scansiona targa" disponibile ✓ o ✗
- [ ] Fotocamera si apre ✓ o ✗
- [ ] Fotografa una targa → OCR suggerisce il testo ✓ o ✗
- [ ] Conferma umana sempre richiesta (mai automatica) ✓ o ✗
- [ ] Targa salvata → stato diventa "da_inviare" ✓ o ✗

### 2B — Inserimento manuale targa
- [ ] Receptionist inserisce targa manualmente
- [ ] Salva → stato "da_inviare" ✓ o ✗

---

## TEST 3 — Gestione stati ZTL

### 3A — Verifica tutti e 6 gli stati
- [ ] mancante → alert visivo rosso ✓ o ✗
- [ ] non_necessaria → nessun alert (ospite senza auto) ✓ o ✗
- [ ] da_inviare → pronta per invio al Comune ✓ o ✗
- [ ] inviata → verde, nessuna azione richiesta ✓ o ✗
- [ ] scaduta → alert (ospite partito, targa ancora attiva su VigiPass) ✓ o ✗
- [ ] conclusa → grigio, ciclo completato ✓ o ✗

### 3B — Cambio stato manuale
- [ ] Titolare cambia stato da "da_inviare" a "inviata"
- [ ] Stato aggiornato immediatamente ✓ o ✗

### 3C — Ospite senza auto
- [ ] Imposta stato "non_necessaria" su una prenotazione
- [ ] NON appare negli alert "mancante" ✓ o ✗

---

## TEST 4 — Alert e dashboard

### 4A — Alert targhe mancanti
- [ ] Dashboard /home mostra numero targhe mancanti ✓ o ✗
- [ ] Cliccando alert naviga a /ztl filtrato per "mancante" ✓ o ✗

---

## TEST 5 — Permessi per ruolo

### 5A — Receptionist può gestire ZTL
- [ ] Receptionist accede a /ztl ✓ o ✗
- [ ] Può inserire/modificare targhe ✓ o ✗

### 5B — Cameriere NON accede a ZTL
- [ ] Cameriere tenta /ztl → 403 o redirect ✓ o ✗

---

## RISULTATO FINALE
- [ ] Tutti i ✓? → Modulo ZTL approvato
- [ ] Problemi trovati: _________________________________
