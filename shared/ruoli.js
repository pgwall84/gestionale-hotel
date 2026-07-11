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

  // Prenotazioni e ZTL — admin, titolare, receptionist, portiere notte
  prenotazioni:   [A, T, R, P],
  ztl:            [A, T, R, P],

  // Sezioni riservate ad admin e titolare
  archivio:       [A, T],
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
  return sezionePermessi.includes(ruolo);
}

module.exports = { RUOLI, PERMESSI_SEZIONI, puoAccedere };
