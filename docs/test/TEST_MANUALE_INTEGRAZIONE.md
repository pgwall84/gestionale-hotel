# TEST MANUALE — Integrazione completa (flusso giornata reale)
# Simula una giornata operativa completa con tutti i ruoli
# Eseguire DOPO aver completato i test dei singoli moduli

## DISPOSITIVI NECESSARI
- PC Chrome → titolare@hoteldelgolfo.com
- PC Edge InPrivate → receptionist@hoteldelgolfo.com  
- PC Firefox → cameriere@hoteldelgolfo.com
- Telefono Samsung (Chrome) → cuoco@hoteldelgolfo.com
- Secondo telefono o tab → portiere_notte@hoteldelgolfo.com

## Durata stimata: 45-60 minuti

---

## MATTINA — Apertura hotel (07:00)

### Portiere notte timbra uscita
- [ ] Portiere notte apre /timbratura sul telefono
- [ ] Geolocalizzazione verificata (in hotel) ✓ o ✗
- [ ] Timbra "Uscita" ✓ o ✗

### Portiere notte registra consegna fornitore
- [ ] Il fornitore ha consegnato frutta e verdura alle 06:30
- [ ] Portiere va su /magazzino → "Registra consegna"
- [ ] Inserisce: prodotti, fornitore, quantità, DDT, scadenza ✓ o ✗
- [ ] Giacenze aggiornate ✓ o ✗

### Cuoco timbra entrata
- [ ] Cuoco apre /timbratura sul telefono (fuori hotel inizialmente)
- [ ] Se oltre 50m → blocco geolocalizzazione ✓ o ✗
- [ ] Entra in hotel → timbra "Entrata" ✓ o ✗

### Cuoco consulta note cucina
- [ ] Cuoco va su /personale → tab Note cucina
- [ ] Vede coperti previsti per oggi: colazione/pranzo/cena ✓ o ✗
- [ ] Vede allergie ospiti (es. "camera 5 celiaco") ✓ o ✗

---

## MATTINA — Reception (08:00)

### Receptionist timbra entrata
- [ ] Receptionist timbra entrata ✓ o ✗

### Receptionist aggiorna stato camere
- [ ] Va su /camere
- [ ] Segna arrivi e partenze del giorno ✓ o ✗
- [ ] Dashboard aggiorna "movimenti oggi" ✓ o ✗

### Receptionist inserisce ospiti giornalieri
- [ ] Va su /personale → Note cucina
- [ ] Inserisce: coperti colazione 18, pranzo 12, cena 20
- [ ] Note allergie: "camera 8 intollerante lattosio"
- [ ] Salvato correttamente ✓ o ✗

### Receptionist gestisce ZTL
- [ ] Va su /ztl
- [ ] Verifica targhe mancanti per arrivi di oggi
- [ ] Inserisce targa per nuovo ospite ✓ o ✗
- [ ] Segna "non_necessaria" per ospite senza auto ✓ o ✗

---

## PRANZO — Servizio ristorante (12:00)

### Setup sala
- [ ] Cameriere apre /sala sul telefono
- [ ] Mappa mostra 20 tavoli grigi (liberi) ✓ o ✗
- [ ] Cuoco apre /cucina sul telefono → monitor vuoto ✓ o ✗

### Primo tavolo
- [ ] Cameriere tocca tavolo 3 (libero)
- [ ] Bottom sheet: "Apri e vai alle comande" ✓ o ✗
- [ ] Aggiunge piatti dalla categoria Primi
- [ ] Nota per un piatto: "senza cipolla" ✓ o ✗
- [ ] Clicca "Invia (2)" nel topbar
- [ ] Piatti appaiono sul monitor cuoco ✓ o ✗ (entro 3 secondi)
- [ ] Tavolo 3 diventa ROSSO sulla mappa ✓ o ✗

### Flusso cucina
- [ ] Cuoco clicca "▶ Inizia" su un piatto → in preparazione ✓ o ✗
- [ ] Cuoco clicca "✓ Segna pronto" → pronto ✓ o ✗
- [ ] Cameriere riceve beep + banner "Tavolo 3 — [piatto] PRONTO" ✓ o ✗
- [ ] Tavolo 3 diventa ARANCIONE con pallino pulse ✓ o ✗
- [ ] Badge tavolo mostra "X pronti" ✓ o ✗

### Servizio e chiusura
- [ ] Cameriere apre comanda tavolo 3
- [ ] Sezione "⚡ Da servire" visibile in cima ✓ o ✗
- [ ] Clicca "Tutto servito" ✓ o ✗
- [ ] Tavolo torna ROSSO (nessun piatto pronto) ✓ o ✗
- [ ] Cameriere chiude comanda → "Chiudi e incassa" ✓ o ✗
- [ ] Tavolo torna GRIGIO (libero) ✓ o ✗
- [ ] Su tutti i dispositivi contemporaneamente ✓ o ✗

### Secondo tavolo — ospite hotel
- [ ] Cameriere apre comanda tavolo 7 per ospiti hotel
- [ ] Aggiunge piatti
- [ ] Alla chiusura: nessun conto (incluso in camera) ✓ o ✗

### Tavolo con allergia
- [ ] Cameriere apre comanda tavolo con ospite celiaco (camera 8)
- [ ] Badge "⚠ Allergie" visibile nel topbar ✓ o ✗
- [ ] Piatti con glutine evidenziati in rosso ✓ o ✗
- [ ] Nota "CELIACO" nel carrello diventa rossa ✓ o ✗
- [ ] Monitor cucina mostra nota allergia in rosso ✓ o ✗

---

## POMERIGGIO — Operazioni (15:00)

### Titolare controlla dashboard
- [ ] Titolare apre /home
- [ ] KPI aggiornati: coperti pranzo, movimenti camere ✓ o ✗
- [ ] Nessun alert critico ✓ o ✗

### Cuoco aggiorna magazzino
- [ ] Cuoco scarica ingredienti usati per il pranzo
- [ ] Scansiona QR scaffale → inserisce quantità ✓ o ✗
- [ ] Un prodotto scende sotto soglia → alert appare ✓ o ✗

### Titolare fotografa DDT
- [ ] Titolare va su /archivio
- [ ] Carica foto DDT della consegna mattutina
- [ ] Categoria "ddt", data odierna ✓ o ✗

---

## SERA — Chiusura (23:00)

### Titolare registra incasso giornaliero
- [ ] Va su /home → "Registra incasso"
- [ ] Inserisce: contanti 340€, POS 1.250€
- [ ] KPI incasso aggiornato ✓ o ✗

### Titolare fotografa resoconto Z
- [ ] Va su /archivio → carica foto resoconto Z
- [ ] Categoria "resoconto_z" ✓ o ✗

### Tutti timbrano uscita
- [ ] Ogni dipendente timbra uscita ✓ o ✗
- [ ] Ore lavorate calcolate correttamente ✓ o ✗

---

## VERIFICA FINALE

### Report mensile
- [ ] Titolare genera report Excel del mese corrente
- [ ] Contiene tutte le timbrature di oggi ✓ o ✗

### Consistenza dati tra moduli
- [ ] Coperti in nota cucina = coperti in food cost magazzino ✓ o ✗
- [ ] Targhe ZTL: nessuna "mancante" per gli arrivi di oggi ✓ o ✗
- [ ] Alert dashboard: tutti risolti ✓ o ✗

---

## RISULTATO FINALE
- [ ] Tutti i ✓? → Sistema approvato per go-live
- [ ] Problemi trovati: _________________________________
- [ ] Data test: ________________
- [ ] Testato da: ________________
