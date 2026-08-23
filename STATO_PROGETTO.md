# STATO_PROGETTO.md — Hotel del Golfo — Gestionale

> Fotografia dello stato attuale, NON cronaca. Il "come/perché" di ogni
> riga è in `docs/DIARIO_SESSIONI.md` (cercare per data) o
> `docs/EVOLUTIVE.md` (backlog/gap aperti — dettaglio tecnico ricco, non
> materiale da sfoltire, vedi nota in fondo). CLAUDE.md §16 rimanda qui:
> leggere entrambi a inizio sessione.
>
> Aggiornato a ogni sessione. Se supera ~200 righe, le voci più vecchie
> migrano nel diario come puntatore di una riga (regola in CLAUDE.md §15).

## Fase 1 — Operatività interna

CHIUSA (09/08/2026). Deploy VPS in produzione: HTTPS su
`hdgolfo-gestionale.com` (netcup VPS Lite 1 G12s), audit di sicurezza
pre-produzione incluso. Guida server: `docs/DEPLOY_VPS_NETCUP.md`.

## Fase 2A — Prenotazioni e OTA

| Modulo | Stato reale | Dettaglio |
|---|---|---|
| 2.1 Anagrafica ospiti / CRM | ✅ Fatto, esteso 14-15/08 con VIP/blacklist/tag/dedup | diario 01/08, 14-15/08 |
| 2.2 Planning + Tariffe/stagionalità | ✅ Fatto e verificato (74 test, 31/07) | diario 31/07 |
| 2.3 Channel manager (OTA) | Fase 1 (mappatura camere↔canale, `tipi_camera_canali`) ✅, resta valida a prescindere dal fornitore. **Fornitore cambiato 19/08/2026**: WuBook/WooDoo scartato (**verificato direttamente con WuBook**, non solo dedotto — accettano solo fornitori certificati multi-cliente), stessa risposta da RoomCloud, Octorate escluso (richiede comprare il loro gestionale in bundle, ~160€/mese) — **Beds24 scelto al suo posto, spec non ancora scritta** | EVOLUTIVE.md correzione 19/08; `sito-hotel/SPEC_SITO_HOTEL.md` §10 (fonte più aggiornata) |
| 2.4 Tassa di soggiorno | ✅ Fatto (01/08). Formato export Comune di Lerici ancora sconosciuto — export Excel generico nel frattempo | diario 01/08 |
| 2.5 Alloggiati Web (SOAP) | ⚠️ **Più avanti di quanto dica CLAUDE.md §8**: Fase 1b ✅, **Fase 2 (schedina+invio reale) già costruita e in uso controllato** dal 13/08 — Test validato contro il servizio vero (1/1), invio reale dietro interruttore `ALLOGGIATI_JOB_ATTIVO` spento di default, coda manuale funzionante. 4 gap noti (D/A/B/C) chiusi 13-14/08, **non ancora verificati da Marco contro Postgres reale** | EVOLUTIVE.md "Fase 2, stato 13/08/2026"; diario 13-14/08 |
| 2.6 ROSS1000/ISTAT | ⚠️ **Bloccato su un dubbio irrisolto, diverso da CLAUDE.md §8**: scoperto 13/08 un conflitto — il codice punta a un webservice SOAP (ROSS1000/Turismo5 nazionale) ma la documentazione ufficiale Liguria descrive RIMOVCLI, upload manuale su portale con software certificato preventivamente. Non è "in attesa di credenziali HTTP Basic" — è in attesa di risposta da Regione Liguria su quale canale sia quello giusto. Mail pronta ma **mai inviata** (Marco deve completare nome/telefono/email). **Non toccare `ross1000Xml.js`/`ross1000Controller.js` prima della risposta** | EVOLUTIVE.md "RIMOVCLI vs ROSS1000" |

## Fase 2B — Fiscale e pagamenti

Non iniziata. 3.1 (A-Cube), 3.2 (fatturazione B2B), 3.3 (pagamenti
Nexi/Stripe via WuBook) — dipendono in parte da 2.3.

## Fase 2C — Canale diretto

