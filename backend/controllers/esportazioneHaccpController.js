// Controller export HACCP — sessione 4 (16/08/2026). Sostituisce l'export
// "ispezione" ad-hoc costruito in una sessione precedente (intestazioni
// italiane inventate, solo 5 registri su 8) con un export fedele al template
// ufficiale del titolare (`docs/HACCP/registri_HACCP_A1_A8.xlsx`): stesso
// nome foglio, stesse intestazioni di colonna ESATTE (lette dal file con
// openpyxl, non tradotte/abbellite — è la richiesta esplicita "formato
// esatto del template"), sia per l'export di un singolo registro che per
// quello omnicomprensivo (tutti gli 8 fogli in un unico file).
//
// REGISTRI è la fonte unica di verità: un oggetto per singolo export
// (GET /export/:registro/excel, /export/:registro/dati per il PDF lato
// client) e per l'omnicomprensivo (un giro su tutte le chiavi). Aggiungere
// un nono registro in futuro significa aggiungere una voce qui, non
// duplicare query in quattro punti diversi.

const pool = require('../config/db');
const { fuoriSoglia, fuoriSogliaBuffet } = require('./registroHaccpController');

const NOME = (nome, cognome) => (nome ? `${nome} ${cognome || ''}`.trim() : '');
const SI_NO = (v) => (v ? 'Sì' : 'No');
const D = (v) => (v == null ? '' : v); // valore grezzo, xlsx/jsPDF sanno gestire Date/numeri; null → cella vuota

const LIMITE_TEMPERATURA = { frigo: '≤ +4°C', freezer: '≤ −18°C' };
const LIMITE_BUFFET = { freddo: '≤ +5°C', caldo: '≥ +60°C' };
const ESITO_SOGLIA = (fuori) => (fuori === true ? 'Fuori limite' : fuori === false ? 'Conforme' : '');

