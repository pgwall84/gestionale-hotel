# CLAUDE.md — Hotel del Golfo — Gestionale

> Leggi questo file integralmente prima di fare qualsiasi cosa.
> È il documento di riferimento permanente del progetto — deve restare
> leggero. Storia dettagliata, backlog e contratti di modulo vivono in
> file separati sotto `docs/` (indice in Sezione 17), non qui.

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
├── docs/                       → contratti di modulo, diario, evolutive (Sezione 17)
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
camere                  — numero e nome camera, piano (Fase 2)
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
omaggi / autoconsumi    — chiusure comanda non a pagamento
ospiti                  — anagrafica ospiti (Fase 2, modulo Prenotazioni)
soggiorno_ospiti        — ponte ospiti↔soggiorno con ruolo Alloggiati Web
gruppi_prenotazione     — gruppi/comitive con pagamento unico
prenotazioni            — testata prenotazione camere (Fase 2)
soggiorni               — riga camera+date di una prenotazione
pagamenti               — pagamenti di prenotazione o gruppo
webhook_log             — log grezzo webhook (predisposta, non popolata — modulo 2.3)
alloggiati_invii        — tracciamento invii Alloggiati Web (predisposta — modulo 2.5)
```

Tabelle del modulo Prenotazioni (Fase 2): schema completo, vincoli e note
GDPR/Alloggiati Web in `docs/PRENOTAZIONI_FASE2.md` Parte B.

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

### Processo di sicurezza continuativo

Non un controllo una tantum — ogni nuovo modulo che tocca dati sensibili o
soldi riapre le stesse categorie di rischio (SQLi, XSS, IDOR, autorizzazione).
Checkpoint fissi: Dependabot/npm audit continuo; mini-review mirata sui
moduli nuovi; **audit completo obbligatorio prima del deploy in produzione**
(Modulo 1.10 — oggi il gestionale è raggiungibile solo da LAN, dopo il
deploy da internet, stesso codice ma esposizione diversa); controllo mirato
dopo modifiche a login/permessi/pagamenti; audit periodico post go-live.
Cronologia degli audit già svolti (cosa è stato verificato e corretto):
`docs/DIARIO_SESSIONI.md`.

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
| 1.10 | **Deploy VPS** — Nginx, PM2, SSL, backup automatico (netcup VPS Lite 1 G12s, ~60€/anno, dettaglio in `docs/DEPLOY_VPS_NETCUP.md`) | ✅ Fatto (09/08/2026), incluso audit di sicurezza pre-produzione |
| 1.11 | **Sito web** — Next.js + Sanity CMS + SEO + AEO, su Vercel, booking engine TS | ✅ Fatto (repo separato `sito-hotel`) |

**1.10 — Deploy VPS: completato, incluso l'audit di sicurezza (09/08/2026)**,
gestionale raggiungibile in HTTPS su `https://hdgolfo-gestionale.com`
(netcup VPS Lite 1 G12s). **Fase 1 chiusa.** Guida operativa completa del
server (accesso, stack, database, deploy di aggiornamenti futuri, backup):
`docs/DEPLOY_VPS_NETCUP.md`. Cronologia di come si è arrivati a ✅ su
ciascun modulo (bug trovati, decisioni prese, deviazioni dal piano):
`docs/DIARIO_SESSIONI.md`.

### FASE 2A — Sostituzione TS: prenotazioni e OTA

| N. | Modulo | Stato / Note |
|----|--------|------|
| 2.1 | Anagrafica ospiti completa | ✅ Fatto (senza OCR documenti; sezione Clienti `/clienti` aggiunta 01/08/2026 — nazionalità/documento codificati restano non editabili da UI fino al modulo 2.5) |
| 2.2 | Planning camere — disponibilità (griglia + CRUD) + Tariffe, stagionalità, pacchetti all-inclusive | ✅ Fatto |
| 2.3 | Integrazione WuBook/WooDoo — channel manager + webhook prenotazioni | Non iniziato, dipende da 2.2 |
| 2.4 | Tassa di soggiorno custom — calcolo per notte/ospite, report Comune | ✅ Fatto (formato export per il Comune di Lerici non ancora noto — Excel generico adattabile) |
| 2.5 | Alloggiati Web — SOAP diretto a `WS_ALLOGGIATI` | Fase 1b (tabelle di codifica + tendine scheda ospite) ✅ Fatto; Fase 2 (schedina + invio reale) non iniziata |
| 2.6 | ROSS1000/ISTAT flussi turistici — export mensile verso Regione Liguria | Fase 1 (generazione XML per verifica manuale, nessun invio reale) ✅ Fatto — Fase 2 (invio reale al webservice) in attesa delle credenziali HTTP Basic di Regione Liguria |

Il modulo Prenotazioni (CRUD, state machine, griglia planning drag-and-drop,
gruppi, pagamenti) è quindi **implementato e in uso** per la parte
operativa di base — contratto API, schema DB e UI in dettaglio:
`docs/PRENOTAZIONI_FASE2.md`.

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
| 4.2 | Welcome Book digitale — multilingua IT/EN/FR/DE, QR in camera, collegato al menu | ✅ Fatto (repo `sito-hotel`) |

### FASE 2D — Esperienza ospite avanzata

