# Ricerca competitor — reportistica per il titolare

> Ricerca commissionata da Marco il 14/08/2026. Confronta cosa offrono i
> PMS leader e il concorrente diretto italiano sulla reportistica/business
> intelligence per il proprietario — categoria mai coperta esplicitamente
> nei confronti competitivi precedenti (05/08 Mews/Cloudbeds/RoomRaccoon,
> 10/08 Slope, entrambi in `docs/EVOLUTIVE.md`). Solo ricerca, nessuna
> funzionalità aggiunta al backlog finché non richiesto esplicitamente.

---

## 1. Il punto scomodo

[Certo] Oggi il gestionale non ha nessun report di revenue/occupazione
storico — verificato nel codice, non solo per assunzione: `dashboard.js`
espone solo `/kpi` (istantanea di oggi), `/alert` e `/gruppi` (widget), più
un inserimento manuale di `incassi_giornalieri`. Zero endpoint che
aggreghi `soggiorni`/`pagamenti`/`prenotazioni` su un periodo per ADR,
RevPAR, occupazione, mix canali o andamento ricavi. I "report" che esistono
davvero sono tutti operativi e settoriali: HR (presenze/foglio consulente),
magazzino (scadenze/bozza ordine/storico prezzi), tassa di soggiorno.
Nessuno di questi risponde alla domanda che ogni PMS concorrente mette al
centro: "come sta andando la struttura, in numeri, su un periodo".

[Probabile] Il dato grezzo per costruirli c'è già quasi tutto —
`soggiorni.tariffa_totale`, `pagamenti`, `addebiti_extra`,
`prenotazioni.canale_origine`, `tasse_soggiorno` — non manca lo schema,
manca lo strato di aggregazione/dashboard. Diverso dal caso HACCP di
oggi, dove mancavano anche i dati di partenza.

---

## 2. Cosa offrono i concorrenti

| Prodotto | Cosa propone | Dettaglio rilevante |
|---|---|---|
| **Mews** | Mews BI (lanciato aprile 2026) — dashboard nativi + report programmati, ora inclusi di default per tutti i clienti (prima solo add-on) | Integra dati esterni (OTA, Google Ads) per una vista commerciale completa, non solo interna |
| **Cloudbeds** | Cloudbeds Insights — dashboard pronti + report "no-code" personalizzabili | Metriche: occupazione, ADR, RevPAR, booking window, contributo per canale, ricavi camera, incassi. "Detailed Analytics" per analisi approfondita (revenue manager); "Performance Analysis Report" per canale di prenotazione |
| **RoomRaccoon** | Dashboard unico in tempo reale (revenue, occupazione, KPI) + report esportabili con un click | Report su demografia ospiti, canali più performanti, reportistica finanziaria (entrate/uscite/redditività) |
| **Slope** (concorrente diretto italiano) | Report per "centro di profitto" — camere, ristorante, spa/wellness, sale meeting, separati | Export PDF ed Excel con grafici; versione "business intelligence" per catene multi-struttura (aggrega più hotel) |
| **TeamSystem Hospitality** (quello che Hotel del Golfo usa oggi) | "Strumenti di reportistica avanzata e KPI aggiornati", confronto diretta vs preventivi vs altri canali, report personalizzabili in home | Marco lo sta già pagando — è il minimo che l'utente si aspetta di ritrovare, non un vantaggio competitivo se assente |

---

## 3. Categorie di report ricorrenti (denominatore comune)

Emergono con costanza in tutti e cinque, quindi rappresentano lo standard
di mercato più che una particolarità di un singolo prodotto:

1. **Occupazione** — su periodo scelto, spesso con confronto anno
   precedente (Hotel del Golfo ce l'ha già solo nel widget dashboard di
   oggi, non su un periodo storico arbitrario).
2. **ADR/RevPAR** — tariffa media giornaliera e ricavo per camera
   disponibile, la metrica standard di settore per capire se si sta
   guadagnando bene o solo riempendo le camere a sconto.
3. **Mix canali** — quanto arriva da diretto, Booking, telefono, ecc. e
   quanto rende ciascuno (utile anche in vista del modulo 2.3/WuBook).
