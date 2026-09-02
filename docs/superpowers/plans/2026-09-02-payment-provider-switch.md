# Switch provider di pagamento (Stripe ⇄ Nexi XPay) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere il Booking Engine Diretto (repo `gestionale-hotel`) capace di usare Stripe o Nexi XPay come unico motore di pagamento attivo per la caparra del 30%, selezionabile con una variabile d'ambiente e un restart del backend, senza toccare codice e senza impatto sulle prenotazioni con hold già aperto al momento del cutover.

**Architettura:** Un selettore (`lib/payments/index.js`) sceglie tra due moduli provider (`stripeProvider.js`, `nexiProvider.js`) senza forzare un'interfaccia comune tra i due — i flussi sono strutturalmente diversi (Stripe asincrono via webhook, Nexi sincrono via nonce/pagaNonce). La transizione di stato della prenotazione (conferma / gestione hold scaduto) è estratta in una funzione condivisa (`lib/prenotazioni/confermaPrenotazione.js`) chiamata da entrambi i percorsi. Il frontend (repo `sito-hotel`, FUORI SCOPE da questo piano — vedi nota in fondo) saprà quale componente di raccolta-carta montare leggendo il campo `provider` già aggiunto a `GET /api/booking-pubblico/configurazione`.

**Tech Stack:** Node.js/Express, PostgreSQL (`pg`), Stripe SDK, `fetch` nativo per le chiamate Nexi, Jest + Supertest (nuovi in questo piano).

## Global Constraints

- Nessuna operazione git mutante (`commit`, `checkout`, `merge`, `push`) va eseguita da una sessione Cowork — chi esegue questo piano in una sessione Cowork deve fermarsi prima di ogni commit e chiedere all'utente di eseguirlo, o lavorare da una sessione/ambiente senza questa restrizione.
- Lavoro sul branch `feat/nexi-xpay-build-test` (già esistente, contiene il percorso di test isolato `/xpay-test` verificato funzionante) — non su `main`, che ha modifiche in corso di un'altra sessione parallela non relative a questo lavoro.
- Nessuna riga di codice deve leggere `PAYMENT_PROVIDER` per decidere il comportamento di una prenotazione già esistente: solo `pagamenti.metodo` sulla singola riga decide, mai la env var corrente (vedi design doc, sezione "Comportamento sul cutover").
- Default di `PAYMENT_PROVIDER` non impostata: `'stripe'`, mai `'nexi'` — Nexi non ha credenziali di produzione.
- Risposta di `POST /api/booking-pubblico/prenota` resta compatibile con il formato attuale quando il provider è Stripe (campo `client_secret` in cima all'oggetto, invariato) — il frontend esistente non deve rompersi finché non viene aggiornato in un piano separato.
- Fuori scope (vedi design doc): routing simultaneo EU/extra-UE, "Incasso senza Pensieri", logica di storno/no-show.

---

### Task 1: Infrastruttura di test (Jest + Supertest)

**Files:**
- Modify: `backend/package.json`
- Create: `backend/jest.config.js`
- Modify: `backend/config/db.js`
- Create: `backend/.env.test.example`
- Create: `backend/controllers/bookingPubblicoController.smoke.test.js`

**Interfaces:**
- Produce: script npm `test`; convenzione file test `*.test.js` accanto al file testato; `config/db.js` carica `.env.test` quando `NODE_ENV==='test'`.

- [ ] **Step 1: Aggiungere le dipendenze di test**

Modifica `backend/package.json`:

```json
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest --runInBand"
  },
```

(`--runInBand`: i test toccano lo stesso database reale in sequenza — girare i file di test in parallelo su tabelle condivise, `prenotazioni`/`pagamenti` in primis, produrrebbe race condition tra test, non nel codice.)

```json
  "devDependencies": {
    "nodemon": "^3.1.4",
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  }
```

Esegui: `npm install` dentro `backend/`.

- [ ] **Step 2: Configurare Jest**

Crea `backend/jest.config.js`:

```javascript
// jest.config.js — Jest imposta NODE_ENV='test' automaticamente se non è
// già valorizzata (comportamento di default della CLI), quindi non serve
// cross-env: config/db.js userà .env.test grazie a questo.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  testTimeout: 10000,
};
```

- [ ] **Step 3: Far caricare `.env.test` invece di `.env` quando NODE_ENV=test**

Modifica `backend/config/db.js`, riga 6:

```javascript
require('dotenv').config({ quiet: true });
```

diventa:

```javascript
// In test carica .env.test (database separato — mai i test contro il DB
// di sviluppo/produzione) invece di .env. path relativo alla cwd del
// processo node (backend/), stessa convenzione di dotenv di default.
require('dotenv').config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  quiet: true,
});
```

- [ ] **Step 4: Documentare le variabili del DB di test**

Crea `backend/.env.test.example`:

```
# Database di TEST — separato da sviluppo/produzione. I test (npm test)
# fanno scritture reali (INSERT/UPDATE/DELETE) su prenotazioni/pagamenti,
# MAI puntare questo a un database con dati veri.
#
# Setup una tantum: crea un database Postgres vuoto (es. "gestionale_test")
# ed esegui in ordine tutti i file in database/migrations/*.sql contro
# quel database, stesso modo in cui e' stato creato il database di sviluppo.
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gestionale_test
DB_USER=
DB_PASSWORD=

# Non serve STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET reali per i test dei
# task successivi (i test del webhook usano stripe.webhooks.generateTestHeaderString,
# nessuna chiamata di rete verso Stripe) — un valore placeholder basta.
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_test_placeholder
```

Copia manuale richiesta all'utente (non automatizzabile da qui): `cp backend/.env.test.example backend/.env.test` e compilare `DB_USER`/`DB_PASSWORD`, poi creare ed eseguire le migration sul database `gestionale_test` come descritto nel commento.

- [ ] **Step 5: Primo test — verifica che l'infrastruttura funzioni end-to-end**

Crea `backend/controllers/bookingPubblicoController.smoke.test.js`:

```javascript
const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

describe('smoke test infrastruttura', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('GET /api/booking-pubblico/configurazione risponde 200', async () => {
    const res = await request(app).get('/api/booking-pubblico/configurazione');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('percentuale_caparra');
  });
});
```

- [ ] **Step 6: Eseguire e verificare**

Run: `npm test` (dentro `backend/`, con `.env.test` configurato e database di test raggiungibile e migrato)
Expected: 1 test PASS. Se fallisce con errore di connessione DB, il database di test non e' configurato correttamente (Step 4) — non procedere ai task successivi finche' questo non passa.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json jest.config.js config/db.js .env.test.example controllers/bookingPubblicoController.smoke.test.js
git commit -m "test: aggiunge infrastruttura Jest + Supertest (backend)"
```

---

### Task 2: Migration — nuovo stato `pagamenti.stato` per rimborsi manuali

**Files:**
- Create: `database/migrations/056_pagamenti_stato_manuale.sql`

**Interfaces:**
- Produce: valore `'richiede_rimborso_manuale'` ammesso da `chk_pagamenti_stato`.

- [ ] **Step 1: Scrivere la migration**

Crea `database/migrations/056_pagamenti_stato_manuale.sql`:

```sql
-- Migration 056: nuovo stato pagamenti per pagamenti riusciti su
-- prenotazioni non piu' valide (hold scaduto o gia' interrotto dal cron) su
-- provider senza integrazione di storno automatico (oggi: Nexi — vedi
-- docs/superpowers/specs/2026-09-02-payment-provider-switch-design.md).
-- Stripe in questo stesso caso chiama stripe.refunds.create() e usa
-- 'rimborsato' (rimborso reale, automatico). Per Nexi non esiste ancora
-- un'integrazione di storno (fuori scope, bloccata sulla decisione di
-- Nexi su "Incasso senza Pensieri") — marcare questi pagamenti
-- 'rimborsato' senza aver davvero rimborsato sarebbe fuorviante per chi
-- guarda la tabella pagamenti. 'richiede_rimborso_manuale' rende esplicito
-- che serve un intervento (storno da backoffice Nexi).

