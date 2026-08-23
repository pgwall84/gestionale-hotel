// Controller ricerca globale (CMD+K, 23/08/2026) — aggrega ospiti, camere,
// prenotazioni in una singola chiamata per la barra di ricerca universale
// in Topbar (RicercaGlobale.tsx). Non reinventa la ricerca: riusa lo
// stesso pattern ILIKE multi-parola già in produzione in
// anagraficaOspitiController.lista (ospiti, GET /api/ospiti?search=) e in
// prenotazioniController.lista (nome ospite/numero camera, GET
// /api/prenotazioni?ricerca=) — qui solo aggregato con limite basso (5 per
// categoria: è un menu a tendina, non una lista paginata).
//
// "Fatture" (dalla richiesta originale del titolare: ospiti/camere/
// fatture/voci di menu) NON è incluso — il modulo fatturazione (Fase 2B,
// 3.2) non è ancora costruito. Da aggiungere qui quando esisterà.
const pool = require('../config/db');

async function cerca(req, res) {
  const q = (req.query.q || '').trim();

  // Meno di 2 caratteri: nessuna query, evita risultati rumorosi/pesanti
  // a ogni singolo tasto premuto (stesso principio del debounce lato
  // frontend, ma anche lato server nel caso arrivi comunque una richiesta).
  if (q.length < 2) {
    return res.json({ ospiti: [], camere: [], prenotazioni: [] });
  }

  const parole = q.split(/\s+/).filter(Boolean);
  const condizioniOspiti = parole
    .map((_, i) => `(nome ILIKE $${i + 1} OR cognome ILIKE $${i + 1})`)
    .join(' AND ');
  const parametriOspiti = parole.map((p) => `%${p}%`);

  try {
    const [ospitiRes, camereRes, prenotazioniRes] = await Promise.all([
      // Ospiti — stessa logica multi-parola di anagraficaOspitiController
      // (nome E cognome possono comparire in qualsiasi ordine/colonna).
      pool.query(
        `SELECT id, nome, cognome, telefono
         FROM ospiti
         WHERE duplicato_di IS NULL AND (${condizioniOspiti})
         ORDER BY cognome, nome
         LIMIT 5`,
        parametriOspiti
      ),
      // Camere — tabella piccola (~20 righe), un solo ILIKE su numero o
      // nome è sufficiente, nessun bisogno dello split multi-parola.
      // Solo camere attive, stesso filtro di camereController.lista.
      pool.query(
        `SELECT id, numero, nome, piano
         FROM camere
         WHERE attivo = true AND (numero ILIKE $1 OR nome ILIKE $1)
         ORDER BY numero
         LIMIT 5`,
        [`%${q}%`]
      ),
      // Prenotazioni — soggiorni non cancellati, esclude 'interrotta'
      // (annullata: comparirebbe già come "ospite" o "camera" nelle altre
      // due sezioni se serve, non ha senso proporre una prenotazione morta
      // da qui). Stesso criterio ILIKE di prenotazioniController.lista.
      pool.query(
        `SELECT s.id AS soggiorno_id, s.data_arrivo, s.data_partenza,
                c.numero AS camera_numero,
                p.id AS prenotazione_id, p.stato,
                o.nome AS ospite_nome, o.cognome AS ospite_cognome
         FROM soggiorni s
         JOIN camere c ON c.id = s.camera_id
         JOIN prenotazioni p ON p.id = s.prenotazione_id
         LEFT JOIN ospiti o ON o.id = s.ospite_id
         WHERE s.cancellato = false
           AND p.stato != 'interrotta'
           AND (o.nome ILIKE $1 OR o.cognome ILIKE $1 OR c.numero ILIKE $1)
         ORDER BY s.data_arrivo DESC
         LIMIT 5`,
        [`%${q}%`]
      ),
    ]);

    res.json({
      ospiti: ospitiRes.rows,
      camere: camereRes.rows,
      prenotazioni: prenotazioniRes.rows,
    });
  } catch (err) {
    console.error('Errore ricerca globale:', err);
    res.status(500).json({ errore: 'Errore interno del server.' });
  }
}

module.exports = { cerca };
