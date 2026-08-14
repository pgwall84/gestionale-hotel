# Piano di migrazione — da TeamSystem a gestionale interno + sito, target dicembre 2026

Creato 07/08/2026, su richiesta del titolare dopo la decisione di procedere
con A-Cube (sostituzione registratore Hugin RT-K50) e la conferma di voler
avere **gestionale e sito completamente operativi entro fine dicembre 2026**.
Oggi è il 07/08/2026: **circa 20 settimane di margine.**

Non riscrive le decisioni già prese in `docs/EVOLUTIVE.md` (channel manager,
booking engine, pagamenti, fatturazione B2B, finestra di switch-off) — le
mette in sequenza con date e dipendenze concrete. Cronologia di come si è
arrivati fin qui: `docs/DIARIO_SESSIONI.md`.

**Aggiornamento 07/08/2026 — scadenza ammorbidita**: il titolare ha chiarito
che dicembre 2026 non è una scadenza rigida — **va bene concludere anche
entro febbraio 2027**, la seconda finestra di switch-off già prevista in
`docs/EVOLUTIVE.md`. Le fasi e le dipendenze sotto restano valide, ma il
buffer di rischio è molto più ampio di quanto scritto in Sezione 11 — non
serve più comprimere Fase 0/1 per stare dentro novembre a tutti i costi.

---

## 0. Prima di leggere il piano — una decisione da confermare

**Il 01/08/2026 il titolare aveva rimandato deliberatamente 1.10 (Deploy
VPS)** per sviluppare prima tutti i moduli gratuiti di Fase 2A/2D (vedi
`docs/EVOLUTIVE.md`, "Sequenza di sviluppo 01/08/2026"). Quella decisione
va rivista adesso: **il Channel Manager WuBook funziona via webhook**, cioè
richiede un endpoint del gestionale raggiungibile da internet. Il
gestionale oggi vive solo in LAN (Sezione 12 di CLAUDE.md). Senza il
deploy, WuBook non può funzionare — e senza WuBook non c'è switch-off da
TeamSystem, che è l'obiettivo di questo piano.

**Conclusione: 1.10 Deploy VPS non è più l'ultimo step rimandabile, è il
primo blocco di sviluppo da fare.** Il piano sotto lo mette per primo di
conseguenza. Se il titolare preferisce un ordine diverso, va deciso prima
di partire — cambia la sequenza di tutto il resto.