| N. | Modulo | Note |
|----|--------|------|
| 5.1 | Check-in/check-out digitale — stato camere real-time, housekeeping | ✅ Fatto |
| 5.2 | Pre check-in digitale — form ospite, OCR | ✅ Fatto (Fase A + Fase B). Fase A: OCR assistito in reception, scansione documento con ritaglio manuale — Omnitec escluso dallo scope (chiavi camera, software separato non integrabile). Fase B: form self-service da remoto con token pubblico + email automatica — verificata dal titolare in locale il 05/08/2026 |
| 5.3 | Email/SMS automatici — conferma, pre-arrivo, post-partenza, recensione | ✅ Fatto (solo email, via Resend — SMS escluso, provider a pagamento). Estesa con Impostazioni▸Testi email e Marketing▸Offerte (gestione testi + offerte dedicate ai clienti) |

### FASE 3 — AI e ottimizzazione (futuro)

| N. | Modulo | Note |
|----|--------|------|
| 6.1 | HACCP avanzato — temperature, scongelo, cotture | Dopo switch-off TS |
| 6.2 | Agente AI interno — assistente in linguaggio naturale per titolare/staff | Quando tutti i dati sono nel sistema |
| 6.3 | Revenue management — RevPAR, occupazione storica, suggerimenti tariffari | Dopo almeno 1 anno di dati |

---

## 9. SETUP TESTING (Modulo 0.5 — FATTO)

### Stack di test

```bash
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

Per ogni modulo completato la batteria di test deve coprire:

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
7. Se tutti i test passano: modulo completato, aggiorna questo CLAUDE.md marcando il modulo come ✅, e aggiungi una nota di sintesi in `docs/DIARIO_SESSIONI.md`

**Nota (26/07/2026):** i piani completati dettagliati di sessioni passate
(redesign monitor cucina, redesign comanda cameriere, libera tavolo/chiusura
tipizzata — che erano qui sotto come Sezioni 10b/10c/10d) sono stati
spostati in `docs/DIARIO_SESSIONI.md`: sono cronaca di lavoro fatto, non
convenzione permanente, e tenerli qui era la stessa causa di bloat
risolta per la Sezione 16.

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
NON nel repository del gestionale — repository separato (sito-hotel)

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

Specifica completa (pagine, schema Sanity, design system, SEO/AEO): repo
`sito-hotel`, file `SPEC_SITO_HOTEL.md` — fonte di verità unica, non
duplicata qui.

---

## 12. RIFERIMENTI TECNICI

```
Regole di rete — NON derogabili (uso da LAN su più dispositivi/tablet):
  URL backend calcolato sempre a runtime (window.location.hostname),
    mai hardcoded — permette di usare il gestionale da qualunque
    dispositivo in LAN senza ricompilare
  Backend: app.listen su '0.0.0.0', non 'localhost' — necessario per
    essere raggiungibile da telefoni/tablet in LAN
  SSE (sala/cucina/ristorante): URL calcolato a runtime nello stesso modo
  frontend/next.config.ts — allowedDevOrigins richiede l'IP specifico del
    PC (es. 192.168.1.6), Next.js non supporta notazione a subnet; l'IP
    cambia ogni giorno via DHCP — verificare con ipconfig prima di ogni
    sessione di test da mobile
  AppShell.tsx e AuthContext: montati con dynamic(ssr:false) — NON
    rimuovere, altrimenti si rompe la lettura del JWT dal cookie lato client

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

## 14. EVOLUTIVE E BACKLOG

Gap noti, bug minori non bloccanti e miglioramenti deliberatamente
rimandati: `docs/EVOLUTIVE.md`. Non è materiale da lavorare proattivamente
— si consulta quando si torna a toccare il modulo in questione.

---

## 15. AGGIORNAMENTO DI QUESTO FILE

Dopo ogni modulo completato:
1. Marca il modulo come ✅ nella tabella della Sezione 8
2. Se emergono decisioni tecniche non ovvie, aggiungi una nota di sintesi in `docs/DIARIO_SESSIONI.md` (non qui — questo file resta la spec permanente)
3. Se emergono gap noti non urgenti, aggiungili a `docs/EVOLUTIVE.md`
4. Segnala se sono emerse dipendenze non previste

---

## 16. STATO ATTUALE E PROSSIMO STEP

*(Sezione aggiornata ad ogni sessione — è l'unica parte "storica" che
resta qui, perché serve leggerla per prima ad ogni nuova sessione.
Cronologia completa: `docs/DIARIO_SESSIONI.md`.)*

**Fase 1**: quasi completa. Unico step rimasto: **1.10 — Deploy VPS**
(Nginx, PM2, SSL, backup automatico) su Hetzner CX22 (~€75-90/anno).
Prima del deploy, ripetere l'audit di sicurezza completo (Sezione 7).

**Fase 2A**: modulo Prenotazioni con CRUD, state machine, griglia planning
drag-and-drop, gruppi e pagamenti è implementato e in uso (dettaglio in
`docs/PRENOTAZIONI_FASE2.md`). **2.2 — Tariffe, stagionalità, pacchetti**
completato e verificato (74 test automatici verdi + verifica manuale
end-to-end, 31/07/2026). Prima di **2.3 — integrazione WuBook/WooDoo**
(channel manager OTA) è stato fatto un riordino IA preliminare (vedi sotto).
**2.3 Fase 1 — mappatura camere↔canale OTA** completata (31/07/2026):
tabella `tipi_camera_canali`, CRUD `/api/canali-ota`, sezione "Codici
canale OTA" in `/tariffe`. Su richiesta esplicita del titolare, la sessione
si è fermata qui: il resto di 2.3 (ricezione webhook, invio disponibilità/
tariffe) resta bloccato sulla Fase 0 del piano (sottoscrizione WuBook, non
ancora fatta).