| Modulo | Stato reale | Dettaglio |
|---|---|---|
| 4.1 Booking engine | 🔶 Costruito come "Booking Engine Diretto v2" su `sito-hotel` (19-20/08, caparra 30% Stripe) — CLAUDE.md §8 non lo segna ancora. Aperto: suite `bookingPubblico.test.js` scritta ma mai eseguita, range min/max tariffe e sconto bambini 3-11 (oggi 0%) da popolare, verifica end-to-end `/prenota` non fatta | diario 19-20/08 |
| 4.2 Welcome Book | ✅ Fatto, in produzione su Vercel (dominio provvisorio) | diario 02/08 |

## Fase 2D — Esperienza ospite

✅ Tutto fatto: 5.1 check-in/out + housekeeping (03/08), 5.2 pre check-in
OCR+self-service entrambe le fasi (04-05/08), 5.3 email automatiche +
testi editabili + Offerte (04/08).

## Verifiche pendenti (scritto/costruito, non ancora confermato)

- Prenotazioni di gruppo (15/08): solo `tsc`/`node -c` — wizard gruppo +
  pagamento gruppo/camera mai visti in UI da Marco.
- Booking Engine Diretto v2 (19-20/08): vedi riga 4.1 sopra. Manca anche
  un **mini-audit di sicurezza mirato pre-go-live** (rate limit, firma
  webhook, scope PCI) — dichiarato esplicitamente FUORI da quel piano,
  da programmare a parte prima di sostituire il widget TS con il bottone
  reale (CLAUDE.md §7).
- Alloggiati Web Fase 2 (13/08): vedi riga 2.5 sopra. Sincronizzazione
  SOAP reale (`GenerateToken`/`Test`/`Send`) mai testata con credenziali
  vere, solo simulata nei test.
- Le due modalità ZTL (Import TS vs "Sincronizza da Planning", 15/08):
  mai verificate in UI dopo il refactor.
- **Intero modulo HACCP 6.1 (A.1-A.8)**: verificato solo via API/test
  automatici in 4 sessioni (16/08) — mai visto in UI da Marco. Soglie
  alert checklist (15:00 ambra, 22:00 rossa) sono un'ipotesi non
  confermata dall'uso reale.
- Calendario occupazione 30gg in Dashboard: aggregazione solo lato
  frontend, nessun test HTTP dedicato (nessuna infrastruttura di test
  frontend nel progetto).
- ✅ **Code review 22/08 Tier 2/3 — CONFERMATO PIENAMENTE (23/08)**:
  commit `5892dd9` su `main`, suite completa **34/34 suite, 952/952 test
  verdi** (include `camere.test.js`, chiude il dubbio lasciato aperto
  poco sopra nello stesso giorno). Un bug reale trovato durante
  l'esecuzione (nel test, non nel codice applicativo): l'`afterAll` del
  describe `'Trattamento + tipo camera venduto in griglia/dettaglio'`
  (`tests/api/prenotazioni.test.js`) cancellava `tipi_camera` prima che
  l'`afterAll` esterno del file cancellasse la prenotazione/soggiorno che
  lo referenzia ancora via `tipo_camera_venduto_id` — ordine di pulizia
  sbagliato, introdotto insieme al nuovo test. Fix: azzerare il
  riferimento prima della DELETE. `sito-hotel`: nessuna suite in questo
  repo, commit `a08e842` su `master`. **Nota non verificata**: il conteggio
  suite è salito da 33 (audit 22/08) a 34 — nessuna nuova suite segnalata
  esplicitamente in questa sessione, probabilmente solo un ricalcolo
  corretto, non un problema.

## Decisioni in sospeso da Marco (nessun blocco tecnico, solo sua scelta)

- Food cost teorico per piatto: chi inserisce le grammature ricetta per
  ricetta (chef? altro?) — analisi tecnica già pronta, solo la decisione
  manca (`docs/EVOLUTIVE.md`, punto 6 "Fase 3").
- Tariffe per canale/camera: la richiesta originale non è mai stata
  chiarita del tutto — prezzo differenziato per canale OTA, per singola
  camera fisica, o solo leggibilità UI di `/tariffe`? Nessun piano
  possibile finché non si scioglie il dubbio.