**Seconda cosa da verificare subito**: la finestra di switch-off già
decisa è "novembre 2026 o febbraio 2027 — mai in estate" (`docs/EVOLUTIVE.md`).
Dicembre 2026 come target di "sistema operativo" è compatibile con la
finestra di novembre (con un po' di margine per i test in doppio binario),
ma **non lascia spazio per slittare a febbraio 2027** se qualcosa si
allunga. Il piano sotto punta dritto a novembre.

---

## 1. Fase 0 — Cose da avviare SUBITO, in parallelo (dipendono da terzi, tempi non controllabili)

Questi 6 punti non richiedono sviluppo — sono azioni che solo il titolare
può fare, e sono il vero collo di bottiglia del piano: ogni settimana persa
qui è una settimana persa sul totale, indipendentemente da quanto
velocemente si scrive codice dopo. **Vanno iniziati questa settimana, non
in sequenza con lo sviluppo.**

| # | Azione | Chi | Sblocca | Perché è urgente |
|---|---|---|---|---|
| 0.1 | Sottoscrivere WuBook (channel manager + booking engine) | Titolare | 2.3, 3.3, 4.1 | Mai fatta (Fase 0 di 2.3) — è il blocco più vecchio del progetto |
| 0.2 | Richiedere preventivo A-Cube (info@acubeapi.com o form su acubeapi.com/contatti, categoria "E-Receipts" — corretto il 14/08/2026, l'indirizzo sales@a-cube.io scritto qui prima non risulta più valido/verificabile sul sito ufficiale) con i volumi | Titolare | 3.1 | Nessun prezzo pubblico, tempi di risposta commerciale non stimabili |
| 0.3 | Recuperare il numero reale di scontrini/anno del ristorante dai report Hugin/corrispettivi già trasmessi | Titolare | 0.2 | Serve per un preventivo A-Cube vero, non una stima |
| 0.4 | Decidere con il commercialista: A-Cube anche per fatturazione B2B, o tenere Fatture in Cloud (già in uso, 500€/anno)? | Titolare + commercialista | 3.2 | Oggi pagate già FiC — capire se si sovrappone o si sostituisce prima di sviluppare l'integrazione sbagliata |
| 0.5 | Sbloccare l'accesso alla mail aziendale (serve per: dominio DNS, account Iubenda, account GA4) | Titolare | Fase 2 (sito) | Ferma 3 attività diverse contemporaneamente |
| 0.6 | Se si vuole chiudere anche ROSS1000 entro dicembre: richiedere le credenziali HTTP Basic a Regione Liguria (Ufficio Turismo) | Titolare | 2.6 Fase 2 | Non blocca lo switch-off da TeamSystem, priorità più bassa — vedi nota in fondo |

---

## 2. Fase 1 — Deploy VPS (1.10) — *settimane 1-2 (11-22 agosto)*

Sblocca tutto il resto (WuBook, pagamenti online, accesso da internet per
i test). Va fatto per primo tra le attività di sviluppo vere e proprie.

**Aggiornamento 09/08/2026 — dominio e provider VPS decisi**: per non
dipendere dai tempi di LivelloUno (dominio del sito ancora bloccato, vedi
Fase 2), il gestionale usa un dominio proprio separato, già acquistato dal
titolare: **hdgolfo-gestionale.com** (Cloudflare Registrar, DNS gestito lì
in modalità solo-DNS, senza proxy — necessario per non interferire con le
Server-Sent Events del monitor cucina). Nessuna dipendenza dal
trasferimento del dominio del sito; un'eventuale unificazione su
`hoteldelgolfolerici.com`/`hoteldelgolfo.com` resta un'opzione futura a
freddo, non urgente (nessun cambio di codice richiesto, l'URL backend è
già calcolato a runtime).

Anche il provider VPS è cambiato rispetto alla prima stesura: Hetzner ha
tolto dal listino la sua fascia economica (CX, "Cost-Optimized", segnata
"currently not available"), lasciando solo la fascia CPX a ~24€/mese per
le stesse specifiche — troppo, a parità di specifiche, rispetto alle
alternative dirette. Confermato **netcup** (VPS Lite 1 G12s — 2 vCore, 4GB
RAM, 80GB SSD, stesse specifiche del CX22 originale) a **5€/mese
(~60€/anno)** invece dei 75-90€/anno stimati inizialmente per Hetzner —
verificato dal vivo sui listini di entrambi il 09/08/2026, non da una
ricerca generica.

1. Account netcup + provisioning VPS Lite 1 G12s (~60€/anno)
2. Nginx + PM2 + SSL (Let's Encrypt)
3. Backup automatico
4. **Audit di sicurezza completo obbligatorio prima di esporre a internet**
   (Sezione 7 di CLAUDE.md — oggi il gestionale è raggiungibile solo da LAN,
   dopo il deploy da internet, stesso codice ma esposizione molto diversa)
5. Verifica da mobile/tablet reali (stesso identico setup di test già usato
   in LAN, ora contro il dominio pubblico)

**Rischio principale**: è l'unico step di questo piano mai fatto nemmeno
in bozza — nessuna esperienza pregressa nel progetto su cui contare. Non
comprimere l'audit di sicurezza per fare prima: è l'unico momento in cui
si passa da LAN a internet, l'unico che non si può rifare "con calma dopo".

**Aggiornamento 09/08/2026 — valutata Aruba Cloud come alternativa,
rimandata**: confrontato anche Aruba Cloud VPS O2A4 (2vCPU/4GB/40GB,
6,29€+IVA/mese ≈ 7,67€/mese, ~92€/anno) — scartato per ora per due motivi:
(1) costa più di netcup a parità di specifiche; (2) tentando di registrare
l'account, Aruba risulta avere **già un servizio legato alla P.IVA
dell'hotel**, associato a un indirizzo email mascherato del tipo
`c******@li*e*o.it` (verosimilmente @libero.it) che il titolare non
riconosce. Ipotesi più probabile: PEC o fatturazione elettronica (SDI)
aperta in passato da un commercialista/consulente precedente o da
LivelloUno, non un servizio cloud dimenticato — ma **non verificato**, da
chiarire prima di usare Aruba per qualunque cosa. **Non tentare un
recupero password o un accesso a quell'account senza prima sapere chi lo
controlla** — rischio di toccare un servizio PEC/fatturazione già attivo
per altri scopi.

**Piano d'azione, non urgente**:
1. Chiedere al commercialista se è lui/il suo studio ad aver aperto
   PEC/fatturazione elettronica su Aruba per l'hotel (probabile risposta
   immediata) — aggiunto a `docs/DOMANDE_APERTE_07-08-2026.md`.
2. Se il commercialista non lo sa, contattare il supporto Aruba per
   telefono (non chat) con la P.IVA in mano, chiedere cosa risulta
   collegato e chi ne ha accesso.
3. **Decisione presa nel frattempo**: si procede con **netcup** per il
   deploy del gestionale (nessun blocco, già verificato, pagamento in
   corso). Aruba resta un'opzione di migrazione futura, **da rivalutare
   tra 6 mesi o prima** se emergono buoni motivi (es. preferenza per
   supporto italiano, chiarito il mistero dell'account, o problemi con
   netcup) — il cambio di hosting è a basso rischio grazie al dominio
   separato (`hdgolfo-gestionale.com`, DNS su Cloudflare) e all'URL
   calcolato a runtime: basta un `pg_dump`/`pg_restore`, copia degli
   eventuali file caricati, nuovo setup Nginx/PM2/SSL, e un aggiornamento
   del record DNS — qualche ora di lavoro, non un progetto.

**Aggiornamento 09/08/2026 — deploy completato**: il deploy su netcup è
stato portato a termine tecnicamente in questa stessa sessione. Il
gestionale è raggiungibile in HTTPS su `https://hdgolfo-gestionale.com`.
Guida operativa completa (setup server, Nginx, PM2, SSL, backup e ogni
altro dettaglio) in `docs/DEPLOY_VPS_NETCUP.md`. Resta da fare solo
l'audit di sicurezza pre-produzione (Sezione 7 di `CLAUDE.md`) prima di
considerare la Fase 1 davvero chiusa.

---

## 3. Fase 2 — Sito: dominio, GA4, Iubenda, Vercel Pro — *settimane 1-3, in parallelo alla Fase 1*

Non dipende dal gestionale, si può fare in parallelo appena sbloccata la
mail aziendale (0.5):

1. Collegare hoteldelgolfolerici.com a Vercel (solo DNS, dominio già di
   proprietà — gratis)
2. Passare da Vercel Hobby a Pro (~220€/anno) — il piano gratuito è per
   uso non commerciale da contratto Vercel, un sito che venderà camere
   davvero non può restare lì
3. Creare l'account GA4 e impostare `NEXT_PUBLIC_GA_ID` (passaggi
   dettagliati già in `docs/EVOLUTIVE.md` del sito)
4. Creare l'account Iubenda (piano Free probabilmente già sufficiente
   sotto le 1.000 pageview/mese — passare a Essentials ~5€/mese solo
   quando il traffico reale sale dopo il collegamento del dominio)
