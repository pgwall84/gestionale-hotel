# Domande aperte da girare subito — 07/08/2026

Riepilogo di tutte le domande/decisioni emerse in questa sessione, per
destinatario, così da girarle il prima possibile. Le prime tre sezioni
(titolare, WuBook, LivelloUno) sono le più urgenti — sono il collo di
bottiglia reale del piano di migrazione (`docs/PIANO_MIGRAZIONE_DICEMBRE_2026.md`,
Fase 0): nessuna velocità di sviluppo compensa una risposta che arriva
tardi qui.

---

## 1. Titolare — decisioni che solo lui può prendere

- [ ] **Confermare l'ordine del piano**: 1.10 Deploy VPS diventa il primo
  step di sviluppo (non l'ultimo come deciso il 01/08) — necessario perché
  WuBook funziona via webhook, serve un gestionale raggiungibile da
  internet. Va bene procedere così?
- [ ] **Sottoscrivere WuBook** (channel manager + booking engine) — è
  l'azione più vecchia in sospeso del progetto, va avviata per prima tra
  tutte.
- [ ] **Recuperare il numero reale di scontrini/anno del ristorante** dai
  report Hugin/corrispettivi già trasmessi — serve per il preventivo
  A-Cube vero (non una stima).
- [ ] **Sbloccare l'accesso alla mail aziendale** — ferma insieme dominio,
  GA4 e Iubenda.
- [ ] Verificare con certezza (5 minuti nell'admin center) se il piano
  Microsoft 365 è **Business** (Basic/Standard/Premium) o
  **Personal/Family** — cambia se la mailbox su dominio proprio è già
  inclusa o va aggiunto un piano Business (~5-6€/utente/mese).
- [ ] Decidere se richiedere anche le credenziali a Regione Liguria per
  ROSS1000 Fase 2 (non blocca lo switch-off da TeamSystem, priorità bassa
  — solo se si vuole chiudere anche quel modulo entro fine lavori).
- [ ] Inviare la mail a LivelloUno (bozza pronta:
  `sito-hotel/docs/RICHIESTA_TRASFERIMENTO_DOMINIO.md`).

---

## 2. WuBook — da contattare appena il titolare conferma il punto 1

**Aggiornamento 10/08/2026 — verificato sul sito WuBook**: la homepage
prezzi (en.wubook.net/prices) oggi dice solo "contattaci", ma i prezzi
pubblici esistono ancora sulla pagina specifica **WooDoo**
(en.wubook.net/page/Partner-34.html): 7€/mese per canale fino a 3 canali
(6€ per il 4°-5°, 5€ dal 6° in su), Booking Engine 27€/mese, Metasearch
(Google) 8€/mese + 10% di commissione Google per prenotazione. Le vecchie
cifre ~21€+27€ in `docs/EVOLUTIVE.md` erano quindi corrette (21€ = 3
canali × 7€), solo non più sulla pagina principale.

**Punto importante da non sbagliare in fase di contatto**: WuBook ha due
prodotti distinti — **Zak** (il loro gestionale completo, sostituirebbe
il nostro PMS proprietario — NON è quello che vogliamo) e **WooDoo**
(livello di integrazione via API Channel Manager + Booking Engine, pensato
apposta per chi ha già un PMS proprio, come noi). Un commerciale potrebbe
proporre Zak perché più semplice da vendere — va specificato subito che
vogliamo WooDoo, integrazione via API sul gestionale esistente.

Bozza email pronta per il contatto: `docs/RICHIESTA_WUBOOK.md` (in questo
repo) — da inviare tramite il form ufficiale
en.wubook.net/page/WooDoo-Partner-Form-31.html.

- Attivazione abbonamento channel manager + booking engine — chiedere
  comunque un preventivo scritto e aggiornato (i prezzi pubblici sono un
  punto di partenza, non detto siano quelli finali per noi).
- Tempi di attivazione account e di setup tecnico (documentazione webhook,
  credenziali API) — serve per pianificare la Fase 3 del piano di
  migrazione.
- Chiedere esplicitamente se il collegamento webhook richiede già in fase
  di sottoscrizione un dominio/endpoint pubblico attivo, o se si può
  configurare in un secondo momento (rilevante per la sequenza col deploy
  VPS — ora risolto, il gestionale è già in produzione su
  `hdgolfo-gestionale.com`, quindi questo blocco è comunque superato).

---

## 3. LivelloUno — mail già pronta, riepilogo dei punti

(Testo completo in `sito-hotel/docs/RICHIESTA_TRASFERIMENTO_DOMINIO.md`)

- Chi è il Registrant di hoteldelgolfolerici.com e hoteldelgolfo.com?
- Rimozione dei blocchi clientTransferProhibited/clientUpdateProhibited
- Codici EPP/Auth di entrambi i domini per il trasferimento
- Tempi previsti e modalità di coordinamento per non interrompere sito ed
  email attivi durante il passaggio

---

## 4. Commercialista

- **A-Cube per gli scontrini è una strada percorribile per voi** (server
  RT via software, senza registratore fisico — normativa in vigore dal
  01/01/2026, servizio disponibile da marzo 2026)? È molto recente, vale
  la pena una conferma prima di spegnere Hugin.
- **Fatture in Cloud per le fatture B2B**: confermato che non si sovrappone
  ad A-Cube (Fatture in Cloud non gestisce la certificazione/trasmissione
  dei corrispettivi, solo l'importazione contabile — sono due funzioni
  diverse, non serve scegliere tra i due). La domanda reale per il
  commercialista è solo: il piano attuale da 500€/anno resta adeguato dopo
  la migrazione, o va rivisto il volume/piano?
- Il commercialista ha già un flusso automatico di import da Fatture in
  Cloud? Utile saperlo prima di cambiare qualunque cosa lì.
- **Nuovo (09/08/2026) — account Aruba sconosciuto**: provando a registrare
  un account Aruba Cloud, risulta che la P.IVA dell'hotel è già associata a
  un servizio Aruba esistente, con email di contatto mascherata tipo
  `c******@li*e*o.it` (verosimilmente @libero.it), non riconosciuta dal
  titolare. È il commercialista (o il suo studio) ad aver aperto PEC o
  fatturazione elettronica su Aruba per l'hotel? Se sì, chi ha accesso oggi
  a quell'account/email? Non tentare recuperi password prima di saperlo.

---

## 5. A-Cube (sales@a-cube.io)

- Preventivo per corrispettivi elettronici (scontrini ristorante + camera),
  con questi volumi indicativi:
  - Camere: 20 camere piene ~5 mesi/anno → 3.000 camere-notte, tra 430 e
    750 chiusure/anno a seconda della durata media del soggiorno
  - Ristorante: **da sostituire con il numero reale** recuperato dai
    report Hugin (punto 1 sopra) — non usare una stima
- Chiedere se il preventivo copre anche l'eventuale fatturazione
  elettronica B2B, per avere un termine di paragone con Fatture in Cloud
  anche se probabilmente non serve (vedi punto 4)

---

## 6. Regione Liguria — Ufficio Turismo (solo se si procede con ROSS1000 Fase 2)

- Richiesta credenziali HTTP Basic per il webservice
  `turismows.regione.liguria.it/ws/checkinV2` — non urgente, non blocca lo
  switch-off da TeamSystem.
