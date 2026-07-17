# Viste Fase 2 — riferimento per implementazione
Preparato 15/07/2026, da una sessione di analisi UX. Non contiene codice da incollare —
è la specifica di cosa ogni vista deve fare, da tradurre nei componenti reali del progetto
(stile coerente con l'esistente: sidebar navy, card bianche, stessa libreria icone/componenti già in uso).

---

## 1. Sidebar riorganizzata

**Problema risolto**: "Prenotazioni" esiste già in sidebar per il ristorante (tavoli). La Fase 2
introduce le prenotazioni camere — stesso nome, oggetto diverso. Serve disambiguare.

**Struttura proposta**:
- PRINCIPALE (invariata): Dashboard, Timbrature, Personale
- OSPITALITÀ (nuova sezione): Camere (esistente, spostata qui), Prenotazioni (nuovo — camere),
  Pulizie (nuovo, vedi punto 4), Ospiti (nuovo, vedi punto 3)
- RISTORANTE: Sala/Comande, Cucina, **Prenotazioni tavoli** (rinominata da "Prenotazioni"), Menu, Magazzino
- AMMINISTRAZIONE (nuova sezione): Pagamenti (nuovo), Adempimenti fiscali (nuovo), Report (nuovo, vedi punto 6)
- ALTRO (invariata): ZTL Targhe, HACCP, Archivio

**Azione**: un solo rename (route/label "Prenotazioni" → "Prenotazioni tavoli" nel modulo ristorante
esistente) più il resto sono aggiunte, nessun'altra modifica a funzionalità esistenti.

---

## 2. Prenotazioni (camere) — vista griglia/planning

**Scopo**: vista predefinita del modulo, non una lista. Griglia con camere sulle righe e giorni
sulle colonne (tipo Gantt), ogni prenotazione è una barra colorata che copre l'intervallo di date.

**Stati e colori** (coerenti col ciclo di vita già definito):
- Opzione → ambra
- Confermata → blu/accent
- In corso (check-in fatto) → verde/success
- (Interrotta/cancellata non compare in griglia, o compare tratteggiata — da decidere in fase di build)

**Interazione**: click sulla barra apre un pannello/modale di dettaglio con: nome ospite, camera,
date, numero ospiti, stato, metodo/stato pagamento, canale di provenienza (diretta/WuBook/OTA
specifica), azioni rapide (Check-in, Modifica).

**Nota tecnica**: la query sottostante è "tutte le prenotazioni che intersecano l'intervallo
[data_inizio, data_fine] su tutte le camere" — richiede indice su Soggiorno(data_arrivo, data_partenza),
diversamente da una lookup per ID singolo. Da tenere presente nello schema tabelle.

---

## 3. Ospiti — scheda anagrafica

**Accesso**: (a) da una nuova voce "Ospiti" in sidebar (ricerca/rubrica ospiti passati), oppure
(b) cliccando il nome ospite dal pannello di dettaglio prenotazione (punto 2).

**Contenuto scheda**:
- Header: nome, cittadinanza, badge "ospite abituale" se più soggiorni
- Contatti: email, telefono
- Documento: tipo + numero **mascherato** (es. `CI · ••••1847`) — mai foto/scansione (vincolo GDPR
  già discusso), eventualmente uno svela-su-richiesta con log di chi l'ha fatto
- Storico soggiorni: tabella data/camera/importo, derivata dalla tabella Soggiorno filtrata per
  ospite_id (non è una tabella duplicata)
- Riga di stato conservazione: data limite conservazione fiscale (accountability GDPR)
- Consenso marketing: separato dal resto, flag esplicito con la propria base giuridica

---

## 4. Pulizie (housekeeping)

**Correzione rispetto alla proposta iniziale (15/07/2026)**: esiste già oggi in Camere un'indicazione
fermata/partenza, impostata manualmente dalla reception, non collegata a nessuna prenotazione (perché
oggi non esiste ancora un sistema di prenotazioni a cui collegarla). Una volta che Prenotazioni esiste,
fermata/partenza diventa **calcolabile automaticamente** da Soggiorno (continua oltre oggi → fermata;
checkout oggi → partenza) — la reception non deve più impostarlo a mano, elimina un tipo di errore comune
(dimenticarsi di aggiornarlo).

**Scopo vista Pulizie**: incrocia due assi distinti —
- **Tipo** (fermata/partenza): calcolato automaticamente da Soggiorno, sola lettura
- **Completamento** (fatta/da fare): l'unico campo che la cameriera imposta manualmente — nessuna
  prenotazione può saperlo

**Layout**: griglia di card per camera, badge tipo (auto) + bottone completamento (manuale), pensata
per uso rapido da tablet/telefono.

**Stato occupazione (occupata/libera)**: oggi non esiste come vista in Camere. Una volta che Prenotazioni
esiste, va calcolato dalla stessa fonte (Soggiorno) e mostrato in tre punti che oggi sono scollegati:
Camere (vista giornaliera calcolata invece di manuale), Prenotazioni (già implicito nella griglia — una
barra su una camera oggi è "occupata"), Dashboard (il contatore "camere X/21" già presente, da rendere
calcolato invece che statico/manuale).

---

## 5. Conto ospite (folio)

**Scopo**: conto che accumula gli addebiti di un soggiorno da fonti diverse — camera, ristorante,
extra/minibar — con saldo finale al checkout. Collega direttamente il modulo Ristorante (comande)
già esistente al nuovo modulo Prenotazioni: serve una funzione "addebita alla camera" nel modulo
comande, che oggi probabilmente non esiste.

**Contenuto**: righe addebito (descrizione + importo) → totale → pagamenti già ricevuti (es. caparra,
mostrati come sottrazione) → saldo dovuto. Azioni: Incassa saldo, Emetti fattura.

**Dipendenza**: richiede che il modulo Ristorante possa "taggare" una comanda con un `soggiorno_id`
invece di (o in aggiunta a) chiuderla come vendita diretta — è una modifica al modulo esistente,
non solo un'aggiunta.

---

## 6. Report avanzati

**Scopo**: metriche di andamento nel tempo, oltre ai KPI "di oggi" già presenti in Dashboard.

**Metriche minime**: ADR (tariffa media giornaliera), RevPAR (ricavo per camera disponibile),
tasso di occupazione medio su un periodo, con un grafico andamento occupazione (ultimi 7/30 giorni).

**Nota**: tutte calcolabili dai dati di Soggiorno + Pagamento una volta che il modulo Prenotazioni
esiste — nessuna nuova tabella richiesta, solo query di aggregazione.

---

## Priorità suggerita per l'implementazione
Punti 2 e 3 (Prenotazioni + Ospiti) sono il prerequisito di tutto il resto — corrispondono al
modulo Prenotazioni già pianificato. Punto 4 (Pulizie) è indipendente e può essere fatto anche
separatamente/prima, non ha dipendenze da Prenotazioni. Punti 5 e 6 dipendono dall'esistenza dei
primi due — da affrontare dopo.