5. Rigenerare il QR del Welcome Book con l'URL finale (oggi punta al
   dominio provvisorio Vercel)

**Aggiornamento 07/08/2026 — scoperta durante l'indagine sul dominio**:
il dominio `hoteldelgolfolerici.com` è gestito da un'agenzia locale
identificata (LivelloUno, Sarzana/La Spezia) — bloccato da
`clientTransferProhibited`/`clientUpdateProhibited`, va sbloccato prima di
qualunque intervento (mail di richiesta preparata, in attesa di risposta).
Scoperto anche un secondo dominio attivo sulla stessa infrastruttura,
**hoteldelgolfo.com**, che ospita oggi `info@hoteldelgolfo.com` sullo
stesso server condiviso del sito (stesso IP) — non un servizio email
dedicato. Decisione del titolare: **trasferire entrambi i domini** (EPP)
invece di limitarsi a chiedere singoli record, e **spostare anche l'email
su Microsoft 365** (il titolare ha già un abbonamento Business, da
verificare con certezza — 1-2 caselle attive oggi, costo aggiuntivo atteso
vicino a zero se il piano è già Business). Migrazione email non urgente,
ma dipende dallo stesso sblocco DNS richiesto a LivelloUno — va quindi
fatta nella stessa finestra, non separatamente.

---

## 4. Fase 3 — Integrazione WuBook (2.3) — *settimane 3-7 (dipende da 0.1 + Fase 1)*