**Modulo 1.3 — Camere**: rinominata in UI "Stato Camere" (era "Camere"),
spostata in sidebar sotto OSPITALITÀ, permessi di scrittura su
fermata/partenza estesi da soloTitolare a admin/titolare/receptionist/
portiere_notte (`shared/ruoli.js` sezione `camere`). Griglia planning
(`/planning-camere`) ora integra una scopetta per riga camera (stato
pulizia/note di oggi) con popup di gestione — 4 fix/miglioramenti in
sessione unica, 31/07/2026, 23 test automatici verdi (dettaglio in
`docs/DIARIO_SESSIONI.md`).

**Impostazioni▸Camere (nuovo, 31/07/2026)**: nuova sezione sidebar
"IMPOSTAZIONI" (admin/titolare) con voci Utenti (invariata) e Camere
(`/impostazioni/camere`, nuova). Contiene: anagrafica camere fisiche (NUOVA
— crea/modifica/attiva-disattiva, prima non esisteva in nessuna UI) più
categorie camera e assegnazione categoria→camera (spostate da `/tariffe`,
che ora contiene solo il listino). Mai una DELETE reale sulle camere — solo
disattivazione, bloccata con 409 se la camera ha soggiorni in corso o
futuri. Nuova azione permessi `camere.anagrafica` in `shared/ruoli.js`.
Verificato in locale dal titolare: 19/19 suite e 472/472 test verdi (3 bug
reali trovati e corretti durante la verifica, non anticipabili da codice —
dettaglio completo in `docs/DIARIO_SESSIONI.md`).

**Ultimo aggiornamento**: 31/07/2026 — modulo 2.2 (Tariffe/stagionalità/
pacchetti) completato; 4 fix su Stato Camere e planning; riordino
Impostazioni▸Camere con nuova anagrafica camere fisiche; 2.3 Fase 1
(mappatura camere↔canale OTA) completata, verifica locale confermata dal
titolare: 20/20 suite e 482/482 test verdi (vedi `docs/DIARIO_SESSIONI.md`
per il dettaglio di tutti e quattro). Sessione fermata qui su richiesta
esplicita del titolare — 2.3 resta bloccato sulla sottoscrizione WuBook per
il resto (webhook, invio disponibilità/tariffe).

**Sequenza di sviluppo 01/08/2026 (decisione esplicita del titolare)**: le
prossime sessioni sviluppano prima tutti i moduli residui che NON
richiedono un abbonamento/pagamento non ancora sottoscritto — **1.10
Deploy VPS resta escluso ed è rimandato**, deviando dall'ordine di
Sezione 8/13 ("mai Fase 2 prima del go-live Fase 1") per decisione
esplicita del titolare. Ordine concordato: 2.4 → 2.6 → 2.5 → 4.2 → 5.1 →
5.2 → 5.3 (solo parte non legata al booking engine, bloccato da WuBook).
Omnitec è stato poi escluso dallo scope di 5.2 durante quella sessione (vedi
sotto) — non è più un prerequisito di verifica. **2.4 —
Tassa di soggiorno completato** (01/08/2026): tabelle
`configurazione_tassa_soggiorno` (storico aliquote, mai sovrascritto) e
`tasse_soggiorno` (calcolo per soggiorno, congelato dopo riscossione,
migration 021); endpoint configurazione/calcolo/riscossione/report+export
Excel; pagine `/impostazioni/tassa-soggiorno` (aliquote, admin/titolare) e
`/tassa-soggiorno` (operativa, +receptionist); sezione `tassa_soggiorno` in
`shared/ruoli.js` e `frontend/lib/ruoli.js`. 29/29 test verdi in locale
(dettaglio in `docs/DIARIO_SESSIONI.md`). Formato del report richiesto dal
Comune di Lerici resta da verificare — export Excel generico adattabile.

**2.6 — Export ROSS1000/ISTAT: IN PAUSA** (01/08/2026). I due manuali
caricati in `docs/` sono solo guide utente al portale, non il tracciato
record (formato byte-esatto del file .txt/.xml) — quello va scaricato dal
titolare dal portale ROSS1000 stesso (menù Manuali, login SPID struttura).
Riprendere solo quando disponibile.

**2.5 — Alloggiati Web: decisione presa, non ancora iniziato lo sviluppo**
(01/08/2026). Confermato **SOAP diretto** a `WS_ALLOGGIATI` (non
intermediario REST — nessun provider mai scelto, l'analisi già fatta è
specifica per il SOAP diretto, gratuito). Rilette entrambe le fonti
ufficiali (`MANUALEWS.pdf`, `MANUALEALBERGHI.pdf`): tracciato record 168
caratteri confermato campo per campo (posizioni, obbligatorietà per
tipo_alloggiato), metodi SOAP completi (`GenerateToken`, `Test`, `Send`,
`Ricevuta`, `Tabella` per le tabelle di codifica, `GestioneAppartamenti_*`
per la casa in affitto). Scoperto uno scope più ampio del previsto: i campi
codificati in `ospiti` (migration 016) non hanno mai avuto una UI — vedi
Clienti sotto. Split concordato: **Fase 1** = tabelle di codifica + UI
scheda ospite (nessuna chiamata Test/Send, zero rischio); **Fase 2** =
generatore schedina + client SOAP + invio reale, quando il titolare è
pronto a testare con le sue credenziali (già disponibili, non ancora usate
per cautela). Casa in affitto (Appartamento) rimandata a quando sarà
registrata sul portale — questa fase copre solo le 20 camere hotel.

