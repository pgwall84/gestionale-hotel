# Provisioning dipendenti — agosto 2026

> Genera questo elenco eseguendo `backend/scripts/provisionaDipendenti.js`
> (vedi istruzioni sotto). Questo file va aggiornato a mano dopo ogni
> esecuzione reale con `--apply` — non è generato automaticamente.

## Come eseguirlo

```bash
cd backend
node scripts/provisionaDipendenti.js            # anteprima, non scrive nulla
node scripts/provisionaDipendenti.js --apply     # scrive davvero nel DB
```

Esegui sempre prima **senza** `--apply`: lo script segnala con "ATTENZIONE"
ogni dipendente che sembra già esistere (per nome utente o per nome+cognome)
con un ruolo diverso da quello atteso, o un possibile doppione. Verifica a
mano quei casi prima di rilanciare con `--apply` — lo script non sovrascrive
mai un utente esistente da solo.

## Password di default

Tutti gli account creati da questo script hanno la password iniziale:

```
Hotel2026!
```

Da consegnare **a mano** (mai via email o chat) e da cambiare al primo
accesso da Sidebar ▸ icona chiave ▸ Cambia password (in fondo alla sidebar,
sia su desktop che nel pannello "Menu" mobile).

## Dipendenti reali (10)

| Nome utente | Nome e cognome | Ruolo |
|---|---|---|
| luigi.liquori | Luigi Liquori | Portiere di notte |
| annunziata.donato | Annunziata Donato | Cameriere |
| giovanna.tavoni | Giovanna Tavoni | Cameriere |
| renato.landucci | Renato Landucci | Cuoco |
| aracelisaltagracia.ramos | Aracelis Altagracia Ramos | Cameriere |
| dahiana.bonatimartinez | Dahiana Bonati Martinez | Cameriere |
| marco.spadavecchia | Marco Spadavecchia | Lavapiatti |
| anna.troise | Anna Troise | Cameriere |
| catia.giannetti | Catia Giannetti | Cuoco |
| raffaele.spinatelli | Raffaele Spinatelli | Portiere di notte |

## Account di test (7, uno per ruolo)

| Nome utente | Ruolo |
|---|---|
| admin_test | Admin |
| titolare_test | Titolare |
| receptionist_test | Receptionist |
| cameriere_test | Cameriere |
| cuoco_test | Cuoco |
| portiere_notte_test | Portiere di notte |
| lavapiatti_test | Lavapiatti |

## Esecuzione reale (13/08/2026, via tab Code)

17/17 account a posto: 11 creati ex novo (id 193–203) con la password di
default sopra, 6 già esistenti con un altro nome utente — rinominati a mano
da `/utenti` (stesso id, nessuna timbratura/turno storico spostato):
Luigi Liquori, Giovanna Tavoni, Renato Landucci, receptionist_test,
cameriere_test, cuoco_test. Login e cambio password verificati dal
titolare su un account nuovo — entrambi funzionanti.

## Note

- "Lavapiatti" è l'etichetta mostrata in UI per il ruolo interno
  `dipendente` (invariato nel database — vedi `shared/ruoli.js`). Non è
  stato creato un ottavo ruolo: decisione presa il 13/08/2026 per evitare
  di occupare permanentemente il nome "lavapiatti" nel caso di una futura
  assunzione generica diversa (es. giardiniere, manutentore).
- Il campo "Nome utente" nel form di creazione/modifica utenti
  (`/utenti` e `/personale`) è la stessa colonna `email` del database — non
  ha validazione di formato, quindi non serve un vero indirizzo email.
- Nessuna migration necessaria per questa fase: nessuno schema è cambiato.
