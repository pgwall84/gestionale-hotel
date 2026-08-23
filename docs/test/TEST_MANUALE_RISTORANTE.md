# Test Manuale — Modulo 1.6 Ristorante

Checklist per testare il modulo ristorante in modo realistico con più dispositivi.
Eseguire nell'ordine indicato. Segnare ✓ o ✗ per ogni punto.

---

## PREREQUISITI

- [ ] Backend avviato (`cd backend && npm run dev`)
- [ ] Frontend avviato (`cd frontend && npm run dev`)
- [ ] ngrok attivo su porta 7001 (`ngrok http 7001`)
- [ ] `NEXT_PUBLIC_API_URL` aggiornato in `frontend/.env.local` con URL ngrok (con `/api`)
- [ ] Frontend riavviato dopo cambio `.env.local`

Riferimento: `docs/TEST_MOBILE.md` per la configurazione completa.

---

## UTENTI DI TEST

Verificare che esistano nel DB. Se non esistono, eseguire questo SQL:

```sql
-- Password "Test1234!" per tutti gli utenti di test
-- Hash bcrypt: $2b$10$53avqObUwKyNZRDfN2otVe.HEBqQtXl/EA8KRoz2isPRsi1AblrLu

INSERT INTO users (nome, email, password_hash, ruolo, attivo)
VALUES
  ('Titolare Test',     'titolare@hoteldelgolfo.com',    '$2b$10$53avqObUwKyNZRDfN2otVe.HEBqQtXl/EA8KRoz2isPRsi1AblrLu', 'titolare',     true),
  ('Cameriere Test',    'cameriere@hoteldelgolfo.com',   '$2b$10$53avqObUwKyNZRDfN2otVe.HEBqQtXl/EA8KRoz2isPRsi1AblrLu', 'cameriere',    true),
  ('Cuoco Test',        'cuoco@hoteldelgolfo.com',       '$2b$10$53avqObUwKyNZRDfN2otVe.HEBqQtXl/EA8KRoz2isPRsi1AblrLu', 'cuoco',        true),
  ('Receptionist Test', 'receptionist@hoteldelgolfo.com','$2b$10$53avqObUwKyNZRDfN2otVe.HEBqQtXl/EA8KRoz2isPRsi1AblrLu', 'receptionist', true)
ON CONFLICT (email) DO NOTHING;
```

Utenti da verificare:
- [ ] `titolare@hoteldelgolfo.com` — ruolo titolare
- [ ] `cameriere@hoteldelgolfo.com` — ruolo cameriere
- [ ] `cuoco@hoteldelgolfo.com` — ruolo cuoco
- [ ] `receptionist@hoteldelgolfo.com` — ruolo receptionist

---

## DISPOSITIVI

| Dispositivo | Ruolo | URL |
|-------------|-------|-----|
| PC Chrome (normale) | titolare | `http://localhost:7000` |
| PC Edge (InPrivate, `CTRL+SHIFT+N`) | cameriere | `http://IP_LOCALE:7000` |
| Smartphone | cuoco | `http://IP_LOCALE:7000` (Opzione A) o URL ngrok (Opzione B) |

---

## TEST 1 — Configurazione sala

- [ ] **Titolare** → `/sala` → vedi i 20 tavoli placeholder numerati 1–20
- [ ] **Titolare** → verifica che la configurazione "Standard" sia attiva (intestazione pagina)
- [ ] **Titolare** → pannello "Gestisci" → scheda "Layout sala" → crea configurazione "Test Evento"
- [ ] **Titolare** → attiva "Test Evento" → mappa si svuota (nessun tavolo)
- [ ] **Titolare** → aggiungi 5 tavoli (numeri 1–5) alla configurazione "Test Evento"
      → mappa mostra solo 5 tavoli
- [ ] **Titolare** → riattiva "Standard" → mappa torna a 20 tavoli
- [ ] Elimina "Test Evento" (opzionale — non ha tavoli, puoi lasciarla)

---

## TEST 2 — Prenotazioni

- [ ] **Receptionist** (o **titolare**) → `/sala` → sezione "Prenotazioni di oggi"
- [ ] Inserisci prenotazione tramite il tasto nella sidebar o `/prenotazioni`:
      - Nome: `Mario Rossi`
      - Data: oggi
      - Ora: `20:00`
      - Coperti: `4`
      - Note allergie: `celiaco`
- [ ] Verifica che "Mario Rossi" appaia nella lista prenotazioni di oggi su `/sala`
- [ ] **Titolare** → verifica visibilità della stessa prenotazione
- [ ] Testa assegnazione: clicca "Assegna" sulla prenotazione Mario Rossi
      → banner blu "Tocca un tavolo libero" appare?  ✓ / ✗
- [ ] Tocca il tavolo 3 → prenotazione assegnata al tavolo 3?  ✓ / ✗
      (il tavolo 3 diventa blu con etichetta "Rossi")
- [ ] Clicca "Rimuovi T3" → prenotazione scollegata dal tavolo?  ✓ / ✗

---

## TEST 3 — Flusso comanda completo ⭐ (il più importante)

Questo test verifica il flusso operativo completo e le notifiche SSE in tempo reale.

### Setup
- [ ] **Cuoco** → apri `/cucina` sullo **smartphone** → monitor vuoto, pallino verde "In diretta"
- [ ] **Cameriere** → apri `/sala` su **Edge InPrivate**