**2.5 Fase 1b — tabelle di codifica + tendine scheda ospite: ✅ Fatto**
(01/08/2026). Migration `022_alloggiati_codici.sql` (tabella generica
`alloggiati_codici`, `tabella`+`codice` come chiave, `dati_extra JSONB` per
non perdere colonne CSV non ancora mappate — la struttura esatta della
tabella "Luoghi" non è documentata nei manuali, solo assunta: colonna 1 =
codice, colonna 2 = descrizione). Client SOAP grezzo scritto a mano
(`backend/lib/alloggiatiSoapClient.js`, niente nuova dipendenza — XML
template + estrazione regex, sufficiente per `GenerateToken`/`Tabella` che
hanno risposte piatte; `Test`/`Send` in Fase 2 avranno risposte annidate e
potrebbero richiedere un parser XML vero). Nuovo controller/route
`/api/alloggiati` (sincronizza/stato riservati ad admin/titolare, lettura
codici anche a receptionist/portiere_notte). Pagina Impostazioni ▸
Alloggiati Web con stato sincronizzazione e pulsante "Sincronizza ora".
Componente riutilizzabile `SelettoreCodiceAlloggiati` usato sia nel form
nuovo cliente (`/clienti`) sia nella scheda cliente (`/clienti/:id`, vista
e modifica) per: stato/comune di nascita, cittadinanza, tipo documento,
luogo di rilascio. Il numero documento resta a scrittura sola andata (la
GET non lo restituisce mai in chiaro, solo mascherato). Non testata la
sincronizzazione reale contro WS_ALLOGGIATI in questa sessione (nessuna
credenziale disponibile nell'ambiente di sviluppo usato) — solo il ramo
"credenziali mancanti → 400". Primo test reale rimandato a quando il
titolare esegue "Sincronizza ora" in locale con le sue credenziali.
14/14 test verdi in locale (`tests/api/alloggiati.test.js`).

**Modulo 2.5 — correzione tabelle di codifica da documenti reali
(02/08/2026)**: il titolare ha fornito 4 CSV reali (stati, comuni,
documenti, tipo_alloggiato) e un manuale aggiuntivo
(`MANUALEPASSAGGIO.pdf`, migrazione login portale) in `docs/alloggiati
web/`. Confermata corretta la struttura `Luoghi`=Stati+Comuni insieme
(enum ufficiale `TipoTabella` del manuale WS_ALLOGGIATI). Corretto il
parser CSV (`rilevaSeparatore` in `alloggiatiSoapClient.js`: i CSV reali
usano `,`, il manuale SOAP dichiara `;` — auto-rilevato invece di fisso).
Nuovo script una tantum `backend/scripts/importaCodiciAlloggiatiCsv.js`
(stesso upsert di "Sincronizza ora", rieseguibile senza rischi) ha
popolato `alloggiati_codici` con i dati reali, sbloccando le tendine di
`/clienti` senza aspettare le credenziali WS_ALLOGGIATI. Voci storiche
(comuni fusi/rinominati, `DataFineVal` valorizzata) ora in fondo alla
lista suggerimenti, non nascoste (`ORDINE_STORICO` in
`alloggiatiController.js`). Resta MAI TESTATA la sincronizzazione SOAP
reale (`GenerateToken`/`Tabella` contro il servizio vero) — dettaglio in
`docs/EVOLUTIVE.md` e `docs/DIARIO_SESSIONI.md` (voce 02/08/2026).

**Fix 01/08/2026 — testo libero per documento/nazionalità** (segnalato dal
titolare, stessa sessione: dopo il primo test locale, i campi non si
salvavano — causa: `alloggiati_codici` era ancora vuota, e la Fase 1b
iniziale rendeva quei 5 campi compilabili SOLO scegliendo un codice
sincronizzato, bloccando la registrazione di un documento se la
sincronizzazione non era ancora stata fatta). Correzione architetturale,
non solo un bug fix: la reception deve sempre poter registrare un
documento a testo libero leggendolo dal documento fisico del cliente,
indipendentemente da Alloggiati Web — il codice ufficiale è un aiuto per
l'invio della schedina futura (Fase 2), mai un requisito per registrare
l'ospite oggi. Migration `023_alloggiati_testo_libero.sql` (5 colonne
`*_testo` companion alle `*_codice` esistenti). `SelettoreCodiceAlloggiati.jsx` ridisegnato:
testo e codice controllati dal genitore, mai bloccante — digitando si
azzera il codice già abbinato (un testo che cambia non garantisce più
la corrispondenza), selezionando un suggerimento si abbinano testo e
codice insieme (icona ✓ visibile solo allora). La vista sola lettura in
`/clienti/:id` ora mostra direttamente `cliente.*_testo` — eliminato il
componente `SoloLettura` che prima faceva un lookup di rete solo per
mostrare una descrizione, non più necessario col testo salvato in chiaro.
Punto aperto per il futuro (Fase 2, non ora): segnalare prima dell'invio
schedina i campi con testo ma senza codice abbinato — annotato in
`docs/EVOLUTIVE.md`. Segnata anche lì, come evolutiva futura non urgente,
l'idea del titolare di acquisire il documento via fotocamera/OCR o
lettore hardware dedicato per velocizzare il check-in (si sovrappone al
modulo 5.2). **26/26 test verdi in locale (`anagrafica-ospiti.test.js`,
esteso con 2 nuovi casi), confermato dal titolare: il testo libero si
salva e resta visibile dopo il salvataggio.**