const REGISTRI = {
  A1_Ricevimento_merci: {
    label: 'A.1 — Ricevimento merci',
    headers: ['id_riga', 'data', 'fornitore', 'prodotto', 'lotto', 'scadenza_tmc', 'quantita', 'unita_misura', 'temp_ricevimento', 'integrita_confezione', 'esito', 'azione_correttiva', 'operatore', 'note'],
    async fetchRows(da, a) {
      const r = await pool.query(
        `SELECT rm.*, u.nome, u.cognome FROM registro_ricevimento_merci rm
         LEFT JOIN users u ON u.id = rm.user_id
         WHERE rm.data BETWEEN $1 AND $2 ORDER BY rm.data, rm.created_at`,
        [da, a]
      );
      return r.rows.map(x => [
        x.id, D(x.data), x.fornitore, x.prodotto, D(x.lotto), D(x.scadenza_tmc),
        x.quantita != null ? parseFloat(x.quantita) : '', D(x.unita_misura),
        x.temp_ricevimento != null ? parseFloat(x.temp_ricevimento) : '', D(x.integrita_confezione),
        x.esito, D(x.azione_correttiva), NOME(x.nome, x.cognome), D(x.note),
      ]);
    },
  },

  A2_Temp_frigo_freezer: {
    label: 'A.2 — Temperature frigo/freezer',
    headers: ['id_riga', 'data', 'ora', 'apparecchio', 'tipo_apparecchio', 'ubicazione', 'temp_rilevata', 'limite_critico', 'esito', 'azione_correttiva', 'operatore', 'note'],
    // Solo frigo/freezer, coerente col nome del foglio — l'abbattitore (letto
    // ma senza soglia statica, vedi registroHaccpController.js) non ci sta:
    // il suo controllo è a tempo, un giorno avrà un foglio/registro dedicato.
    async fetchRows(da, a) {
      const r = await pool.query(
        `SELECT t.*, u.nome, u.cognome, a2.nome AS apparecchio_nome, a2.tipo AS apparecchio_tipo, a2.ubicazione AS apparecchio_ubicazione
         FROM registro_temperature t
         LEFT JOIN users u ON u.id = t.user_id
         LEFT JOIN apparecchiature_haccp a2 ON a2.id = t.apparecchiatura_id
         WHERE t.data BETWEEN $1 AND $2 AND a2.tipo IN ('frigo', 'freezer')
         ORDER BY t.data, t.ora`,
        [da, a]
      );
      return r.rows.map(x => [
        x.id, D(x.data), x.ora?.slice(0, 5) || '', D(x.apparecchio_nome), D(x.apparecchio_tipo), D(x.apparecchio_ubicazione),
        parseFloat(x.valore), LIMITE_TEMPERATURA[x.apparecchio_tipo] || '',
        ESITO_SOGLIA(fuoriSoglia(x.apparecchio_tipo, x.valore)), D(x.azione_correttiva),
        NOME(x.nome, x.cognome), D(x.note),
      ]);
    },
  },

  A3_Temp_cottura: {
    label: 'A.3 — Temperature cottura',
    headers: ['id_riga', 'data', 'prodotto', 'lotto_partita', 'temp_cuore_rilevata', 'limite_critico', 'tempo_cottura_min', 'esito', 'azione_correttiva', 'operatore', 'note'],
    // Solo tipo='cottura': lo scongelamento non ha una temperatura al cuore
    // da valutare contro un limite critico, non appartiene a questo foglio.
    async fetchRows(da, a) {
      const r = await pool.query(
        `SELECT c.*, u.nome, u.cognome FROM registro_cottura c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.data BETWEEN $1 AND $2 AND c.tipo = 'cottura'
         ORDER BY c.data, c.ora`,
        [da, a]
      );
      // "esito" non è una colonna (nessun campo categoria per calcolarlo,
      // vedi migration 045): vuoto se limite_critico non è stato compilato
      // dall'operatore, altrimenti lasciato alla lettura umana del limite.
      return r.rows.map(x => [
        x.id, D(x.data), x.prodotto, D(x.lotto_partita),
        x.temperatura_cuore != null ? parseFloat(x.temperatura_cuore) : '', D(x.limite_critico),
        x.tempo_cottura_min != null ? parseFloat(x.tempo_cottura_min) : '', '', D(x.azione_correttiva),
        NOME(x.nome, x.cognome), D(x.note),
      ]);
    },
  },

  A4_Temp_buffet: {
    label: 'A.4 — Temperature buffet',
    headers: ['id_riga', 'data', 'ora', 'tipologia_buffet', 'prodotto_vaschetta', 'temp_rilevata', 'limite_critico', 'esito', 'azione_correttiva', 'operatore', 'note'],
    async fetchRows(da, a) {
      const r = await pool.query(
        `SELECT b.*, u.nome, u.cognome FROM registro_buffet b
         LEFT JOIN users u ON u.id = b.user_id
         WHERE b.data BETWEEN $1 AND $2 ORDER BY b.data, b.ora`,
        [da, a]
      );
      return r.rows.map(x => [
        x.id, D(x.data), x.ora?.slice(0, 5) || '', x.tipologia_buffet, x.prodotto_vaschetta,
        parseFloat(x.temp_rilevata), LIMITE_BUFFET[x.tipologia_buffet] || '',
        ESITO_SOGLIA(fuoriSogliaBuffet(x.tipologia_buffet, x.temp_rilevata)), D(x.azione_correttiva),
        NOME(x.nome, x.cognome), D(x.note),
      ]);
    },
  },

  A5_Pulizie: {
    label: 'A.5 — Pulizie e sanificazione',
    headers: ['id_riga', 'data', 'ora', 'area_attrezzatura', 'operatore', 'prodotto_utilizzato', 'dosaggio', 'tempo_contatto_min', 'esito', 'firma_operatore', 'firma_responsabile', 'note'],
    // "firma_operatore" = chi ha salvato la checklist del giorno (user_id):
    // attribuzione a livello di giornata, non riga per riga — limite già
    // documentato in EVOLUTIVE.md dalla sessione che ha introdotto la voce
    // "Compilata da", non risolto qui.
    async fetchRows(da, a) {
      const r = await pool.query(
        `SELECT h.*, u.nome, u.cognome FROM haccp_checklist h
         LEFT JOIN users u ON u.id = h.user_id
         WHERE h.data BETWEEN $1 AND $2 ORDER BY h.data, h.attrezzatura`,
        [da, a]
      );
      return r.rows.map(x => [
        x.id, D(x.data), x.ora?.slice(0, 5) || '', x.attrezzatura, NOME(x.nome, x.cognome),
        D(x.prodotto_utilizzato), D(x.dosaggio), x.tempo_contatto_min != null ? parseFloat(x.tempo_contatto_min) : '',
        x.completata ? 'Eseguita' : 'Non eseguita', NOME(x.nome, x.cognome), D(x.firma_responsabile), D(x.note),
      ]);
    },
  },

  A6_Manutenzioni: {
    label: 'A.6 — Manutenzioni programmate',
    headers: ['id_riga', 'data', 'attrezzatura', 'ubicazione', 'tipo_intervento', 'descrizione_intervento', 'ditta_operatore', 'pezzi_sostituiti', 'esito', 'prossima_manutenzione', 'firma_responsabile', 'note'],
    async fetchRows(da, a) {
      const r = await pool.query(
        `SELECT m.*, a2.nome AS apparecchio_nome, a2.ubicazione AS apparecchio_ubicazione
         FROM registro_manutenzioni m
         LEFT JOIN apparecchiature_haccp a2 ON a2.id = m.apparecchiatura_id
         WHERE m.data BETWEEN $1 AND $2 ORDER BY m.data, m.created_at`,
        [da, a]
      );
      return r.rows.map(x => [
        x.id, D(x.data), D(x.apparecchio_nome), D(x.apparecchio_ubicazione), D(x.tipo_intervento),
        D(x.descrizione_intervento), D(x.ditta_operatore), D(x.pezzi_sostituiti),
        x.esito === 'eseguita' ? 'Eseguita' : 'Non eseguita', D(x.prossima_manutenzione),
        D(x.firma_responsabile), D(x.note),
      ]);
    },
  },

  A7_Formazione: {
    label: 'A.7 — Formazione',
    headers: ['id_riga', 'data', 'nome_cognome', 'qualifica_ruolo', 'titolo_corso', 'durata_ore', 'contenuti', 'docente_ente', 'attestato', 'numero_attestato', 'firma_partecipante', 'note'],
    async fetchRows(da, a) {
      const r = await pool.query(
        `SELECT * FROM registro_formazione WHERE data BETWEEN $1 AND $2 ORDER BY data, created_at`,
        [da, a]
      );
      return r.rows.map(x => [
        x.id, D(x.data), x.nome_cognome, D(x.qualifica_ruolo), x.titolo_corso,
        x.durata_ore != null ? parseFloat(x.durata_ore) : '', D(x.contenuti), D(x.docente_ente),
        SI_NO(x.attestato), D(x.numero_attestato), SI_NO(x.firma_partecipante), D(x.note),
      ]);
    },
  },

  A8_Infestanti: {
    label: 'A.8 — Controllo infestanti',
    headers: ['id_riga', 'data', 'tipo_controllo', 'punti_controllati', 'esito', 'azioni_effettuate', 'prossimo_controllo', 'firma_operatore', 'firma_responsabile', 'note'],
    async fetchRows(da, a) {
      const r = await pool.query(
        `SELECT i.*, u.nome, u.cognome FROM registro_infestanti i
         LEFT JOIN users u ON u.id = i.user_id
         WHERE i.data BETWEEN $1 AND $2 ORDER BY i.data, i.created_at`,
        [da, a]
      );
      return r.rows.map(x => [
        x.id, D(x.data), D(x.tipo_controllo), D(x.punti_controllati),
        x.esito === 'nessuna_traccia' ? 'Nessuna traccia' : 'Presenza rilevata',
        D(x.azioni_effettuate), D(x.prossimo_controllo), NOME(x.nome, x.cognome), D(x.firma_responsabile), D(x.note),
      ]);
    },
  },
};

