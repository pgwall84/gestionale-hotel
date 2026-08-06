# TEST MANUALE — Modulo Dashboard e Archivio
# Eseguire con: Chrome (titolare) + Edge InPrivate (receptionist)

## PREREQUISITI
- [ ] Backend e frontend avviati
- [ ] Dati reali presenti: almeno alcune timbrature, movimenti magazzino,
      ospiti_giornalieri, stato_camere aggiornato oggi

---

## TEST 1 — Dashboard KPI reali (/home)

### 1A — KPI camere (movimenti oggi)
- [ ] Inserisci arrivi/partenze in /camere per oggi
- [ ] Dashboard mostra "movimenti oggi" aggiornato ✓ o ✗
- [ ] Confronto anno scorso: "—" se nessun dato (corretto) ✓ o ✗

### 1B — KPI coperti
- [ ] Receptionist inserisce coperti in ospiti_giornalieri per oggi
- [ ] Dashboard aggiorna il totale coperti ✓ o ✗

### 1C — KPI incasso giornaliero
- [ ] Titolare clicca "Registra incasso"
- [ ] Bottom sheet si apre con campi contanti, POS, note ✓ o ✗
- [ ] Inserisci valori e salva
- [ ] KPI incasso aggiornato ✓ o ✗
- [ ] Secondo salvataggio stesso giorno → sovrascrive (UPSERT) ✓ o ✗

### 1D — KPI food cost
- [ ] Con movimenti magazzino e coperti presenti
- [ ] Food cost mostrato in €/coperto ✓ o ✗
- [ ] Senza dati → "—" senza errori ✓ o ✗

### 1E — Badge variazione anno precedente
- [ ] Se dato anno scorso presente: badge verde (positivo) o rosso (negativo) ✓ o ✗
- [ ] Se nessun dato anno scorso: badge neutro "—" ✓ o ✗

---

## TEST 2 — Alert aggregati dashboard

### 2A — Alert ZTL
- [ ] Prenotazione con targa mancante → alert in dashboard ✓ o ✗
- [ ] Alert mostra numero targhe mancanti ✓ o ✗
- [ ] Click alert → naviga a /ztl ✓ o ✗

### 2B — Alert magazzino sottoscorta
- [ ] Prodotto sotto soglia → alert in dashboard ✓ o ✗
- [ ] Click alert → naviga a /magazzino ✓ o ✗

### 2C — Alert scadenze HR
- [ ] Scadenza (visita medica ecc.) entro 30 giorni → alert ✓ o ✗

---

## TEST 3 — Archivio documentale (/archivio)

### 3A — Upload documento
- [ ] Titolare va su /archivio
- [ ] Clicca "Carica documento"
- [ ] Bottom sheet: seleziona categoria "resoconto_z", data oggi, carica foto
- [ ] Documento appare nella lista ✓ o ✗

### 3B — Upload con data manuale
- [ ] Carica documento con data diversa da oggi
- [ ] Data corretta nella lista ✓ o ✗

### 3C — Ricerca per categoria
- [ ] Filtra per "ddt" → vedi solo DDT ✓ o ✗
- [ ] Filtra per "fattura" → vedi solo fatture ✓ o ✗

### 3D — Ricerca per data
- [ ] Filtra per range date → risultati corretti ✓ o ✗

### 3E — Download documento
- [ ] Clicca "Scarica" su un documento
- [ ] File scaricato correttamente ✓ o ✗
- [ ] File apribile (non corrotto) ✓ o ✗

### 3F — Eliminazione documento
- [ ] Clicca "Elimina" su un documento
- [ ] Documento rimosso dalla lista ✓ o ✗
- [ ] File fisico eliminato dal server (non accessibile via URL diretto) ✓ o ✗

---

## TEST 4 — Permessi per ruolo

### 4A — Receptionist accede all'archivio
- [ ] Receptionist (Edge InPrivate) accede a /archivio ✓ o ✗
- [ ] Può caricare documenti ✓ o ✗

### 4B — Solo titolare registra incasso
- [ ] Receptionist tenta "Registra incasso" in dashboard
- [ ] Pulsante non visibile o 403 ✓ o ✗

### 4C — Cameriere non vede archivio
- [ ] Cameriere tenta /archivio → 403 ✓ o ✗

---

## RISULTATO FINALE
- [ ] Tutti i ✓? → Moduli Dashboard e Archivio approvati
- [ ] Problemi trovati: _________________________________