1. Ricezione webhook prenotazioni da WuBook (nuove prenotazioni OTA →
   `prenotazioni`/`soggiorni`)
2. Invio disponibilità e tariffe verso WuBook (uso della mappatura
   `tipi_camera_canali` già pronta dal 31/07/2026)
3. **Doppio binario obbligatorio**: WuBook attivo in parallelo a
   TeamSystem per almeno 1-2 settimane prima di spegnere qualunque cosa —
   nessuna prenotazione reale deve dipendere da un sistema mai testato in
   produzione
4. Verifica manuale: una prenotazione di prova su ogni OTA collegata,
   controllo che compaia correttamente nel planning

**Stima**: 3-4 settimane di sviluppo, ma il vero rischio è a monte — se
0.1 (sottoscrizione) si allunga, questa fase slitta 1:1.

---

## 5. Fase 4 — Pagamenti online (3.3) — *settimane 6-8, in parallelo/dopo Fase 3*

1. Nexi (default) + Stripe (alternativa) via WuBook
2. Collegato al booking engine (Fase 5)
3. Nota: le commissioni sono percentuali per transazione, non un canone
   fisso — non pesa sul budget annuo come le altre voci, ma va spiegato
   allo staff in reception. **Verificato dal vivo il 09/08/2026**: Stripe
   pubblica un listino chiaro (1,5%+0,25€ per carte SEE, 2,5%+0,25€
   extra-SEE); Nexi non pubblica alcuna commissione — solo tramite
   contratto commerciale. Da chiedere per iscritto a Nexi prima di
   confrontare davvero i due, non assumere che siano allineati.

---

## 6. Fase 5 — Booking engine sul sito (4.1) — *settimane 7-10*

1. Calendario custom su API WuBook, sostituisce il widget TeamSystem
   incorporato oggi in `BookingButton.tsx` (modalità 'teamsystem' →
   modalità nativa)
2. Verifica disponibilità/prezzo mostrati in tempo reale
3. Test di una prenotazione reale end-to-end dal sito

---

## 7. Fase 6 — A-Cube (3.1) — *settimane 5-11, in parallelo a WuBook (indipendente)*

Non dipende da WuBook — può partire appena arriva il preventivo (0.2) e
può procedere in parallelo alle Fasi 3-5.

1. Attivazione abbonamento A-Cube (dopo preventivo 0.2)
2. Registrazione "server RT" presso Agenzia delle Entrate (sostituisce la
   matricola del registratore fisico)
3. Collegamento logico POS↔RT (nuovo obbligo dal 01/01/2026, via web
   service — riguarda Nexi/Stripe una volta attivi in Fase 4)
4. Integrazione scontrini ristorante + camera, annulli, omaggi,
   autoconsumo (modulo 3.1 già descritto in CLAUDE.md)
5. **Doppio binario con Hugin** per almeno 2 settimane prima di smettere
   di usare il registratore fisico — è compliance fiscale, zero margine
   di errore accettabile

**Nota di rischio esplicita**: la possibilità di fare a meno dell'hardware
è una normativa entrata in vigore da pochissimo (specifiche tecniche
aggiornate ad aprile 2026, servizio disponibile da inizio marzo 2026) —
non è infrastruttura collaudata da anni. Va confermata con il
commercialista prima di spegnere Hugin, non solo tecnicamente verificata.

---

## 8. Fase 7 — Fatturazione B2B (3.2) — *settimane 9-11*

Dipende dalla decisione 0.4. Due scenari:
- **Se si tiene Fatture in Cloud**: nessuno sviluppo nuovo necessario,
  resta come oggi (500€/anno già pagati) — verificare solo se serve un
  collegamento dati col gestionale o se resta un processo separato.
- **Se si passa ad A-Cube anche per questo**: sviluppo aggiuntivo di
  integrazione fatture, da preventivare separatamente con A-Cube in 0.2.

**Verificato dal vivo il 09/08/2026**: il listino pubblico attuale di
Fatture in Cloud (Forfettari 4€, Standard 12€, Premium 21€, Premium Plus
29€, Complete 51€/mese) **non contiene nessun piano che con IVA faccia
esattamente i 500€/anno** confermati dal titolare — il più vicino è
Premium Plus (348€+IVA ≈ 425€/anno) o Complete (612€+IVA ≈ 747€/anno).
Prima di decidere se tenerlo o sostituirlo con A-Cube, il titolare
dovrebbe controllare l'ultima fattura reale per capire quale piano/add-on
sta pagando davvero — il confronto costi non è affidabile finché questo
resta un'ipotesi.

