# CLAUDE.md — Hotel del Golfo — Gestionale

> Leggi questo file integralmente prima di fare qualsiasi cosa.
> È il documento di riferimento permanente del progetto.

---

## 1. IDENTITÀ DEL PROGETTO

Gestionale interno per Hotel del Golfo (Liguria, Italia).
- 20 camere + casa in affitto
- Ristorante max 70 coperti (aperto anche a clienti esterni)
- 9 dipendenti
- Struttura: snc/srl

**Obiettivo attuale (Fase 1):** completare i moduli mancanti e deployare in produzione affiancato a TeamSystem Hospitality.

**Obiettivo futuro (Fase 2):** sostituire completamente TeamSystem Hospitality con questo gestionale + WuBook/WooDoo per le OTA.

---

## 2. STACK TECNOLOGICO — NON MODIFICARE SENZA APPROVAZIONE

```
Frontend:  Next.js App Router — porta 7000
           React con Hooks (useState, useEffect, useCallback, useRef)
           Tailwind CSS + CSS variables tema hotel
           Lucide React per icone
           js-cookie per JWT dai cookie
           qrcode.react, jspdf per QR e PDF client-side
           Nessun state manager globale — solo AuthContext

Backend:   Node.js + Express — porta 7001
           Tutte le route su /api/*
           JWT 8h in cookie token
           multer per upload file
           exceljs per export Excel
           archiver v8 per ZIP

Database:  PostgreSQL 17
           Nome database: gestionale_hotel

Permessi:  shared/ruoli.js — centralizzato, condiviso frontend e backend
```

**Non installare nuove dipendenze senza prima descrivere il motivo nel piano.**

---

## 3. RUOLI UTENTE (7 — NON 5)

```javascript
// shared/ruoli.js — fonte di verità per i permessi
const RUOLI = {
  ADMIN: 'admin',
  TITOLARE: 'titolare',
  RECEPTIONIST: 'receptionist',
  CAMERIERE: 'cameriere',
  CUOCO: 'cuoco',
  PORTIERE_NOTTE: 'portiere_notte',
  DIPENDENTE: 'dipendente'
}
```

Ogni nuovo endpoint e ogni nuova pagina deve rispettare i permessi definiti in shared/ruoli.js.

---

## 4. STRUTTURA DEL PROGETTO

```
gestionale-hotel/
├── frontend/
│   ├── app/                    → pagine Next.js (App Router)
│   ├── components/
│   │   ├── layout/             → AppShell.tsx, Sidebar.tsx, Topbar.tsx
│   │   └── ui/                 → AlertItem, DataTable, KpiCard, StatusBadge
│   ├── context/AuthContext.js
│   └── lib/
│       ├── api.js              → helper fetch verso backend
│       └── ruoli.js            → permessi lato frontend
├── backend/
│   ├── config/db.js            → connessione PostgreSQL
│   ├── controllers/            → logica business
│   ├── middleware/auth.js      → verificaToken, soloTitolare
│   ├── routes/                 → routing Express
│   └── server.js
├── database/
│   ├── migrations/             → file SQL in ordine numerico
│   └── seed.sql
├── tests/                      → batterie di test per modulo
│   ├── setup.js                → configurazione Jest + Supertest
│   ├── agent/                  → script agente AI per generazione test
│   └── [modulo].test.js        → test per ogni modulo
└── shared/
    └── ruoli.js                → fonte di verità permessi
```

---

## 5. CONVENZIONI OBBLIGATORIE

### Backend — Pattern controller

```javascript
// backend/controllers/esempiController.js

const pool = require('../config/db');

// Restituisce la lista degli elementi
// Accessibile a: titolare, admin
const getLista = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, campo1, campo2 FROM tabella WHERE attivo = true ORDER BY created_at DESC',
      []
    );
    res.json(result.rows);
  } catch (err) {
    console.error('getLista error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

// Crea un nuovo elemento
// Accessibile a: titolare, admin
const crea = async (req, res) => {
  const { campo1, campo2 } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO tabella (campo1, campo2) VALUES ($1, $2) RETURNING *',
      [campo1, campo2]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('crea error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
};

module.exports = { getLista, crea };
```

### Backend — Pattern route

```javascript
// backend/routes/esempio.js

const express = require('express');
const router = express.Router();
const { verificaToken, soloTitolare } = require('../middleware/auth');
const ctrl = require('../controllers/esempiController');

// GET /api/esempio — lista elementi
router.get('/', verificaToken, ctrl.getLista);

// POST /api/esempio — crea elemento (solo titolare/admin)
router.post('/', verificaToken, soloTitolare, ctrl.crea);

module.exports = router;
```

### Backend — Query SQL

- **Sempre** parametri preparati ($1, $2...) — mai concatenazione stringhe
- **Mai** SELECT * in produzione — elencare sempre le colonne necessarie
- Usare RETURNING * su INSERT/UPDATE per avere il record aggiornato

### Frontend — Pattern pagina

```jsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

export default function PaginaModulo() {
  const { utente } = useAuth();
  const [dati, setDati] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    caricaDati();
  }, []);

  const caricaDati = async () => {
    try {
      setLoading(true);
      const risposta = await api.get('/modulo');
      setDati(risposta.data);
    } catch (err) {
      setErrore('Errore nel caricamento');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Caricamento...</div>;
  if (errore) return <div>{errore}</div>;

  return ( /* JSX della pagina */ );
}
```

### Lingua

**Tutto in italiano.** Label, placeholder, messaggi di errore, tooltip, notifiche, commenti nel codice — tutto in italiano. Nessuna stringa in inglese visibile all'utente.

### Commenti nel codice

Ogni funzione, route e componente commentato in italiano con: cosa fa, chi può accedervi, dipendenze rilevanti.

---

## 6. DATABASE — STATO ATTUALE

### Tabelle esistenti (NON modificare senza migration)

```
users                   — autenticazione, 7 ruoli
timbrature              — entrata/uscita
turni                   — turni giornalieri
turni_standard          — turno default per utente
richieste_assenza       — ferie/permesso/malattia
scadenze                — alert scadenze
documenti_dipendente    — upload documenti HR
comunicazioni           — bacheca con ruoli_destinatari
haccp_checklist         — checklist pulizie
ospiti_giornalieri      — coperti colazione/pranzo/cena + allergie
camere                  — numero e nome camera
stato_camere            — arrivo/partenza/pronta per data
ztl_prenotazioni        — targhe con 6 stati
menu_categorie          — categorie menu
menu_piatti             — piatti con allergeni
fornitori               — anagrafica fornitori magazzino
prodotti                — anagrafica prodotti magazzino
movimenti_magazzino     — carichi e scarichi
ricette                 — ricette di riferimento
ricette_ingredienti     — ingredienti per ricetta
configurazioni_sala     — layout sala ristorante
tavoli                  — tavoli con posizione
prenotazioni_ristorante — prenotazioni tavoli
comande                 — comande aperte per tavolo
comande_righe           — singoli piatti per comanda
incassi_giornalieri     — incasso cassa/POS giornaliero
archivio_documenti      — documenti aziendali fotografati
refresh_tokens          — sicurezza: logout da tutti i dispositivi
audit_log               — sicurezza: log accessi dati sensibili
```