ALTER TABLE pagamenti DROP CONSTRAINT chk_pagamenti_stato;
ALTER TABLE pagamenti ADD CONSTRAINT chk_pagamenti_stato CHECK (
  stato IN ('pending','completato','fallito','rimborsato','richiede_rimborso_manuale')
);
```

- [ ] **Step 2: Applicare la migration al database di test**

Run: esegui il contenuto del file sopra contro il database `gestionale_test` (stesso meccanismo manuale gia' in uso per le altre migration di questo progetto — nessun runner automatico esiste, vedi `.env.test.example`).
Expected: nessun errore; `\d pagamenti` in psql mostra il nuovo vincolo con 5 valori ammessi.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/056_pagamenti_stato_manuale.sql
git commit -m "feat(db): aggiunge stato pagamenti 'richiede_rimborso_manuale'"
```

(Ricorda di applicare la stessa migration anche al database di sviluppo/produzione quando questo lavoro viene distribuito — non automatizzato da questo piano.)

---

### Task 3: Moduli provider (`lib/payments/`)

**Files:**
- Create: `backend/lib/payments/stripeProvider.js`
- Create: `backend/lib/payments/nexiProvider.js`
- Create: `backend/lib/payments/nexiProvider.test.js`
- Create: `backend/lib/payments/index.js`
- Create: `backend/lib/payments/index.test.js`

**Interfaces:**
- Produce: `stripeProvider.avviaPagamento({ prenotazioneId, importoEuro }) -> Promise<{ external_payment_id, chiaveRisposta: 'client_secret', datiCliente: string }>`
- Produce: `nexiProvider.avviaPagamento({ prenotazioneId, importoEuro }) -> { external_payment_id, chiaveRisposta: 'pagamento_nexi', datiCliente: object }` (sincrona, nessuna chiamata di rete)
- Produce: `nexiProvider.completaPagamento({ transactionId, xpayNonce, importoEuro }) -> Promise<{ httpStatus, esito }>`
- Produce: `index.nomeProviderAttivo() -> 'stripe' | 'nexi'`
- Produce: `index.providerAttivo() -> stripeProvider | nexiProvider` (stesso modulo scelto da `nomeProviderAttivo()`)

- [ ] **Step 1: `nexiProvider.js` — scrivere il test delle funzioni MAC (pure, nessun DB/rete)**

Crea `backend/lib/payments/nexiProvider.test.js`:

```javascript
describe('nexiProvider — calcolo MAC', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      XPAY_BUILD_ALIAS: 'ALIAS_TEST',
      XPAY_BUILD_MAC_KEY: 'CHIAVE_TEST',
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('macAvvioPagamento produce lo stesso sha1 per gli stessi input', () => {
    const { macAvvioPagamento } = require('./nexiProvider');
    const mac1 = macAvvioPagamento({ transactionId: 'PR1T1000', amount: 15000, currency: 'EUR' });
    const mac2 = macAvvioPagamento({ transactionId: 'PR1T1000', amount: 15000, currency: 'EUR' });
    expect(mac1).toBe(mac2);
    expect(mac1).toMatch(/^[a-f0-9]{40}$/);
  });

  test('macAvvioPagamento cambia se cambia importo', () => {
    const { macAvvioPagamento } = require('./nexiProvider');
    const macA = macAvvioPagamento({ transactionId: 'PR1T1000', amount: 15000, currency: 'EUR' });
    const macB = macAvvioPagamento({ transactionId: 'PR1T1000', amount: 20000, currency: 'EUR' });
    expect(macA).not.toBe(macB);
  });

  test('avviaPagamento lancia se ALIAS/CHIAVE_SEGRETA non configurati', () => {
    process.env.XPAY_BUILD_ALIAS = '';
    const { avviaPagamento } = require('./nexiProvider');
    expect(() => avviaPagamento({ prenotazioneId: 1, importoEuro: 150 })).toThrow(/XPAY_BUILD_ALIAS/);
  });

  test('avviaPagamento restituisce external_payment_id, chiaveRisposta e datiCliente coerenti', () => {
    const { avviaPagamento } = require('./nexiProvider');
    const risultato = avviaPagamento({ prenotazioneId: 42, importoEuro: 150.5 });
    expect(risultato.chiaveRisposta).toBe('pagamento_nexi');
    expect(risultato.external_payment_id).toBe(risultato.datiCliente.transactionId);
    expect(risultato.datiCliente.amount).toBe(15050);
    expect(risultato.datiCliente.alias).toBe('ALIAS_TEST');
  });
});
```

- [ ] **Step 2: Run per verificare che fallisca (il modulo non esiste ancora)**

Run: `npm test -- nexiProvider`
Expected: FAIL con "Cannot find module './nexiProvider'"

- [ ] **Step 3: Implementare `nexiProvider.js`**

Crea `backend/lib/payments/nexiProvider.js`:

```javascript
// backend/lib/payments/nexiProvider.js — client Nexi XPay Build (Alias +
// Chiave MAC, terminale XPay Only), stesso schema verificato funzionante
// nel percorso di test isolato (controllers/xpayTestController.js,
// /xpay-test, 31/08/2026). Usato dal Booking Engine Diretto quando
// PAYMENT_PROVIDER=nexi — vedi lib/payments/index.js e
// docs/superpowers/specs/2026-09-02-payment-provider-switch-design.md.

const crypto = require('crypto');

function sha1(stringa) {
  return crypto.createHash('sha1').update(stringa, 'utf8').digest('hex');
}

function macAvvioPagamento({ transactionId, amount, currency }) {
  return sha1(`codTrans=${transactionId}divisa=${currency}importo=${amount}${process.env.XPAY_BUILD_MAC_KEY}`);
}

function macPagaNonce({ transactionId, amount, currency, xpayNonce, timeStamp }) {
  return sha1(
    `apiKey=${process.env.XPAY_BUILD_ALIAS}codiceTransazione=${transactionId}importo=${amount}divisa=${currency}xpayNonce=${xpayNonce}timeStamp=${timeStamp}${process.env.XPAY_BUILD_MAC_KEY}`
  );
}

function generaTransactionId(prenotazioneId) {
  return `PR${prenotazioneId}T${Date.now()}`;
}

function avviaPagamento({ prenotazioneId, importoEuro }) {
  if (!process.env.XPAY_BUILD_ALIAS || !process.env.XPAY_BUILD_MAC_KEY) {
    throw new Error('XPAY_BUILD_ALIAS o XPAY_BUILD_MAC_KEY non configurati in .env del backend.');
  }
  const amount = Math.round(importoEuro * 100);
  const transactionId = generaTransactionId(prenotazioneId);
  const timeStamp = Date.now();
  const mac = macAvvioPagamento({ transactionId, amount, currency: 'EUR' });
  const dominio = process.env.XPAY_BUILD_HOST || 'int-ecommerce.nexi.it';

  return {
    external_payment_id: transactionId,
    chiaveRisposta: 'pagamento_nexi',
    datiCliente: {
      alias: process.env.XPAY_BUILD_ALIAS,
      environment: process.env.XPAY_BUILD_ENVIRONMENT || 'INTEG',
      scriptSrc: `https://${dominio}/ecomm/XPayBuild/js?alias=${process.env.XPAY_BUILD_ALIAS}`,
      transactionId,
      timeStamp,
      mac,
      amount,
      currency: 'EUR',
    },
  };
}

