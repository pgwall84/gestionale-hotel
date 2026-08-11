// Generatore delle righe "schedina" per WS_ALLOGGIATI (Polizia di Stato,
// Modulo 2.5 Fase 2) — tracciato record TABELLA 1 del manuale WS_ALLOGGIATI
// (docs/alloggiati web/MANUALEWS.pdf, pag. 19), 168 caratteri per riga.
// Copre SOLO le 20 camere hotel (non la Tabella 2 / Appartamento, rimandata
// a quando la casa in affitto sarà registrata sul portale — CLAUDE.md
// Sezione 16).
//
// Funzione pura, senza chiamate di rete: prende righe già risolte da SQL
// (soggiorno_ospiti JOIN soggiorni JOIN camere JOIN ospiti, stesso schema
// di caricaOspitiSoggiorniRange in ross1000Xml.js) e produce stringhe a
// lunghezza fissa esatta, oppure un avviso se mancano dati obbligatori —
// mai una riga fuori tracciato inviata al servizio.
//
// ATTENZIONE — assunzione da verificare col metodo Test prima di qualunque
// Send reale (11/08/2026): il manuale non specifica esplicitamente il
// carattere di riempimento per ogni campo. Qui si usa lo spazio per
// testo/codici (allineamento a sinistra) e lo zero per il numero di giorni
// di permanenza (numerico) — convenzione standard per tracciati a
// lunghezza fissa di questo tipo, ma mai verificata contro il servizio
// reale. Il metodo Test (manuale, Sezione 3.3, pag. 9) esiste apposta per
// verificarlo senza alcun rischio: nessuna schedina viene mai acquisita da
// quella chiamata, solo controllata nel formato.

const ITALIA_CODICE = '100000100'; // stessa costante già in uso in ross1000Xml.js
const TIPI_CON_DOCUMENTO = ['16', '17', '18']; // singolo, capofamiglia, capogruppo — per 19/20 il manuale dice "Riempire con Blank"

function padDestra(valore, lunghezza) {
  const s = String(valore ?? '').slice(0, lunghezza);
  return s + ' '.repeat(lunghezza - s.length);
}

function padSinistraZero(numero, lunghezza) {
  const s = String(numero ?? '');
  return s.padStart(lunghezza, '0').slice(-lunghezza);
}

// 'YYYY-MM-DD' (config/db.js restituisce le colonne DATE come stringa
// grezza, non oggetto Date — vedi commento lì, evita shift di timezone) →
// 'GG/MM/AAAA', formato richiesto dal tracciato.
function formatDataSchedina(data) {
  const s = String(data).slice(0, 10);
  const [aaaa, mm, gg] = s.split('-');
  return `${gg}/${mm}/${aaaa}`;
}

function calcolaGiorniPermanenza(dataArrivo, dataPartenza) {
  const arrivo = new Date(`${String(dataArrivo).slice(0, 10)}T00:00:00`);
  const partenza = new Date(`${String(dataPartenza).slice(0, 10)}T00:00:00`);
  return Math.round((partenza - arrivo) / 86400000);
}

// Elenco di ciò che manca secondo la matrice di obbligatorietà del
// manuale (varia per tipo_alloggiato) — mai un errore generico: la
// reception deve sapere ESATTAMENTE cosa completare in scheda ospite.
function campiObbligatoriMancanti(riga) {
  const mancanti = [];
  if (!riga.sesso) mancanti.push('sesso');
  if (!riga.data_nascita) mancanti.push('data di nascita');
  if (!riga.stato_nascita_codice) mancanti.push('stato di nascita');

  const nascitaItalia = riga.stato_nascita_codice === ITALIA_CODICE;
  if (nascitaItalia && !riga.comune_nascita_codice) mancanti.push('comune di nascita (obbligatorio se nato in Italia)');
  if (nascitaItalia && !riga.provincia_nascita) mancanti.push('provincia di nascita (obbligatorio se nato in Italia)');

  if (!riga.cittadinanza_codice) mancanti.push('cittadinanza');

  if (TIPI_CON_DOCUMENTO.includes(riga.tipo_alloggiato)) {
    if (!riga.documento_tipo_codice) mancanti.push('tipo documento');
    if (!riga.documento_numero) mancanti.push('numero documento');
    if (!riga.luogo_rilascio_codice) mancanti.push('luogo di rilascio documento');
  }
  return mancanti;
}

