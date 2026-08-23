// Script una tantum — Booking Engine v2, contenuti camere (19/08/2026).
//
// Completa/crea i documenti Sanity "camera" per le 6 tipologie attive dopo
// lo shared inventory (migration 050): Singola, Matrimoniale Piccola,
// Doppia uso singola, Matrimoniale, Tripla, Quadrupla. Contenuti (testi,
// mq, servizi, prezzo) concordati con il titolare in chat il 19/08/2026 —
// vedi i commenti su ogni voce di CONTENUTI qui sotto per cosa è confermato
// (listino ufficiale) e cosa è ancora approssimativo. Rieseguibile senza
// rischi: aggiorna solo i campi ancora vuoti nei documenti già esistenti.
//
// Uso:
//   node backend/scripts/creaContenutiCamereMancanti.js            → dry run, nessuna scrittura
//   node backend/scripts/creaContenutiCamereMancanti.js --applica   → crea/aggiorna i documenti
//
// Stesse variabili d'ambiente di collegaSanityTipiCamera.js
// (SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN — token con ruolo
// Editor). Va lanciato da dentro backend/ (dotenv cerca .env nella cartella
// corrente).
//
// Comportamento:
// - Se esiste già un documento Sanity con tipoCameraId collegato a quel
//   tipo (oggi solo "Matrimoniale", id già collegato in una sessione
//   precedente): PATCH — aggiunge SOLO i campi mancanti (descrizione, mq,
//   prezzoBase se non già impostati) e AGGIUNGE ai servizi esistenti quelli
//   nuovi (colazione-inclusa, parcheggio, sky), senza mai rimuovere servizi
//   già presenti in Studio.
// - Se non esiste nessun documento con quel tipoCameraId: CREATE — nuovo
//   documento completo, con `disponibile` NON impostato (quindi escluso di
//   default da /camere finché il titolare non carica una foto e lo attiva
//   a mano in Studio — nessun contenuto senza immagine va live da solo).
//   Il booking engine diretto (/prenota) invece lo mostra comunque, perché
//   BookingWidget non filtra per `disponibile`.
//
// prezzoBase: "a partire da", €/persona/notte in mezza pensione (dato dal
// titolare) — il campo Sanity non distingue per persona/per camera o il
// tipo di pensione, è solo un numero. Il titolare ha detto esplicitamente
// che tranne i 90€ della Matrimoniale gli altri importi sono "quasi a
// caso" e vanno rivisti — vedi docs/EVOLUTIVE.md (annotare dopo l'esecuzione).

require('dotenv').config();
const pool = require('../config/db');
const { createClient } = require('@sanity/client');

const APPLICA = process.argv.includes('--applica');

const SERVIZI_COMUNI_NUOVI = ['colazione-inclusa', 'parcheggio', 'sky'];

