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
| 1.6 | **Ristorante** — prenotazioni, sala, comande, monitor cucina SSE, conto | Da fare |
| 1.7 | **Magazzino** — prodotti, QR/barcode, movimenti, alert, fornitori, food cost | Da fare |
| 1.8 | **Dashboard KPI reali** — dati reali, alert aggregati, confronto anno precedente | Da fare |
| 1.9 | **Archivio documentale** — upload foto, categorie, ricerca | Da fare |
| 1.10 | **Deploy VPS** — Nginx, PM2, SSL, backup automatico | Da fare (parallelo) |
| 1.11 | **Sito web** — Next.js + Sanity CMS + SEO + AEO, su Vercel, booking engine TS | Da fare (parallelo) |

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
  Pulsante "Tipo speciale": Omaggio / Autoconsumo / Tariffa scontata
  Omaggio: motivo obbligatorio, documento commerciale a zero
  Autoconsumo: registrazione interna senza documento fiscale
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