---

## 9. Fase 8 — Test finale, formazione staff, switch-off — *settimane 11-16 (fine ottobre - fine novembre)*

1. Doppio binario completo (WuBook + A-Cube + gestionale attivi, TeamSystem
   ancora presente come rete di sicurezza) per 2-4 settimane
2. Formazione ai 9 dipendenti sul nuovo flusso (reception, ristorante,
   check-in/out) — non sottovalutare: è un cambio di strumento quotidiano
   per tutto lo staff, non solo per il titolare
3. Switch-off effettivo TeamSystem Hospitality — **finestra novembre 2026**
   (mai in estate, coerente con la decisione già presa)
4. Disdetta abbonamento TeamSystem (1.500€/anno) e del fornitore OTA
   esterno attuale (500€/anno) — verificare i termini di preavviso
   contrattuale per non pagare un mese in più del necessario
5. Buffer di dicembre 2026 come margine di sicurezza, non come scadenza
   vera — se novembre slitta di 2-3 settimane il sistema è comunque
   operativo prima di Natale

---

## 10. Timeline riassuntiva

```
Agosto (sett. 1-3)     — Fase 0 (avviare tutto in parallelo) + Fase 1 (Deploy VPS) + Fase 2 (sito)
Settembre (sett. 4-8)  — Fase 3 (WuBook) + Fase 6 avviata (A-Cube, appena preventivo pronto)
Ottobre (sett. 9-12)   — Fase 4 (pagamenti) + Fase 5 (booking engine) + Fase 7 (fatturazione B2B) + A-Cube in doppio binario
Novembre (sett. 13-16) — Fase 8: test finale, formazione staff, SWITCH-OFF TeamSystem
Dicembre               — margine di sicurezza, non lavoro pianificato
```

---

## 11. Rischi principali del piano (onestà, non solo entusiasmo)

- **I tempi di risposta di WuBook e A-Cube non sono controllabili da qui**
  — entrambi hanno smesso di pubblicare prezzi fissi, il che di solito
  significa anche processi commerciali più lenti (call, demo, contratto).
  Fase 0 (0.1, 0.2) è il vero rischio del piano, non lo sviluppo.
- **Il collegamento POS↔RT è una normativa di poche settimane di vita**
  (marzo-aprile 2026) — possibile instabilità lato Agenzia delle Entrate
  non prevedibile da qui.
- **1.10 Deploy VPS non è mai stato fatto nemmeno in bozza** — è il passo
  con meno esperienza pregressa nel progetto, va trattato con più margine
  degli altri, non meno.
- **La mail aziendale del titolare blocca 3 cose insieme** (dominio, GA4,
  Iubenda) — se resta bloccata a lungo, la Fase 2 (sito) slitta per
  intero, non solo in parte.
- **Rischio più generale**: provare a comprimere tutto in parallelo per
  fare prima può produrre un sistema che "sembra pronto" ma non è mai
  stato testato in doppio binario abbastanza a lungo. Il buffer di
  dicembre in Fase 8 esiste apposta — usarlo, non tagliarlo per finire
  "in anticipo".

---

## 12. Cosa NON è in questo piano (deliberatamente)

- 2.6 ROSS1000 Fase 2 (invio reale) — non blocca lo switch-off da
  TeamSystem, dipende solo dalle credenziali di Regione Liguria (0.6). Si
  può fare prima, dopo o mai entro dicembre senza impatto sull'obiettivo
  principale.
- 2.5 Alloggiati Web Fase 2 (invio reale schedina) — stesso discorso,
  dipende solo dal titolare che decida di testare con le credenziali già
  in suo possesso. Consigliato farlo comunque prima dello switch-off
  (è un obbligo normativo separato da TeamSystem), ma non è nel percorso
  critico di questo piano.
- WhatsApp Business API, Instagram feed, revisione formale privacy/cookie
  con legale, revenue management — tutte voci di `docs/EVOLUTIVE.md`,
  nessuna necessaria per l'obiettivo "gestionale e sito operativi entro
  dicembre".
