# Design — Booking Engine Diretto (sito-hotel → gestionale)

Data: 19/08/2026
Stato: approvato da Marco in sessione di brainstorming, in attesa di piano di implementazione.

## Contesto

Il widget di prenotazione TeamSystem Hospitality incorporato nel sito (repo
`sito-hotel`, modulo 1.11) è attualmente fuori servizio. WuBook/WooDoo e
RoomCloud sono stati esclusi come canale per il booking engine (accettano
solo fornitori certificati con portafoglio multi-cliente, non un singolo
hotel con gestionale proprio — vedi conversazione di sessione). Beds24 è
stato scelto per la sola sincronizzazione OTA (channel manager), ma è
**fuori scope da questo documento**: è un sottosistema indipendente, con
uno spec separato successivo.

Il gestionale (repo `gestionale-hotel`) è già in produzione su VPS con
HTTPS (`hdgolfo-gestionale.com`, modulo 1.10). Il sito (repo `sito-hotel`)
è su Vercel con dominio provvisorio (`sito-hotel-five.vercel.app`); la
migrazione al dominio definitivo è in corso (chiave di livello 1 ottenuta,
manca la chiave email).

## Scope

Dentro: disponibilità camere in tempo reale sul sito, prenotazione diretta
con blocco camera, pagamento di una caparra del 30% via Stripe, conferma
automatica e passaggio al flusso di pre check-in già esistente.

Fuori: sincronizzazione OTA/Beds24 (spec separato), sconto 10% per
pagamento totale anticipato (idea futura, non ora), addebito automatico
del saldo prima dell'arrivo (scartato — vedi sotto), pre-autorizzazione
carta a livello di prenotazione (scartata — le autorizzazioni carta non
reggono per prenotazioni con largo anticipo).

## Pagamento

- Caparra: 30% del totale, addebitata subito via Stripe (PaymentIntent).
- Saldo: 70% restante, incassato in hotel al check-out con il POS Nexi già
  in uso in reception — nessuno sviluppo aggiuntivo per il saldo.
- Nessun dato di carta salvato lato gestionale: passa solo da Stripe
  (PCI scope minimo).
- Nexi resta un binario parallelo per il futuro (in attesa di risposta
  del loro supporto sulle API key), non blocca questo sviluppo.

## Architettura

Nessun servizio intermedio. Il sito (Next.js/Vercel) chiama direttamente
nuove route pubbliche non autenticate sul backend Express esistente dello
stesso gestionale — stesso pattern già in produzione per
`/pre-checkin-pubblico` (modulo 5.2 Fase B).

Un servizio intermedio separato è stato scartato: aggiunge un deployment e
una superficie di validazione duplicata per un guadagno di sicurezza
marginale, dato che il gestionale ha già rotte pubbliche con lo stesso
profilo di rischio, verificate nell'audit del 09/08/2026.

### Componenti / endpoint nuovi (gestionale)

- `GET /api/booking-pubblico/disponibilita` — riceve check-in, check-out,
  numero ospiti. Riusa il motore tariffe/stagionalità/pacchetti del
  modulo 2.2. Ritorna i tipi di camera disponibili con prezzo.
- `POST /api/booking-pubblico/prenota` — riceve dati ospite minimi (nome,
  email, telefono) + camera scelta. Esegue il blocco camera in modo
  **atomico** (verifica disponibilità e riserva nella stessa operazione,
  non in due passaggi separati — altrimenti due richieste concorrenti
  potrebbero superare entrambe il controllo). Se il blocco riesce, crea il
  PaymentIntent Stripe per il 30% e ritorna il `client_secret` al
  frontend. Se la camera non è più disponibile, errore immediato, prima
  che l'ospite inserisca la carta.
- `POST /api/stripe/webhook` — endpoint dedicato, mai chiamato dal
  frontend. Verifica obbligatoriamente la firma della richiesta Stripe
  (senza questo controllo chiunque potrebbe confermare prenotazioni senza
  aver pagato). Alla conferma: passa la prenotazione a stato "confermata"
  e scatena l'invio automatico dell'email di pre check-in già esistente
  (modulo 5.2 Fase B, via Resend).