async function completaPagamento({ transactionId, xpayNonce, importoEuro }) {
  const amount = Math.round(importoEuro * 100);
  const timeStamp = Date.now();
  const mac = macPagaNonce({ transactionId, amount, currency: 'EUR', xpayNonce, timeStamp });
  const dominio = process.env.XPAY_BUILD_HOST || 'int-ecommerce.nexi.it';

  const risposta = await fetch(`https://${dominio}/ecomm/api/hostedPayments/pagaNonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      apiKey: process.env.XPAY_BUILD_ALIAS,
      codiceTransazione: transactionId,
      importo: amount,
      divisa: 'EUR',
      xpayNonce,
      timeStamp,
      mac,
    }),
  });
  const esito = await risposta.json().catch(() => null);
  return { httpStatus: risposta.status, esito };
}

module.exports = { avviaPagamento, completaPagamento, macAvvioPagamento, macPagaNonce };
```

- [ ] **Step 4: Run per verificare che i test passino**

Run: `npm test -- nexiProvider`
Expected: 4 test PASS

- [ ] **Step 5: `stripeProvider.js` — implementare**

Crea `backend/lib/payments/stripeProvider.js`:

```javascript
// backend/lib/payments/stripeProvider.js — wrapper del Booking Engine
// Diretto attorno a lib/stripeClient.js, con la stessa forma di risposta
// di nexiProvider.avviaPagamento() (external_payment_id + chiaveRisposta +
// datiCliente) cosi' bookingPubblicoController.prenota() non deve sapere
// quale provider e' attivo. chiaveRisposta='client_secret' e datiCliente
// come stringa (non oggetto) per restare compatibile byte-per-byte con la
// risposta che il frontend attuale gia' si aspetta.

const stripe = require('../stripeClient');

async function avviaPagamento({ prenotazioneId, importoEuro }) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(importoEuro * 100),
    currency: 'eur',
    metadata: { prenotazione_id: String(prenotazioneId) },
    description: `Caparra prenotazione #${prenotazioneId} — Hotel del Golfo`,
  });
  return {
    external_payment_id: paymentIntent.id,
    chiaveRisposta: 'client_secret',
    datiCliente: paymentIntent.client_secret,
  };
}

module.exports = { avviaPagamento };
```

- [ ] **Step 6: `index.js` — scrivere il test del selettore**

Crea `backend/lib/payments/index.test.js`:

```javascript
describe('lib/payments — selettore provider', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('default a stripe se PAYMENT_PROVIDER non impostata', () => {
    delete process.env.PAYMENT_PROVIDER;
    const { nomeProviderAttivo } = require('./index');
    expect(nomeProviderAttivo()).toBe('stripe');
  });

  test('usa nexi se PAYMENT_PROVIDER=nexi', () => {
    process.env.PAYMENT_PROVIDER = 'nexi';
    const { nomeProviderAttivo } = require('./index');
    expect(nomeProviderAttivo()).toBe('nexi');
  });

  test('ricade su stripe se PAYMENT_PROVIDER ha un valore non riconosciuto', () => {
    process.env.PAYMENT_PROVIDER = 'paypal';
    const { nomeProviderAttivo } = require('./index');
    expect(nomeProviderAttivo()).toBe('stripe');
  });

  test('providerAttivo() restituisce il modulo nexiProvider quando nexi e attivo', () => {
    process.env.PAYMENT_PROVIDER = 'nexi';
    const { providerAttivo } = require('./index');
    const nexiProvider = require('./nexiProvider');
    expect(providerAttivo()).toBe(nexiProvider);
  });
});
```

- [ ] **Step 7: Run per verificare che fallisca**

Run: `npm test -- payments/index`
Expected: FAIL con "Cannot find module './index'" (o simile)

- [ ] **Step 8: Implementare `index.js`**

Crea `backend/lib/payments/index.js`:

```javascript
// backend/lib/payments/index.js — selettore del provider di pagamento
// attivo per il Booking Engine Diretto. Vedi
// docs/superpowers/specs/2026-09-02-payment-provider-switch-design.md.
// Default 'stripe' se PAYMENT_PROVIDER non e' impostata: comportamento
// invariato per ogni ambiente che non conosce ancora questa variabile
// (produzione oggi non ce l'ha) — MAI un default silenzioso su 'nexi',
// che non ha credenziali di produzione.

const stripeProvider = require('./stripeProvider');
const nexiProvider = require('./nexiProvider');

const PROVIDER_VALIDI = ['stripe', 'nexi'];

function nomeProviderAttivo() {
  const valore = process.env.PAYMENT_PROVIDER || 'stripe';
  if (!PROVIDER_VALIDI.includes(valore)) {
    console.error(`PAYMENT_PROVIDER='${valore}' non riconosciuto, ricado su 'stripe'. Valori validi: ${PROVIDER_VALIDI.join(', ')}.`);
    return 'stripe';
  }
  return valore;
}

function providerAttivo() {
  return nomeProviderAttivo() === 'nexi' ? nexiProvider : stripeProvider;
}

module.exports = { nomeProviderAttivo, providerAttivo };
```

- [ ] **Step 9: Run per verificare che tutti i test del task passino**

Run: `npm test -- lib/payments`
Expected: 8 test PASS (4 nexiProvider + 4 index)

- [ ] **Step 10: Commit**

```bash
git add lib/payments/
git commit -m "feat: aggiunge lib/payments (selettore provider Stripe/Nexi)"
```

---

### Task 4: `confermaPrenotazione` — transizione di stato condivisa

**Files:**
- Create: `backend/lib/prenotazioni/confermaPrenotazione.js`
- Create: `backend/lib/prenotazioni/confermaPrenotazione.test.js`

**Interfaces:**
- Consuma: pool da `config/db.js` (gia' esistente)
- Produce: `confermaPrenotazione({ prenotazioneId, externalPaymentId }) -> Promise<{ esito: 'confermata'|'race'|'scaduta'|'non_trovata'|'gia_gestita', pagamentoId? }>`

- [ ] **Step 1: Scrivere i test (3 casi + 2 edge case), con fixture minime**

Crea `backend/lib/prenotazioni/confermaPrenotazione.test.js`:

```javascript
const pool = require('../../config/db');
const { confermaPrenotazione } = require('./confermaPrenotazione');

// Fixture minima: prenotazioni non richiede soggiorni/camere/ospiti per
// esistere (unico NOT NULL oltre le colonne con default e' canale_origine,
// vedi database/migrations/016_prenotazioni_fase2.sql) — confermaPrenotazione
// tocca solo prenotazioni/pagamenti (e soggiorni, ma un UPDATE senza righe
// corrispondenti non fallisce), quindi il test non ha bisogno di crearne.
async function creaPrenotazioneConHold({ minutiScadenza, statoIniziale = 'opzione' }) {
  const { rows } = await pool.query(
    `INSERT INTO prenotazioni (canale_origine, stato, data_scadenza_opzione)
     VALUES ('sito_diretto', $1, NOW() + make_interval(mins => $2))
     RETURNING id`,
    [statoIniziale, minutiScadenza]
  );
  return rows[0].id;
}

async function creaPagamentoPending(prenotazioneId, externalPaymentId) {
  await pool.query(
    `INSERT INTO pagamenti (prenotazione_id, importo, tipo, stato, external_payment_id)
     VALUES ($1, 10.00, 'caparra', 'pending', $2)`,
    [prenotazioneId, externalPaymentId]
  );
}