**Sezione Clienti — completa il modulo 2.1** (01/08/2026, su richiesta del
titolare, emersa discutendo compatibilità GDPR di un CRM clienti prima di
2.5). `/api/ospiti` esisteva dalla migration 016 ma senza UI propria (solo
autocomplete in "Nuova prenotazione"). Aggiunto: pagine `/clienti` (ricerca
+ tabella con conteggio soggiorni) e `/clienti/[id]` (anagrafica
modificabile, documento mascherato con svela audit-logged, toggle consenso
marketing, storico soggiorni + totale speso). Nessuna migration, nessun
nuovo permesso (riuso sezione `ospiti` di `shared/ruoli.js`, invariata) —
solo una sottoquery `numero_soggiorni` in più nel controller esistente.
24/24 test verdi in locale. Estesa nella stessa sessione con la Fase 1b di
2.5 sopra: entrambe le pagine ora espongono anche i campi codificati
(nazionalità/documento) tramite `SelettoreCodiceAlloggiati`.

**4.2 — Welcome Book digitale: ✅ Fatto** (02/08/2026, repo `sito-hotel`,
non in questo repo). Hub `/[locale]/benvenuto` con griglia di 6 pulsanti
(Orari, WiFi, Regole della casa, Ristorante, Contatti, Lerici), ognuno con
la propria sottopagina — ristrutturato da un primo tentativo a pagina
unica a scorrimento dopo feedback del titolare (voleva pulsanti come i
prodotti "welcome book" commerciali di riferimento). Contenuto gestito da
un nuovo singleton Sanity `welcomeBook`; riusa dati già esistenti
(`sezioneRistorante.linkMenu`, `infoHotel.telefono`/`orariReception` — quest'ultimo
campo esisteva nello schema ma non era mai stato letto da nessuna query,
ora sì) invece di duplicarli. Pagina fuori da sitemap e menu pubblico,
`robots: noindex` su ogni sottopagina (contiene la password WiFi). Nuova
dipendenza `lucide-react` per le icone dei pulsanti. QR stampabile
generato puntando prima al dominio finale poi rigenerato con l'URL
provvisorio Vercel (`https://sito-hotel-five.vercel.app`) non appena
disponibile — da rigenerare un'ultima volta quando `hoteldelgolfolerici.com`
sarà il dominio attivo. **Confermato dal titolare sul deploy Vercel reale:
la griglia funziona bene da telefono.** Nota per il titolare: ha segnalato
che vuole aggiungere altri pulsanti/sezioni più avanti — nessuna richiesta
specifica ancora, da riprendere quando la porta.

**Deploy Vercel di `sito-hotel`: primo deploy fatto in questa sessione**
(02/08/2026) — repo GitHub `pgwall84/sito-hotel` collegato a Vercel dal
titolare, env var minime impostate (`NEXT_PUBLIC_SANITY_PROJECT_ID`,
`NEXT_PUBLIC_SANITY_DATASET`). URL provvisorio:
`https://sito-hotel-five.vercel.app` — dominio finale
`hoteldelgolfolerici.com` non ancora collegato.

**5.1 — Check-in/check-out digitale + housekeeping: ✅ Fatto** (03/08/2026).
Nessuna nuova state machine: le transizioni `check_in`/`check_out` esistevano
già (modulo Prenotazioni Fase 2A). Aggiunto: pagina `/arrivi-partenze`
(sidebar OSPITALITÀ) con liste Arrivi/Partenze di oggi e check-in/check-out
a un click, riusando `GET /api/prenotazioni/griglia` e
`PATCH /api/prenotazioni/:id/stato` — nessuna rotta backend nuova.
Housekeeping: fermata/partenza in `/camere` (Stato Camere) e nel popup
"scopetta" di `/planning-camere` non sono più impostabili a mano — calcolate
sempre in tempo reale da `soggiorni` (partenza = soggiorno che finisce oggi;
fermata = soggiorno in corso che non finisce oggi; gestito anche il
turnover stesso giorno, entrambe vere insieme), sostituendo l'impostazione
manuale come indicato in `docs/PRENOTAZIONI_FASE2.md` Parte D. Stesso
calcolo applicato al KPI "movimenti camere" della Dashboard (prima leggeva
`stato_camere`, ora `soggiorni` — le tre viste erano disallineate, ora
condividono la stessa fonte). Solo `pronta` (pulizia fatta/da fare) e
`note` restano scrivibili a mano. Permessi "segna pronta"
(`POST /api/camere/pronta`) ristretti su indicazione del titolare: prima
aperto a qualunque ruolo autenticato, ora tutti tranne cuoco (nuova azione
`camere.pulizia` in `shared/ruoli.js`). 536/536 test verdi in locale
confermati dal titolare (22 suite). Tre idee del titolare loggate in
`docs/EVOLUTIVE.md`, non sviluppate ora: riordino più ampio del menu/
sidebar (la sezione OSPITALITÀ è arrivata a 7 voci), una pagina
"Prenotazioni" dedicata in forma di tabella (complementare alla griglia
`/planning-camere`), una sezione marketing per invio email/SMS/WhatsApp.

**Menu mobile — bottom nav disallineata dal menu desktop: corretto**
(04/08/2026). Segnalato dal titolare: da telefono si vedevano solo 5 voci
vecchie (Home/Personale/Timbratura/HACCP/Magazzino per il titolare) — la
lista `VOCI_MOBILE` in `Sidebar.tsx` era statica e non aggiornata da quando
sono cresciute le sezioni Ospitalità/Impostazioni. Nuova struttura: 4 icone
rapide curate per ruolo + pulsante "Menu" che apre un pannello con tutte le
voci consentite, letto dalla stessa fonte del desktop (`SEZIONI_MENU`) —
non può più disallinearsi in futuro, solo le 4 icone rapide restano da
curare a mano. **Provvisorio per esplicita richiesta del titolare**: sia le
4 icone rapide per ruolo sia, più in generale, i permessi ruolo↔voci vanno
rivisti quando il progetto sarà a regime (annotato anche in memoria
persistente, non solo qui).

