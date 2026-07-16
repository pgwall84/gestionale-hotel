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
| 1.8 | **Dashboard KPI reali** — dati reali, alert aggregati, confronto anno precedente | ✅ Fatto |
| 1.9 | **Archivio documentale** — upload foto, categorie, ricerca | ✅ Fatto |
| 1.10 | **Deploy VPS** — Nginx, PM2, SSL, backup automatico (Hetzner CX22, ~€75-90/anno, vedi Sezione 16) | 🔜 Prossimo step |
| 1.11 | **Sito web** — Next.js + Sanity CMS + SEO + AEO, su Vercel, booking engine TS | ✅ Fatto (repo separato `sito-hotel`) |

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
**Nota 1.11 completato:** Sito web sviluppato come progetto separato (repo `sito-hotel`,
deploy GitHub/Vercel/Sanity). Nella Fase 1 usa ancora il widget TS per le prenotazioni camere.
Dettagli su repo, deploy e deviazioni dalla spec originale nel CLAUDE.md di quel repository.

**Unico step rimasto della Fase 1: 1.10 — Deploy VPS** (Nginx, PM2, SSL, backup automatico).

### FASE 2A — Sostituzione TS: prenotazioni e OTA

| N. | Modulo | Note |
|----|--------|------|
| 2.1 | Anagrafica ospiti completa + OCR documenti identità | Base per tutto il PMS |
| 2.2 | Planning camere — disponibilità, tariffe, stagionalità, pacchetti all-inclusive | Dipende da 2.1 |
| 2.3 | Integrazione WuBook/WooDoo — channel manager + webhook prenotazioni | Dipende da 2.2 |
| 2.4 | Tassa di soggiorno custom — calcolo per notte/ospite, report Comune | Collegata al planning |
| 2.5 | Alloggiati Web — intermediario REST certificato (non SOAP diretto) | Dipende da 2.1 |

**Nota:** architettura concettuale del modulo Prenotazioni (schema entità,
ciclo di vita stati, 3 decisioni prioritarie PCI/webhook/GDPR) e viste UX
già definite in sessione dedicata — vedi Sezione 16, sottosezioni
"Architettura Fase 2" e "Viste UX Fase 2". Prossimo passo concreto: schema
tabelle PostgreSQL dettagliato.

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
  DA APPROFONDIRE — scansione barcode/QR poco affidabile da foto telefono
    (testato su Samsung + Chrome, stesso errore "no MultiFormat Readers"
    anche con BarcodeDetector nativo attivato e immagine ridimensionata).
    Per ora: inserimento manuale del codice come via primaria (già in
    produzione). Da valutare in futuro: pistola/lettore barcode dedicato
    hardware invece della fotocamera del telefono, se il volume di scansioni
    giornaliere rende l'inserimento manuale troppo lento in pratica.

Modulo 1.8 — Dashboard (evolutive, non ora):
  Food cost % sul fatturato (spesa materie prime / ricavi ristorante × 100)
  — evolutiva quando ci sarà storico incassi reale. Oggi mostra
  correttamente €/coperto invece di una % che sarebbe fuorviante senza
  incassi storici affidabili.

Modulo 1.1 — HR Timbrature:
  ✅ Geolocalizzazione timbratura — implementata (Haversine + blocco raggio 50m
  dalle coordinate hotel, vedi Sezione 16 "Modulo HR — 4 miglioramenti").
  ✅ Griglia turni visuale — implementata (TabTurni, personale/page.jsx).
  ✅ Notifiche approvazione ferie — implementata (riquadro "Ultime decisioni" in TabFerie).
  ✅ Report mensile presenze — implementato (colonna Ritardi in reportMensile()).

  Evolutiva futura, non ora:
  Notifica push nativa (service worker) al titolare ad ogni timbratura — da
  sviluppare insieme al service worker per notifiche cameriere ristorante
  (nessuna dipendenza da email/SMS Fase 2, può usare Brevo/SendGrid solo se
  si preferisce un canale email invece di push).