describe('confermaPrenotazione', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('conferma normale: opzione non scaduta -> confermata + pagamento completato', async () => {
    const prenotazioneId = await creaPrenotazioneConHold({ minutiScadenza: 15 });
    await creaPagamentoPending(prenotazioneId, 'EXT-1');

    const risultato = await confermaPrenotazione({ prenotazioneId, externalPaymentId: 'EXT-1' });

    expect(risultato.esito).toBe('confermata');
    const p = await pool.query(`SELECT stato FROM prenotazioni WHERE id = $1`, [prenotazioneId]);
    expect(p.rows[0].stato).toBe('confermata');
    const pag = await pool.query(`SELECT stato FROM pagamenti WHERE prenotazione_id = $1`, [prenotazioneId]);
    expect(pag.rows[0].stato).toBe('completato');
  });

  test('hold scaduto ma ancora in stato opzione (cron non ancora passato) -> scaduta, prenotazione interrotta', async () => {
    const prenotazioneId = await creaPrenotazioneConHold({ minutiScadenza: -1 });
    await creaPagamentoPending(prenotazioneId, 'EXT-2');

    const risultato = await confermaPrenotazione({ prenotazioneId, externalPaymentId: 'EXT-2' });

    expect(risultato.esito).toBe('scaduta');
    expect(risultato.pagamentoId).toBeDefined();
    const p = await pool.query(`SELECT stato FROM prenotazioni WHERE id = $1`, [prenotazioneId]);
    expect(p.rows[0].stato).toBe('interrotta');
    const pag = await pool.query(`SELECT stato FROM pagamenti WHERE prenotazione_id = $1`, [prenotazioneId]);
    expect(pag.rows[0].stato).toBe('pending');
  });

  test('race: cron ha gia interrotto la prenotazione prima della conferma -> race, pagamento resta pending', async () => {
    const prenotazioneId = await creaPrenotazioneConHold({ minutiScadenza: 15, statoIniziale: 'interrotta' });
    await creaPagamentoPending(prenotazioneId, 'EXT-3');

    const risultato = await confermaPrenotazione({ prenotazioneId, externalPaymentId: 'EXT-3' });

    expect(risultato.esito).toBe('race');
    expect(risultato.pagamentoId).toBeDefined();
  });

  test('prenotazione inesistente -> non_trovata', async () => {
    const risultato = await confermaPrenotazione({ prenotazioneId: 999999999, externalPaymentId: 'EXT-X' });
    expect(risultato.esito).toBe('non_trovata');
  });

  test('evento duplicato: stato gia non-opzione e nessun pagamento pending corrispondente -> gia_gestita', async () => {
    const prenotazioneId = await creaPrenotazioneConHold({ minutiScadenza: 15, statoIniziale: 'confermata' });
    const risultato = await confermaPrenotazione({ prenotazioneId, externalPaymentId: 'EXT-INESISTENTE' });
    expect(risultato.esito).toBe('gia_gestita');
  });
});
```

- [ ] **Step 2: Run per verificare che fallisca**

Run: `npm test -- confermaPrenotazione`
Expected: FAIL con "Cannot find module './confermaPrenotazione'"

- [ ] **Step 3: Implementare, estraendo la logica da `stripeWebhookController.js` righe 41-116**

Crea `backend/lib/prenotazioni/confermaPrenotazione.js`:

```javascript
// backend/lib/prenotazioni/confermaPrenotazione.js — transizione di stato
// condivisa tra il webhook Stripe (asincrono) e il completamento pagamento
// Nexi (sincrono). Estratta da controllers/stripeWebhookController.js il
// 02/09/2026 — vedi
// docs/superpowers/specs/2026-09-02-payment-provider-switch-design.md.
//
// Gestisce SOLO la transizione di stato in DB (prenotazioni/pagamenti),
// sotto lock FOR UPDATE contro il cron di scadenza hold
// (jobs/scadenzaHoldBookingEngine.js). NON chiama MAI un provider di
// pagamento (ne' Stripe ne' Nexi) e NON decide se/come rimborsare sui casi
// 'race'/'scaduta' — quella e' responsabilita' del chiamante, perche' solo
// lui sa come farlo (Stripe: stripe.refunds.create(); Nexi: oggi nessuna
// integrazione di storno, vedi migration 056).

const pool = require('../../config/db');