4. **Revenue per centro di profitto** — camere separate da ristorante
   (Slope lo fa esplicitamente; Hotel del Golfo ha già `pagamenti` e
   `addebiti_extra`/`comande` separati per fonte, il dato esiste).
5. **Forecast** — proiezione occupazione/ricavi sui prossimi giorni/mesi
   in base a quanto già prenotato (diverso da 6.3 "revenue management
   automatico" già in roadmap Fase 3 — qui parliamo di guardare avanti,
   non di ricalcolare tariffe da soli).
6. **Report finanziario/P&L semplificato** — entrate/uscite/redditività.
   Per Hotel del Golfo si scontra subito con lo stesso limite già noto:
   `incassi_giornalieri` è manuale e scollegato da `pagamenti`/`comande`
   (evolutiva già aperta il 10/08/2026, vedi `docs/EVOLUTIVE.md`).
7. **Demografia ospiti** — provenienza, ripetizione, stagionalità. Il
   modulo Alloggiati Web (2.5) raccoglie già nazionalità/residenza per
   obbligo di legge — dato riusabile qui senza nuova raccolta.
8. **Export PDF/Excel con un click** — tutti e quattro i concorrenti
   (non TeamSystem, non specificato) lo citano esplicitamente. Il
   gestionale ha appena guadagnato il pattern per farlo bene (export PDF
   planning camere, 14/08/2026) — riusabile come base tecnica.
9. **Dashboard in tempo reale, non solo a fine giornata** — tutti lo
   sottolineano come differenziale vs il vecchio modo "spreadsheet a fine
   turno". La Dashboard KPI di Hotel del Golfo è già in tempo reale per
   *oggi* — il gap è l'assenza di uno storico su periodo, non la
   tempestività del dato singolo.

---

## 4. Cosa esiste già nel gestionale, riusabile senza nuovo schema

Non è una ricostruzione da zero — verificato nel codice, non assunto:

- `soggiorni.tariffa_totale`, `data_arrivo`/`data_partenza` → base per
  occupazione/ADR/RevPAR su periodo.
- `pagamenti` (per soggiorno/prenotazione) + `addebiti_extra` + `comande`
  → base per revenue per centro di profitto (camere vs ristorante vs
  extra).
- `prenotazioni.canale_origine` → base per mix canali (già popolato,
  select con Diretta/Telefono/Booking.com/Airbnb/WuBook/Altro).
- `ospiti`/dati Alloggiati Web (nazionalità, residenza) → base per
  demografia, nessuna nuova raccolta dati.
- `tasse_soggiorno` → già un report dedicato (modulo 2.4), modello di
  riferimento per come si è già affrontato "aggregare per periodo +
  export Excel" in questo stesso progetto.

Quello che manca davvero è lo strato che li mette insieme su un periodo
arbitrario con confronto storico — oggi ogni tabella si guarda per conto
suo (dettaglio singola prenotazione, dashboard di oggi, export tassa di
soggiorno separato), non esiste un "Report" trasversale.

---

## 5. Non affrontato in questa ricerca

- Nessuna proposta di implementazione concreta (endpoint, migration, UI)
  — solo ricognizione di cosa fa il mercato, come richiesto.
- Il "revenue management automatico" (ricalcolo tariffe da solo) resta un
  concetto diverso, già tracciato come 6.3 in roadmap e come voce
  "PRIORITÀ BASSA/FUTURA" nelle evolutive competitive esistenti — qui
  parliamo solo di guardare i numeri, non di farli decidere al sistema.
- Nessuna verifica di prezzo — a differenza della ricerca HACCP, qui
  l'obiettivo era "cosa offrono", non "quanto costa", perché è comunque
  funzionalità interna al gestionale già pagato, non un prodotto da
  comprare a parte.

## Fonti principali

- Mews — mews.com/en/press (annuncio Mews BI, aprile 2026), hoteltechreport.com
- Cloudbeds — cloudbeds.com/business-intelligence-software, myfrontdesk.cloudbeds.com (Detailed Analytics, Performance Analysis Report, Occupancy Reports)
- RoomRaccoon — roomraccoon.com/platform/hotel-reporting
- Slope — slope.it (pagina PMS, articolo "Revenue, marketing, vendite e controllo di gestione")
- TeamSystem Hospitality — teamsystem.com/horeca/ts-hospitality