### Regole migration

- File SQL numerati progressivamente: `003_nome.sql`, `004_nome.sql`
- Mai modificare migration già eseguite — creare sempre una nuova
- Ogni migration deve avere un commento descrittivo in cima

---

## 7. SICUREZZA — REGOLE ASSOLUTE

### Mai fare

- ❌ Credenziali o API key nel codice sorgente
- ❌ File .env committati in Git
- ❌ SELECT senza WHERE su tabelle con dati personali
- ❌ Concatenazione stringhe nelle query SQL
- ❌ Log di dati sensibili (password, token, documenti identità)
- ❌ Chiamate a API esterne dal frontend React

### Sempre fare

- ✅ Validare tutti gli input lato backend
- ✅ Usare verificaToken su tutti gli endpoint autenticati
- ✅ Loggare in audit_log gli accessi a dati sensibili
- ✅ Usare parametri preparati nelle query PostgreSQL

### Variabili d'ambiente backend (.env — mai in Git)

```
DATABASE_URL
JWT_SECRET
JWT_REFRESH_SECRET
ENCRYPTION_KEY
# Future (Fase 2):
WUBOOK_PROVIDER_KEY
ACUBE_API_KEY
FATTURE_IN_CLOUD_CLIENT_ID
FATTURE_IN_CLOUD_CLIENT_SECRET
SENDGRID_API_KEY
WEBHOOK_SECRET_WUBOOK
WEBHOOK_SECRET_ACUBE
```

---

## 8. PIANO DI SVILUPPO — ORDINE OBBLIGATORIO

### FASE 0 — Fondamenta (COMPLETATA)

| N. | Modulo | Stato |
|----|--------|-------|
| 0.1 | Autenticazione JWT, refresh token, 7 ruoli | ✅ Fatto |
| 0.2 | Sicurezza base (Helmet, rate limit, audit log) | ✅ Fatto |
| 0.3 | Layout shell, Sidebar, Topbar, componenti UI | ✅ Fatto |
| 0.4 | Migration database completo | ✅ Fatto |
| 0.5 | **Setup testing** — Jest + Supertest + Playwright + script agente AI | ✅ Fatto |

### FASE 1 — Operatività interna affiancato a TS

| N. | Modulo | Stato |
|----|--------|-------|
| 1.1 | HR completo (timbrature, turni, ferie, scadenze, documenti, comunicazioni, HACCP) | ✅ Fatto |
| 1.2 | Note cucina ospiti (coperti giornalieri + allergie) | ✅ Fatto |
| 1.3 | Camere — anagrafica + stato giornaliero | ✅ Fatto |
| 1.4 | ZTL — targhe 6 stati + import Excel + OCR | ✅ Fatto |
| 1.5 | Menu — categorie, piatti, allergeni, QR pubblico, stampa | ✅ Fatto |
| 1.6 | **Ristorante** — prenotazioni, sala, comande, monitor cucina SSE, conto | ✅ Fatto |
| 1.7 | **Magazzino** — prodotti, QR/barcode, movimenti, alert, fornitori, food cost | ✅ Fatto |
| 1.8 | **Dashboard KPI reali** — dati reali, alert aggregati, confronto anno precedente | Da fare |
| 1.9 | **Archivio documentale** — upload foto, categorie, ricerca | Da fare |
| 1.10 | **Deploy VPS** — Nginx, PM2, SSL, backup automatico | Da fare (parallelo) |
| 1.11 | **Sito web** — Next.js + Sanity CMS + SEO + AEO, su Vercel, booking engine TS | Da fare (parallelo) |

**Nota 1.6 completato:** Fix trovati dai test: validazione transizioni stati comanda,
blocco chiusura con piatti non serviti, check duplicato tavolo,
blocco eliminazione tavolo occupato, distinzione 404/400 rimozione riga.
77 test verdi. Commit: bf3b320.

**Nota 1.6 — redesign comanda cameriere + allergeni:**
- Frontend /ristorante: layout 3 zone (topbar / selezione piatti / carrello fisso).
  Topbar: badge ⚠ Allergie se note_allergie_oggi non vuote.
  Categorie verticale 72px + lista piatti con badge allergeni grigi/rossi,
  card rossa e banner avviso se match con allergia ospite.
  Carrello: qty +/-, nota 16px (no iOS zoom), nota rossa se parole chiave allergia.
  Pulsante "Invia alla cucina" → POST batch righe.
  BASE_URL module-level rimosso; SSE URL a runtime.
- Backend salaController: listaTavoli aggiunge note_allergie_oggi via subquery scalare.
- Backend comandeController: SSE stato_iniziale include mp.allergeni + note_allergie_oggi;
  nuova_riga broadcast include allergeni; dettaglioComanda include allergeni e descrizione.
- Frontend /cucina: CardRiga mostra badge allergeni rossi/grigi, nota in box rosso
  se parole chiave allergia, sfondo riga #FFF8F8 se match. note_allergie_oggi
  estratto da evento stato_iniziale SSE.
- KEYWORD_MAP e hasMatch() implementati in entrambe le pagine (no shared file).
  87 test verdi.

**Nota 1.6 — redesign monitor cucina + mappa sala:**
- Monitor cucina: card per comanda (non per singolo piatto), timer verde/giallo/rosso,
  pulsante "Tutto pronto" per comanda → POST /comande/:id/tutto-pronto.
  Nuovo endpoint nel controller + route.