### Apertura comanda
- [ ] **Cameriere** → vedi il tavolo 3 nella mappa?  ✓ / ✗
- [ ] **Cameriere** → tocca il tavolo 3 (grigio = libero)
      → appare il **bottom sheet** con due opzioni?  ✓ / ✗
- [ ] **Cameriere** → scegli **"Apri comanda e aggiungi piatti →"**
      → navigazione a `/ristorante?comanda=X` **senza full page reload**?  ✓ / ✗
      (verifica: la barra del browser non mostra il caricamento della pagina intera)

### Aggiunta piatti
- [ ] **Cameriere** → espandi una categoria menu → aggiungi **2×** primo piatto con nota "cottura al dente"
- [ ] **Cameriere** → aggiungi **1×** secondo piatto senza note
- [ ] Lista righe mostra 2 piatti con stato "In attesa"?  ✓ / ✗

### Monitor cucina — SSE
- [ ] **Cuoco** → i piatti apppaiono sullo **smartphone in tempo reale** (senza refresh)?  ✓ / ✗
      (deve accadere entro 1–2 secondi dall'aggiunta)
- [ ] **Cuoco** → tocca il primo piatto → "Inizia" → stato → In preparazione  ✓ / ✗
- [ ] **Cameriere** → lo stato del piatto si aggiorna nel suo schermo senza refresh?  ✓ / ✗
- [ ] **Cuoco** → tocca → "Pronto ✓"
- [ ] **Cameriere** → **banner verde "🔔 Tavolo X — [nome piatto] PRONTO"** appare?  ✓ / ✗
- [ ] **Cameriere** → sentito il **beep sonoro** di notifica?  ✓ / ✗
      (potrebbe non funzionare su HTTP — normale, vedi `TEST_MOBILE.md` sezione 6)
- [ ] **Cameriere** → il **titolo della scheda browser** mostra "🔔 Tavolo X pronto"?  ✓ / ✗
- [ ] Ripeti per il secondo piatto

### Ritorno alla mappa
- [ ] **Cameriere** → tocca **"← Sala"** (pulsante in alto a sinistra)
      → torna a `/sala` in **1 tap** senza passare dalla lista comande?  ✓ / ✗
- [ ] **Cameriere** → il tavolo 3 è **verde** (occupato)?  ✓ / ✗
- [ ] **Titolare** su Chrome → il tavolo 3 risulta verde anche lì **senza refresh**?  ✓ / ✗
      (grazie a SSE aggiorna alla chiusura comanda — potrebbe richiedere qualche secondo)

### Servizio e chiusura
- [ ] **Cameriere** → tocca il tavolo 3 (verde) → naviga a `/ristorante?comanda=X`
- [ ] **Cameriere** → segna **tutti i piatti "Servito"** (tasto ✓ verde su ogni riga)
- [ ] **Cameriere** → clicca **"Conto"** → modale con riepilogo e totale corretto?  ✓ / ✗
      (verifica: 2 × prezzo primo + 1 × prezzo secondo)
- [ ] **Cameriere** → clicca **"Chiudi comanda"** → conferma → torna a `/sala`?  ✓ / ✗
- [ ] Tavolo 3 è **grigio** (libero) dopo la chiusura?  ✓ / ✗
- [ ] Su tutti i dispositivi il tavolo risulta libero (senza refresh)?  ✓ / ✗

---

## TEST 4 — Overbooking

- [ ] **Receptionist** → inserisci nuova prenotazione per **50 persone** alla stessa ora di Mario Rossi
      → sistema blocca con **messaggio di overbooking**?  ✓ / ✗
      (il ristorante ha max 70 coperti nominali — 50+4 = 54, dentro il limite.
       Testa con 67 coperti se già esistono prenotazioni)

> Nota: l'alert overbooking si basa sul totale coperti prenotati per la stessa ora.

---

## TEST 5 — Tipo speciale (Omaggio / Autoconsumo)

- [ ] **Titolare** → apri una comanda su tavolo 5
- [ ] Aggiungi un piatto qualsiasi
- [ ] Clicca il pulsante tipo speciale (icona stellina o etichetta) → seleziona **"Omaggio"**
      **senza inserire il motivo**
      → sistema blocca con errore "motivo obbligatorio"?  ✓ / ✗
- [ ] Seleziona **"Omaggio"** con motivo: `ospite VIP`
      → confermato, subtotale diventa **€ 0,00**?  ✓ / ✗
- [ ] Apri il conto → il piatto omaggio **non** contribuisce al totale?  ✓ / ✗
- [ ] Chiudi senza completare (lascia tavolo aperto per pulizia manuale)

---

## RISULTATO FINALE

**Tutti ✓ →** Modulo 1.6 approvato per produzione.

**Alcuni ✗ →** Annotare i problemi trovati qui sotto:

```
Problemi rilevati:
-
-
-
```

---

## CLEANUP DOPO I TEST

```sql
-- Rimuove gli utenti di test (opzionale — non interferiscono con la produzione)
DELETE FROM users WHERE email LIKE '%@hoteldelgolfo.com';

-- Rimuove prenotazioni di test
DELETE FROM prenotazioni_ristorante WHERE nome = 'Mario Rossi';

-- Chiude eventuali comande rimaste aperte
UPDATE comande SET stato = 'chiusa', timestamp_chiusura = NOW() WHERE stato = 'aperta';
```
