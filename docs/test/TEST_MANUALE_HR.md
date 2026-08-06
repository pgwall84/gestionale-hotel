# TEST MANUALE — Modulo HR (Personale)
# Eseguire con: Chrome (titolare) + Edge InPrivate (dipendente) + Telefono (dipendente mobile)

## PREREQUISITI
- [ ] Backend avviato (npm run dev in /backend)
- [ ] Frontend avviato (npm run dev in /frontend)
- [ ] IP PC verificato con ipconfig → aggiornare next.config.ts se cambiato
- [ ] Utenti di test presenti nel DB (titolare + almeno 2 dipendenti)
- [ ] Essere fisicamente vicino all'hotel per test geolocalizzazione

## DISPOSITIVI
- PC Chrome → titolare@hoteldelgolfo.com
- PC Edge InPrivate → dipendente@hoteldelgolfo.com
- Telefono → dipendente@hoteldelgolfo.com (per timbratura mobile)

---

## TEST 1 — Timbratura da mobile con geolocalizzazione

### 1A — Timbratura da posizione corretta (dentro 50m hotel)
- [ ] Dipendente apre /timbratura sul telefono
- [ ] Clicca "Entrata"
- [ ] Browser chiede permesso posizione → Consenti
- [ ] Timbratura registrata correttamente ✓ o ✗
- [ ] Nota: timbratura appare nella lista del titolare

### 1B — Timbratura da posizione errata (oltre 50m hotel)
- [ ] Allontanarsi di più di 50 metri
- [ ] Dipendente clicca "Entrata"
- [ ] Appare messaggio "Devi essere in hotel per timbrare. Sei a X metri" ✓ o ✗
- [ ] Timbratura NON registrata ✓ o ✗

### 1C — Timbratura con permesso GPS negato
- [ ] Dipendente clicca "Entrata"
- [ ] Nega il permesso posizione
- [ ] Appare messaggio "Permesso posizione negato. Contatta il titolare." ✓ o ✗
- [ ] Timbratura NON registrata ✓ o ✗

### 1D — Timbratura di uscita
- [ ] Dopo almeno 1 minuto dall'entrata, clicca "Uscita"
- [ ] Ore lavorate calcolate correttamente ✓ o ✗

---

## TEST 2 — Gestione turni con griglia visuale

### 2A — Vista griglia settimana corrente
- [ ] Titolare va su /personale → tab Turni
- [ ] Griglia mostra tutti i dipendenti attivi sulle righe ✓ o ✗
- [ ] Colonne mostrano i giorni Lun-Dom della settimana corrente ✓ o ✗
- [ ] Pulsanti ← → per navigare settimane ✓ o ✗
- [ ] Pulsante "Oggi" riporta alla settimana corrente ✓ o ✗

### 2B — Creazione turno dalla griglia
- [ ] Titolare clicca cella vuota di un dipendente
- [ ] Bottom sheet "Crea turno" si apre ✓ o ✗
- [ ] Inserisci: ora_inizio 08:00, ora_fine 16:00, tipo mattina
- [ ] Turno appare nella griglia con sfondo azzurro ✓ o ✗

### 2C — Colori per tipo turno
- [ ] Crea turno tipo "mattina" → sfondo azzurro ✓ o ✗
- [ ] Crea turno tipo "sera" → sfondo arancione ✓ o ✗
- [ ] Crea turno tipo "notte" → sfondo blu scuro testo bianco ✓ o ✗
- [ ] Crea turno tipo "riposo" → sfondo grigio ✓ o ✗

### 2D — Modifica turno
- [ ] Titolare clicca cella con turno esistente
- [ ] Bottom sheet "Modifica/Elimina" si apre ✓ o ✗
- [ ] Modifica orario e salva → griglia aggiornata ✓ o ✗
- [ ] Elimina turno → cella torna vuota ✓ o ✗

---

## TEST 3 — Richieste ferie e notifiche

### 3A — Dipendente richiede ferie
- [ ] Dipendente (Edge InPrivate) va su /personale → tab Assenze
- [ ] Clicca "Nuova richiesta"
- [ ] Inserisci: tipo ferie, date future, note
- [ ] Richiesta appare con badge giallo "In attesa" ✓ o ✗

### 3B — Titolare approva
- [ ] Titolare (Chrome) va su /personale → tab Assenze
- [ ] Vede la richiesta del dipendente
- [ ] Clicca "Approva"
- [ ] Badge diventa verde "Approvata ✓" ✓ o ✗

### 3C — Dipendente vede l'aggiornamento
- [ ] Dipendente ricarica /personale → tab Assenze
- [ ] Riquadro "Ultime decisioni" mostra la richiesta approvata ✓ o ✗
- [ ] Badge verde "Approvata ✓" visibile ✓ o ✗
- [ ] Se approvata nelle ultime 24h: bordo evidenziato + "Nuovo" ✓ o ✗

### 3D — Titolare rifiuta (ripeti 3A con nuova richiesta)
- [ ] Titolare clicca "Rifiuta"
- [ ] Badge diventa rosso "Rifiutata ✗" ✓ o ✗
- [ ] Dipendente vede badge rosso nelle ultime decisioni ✓ o ✗

---

## TEST 4 — Report mensile presenze

### 4A — Generazione report
- [ ] Titolare va su /personale
- [ ] Cerca pulsante "Report mensile" ✓ o ✗
- [ ] Seleziona mese corrente
- [ ] Clicca "Scarica report Excel"
- [ ] File Excel scaricato ✓ o ✗

### 4B — Contenuto report
Aprire il file Excel e verificare:
- [ ] Una riga per ogni dipendente ✓ o ✗
- [ ] Colonne: Nome, Cognome, Ore ordinarie, Giorni presenza ✓ o ✗
- [ ] Colonne: Ferie godute, Permessi usati, Malattie ✓ o ✗
- [ ] Colonna Ritardi presente ✓ o ✗
- [ ] Se dipendente ha timbrato oltre 15min dal turno → conteggiato come ritardo ✓ o ✗

---

## TEST 5 — Permessi per ruolo

### 5A — Cameriere non vede il personale altrui
- [ ] Loggarsi come cameriere
- [ ] /personale mostra solo i PROPRI dati (timbrature, turni, assenze) ✓ o ✗
- [ ] NON vede i dati degli altri dipendenti ✓ o ✗

### 5B — Cuoco non accede al personale
- [ ] Loggarsi come cuoco
- [ ] /personale accessibile? (dipende da ruoli.js — verificare) ✓ o ✗

---

## RISULTATO FINALE
- [ ] Tutti i ✓? → Modulo HR approvato
- [ ] Problemi trovati: _________________________________
