// Definizione centralizzata dei ruoli e dei loro permessi.
// Questo file è in /shared/ perché viene usato sia dal backend (per verificare i permessi)
// sia dal frontend (per costruire il menu di navigazione dinamico).

const RUOLI = {
  ADMIN:          'admin',          // accesso completo a tutto
  TITOLARE:       'titolare',       // accesso alle pagine operative (cresce con i moduli)
  RECEPTIONIST:   'receptionist',
  CAMERIERE:      'cameriere',
  CUOCO:          'cuoco',
  PORTIERE_NOTTE: 'portiere_notte', // tutto tranne personale, archivio, impostazioni
  DIPENDENTE:     'dipendente',
};

// Shorthand per non ripetere la lista ogni volta
const TUTTI = Object.values(RUOLI);
const A  = RUOLI.ADMIN;
const T  = RUOLI.TITOLARE;
const R  = RUOLI.RECEPTIONIST;
const C  = RUOLI.CAMERIERE;
const K  = RUOLI.CUOCO;
const P  = RUOLI.PORTIERE_NOTTE;
const D  = RUOLI.DIPENDENTE;

// Per ogni sezione dell'app, quali ruoli possono accedervi.
// Il frontend usa questo oggetto per mostrare/nascondere le voci di menu.
// Il backend lo usa nei middleware per proteggere le route API.
const PERMESSI_SEZIONI = {
  // Pagine visibili a tutti i ruoli
  home:           TUTTI,
  timbratura:     TUTTI,

  // Gestione personale — solo admin e titolare
  personale:      [A, T],
  utenti:         [A, T],

  // HACCP — admin, titolare, cuoco
  haccp:          [A, T, K],

  // Magazzino — lettura e movimenti: admin, titolare, cuoco, receptionist, portiere notte
  // (anagrafica prodotti/fornitori e food cost restano riservati a admin/titolare — soloTitolare)
  magazzino:      [A, T, K, R, P],

  // Ristorante — tutte le figure operative tranne cuoco (vede cucina)
  sala:           [A, T, C, P],
  cucina:         [A, T, K, P],
  menu:           [A, T, K, P],
  ristorante:     [A, T, C, K, P],

  // ZTL — admin, titolare, receptionist, portiere notte
  ztl:            [A, T, R, P],

  // Prenotazioni (Fase 2) — permessi differenziati per azione, come 'ospiti'.
  // Caso speciale portiere_notte: NON è un ruolo con scrittura piena — può
  // fare SOLO la transizione di stato verso 'check_in' (check-in notturno),
  // nessun'altra transizione. Questo non si esprime con un array di ruoli
  // per sé: va combinato col valore di 'stato' richiesto nel body, vedi
  // richiedeTransizioneStato in backend/routes/prenotazioni.js, che usa
  // sia 'stato' (transizioni ordinarie) sia 'stato_check_in' (l'eccezione).
  prenotazioni: {
    lettura:         [A, T, R, P],
    scrittura:       [A, T, R],
    stato:           [A, T, R],
    stato_check_in:  [A, T, R, P],
    // Invio manuale di test delle email automatiche (modulo 5.3, 04/08/2026)
    // — bypassa date/stato reali, utile solo per verificare che il flusso
    // funzioni durante lo sviluppo. Riservato ad admin/titolare.
    test_email:      [A, T],
    // Invio manuale (reale, non di test) del link di pre check-in (modulo
    // 5.2 Fase B, 04/08/2026) — stessi ruoli di 'scrittura', la reception
    // deve poterlo mandare quando serve.
    invia_pre_checkin: [A, T, R],
  },

  // Ospiti (Fase 2) — permessi differenziati per azione (non un unico array
  // di sezione): admin/titolare/receptionist hanno lettura+scrittura+svela
  // documento, portiere_notte solo lettura (serve per check-in notturno),
  // mai svela documento. Vedi docs/PRENOTAZIONI_FASE2.md Parte A.1.
  ospiti: {
    lettura:          [A, T, R, P],
    scrittura:        [A, T, R],
    svela_documento:  [A, T, R],
  },

  // Soggiorni + Soggiorno_ospiti (Fase 2) — sezione unica (non due) perché
  // il contratto tratta PATCH /api/soggiorni/:id e i 3 endpoint
  // .../ospiti con permessi identici: admin/titolare/receptionist
  // lettura+scrittura, portiere_notte sola lettura (serve per consultare i
  // componenti gruppo/famiglia nel check-in notturno). Vedi
  // docs/PRENOTAZIONI_FASE2.md Parte A.3-A.4.
  soggiorni: {
    lettura:    [A, T, R, P],
    scrittura:  [A, T, R],
  },

  // Stato Camere — fermata/partenza/pronta/note (POST /api/camere/stato).
  // Estesa il 31/07/2026 da soloTitolare (solo admin/titolare) a includere
  // anche receptionist e portiere_notte, che gestiscono operativamente i
  // check-in/check-out e devono poter segnare lo stato camera. Cameriere
  // resta limitato a "segna pronta" (POST /api/camere/pronta, non gated da
  // questa sezione — vedi backend/routes/camere.js).
  //
  // 'anagrafica' (31/07/2026, task preliminare al modulo 2.3): creare/
  // modificare/attivare-disattivare una camera fisica. Riservata ad
  // admin/titolare — DELIBERATAMENTE più ristretta di 'scrittura' (che
  // arriva a receptionist/portiere_notte): chi gestisce lo stato
  // giornaliero non deve poter far sparire una camera dall'anagrafica.
  camere: {
    scrittura:   [A, T, R, P],
    anagrafica:  [A, T],
    // 'pulizia' (modulo 5.1, 03/08/2026): segnare una camera pulita/da
    // pulire (POST /api/camere/pronta). Prima non era ristretta a nessun
    // ruolo specifico — deciso dal titolare: tutti tranne cuoco (la
    // cameriera che pulisce è già 'cameriere', riusato, nessun nuovo ruolo
    // "governante" — stessa decisione presa in PRENOTAZIONI_FASE2.md).
    pulizia:     [A, T, R, C, P, D],
  },

  // Tipi camera, Tariffe, Pacchetti (Fase 2A, modulo 2.2) — stesso pattern di
  // 'ospiti'/'soggiorni': admin/titolare/receptionist in lettura (serve alla
  // reception per vedere/consultare i prezzi durante una prenotazione),
  // scrittura riservata ad admin/titolare (decisione di prezzo). Nessun
  // accesso per portiere_notte (come 'pagamenti' — non gli serve nel check-in
  // notturno). Vedi docs/PRENOTAZIONI_FASE2.md.
  tipi_camera: {
    lettura:    [A, T, R],
    scrittura:  [A, T],
  },
  tariffe: {
    lettura:    [A, T, R],
    scrittura:  [A, T],
  },
  pacchetti: {
    lettura:    [A, T, R],
    scrittura:  [A, T],
  },

  // Mappatura canali OTA (Modulo 2.3, Fase 1, 31/07/2026) — stesso pattern
  // di 'tariffe'/'tipi_camera': lettura anche a receptionist (consultazione),
  // scrittura riservata ad admin/titolare (configurazione).
  canali_ota: {
    lettura:    [A, T, R],
    scrittura:  [A, T],
  },

  // Tassa di soggiorno (Modulo 2.4, Fase 2A) — lettura/scrittura (calcolo e
  // riscossione) anche a receptionist, che gestisce il check-out; 'configurazione'
  // (nuova aliquota) riservata ad admin/titolare, stesso criterio di
  // 'tariffe'/'tipi_camera': è una decisione, non un'operazione di reception.
  tassa_soggiorno: {
    lettura:         [A, T, R],
    scrittura:       [A, T, R],
    configurazione:  [A, T],
  },

  // Alloggiati Web (Modulo 2.5, Fase 1b) — 'lettura' serve durante la
  // compilazione della scheda ospite (tendine nazionalità/documento),
  // stessi ruoli di 'ospiti'.lettura. 'sincronizza' tocca le credenziali
  // del servizio esterno: solo admin/titolare, come 'tassa_soggiorno'.configurazione.
  alloggiati: {
    lettura:      [A, T, R, P],
    sincronizza:  [A, T],
  },

  // Pulizie (Fase 2) — dipendente + receptionist segnano "fatta/da fare".
  // Vista non espone mai l'anagrafica ospite, solo tipo/completamento camera.
  pulizie:        [D, R],

  // Gruppi di prenotazione (Fase 2) — admin/titolare/receptionist lettura+
  // scrittura piena, portiere_notte sola lettura (consulta il gruppo durante
  // il check-in notturno, non lo modifica). Vedi
  // docs/PRENOTAZIONI_FASE2.md Parte A.6.
  gruppi: {
    lettura:    [A, T, R, P],
    scrittura:  [A, T, R],
  },

  // Pagamenti (Fase 2) — admin/titolare/receptionist lettura+scrittura,
  // portiere_notte NESSUN accesso (a differenza di 'gruppi': i totali
  // aggregati in GET /api/gruppi/:id sono un dato del gruppo, non un
  // accesso alla lista pagamenti in sé). Vedi
  // docs/PRENOTAZIONI_FASE2.md Parte A.5 e tabella riepilogativa.
  pagamenti: {
    lettura:    [A, T, R],
    scrittura:  [A, T, R],
  },

  // Testi delle email automatiche + footer comune (Modulo 5.3, estensione
  // 04/08/2026, richiesta esplicita del titolare) — configurazione, non
  // operatività quotidiana: riservata ad admin/titolare, come 'tariffe'/
  // 'tassa_soggiorno'.configurazione.
  email_template: {
    lettura:    [A, T],
    scrittura:  [A, T],
  },

  // Offerte dedicate via email (Modulo 5.3, estensione 04/08/2026) — invio
  // verso clienti con consenso marketing, riservato ad admin/titolare.
  offerte_email: {
    lettura:    [A, T],
    scrittura:  [A, T],
  },

  // Export ROSS1000/ISTAT (Modulo 2.6, Fase 1 — 04/08/2026): solo
  // generazione XML per verifica manuale, nessun invio reale. Dati di
  // pubblica sicurezza/statistica, riservato ad admin/titolare.
  ross1000: {
    lettura: [A, T],
  },

  // Pre check-in self-service (Modulo 5.2 Fase B, 04/08/2026) — coda di
  // revisione lato reception: stessi ruoli di 'ospiti' (chi può scrivere
  // ospiti può applicare/scartare una richiesta). Il form pubblico
  // (backend/routes/preCheckinPubblico.js) non passa da qui: nessuna
  // autenticazione, protetto solo dal token nel link.
  pre_checkin: {
    lettura:    [A, T, R],
    scrittura:  [A, T, R],
  },

  // Nuclei familiari (Modulo 5.2 Fase B, estensione 04/08/2026) — stessi
  // permessi di 'ospiti': lettura anche a portiere_notte (consultazione),
  // scrittura ad admin/titolare/receptionist.
  nuclei_familiari: {
    lettura:    [A, T, R, P],
    scrittura:  [A, T, R],
  },

  // Manutenzione/guasti (nuovo modulo, 06/08/2026) — tutto il personale può
  // segnalare (crea) e vedere le segnalazioni (lettura, trasparenza ed
  // evita doppie segnalazioni sullo stesso guasto); solo admin/titolare
  // aggiornano lo stato (gestione: presa in carico, risoluzione) —
  // decisione esplicita del titolare.
  manutenzione: {
    lettura:  TUTTI,
    crea:     TUTTI,
    gestione: [A, T],
  },

  // Sezioni riservate ad admin e titolare
  archivio:       [A, T, R],
  dashboard:      [A, T],
  impostazioni:   [A, T],

  // Sezioni HR interne (usate dai middleware API, non dal menu)
  hr_timbratura:  TUTTI,
  hr_ferie:       TUTTI,
  hr_bacheca:     TUTTI,
  hr_scadenze:    [A, T],
  hr_documenti:   [A, T],
  ristorante_prenotazioni: [A, T, R, P],
};