Fase 2 (dopo go-live e test in produzione):
  2.1 Anagrafica ospiti completa + OCR documenti identità

  Modulo Prenotazioni — evolutiva non ancora implementata:
    Cron scadenza automatica prenotazioni "Opzione" (node-cron, ogni 30 min)
    — passa lo stato da 'opzione' a 'interrotta' se non confermate entro
    24-48h (campo prenotazioni.data_scadenza_opzione, già nella migration
    016). Ogni riga aggiornata va loggata in audit_log. Da implementare
    insieme al primo modulo che espone endpoint di creazione prenotazioni,
    non prima — dipendenza nuova (node-cron) da introdurre solo a quel
    punto, motivandola nel piano di quella sessione.

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

### Modulo 1.8 — Dashboard KPI reali: COMPLETATO ✅ (11/07/2026)

- backend/controllers/dashboardController.js: kpi() (camere, coperti, incasso,
  food cost con confronto anno precedente), registraIncasso() (upsert su
  incassi_giornalieri, mancava completamente — nessun endpoint la scriveva),
  alert() esteso con sezione magazzino (giacenza sotto soglia).
- Camere: lo schema attuale (stato_camere) traccia solo arrivo/partenza/pronta
  del giorno, non un calendario occupazione (quello è Fase 2.2, non ancora
  costruito) — KPI rinominato onestamente "movimenti oggi" invece di fingere
  un'occupazione % che i dati non supportano.
- Food cost: mostrato in €/coperto (riusa la stessa logica di magazzino),
  non una % sul fatturato — richiederebbe incassi storici affidabili,
  oggi quasi sempre a 0. Nota aggiunta in Sezione 14 come evolutiva.
- Coperti "hotel/esterni" del vecchio mock rimosso: ospiti_giornalieri non
  traccia questa distinzione, mostrato solo il totale reale.
- Rilevata (non corretta, per non spendere risorse extra) la stessa
  migration drift già vista con audit_log/refresh_tokens: stato_camere è
  usata dal modulo Camere ma non ha nessuna migration nei file versionati.
- 10 nuovi test (tests/api/dashboard.test.js), 256 test totali verdi.
- Non verificato nel browser in questa sessione (solo sintassi + test
  backend) per contenere il consumo di risorse — da controllare visivamente
  alla prossima occasione.

### Modulo HR — 4 miglioramenti: COMPLETATO ✅ (11/07/2026)

- Migration 014 (geolocalizzazione timbrature) + 015 (data_decisione assenze),
  applicate.
- timbra(): salva lat/lon/distanza opzionali (fidandosi della verifica lato
  client, nessuna validazione server-side della posizione).
- reportMensile(): aggiunta colonna Ritardi (entrata reale vs turno.ora_inizio,
  soglia 15 min) — riusa l'endpoint/pulsante Excel già esistenti (scoperto in
  fase di piano: Miglioramento 4 era già quasi completo, mancava solo questo).
- Griglia turni settimanale (Miglioramento 2): **era già completamente
  implementata** in TabTurni (personale/page.jsx) — righe/colonne, colori
  per tipo, click crea/modifica, navigazione settimana. Nessuna modifica.
- timbratura/page.jsx: Haversine pura + blocco raggio 50m dalle coordinate
  hotel, gestione permesso negato; se il GPS è indisponibile per altri motivi
  (timeout, browser non supportato) la timbratura NON viene bloccata —
  scelta deliberata per non impedire mai la timbratura per un problema
  tecnico transitorio.
- Riquadro "Ultime decisioni" in TabFerie (dipendente): ultimi 30 giorni,
  badge "NUOVO" se decisa nelle ultime 24h.
- 4 nuovi test in hr.test.js (geolocalizzazione persistita, data_decisione) —
  33/33 verdi isolati.

**Trovato (non risolto, da approfondire a parte):** `dashboard.test.js`
eseguito insieme a QUALSIASI altro file di test (confermato con
`camere.test.js` e poi anche `archivio.test.js`+`hr.test.js` insieme) causa
un fallimento in `dashboard.test.js` (variazione anno precedente coperti
restituisce 0 invece del valore atteso) — riproducibile anche `--runInBand`,
quindi non è una race di worker paralleli ma probabile condivisione/
esaurimento del pool PostgreSQL tra file di test, specifico di
dashboard.test.js. Non è una regressione: dashboard.test.js da solo passa
10/10, tutti gli altri file passano puliti tra loro. Da investigare in una
sessione dedicata prima di fidarsi ciecamente di `npm test` sulla suite
completa (eseguire dashboard.test.js separatamente nel frattempo).