**5.2 Fase A — Pre check-in digitale, scansione documento con OCR: ✅
Chiuso** (04/08/2026, sessione di test reale con il titolare su Android/
Galaxy S23). Riusato il pattern OCR già collaudato in `ztl/page.jsx`
(tesseract.js lato client, mai streaming live — vedi motivazione HTTPS in
`frontend/lib/ocrDocumento.js`), non una nuova infrastruttura: niente nuovo
endpoint backend, solo migration `024_documento_scadenza.sql` +
colonna in `anagraficaOspitiController.js` (fatte a inizio sessione).
**Omnitec escluso dallo scope** su indicazione del titolare: è un sistema
di chiavi elettroniche per le camere completamente separato, nessun
collegamento possibile né richiesto.

Il grosso del lavoro è stato iterare sull'affidabilità dell'OCR contro
foto reali di una CIE, non prevedibile da codice:
- `ScannerDocumento.jsx`: aggiunto uno step di ritaglio manuale (due
  maniglie trascinabili) tra lo scatto e l'OCR — inquadrare a mano solo la
  fascia MRZ con la fotocamera del telefono si è rivelato troppo impreciso;
  ritagliare dopo lo scatto dà una risoluzione effettiva molto più alta
  sulla parte che conta.
- `ocrDocumento.js`: pre-elaborazione dell'immagine (bianco/nero puro con
  soglia di Otsu, si adatta da sola alla luce di ogni foto — necessaria
  perché le carte lucide/olografiche danno risultati molto incostanti
  scatto per scatto); tre tentativi in sequenza (layout automatico → charset
  ristretto alla MRZ + layout "sparse text" → modello Tesseract
  specializzato sul font OCR-B, `public/tessdata/mrz.traineddata.gz`,
  estratto dal pacchetto open source `web-mrz-reader` — solo il file del
  modello, non l'intero pacchetto npm, che dipende da tesseract.js v5 e
  sarebbe entrato in conflitto con la v7 già in uso per ZTL); parsing tollerante al
  rumore OCR (fallback per righe TD1 troncate dai riempitivi '<' persi,
  separatore cognome/nome riconosciuto anche se letto in modo imperfetto,
  correzione delle confusioni cifra↔lettera nel campo nazionalità).

Esito finale verificato su documento reale: cognome, sesso, data di
nascita, data di scadenza e nazionalità si precompilano in modo affidabile;
il nome a volte necessita una correzione manuale minore; il numero
documento non viene mai precompilato, per scelta — è sulla riga MRZ più
vicina al codice a barre, la meno leggibile in assoluto nei test, meglio
lasciarla sempre a inserimento manuale che rischiare un dato sbagliato.
Il form resta comunque sempre interamente compilabile a mano, come prima
che esistesse lo scanner: l'OCR è un aiuto opzionale, non un requisito.
Il titolare valuterà in futuro l'acquisto di un lettore ottico hardware
dedicato (MRZ) se servirà maggiore affidabilità — nessuna azione da
intraprendere ora, annotato in `docs/EVOLUTIVE.md`. **Fase B** (form
self-service da remoto con token pubblico + email automatica via Resend)
resta non iniziata, da riprendere quando il titolare vorrà.

**5.3 — Email automatiche: ✅ Fatto** (04/08/2026, solo email — SMS
escluso, provider a pagamento fuori dalla sequenza di moduli gratuiti).
Provider Resend (free tier), dominio ancora di test. Tre email: conferma
(fire-and-forget alla transizione di stato verso 'confermata'), promemoria
pre-arrivo e richiesta recensione post-partenza (job giornaliero
`backend/jobs/promemoriaEmail.js`, node-cron). Pulsante di test manuale
riservato ad admin/titolare in `/planning-camere` (bypassa stato/date
reali). **Estensione stessa giornata, su richiesta del titolare**: testi
delle 3 email (oggetto+corpo, placeholder `{nome_ospite}`/
`{elenco_soggiorni}`/`{hotel}`) ora editabili da Impostazioni▸Testi email,
con footer comune (dati hotel, logo opzionale — richiede un URL pubblico
esterno, il gestionale è ancora solo su LAN); nuova sezione sidebar
MARKETING▸Offerte per inviare offerte dedicate a clienti specifici o a
tutti quelli con consenso marketing, con storico invii. Filtro
`consenso_marketing` sempre applicato lato backend, mai bypassabile dalla
UI. Dettaglio tecnico completo: `docs/DIARIO_SESSIONI.md`, voce 04/08/2026.

**5.2 Fase B — Pre check-in self-service da remoto: ✅ Fatto** (04-05/08/2026,
verificato dal titolare in locale il 05/08/2026). Migration `027_pre_checkin.sql`
(tabelle `pre_checkin_ospiti` e `nuclei_familiari`); `backend/lib/preCheckin.js`
genera un token pubblico per soggiorno e lo invalida a ogni nuovo invio
(comportamento di sicurezza intenzionale — un link vecchio smette sempre di
funzionare, non un bug); route pubbliche non autenticate sotto
`/pre-checkin-pubblico` (compilazione dati) e route reception autenticate
per la coda e l'invio link; pagina pubblica `/pre-checkin/[token]` (form
self-service, riusa lo stesso pattern OCR/tendine di `/clienti`) e pagina
reception `/pre-checkin` (coda soggiorni + pulsante "invia link"). Riusa
Resend già configurato per il modulo 5.3 — nessuna nuova infrastruttura
email. Test `tests/api/pre-checkin.test.js`.