- Ristorante — conti aperti: manca un punto centrale per vedere il totale
  di tutti i tavoli insieme, ma Marco ha detto di non essersi spiegato
  bene — prossimo passo è una conversazione dedicata, non una proposta al buio.
- Bottone "Addebiti extra" in planning-camere: segnalato "scomodo" senza
  specificare cosa cambiare.
- Sensori HACCP (hardware): nessuna scelta tra le opzioni valutate (Hanna
  HI144 senza abbonamento vs. HaccpOK/Digitron/Testo Saveris/Selin
  Milano con abbonamento — attenzione al vincolo 24 mesi di HaccpOK).
- Moduli HACCP A.4 (buffet) e A.6 (manutenzioni): costruiti "in forse",
  in attesa che Marco li confronti col piano HACCP reale dell'hotel.

## Bloccato su terzi (mail inviate o da inviare, in attesa di risposta)

- 2.3: nessuna sottoscrizione WuBook da fare più — resta da scrivere la
  spec Beds24, nessuna mail ancora inviata a Beds24.
- 2.5 Fase 2: Marco deve compilare le credenziali reali in `.env` e
  testare "Sincronizza ora" in locale — già in suo possesso.
- 2.6: risposta di Regione Liguria su RIMOVCLI — mail pronta in
  `docs/mail preventivi/mail_statistiche_liguria.md`, **mai inviata**
  (manca nome/telefono/email di Marco).
- A-Cube (corrispettivi, sostituisce Hugin RT-K50): mail pronta in
  `docs/mail preventivi/mail_acube_preventivo.md`, **mai inviata**,
  stesso blocco (dati di contatto mancanti).
- LivelloUno (trasferimento dominio `hoteldelgolfolerici.com`): mail
  inviata, in attesa di risposta — blocca anche DNS sito, GA4, Iubenda.
- Nexi: nessuna commissione pubblicata, da contattare per iscritto prima
  di confrontare i costi con Stripe — non ancora contattato.
- Commercialista: 5 domande aperte (A-Cube sostitutivo Hugin? piano
  Fatture in Cloud reale? import automatico? account Aruba di chi?
  contratto dipendenti "a chiamata"?) — `docs/DOMANDE_APERTE_07-08-2026.md` §4.
- ASL5 Spezzino/consulente HACCP: mai chiesto se il ristorante rientra
  nell'obbligo di "riconoscimento" CE 853/2004 (lavorazioni carne/pesce in
  loco) invece della semplice SCIA — punto emerso dalla ricerca 14/08/2026
  (`docs/RICERCA_HACCP_MERCATO_LEGALE.md` §3), recuperato 23/08/2026,
  nessuna mail ancora scritta.
- Dominio `sito-hotel`, Iubenda: rimandati da Marco (vedi memoria di
  progetto — non riproporre finché non li riporta lui).

## Item aperto, non chiarito

Il tab Code (22/08) ha segnalato `prezzo_notte: 0` trattato come "nessun
valore" via COALESCE — non accettato come non-problema senza il file:riga
esatto citato da Code. Non in task list, resta da chiarire.

---

**Nota sulle voci ✅ di `docs/EVOLUTIVE.md`**: NON vanno cancellate. File
letto integralmente il 23/08/2026 per un progetto di sfoltimento — quasi
ogni voce ✅ porta con sé limiti noti, decisioni di prodotto o avvertimenti
ancora operativamente rilevanti ("non riproporre X senza Y", prezzi
verificati, motivazioni di scelte tecniche), non solo narrativa di cosa è
stato fatto. Cancellarle avrebbe perso informazione viva, non solo
cronaca — decisione presa in sessione con Marco, 23/08/2026.

---

*Ultimo aggiornamento: 23/08/2026 — file creato, migrato da CLAUDE.md §16
(che nella vecchia forma pesava 617 righe/40 KB). Corretti in questo
passaggio due status che CLAUDE.md §8 aveva stale (2.5 Fase 2 e 2.6 —
vedi righe sopra); §8 aggiornato di conseguenza nella stessa sessione.*
