# Ricerca HACCP — mercato software, obblighi legali, sensoristica

> Ricerca commissionata da Marco il 14/08/2026. Riferita al modulo di
> roadmap **6.1 — HACCP avanzato** (`CLAUDE.md` Sezione 8, Fase 3,
> collocato "dopo switch-off TS"). Questo documento è materiale di
> preparazione per quando quel modulo verrà sbloccato — non una spec di
> sviluppo immediato. Se si deciderà di anticiparlo, va gestito come
> deviazione esplicita dalla sequenza, sullo stesso modello già usato il
> 01/08/2026 per i moduli Fase 2 senza costi (vedi
> `docs/DIARIO_SESSIONI.md`).

---

## 1. Sintesi

[Certo] Il software HACCP non è obbligatorio per legge — lo è il piano di
autocontrollo (l'HACCP stesso) e la capacità di dimostrarlo in ispezione.
Un registro cartaceo compilato bene è ancora legalmente equivalente a uno
digitale. Quello che è cambiato nel 2026 è la prassi, non la norma: le
ASL si aspettano sempre più spesso dati con timestamp reale, non
compilazioni differite ricostruite a memoria prima del controllo.

[Certo] Hotel del Golfo ha già la tabella `haccp_checklist` (pulizie) nel
gestionale — il pezzo mancante è la parte più critica dal punto di vista
del rischio alimentare: **temperature frigo/cella, abbattimento,
cottura**, cioè esattamente ciò che un ispettore ASL guarda per primo.

[Probabile] Costruire questo modulo internamente costa tempo di sviluppo
ora, ma elimina un canone ricorrente per sempre — i concorrenti visti
costano indicativamente 240-600 €/anno di solo software, più l'hardware.
Su una struttura da 20 camere con ristorante, il break-even rispetto a un
abbonamento esterno è quasi certamente entro il primo anno, ammesso che il
modulo venga davvero costruito e usato.

---

## 2. Panorama competitor (software HACCP in Italia)

| Prodotto | Cosa offre | Prezzo | Note |
|---|---|---|---|
| **FoodTag** | Registri digitali, etichette automatiche, tracciabilità lotti/fornitori/scadenze, reminder formazione, cloud/GDPR | "poche centinaia di euro/anno"; promo vista: 50 € per 2 mesi + stampante Bluetooth | Il più orientato a UX moderna tra quelli visti |
| **HaccpOK** (Chemichal S.p.A.) | Gestionale HACCP + catena del freddo + fornitori/tracciabilità + ricettario/food cost + etichettatrice proprietaria (HaccpOK PRINT) | **25 €/mese o 240 €/anno** il solo software | Sensore wireless "Freeasy" abbinabile — vedi §4. **Attenzione**: la promo con sensore in omaggio richiede un vincolo di 24 mesi con penali di recesso (120 € + fino a 150 € se l'hardware torna danneggiato) — pattern commerciale aggressivo, da evitare come riferimento contrattuale se si valutasse mai un fornitore esterno |
| **ePackPro** | Piano HACCP, registri, tracciabilità, formazione | Non pubblicato, a preventivo | Pubblica un confronto onesto tra soluzioni, incluso il chiarimento legale citato in §3 |
| **Blumatica HACCP** | Suite compliance più ampia (HACCP + sicurezza lavoro) | A preventivo | Orientata a studi di consulenza, non a gestione diretta interna |
| **SubitoHACCP, autoHACCP, HACCP PRO, SimpleHACCP, RegistroHACCP.it** | Varianti dello stesso schema (registri digitali + reminder + firma) | A preventivo, fascia bassa dichiarata dai siti | Presenza online minore, difficile verificare la qualità reale senza demo |
| **FoodDocs** (estero, disponibile in IT) | Piano HACCP AI-assisted, monitoraggio temperature, audit trail | A preventivo | Player internazionale, prezzo tipicamente più alto della fascia italiana |

[Ipotesi] Nessuno dei prodotti italiani visti offre nativamente
un'integrazione con un PMS/gestionale alberghiero come il vostro — sono
tutti pensati per un ristorante o una cucina stand-alone. Questo è
probabilmente il vero vantaggio competitivo di costruirlo internamente:
un modulo HACCP che legge già `ospiti_giornalieri`, `menu_piatti`,
`prodotti`/`movimenti_magazzino` non lo offre nessun concorrente esterno,
perché nessuno ha accesso al resto del vostro gestionale.

---

## 3. Quadro normativo

**Base UE/nazionale**: Reg. (CE) 852/2004 — art. 6, notifica obbligatoria
all'Autorità Competente di ogni stabilimento; principi generali di igiene
e autocontrollo HACCP obbligatorio. Recepito in Italia con D.Lgs.
193/2007.

**Liguria**: D.G.R. n. 476 del 16/06/2017, applicativa del D.Lgs. 126/2016
(Decreto Madia) e dell'Accordo Stato-Regioni del 4/05/2017. La notifica
sanitaria è confluita nella **SCIA UNICA**, presentata esclusivamente
tramite il SUAP del Comune (portale `impresainungiorno.gov.it`), con
modulistica nazionale standardizzata e pagamento del tariffario ASL
allegato. L'attività può partire da subito alla presentazione, se tutti i
requisiti di legge sono rispettati.

**Autorità competente per Hotel del Golfo**: [Certo] **ASL5 Spezzino**
(Lerici è in provincia di La Spezia) — Via Fazio 30, 19121 La Spezia, tel.
0187 5331, PEC `protocollo.generale@pec.asl5.liguria.it`.

**Esclusione da verificare**: gli stabilimenti che trattano prodotti di
origine animale con necessità di "riconoscimento" CE 853/2004 sono esclusi
dalla semplice notifica sanitaria e richiedono un'autorizzazione separata.
[Ipotesi] Non ho verificato se il ristorante di Hotel del Golfo rientra in
questo caso (dipende da lavorazioni specifiche tipo trasformazione carne/
pesce in loco oltre alla normale cucina) — punto da chiarire con l'ASL5 o
il consulente HACCP attuale, non deducibile da qui.

**Formazione obbligatoria (Liguria)**: attestati validi 5 anni, rinnovo
con corso di aggiornamento di 4 ore. "Unità formativa A" = 8 ore per gli
alimentaristi (dipendenti); chi come OSA/responsabile fa produzione/
preparazione alimenti deve fare l'unità base + un'unità aggiuntiva = 16
ore totali. Certificazione con quiz a risposta multipla e presenza ≥90%.

**Conservazione registri**: nessun numero fisso in norma — Reg. 852/2004
dice solo "per un periodo adeguato". Prassi consigliata: minimo 2-3 anni,
alcune regioni arrivano a chiedere 5. Consigliato tenere gli ultimi ~3
mesi sempre accessibili in sede, il resto archiviato per mese/tipologia,
disponibile in orario di apertura per le ispezioni.

**Chiarimento legale ricorrente nelle fonti consultate**: il mezzo
(cartaceo vs digitale) non è normato — quello che conta è che i dati siano
completi, autentici e consultabili dall'autorità. Il software è uno
strumento di comodo, non un requisito di legge in sé.

---

## 4. Sensoristica — necessità, prezzi, dove comprare

[Probabile] Serve, ma non è indispensabile fin da subito: la registrazione
manuale delle temperature (2 volte/giorno, come fa oggi presumibilmente il
personale) è legalmente sufficiente. I sensori automatici risolvono un
problema diverso — dimenticanze, controlli fuori orario (notte, giorni di
chiusura), e riducono il rischio di dati "aggiustati" prima di
un'ispezione, che è ormai la cosa che le ASL guardano con più sospetto.

**Opzioni hardware individuate:**

| Prodotto | Tipo | Prezzo | Fornitore |
|---|---|---|---|
| **Hanna Instruments HI144** | Data logger da parete, singolo punto, non wireless (lettura via software/cavo) | **52-80 € + 22% IVA** | hanna.it, vendita diretta o rivenditori |
| **Freeasy (HaccpOK)** | Sensore wireless via Wi-Fi di struttura, notifiche email, si integra col gestionale HaccpOK | Prezzo del singolo sensore non pubblicato online — verosimilmente venduto in bundle con l'abbonamento software (24 mesi minimo nella promo vista) | haccpok.it, solo su richiesta commerciale |
| **Digitron Italia HLX2015** | Monitoraggio wireless temperatura/umidità/apertura porta 24/7, hardware incluso in abbonamento | Non pubblicato | digitron-italia.com |
| **Testo Saveris / 191-T1** | Kit professionale WiFi, certificato EN 12830 | Non pubblicato, fascia alta presumibile (marchio Testo è posizionato premium) | Rivenditori Testo (es. Frigolab) o testo.com |
| **Selin Milano RF300 (TP/DUAL/VACCINE)** | Data logger professionali, varianti per uso vaccini/farmaci oltre che alimentare | Non pubblicato | selinmilano.it |
| **Tecnafood / Tecnafoodstore** | Data logger robusti per ambiente cucina | Non pubblicato | tecnafoodstore.it |

[Ipotesi] Per 20 camere + ristorante 70 coperti, il numero di punti da
monitorare realisticamente è: 2-4 frigoriferi cucina, 1-2 celle, 1
abbattitore, eventualmente il frigo bar reception — diciamo **6-8 punti**.
Con sensori tipo HI144 (52-80 € cad., no abbonamento) la spesa hardware
one-off si aggira sui **400-650 €**, senza costi ricorrenti ma con lettura
manuale/scarico dati. Con un sistema wireless in abbonamento tipo Freeasy
o HLX2015 il costo hardware iniziale è spesso più basso o incluso, ma si
somma un canone mensile/annuale non quantificato dalle fonti pubbliche —
va richiesto un preventivo diretto per avere un numero reale.

**Raccomandazione pratica**: prima di comprare qualsiasi sensore wireless
in abbonamento, chiedere sempre esplicitamente le condizioni di recesso —
il pattern penali-vincolo-24-mesi visto in HaccpOK non è isolato in questo
settore, è una prassi commerciale comune che vale la pena verificare caso
per caso prima di firmare.

---

## 5. Funzionalità da implementare nel modulo 6.1 (proposta)

Elenco derivato dall'incrocio tra ciò che offrono i competitor e gli
obblighi normativi effettivi — non tutto ha lo stesso valore, ordinato per
impatto reale su un'ispezione ASL:

1. **Registro temperature frigo/cella/abbattitore** — inserimento manuale
   rapido (stile "scopetta" già usato in Stato Camere) + predisposizione
   per import automatico da sensore, se/quando acquistato. Alert se fuori
   soglia (0-4°C frigo, standard citato dalle fonti) o se manca la
   rilevazione del giorno.
2. **Registro scongelamento/cottura** — pochi campi (prodotto, metodo,
   temperatura al cuore, ora), collegabile a `ricette`/`menu_piatti` già
   esistenti.
3. **Checklist pulizie/sanificazione** — esiste già (`haccp_checklist`),
   verificare se copre firma digitale operatore e reminder automatico.
4. **Tracciabilità lotti e fornitori** — collegabile a `fornitori`/
   `prodotti`/`movimenti_magazzino` già esistenti in Magazzino (modulo
   1.7) — sinergia diretta, non richiede nuove tabelle di anagrafica.
5. **Scadenze formazione HACCP dipendenti** — 5 anni attestato, reminder
   automatico prima della scadenza; riusa il pattern già esistente in
   `scadenze`/`documenti_dipendente` (modulo HR 1.1).
6. **Generazione automatica registri per ispezione** — export PDF/Excel
   filtrabile per periodo, pensato per essere consegnato a un ispettore
   ASL senza ricostruzione manuale — è la funzionalità che risolve
   davvero il problema "compilazione differita" citato come rischio nel
   2026.
7. **Conservazione a norma** — retention automatica (consigliato ≥3 anni
   accessibile, non cancellare mai prima), coerente con l'assenza di un
   numero fisso in legge ma con la prassi di settore.
8. **Non prioritario ora**: integrazione sensori IoT in tempo reale — ha
   senso solo dopo aver deciso se/quali sensori comprare (§4); costruirla
   prima rischia di legarsi a un protocollo hardware specifico che poi
   cambia.

[Ipotesi] Punti 1-2-6-7 coprono la maggior parte del rischio reale in
ispezione. Punti 3-4-5 sono già in gran parte coperti da moduli esistenti
e richiedono solo collegamento, non nuove fondamenta.

---

## 6. Fonti principali consultate

- FoodTag — foodtag.it (confronto competitor, trend digitalizzazione 2026)
- ePackPro — epackpro.com (confronto soluzioni, chiarimenti legali su
  obbligo software vs obbligo piano di autocontrollo)
- ASL5 Spezzino — pagina ufficiale "Notifica di Inizio Attività"
- HaccpOK / Freeasy — haccpok.it (prezzi software, termini contrattuali
  promo sensore)
- Hanna Instruments Italia — hanna.it (prezzo HI144)
- Digitron Italia, Selin Milano, Tecnafoodstore — ricerca di mercato
  sensoristica, nessun prezzo pubblico trovato