### Riuso esplicito (niente scritto da capo)

Motore tariffe/stagionalità/pacchetti (modulo 2.2), state machine
prenotazioni/soggiorni (Fase 2A) per blocco e conferma, pipeline email di
pre check-in via Resend (modulo 5.2 Fase B) per la raccolta dati
anagrafici/documento — il form di prenotazione sul sito NON raccoglie
questi dati, solo nome/email/telefono/date/camera/ospiti.

### Nota per il piano di implementazione

Da verificare leggendo `docs/PRENOTAZIONI_FASE2.md`: la dashboard ha già
un alert su "opzioni prenotazione in scadenza 48h", quindi potrebbe già
esistere uno stato tipo "opzione" con scadenza nella state machine. Se
compatibile, il blocco breve di questo booking engine (TTL ~15 minuti)
dovrebbe riusare quello stato con un TTL più corto, invece di introdurne
uno nuovo. Non è stato verificato in questa sessione di brainstorming.

## Flusso completo

1. Ospite seleziona date/camera → `GET disponibilita` (nessun blocco,
   solo lettura).
2. Ospite compila dati minimi e conferma → `POST prenota`: blocco atomico
   camera (TTL 15 minuti) + creazione PaymentIntent Stripe.
3. Ospite paga la caparra sul checkout Stripe.
4. Stripe invia il webhook → backend verifica la firma → prenotazione
   passa a "confermata" → email di pre check-in inviata.
5. Se l'ospite abbandona il pagamento, il blocco scade dopo 15 minuti e la
   camera torna disponibile automaticamente.

### Caso limite: blocco scaduto ma pagamento arrivato comunque

Decisione di Marco (19/08/2026): **rimborso automatico**, nessuna
eccezione per onorare la prenotazione fuori dalla finestra di 15 minuti.
Notifica automatica all'ospite. Non è un problema tecnico da risolvere con
più complessità, è una policy commerciale scelta deliberatamente semplice.

## Sicurezza

Le due route pubbliche (`disponibilita`, `prenota`) sono le prime API del
gestionale raggiungibili da chiunque su internet senza nemmeno un token,
non solo da chi possiede un link di pre check-in come oggi — serve rate
limiting dedicato. Validazione input rigorosa lato backend, come da
convenzione di progetto. Verifica firma webhook Stripe obbligatoria, non
opzionale. Essendo un modulo che tocca soldi e dati ospite, rientra nel
mini-audit di sicurezza mirato previsto da CLAUDE.md Sezione 7 — da fare
esplicitamente prima del go-live pubblico, non rimandabile.

## Configurazione / portabilità dominio

URL di redirect Stripe (successo/annullo) e whitelist CORS sul gestionale
devono essere parametrizzati via variabile d'ambiente, non hardcoded — il
sito è oggi su dominio Vercel provvisorio, la migrazione al dominio
definitivo (`hoteldelgolfolerici.com`) è in corso separatamente e non deve
richiedere modifiche al codice del booking engine quando completata.

## Rollout

Il widget TeamSystem è già fuori servizio, quindi non c'è una baseline
funzionante da proteggere con un percorso nascosto/beta in parallelo.
Sequenza: costruire, testare end-to-end (sito Vercel + gestionale VPS,
Stripe in modalità test), verificare a fondo, **poi** collegare il
risultato al posto del widget morto — non sviluppare direttamente sulla
pagina pubblica.

Nota separata, non bloccante per questo sviluppo ma urgente di per sé: il
widget TS fuori servizio potrebbe già costare prenotazioni dirette perse
se il sito riceve traffico. Da verificare/segnalare a TeamSystem
indipendentemente da questo progetto.

## Testing

Test API (Jest + Supertest, convenzione di progetto) sulle due route
pubbliche, incluso un test di concorrenza esplicito: due richieste
simultanee sulla stessa camera, solo una deve riuscire a bloccarla.
Simulazione di eventi webhook Stripe firmati (Stripe fornisce eventi di
test). Smoke test end-to-end (Playwright) in modalità test Stripe una
volta collegati sito e gestionale.
