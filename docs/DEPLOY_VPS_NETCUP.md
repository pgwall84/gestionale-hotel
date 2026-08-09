# Deploy VPS netcup — Modulo 1.10

> Guida operativa per intervenire sul server di produzione senza bisogno
> di ripercorrere l'intera sessione di deploy. Scritta il 09/08/2026 a
> fine deploy funzionante — contiene solo la sequenza corretta, non i
> tentativi falliti lungo il percorso.

---

## 1. Dati del server

- Provider: **netcup**, piano VPS Lite 1 G12s (2vCore/4GB/80GB), Norimberga
- IP: `185.163.119.223`
- Dominio: `hdgolfo-gestionale.com` (Cloudflare, DNS-only — nuvoletta
  **grigia**, mai proxata, altrimenti si rompe SSE cucina/sala)
- Sistema operativo: **Debian 13 (trixie)**, immagine di default netcup
  (non Ubuntu — non era selezionabile in fase d'ordine)
- Accesso: **solo chiave SSH**, login a password disabilitato
  (`PasswordAuthentication no` in `/etc/ssh/sshd_config`)
- Portali netcup: **CCP** (`customercontrolpanel.de`, fatturazione/ordini)
  e **SCP** (`servercontrolpanel.de`, gestione tecnica) sono due sistemi
  separati con login separati — non cercare "Server" dentro CCP

```
ssh root@185.163.119.223
```

Chiave privata sul PC di Marco: `$env:USERPROFILE\.ssh\id_ed25519`

---

## 2. Stack installato

| Componente | Versione | Note |
|---|---|---|
| Node.js | 24.x LTS | via NodeSource (`setup_24.x`) |
| PostgreSQL | 17.10 | già nei repo Debian 13 di default, nessun repo esterno |
| Nginx | 1.26.3 | reverse proxy, vedi §5 |
| PM2 | 7.0.3 | globale via `npm install -g pm2` |
| git | — | non incluso nell'immagine base, installato a parte |

Firewall: `ufw`, solo porte `22/80/443` aperte (`ufw status` per verificare).

---

## 3. Database

- Nome database: `gestionale_hotel`
- Utente applicativo: `gestionale_app` (proprietario del database — non
  usa l'utente di sistema `postgres`)
- Connessione TCP locale (`localhost:5432`), password in
  `backend/.env` (`DB_PASSWORD`)

**Nota tecnica**: gli oggetti creati da estensioni PostgreSQL (es.
`btree_gist`, usata dal modulo Prenotazioni) non si possono riassegnare
con `REASSIGN OWNED` — per questo `gestionale_app` non è proprietario di
tutte le tabelle, ma ha `GRANT ALL PRIVILEGES` su tabelle e sequenze dello
schema `public`. Sufficiente per il funzionamento dell'app (CRUD); le
migration future vanno applicate come utente `postgres` (vedi §7).

**Origine dello schema**: le 30 migration in `database/migrations/` **non
ricostruiscono da sole un database vuoto** — mancano alcune CREATE TABLE
iniziali (es. `ztl_prenotazioni`) e l'ordine alfabetico dei file (`005b`
prima di `005`) non è quello di esecuzione corretto. Lo schema di
produzione è stato importato con un **dump completo del database locale
di sviluppo** (`pg_dump` → `scp` → `psql -f`), non rieseguendo le
migration da zero. Tenerne conto per il prossimo deploy (es. server di
staging): usare lo stesso metodo, non fidarsi delle migration da sole.

Comandi utili (da root):
```
su - postgres
psql -d gestionale_hotel          # apre una sessione psql
\q                                  # esce da psql
exit                                 # torna a root
```

---

## 4. Codice e variabili d'ambiente

- Repository: `git@github.com:pgwall84/gestionale-hotel.git` (privato)
- Percorso sul server: `/var/www/gestionale-hotel`
- Autenticazione git: **deploy key dedicata**, sola lettura, generata sul
  server (`/root/.ssh/deploy_gestionale`) e aggiunta su GitHub in
  Settings → Deploy keys del repo — non usa le credenziali personali di
  Marco
- Config SSH per usare quella chiave: `/root/.ssh/config`

`.env` di produzione: `/var/www/gestionale-hotel/backend/.env` — stessa
struttura di quello locale (`DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`,
`JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT=7001`, `NODE_ENV=production`,
`RESEND_API_KEY`, `RESEND_MITTENTE`), con `DB_USER`/`DB_PASSWORD` diversi
(quelli di `gestionale_app`, non quelli locali). `ANTHROPIC_API_KEY` non
serve in produzione (usata solo dallo script di generazione test).

**`FRONTEND_URL` aggiunta durante l'audit di sicurezza (09/08/2026)** —
mancava, e serve a due cose: restringere il CORS in produzione
(`backend/app.js`) e generare correttamente i link del pre-checkin inviati
via email agli ospiti (`backend/lib/preCheckin.js`, altrimenti ricade su
`http://localhost:7000`, inutilizzabile per un ospite reale). Valore
impostato: `FRONTEND_URL=https://hdgolfo-gestionale.com`.

**Bug reale trovato allo stesso primo test di login (09/08/2026)**:
`frontend/lib/api.js` calcolava l'URL del backend come
`${protocol}//${hostname}:7001/api` — chiamava **direttamente la porta
7001**, che in produzione non è aperta nel firewall (`ufw` permette solo
22/80/443) e non ha certificato SSL (solo Nginx sulla 443 ce l'ha). Questo
pattern era corretto per l'uso in LAN (frontend e backend come due
processi separati raggiungibili su porte diverse, nessun reverse proxy
davanti), ma sbagliato dietro Nginx. **Fix**: `getApiUrl()` ora usa
`process.env.NODE_ENV === 'production'` per distinguere i due casi — in
produzione usa `${protocol}//${hostname}/api` (percorso relativo alla
stessa origine, Nginx instrada `/api` al backend internamente), in
sviluppo resta invariato con la porta 7001 esplicita. Applicato prima
come hotfix diretto sul server (`nano` + `npm run build` + `pm2 restart`)
per ripristinare subito il login, poi corretto anche nel sorgente locale
— **da verificare che il commit sia stato fatto dal tab Code**, altrimenti
un futuro `git pull` sul server rischia di sovrascrivere l'hotfix con la
versione vecchia.

**Nota (non urgente)**: `CLAUDE.md` §7 documenta `DATABASE_URL`,
`JWT_REFRESH_SECRET` ed `ENCRYPTION_KEY` come variabili richieste, ma il
codice reale usa campi `DB_*` separati e non ha `JWT_REFRESH_SECRET` né
`ENCRYPTION_KEY` da nessuna parte. Quella sezione del documento non è mai
stata allineata al codice — da chiarire in una sessione dedicata, non
blocca il funzionamento di oggi.

**npm e script di installazione**: npm 11 blocca di default gli script di
installazione dei pacchetti nativi. Dopo `npm install`, se compare
`npm warn allow-scripts`, lanciare:
```
npm approve-scripts --allow-scripts-pending
```
Necessario per **bcrypt** (backend — senza, il login smette di
funzionare) e **sharp** (frontend — senza, si rompe l'ottimizzazione
immagini di Next.js).

---

## 5. Nginx

File: `/etc/nginx/sites-available/gestionale` (symlink in `sites-enabled`)

Tre `location`:
- `~ ^/api/ristorante/(cucina|sala)/stream` → backend, **senza buffering**
  (`proxy_buffering off`, `proxy_read_timeout 24h`) — monitor cucina/sala,
  SSE
- `/api/` → backend (porta 7001)
- `/` → frontend Next.js (porta 7000)

**Attenzione se si tocca questo file in futuro**: gli endpoint SSE reali
sono `/api/ristorante/cucina/stream` e `/api/ristorante/sala/stream`
(prefisso `ristorante`, non un terzo endpoint separato) — un kit di deploy
preparato in una sessione precedente aveva il regex sbagliato
(`/api/(sala|cucina|ristorante)/sse`), corretto in questa sessione dopo
verifica diretta sul codice (`backend/controllers/comandeController.js`).

**Bug reale trovato al primo vero test di login (09/08/2026), non prima
perché fino a quel momento era stata verificata solo la home page**: il
blocco `location /api/` aveva `proxy_pass http://127.0.0.1:7001/;` **con
la barra finale** — con quella barra Nginx toglie il prefisso `/api/`
prima di inoltrare al backend, ma Express si aspetta di riceverlo intero
(le route sono montate come `/api/auth`, `/api/ospiti`, ecc. in
`backend/app.js`). Risultato: ogni chiamata API tornava 404, incluso il
login. Il blocco SSE non aveva questo problema perché il suo `proxy_pass`
non aveva mai avuto la barra finale. **Fix**: tolta la barra finale anche
dal blocco `/api/` — `proxy_pass http://127.0.0.1:7001;` (senza barra),
così Nginx passa il percorso originale invariato. Il blocco frontend
(`location /`) non ha lo stesso problema: lì il prefisso è `/` e
toglierlo/riaggiungerlo si annulla a vicenda, nessun effetto pratico.

Sito di default Debian rimosso (`sites-enabled/default`) per evitare
conflitti.

---

## 6. HTTPS

Certificato **Let's Encrypt via certbot**, rinnovo automatico già
configurato da certbot stesso (systemd timer, nessuna azione manuale
richiesta). Scadenza certificato attuale: **07/11/2026** (si rinnova da
solo prima).

```
certbot --nginx -d hdgolfo-gestionale.com
```

Verificare rinnovo automatico ogni tanto con:
```
certbot renew --dry-run
```

---

## 7. PM2 (avvio app)

File: `/var/www/gestionale-hotel/ecosystem.config.js` (copiato da
`files-deploy-vps/`, percorsi già corretti — verificati contro il codice
reale, nessuna modifica necessaria).

Due processi: `gestionale-backend` (porta 7001, `backend/server.js`),
`gestionale-frontend` (porta 7000, `next start`).

Comandi utili:
```
pm2 status                    # stato dei due processi
pm2 logs                      # log in tempo reale
pm2 logs --lines 30 --nostream   # ultime righe senza restare in coda
pm2 restart gestionale-backend
pm2 restart gestionale-frontend
pm2 restart all
```

Persistenza al riavvio del server già configurata (`pm2 save` +
`pm2 startup`, systemd service `pm2-root` abilitato).

---

## 8. Come aggiornare l'app (deploy di una nuova versione)

Non ancora testato in questa sessione (primo deploy, nessun aggiornamento
successivo ancora fatto) — sequenza prevista, da verificare al primo
utilizzo reale:

```
cd /var/www/gestionale-hotel
git pull
cd backend && npm install --omit=dev
cd ../frontend && npm install && npm run build
pm2 restart all
```

Se la nuova versione include una migration nuova, applicarla a mano
**prima** del `pm2 restart` (come utente `postgres`, vedi §3):
```
su - postgres
psql -d gestionale_hotel -f /var/www/gestionale-hotel/database/migrations/0XX_nome.sql
exit
```

---

## 9. Backup

Script: `/root/scripts/backup-db.sh` — dump compresso (`pg_dump | gzip`)
in `/root/backups/`, cron ogni notte alle 3:00, mantiene 14 giorni di
storico locale.

```
crontab -l                          # verifica che sia programmato
cat /root/scripts/backup.log        # log delle esecuzioni
ls -la /root/backups                # dump disponibili
```

**Limite noto, non ancora risolto**: il backup è **solo locale, sullo
stesso server** — non protegge da un guasto del disco o un problema con
l'account netcup. Il kit di deploy originale prevedeva upload automatico
su Backblaze B2 (`rclone`), ma l'account B2 non è ancora stato creato.
Quando sarà pronto: creare bucket privato, installare `rclone`,
configurarlo (`rclone config`), poi aggiungere `rclone copy` in fondo allo
script — la struttura del kit originale (`files-deploy-vps/backup-db.sh`
nel repo) ha già la sequenza di comandi pronta, va solo attivata.

**Ripristino da un backup** (non ancora testato praticamente — da fare
come primo esercizio quando possibile, come già discusso col titolare):
```
gunzip -c /root/backups/gestionale_TIMESTAMP.sql.gz | su - postgres -c "psql -d gestionale_hotel"
```

---

## 10. Cosa resta da fare (non incluso in questa sessione)

**Audit di sicurezza pre-produzione: fatto (09/08/2026), riepilogo:**
- `npm audit` backend: risolte con `npm audit fix` (non-breaking)
  `body-parser`, `brace-expansion`, `ip-address`. Rimaste come rischio
  accettato: catena `tar`/`@mapbox/node-pre-gyp`/`bcrypt` (solo in fase di
  build, mai eseguita a runtime), `uuid`/`node-cron` (severità moderata,
  non raggiungibile da input esterno), `xlsx`/SheetJS (nessuna correzione
  disponibile dai manutentori — usata per importare file Excel reali in
  `ztlController.js`, endpoint protetto da `soloTitolare`; valutare in
  futuro la migrazione a `exceljs`, non presente tra le dipendenze
  nonostante quanto scritto in `CLAUDE.md` §2).
- `npm audit` frontend: Next.js 16.2.9 ha CVE note (SSRF nei rewrite,
  disclosure di Server Function interne) — fix richiede l'upgrade a
  `next@16.3.0`, da testare in locale prima di portarlo in produzione
  (non fatto in questa sessione, non bloccante per il go-live).
- SQLi: nessuna query non parametrizzata su tutti i 38 controller
  (verificati anche i 17 aggiunti dopo l'audit del 15/07).
- XSS: zero `dangerouslySetInnerHTML`/`innerHTML`/`eval` nel frontend.
- IDOR/autorizzazione: tutte le nuove route hanno `verificaToken` +
  controllo ruolo coerente. Route pubbliche pre-checkin (`/pre-checkin-
  pubblico/:token`) verificate a fondo: token da 256 bit salvato solo come
  hash, rate limit dedicato, validazione ownership per ogni ospite
  inserito.
- Secret hardcoded / log di dati sensibili: nessuno trovato.
- **Corretto**: `FRONTEND_URL` mancante nel `.env` di produzione (vedi §4)
  — impattava sia CORS sia i link email del pre-checkin.

**Non completato, non bloccante**:
- Upgrade Next.js a 16.3.0 (vedi sopra)
- Valutare migrazione da `xlsx` a `exceljs` per l'import ZTL
- Test di ripristino reale di un backup (§9)
- Account Backblaze B2 per backup offsite (§9)
- Chiarire il disallineamento `CLAUDE.md` §7 sulle variabili d'ambiente
  (§4 sopra)
- Rivalutare migrazione a Aruba Cloud tra ~6 mesi (bloccato da un account
  Aruba esistente e non identificato sulla P.IVA dell'hotel — vedi
  `docs/PIANO_MIGRAZIONE_DICEMBRE_2026.md`, Fase 1)