async function confermaPrenotazione({ prenotazioneId, externalPaymentId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prenotazione = await client.query(
      `SELECT id, stato, data_scadenza_opzione FROM prenotazioni WHERE id = $1 FOR UPDATE`,
      [prenotazioneId]
    );
    if (!prenotazione.rows.length) {
      await client.query('ROLLBACK');
      return { esito: 'non_trovata' };
    }
    const { stato, data_scadenza_opzione } = prenotazione.rows[0];

    if (stato !== 'opzione') {
      const pagamentoPendente = await client.query(
        `SELECT id FROM pagamenti WHERE prenotazione_id = $1 AND external_payment_id = $2 AND stato = 'pending' FOR UPDATE`,
        [prenotazioneId, externalPaymentId]
      );
      await client.query('COMMIT');
      if (!pagamentoPendente.rows.length) {
        return { esito: 'gia_gestita' };
      }
      return { esito: 'race', pagamentoId: pagamentoPendente.rows[0].id };
    }

    const scaduta = new Date(data_scadenza_opzione) < new Date();
    if (scaduta) {
      await client.query(`UPDATE prenotazioni SET stato = 'interrotta', updated_at = NOW() WHERE id = $1`, [prenotazioneId]);
      await client.query(`UPDATE soggiorni SET cancellato = true WHERE prenotazione_id = $1`, [prenotazioneId]);
      const pagamento = await client.query(
        `SELECT id FROM pagamenti WHERE prenotazione_id = $1 AND external_payment_id = $2`,
        [prenotazioneId, externalPaymentId]
      );
      await client.query('COMMIT');
      return { esito: 'scaduta', pagamentoId: pagamento.rows[0] ? pagamento.rows[0].id : null };
    }

    await client.query(`UPDATE prenotazioni SET stato = 'confermata', updated_at = NOW() WHERE id = $1`, [prenotazioneId]);
    await client.query(
      `UPDATE pagamenti SET stato = 'completato' WHERE prenotazione_id = $1 AND external_payment_id = $2`,
      [prenotazioneId, externalPaymentId]
    );
    await client.query('COMMIT');
    return { esito: 'confermata' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { confermaPrenotazione };
```

- [ ] **Step 4: Run per verificare che i test passino**

Run: `npm test -- confermaPrenotazione`
Expected: 5 test PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prenotazioni/
git commit -m "refactor: estrae confermaPrenotazione da stripeWebhookController"
```

---

### Task 5: `stripeWebhookController.js` usa `confermaPrenotazione`

**Files:**
- Modify: `backend/controllers/stripeWebhookController.js`
- Create: `backend/controllers/stripeWebhookController.test.js`

**Interfaces:**
- Consuma: `confermaPrenotazione` da Task 4

- [ ] **Step 1: Scrivere i test del webhook (firma valida via helper Stripe, nessuna chiamata di rete)**

Crea `backend/controllers/stripeWebhookController.test.js`:

```javascript
const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const stripe = require('../lib/stripeClient');

function costruisciHeaderFirma(payload) {
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
}

function eventoPaymentIntentSucceeded({ prenotazioneId, paymentIntentId }) {
  return JSON.stringify({
    id: 'evt_test',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: paymentIntentId,
        payment_method: null,
        amount: 1000,
        metadata: { prenotazione_id: String(prenotazioneId) },
      },
    },
  });
}

async function creaPrenotazioneConHold(minutiScadenza) {
  const { rows } = await pool.query(
    `INSERT INTO prenotazioni (canale_origine, stato, data_scadenza_opzione)
     VALUES ('sito_diretto', 'opzione', NOW() + make_interval(mins => $1)) RETURNING id`,
    [minutiScadenza]
  );
  return rows[0].id;
}

async function creaPagamentoPending(prenotazioneId, externalPaymentId) {
  await pool.query(
    `INSERT INTO pagamenti (prenotazione_id, importo, tipo, stato, external_payment_id) VALUES ($1, 10.00, 'caparra', 'pending', $2)`,
    [prenotazioneId, externalPaymentId]
  );
}

describe('POST /api/stripe/webhook', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('payment_intent.succeeded su prenotazione valida conferma la prenotazione', async () => {
    const prenotazioneId = await creaPrenotazioneConHold(15);
    await creaPagamentoPending(prenotazioneId, 'pi_ok');
    const payload = eventoPaymentIntentSucceeded({ prenotazioneId, paymentIntentId: 'pi_ok' });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', costruisciHeaderFirma(payload))
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    const p = await pool.query(`SELECT stato FROM prenotazioni WHERE id = $1`, [prenotazioneId]);
    expect(p.rows[0].stato).toBe('confermata');
  });

  test('firma non valida risponde 400 e non tocca il DB', async () => {
    const prenotazioneId = await creaPrenotazioneConHold(15);
    const payload = eventoPaymentIntentSucceeded({ prenotazioneId, paymentIntentId: 'pi_firma_sbagliata' });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'firma_non_valida')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(400);
    const p = await pool.query(`SELECT stato FROM prenotazioni WHERE id = $1`, [prenotazioneId]);
    expect(p.rows[0].stato).toBe('opzione');
  });
});
```

Nota per chi esegue questo task: `POST /api/stripe/webhook` richiede il body RAW (non JSON-parsed) per `stripe.webhooks.constructEvent` — verificare in `routes/stripeWebhook.js` che il middleware `express.raw` sia gia' applicato (il commento in cima a `app.js` righe 81-86 lo conferma) prima di far girare questo test; se Supertest invia il body come stringa con `Content-Type: application/json`, Express con `express.raw({type: 'application/json'})` lo riceve comunque come Buffer — nessuna modifica a `routes/stripeWebhook.js` prevista da questo task.

- [ ] **Step 2: Run come baseline**

Run: `npm test -- stripeWebhookController`
Expected: se la logica esistente (righe 41-116, invariata) e' gia' corretta, questo test potrebbe gia' passare — e' un test di caratterizzazione oltre che di regressione. Procedi comunque al refactor: l'obiettivo del task e' che lo stesso comportamento resti verde DOPO aver sostituito il codice inline con la chiamata a `confermaPrenotazione`.

- [ ] **Step 3: Sostituire la logica inline con la chiamata a `confermaPrenotazione`**

Modifica `backend/controllers/stripeWebhookController.js`. Il blocco che va dalla riga `const client = await pool.connect();` (37) fino a subito prima del recupero dettagli pagamento (riga 118, `let dettagliPagamento;`) diventa:

```javascript
  let risultato;
  try {
    risultato = await confermaPrenotazione({ prenotazioneId, externalPaymentId: paymentIntent.id });
  } catch (err) {
    console.error('webhook stripe error:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }

  if (risultato.esito === 'gia_gestita' || risultato.esito === 'non_trovata') {
    return res.status(200).json({ ricevuto: true });
  }

  if (risultato.esito === 'race' || risultato.esito === 'scaduta') {
    await pool.query(`UPDATE pagamenti SET stato = 'rimborsato' WHERE id = $1`, [risultato.pagamentoId]);
    await stripe.refunds.create({ payment_intent: paymentIntent.id });
    if (risultato.esito === 'race') {
      console.error(
        `[webhook stripe] race cron/scadenza hold: prenotazione ${prenotazioneId} era gia' interrotta quando il pagamento e' arrivato — rimborsato automaticamente, verificare manualmente lo stato della camera.`
      );
    }
    inviaNotificaHoldScaduto(prenotazioneId).catch(err => {
      console.error('invio notifica hold scaduto — errore imprevisto:', err.message);
    });
    return res.status(200).json({ ricevuto: true, rimborsato: true });
  }

  // risultato.esito === 'confermata' da qui in poi — stesso comportamento di prima.
```

Aggiorna anche l'import in cima al file:

```javascript
const pool = require('../config/db');
const stripe = require('../lib/stripeClient');
const { confermaPrenotazione } = require('../lib/prenotazioni/confermaPrenotazione');
const { inviaConfermaPrenotazione, inviaInvitoPreCheckin, inviaNotificaHoldScaduto } = require('../lib/emailPrenotazioni');
```

Il resto del file (dettagli pagamento, invio email, riga 118 in poi) resta invariato — usa ancora `paymentIntent` e `prenotazioneId`, entrambi gia' in scope.

- [ ] **Step 4: Run per verificare che entrambi i test passino**

Run: `npm test -- stripeWebhookController`
Expected: 2 test PASS

- [ ] **Step 5: Commit**

```bash
git add controllers/stripeWebhookController.js controllers/stripeWebhookController.test.js
git commit -m "refactor: stripeWebhookController usa confermaPrenotazione condivisa"
```

---

### Task 6: `bookingPubblicoController.js` — provider-aware

**Files:**
- Modify: `backend/controllers/bookingPubblicoController.js`
- Create: `backend/controllers/bookingPubblicoController.prenota.test.js`

**Interfaces:**
- Consuma: `lib/payments` (`providerAttivo`, `nomeProviderAttivo`) da Task 3
- Produce: `GET /api/booking-pubblico/configurazione` -> `{ percentuale_caparra, provider }`
- Produce: `POST /api/booking-pubblico/prenota` -> risposta invariata su Stripe (`client_secret` in cima), nuovo campo `pagamento_nexi` quando il provider attivo e' Nexi

- [ ] **Step 1: Scrivere i test**

Crea `backend/controllers/bookingPubblicoController.prenota.test.js`. Nota: i test end-to-end di `POST /prenota` con fixture camere/tipi_camera reali sono rimandati al Task 9 (verifica manuale) perche' costruire quelle fixture richiede uno schema che questo piano non ha ancora verificato riga per riga — automatizzarlo qui rischierebbe un test con dati inventati che non riflette i vincoli reali. Questo task copre invece con test mirati il campo `provider` su `/configurazione` e la forma di risposta dei provider, isolati dal resto di `prenota()`.

```javascript
const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

describe('GET /api/booking-pubblico/configurazione — campo provider', () => {
  afterAll(async () => {
    await pool.end();
  });

  const OLD_ENV = process.env;
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  test('provider = stripe di default', async () => {
    delete process.env.PAYMENT_PROVIDER;
    const res = await request(app).get('/api/booking-pubblico/configurazione');
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('stripe');
    expect(res.body).toHaveProperty('percentuale_caparra');
  });

  test('provider = nexi quando PAYMENT_PROVIDER=nexi', async () => {
    process.env.PAYMENT_PROVIDER = 'nexi';
    const res = await request(app).get('/api/booking-pubblico/configurazione');
    expect(res.body.provider).toBe('nexi');
  });
});

describe('contratto di risposta dei provider — chiaveRisposta/datiCliente', () => {
  test('nexiProvider.avviaPagamento produce la forma {external_payment_id, chiaveRisposta, datiCliente}', () => {
    const nexiProvider = require('../lib/payments/nexiProvider');
    process.env.XPAY_BUILD_ALIAS = 'A';
    process.env.XPAY_BUILD_MAC_KEY = 'K';
    const risultato = nexiProvider.avviaPagamento({ prenotazioneId: 1, importoEuro: 10 });
    expect(Object.keys(risultato).sort()).toEqual(['chiaveRisposta', 'datiCliente', 'external_payment_id']);
  });
});
```

- [ ] **Step 2: Run per verificare che i test su `configurazione` falliscano**

Run: `npm test -- bookingPubblicoController.prenota`
Expected: FAIL — `res.body.provider` e' `undefined`

- [ ] **Step 3: Aggiungere `provider` a `configurazione`**

Modifica `backend/controllers/bookingPubblicoController.js`. In cima al file aggiungi (accanto agli altri require):

```javascript
const { providerAttivo, nomeProviderAttivo } = require('../lib/payments');
```

E rimuovi (non serve piu' in questo file):

```javascript
const stripe = require('../lib/stripeClient');
```

La funzione `configurazione` (riga 499-501 originale) diventa:

```javascript
async function configurazione(req, res) {
  res.json({ percentuale_caparra: PERCENTUALE_CAPARRA, provider: nomeProviderAttivo() });
}
```

- [ ] **Step 4: Sostituire la chiamata diretta a Stripe in `prenota()` con il provider attivo**

Nel corpo di `prenota()`, il blocco (righe 417-437 circa):

```javascript
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(importoCaparra * 100),
        currency: 'eur',
        metadata: { prenotazione_id: String(prenotazione.id) },
        description: `Caparra prenotazione #${prenotazione.id} — Hotel del Golfo`,
      });
    } catch (stripeErr) {
      console.error(`prenotazione ${prenotazione.id}: creazione PaymentIntent Stripe fallita, libero la prenotazione:`, stripeErr.message);
      try {
        await client.query(`UPDATE prenotazioni SET stato = 'interrotta', updated_at = NOW() WHERE id = $1`, [prenotazione.id]);
        await client.query(`UPDATE soggiorni SET cancellato = true WHERE prenotazione_id = $1`, [prenotazione.id]);
      } catch (cleanupErr) {
        console.error(`prenotazione ${prenotazione.id}: cleanup dopo fallimento Stripe — errore imprevisto:`, cleanupErr.message);
      }
      return res.status(502).json({ error: 'Impossibile avviare il pagamento in questo momento. Riprova tra qualche istante.' });
    }
```

diventa:

```javascript
    let risultatoPagamento;
    try {
      risultatoPagamento = await providerAttivo().avviaPagamento({
        prenotazioneId: prenotazione.id,
        importoEuro: importoCaparra,
      });
    } catch (pagamentoErr) {
      console.error(`prenotazione ${prenotazione.id}: avvio pagamento (${nomeProviderAttivo()}) fallito, libero la prenotazione:`, pagamentoErr.message);
      try {
        await client.query(`UPDATE prenotazioni SET stato = 'interrotta', updated_at = NOW() WHERE id = $1`, [prenotazione.id]);
        await client.query(`UPDATE soggiorni SET cancellato = true WHERE prenotazione_id = $1`, [prenotazione.id]);
      } catch (cleanupErr) {
        console.error(`prenotazione ${prenotazione.id}: cleanup dopo fallimento avvio pagamento — errore imprevisto:`, cleanupErr.message);
      }
      return res.status(502).json({ error: 'Impossibile avviare il pagamento in questo momento. Riprova tra qualche istante.' });
    }
```

Il blocco che scrive la riga `pagamenti` (righe 439-452 circa):

```javascript
    try {
      await client.query(
        `INSERT INTO pagamenti (prenotazione_id, importo, tipo, stato, external_payment_id)
         VALUES ($1, $2, 'caparra', 'pending', $3)`,
        [prenotazione.id, importoCaparra, paymentIntent.id]
      );
    } catch (dbErr) {
      console.error(`prenotazione ${prenotazione.id}: PaymentIntent ${paymentIntent.id} creato ma riga pagamenti non scritta:`, dbErr.message);
      return res.status(500).json({ error: 'Errore interno' });
    }
```

diventa (aggiunta di `metodo`, valorizzato con il nome del provider):

```javascript
    try {
      await client.query(
        `INSERT INTO pagamenti (prenotazione_id, importo, tipo, stato, external_payment_id, metodo)
         VALUES ($1, $2, 'caparra', 'pending', $3, $4)`,
        [prenotazione.id, importoCaparra, risultatoPagamento.external_payment_id, nomeProviderAttivo()]
      );
    } catch (dbErr) {
      console.error(`prenotazione ${prenotazione.id}: pagamento ${risultatoPagamento.external_payment_id} avviato ma riga pagamenti non scritta:`, dbErr.message);
      return res.status(500).json({ error: 'Errore interno' });
    }
```

E la risposta (righe 454-459 circa):

```javascript
    res.status(201).json({
      prenotazione_id: prenotazione.id,
      importo_caparra: importoCaparra,
      client_secret: paymentIntent.client_secret,
      scadenza_hold: prenotazione.data_scadenza_opzione,
    });
```

diventa:

```javascript
    res.status(201).json({
      prenotazione_id: prenotazione.id,
      importo_caparra: importoCaparra,
      [risultatoPagamento.chiaveRisposta]: risultatoPagamento.datiCliente,
      scadenza_hold: prenotazione.data_scadenza_opzione,
    });
```

(quando il provider attivo e' Stripe, `risultatoPagamento.chiaveRisposta === 'client_secret'` e `datiCliente` e' la stringa del client secret — la risposta JSON e' quindi identica, byte per byte, a quella di oggi. Quando e' Nexi, la risposta guadagna un campo nuovo `pagamento_nexi`, mai visto dal frontend attuale finche' `PAYMENT_PROVIDER` non viene impostata a `'nexi'`.)

- [ ] **Step 5: Run per verificare che tutti i test del task passino**

Run: `npm test -- bookingPubblicoController`
Expected: tutti PASS (incluso lo smoke test del Task 1, che tocca lo stesso endpoint)

- [ ] **Step 6: Commit**

```bash
git add controllers/bookingPubblicoController.js controllers/bookingPubblicoController.prenota.test.js
git commit -m "feat: bookingPubblicoController usa lib/payments, provider-aware"
```

---

### Task 7: Completamento pagamento Nexi (nuova route pubblica)

**Files:**
- Create: `backend/controllers/bookingPagamentoNexiController.js`
- Create: `backend/controllers/bookingPagamentoNexiController.test.js`
- Modify: `backend/routes/bookingPubblico.js`

**Interfaces:**
- Consuma: `confermaPrenotazione` (Task 4), `nexiProvider.completaPagamento` (Task 3), stato `'richiede_rimborso_manuale'` (Task 2)
- Produce: `POST /api/booking-pubblico/completa-pagamento-nexi` — body `{ prenotazione_id, xpay_nonce }`

- [ ] **Step 1: Scrivere i test, mockando `nexiProvider.completaPagamento`**

Crea `backend/controllers/bookingPagamentoNexiController.test.js`:

```javascript
const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const nexiProvider = require('../lib/payments/nexiProvider');

async function creaPrenotazioneConHold(minutiScadenza) {
  const { rows } = await pool.query(
    `INSERT INTO prenotazioni (canale_origine, stato, data_scadenza_opzione)
     VALUES ('sito_diretto', 'opzione', NOW() + make_interval(mins => $1)) RETURNING id`,
    [minutiScadenza]
  );
  return rows[0].id;
}

async function creaPagamentoPending(prenotazioneId, externalPaymentId, importo = 10.0) {
  await pool.query(
    `INSERT INTO pagamenti (prenotazione_id, importo, tipo, stato, external_payment_id, metodo) VALUES ($1, $2, 'caparra', 'pending', $3, 'nexi')`,
    [prenotazioneId, importo, externalPaymentId]
  );
}

describe('POST /api/booking-pubblico/completa-pagamento-nexi', () => {
  afterAll(async () => {
    await pool.end();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('esito OK su prenotazione valida conferma la prenotazione', async () => {
    const prenotazioneId = await creaPrenotazioneConHold(15);
    await creaPagamentoPending(prenotazioneId, 'PR-OK');
    jest.spyOn(nexiProvider, 'completaPagamento').mockResolvedValue({
      httpStatus: 200,
      esito: { esito: 'OK', idOperazione: '123456' },
    });

    const res = await request(app)
      .post('/api/booking-pubblico/completa-pagamento-nexi')
      .send({ prenotazione_id: prenotazioneId, xpay_nonce: 'nonce-test' });

    expect(res.status).toBe(200);
    expect(res.body.confermato).toBe(true);
    const p = await pool.query(`SELECT stato FROM prenotazioni WHERE id = $1`, [prenotazioneId]);
    expect(p.rows[0].stato).toBe('confermata');
  });

  test('esito KO — pagamento rifiutato, prenotazione resta in opzione, pagamento fallito', async () => {
    const prenotazioneId = await creaPrenotazioneConHold(15);
    await creaPagamentoPending(prenotazioneId, 'PR-KO');
    jest.spyOn(nexiProvider, 'completaPagamento').mockResolvedValue({
      httpStatus: 200,
      esito: { esito: 'KO', errore: { codice: 19, messaggio: 'Auth. Denied' } },
    });

    const res = await request(app)
      .post('/api/booking-pubblico/completa-pagamento-nexi')
      .send({ prenotazione_id: prenotazioneId, xpay_nonce: 'nonce-test' });

    expect(res.status).toBe(200);
    expect(res.body.confermato).toBe(false);
    const p = await pool.query(`SELECT stato FROM prenotazioni WHERE id = $1`, [prenotazioneId]);
    expect(p.rows[0].stato).toBe('opzione');
    const pag = await pool.query(`SELECT stato FROM pagamenti WHERE prenotazione_id = $1`, [prenotazioneId]);
    expect(pag.rows[0].stato).toBe('fallito');
  });

  test('esito OK ma hold gia scaduto -> marcato per rimborso manuale, nessuna chiamata di storno automatica', async () => {
    const prenotazioneId = await creaPrenotazioneConHold(-1);
    await creaPagamentoPending(prenotazioneId, 'PR-SCADUTA');
    jest.spyOn(nexiProvider, 'completaPagamento').mockResolvedValue({
      httpStatus: 200,
      esito: { esito: 'OK', idOperazione: '999' },
    });

    const res = await request(app)
      .post('/api/booking-pubblico/completa-pagamento-nexi')
      .send({ prenotazione_id: prenotazioneId, xpay_nonce: 'nonce-test' });

    expect(res.status).toBe(200);
    expect(res.body.confermato).toBe(false);
    expect(res.body.richiede_intervento_manuale).toBe(true);
    const pag = await pool.query(`SELECT stato FROM pagamenti WHERE prenotazione_id = $1`, [prenotazioneId]);
    expect(pag.rows[0].stato).toBe('richiede_rimborso_manuale');
  });

  test('prenotazione_id o xpay_nonce mancanti -> 400', async () => {
    const res = await request(app).post('/api/booking-pubblico/completa-pagamento-nexi').send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run per verificare che fallisca (route non esiste)**

Run: `npm test -- bookingPagamentoNexiController`
Expected: FAIL — 404 invece di 200/400

- [ ] **Step 3: Implementare il controller**

Crea `backend/controllers/bookingPagamentoNexiController.js`:

```javascript
// controllers/bookingPagamentoNexiController.js — completamento del
// pagamento Nexi XPay Build per il Booking Engine Diretto. Route pubblica
// (stesso principio di sicurezza di bookingPubblicoController.js: nessun
// verificaToken, protetta da rate limit + CORS dedicato in
// routes/bookingPubblico.js). Chiamata dal frontend dopo che l'SDK XPay
// Build ha prodotto uno xpayNonce (vedi controllers/xpayTestController.js
// per il precedente verificato in isolamento).

const pool = require('../config/db');
const nexiProvider = require('../lib/payments/nexiProvider');
const { confermaPrenotazione } = require('../lib/prenotazioni/confermaPrenotazione');
const { inviaConfermaPrenotazione, inviaInvitoPreCheckin, inviaNotificaHoldScaduto } = require('../lib/emailPrenotazioni');

async function completaPagamentoNexi(req, res) {
  const { prenotazione_id: prenotazioneId, xpay_nonce: xpayNonce } = req.body || {};
  if (!prenotazioneId || !xpayNonce) {
    return res.status(400).json({ error: 'prenotazione_id e xpay_nonce sono obbligatori.' });
  }

  const pagamento = await pool.query(
    `SELECT id, importo, external_payment_id FROM pagamenti WHERE prenotazione_id = $1 AND metodo = 'nexi' AND stato = 'pending' ORDER BY id DESC LIMIT 1`,
    [prenotazioneId]
  );
  if (!pagamento.rows.length) {
    return res.status(404).json({ error: 'Nessun pagamento Nexi in attesa per questa prenotazione.' });
  }
  const { id: pagamentoId, importo, external_payment_id: transactionId } = pagamento.rows[0];

  let rispostaNexi;
  try {
    rispostaNexi = await nexiProvider.completaPagamento({
      transactionId,
      xpayNonce,
      importoEuro: Number(importo),
    });
  } catch (err) {
    console.error(`completa-pagamento-nexi: chiamata a Nexi fallita per prenotazione ${prenotazioneId}:`, err.message);
    return res.status(502).json({ error: 'Impossibile completare il pagamento in questo momento. Riprova.' });
  }

  const successo = rispostaNexi.esito && rispostaNexi.esito.esito === 'OK';

  if (!successo) {
    await pool.query(`UPDATE pagamenti SET stato = 'fallito' WHERE id = $1`, [pagamentoId]);
    return res.status(200).json({ confermato: false, esito: rispostaNexi.esito });
  }

  const risultato = await confermaPrenotazione({ prenotazioneId, externalPaymentId: transactionId });

  if (risultato.esito === 'confermata') {
    inviaConfermaPrenotazione(prenotazioneId, {}).catch(err => {
      console.error('invio email conferma (booking pubblico, Nexi) — errore imprevisto:', err.message);
    });
    inviaInvitoPreCheckin(prenotazioneId).catch(err => {
      console.error('invio invito pre-checkin (booking pubblico, Nexi) — errore imprevisto:', err.message);
    });
    return res.status(200).json({ confermato: true });
  }

  if (risultato.esito === 'race' || risultato.esito === 'scaduta') {
    await pool.query(`UPDATE pagamenti SET stato = 'richiede_rimborso_manuale' WHERE id = $1`, [pagamentoId]);
    console.error(
      `[completa-pagamento-nexi] prenotazione ${prenotazioneId}: pagamento Nexi ${transactionId} riuscito (importo ${importo} EUR) ma la prenotazione non e' piu' valida (${risultato.esito}) — serve storno manuale da backoffice Nexi.`
    );
    inviaNotificaHoldScaduto(prenotazioneId).catch(err => {
      console.error('invio notifica hold scaduto (Nexi) — errore imprevisto:', err.message);
    });
    return res.status(200).json({ confermato: false, richiede_intervento_manuale: true });
  }

  return res.status(200).json({ confermato: false });
}

module.exports = { completaPagamentoNexi };
```

- [ ] **Step 4: Registrare la route**

Modifica `backend/routes/bookingPubblico.js`. Aggiungi l'import in cima:

```javascript
const ctrlPagamentoNexi = require('../controllers/bookingPagamentoNexiController');
```

E in fondo, prima di `module.exports`:

```javascript
router.post('/completa-pagamento-nexi', ctrlPagamentoNexi.completaPagamentoNexi);
```

(eredita automaticamente CORS e rate limit gia' applicati a tutto il router — nessuna duplicazione necessaria.)

- [ ] **Step 5: Run per verificare che tutti i test passino**

Run: `npm test -- bookingPagamentoNexiController`
Expected: 4 test PASS

- [ ] **Step 6: Commit**

```bash
git add controllers/bookingPagamentoNexiController.js controllers/bookingPagamentoNexiController.test.js routes/bookingPubblico.js
git commit -m "feat: aggiunge completamento pagamento Nexi (booking engine reale)"
```

---

### Task 8: Documentazione env, refactor DRY del percorso di test isolato

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/controllers/xpayTestController.js` (branch `feat/nexi-xpay-build-test`)

**Interfaces:**
- Nessuna nuova — solo documentazione e riduzione duplicazione.

- [ ] **Step 1: Documentare le variabili nuove in `.env.example`**

Aggiungi a `backend/.env.example`, dopo la sezione Stripe esistente:

```
# Switch provider di pagamento (Booking Engine Diretto) — 'stripe' (default
# se assente) o 'nexi'. Vedi
# docs/superpowers/specs/2026-09-02-payment-provider-switch-design.md.
# Cambiare = restart del backend. Le prenotazioni con hold gia' aperto non
# sono toccate: leggono il provider da pagamenti.metodo, non da questa var.
PAYMENT_PROVIDER=stripe

# Nexi XPay Build — terminale XPay Only (Alias + Chiave MAC, NON
# X-Api-Key/xpaysandbox.nexigroup.com, quello e' il prodotto sbagliato).
# XPAY_BUILD_HOST: int-ecommerce.nexi.it in test/integrazione (default se
# assente), il dominio di produzione va confermato da Nexi insieme alle
# credenziali reali — non ancora fornite al 02/09/2026.
XPAY_BUILD_ALIAS=
XPAY_BUILD_MAC_KEY=
XPAY_BUILD_HOST=
XPAY_BUILD_ENVIRONMENT=INTEG
```

- [ ] **Step 2: Riusare le funzioni MAC di `nexiProvider.js` nel percorso di test isolato**

Nel branch `feat/nexi-xpay-build-test`, modifica `backend/controllers/xpayTestController.js`: rimuovi le funzioni locali `sha1`, `macAvvioPagamento`, `macPagaNonce` e le costanti `ALIAS`/`CHIAVE_SEGRETA` dove servono solo per calcolare il MAC, sostituendo con:

```javascript
const { macAvvioPagamento, macPagaNonce } = require('../lib/payments/nexiProvider');
```

Le due funzioni esportate da `nexiProvider.js` leggono `process.env.XPAY_BUILD_ALIAS`/`XPAY_BUILD_MAC_KEY` direttamente (Task 3) — stesso valore che il controller di test gia' usa dallo stesso `.env`, quindi la sostituzione e' meccanica: i punti di chiamata a `macAvvioPagamento({...})`/`macPagaNonce({...})` restano identici, cambia solo l'import. `generaTransactionId`, `DOMINIO_TEST` (usato anche per `scriptSrc`) e la logica specifica della tabella `xpay_build_nonce_test` restano invariati in questo file.

Verifica dopo la modifica: `npm test -- nexiProvider` continua a passare, e un giro manuale di `/xpay-test` (Task 9) conferma che il percorso di test isolato produce ancora un MAC valido accettato da Nexi.

- [ ] **Step 3: Commit**

```bash
git add .env.example controllers/xpayTestController.js
git commit -m "docs+refactor: documenta PAYMENT_PROVIDER/XPAY_BUILD_*, xpayTestController riusa nexiProvider"
```

---

### Task 9: Verifica manuale end-to-end (nessun test automatico possibile)

Questi casi richiedono credenziali reali (Stripe test mode, Nexi sandbox int-ecommerce.nexi.it) e/o passare del tempo reale (scadenza hold) — non sono automatizzabili nei task precedenti senza mock che nasconderebbero proprio quello che va verificato. Da eseguire manualmente da chi ha accesso al backend con `.env` reale configurato, PRIMA di considerare questo lavoro pronto per il deploy:

- [ ] Con `PAYMENT_PROVIDER` non impostata (o `=stripe`): flusso completo `POST /prenota` -> pagamento Stripe (carta di test) -> verifica webhook -> prenotazione `confermata` — stesso comportamento di oggi, nessuna regressione.
- [ ] Con `PAYMENT_PROVIDER=nexi`: `GET /configurazione` risponde `provider: "nexi"`; `POST /prenota` risponde con `pagamento_nexi` (non piu' `client_secret`); usando i dati restituiti per montare l'SDK XPay Build (stesso codice frontend gia' verificato in `/xpay-test`) e completare un pagamento di test, poi chiamare `POST /completa-pagamento-nexi` con l'esito — verifica che la prenotazione risulti `confermata` e `pagamenti.metodo = 'nexi'`.
- [ ] Stesso scenario ma con una carta di test che Nexi rifiuta (esito KO, gia' verificato in questa conversazione con `idOperazione: 206361638`, codice 19 "Auth. Denied") — verifica che la prenotazione resti `opzione` e il pagamento `fallito`, non `richiede_rimborso_manuale`.
- [ ] **Scenario di cutover** (il piu' importante, quello che ha motivato l'intero design): con `PAYMENT_PROVIDER=stripe`, avviare una prenotazione (hold aperto, `pagamenti.metodo='stripe'`) e SENZA completarne il pagamento, cambiare `PAYMENT_PROVIDER=nexi` e riavviare il backend. Verificare che al passare dei 15 minuti il cron di scadenza hold interrompa comunque quella prenotazione normalmente — e se invece si completa il pagamento Stripe (client_secret ottenuto prima del riavvio) dopo il riavvio, il webhook Stripe la confermi correttamente nonostante `PAYMENT_PROVIDER` sia ormai `nexi`.
- [ ] Verificare `.env.example` aggiornato leggibile e coerente con quanto effettivamente richiesto dal codice.

---

## Nota di scope — frontend escluso da questo piano

Questo piano copre solo `gestionale-hotel` (backend). Il frontend (`sito-hotel`, Next.js) deve ancora essere aggiornato per: leggere il campo `provider` da `GET /api/booking-pubblico/configurazione` e montare Stripe Elements o il form XPay Build di conseguenza; gestire la nuova forma di risposta di `POST /prenota` (`pagamento_nexi` invece di `client_secret` quando Nexi e' attivo); chiamare `POST /completa-pagamento-nexi` dopo aver ricevuto lo xpayNonce dall'SDK. Questo e' deliberatamente un piano/spec separato — sito-hotel e' un repository indipendente con un proprio ciclo di deploy (Vercel), e finche' `PAYMENT_PROVIDER` resta `stripe` (default) il frontend attuale continua a funzionare invariato.
