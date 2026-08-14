# Mail — Richiesta specifiche tecniche RIMOVCLI (modulo 2.6, Regione Liguria)

**A:** mario.schenone@regione.liguria.it
**Oggetto:** Richiesta specifiche tecniche RIMOVCLI e chiarimento idoneità gestionale sviluppato internamente — Hotel del Golfo, Lerici (SP)

---

Gentile Dott. Schenone,

siamo Hotel del Golfo, struttura ricettiva alberghiera a Lerici (provincia della Spezia). Vorremmo avviare il percorso di adesione al sistema RIMOVCLI con invio dei dati tramite procedura XML.

Prima di procedere con i test di compatibilità, avremmo bisogno di un chiarimento preliminare: il nostro gestionale non è un prodotto commerciale distribuito da una software house esterna, ma un software sviluppato internamente, a uso esclusivo della nostra struttura e non commercializzato ad altre strutture ricettive. Nell'elenco delle software house pubblicato sul sito regionale notiamo la presenza anche di ditte individuali (es. "Guazzi di Stefano Guazzi", "CSG di Giulio Frusi"), non solo di società strutturate: vorremmo quindi sapere se sia previsto un percorso di certificazione anche per una struttura che sviluppa e utilizza il proprio gestionale internamente, senza una software house esterna in senso tradizionale, e in tal caso quali siano i requisiti minimi richiesti.

Attualmente utilizziamo in affiancamento TeamSystem Hospitality, che non risulta presente nell'elenco dei gestionali compatibili con RIMOVCLI — da qui la necessità di valutare l'integrazione diretta del nostro sistema.

Se la nostra situazione rientra nei casi previsti, Vi chiediamo cortesemente di farci avere le indicazioni tecniche dei tracciati di collegamento per la generazione del file XML, così da poter avviare autonomamente i test di compatibilità.

Restiamo a disposizione per ogni chiarimento.

Cordiali saluti,
[Nome e cognome] — Hotel del Golfo, Lerici (SP)
[Telefono] — [email]

---

## Note di contesto (non fanno parte della mail)

- **Destinatario verificato**: Mario Schenone, Regione Liguria — Settore Politiche Turistiche, Via G. Maggio 3, Genova, tel. 010 548.5030 — è il referente indicato in fondo a `docs/ross1000/regione liguria/elenco_delle_software_house_e_dei_relativi_software_gestionali_compatibili.pdf` per chi richiede le indicazioni tecniche dei tracciati di collegamento. Diverso dall'Ufficio Territoriale Turismo/Statistica di La Spezia (quello gestisce l'adesione di chi usa un gestionale già in elenco, non le richieste tecniche di integrazione).
- **Sistema di riferimento**: RIMOVCLI, sistema regionale Liguria basato sul modello ISTAT C/59 — upload manuale di file XML su `flussituristici.regione.liguria.it/importc59-prod/login.c59`, entro il 7° giorno successivo a quello di riferimento. Diverso dal webservice SOAP ROSS1000/Turismo5 (`turismows.regione.liguria.it/ws/checkinV2?wsdl`) già implementato in `backend/lib/ross1000Xml.js` — quel codice punta a una piattaforma nazionale condivisa da altre regioni, non necessariamente il canale richiesto in Liguria per la categoria Hotel.
- **Evidenza ditte individuali**: nell'elenco compaiono "GUAZZI di Stefano Guazzi", "CSG di Giulio Frusi", "LEONARDO di Sonia Buttini" — imprese individuali, non Srl/Snc. Conferma che il sistema accetta anche piccoli operatori, non solo società strutturate — ma tutte queste vendono il proprio PMS a più strutture: nessuna voce è "un hotel che usa solo il proprio gestionale interno", da qui la domanda esplicita nella mail.
- **Da completare prima dell'invio**: nome e cognome del titolare, telefono, email di riferimento.
- **Prossimo passo dopo la risposta di Regione**: va ripensato il codice del modulo 2.6 (`ross1000Xml.js`, `ross1000Controller.js`) in base al canale confermato — rimandato su richiesta esplicita del titolare, non affrontato in questa sessione.