function validaRegistro(chiave) {
  return Object.prototype.hasOwnProperty.call(REGISTRI, chiave);
}

// GET /api/registro-haccp/export/:registro/dati?da=&a= — righe + intestazioni
// per il singolo registro, usate dal frontend per costruire il PDF lato
// client (stesso pattern jsPDF già in uso nel resto del modulo).
async function datiRegistro(req, res) {
  const { registro } = req.params;
  const { da, a } = req.query;
  if (!validaRegistro(registro)) {
    return res.status(404).json({ errore: 'Registro non riconosciuto.' });
  }
  if (!da || !a) {
    return res.status(400).json({ errore: 'Parametri da e a (date) obbligatori.' });
  }
  try {
    const def = REGISTRI[registro];
    const righe = await def.fetchRows(da, a);
    res.json({ registro, label: def.label, headers: def.headers, righe });
  } catch (err) {
    console.error(`Errore dati export ${registro}:`, err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/registro-haccp/export/:registro/excel?da=&a= — un foglio, nome e
// intestazioni ESATTAMENTE come nel template.
async function excelRegistro(req, res) {
  const { registro } = req.params;
  const { da, a } = req.query;
  if (!validaRegistro(registro)) {
    return res.status(404).json({ errore: 'Registro non riconosciuto.' });
  }
  if (!da || !a) {
    return res.status(400).json({ errore: 'Parametri da e a (date) obbligatori.' });
  }
  try {
    const def = REGISTRI[registro];
    const righe = await def.fetchRows(da, a);
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([def.headers, ...righe]);
    XLSX.utils.book_append_sheet(wb, ws, registro.slice(0, 31)); // limite Excel: 31 caratteri per nome foglio
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${registro}_${da}_${a}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error(`Errore export Excel ${registro}:`, err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/registro-haccp/export/omnicomprensivo/dati?da=&a= — tutti gli 8
// registri, per il PDF omnicomprensivo lato client (un blocco per registro,
// costruito genericamente dal frontend a partire da headers/righe).
async function datiOmnicomprensivo(req, res) {
  const { da, a } = req.query;
  if (!da || !a) {
    return res.status(400).json({ errore: 'Parametri da e a (date) obbligatori.' });
  }
  try {
    const chiavi = Object.keys(REGISTRI);
    const risultati = await Promise.all(chiavi.map(k => REGISTRI[k].fetchRows(da, a)));
    const registri = chiavi.map((k, i) => ({ registro: k, label: REGISTRI[k].label, headers: REGISTRI[k].headers, righe: risultati[i] }));
    res.json({ da, a, registri });
  } catch (err) {
    console.error('Errore dati export omnicomprensivo:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

// GET /api/registro-haccp/export/omnicomprensivo/excel?da=&a= — un file, un
// foglio per registro (8 fogli), stesso ordine A.1→A.8.
async function excelOmnicomprensivo(req, res) {
  const { da, a } = req.query;
  if (!da || !a) {
    return res.status(400).json({ errore: 'Parametri da e a (date) obbligatori.' });
  }
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    for (const chiave of Object.keys(REGISTRI)) {
      const def = REGISTRI[chiave];
      const righe = await def.fetchRows(da, a);
      const ws = XLSX.utils.aoa_to_sheet([def.headers, ...righe]);
      XLSX.utils.book_append_sheet(wb, ws, chiave.slice(0, 31));
    }
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="registri_haccp_${da}_${a}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('Errore export Excel omnicomprensivo:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = {
  REGISTRI, // esportato per i test (elenco chiavi/label attese)
  datiRegistro, excelRegistro, datiOmnicomprensivo, excelOmnicomprensivo,
};