**Estensioni trasversali sullo stesso form (stessa sessione)**:
suggerimento provincia (`frontend/components/ui/SelettoreProvincia.jsx`,
client-side, nessuna chiamata di rete — le sigle provinciali italiane non
hanno una tabella ufficiale WS_ALLOGGIATI) applicato sia a `/clienti` che
al pre check-in; campi stato/comune di **residenza** (diversi dal luogo di
nascita, mai raccolti prima) aggiunti a `ospiti` e `pre_checkin_ospiti`
(migration `029_ross1000.sql`) con lo stesso pattern testo libero + codice
ufficiale già in uso — introdotti per il modulo 2.6 (sotto), ma raccolti
anche qui su richiesta esplicita del titolare.

**Planning-camere — due fix UX** (05/08/2026): vista di default passata da
7 a 14 giorni; tooltip al passaggio del mouse sulle barre prenotazione
esteso con intervallo date, numero ospiti, stato e tariffa. Inoltre, per
evitare la confusione del titolare sul "link non valido" (comportamento
corretto — un reinvio invalida sempre il precedente, vedi sopra): ora si
chiede conferma prima di reinviare un link pre-checkin già mandato, con
indicazione a schermo che risulta già inviato.

**Bugfix — pagina Offerte, "errore interno"** (05/08/2026): query in
`offerteEmailController.js` (`lista()`) usava `id` senza alias in una
query con `LEFT JOIN users u` (anch'essa con colonna `id`) — errore
PostgreSQL 42702 "riferimento alla colonna ambiguo". Corretto qualificando
tutte le colonne con l'alias `o.`.

**2.6 — Export ROSS1000/ISTAT, Fase 1: ✅ Fatto** (05/08/2026, verificato
dal titolare in locale). Genera solo il file XML per verifica manuale —
nessun invio reale (mancano le credenziali HTTP Basic di Regione Liguria,
da richiedere all'Ufficio Turismo; endpoint
`https://turismows.regione.liguria.it/ws/checkinV2?wsdl`). Tracciato
ufficiale letto integralmente da `docs/ross1000/tracciato.pdf`: root
`<movimenti>` con un `<movimento>` per giorno (apertura, camere/letti
disponibili, camere occupate, arrivi/partenze/prenotazioni). Riusa le
stesse tabelle di codifica di Alloggiati Web (Stati/Comuni/Tipi_Alloggiato,
modulo 2.5) — grossa sinergia implementativa, nessuna tabella nuova per
quello. Scoperta chiave che ha ridotto lo scope: i campi "obbligatori"
`tipoturismo`/`mezzotrasporto` ammettono ufficialmente il valore "Non
specificato", quindi non è stato necessario raccogliere nuovi dati dagli
ospiti per quei due — valorizzati di default. Ospiti con dati davvero
mancanti (sesso, cittadinanza, data di nascita, residenza) vengono esclusi
dall'XML con un avviso esplicito invece di generare un file non conforme;
gli avvisi mostrano nome ospite e numero camera (non l'id interno) dopo un
miglioramento richiesto dal titolare durante il primo test. File
principali: `backend/lib/ross1000Xml.js` (generatore), `ross1000Controller.js`
+ `routes/ross1000.js` (`GET /api/ross1000/export`, admin/titolare),
pagina `/impostazioni/ross1000` (range date, avvisi, anteprima e download
XML), voce sidebar "Export ROSS1000". Test `tests/api/ross1000.test.js`.
Modulo 2.6 Fase 2 (invio reale) resta bloccato sulle credenziali, stesso
pattern di attesa già usato per Alloggiati Web Fase 2.

**CampoData — selettore anno sui calendari (05/08/2026)**: segnalato dal
titolare che il calendario nativo del browser costringe ad andare indietro
mese per mese per cambiare anno (problema soprattutto sulle date di
nascita, fino a 110 anni indietro). Nuovo componente
`frontend/components/ui/CampoData.jsx` (input `type="date"` nativo + un
`<select>` anno separato accanto) applicato a tutti e 30 i campi data del
gestionale, in 14 file — range di anni tarato per contesto (nascita:
-110/oggi; scadenza documento: -1/+11, il massimo di validità legale in
Italia per un documento appena rinnovato; scadenze HR, magazzino, archivio
e altri campi operativi: range più stretti per contesto). Funziona, ma il
titolare non è pienamente soddisfatto della soluzione esteticamente/UX —
**annotato in `docs/EVOLUTIVE.md` come provvisorio**, da valutare in futuro
un vero componente calendario custom.

---

**Workflow git/test/deploy (06/08/2026, permanente)**: da questa sessione
Cowork progetta e scrive il codice; il tab "Code" (Claude Code nativo sul
PC del titolare) esegue git, test e deploy del sito — mai `git` dal
sandbox Cowork su questi due repo. Vedi `docs/DIARIO_SESSIONI.md`,
voce 06/08/2026, per il perché.

**Sessione 06/08/2026**: chiuse 3 evolutive minori segnalate dal titolare.
Ristorante — `DELETE /api/ristorante/config/:id` (mancava del tutto, non
solo senza blocco): blocca se Standard, se attiva, o se ha tavoli
associati. Magazzino — storico prezzi prodotto, alert scadenze
progressivi, bozza ordine fornitori (fornitore inferito dall'ultimo
carico, nessuna anagrafica fornitore su `prodotti`). Dashboard — 3 nuovi
alert (opzioni prenotazione in scadenza 48h, documenti Alloggiati Web
incompleti per gli arrivi di oggi, pre check-in in attesa di revisione);
un quarto (export ROSS1000 in sospeso) rimandato dal titolare a dopo il
go-live, non costruibile senza una tabella di log nuova. Corretto anche un
bug reale preesistente: `frontend/lib/api.js` leggeva solo la chiave
`error` (inglese) dalle risposte del backend, ma 22 controller su 40
rispondono `errore` (italiano) — per metà del gestionale l'utente vedeva
sempre "Errore {status}" generico invece del messaggio specifico. Dettaglio
completo, incluso il lavoro sul sito (`sito-hotel`, pulsante WhatsApp) e
l'approfondimento su Iubenda: `docs/DIARIO_SESSIONI.md`, voce 06/08/2026.

## 17. DOCUMENTI DI PROGETTO

Indice di dove si trova cosa, per evitare di ricreare doppioni:

| File | Contenuto |
|---|---|
| `CLAUDE.md` (questo file) | Identità, stack, ruoli, struttura, convenzioni, DB, sicurezza, roadmap — spec permanente |
| `docs/PRENOTAZIONI_FASE2.md` | Contratto API + schema DB + UI del modulo Prenotazioni (Fase 2A), stato implementato/non implementato |
| `docs/PIANO_MIGRAZIONE_DICEMBRE_2026.md` | Piano di migrazione da TeamSystem al sistema interno, step-by-step con dipendenze e rischi, target dicembre 2026 |
| `docs/confronto_costi_fase2.xlsx` | Tabella costi oggi vs a lavoro completo (Fase 2) |
| `docs/DIARIO_SESSIONI.md` | Cronologia sessione-per-sessione: bug trovati, decisioni prese, deviazioni dal piano |
| `docs/DEPLOY_VPS_NETCUP.md` | Guida operativa server di produzione (netcup): accesso, stack, database, Nginx/SSL, PM2, backup, come aggiornare l'app |
| `docs/EVOLUTIVE.md` | Backlog di gap noti e miglioramenti rimandati, non urgenti |
| `docs/MANUALEALBERGHI.pdf`, `docs/MANUALEWS.pdf` | Manuali ufficiali Alloggiati Web (WS_ALLOGGIATI Rev.01) — riferimento per il modulo 2.5 |
| `docs/ross1000/tracciato.pdf` | Tracciato XML ufficiale ROSS1000/ISTAT Regione Liguria — riferimento per il modulo 2.6 |
| `AVVIO.md` | Come avviare il progetto in locale (setup DB, backend, frontend) |
| repo `sito-hotel`, `SPEC_SITO_HOTEL.md` | Spec completa del sito web (progetto separato, non duplicata qui) |

---

*Documento aggiornato al 09/08/2026 — **1.10 Deploy VPS completato, incluso l'audit di sicurezza pre-produzione**: gestionale in produzione su netcup VPS Lite 1 G12s, HTTPS attivo su `hdgolfo-gestionale.com`, backup notturno locale programmato. **Fase 1 chiusa.** Guida operativa completa: `docs/DEPLOY_VPS_NETCUP.md`. Fase 2A: moduli 2.2 e 2.4 completati, sezione Clienti (modulo 2.1) aggiunta, 2.5 Fase 1b (tabelle di codifica + tendine scheda ospite) completata — Fase 2 (schedina + invio reale) da avviare quando pronto a testare con credenziali reali. **2.6 (Export ROSS1000/ISTAT) Fase 1 completata e verificata dal titolare** (generazione XML, nessun invio reale — in attesa credenziali Regione Liguria). 4.2 (Welcome Book digitale, repo sito-hotel) completato e in produzione su Vercel (dominio provvisorio). 5.1 (Check-in/check-out digitale + housekeeping) completato: stato camere in tempo reale da `soggiorni`, nuova pagina Arrivi/Partenze. **5.2 completato in entrambe le fasi**: Fase A (scansione documento con OCR) chiusa dopo test reali su CIE — Omnitec escluso dallo scope; **Fase B (pre check-in self-service da remoto con token pubblico) verificata dal titolare in locale il 05/08/2026**. 5.3 (email automatiche via Resend, solo email) completato ed esteso con gestione testi (Impostazioni▸Testi email) e offerte dedicate ai clienti (Marketing▸Offerte, rispetta sempre il consenso marketing). Estensioni trasversali della sessione del 05/08: suggerimento provincia su `/clienti` e pre check-in, campi di residenza (ospiti + pre-checkin, per il modulo 2.6), due fix UX su `/planning-camere` (vista 14 giorni di default, tooltip più ricchi, conferma prima di reinviare un link pre-checkin), bugfix pagina Offerte (colonna SQL ambigua), e un nuovo componente `CampoData` (selettore anno) applicato a tutti i 30 campi data del gestionale — funzionante ma segnalato dal titolare come soluzione UX non ideale, alternative da valutare in futuro (`docs/EVOLUTIVE.md`). Corretta anche la bottom nav mobile, disallineata dal menu desktop da tempo (assegnazione ruolo↔voci provvisoria, revisione in sospeso su richiesta del titolare). **06/08/2026**: workflow git/test/deploy spostato permanentemente sul tab Code (mai più git dal sandbox Cowork); chiuse 3 evolutive minori (DELETE configurazione sala ristorante, 3 evolutive magazzino — storico prezzi/scadenze/bozza ordine, 3 nuovi alert Dashboard — opzioni in scadenza/documenti Alloggiati Web/pre check-in); corretto un bug reale preesistente sulla propagazione dei messaggi di errore backend→frontend (`frontend/lib/api.js`, leggeva solo la chiave inglese `error` mentre 22 controller su 40 rispondono in italiano `errore`); su `sito-hotel` aggiunto un pulsante WhatsApp flottante (link diretto, nessuna API a pagamento — Telegram rimandato, l'hotel non ha un account). Dettaglio completo: `docs/DIARIO_SESSIONI.md`.*