const CONTENUTI = {
  'Singola': {
    // Riattivato dalla migration 050 (shared inventory, 19/08/2026) — stesso
    // pool fisico di Matrimoniale Piccola (camere 2,7,12,21), ma prezzo
    // diverso: listino ufficiale del titolare, non più una stima.
    slug: 'singola',
    ordine: 1,
    descrizioneIt: 'Camera con letto matrimoniale alla francese, compatta e luminosa: la soluzione più economica per chi viaggia da solo.',
    mq: 10,
    servizi: ['wifi', 'tv', 'aria-condizionata', 'cassaforte', 'bagno-privato', ...SERVIZI_COMUNI_NUOVI],
    prezzoBase: 70, // confermato dal titolare, listino ufficiale 2026, €/notte B&B, min stagionale
  },
  'Matrimoniale Piccola': {
    slug: 'matrimoniale-piccola',
    ordine: 2,
    descrizioneIt: 'Camera con letto matrimoniale alla francese, compatta e luminosa: comoda per una coppia che non ha bisogno di troppo spazio.',
    mq: 10,
    servizi: ['wifi', 'tv', 'aria-condizionata', 'cassaforte', 'bagno-privato', ...SERVIZI_COMUNI_NUOVI],
    prezzoBase: 80, // dato dal titolare come approssimativo — SEGNATO DA RIVERIFICARE con lui
  },
  'Doppia uso singola': {
    // Nuovo tipo (migration 050) — stesso pool fisico di Matrimoniale
    // (tutte le camere "pure"), venduto a una sola persona.
    slug: 'doppia-uso-singola',
    ordine: 3,
    descrizioneIt: 'Camera matrimoniale standard riservata a una sola persona: più spazio di una Singola, per chi preferisce viaggiare comodo anche da solo.',
    mq: 14,
    servizi: ['wifi', 'tv', 'aria-condizionata', 'minibar', 'cassaforte', 'bagno-privato', ...SERVIZI_COMUNI_NUOVI],
    prezzoBase: 100, // confermato dal titolare, listino ufficiale 2026, €/notte B&B, min stagionale
  },
  'Matrimoniale': {
    // Documento già esistente in Sanity (collegato manualmente in una
    // sessione precedente) — qui solo completamento, mai ricreato da zero.
    ordine: 4,
    descrizioneIt: 'Camera doppia con letto matrimoniale, per una coppia in cerca di un soggiorno tranquillo vicino al mare.',
    mq: 14,
    servizi: SERVIZI_COMUNI_NUOVI, // unione con quelli già presenti (wifi/tv/aria-condizionata/minibar/cassaforte/bagno-privato)
    prezzoBase: 90, // confermato dal titolare, listino ufficiale 2026, €/notte B&B, min stagionale
  },
  'Tripla': {
    slug: 'tripla',
    ordine: 5,
    descrizioneIt: 'Camera matrimoniale con letto singolo aggiuntivo, fino a 3 adulti: comoda per un piccolo gruppo di amici o una famiglia con un figlio più grande.',
    mq: 14,
    servizi: ['wifi', 'tv', 'aria-condizionata', 'minibar', 'cassaforte', 'bagno-privato', ...SERVIZI_COMUNI_NUOVI],
    prezzoBase: 110, // 90 + 20€/persona, indicato dal titolare come approssimativo, da rivedere
  },
  'Quadrupla': {
    slug: 'quadrupla',
    ordine: 6,
    descrizioneIt: 'Camera matrimoniale con letto a castello aggiuntivo, fino a 4 adulti: pensata per famiglie numerose che vogliono restare nella stessa stanza.',
    mq: 16,
    servizi: ['wifi', 'tv', 'aria-condizionata', 'minibar', 'cassaforte', 'bagno-privato', ...SERVIZI_COMUNI_NUOVI],
    prezzoBase: 110, // 90 + 20€/persona, indicato dal titolare come approssimativo, da rivedere
  },
};