### Modulo 1.9 — Archivio documentale: COMPLETATO ✅ (11/07/2026)

- Tabella archivio_documenti già esistente (006_archivio_incassi.sql),
  nessuna migration necessaria.
- backend/controllers/archivioController.js + routes/archivio.js: CRUD
  completo (lista con filtri tipo/data, upload multer, download, elimina)
  — stesso pattern di documentiController.js (documenti HR).
- Cartella uploads/archivio/ creata a mano (multer non la crea da sola).
- Permessi ampliati: sezione 'archivio' in shared/ruoli.js e
  frontend/lib/ruoli.js da [admin,titolare] a [admin,titolare,receptionist]
  — aggiornata anche Sidebar.tsx (voce hardcoded separata, stessa
  duplicazione già nota per magazzino).
- OneDrive Microsoft Graph: NON implementato ora, evolutiva futura dopo il
  deploy (serve accesso Azure AD aziendale) — storage su disco VPS per ora.
- 20 nuovi test (tests/api/archivio.test.js), 2 bug di test corretti in
  fase di sviluppo: file fixture con estensione .txt rifiutato dal
  fileFilter multer (solo pdf/jpeg/jpg/png), e un ECONNRESET quando si
  allega un file multipart a una richiesta destinata a un 403 (il server
  chiude la risposta prima di consumare lo stream) — risolto senza allegare
  file nei test di solo permesso.

### Modulo 1.11 — Sito web: COMPLETATO ✅ (progetto separato)

Sviluppato come repository indipendente (`sito-hotel`), non incluso in questo
repo. Stack, deploy (GitHub/Vercel/Sanity) e deviazioni dalla spec originale
documentati nel CLAUDE.md di quel repository.

### Deploy VPS — stima costi Hetzner (15/07/2026)

In attesa di conferma costi col titolare. Dettaglio completo in
`STIMA_COSTI_DEPLOY_HETZNER.md`.

Confronto rapido Hetzner vs DigitalOcean (stesso hardware: 2 vCPU, 4GB RAM):
- Hetzner CX22: ~€5,99/mese (~€72/anno) — 20TB traffico incluso, datacenter
  Germania/Finlandia
- DigitalOcean Basic Droplet: ~€22/mese (~€264/anno) — 4TB traffico incluso,
  datacenter Amsterdam

**Raccomandazione: Hetzner CX22** — risparmio netto ~€190/anno a fronte di
specifiche identiche, e il carico di lavoro (20 camere) resta ben entro le
capacità di entrambi.

Stima costo totale annuale: VPS ~€72 + Backblaze B2 (backup DB) ~€0-5 + SSL
Let's Encrypt €0 + snapshot VPS settimanale opzionale ~€14 = **~€75-90/anno**.

Backup DB automatico: cron notturno (pg_dump → gzip → upload rclone su
Backblaze B2), setup one-time (~30 min: bucket B2, install rclone, script
bash, cron), poi completamente automatico. Alternativa "zero setup": backup
gestiti Hetzner (+20% sul costo VPS, snapshot dell'intero server, meno
granulare del backup DB puntuale).

### Architettura Fase 2 — modulo Prenotazioni (15/07/2026)

Punto centrale emerso: **non esiste ancora un vero modulo Prenotazioni**.
"Camere" (Fase 1) ha solo anagrafica + stato giornaliero, non date
arrivo/partenza, dati ospite, tariffe. Tutta la Fase 2 (WuBook, pagamenti,
A-Cube, Alloggiati Web, tassa di soggiorno) deve agganciarsi a questo
modulo, che va costruito.

Flusso: Sorgenti prenotazioni (WuBook channel manager, WuBook booking
engine, reception) → **Prenotazioni** (nuovo, hub centrale) ↔ sync con
Camere (esistente) → Pagamenti (Nexi/Stripe via WuBook) + Adempimenti
fiscali (A-Cube, Alloggiati Web, tassa soggiorno) → Dashboard KPI
(esistente, da alimentare con nuovi dati).

**Ciclo di vita prenotazione (stati proposti):** Opzione (blocco
provvisorio, no pagamento) → Confermata (caparra incassata) → Check-in
(soggiorno in corso) → Check-out (camera liberata) → Chiusa (fatturata,
A-Cube emesso). Stato parallelo: Interrotta (no-show o cancellata, da
Confermata).

