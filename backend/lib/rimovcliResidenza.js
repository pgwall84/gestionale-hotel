// Mappatura codici residenza (Alloggiati Web, 9 cifre — colonne
// stato_residenza_codice/comune_residenza_codice di 'ospiti', migration 029)
// verso i codici ISTAT a 3 cifre richiesti da RIMOVCLI/ModelloC59.xsd
// (attributo rigac59@residenza: 3 cifre, provincia se nazione="i", stato
// estero se nazione="e").
//
// Fonti (nessuna generata da questo modulo, tutte già nel repo):
// - docs/alloggiati web/comuni.csv  — Codice(9 cifre),Descrizione,Provincia(sigla 2 lettere),DataFineVal
// - docs/alloggiati web/stati.csv   — Codice(9 cifre),Descrizione,Provincia,DataFineVal (Alloggiati Web)
// - docs/rimovcli/ISTAT - PROVINCE.XLSX  → convertito qui in province.json (sigla → codice provincia 3 cifre)
// - docs/rimovcli/stati esteri excel.xls → convertito qui in stati_esteri.json (nome paese → codice 3 cifre)
//
// Percorso a due salti per l'Italia: comune_residenza_codice (9 cifre) →
// comuni.csv → sigla provincia (es. "SP") → province.json → codice
// provincia ISTAT 3 cifre (es. "011"). Per l'estero: stato_residenza_codice
// (9 cifre) → stati.csv → nome paese (Alloggiati Web) → normalizzato e
// confrontato contro stati_esteri.json → codice 3 cifre.
//
// Mai un abbinamento indovinato: se un passaggio fallisce, si restituisce
// {errore: '...'} invece di un codice a caso — stesso principio già usato
// in ross1000Xml.js per gli ospiti con dati obbligatori mancanti (escludere
// segnalando, non generare un XML potenzialmente sbagliato).

const fs = require('fs');
const path = require('path');

const CODICE_ITALIA_ALLOGGIATI = '100000100'; // vedi ross1000Xml.js, stesso valore

let _comuniMap = null;   // codice(9 cifre) -> { descrizione, provinciaSigla }
let _statiMap = null;    // codice(9 cifre) -> descrizione
let _provinceBySigla = null; // sigla(2 lettere) -> codice(3 cifre)
let _stateriByNomeNormalizzato = null; // nome normalizzato -> codice(3 cifre)

function normalizzaNome(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/\([^)]*\)/g, '')   // rimuove eventuali parentesi ("incluso Hong Kong" ecc.)
    .replace(/['’]/g, ' ')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Alias per i nomi Alloggiati Web che non coincidono testualmente con la
// tabella ufficiale ISTAT (stati esteri excel.xls) — costruito a mano sui
// casi noti più comuni per un hotel in Liguria (Europa + Nord America);
// un paese non elencato qui e non risolto dalla normalizzazione base va a
// 'errore', mai indovinato. Da ampliare quando emergono casi reali negli
// avvisi.
const ALIAS_STATI = {
  'STATI UNITI D AMERICA': 'STATI UNITI D AMERICA',
  'U S A': 'STATI UNITI D AMERICA',
  'GRAN BRETAGNA': 'REGNO UNITO',
  'REGNO UNITO DI GRAN BRETAGNA E IRLANDA DEL NORD': 'REGNO UNITO',
  'INGHILTERRA': 'REGNO UNITO',
  'CINA REPUBBLICA POPOLARE': 'CINA',
  'REPUBBLICA CECA': 'REPUBBLICA CECA',
  'CECOSLOVACCHIA': 'REPUBBLICA CECA',
  'OLANDA': 'PAESI BASSI',
  'SVIZZERA': 'SVIZZERA',
};

function caricaCsvAlloggiati(nomeFile) {
  const p = path.join(__dirname, '..', '..', 'docs', 'alloggiati web', nomeFile);
  const testo = fs.readFileSync(p, 'utf8');
  const righe = testo.split(/\r?\n/).filter(Boolean);
  righe.shift(); // header
  return righe.map(r => {
    const campi = r.split(',');
    return { codice: campi[0], descrizione: campi[1], provincia: campi[2] };
  });
}

function caricaJsonRimovcli(nomeFile) {
  const p = path.join(__dirname, '..', '..', 'docs', 'rimovcli', nomeFile);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function assicuraCaricato() {
  if (_comuniMap) return;

  const comuni = caricaCsvAlloggiati('comuni.csv');
  _comuniMap = new Map();
  for (const c of comuni) {
    _comuniMap.set(c.codice, { descrizione: c.descrizione, provinciaSigla: (c.provincia || '').trim().toUpperCase() });
  }

  const stati = caricaCsvAlloggiati('stati.csv');
  _statiMap = new Map();
  for (const s of stati) {
    _statiMap.set(s.codice, s.descrizione);
  }

  const province = caricaJsonRimovcli('province.json');
  _provinceBySigla = new Map();
  for (const p of province) {
    _provinceBySigla.set(p.sigla.toUpperCase(), p.codice);
  }

  const statiEsteri = caricaJsonRimovcli('stati_esteri.json').filter(s => s.codice !== '888'); // 888 = riga di totale, non un paese
  _stateriByNomeNormalizzato = new Map();
  for (const s of statiEsteri) {
    _stateriByNomeNormalizzato.set(normalizzaNome(s.descrizione), s.codice);
  }
}

// Risolve un ospite (dati già letti dal DB) in { nazione: 'i'|'e', residenza: 'XXX' }
// oppure { errore: 'motivo leggibile' } se un passaggio non è risolvibile.
function risolviResidenza({ stato_residenza_codice, comune_residenza_codice }) {
  assicuraCaricato();

  if (!stato_residenza_codice) {
    return { errore: 'stato di residenza mancante' };
  }

  const nomeStato = _statiMap.get(stato_residenza_codice);
  if (!nomeStato) {
    return { errore: `codice stato di residenza "${stato_residenza_codice}" non trovato in docs/alloggiati web/stati.csv` };
  }

  if (stato_residenza_codice === CODICE_ITALIA_ALLOGGIATI) {
    if (!comune_residenza_codice) {
      return { errore: 'residente in Italia ma comune di residenza mancante' };
    }
    const comune = _comuniMap.get(comune_residenza_codice);
    if (!comune) {
      return { errore: `codice comune di residenza "${comune_residenza_codice}" non trovato in docs/alloggiati web/comuni.csv` };
    }
    const codiceProvincia = _provinceBySigla.get(comune.provinciaSigla);
    if (!codiceProvincia) {
      return { errore: `provincia "${comune.provinciaSigla}" (comune ${comune.descrizione}) non trovata nella tabella ISTAT province` };
    }
    return { nazione: 'i', residenza: codiceProvincia };
  }

  const normalizzato = normalizzaNome(nomeStato);
  const nomeCercato = ALIAS_STATI[normalizzato] ? normalizzaNome(ALIAS_STATI[normalizzato]) : normalizzato;
  const codiceStatoEstero = _stateriByNomeNormalizzato.get(nomeCercato);
  if (!codiceStatoEstero) {
    return { errore: `stato estero "${nomeStato}" (codice Alloggiati ${stato_residenza_codice}) non riconosciuto nella tabella ISTAT stati esteri — aggiungere un alias in ALIAS_STATI se il nome è solo scritto diversamente` };
  }
  return { nazione: 'e', residenza: codiceStatoEstero };
}

module.exports = { risolviResidenza, normalizzaNome, CODICE_ITALIA_ALLOGGIATI, _test: { assicuraCaricato } };
