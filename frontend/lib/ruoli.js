// Copia del file shared/ruoli.js per il frontend.
// Contiene la stessa definizione dei ruoli e permessi usata dal backend,
// ma importabile direttamente nei componenti React senza dipendenze Node.js.
// Se aggiungi sezioni o ruoli, aggiorna entrambi i file.

export const RUOLI = {
  ADMIN:          'admin',
  TITOLARE:       'titolare',
  RECEPTIONIST:   'receptionist',
  CAMERIERE:      'cameriere',
  CUOCO:          'cuoco',
  PORTIERE_NOTTE: 'portiere_notte',
  DIPENDENTE:     'dipendente',
};

const TUTTI = Object.values(RUOLI);
const A = 'admin', T = 'titolare', R = 'receptionist';
const C = 'cameriere', K = 'cuoco', P = 'portiere_notte';

// Per ogni voce di menu, quali ruoli la vedono.
export const PERMESSI_SEZIONI = {
  home:           TUTTI,
  timbratura:     TUTTI,
  personale:      [A, T],
  utenti:         [A, T],
  haccp:          [A, T, K],
  magazzino:      [A, T, K, R, P],
  sala:           [A, T, C, P],
  cucina:         [A, T, K, P],
  menu:           [A, T, K, P],
  ristorante:     [A, T, C, K, P],
  prenotazioni:   [A, T, R, P],
  ztl:            [A, T, R, P],
  archivio:       [A, T],
  dashboard:      [A, T],
  impostazioni:   [A, T],
  hr_timbratura:  TUTTI,
  hr_ferie:       TUTTI,
  hr_bacheca:     TUTTI,
  hr_scadenze:    [A, T],
  hr_documenti:   [A, T],
  ristorante_prenotazioni: [A, T, R, P],
};

export function puoAccedere(ruolo, sezione) {
  const permessi = PERMESSI_SEZIONI[sezione];
  if (!permessi) return false;
  return permessi.includes(ruolo);
}