**Schema dati proposto (entità principali):**
- Prenotazione (testata): canale origine, `external_booking_id`
  (idempotenza da WuBook), stato, note
- Soggiorno (riga): FK Prenotazione + FK Camera, data arrivo/partenza,
  tariffa, ospiti totali
- Ospite: nome, documento (tipo/numero, campi testuali), cittadinanza, data
  nascita — MAI un campo foto/scansione documento
- Pagamento: importo, metodo, stato — collegato a booking engine (caparra)
  e A-Cube (corrispettivo)

**Tre decisioni architetturali prioritarie (da fissare prima di scrivere codice):**

1. **PCI scope zero** — il gestionale non deve mai vedere/memorizzare dati
   carta. Con l'integrazione WuBook (media pagamenti Nexi/Stripe) questo è
   probabilmente già garantito by design: il gestionale riceve solo l'esito
   via webhook. Attenzione a non aggiungere in futuro form di pagamento
   "fatti in casa".
2. **Sicurezza webhook** — verifica firma HMAC sui webhook in ingresso
   (WuBook, A-Cube) se supportata; in ogni caso `external_booking_id` come
   barriera anti-duplicazione. Loggare sempre il payload grezzo prima di
   processarlo, per poter rigiocare un evento in caso di problemi.
3. **Dati ospite GDPR-ready** — due basi giuridiche distinte, da NON confondere:
   - **Alloggiati Web / TULPS** (sicurezza pubblica): solo trasmissione, la
     struttura non deve conservare i dati oltre l'invio. La ricevuta di
     trasmissione (protocollo, data, esito) va conservata 5 anni — obbligo
     distinto e separato dall'anagrafica ospite.
   - **Finalità fiscale** (fatturazione/corrispettivi): consente di
     conservare l'anagrafica ospite collegata a documenti fiscali fino a 10
     anni. È la base giuridica che giustifica un'anagrafica ricca, non
     l'obbligo di sicurezza pubblica.
   - **Vietato sempre**, a prescindere dalla finalità: conservare foto o
     scansioni del documento d'identità. Chiarimento Garante Privacy del
     29/04/2026 (docweb 10244289): le strutture ricettive devono
     cancellare/distruggere qualsiasi copia del documento subito dopo
     l'invio ad Alloggiati Web. Solo dati testuali, mai immagini.
   - Se in futuro si costruisce CRM/marketing verso ospiti abituali, serve
     una terza base giuridica (consenso esplicito), separata dalle prime due.
   - Controllo di accesso a livello di campo (non solo di modulo): valutare
     se estendere i ruoli già presenti in HR ai campi sensibili
     dell'anagrafica ospiti (es. governante vede note allergie ma non dati
     fiscali completi).

**Omnitec — chiarito:** non è pre check-in da remoto, è gestione chiavi
magnetiche/accesso struttura. Le chiavi vengono sempre consegnate in
portineria da un receptionist. Nessun conflitto con l'obbligo di riscontro
visivo dell'ospite perché l'identificazione avviene comunque di persona al
banco.

**Prossimo passo:** schema tabelle PostgreSQL dettagliato per il modulo
Prenotazioni (nomi campi, tipi, foreign key), tenendo conto dei tre punti
sopra. Da fare in una prossima sessione, eventualmente direttamente con
Claude Code una volta validato lo schema concettuale.

### Viste UX Fase 2 — specifica separata (15/07/2026)

Mockup/UX (non codice) su come si presenteranno le nuove viste, da tradurre
nei componenti reali mantenendo lo stile esistente (sidebar navy, card
bianche, stessa libreria icone/componenti). Dettaglio completo in
`MOCKUP_VISTE_FASE2.md`.

- **Sidebar riorganizzata** in sezioni: OSPITALITÀ (Camere, Prenotazioni
  camere, Pulizie, Ospiti), RISTORANTE (rinominare "Prenotazioni" →
  "Prenotazioni tavoli" per disambiguare dalle nuove prenotazioni camere),
  AMMINISTRAZIONE (Pagamenti, Adempimenti fiscali, Report).
- **Prenotazioni (camere)**: vista predefinita a griglia/planning (camere
  su righe, giorni su colonne, barra colorata per stato: Opzione ambra,
  Confermata blu/accent, In corso verde). Query sottostante: intersezione
  con [data_inizio, data_fine] su tutte le camere — richiede indice su
  Soggiorno(data_arrivo, data_partenza).
