# TEST MANUALE — Modulo Magazzino
# Eseguire con: Chrome (titolare) + Telefono (cuoco/portiere per movimenti)

## PREREQUISITI
- [ ] Backend e frontend avviati
- [ ] Almeno 3 fornitori presenti nel sistema
- [ ] Prodotti con QR già generati per test scarico
- [ ] Connessione internet per Open Food Facts API

---

## TEST 1 — Nuovo prodotto da EAN

### 1A — Inserimento codice EAN manuale
- [ ] Titolare/cuoco va su /magazzino
- [ ] Clicca "Nuovo prodotto" → inserisce EAN manualmente (es. 8001120005328 — Barilla)
- [ ] Open Food Facts restituisce nome e categoria ✓ o ✗
- [ ] Campi pre-compilati: nome, categoria ✓ o ✗
- [ ] Completa: soglia_minima, fornitore, unità misura
- [ ] Prodotto salvato → QR interno generato ✓ o ✗

### 1B — EAN non trovato su Open Food Facts
- [ ] Inserisci EAN inesistente
- [ ] Messaggio "Prodotto non trovato — inserisci manualmente" ✓ o ✗
- [ ] Form manuale disponibile ✓ o ✗

### 1C — Stampa QR scaffale
- [ ] Seleziona prodotto → "Stampa QR"
- [ ] Pagina stampa QR su A4 ✓ o ✗
- [ ] QR leggibile con telefono ✓ o ✗

---

## TEST 2 — Registrazione consegna (prodotti freschi)

### 2A — Carico prodotto fresco
- [ ] Clicca "Registra consegna"
- [ ] Bottom sheet con: fornitore, prodotto, quantità, scadenza, DDT, costo unitario
- [ ] Compila tutti i campi e salva
- [ ] Giacenza aggiornata correttamente ✓ o ✗
- [ ] Movimento registrato nello storico ✓ o ✗

### 2B — Carico senza costo unitario
- [ ] Salva consegna senza compilare costo unitario
- [ ] Giacenza aggiornata ✓ o ✗
- [ ] Nota: food cost sarà sottostimato per questo movimento ✓ o ✗ (accettabile)

---

## TEST 3 — Scarico da QR scaffale

### 3A — Scansione QR interno
- [ ] Vai su /magazzino/scansiona?modo=qr
- [ ] Scansiona QR stampato sullo scaffale
- [ ] Prodotto identificato correttamente ✓ o ✗
- [ ] Form quantità da scaricare ✓ o ✗
- [ ] Salva → giacenza diminuisce ✓ o ✗

### 3B — Scarico che porta giacenza a zero
- [ ] Scarica tutta la quantità disponibile
- [ ] Giacenza = 0 ✓ o ✗
- [ ] Alert sottoscorta appare ✓ o ✗

### 3C — Scarico oltre la giacenza disponibile
- [ ] Tenta di scaricare più di quello disponibile
- [ ] Sistema blocca con errore 400 ✓ o ✗

---

## TEST 4 — Alert sottoscorta

### 4A — Prodotto sotto soglia
- [ ] Imposta soglia_minima = 5 su un prodotto
- [ ] Porta la giacenza a 3 con uno scarico
- [ ] Alert appare in /magazzino ✓ o ✗
- [ ] Alert appare in dashboard /home ✓ o ✗

---

## TEST 5 — Food cost

### 5A — Calcolo food cost mensile
- [ ] Vai su /magazzino → sezione food cost
- [ ] Seleziona periodo con carichi registrati e coperti in ospiti_giornalieri
- [ ] Food cost mostrato in €/coperto ✓ o ✗
- [ ] Se non ci sono dati → mostra "—" senza errori ✓ o ✗

---

## TEST 6 — Permessi per ruolo

### 6A — Cuoco può registrare movimenti
- [ ] Cuoco accede a /magazzino ✓ o ✗
- [ ] Può registrare carico/scarico ✓ o ✗
- [ ] NON può creare/modificare prodotti (anagrafica) ✓ o ✗

### 6B — Portiere notte può registrare consegne mattutine
- [ ] Portiere notte accede a /magazzino ✓ o ✗
- [ ] Può registrare carico ✓ o ✗

### 6C — Cameriere NON accede al magazzino
- [ ] Cameriere tenta /magazzino → 403 ✓ o ✗

---

## RISULTATO FINALE
- [ ] Tutti i ✓? → Modulo Magazzino approvato
- [ ] Problemi trovati: _________________________________
