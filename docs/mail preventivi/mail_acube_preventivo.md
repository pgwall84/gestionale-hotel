# Mail — Richiesta preventivo API Corrispettivi Elettronici (modulo 3.1, A-Cube)

**A:** info@acubeapi.com
**In alternativa:** form su https://www.acubeapi.com/contatti (categoria prodotto: "E-Receipts")
**Oggetto:** Richiesta preventivo API Corrispettivi Elettronici — sostituzione registratore telematico, struttura alberghiera con ristorante, Hotel del Golfo (Lerici, SP)

---

Gentile A-Cube,

siamo Hotel del Golfo, struttura alberghiera a Lerici (provincia della Spezia) — 20 camere e ristorante interno aperto anche a clienti esterni (max 70 coperti). Stiamo valutando la sostituzione del nostro attuale registratore telematico (Hugin RT-K50) con la Vostra soluzione API per i corrispettivi elettronici, integrata direttamente nel nostro gestionale interno (sviluppato e mantenuto in casa, non un prodotto commerciale di terzi).

Vorremmo ricevere un preventivo indicativo per l'integrazione API Corrispettivi Elettronici, con questi volumi:

- **Camere**: circa 20 camere, occupazione piena stimata ~5 mesi/anno → circa 3.000 camere-notte/anno, tra 430 e 750 chiusure/anno a seconda della durata media del soggiorno.
- **Ristorante**: numero di scontrini/anno — Vi faremo avere il dato esatto a breve, recuperato dai report del registratore attuale; per una prima stima indicativa potete considerare un ristorante di media affluenza stagionale (alta stagione estiva, più contenuto nei mesi restanti).

Vorremmo inoltre sapere:

1. Il Vostro modello di prezzo (abbonamento fisso, a consumo per documento, o misto) e se esistono piani pensati per strutture ricettive/ristorazione di queste dimensioni.
2. Tempi indicativi di attivazione e di eventuale collegamento logico POS↔RT (nuovo obbligo dal 01/01/2026, via web service) — useremmo POS Nexi e/o Stripe.
3. Se disponibile una fase di test/sandbox prima dell'attivazione definitiva, per un periodo di doppio binario con il registratore attuale.
4. Se il preventivo può includere anche un'eventuale fatturazione elettronica B2B (oggi gestita con altro fornitore) — solo per avere un termine di paragone, non è detto che serva sostituirla.

Restiamo a disposizione per ogni chiarimento e per fornire ulteriori dettagli tecnici sul nostro gestionale.

Cordiali saluti,
[Nome e cognome] — Hotel del Golfo, Lerici (SP)
[Telefono] — [email]

---

## Note di contesto (non fanno parte della mail)

- **Indirizzo corretto il 14/08/2026**: `docs/DOMANDE_APERTE_07-08-2026.md` e `docs/PIANO_MIGRAZIONE_DICEMBRE_2026.md` riportavano `sales@a-cube.io` — verificato dal vivo sul sito ufficiale (`acubeapi.com`, footer e pagina `/contatti`): l'indirizzo reale è `info@acubeapi.com`, dominio diverso (`acubeapi.com`, non `a-cube.io`). Nessuna prova che `sales@a-cube.io` sia mai stato valido — probabile errore di trascrizione in una sessione precedente, non verificato allora contro una fonte primaria.
- **Perché inviarla ora, senza aspettare il numero esatto di scontrini/anno**: il piano di migrazione (`docs/PIANO_MIGRAZIONE_DICEMBRE_2026.md` §11) segnala i tempi di risposta commerciale di A-Cube come il rischio meno controllabile del piano — meglio far partire il primo contatto ora (con un volume indicativo, dichiarando esplicitamente che il dato ristorante seguirà) che aspettare di avere tutti i numeri esatti prima di scrivere. Il form ufficiale stesso non richiede volumi precisi per un primo contatto, solo per il preventivo finale.
- **Da completare prima dell'invio**: nome e cognome del titolare, telefono, email di riferimento — stesso schema di `docs/mail_statistiche_liguria.md`.
- **Prossimo passo dopo la risposta**: confrontare il preventivo con il costo/tempi di attivazione, poi decidere con il commercialista se estendere A-Cube anche alla fatturazione B2B (punto 0.4 del piano di migrazione) o tenere Fatture in Cloud.