- **Ospiti**: scheda anagrafica con documento SEMPRE mascherato (es.
  `CI · ••••1847`, mai foto/scansione), storico soggiorni derivato da
  Soggiorno (non tabella duplicata), consenso marketing come flag separato
  con propria base giuridica.
- **Pulizie**: incrocia Tipo (fermata/partenza, calcolato automaticamente
  da Soggiorno, sola lettura — sostituisce l'impostazione manuale attuale
  in Camere) e Completamento (fatta/da fare, unico campo manuale della
  cameriera). Stato occupazione camera va calcolato dalla stessa fonte
  Soggiorno in tre punti oggi scollegati: Camere, Prenotazioni, Dashboard
  (contatore "camere X/21" da rendere calcolato invece che statico).
- **Conto ospite (folio)**: accumula addebiti da fonti diverse (camera,
  ristorante, extra) con saldo al checkout. Richiede una funzione "addebita
  alla camera" nel modulo comande (tag `soggiorno_id`) — modifica al modulo
  Ristorante esistente, non solo un'aggiunta.
- **Report avanzati**: ADR, RevPAR, tasso occupazione medio, grafico
  andamento 7/30 giorni — tutti calcolabili da Soggiorno + Pagamento una
  volta che Prenotazioni esiste, nessuna nuova tabella richiesta.

Priorità: Prenotazioni + Ospiti sono il prerequisito di tutto il resto.
Pulizie è indipendente (può essere fatto anche prima/separatamente). Conto
ospite e Report dipendono dai primi due.

### Audit di sicurezza applicativa (15/07/2026)

Primo audit sistematico su gestionale-hotel (il sito web aveva già avuto un
audit separato: header, rate limiting, Dependabot). **Risultato: PULITO su
tutte e 4 le categorie principali.**

- **SQL injection**: ✅ nessuna vulnerabilità. Verificati 21 controller con
  `pool.query`, tutti i valori utente passano come parametri ($1,$2...),
  mai concatenati.
- **XSS**: ✅ nessuna vulnerabilità. Zero `dangerouslySetInnerHTML`/
  `innerHTML`/`eval` nel repo, tutto renderizzato via JSX con escape
  automatico React (verificato in particolare menu pubblico QR e note cucina).
- **IDOR**: ✅ nessuna vulnerabilità. Timbrature derivano sempre l'utente da
  JWT (`req.utente.id`), mai da parametro URL. Documenti hanno controllo
  ownership esplicito. Endpoint sensibili ristretti per ruolo.
- **Rate limiting login**: ✅ già presente (`backend/app.js:43-54`), max 5
  tentativi/15 min per IP con express-rate-limit.

**Corretto in questa sessione:**
- Autorizzazione debole menu toggle: `PATCH /api/menu/piatti/:id/toggle`
  ora richiede ruolo admin/titolare/cuoco/cameriere (prima bastava un token
  valido di qualsiasi ruolo). Test suite `menu.test.js` 20/20 passata.

**Chiuso in questa sessione:**
- Security header: applicati in `backend/app.js:29-34`. HSTS rafforzato a
  `max-age=63072000; includeSubDomains; preload` (⚠️ da rivedere:
  `includeSubDomains`+`preload` richiede che TUTTI i sottodomini di
  hoteldelgolfolerici.com servano sempre HTTPS senza eccezioni — verificare
  quando il dominio torna sotto controllo diretto, nel dubbio togliere
  `preload` che comunque non ha effetto finché non sottomesso
  manualmente). CSP, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy confermati via curl, zero regressioni.
- CORS: verificato già corretto, nessuna modifica al codice necessaria.
  Aggiunta `FRONTEND_URL` a `backend/.env.example` come promemoria
  obbligatorio per il deploy.
- Backup cifrati B2: da applicare al Modulo 1.10 (il bucket non esiste
  ancora). Procedura: Console B2 → Bucket Settings → Encryption → attivare
  Server-Side Encryption (SSE-B2, gestita da Backblaze, nessuna chiave da
  custodire). Automatico su ogni upload, nessuna modifica a
  `backup-db.sh` richiesta.