// Genera la riga a 168 caratteri per un singolo ospite, oppure
// { rigaSchedina: null, avviso } se mancano dati obbligatori o le date non
// sono valide — l'ospite viene escluso, mai una riga fuori tracciato.
function generaRigaSchedina(riga) {
  const etichetta = `${riga.cognome} ${riga.nome} (Camera ${riga.camera_numero ?? '?'})`;

  const mancanti = campiObbligatoriMancanti(riga);
  if (mancanti.length) {
    return { rigaSchedina: null, avviso: `${etichetta}: esclusa, mancano — ${mancanti.join(', ')}` };
  }

  const giorni = calcolaGiorniPermanenza(riga.data_arrivo, riga.data_partenza);
  if (giorni < 1) {
    return { rigaSchedina: null, avviso: `${etichetta}: esclusa, date di arrivo/partenza non valide` };
  }
  if (giorni > 30) {
    return {
      rigaSchedina: null,
      avviso: `${etichetta}: esclusa, soggiorno di ${giorni} notti — il tracciato ammette al massimo 30 giorni di permanenza per schedina (invii multipli non ancora implementati)`,
    };
  }

  const nascitaItalia = riga.stato_nascita_codice === ITALIA_CODICE;
  const conDocumento = TIPI_CON_DOCUMENTO.includes(riga.tipo_alloggiato);

  const campi = [
    padDestra(riga.tipo_alloggiato, 2),                                      // 2   — Tipo Alloggiato
    formatDataSchedina(riga.data_arrivo),                                    // 10  — Data Arrivo
    padSinistraZero(giorni, 2),                                              // 2   — Numero Giorni Permanenza
    padDestra(riga.cognome, 50),                                             // 50  — Cognome
    padDestra(riga.nome, 30),                                                // 30  — Nome
    riga.sesso === 'M' ? '1' : '2',                                          // 1   — Sesso
    formatDataSchedina(riga.data_nascita),                                   // 10  — Data Nascita
    padDestra(nascitaItalia ? riga.comune_nascita_codice : '', 9),           // 9   — Comune Nascita
    padDestra(nascitaItalia ? riga.provincia_nascita : '', 2),               // 2   — Provincia Nascita
    padDestra(riga.stato_nascita_codice, 9),                                 // 9   — Stato Nascita
    padDestra(riga.cittadinanza_codice, 9),                                  // 9   — Cittadinanza
    padDestra(conDocumento ? riga.documento_tipo_codice : '', 5),            // 5   — Tipo Documento
    padDestra(conDocumento ? riga.documento_numero : '', 20),                // 20  — Numero Documento
    padDestra(conDocumento ? riga.luogo_rilascio_codice : '', 9),            // 9   — Luogo Rilascio Documento
  ];                                                                          // === 168

  const rigaSchedina = campi.join('');
  if (rigaSchedina.length !== 168) {
    // Non dovrebbe mai succedere (padDestra/padSinistraZero garantiscono la
    // lunghezza di ogni campo) — se succede è un bug nel generatore: meglio
    // un errore esplicito che una riga silenziosamente fuori tracciato
    // verso la Polizia di Stato.
    throw new Error(`Riga schedina di ${rigaSchedina.length} caratteri invece di 168 per ${etichetta} — bug nel generatore, non inviare.`);
  }

  return { rigaSchedina, avviso: null };
}

// Genera tutte le righe per un soggiorno (una per ospite collegato tramite
// soggiorno_ospiti) — stesso pattern query di caricaOspitiSoggiorniRange in
// ross1000Xml.js. Riceve il pool come parametro (non lo importa da solo)
// per restare testabile senza DB nella funzione pura sopra.
async function generaSchedineSoggiorno(pool, soggiornoId) {
  const result = await pool.query(
    `SELECT so.tipo_alloggiato,
            s.data_arrivo, s.data_partenza,
            c.numero AS camera_numero,
            o.nome, o.cognome, o.sesso, o.data_nascita,
            o.stato_nascita_codice, o.comune_nascita_codice, o.provincia_nascita,
            o.cittadinanza_codice, o.documento_tipo_codice, o.documento_numero,
            o.luogo_rilascio_codice
     FROM soggiorno_ospiti so
     JOIN soggiorni s ON s.id = so.soggiorno_id
     JOIN camere c ON c.id = s.camera_id
     JOIN ospiti o ON o.id = so.ospite_id
     WHERE so.soggiorno_id = $1 AND s.cancellato = false`,
    [soggiornoId]
  );

  const righeSchedina = [];
  const avvisi = [];
  for (const riga of result.rows) {
    const { rigaSchedina, avviso } = generaRigaSchedina(riga);
    if (rigaSchedina) righeSchedina.push(rigaSchedina);
    if (avviso) avvisi.push(avviso);
  }
  return { righeSchedina, avvisi, totaleOspiti: result.rows.length };
}

module.exports = {
  generaRigaSchedina,
  generaSchedineSoggiorno,
  campiObbligatoriMancanti,
  calcolaGiorniPermanenza,
  formatDataSchedina,
  ITALIA_CODICE,
};