- Mappa sala: card quadrate (aspect-ratio 1), colori esatti con hex fissi
  (LIBERO #F5F5F5, OCCUPATO #FCEBEB, PRONTO #FAEEDA), pulse dot amber 8px.
  Griglia auto-fill minmax(90px,1fr), legenda a 3 stati.
  BASE_URL module-level rimosso (era inutilizzato).
  84 test verdi.

**Nota 1.6 — patch UX post-release:** Fix 4 gap operativi su /sala e /ristorante.
- Fix 1: bottom sheet su tavolo libero ("Apri e aggiungi piatti" / "Solo segna occupato").
- Fix 2: window.location.href → router.push() (no full page reload).
- Fix 3: "← Sala" torna direttamente a /sala in 1 tap invece di 2.
- Fix 4: SSE attivo su /sala/stream (camerieri), polling rimosso da /sala e /ristorante,
  notifiche "piatto pronto" implementate (banner visivo + suono AudioContext + document.title),
  sblocco AudioContext preventivo al primo tap (compatibilità iOS/Android).
  Nuovo endpoint GET /api/ristorante/sala/stream. 79 test verdi.

**Nota 1.6 → 1.7:** Il ristorante va prima del magazzino perché le comande alimentano il food cost del magazzino.
**Nota 1.11:** Il sito è completamente indipendente — può partire in qualsiasi momento in parallelo. Nella Fase 1 usa ancora il widget TS per le prenotazioni camere.

### FASE 2A — Sostituzione TS: prenotazioni e OTA

| N. | Modulo | Note |
|----|--------|------|
| 2.1 | Anagrafica ospiti completa + OCR documenti identità | Base per tutto il PMS |
| 2.2 | Planning camere — disponibilità, tariffe, stagionalità, pacchetti all-inclusive | Dipende da 2.1 |
| 2.3 | Integrazione WuBook/WooDoo — channel manager + webhook prenotazioni | Dipende da 2.2 |
| 2.4 | Tassa di soggiorno custom — calcolo per notte/ospite, report Comune | Collegata al planning |
| 2.5 | Alloggiati Web — intermediario REST certificato (non SOAP diretto) | Dipende da 2.1 |

### FASE 2B — Sostituzione TS: fiscale e pagamenti

| N. | Modulo | Note |
|----|--------|------|
| 3.1 | Integrazione A-Cube — scontrini ristorante + camera, annulli, omaggi, autoconsumo | Dopo ristorante e check-out stabili |
| 3.2 | Fatturazione B2B — Fatture in Cloud o A-Cube per ospiti aziendali | Dopo 3.1 |
| 3.3 | Pagamenti online — Nexi (default) + Stripe (alternativa) via WuBook | Collegato a booking engine |

### FASE 2C — Canale diretto e ospite

| N. | Modulo | Note |
|----|--------|------|
| 4.1 | Booking engine — Next.js legge disponibilità da WuBook, WuBook gestisce transazione | Dipende da 2.2 e sito 1.11 |
| 4.2 | Welcome Book digitale — multilingua IT/EN/FR/DE, QR in camera, collegato al menu | Collegato al sito |

### FASE 2D — Esperienza ospite avanzata

| N. | Modulo | Note |
|----|--------|------|
| 5.1 | Check-in/check-out digitale — stato camere real-time, housekeeping | Dipende da planning e anagrafica |
| 5.2 | Pre check-in digitale — form ospite, OCR, email automatica, codice Omnitec | Dopo 5.1 e Alloggiati Web |
| 5.3 | Email/SMS automatici — conferma, pre-arrivo, post-partenza, recensione | Dopo booking engine e pre check-in |

### FASE 3 — AI e ottimizzazione (futuro)

| N. | Modulo | Note |
|----|--------|------|
| 6.1 | HACCP avanzato — temperature, scongelo, cotture | Dopo switch-off TS |
| 6.2 | Agente AI interno — assistente in linguaggio naturale per titolare/staff | Quando tutti i dati sono nel sistema |
| 6.3 | Revenue management — RevPAR, occupazione storica, suggerimenti tariffari | Dopo almeno 1 anno di dati |

---

## 9. SETUP TESTING (Modulo 0.5 — FARE PRIMA DI STEP 1.6)

### Stack di test

```bash
# Installare nella root del progetto
npm install --save-dev jest supertest @playwright/test

# Script in package.json
"test": "jest",
"test:api": "jest tests/api",
"test:e2e": "playwright test",
"test:modulo": "node tests/agent/genera-test.js"
```

### Struttura test

```
tests/
├── setup.js                    → configurazione globale Jest
├── helpers/
│   ├── auth.js                 → helper per ottenere token di test
│   └── db.js                   → helper per reset DB tra i test
├── api/
│   ├── auth.test.js            → test autenticazione
│   ├── hr.test.js              → test modulo HR
│   ├── ristorante.test.js      → test modulo ristorante
│   └── ...
├── e2e/
│   ├── login.spec.js           → test end-to-end login
│   └── ...
└── agent/
    └── genera-test.js          → script agente AI per generazione test
```

### Script agente AI per generazione test automatica

Lo script `tests/agent/genera-test.js` funziona così:

```javascript
// Uso: node tests/agent/genera-test.js ristorante
// 1. Legge tutti i file del modulo indicato (controller + route + migration)
// 2. Chiama l'API di Claude con il codice come contesto
// 3. Claude genera la batteria di test appropriata
// 4. Salva il file tests/api/{modulo}.test.js
// 5. Esegue i test e mostra il report in italiano
```

### Cosa testare per ogni modulo

Per ogni modulo completato (1.6, 1.7, 1.8, 1.9 ecc.) la batteria di test deve coprire:

```
1. Endpoint autenticazione:
   → senza token → 401
   → con token ruolo sbagliato → 403
   → con token valido → 200/201

2. Validazione input:
   → campi obbligatori mancanti → 400 con messaggio chiaro
   → tipi di dato errati → 400

3. Logica business:
   → operazione corretta → dato salvato nel DB
   → constraint violato → errore gestito

4. Permessi per ruolo:
   → ogni endpoint testato con ogni ruolo rilevante

5. Smoke test frontend (Playwright):
   → pagina si carica senza errori
   → dati appaiono nella tabella
   → form funziona end-to-end
```

---

## 10. FLUSSO PLAN-THEN-EXECUTE

**Obbligatorio per ogni task che coinvolge più di 3 file o aggiunge una funzionalità completa.**

### Formato del piano (scrivilo sempre prima di iniziare)

```
PIANO — [Nome funzionalità] — Modulo [N.]

File da creare:
  - backend/controllers/nomeController.js
  - backend/routes/nome.js
  - frontend/app/pagina/page.jsx
  - tests/api/nome.test.js

File da modificare:
  - backend/server.js (aggiungere require e app.use)
  - shared/ruoli.js (se necessario)

Migration necessaria:
  - Nessuna / database/migrations/00X_nome.sql

Dipendenze nuove:
  - Nessuna / nome-pacchetto (motivo specifico)

Flusso dati:
  Frontend → POST /api/nome → controller → PostgreSQL → response JSON

Permessi per ruolo:
  - titolare: lettura + scrittura
  - receptionist: solo lettura
  - ...

Test da generare dopo:
  - node tests/agent/genera-test.js nome

Rischi identificati:
  - [eventuale problema tecnico o edge case]

Stima:
  - X file, circa Y minuti
```

### Sequenza di esecuzione

1. Scrivi il piano nel formato sopra
2. Attendi conferma prima di scrivere codice
3. Esegui nell'ordine: migration → controller → route → server.js → pagina frontend
4. Dopo ogni file completato: breve segnalazione di avanzamento
5. Quando il modulo è completo: esegui `node tests/agent/genera-test.js [modulo]`
6. Mostra il report dei test in italiano
7. Se tutti i test passano: modulo completato, aggiorna questo CLAUDE.md marcando il modulo come ✅

---

## 10b. PIANO COMPLETATO — Redesign Monitor Cucina + Mappa Sala ✅

```
PIANO — Redesign Monitor Cucina + Mappa Sala — Modulo 1.6

File da creare:
  - Nessuno

File da modificare:
  1. backend/controllers/comandeController.js
     → aggiunge funzione tuttoProonto(req, res): UPDATE comande_righe
       SET stato = 'pronto' WHERE comanda_id = $1 AND stato NOT IN ('pronto','servito')
       poi broadcast SSE 'stato_iniziale' aggiornato a tutti clientiCucina.
     → aggiornaStatoRiga: nessuna modifica, già broadcast corretto.

  2. backend/routes/ristorante.js
     → aggiunge route PRIMA di /comande/:id/chiudi:
       POST /comande/:id/tutto-pronto → ruoli CUCINA → comande.tuttoProonto

  3. frontend/app/cucina/page.jsx  [REDESIGN COMPLETO]
     → STATE: righe[] invariato, connesso/errore invariati
     → LOGICA: raggruppa righe per comanda_id in oggetto { comanda_id, tavolo_numero,
       timestamp_apertura, righe[] }. Ordina per timestamp_apertura ASC.
     → TIMER: Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
       Verde 0–7min, Giallo 8–11min, Rosso ≥12min.
     → CARD COMANDA:
       Header: "Tavolo N  ⏱ Xmin" con sfondo timer-colore; badge "Tutto pronto" se
       almeno 1 riga è in_attesa o in_preparazione → POST /comande/:id/tutto-pronto.
       Body: elenco righe con stato individuale e pulsante avanza (stato ≠ pronto).
       Scompare client-side quando tutte le righe sono 'servito'.
     → SEZIONI: "Da preparare" (comande con ≥1 riga non pronta) | "Pronti" (tutte pronte).
     → Mantiene: SSE URL a runtime in connetti(), riconnessione 5s, eventi esistenti.

  4. frontend/app/sala/page.jsx  [REDESIGN COMPLETO]
     → Mappa compatta: griglia CSS auto-fill minmax(90px,1fr), card quadrate aspect-ratio 1.
     → Colori esatti per stato:
         LIBERO:   background #F5F5F5  border #D4D4D4  text #737373
         OCCUPATO: background #FCEBEB  border #F09595  text #A32D2D
         PRONTO:   background #FAEEDA  border #EF9F27  text #633806
                   + pulse dot 8px amber in alto a destra
     → Logica stati: libero = comanda_id nullo; pronto = piatti_pronti > 0;
       occupato = comanda_id presente E piatti_pronti === 0.
     → Contenuto card: numero tavolo (bold), etichetta (se c'è), badge piatti.
     → Legenda: 3 quadratini colorati con label in basso alla mappa.
     → Mantiene: SSE URL a runtime, eventi riga_pronta/riga_servita/comanda_chiusa/
       comanda_aperta, notifiche audio, logica tap su tavolo invariata.

  5. tests/api/ristorante.test.js
     → Test 82: POST /comande/:id/tutto-pronto senza token → 401
     → Test 83: POST /comande/:id/tutto-pronto con ruolo wrong (receptionist) → 403
     → Test 84: POST /comande/:id/tutto-pronto con cuoco su comanda aperta →
       200, tutte le righe non-servite diventano pronto
     → (timestamp_apertura già presente in DB da migration precedente)

Migration necessaria:
  - Nessuna (timestamp_apertura esiste già in comande)

Dipendenze nuove:
  - Nessuna

Flusso dati endpoint nuovo:
  Cucina tocca "Tutto pronto" → POST /api/ristorante/comande/:id/tutto-pronto
  → tuttoProonto controller → UPDATE comande_righe (non pronto e non servito → pronto)
  → broadcastCucina('stato_iniziale', righe aggiornate) → cucina/page.jsx riceve SSE

Permessi per ruolo endpoint nuovo:
  - cuoco, cameriere, titolare, admin: accesso
  - receptionist, portiere_notte, dipendente: 403

Rischi identificati:
  - Card comanda deve sparire solo lato client (evento 'servito' arriva già via SSE
    riga_rimossa o stato_riga_aggiornato); nessun nuovo evento da creare.
  - Turbopack cache: se il frontend non ricarica correttamente, eliminare .next.
  - Timer usa Date.now() al render — aggiornare ogni minuto con setInterval in useEffect.

Sequenza di esecuzione:
  1. backend/controllers/comandeController.js (aggiunge tuttoProonto)
  2. backend/routes/ristorante.js (aggiunge route)
  3. frontend/app/cucina/page.jsx (redesign completo)
  4. frontend/app/sala/page.jsx (redesign completo)
  5. tests/api/ristorante.test.js (test 82–84)
  6. npm test → verifica tutti i test verdi
  7. Aggiorna CLAUDE.md

Stima:
  - 5 file, ~30 minuti
```

---

## 10c. PIANO COMPLETATO — Redesign comanda cameriere + allergeni cucina ✅

```
PIANO — Redesign schermata comanda + integrazione allergeni — Modulo 1.6

File da creare:
  - Nessuno

File da modificare:
  1. backend/controllers/salaController.js
     → listaTavoli: aggiunge note_allergie ospiti del giorno
       via subquery scalare:
       (SELECT note_allergie FROM ospiti_giornalieri
        WHERE data = CURRENT_DATE LIMIT 1) AS note_allergie_oggi
       Nessun JOIN extra — subquery scalare restituisce NULL se
       il record non esiste (no crash).

  2. backend/controllers/comandeController.js
     → streamCucina (query stato_iniziale): aggiunge mp.allergeni
       alla SELECT delle righe.
     → streamCucina: aggiunge campo note_allergie_oggi nel payload
       stato_iniziale: recupera con query separata su ospiti_giornalieri.
     → nuova_riga broadcast: aggiunge allergeni al payload riga
       (già recupera info piatto — basta aggiungere mp.allergeni).
     → dettaglioComanda: aggiunge mp.allergeni alla query righe.

  3. frontend/app/ristorante/page.jsx  [REDESIGN COMPLETO]
     → Rimuove BASE_URL module-level (inutilizzato).
     → Aggiunge KEYWORD_MAP e hasMatch() per match allergie.
     → Carica note_allergie_oggi da GET /ristorante/tavoli
       (risposta include il campo per il tavolo selezionato).
     → Nuovo layout a 3 zone (full-height, overflow controllato):
         ZONA 1 — Topbar: "Tavolo X" + coperti + badge ⚠ Allergie
         ZONA 2 — Selezione piatti:
           Sinistra 72px: lista categorie verticale con emoji
           Destra flex-1: lista piatti con badge allergeni
             + card rossa se match con ospite + banner avviso
         ZONA 3 — Carrello fisso in basso:
           Header: icona + "Ordine" + badge count + totale €
           Righe: qty -/N/+ | nome | prezzo + nota input 16px
           Footer: "Invia alla cucina" → POST batch righe
     → Mantiene: modale conto, chiudi comanda, SSE notifiche,
       vista lista comande invariata.

  4. frontend/app/cucina/page.jsx
     → CardRiga: aggiunge sotto nome piatto:
         - Badge allergeni (grigi/rossi basati su hasMatch)
         - Nota: grigia normale, box rosso #FCEBEB se parole
           chiave allergia nella nota
       Sfondo riga #FFF8F8 se almeno 1 match allergene.
     → Estrae note_allergie_oggi dal payload SSE stato_iniziale
       (nuovo campo nel broadcast cucina).
     → hasMatch() e KEYWORD_MAP estratte in module scope condiviso
       (copiate in entrambe le pagine — non serve file shared).

  5. tests/api/ristorante.test.js
     → Test 85: GET /tavoli include note_allergie_oggi
       (null se nessun record ospiti_giornalieri oggi)
     → Test 86: GET /comande/:id include allergeni per ogni riga
     → Test 87: ospiti_giornalieri senza record oggi → 
       GET /tavoli non restituisce errore (note_allergie_oggi = null)

Migration necessaria:
  - Nessuna (allergeni in menu_piatti già esistente,
    note_allergie in ospiti_giornalieri già esistente)

Dipendenze nuove:
  - Nessuna

Flusso dati allergie (frontend):
  GET /ristorante/tavoli → note_allergie_oggi nel tavolo
  GET /menu/piatti       → allergeni[] per ogni piatto
  hasMatch(allergeniPiatto, note_allergie_oggi) → array match
  match.length > 0 → card rossa + badge rossi

Flusso dati allergie (cucina SSE):
  stato_iniziale → { righe: [..., allergeni: [...]], note_allergie_oggi }
  nuova_riga     → { riga: { ..., allergeni: [...] } }
  → CardRiga usa note_allergie_oggi dallo state globale cucina

Permessi: nessuna modifica ai ruoli

Rischi identificati:
  - ospiti_giornalieri potrebbe avere 0 righe oggi → subquery
    scalare restituisce NULL → hasMatch([...], null) → [] → OK.
  - allergeni in PostgreSQL è array — serializato come JSON array
    in risposta API (già funziona con altri array nel progetto).
  - BASE_URL in ristorante/page.jsx era usato per SSE (riga 137):
    la URL SSE va corretta a runtime come in sala/page.jsx.

Sequenza di esecuzione:
  1. backend/controllers/salaController.js
  2. backend/controllers/comandeController.js
  3. frontend/app/ristorante/page.jsx
  4. frontend/app/cucina/page.jsx
  5. tests/api/ristorante.test.js
  6. npm test → verifica tutti e 87 test verdi
  7. git commit + aggiorna CLAUDE.md

Stima:
  - 5 file, ~45 minuti
```

---

## 10d. PIANO ATTIVO — Fix 1 libera tavolo, Fix 2 chiusura con tipo

```
PIANO — Libera tavolo + Chiusura comanda tipizzata — Modulo 1.6

File da creare:
  - database/migrations/011_omaggi_autoconsumi.sql

File da modificare:
  1. backend/controllers/comandeController.js
     → nuova funzione eliminaComanda:
         DELETE /api/ristorante/comande/:id
         Solo se nessuna riga. Broadcast 'comanda_eliminata'.
     → chiudiComanda: aggiunge gestione tipo (normale/omaggio/autoconsumo).
         tipo omaggio  → ruolo in [titolare,admin], motivo obbligatorio,
                         INSERT omaggi, UPDATE comande.tipo_chiusura
         tipo autoconsumo → ruolo in [titolare,admin], user_id+valore_costo,
                         INSERT autoconsumi, UPDATE comande.tipo_chiusura
         tipo normale  → invariato

  2. backend/routes/ristorante.js
     → aggiunge DELETE /comande/:id → ruoli CMD_W → eliminaComanda
       (PRIMA di /comande/:id — stessa sezione delle route per id)

  3. frontend/app/sala/page.jsx
     → vaiAComanda: invece di navigare direttamente, apre un
       nuovo BottomSheetTavoloOccupato che carica il dettaglio
       comanda (GET /comande/:id) per sapere se ha righe.
     → BottomSheetTavoloOccupato:
         se righe.length === 0: "Vedi comanda" | "Libera tavolo" | "Annulla"
         se righe.length > 0:  "Vedi comanda" | "Annulla"
       "Libera tavolo" → DELETE /comande/:id → carica() → chiudi sheet
     → Nasconde "Libera tavolo" a cuoco/portiere_notte/dipendente
       (solo se utente ha ruolo in [admin, titolare, cameriere])

  4. frontend/app/ristorante/page.jsx
     → Sostituisce la logica "Chiudi comanda" con un
       BottomSheetChiusuraComanda.
     → Componente con 3 opzioni visibili in base al ruolo:
         Conto normale: sempre visibile
         Omaggio: solo titolare/admin
         Autoconsumo: solo titolare/admin
     → Omaggio: campo motivo obbligatorio (disabled se vuoto)
     → Autoconsumo: select utenti attivi (GET /api/users)
                    + input numerico valore_costo
     → Tutti e 3 → PATCH /comande/:id/chiudi con { tipo, ... }
     → Successo → router.push('/sala')

  5. tests/api/ristorante.test.js
     → Test 88: DELETE comanda vuota → 200
     → Test 89: DELETE comanda con righe → 400
     → Test 90: chiudi omaggio senza motivo → 400
     → Test 91: chiudi omaggio con motivo → 200 + INSERT omaggi
     → Test 92: chiudi autoconsumo → 200 + INSERT autoconsumi
     → Test 93: cameriere tenta omaggio → 403
     → Test 94: cameriere tenta autoconsumo → 403

Migration necessaria:
  - 011_omaggi_autoconsumi.sql:
    CREATE TABLE omaggi (id, comanda_id, tavolo_id, motivo,
      valore_omaggio, user_id, data, created_at)
    CREATE TABLE autoconsumi (id, comanda_id, tavolo_id,
      consumatore_id, valore_costo, valore_listino,
      autorizzato_da, data, created_at)
    ALTER TABLE comande ADD COLUMN IF NOT EXISTS tipo_chiusura

Dipendenze nuove: Nessuna

Rischi identificati:
  - DELETE /comande/:id ha lo stesso pattern di /comande/righe/:id —
    va dichiarata DOPO le route /righe per non catturarle.
    In Express, DELETE /comande/:id NON cattura /comande/righe/X
    perché "righe" non è un numero, ma per sicurezza la mettiamo
    dopo le route /righe esistenti e prima di /comande/:id.
  - GET /api/users per la select autoconsumo: verificare che la
    route esista e restituisca utenti attivi. Se filtra solo attivi
    con WHERE attivo=true, altrimenti aggiungere il filtro lato frontend.
  - chiudiComanda: i test esistenti (63-65) non passano tipo →
    il campo tipo deve default a 'normale' se non presente.

Sequenza di esecuzione: COMPLETATA (2026-07-05)
  ✓ 1. Migration 011
  ✓ 2. backend/controllers/comandeController.js
  ✓ 3. backend/routes/ristorante.js
  ✓ 4. frontend/app/sala/page.jsx
  ✓ 5. frontend/app/ristorante/page.jsx
  ✓ 6. tests/api/ristorante.test.js
  ✓ 7. npm test → 94/94 verdi
  ✓ 8. CLAUDE.md aggiornato
  ✓ 9. git commit
```

---

## 11. SPECIFICHE FUNZIONALI MODULI DA COMPLETARE

### Modulo 1.6 — Ristorante

```
Configurazioni sala:
  Standard (caricata di default ogni mattina)
  + configurazioni eventi salvabili (es. Evento60, Gala)
  Cambio configurazione con un click

Mappa sala:
  Griglia semplice con tavoli numerati
  Spostabili con il dito su tablet
  Mostra: numero tavolo, coperti, stato (libero/occupato/da pulire)

Prenotazioni ristorante:
  Inserimento manuale (da telefonata): nome, ora, coperti, telefono, allergie, note
  Protezione overbooking — alert se coperti esauriti
  Vista giornaliera per responsabile sala

Comande:
  Cameriere: seleziona tavolo → tocca piatti dal menu del giorno → note per piatto → INVIA
  Stati riga: in_attesa → in_preparazione → pronto → servito
  Notifica cameriere quando cuoco segna "pronto"

Monitor cucina (SSE — Server-Sent Events):
  Tablet a parete sempre aperto su /cucina
  Aggiornamento real-time senza refresh
  Alert visivo/sonoro per nuove comande
  Cuoco tocca ogni piatto per aggiornare lo stato

Conto:
  Riepilogo comande del tavolo con totale
  Chiusura manuale sul registratore di cassa (per ora)
  Ospiti hotel: nessun conto — prezzo incluso nella camera

Omaggi e autoconsumo:
  Omaggio: titolare/admin, motivo obbligatorio → INSERT omaggi + tipo_chiusura='omaggio'
  Autoconsumo: titolare/admin, user_id + valore_costo → INSERT autoconsumi + tipo_chiusura='autoconsumo'
  Chiusura normale: tutti i ruoli abilitati alla comanda, tipo_chiusura='normale' (default)
  NOTA FUTURA: la select autoconsumo usa user_id numerico — considerare GET /api/users per
    mostrare nomi nel bottom sheet (post integrazione A-Cube, modulo 3.1)
```

### Modulo 1.7 — Magazzino

```
Prima volta un prodotto:
  Scansiona barcode EAN → Open Food Facts API → dati automatici
  Non trovato: form manuale
  Sistema genera QR interno → stampa su A4

Dalla seconda volta:
  Scansiona QR scaffale → inserisci quantità → fatto

Prodotti freschi (carne, pesce, verdura):
  Pulsante "Registra consegna"
  Form: fornitore, prodotto, quantità, scadenza, DDT
  Nessun QR in frigo — registrazione al momento consegna

Alert sottoscorta:
  Notifica quando giacenza < soglia_minima configurata
  Critico per bar (caffè, bibite)

Food cost globale:
  Spesa materie prime periodo ÷ coperti periodo = costo medio per coperto
  Non food cost per singolo piatto (cuochi non pesano)

Bottiglie bar:
  Scarico per unità intera quando si apre nuova bottiglia
  Nessuna gestione frazioni
```

### Modulo 1.8 — Dashboard KPI reali

```
Dati da collegare (tutti già nel DB):
  Camere: da stato_camere (arrivo/partenza/pronta oggi)
  Coperti: da ospiti_giornalieri (data odierna)
  Alert magazzino: prodotti con giacenza < soglia_minima
  Alert HR: scadenze con data_scadenza entro 30 giorni
  Alert ZTL: ztl_prenotazioni con stato = 'mancante'
  Incassi: da incassi_giornalieri (inserimento manuale titolare)
  Food cost: da movimenti_magazzino aggregati per periodo

Confronto anno precedente:
  Stessa query con WHERE data BETWEEN anno-1
  Variazione percentuale mostrata in badge verde/rosso
```

### Modulo 1.9 — Archivio documentale

```
Upload foto da smartphone (multer già configurato)
Categorie: resoconto_z / ddt / fattura / pos / altro
Data documento: automatica (oggi) o manuale
Ricerca per data e categoria
Download documento
Accesso: titolare e receptionist
```

### Modulo 1.11 — Sito web (progetto parallelo su Vercel)

```
Stack separato: Next.js + Sanity CMS su Vercel
NON nel repository del gestionale — repository separato

Contenuto:
  Home, Camere, Ristorante, Servizi, Offerte, Posizione, Galleria, Contatti
  Multilingua: IT, EN, FR, DE
  Booking engine: widget TeamSystem Hospitality incorporato (Fase 1)
                  sostituito con WuBook in Fase 2

SEO + AEO:
  Schema markup JSON-LD per hotel, ristorante, camere
  FAQ strutturate su ogni pagina
  HTML semantico pulito per AI (ChatGPT, Claude, Gemini)

Social e analytics:
  Facebook Pixel, Instagram feed, WhatsApp Business button
  Google Analytics 4, Search Console, Google Business Profile
  Widget TripAdvisor

GDPR:
  Banner cookie conforme, privacy policy, consenso form
```

---

## 12. RIFERIMENTI TECNICI

```
Open Food Facts API:
  GET https://world.openfoodfacts.org/api/v2/product/{ean}.json
  Gratuita, nessuna autenticazione
  Campo utile: product.product_name, product.categories, product.brands

SSE per monitor cucina:
  Backend:  res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.write(`data: ${JSON.stringify(payload)}\n\n`)
  Frontend: const es = new EventSource('/api/cucina/stream')
            es.onmessage = (e) => { const data = JSON.parse(e.data) }

PostgreSQL UPSERT (usato in ospiti_giornalieri):
  INSERT INTO ... ON CONFLICT (data) DO UPDATE SET campo = EXCLUDED.campo

ZTL — 6 stati in ordine logico:
  mancante → non_necessaria → da_inviare → inviata → scaduta → conclusa

Note cucina:
  Tabella ospiti_giornalieri, UNIQUE su data, upsert ON CONFLICT
  Visibile in lettura anche al cuoco (non solo titolare/admin)

Menu pubblico:
  /menu-pubblico — funzionante, NON toccare
  /menu-stampa   — funzionante, NON toccare
```

---

## 13. COSA NON FARE MAI

- ❌ Modificare tabelle esistenti senza migration
- ❌ Rinominare file o cartelle esistenti senza chiedere
- ❌ Cambiare le porte (frontend: 7000, backend: 7001)
- ❌ Installare state manager globali (Redux, Zustand ecc.)
- ❌ Committare su main codice non testato
- ❌ Scrivere logica business nel frontend
- ❌ Fare chiamate dirette a API esterne dal frontend
- ❌ Iniziare 1.7 prima di completare e testare 1.6
- ❌ Toccare moduli già funzionanti: HR, ZTL, Menu (1.1-1.5)
- ❌ Sviluppare moduli Fase 2 prima del go-live Fase 1

---

## 14. EVOLUTIVE FUTURE — NON SVILUPPARE ORA

```
Modulo 1.6 — Ristorante (gap noti, da completare prima del go-live):
  Eliminazione configurazione sala: bloccare se ha tavoli associati,
  consentire solo se vuota. (eliminaConfigurazione non implementata)

Modulo 1.7 — Magazzino (evolutive, non ora):
  Storico prezzi per prodotto nel tempo
  Generazione automatica bozza ordine fornitore quando prodotto sotto soglia
  Alert scadenze progressivi (7 giorni, 3 giorni, giorno stesso)

Modulo 1.1 — HR Timbrature (evolutive, non ora):
  Verifica geolocalizzazione al momento della timbratura — navigator.geolocation
  verifica che il dipendente sia entro X metri dall'hotel (coordinata GPS hotel
  da configurare nelle impostazioni). Blocca la timbratura se troppo lontano
  con messaggio "Devi essere in hotel per timbrare".
  Notifica email al titolare ad ogni timbratura (entrata e uscita) con nome
  dipendente, tipo e orario. Usare Brevo o SendGrid (già pianificati per email
  automatiche Fase 2). Da sviluppare insieme al modulo email/SMS (5.3).
  Notifica push nativa (service worker) al titolare — da sviluppare insieme
  al service worker per notifiche cameriere ristorante.

Fase 2 (dopo go-live e test in produzione):
  2.1 Anagrafica ospiti completa + OCR documenti identità
  2.2 Planning camere con disponibilità, tariffe, pacchetti all-inclusive
  2.3 Integrazione WuBook/WooDoo channel manager OTA
  2.4 Tassa di soggiorno custom
  2.5 Alloggiati Web via intermediario REST certificato
  3.1 Integrazione A-Cube API corrispettivi (scontrini — sostituisce Hugin RT-K50)
  3.2 Fatturazione B2B (rivalutare A-Cube vs Fatture in Cloud con commercialista)
  3.3 Pagamenti online Nexi + Stripe via WuBook
  4.1 Booking engine (Next.js + WuBook API)
  4.2 Welcome Book digitale multilingua
  5.1 Check-in/check-out digitale + housekeeping
  5.2 Pre check-in digitale + OCR + Omnitec (verificare API disponibili)
  5.3 Email/SMS automatici (Brevo o SendGrid — piano gratuito sufficiente)

Fase 3 (futuro):
  6.1 HACCP avanzato (temperature, scongelo, cotture)
  6.2 Agente AI interno per titolare e staff
  6.3 Revenue management (RevPAR, suggerimenti tariffari)
```

---

## 15. AGGIORNAMENTO DI QUESTO FILE

Dopo ogni modulo completato:
1. Marca il modulo come ✅ nella tabella della Sezione 8
2. Aggiungi eventuali decisioni tecniche prese durante lo sviluppo
3. Segnala se sono emerse dipendenze non previste

*Documento aggiornato alla Fase 1 — Step 0.5 da completare prima di procedere.*

---

## 16. STATO AGGIORNATO AL 07/07/2026

### Modulo 1.6 — Ristorante: COMPLETATO ✅

Bug risolti in questa sessione:
- PATCH /comande/:id/chiudi non funzionava dopo migration 011 (tipo_chiusura)
  → causa reale: bug UI (bottom sheet chiusura renderizzato nella vista
    lista comande invece che nel dettaglio), non un bug del backend/migration
- Notifica "Tutto pronto" non arrivava al cameriere
  → tuttoProonto (comandeController.js) trasmetteva un evento aggregato
    senza dati; ora un evento riga_pronta per riga con payload completo
    (piatto_nome, tavolo_numero) — stesso formato di aggiornaStatoRiga
- Vista comanda cameriere: piatti già ordinati nascosti sotto il menu
  → redesign: sezione "Piatti ordinati"/"⚡ Da servire" in cima, menu
    "Aggiungi piatti" collassabile sotto, pulsante "Tutto servito" in batch
    (Promise.allSettled)
- Carrello/pulsante invio non raggiungibile senza scroll su telefono reale
  → causa reale: AppShell.tsx usava h-screen (100vh), non dinamico su mobile
    quando la barra indirizzi del browser si apre/chiude → risolto con
    h-[100dvh]
  → fix finale UX: pulsante "Invia (N)" spostato dal carrello al topbar
    (pattern Toast POS / Square); il carrello in basso resta solo
    header (contatore + totale) + righe piatti, più compatto
- Tab "Normale" nel bottom sheet chiusura ambigua per il cameriere
  (sembrava un pulsante d'azione invece che un selettore)
  → selettore tipo (Normale/Omaggio/Autoconsumo) visibile solo per
    titolare/admin; il cameriere vede un solo pulsante "Chiudi e incassa"
- Tap su tavolo occupato richiedeva un passaggio intermedio inutile
  → tavolo con righe: naviga direttamente alla comanda; tavolo occupato
    con comanda vuota: bottom sheet con "Aggiungi piatti"/"Libera tavolo"
- Badge piatti su mappa sala poco leggibili ("2✓"/"3")
  → testo esplicito "N pronti"/"N in corso"

### Note tecniche mobile

- Windows Firewall: nessuna regola in entrata per node.exe di default —
  serve una regola TCP 7000/7001 per essere raggiungibili da telefono in LAN
  (il server ascolta già su 0.0.0.0, il binding non è il problema).
- `h-screen` vs `h-[100dvh]`: su mobile la barra indirizzi del browser
  mostra/nasconde dinamicamente, cambiando l'altezza visibile reale.
  `100vh` non si aggiorna, `100dvh` sì — usare dvh per layout full-height
  su pagine ad uso mobile (cameriere/cucina/sala). AppShell.tsx ora usa
  h-[100dvh]; le pagine figlie possono restare su altezze percentuali
  (100%) relative al `<main>` di AppShell, senza bisogno di dvh anche lì.
- `allowedDevOrigins` in `frontend/next.config.ts`: Next.js aggiorna
  automaticamente questo campo quando rileva richieste dev da un nuovo IP
  LAN (es. il telefono cambia IP via DHCP) — è normale vederlo cambiare
  tra sessioni, non è un errore.

### Da verificare ancora (prima cosa da fare nella prossima sessione)

Verificare visivamente su telefono reale che il pulsante "Invia (N)" nel
topbar funzioni correttamente (tap, conteggio piatti, stato disabilitato
a carrello vuoto) — finora verificato solo in browser di anteprima desktop
a viewport fisso, non su un dispositivo reale con barra indirizzi dinamica.

### Test batteria moduli 0.1–0.5, 1.1–1.5 (esclude 1.6 Ristorante) — 08/07/2026

Generate ed eseguite batterie di test complete sui moduli già sviluppati (esclusi quelli
di ristorante su cui erano già stati fatti controlli approfonditi):
- Aggiunti tests/api/ospiti.test.js (Modulo 1.2 — note cucina, endpoint /api/hr/ospiti)
  e tests/api/audit.test.js (Modulo 0.2 — audit log, endpoint /api/audit), mancanti finora.
- Rieseguita l'intera suite: 7 test suite, 120 test verdi (auth, hr, camere, ztl, menu,
  ospiti, audit).

Bug di disallineamento trovati e corretti con **database/migrations/012_fix_ruoli_e_tabelle_audit.sql**:
- Il CHECK constraint su users.ruolo in 001_users.sql non includeva 'admin' e
  'portiere_notte' (solo 5 ruoli su 7 — shared/ruoli.js era già corretto con 7).
- Le tabelle audit_log e refresh_tokens (usate dal codice, elencate in CLAUDE.md sez. 6)
  non avevano nessuna migration dedicata — create in passato fuori dal flusso migration.
Migration 012 idempotente (DROP+ADD CONSTRAINT, CREATE TABLE IF NOT EXISTS con schema
esatto introspezionato dal DB reale), applicata in transazione, nessun dato toccato.
120/120 test riverificati verdi dopo l'applicazione. Commit: aad6a36.

### Modulo 1.7 — Magazzino: COMPLETATO ✅ (11/07/2026)

- Migration 013: aggiunto costo_unitario a movimenti_magazzino (nullable —
  serve solo per il calcolo food cost, non blocca la registrazione movimenti
  senza prezzo). Tabelle fornitori/prodotti/movimenti_magazzino esistevano
  già da 004_magazzino.sql, mai usate finora (0 righe).
- Permessi corretti rispetto al piano iniziale: lettura + movimenti
  (carico/scarico) = admin, titolare, cuoco, receptionist, portiere_notte
  (sezione 'magazzino' in shared/ruoli.js, ampliata da [A,T,P] a [A,T,K,R,P]);
  anagrafica prodotti/fornitori e food-cost = solo admin/titolare (soloTitolare).
  Aggiornati anche frontend/lib/ruoli.js (copia) e Sidebar.tsx (voci di menu
  desktop + bottom-nav mobile receptionist, entrambi hardcoded separatamente
  da shared/ruoli.js — occhio a questa duplicazione se si aggiungono sezioni).
- backend/controllers/magazzinoController.js: giacenza calcolata al volo
  (SUM carichi − SUM scarichi via LEFT JOIN, non un campo salvato) — niente
  disallineamenti da UPDATE dimenticati.
- Nuova dipendenza: html5-qrcode (nessuna libreria esistente scansiona QR/
  barcode da fotocamera; qrcode.react genera soltanto, tesseract.js fa OCR
  testo per ZTL).
- Pagina /magazzino/scansiona: due modalità (?modo=barcode per EAN → lookup
  Open Food Facts server-side → crea prodotto; ?modo=qr per scaffale →
  lookup prodotto → registra movimento), interamente autonoma, nessun
  passaggio dati via query string tra pagine.
- Pagina /magazzino-qr-stampa: stesso pattern di /menu-stampa (CSS print
  inline, pulsante no-print, window.print()) — il QR codifica il codice
  interno prodotti.qr_code, non un URL (letto solo dalla fotocamera
  dell'app stessa, non pensato per essere aperto da un telefono qualsiasi).
- 32 nuovi test (tests/api/magazzino.test.js) + 246 test totali verdi
  (tutte le suite, ristorante incluso).
- Verificato manualmente nel browser: creazione prodotto → registrazione
  consegna → giacenza aggiornata in lista, funziona end-to-end.
- Da verificare ancora: scansione fotocamera reale (html5-qrcode) su
  telefono — richiede permesso getUserMedia, testato finora solo il resto
  del flusso (form, salvataggio, giacenza), non lo scan vero e proprio.

### Prossimo step

Modulo 1.8 — Dashboard KPI reali (dati reali, alert aggregati, confronto anno precedente)

### Istruzioni per sessioni efficienti (ridurre consumo token)

1. Ogni sessione ha UN solo obiettivo
2. Messaggi brevi e specifici — no conversazioni lunghe
3. Specificare sempre il file e la funzione esatta
4. Usare sempre il formato plan-then-execute
5. A fine sessione: aggiornare CLAUDE.md + commit + push

### Primo messaggio per la prossima sessione

"Leggi CLAUDE.md. Obiettivo: [una cosa sola].
Piano in 5 righe, attendi conferma."