**Falso allarme verificato e chiuso:** file `frontend/AGENTS.md` — è una
funzionalità ufficiale di Next.js 16.2+ (annunciata 18/03/2026):
`create-next-app` include di default un AGENTS.md che punta alla
documentazione bundlata in `node_modules/next/dist/docs/`, per evitare che
gli assistenti AI scrivano codice con pattern di training obsoleti.
Origine: commit `fbd4164` (02/07/2026), conversione di `frontend` da
submodule a cartella normale. Nessuna azione necessaria.

**Processo di sicurezza continuativo — non un controllo una tantum.** Ogni
nuovo modulo riapre le stesse categorie di rischio (SQLi, XSS, IDOR,
autorizzazione). Checkpoint da ricordare nel ciclo di vita del progetto:

1. Automatico e continuo: Dependabot/npm audit sulle dipendenze — da
   attivare anche su gestionale-hotel (oggi presente solo sul sito web),
   gira da solo senza sessioni dedicate.
2. Ad ogni nuovo modulo che tocca dati sensibili o soldi: mini-review
   mirata su autorizzazione (IDOR) e validazione input. In Fase 2 vale
   soprattutto per Prenotazioni, Pagamenti, ricezione webhook — è terreno
   nuovo, più facile introdurre un buco.
3. ⚠️ **Prima del deploy in produzione (Modulo 1.10)**: ripetere l'audit
   completo (SQLi, XSS, IDOR, rate limiting, header, CORS, backup) come
   ultimo checkpoint. Motivo: oggi il gestionale è raggiungibile solo dalla
   LAN dell'hotel (rischio basso), dopo il deploy sarà raggiungibile da
   internet (rischio reale) — stesso codice, esposizione completamente
   diversa. Va rifatto anche se nel frattempo il codice non è cambiato.
4. Dopo modifiche a codice sensibile: login, gestione permessi, logica di
   pagamento — controllo mirato su quella parte specifica dopo ogni modifica.
5. Periodico post go-live: audit completo ogni pochi mesi, o dopo
   aggiornamenti importanti di Next.js/Express/PostgreSQL (le versioni
   nuove possono cambiare comportamenti di sicurezza di default — vedi il
   caso AGENTS.md sopra).
6. Eventi specifici: cambio staff con accesso al sistema (revocare
   credenziali), sospetto incidente, nuova normativa che tocca i dati
   trattati (es. i chiarimenti Garante Privacy di aprile 2026 su documenti
   ospiti).

**Da affrontare prima del go-live Fase 2:**
- Scadenza automatica prenotazioni "Opzione": entro 24-48h se non
  confermate, previene sia abusi (esaurimento inventario) sia problemi
  operativi.
- Bot protection sui form pubblici: honeypot o captcha leggero (es.
  Cloudflare Turnstile, gratuito) su form convenzione lavoro e altri form
  pubblici del sito quando diventeranno form veri.
- Dependency scanning: attivare Dependabot anche su gestionale-hotel (già
  presente sul sito web).

**Bassa priorità per la scala attuale (da tenere a mente, non urgente):**
rotazione periodica secret (JWT, chiavi API), audit log dettagliato azioni
sensibili (utile se cresce lo staff), resistenza a spoofing GPS nelle
timbrature HR.

### Prossimo step

Fase 1 quasi completa — **unico step rimasto: Modulo 1.10 — Deploy VPS**
(Nginx, PM2, SSL, backup automatico) su Hetzner CX22 (~€75-90/anno, vedi
sopra), per gestionale + sito sulla stessa macchina. Prima del deploy,
ripetere l'audit di sicurezza completo (vedi "Processo di sicurezza
continuativo" sopra, punto 3).

Per la Fase 2, il prossimo passo concettuale (non urgente, dopo il
deploy) è lo schema tabelle PostgreSQL del modulo Prenotazioni, sulla base
dell'architettura definita sopra.

### Istruzioni per sessioni efficienti (ridurre consumo token)

1. Ogni sessione ha UN solo obiettivo
2. Messaggi brevi e specifici — no conversazioni lunghe
3. Specificare sempre il file e la funzione esatta
4. Usare sempre il formato plan-then-execute
5. A fine sessione: aggiornare CLAUDE.md + commit + push

### Primo messaggio per la prossima sessione

"Leggi CLAUDE.md. Obiettivo: [una cosa sola].
Piano in 5 righe, attendi conferma."
