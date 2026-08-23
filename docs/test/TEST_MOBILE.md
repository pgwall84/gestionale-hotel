# Test su dispositivi mobili — Guida con ngrok

> **NOTA TECNICA:** il frontend usa `dynamic()` con `ssr: false` per `AppShell` e `AuthContext` — necessario per il corretto funzionamento su IP locale e ngrok. Non rimuovere questo pattern.

Questa guida permette di testare il gestionale dal telefono o tablet,
simulando l'uso reale del ristorante con cameriere su mobile e cuoco su tablet.

---

## 1. INSTALLAZIONE NGROK (una tantum)

1. Vai su **https://ngrok.com** e registrati gratuitamente
2. Dal dashboard scarica **ngrok per Windows** (file `.zip`)
3. Estrai l'eseguibile `ngrok.exe` nella root del progetto
   oppure in una cartella già nel PATH di sistema (es. `C:\Windows\System32`)
4. Recupera il tuo **Authtoken** dalla dashboard: **https://dashboard.ngrok.com**
5. Autenticati da terminale:
   ```
   ngrok config add-authtoken TUO_TOKEN_QUI
   ```
   Il token viene salvato in `~/.ngrok2/ngrok.yml` — da fare una volta sola.

---

## 2. AVVIO PER TEST (ogni sessione)

Apri **tre terminali separati** nella root del progetto:

**Terminale 1 — Backend:**
```
cd backend
npm run dev
```
Il backend parte su `http://localhost:7001`

**Terminale 2 — Frontend:**
```
cd frontend
npm run dev
```
Il frontend parte su `http://localhost:7000`

**Terminale 3 — ngrok (espone il backend):**
```
ngrok http 7001
```

ngrok mostra un output simile a:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:7001
```

Copia l'URL `https://abc123.ngrok-free.app` — è il backend raggiungibile da internet.
**Cambia ad ogni sessione ngrok.**

---

## 3. CONFIGURAZIONE FRONTEND PER NGROK

Il frontend usa la variabile `NEXT_PUBLIC_API_URL` per sapere dove chiamare il backend.
Il file `frontend/lib/api.js` usa già questa variabile con fallback a `localhost:7001`.

### File di esempio (già presente):
```
frontend/.env.local.example
```
Contiene:
```
NEXT_PUBLIC_API_URL=http://localhost:7001/api
```

### Per i test con ngrok:
1. Copia il file di esempio:
   ```
   copy frontend\.env.local.example frontend\.env.local
   ```
2. Apri `frontend/.env.local` e sostituisci con l'URL ngrok di questa sessione:
   ```
   NEXT_PUBLIC_API_URL=https://abc123.ngrok-free.app/api
   ```
   ⚠️ Aggiungi `/api` alla fine dell'URL ngrok.

3. **Riavvia il frontend** (CTRL+C nel terminale 2, poi `npm run dev`).
   Next.js carica le variabili `.env.local` solo all'avvio.

4. Al termine dei test, ripristina `localhost` nel `.env.local`
   (oppure cancella il file — il fallback torna a `localhost:7001/api`).

> **Nota:** `frontend/.env.local` è in `.gitignore` — non viene committato.

---

## 4. ACCESSO DAL CELLULARE

**⚠️ `localhost` dal telefono non funziona** — il telefono non conosce il tuo PC.

Hai due opzioni:

### OPZIONE A — Stessa rete WiFi (consigliata, più veloce)

Il telefono e il PC devono essere sulla **stessa rete WiFi**.

1. Trova l'IP locale del PC:
   - Apri il Prompt dei comandi → digita `ipconfig`
   - Cerca **"Adattatore LAN senza fili Wi-Fi"** → **"Indirizzo IPv4"**
   - Esempio: `192.168.1.45`

2. Sul telefono apri il browser e vai su:
   ```
   http://192.168.1.45:7000
   ```
   Il **frontend** è servito direttamente dal PC.
   Il **backend** viene chiamato tramite ngrok (configurato nel punto 3).

3. Se il browser dice "sito non raggiungibile": controlla che il firewall Windows
   non blocchi la porta 7000. Puoi aggiungere un'eccezione in:
   Pannello di controllo → Windows Defender Firewall → Regole in entrata.

### OPZIONE B — ngrok anche per il frontend (senza WiFi condiviso)

Apri un quarto terminale:
```
ngrok http 7000
```
ngrok mostra un secondo URL, es. `https://xyz789.ngrok-free.app`

Sul telefono vai direttamente su quell'URL — funziona anche con dati mobili.

> Nota: il piano gratuito di ngrok permette 1 tunnel attivo contemporaneamente.
> Per 2 tunnel servono 2 account ngrok oppure il piano a pagamento.
> **Opzione A è sempre preferibile** per i test interni.

---

## 5. SESSIONI MULTIPLE SULLO STESSO PC

Per simulare ruoli diversi contemporaneamente (titolare + cameriere + cuoco):

| Browser | Ruolo | URL |
|---------|-------|-----|
| Chrome (normale) | titolare | `http://localhost:7000` |
| Chrome (Incognito) | cameriere | `http://IP_LOCALE:7000` o ngrok |
| Edge | cuoco | `http://IP_LOCALE:7000` o ngrok |

Ogni browser mantiene cookie separati = sessioni JWT distinte = ruoli diversi.

Per aprire Chrome in incognito: `CTRL+SHIFT+N`
Per aprire Edge in InPrivate: `CTRL+SHIFT+N`

---

## 6. NOTA SU HTTPS E AUDIO

I browser moderni bloccano l'**AudioContext** (usato per il suono notifica) su pagine HTTP.
Con ngrok il backend è HTTPS ma il frontend servito via IP locale è HTTP.

- **Suono sul PC (localhost:7000):** funziona sempre
- **Suono via IP locale (http://192.168.1.45:7000):** potrebbe essere bloccato su iOS Safari
  → Soluzione: usare l'Opzione B con ngrok HTTPS per il frontend
- **Suono via ngrok HTTPS:** funziona sempre

Il banner visivo di notifica funziona in ogni caso, indipendentemente dal protocollo.
