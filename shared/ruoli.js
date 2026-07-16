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
  },

  // Ospiti (Fase 2) — permessi differenziati per azione (non un unico array
  // di sezione): admin/titolare/receptionist hanno lettura+scrittura+svela
  // documento, portiere_notte solo lettura (serve per check-in notturno),
  // mai svela documento. Vedi docs/API_PRENOTAZIONI_FASE2.md Sezione 1.
  ospiti: {
    lettura:          [A, T, R, P],
    scrittura:        [A, T, R],
    svela_documento:  [A, T, R],
  },

  // Pulizie (Fase 2) — dipendente + receptionist segnano "fatta/da fare".
  // Vista non espone mai l'anagrafica ospite, solo tipo/completamento camera.
  pulizie:        [D, R],

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