// Controlla se un ruolo ha accesso a una sezione specifica.
// Usato nei middleware del backend: se ritorna false, la richiesta viene bloccata con 403.
function puoAccedere(ruolo, sezione) {
  const sezionePermessi = PERMESSI_SEZIONI[sezione];
  if (!sezionePermessi) return false;
  if (Array.isArray(sezionePermessi)) return sezionePermessi.includes(ruolo);
  // Sezione con permessi differenziati per azione (es. 'ospiti'): senza
  // un'azione esplicita non si può concedere accesso, usare puoCompiereAzione.
  return false;
}

// Controlla se un ruolo può compiere una specifica azione dentro una sezione
// che ha permessi differenziati (es. ospiti: lettura vs scrittura vs
// svela_documento). Per le sezioni con un unico array di ruoli, l'azione
// viene ignorata e si ricade sullo stesso comportamento di puoAccedere.
function puoCompiereAzione(ruolo, sezione, azione) {
  const sezionePermessi = PERMESSI_SEZIONI[sezione];
  if (!sezionePermessi) return false;
  if (Array.isArray(sezionePermessi)) return sezionePermessi.includes(ruolo);
  const permessiAzione = sezionePermessi[azione];
  if (!Array.isArray(permessiAzione)) return false;
  return permessiAzione.includes(ruolo);
}

module.exports = { RUOLI, PERMESSI_SEZIONI, puoAccedere, puoCompiereAzione };
