# TEST MANUALE — Modulo Menu
# Eseguire con: Chrome (titolare) + Telefono (cliente per menu pubblico QR)

## PREREQUISITI
- [ ] Backend e frontend avviati
- [ ] Almeno 3 categorie e 5 piatti presenti nel menu
- [ ] QR code del menu disponibile o URL /menu-pubblico accessibile

---

## TEST 1 — Gestione categorie

### 1A — Creazione categoria con emoji
- [ ] Titolare va su /menu
- [ ] Clicca "Nuova categoria"
- [ ] Inserisci: nome "Pizze", emoji 🍕, ordine
- [ ] Categoria appare nella lista con emoji ✓ o ✗
- [ ] Emoji visibile anche nella schermata comanda cameriere ✓ o ✗

### 1B — Ordine categorie
- [ ] Verifica ordine: Antipasti(10) → Primi(20) → Secondi(30) → Contorni(40) → Dolci(50) → Bevande(60)
- [ ] ✓ o ✗

### 1C — Modifica ed eliminazione
- [ ] Modifica nome categoria → aggiornato ✓ o ✗
- [ ] Elimina categoria vuota → rimossa ✓ o ✗
- [ ] Elimina categoria con piatti → blocca con errore ✓ o ✗ (da verificare)

---

## TEST 2 — Gestione piatti

### 2A — Creazione piatto
- [ ] Titolare clicca "Nuovo piatto"
- [ ] Inserisci: nome, categoria, descrizione, prezzo, allergeni multipli
- [ ] Piatto salvato correttamente ✓ o ✗
- [ ] Allergeni visualizzati come badge ✓ o ✗

### 2B — Immagine piatto
- [ ] Carica immagine per un piatto
- [ ] Immagine visibile nella lista ✓ o ✗
- [ ] Immagine visibile nel menu pubblico ✓ o ✗

### 2C — Disponibilità piatto
- [ ] Segna piatto come "non disponibile"
- [ ] Piatto appare barrato o nascosto nel menu ✓ o ✗
- [ ] NON visibile nella schermata comanda cameriere ✓ o ✗

---

## TEST 3 — Menu pubblico QR

### 3A — Accesso senza login
- [ ] Dal telefono apri /menu-pubblico (o scansiona QR)
- [ ] Pagina carica SENZA richiedere login ✓ o ✗
- [ ] Categorie con emoji visibili ✓ o ✗
- [ ] Piatti con nome, descrizione, prezzo, allergeni ✓ o ✗
- [ ] Piatti "non disponibili" NON visibili ✓ o ✗

### 3B — Versione stampa
- [ ] Titolare va su /menu-stampa
- [ ] Pagina ottimizzata per stampa ✓ o ✗
- [ ] Pulsante "Stampa" funzionante ✓ o ✗

---

## TEST 4 — Allergeni e match

### 4A — Badge allergeni nella comanda cameriere
- [ ] Cameriere apre comanda → vede badge allergeni su ogni piatto ✓ o ✗
- [ ] Se ospite celiaco nelle note cucina: badge "Glutine" diventa rosso ✓ o ✗
- [ ] Alert visivo su piatto con allergene match ✓ o ✗

---

## TEST 5 — Permessi per ruolo

### 5A — Solo titolare/admin gestisce il menu
- [ ] Cameriere tenta di modificare un piatto → 403 ✓ o ✗
- [ ] Cuoco vede il menu ma non può modificarlo ✓ o ✗

---

## RISULTATO FINALE
- [ ] Tutti i ✓? → Modulo Menu approvato
- [ ] Problemi trovati: _________________________________