async function main() {
  if (!process.env.SANITY_PROJECT_ID || !process.env.SANITY_API_TOKEN) {
    console.error('Mancano SANITY_PROJECT_ID e/o SANITY_API_TOKEN in backend/.env.');
    process.exit(1);
  }

  const sanity = createClient({
    projectId: process.env.SANITY_PROJECT_ID,
    dataset: process.env.SANITY_DATASET || 'production',
    apiVersion: '2024-01-01',
    token: process.env.SANITY_API_TOKEN,
    useCdn: false,
  });

  const tipiAttivi = (await pool.query(`SELECT id, nome FROM tipi_camera WHERE attivo = true ORDER BY id`)).rows;
  const documentiSanity = await sanity.fetch(`*[_type == "camera"]{_id, "nome": nome.it, servizi, mq, prezzoBase, descrizione, tipoCameraId}`);

  console.log(`Tipi camera attivi nel gestionale: ${tipiAttivi.map(t => `${t.nome} (#${t.id})`).join(', ')}\n`);

  const daCreare = [];
  const daAggiornare = [];
  const senzaContenutoPreparato = [];

  for (const tipo of tipiAttivi) {
    const contenuto = CONTENUTI[tipo.nome];
    if (!contenuto) {
      senzaContenutoPreparato.push(tipo);
      continue;
    }
    const docEsistente = documentiSanity.find(d => d.tipoCameraId === tipo.id);
    if (docEsistente) {
      daAggiornare.push({ tipo, contenuto, docEsistente });
    } else {
      daCreare.push({ tipo, contenuto });
    }
  }

  if (senzaContenutoPreparato.length) {
    console.log('Tipi attivi senza contenuto preparato in questo script (nessuna azione):');
    senzaContenutoPreparato.forEach(t => console.log(`  ? ${t.nome} (#${t.id})`));
    console.log();
  }

  if (daCreare.length) {
    console.log(APPLICA ? 'Creazione in corso:' : 'Da CREARE (dry run):');
    daCreare.forEach(({ tipo, contenuto }) => console.log(`  + "${tipo.nome}" (#${tipo.id}) — ${contenuto.mq}mq, prezzoBase=${contenuto.prezzoBase ?? '(non impostato)'}, servizi: ${contenuto.servizi.join(', ')}`));
    console.log();
  }

  if (daAggiornare.length) {
    console.log(APPLICA ? 'Aggiornamento in corso:' : 'Da AGGIORNARE (dry run):');
    daAggiornare.forEach(({ tipo, contenuto, docEsistente }) => {
      const serviziUnione = Array.from(new Set([...(docEsistente.servizi || []), ...contenuto.servizi]));
      console.log(`  ~ "${tipo.nome}" (#${tipo.id}, ${docEsistente._id}) — servizi dopo unione: ${serviziUnione.join(', ')}`);
      console.log(`    descrizione: ${docEsistente.descrizione ? 'già presente, non toccata' : 'verrà impostata'}`);
      console.log(`    mq: ${docEsistente.mq != null ? `già presente (${docEsistente.mq}), non toccato` : `verrà impostato a ${contenuto.mq}`}`);
      console.log(`    prezzoBase: ${docEsistente.prezzoBase != null ? `già presente (${docEsistente.prezzoBase}), non toccato` : `verrà impostato a ${contenuto.prezzoBase}`}`);
    });
    console.log();
  }

  if (!APPLICA) {
    console.log('DRY RUN — nessuna scrittura effettuata. Rilancia con --applica per applicare.');
    await pool.end();
    return;
  }

  for (const { tipo, contenuto } of daCreare) {
    await sanity.create({
      _type: 'camera',
      nome: { _type: 'localeString', it: `Camera ${tipo.nome}` },
      slug: { _type: 'slug', current: contenuto.slug },
      descrizione: { _type: 'localeText', it: contenuto.descrizioneIt },
      mq: contenuto.mq,
      ordine: contenuto.ordine,
      servizi: contenuto.servizi,
      ...(contenuto.prezzoBase != null ? { prezzoBase: contenuto.prezzoBase } : {}),
      tipoCameraId: tipo.id,
      // `disponibile` volutamente NON impostato: resta fuori da /camere
      // finché non c'è una foto e il titolare lo attiva a mano in Studio.
    });
    console.log(`  ✓ creato: "Camera ${tipo.nome}"`);
  }

  for (const { tipo, contenuto, docEsistente } of daAggiornare) {
    const serviziUnione = Array.from(new Set([...(docEsistente.servizi || []), ...contenuto.servizi]));
    const patch = sanity.patch(docEsistente._id).set({ servizi: serviziUnione, ordine: contenuto.ordine });
    if (!docEsistente.descrizione) patch.set({ descrizione: { _type: 'localeText', it: contenuto.descrizioneIt } });
    if (docEsistente.mq == null) patch.set({ mq: contenuto.mq });
    if (docEsistente.prezzoBase == null && contenuto.prezzoBase != null) patch.set({ prezzoBase: contenuto.prezzoBase });
    await patch.commit();
    console.log(`  ✓ aggiornato: "${tipo.nome}"`);
  }

  console.log('\nFatto. Ricorda: le 3 camere nuove non hanno foto — restano fuori da /camere finché non le aggiungi e attivi "Disponibile" in Studio. Il booking engine diretto (/prenota) le mostra già.');
  await pool.end();
}

main().catch(err => {
  console.error('Errore:', err.message);
  process.exit(1);
});
