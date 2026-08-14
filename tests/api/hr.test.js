// Test suite — Modulo HR (Personale)
// Copre: timbrature (timbra/stato/storico/presenti/applica-standard),
//        turni (CRUD + applica-standard), turni standard (CRUD),
//        assenze (lista/crea/aggiornaStato), scadenze (CRUD + alert),
//        documenti dipendente (upload/lista/download/download-zip/elimina),
//        haccp (lista/salva/storico), comunicazioni (lista/crea/elimina),
//        report mensile — foglio "Consulente" (13/08/2026: ordine colonne
//        + calcolo straordinari, parsing del buffer xlsx di ritorno)
// Skip: export Excel (/timbrature/export), foglio Dettaglio/Riepilogo del
//       report mensile — risposte binarie preesistenti, verifica manuale
// Dipendenze: users (seed), richieste_assenza, comunicazioni, timbrature,
//             turni, turni_standard, scadenze, documenti_dipendente,
//             haccp_checklist — tutte referenziano users(id) con
//             ON DELETE RESTRICT: vanno ripulite in afterAll PRIMA di
//             pulisciDatiTest(), altrimenti la DELETE su users fallisce.
//
// Nota permessi HACCP (fix 11/08/2026): GET/POST /api/hr/haccp sono ora
// riservati ad admin/titolare/cuoco (richiedeSezione('haccp'), coerente con
// shared/ruoli.js) — prima non c'era nessuna restrizione di ruolo lato route,
// gap trovato scrivendo questi test e corretto su richiesta del titolare.

const request = require('supertest');
const path    = require('path');
const fs      = require('fs');
const XLSX    = require('xlsx');
const app     = require('../../backend/app');
const { authHeader, creaToken } = require('../helpers/auth');
const { creaUtenteDiTest, pulisciDatiTest, chiudiPool, getPool } = require('../helpers/db');

// Date fisse e isolate tra le suite, per evitare che due describe block
// tocchino per sbaglio lo stesso giorno/utente e si condizionino a vicenda.
const DATA_TURNO_TEST = '2026-11-02';
const RANGE_APPLICA_STANDARD = { data_inizio: '2027-02-01', data_fine: '2027-02-03' };
const DATA_HACCP_TEST = '2026-12-15';

// Fixture su disco per l'upload documenti — stesso pattern di
// tests/api/archivio.test.js (multer legge un file vero, non un Buffer in
// memoria). Il file caricato lato server viene rimosso dall'endpoint stesso
// quando il test DELETE lo elimina; qui puliamo solo il file sorgente locale.
const FILE_TEST_DOCUMENTI = path.join(__dirname, '_hr_test_documento.pdf');

let utenteTest;
let tokenUtente;
let tokenUtenteCuoco; // stesso utente reale di tokenUtente, ma ruolo cuoco — serve per HACCP

beforeAll(async () => {
  utenteTest = await creaUtenteDiTest({
    email: `hr_test_${Date.now()}@test.hotel`,
    ruolo: 'receptionist',
  });
  tokenUtente = creaToken({ id: utenteTest.id, ruolo: 'receptionist', email: utenteTest.email });
  // Stesso id reale di utenteTest (necessario per l'INSERT su haccp_checklist,
  // che referenzia users(id) con ON DELETE RESTRICT) ma ruolo cuoco, l'unico
  // fra i ruoli "di reparto" ammesso a leggere/salvare HACCP.
  tokenUtenteCuoco = creaToken({ id: utenteTest.id, ruolo: 'cuoco', email: utenteTest.email });
  fs.writeFileSync(FILE_TEST_DOCUMENTI, 'contenuto di test');
});

afterAll(async () => {
  // Pulisce tutte le tabelle che referenziano l'utente di test — l'ordine
  // conta: vanno rimosse prima delle righe in users (FK ON DELETE RESTRICT).
  const db = getPool();
  await db.query('DELETE FROM timbrature WHERE user_id = $1', [utenteTest?.id]);
  await db.query('DELETE FROM richieste_assenza WHERE user_id = $1', [utenteTest?.id]);
  await db.query('DELETE FROM turni WHERE user_id = $1', [utenteTest?.id]);
  await db.query('DELETE FROM turni_standard WHERE user_id = $1', [utenteTest?.id]);
  await db.query('DELETE FROM scadenze WHERE user_id = $1', [utenteTest?.id]);
  await db.query('DELETE FROM documenti_dipendente WHERE user_id = $1', [utenteTest?.id]);
  await db.query('DELETE FROM haccp_checklist WHERE data = $1', [DATA_HACCP_TEST]);
  await pulisciDatiTest();
  if (fs.existsSync(FILE_TEST_DOCUMENTI)) fs.unlinkSync(FILE_TEST_DOCUMENTI);
  await chiudiPool();
});

// ─── POST /api/hr/timbrature ──────────────────────────────────────────────────

describe('POST /api/hr/timbrature', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/hr/timbrature');
    expect(res.status).toBe(401);
  });

  test('prima timbratura del giorno → 201 con tipo entrata', async () => {
    const res = await request(app)
      .post('/api/hr/timbrature')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({});
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('timbratura');
    expect(['entrata', 'uscita']).toContain(res.body.timbratura.tipo);
    expect(res.body).toHaveProperty('messaggio');
  });

  test('seconda timbratura → tipo opposto alla prima', async () => {
    // Recupera tipo attuale
    const stato = await request(app)
      .get('/api/hr/timbrature/stato')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    const prossimo = stato.body.prossimaTimbratua;

    const res = await request(app)
      .post('/api/hr/timbrature')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.timbratura.tipo).toBe(prossimo);
  });
});

// ─── GET /api/hr/timbrature/stato ────────────────────────────────────────────

describe('GET /api/hr/timbrature/stato', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/hr/timbrature/stato');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con dentroStruttura e prossimaTimbratua', async () => {
    const res = await request(app)
      .get('/api/hr/timbrature/stato')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('dentroStruttura');
    expect(res.body).toHaveProperty('prossimaTimbratua');
  });
});

// ─── GET /api/hr/timbrature/storico ──────────────────────────────────────────

describe('GET /api/hr/timbrature/storico', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/hr/timbrature/storico');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con array timbrature', async () => {
    const res = await request(app)
      .get('/api/hr/timbrature/storico')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('timbrature');
    expect(Array.isArray(res.body.timbrature)).toBe(true);
  });

  test('con filtro mese → 200', async () => {
    const mese = new Date().toISOString().slice(0, 7);
    const res = await request(app)
      .get(`/api/hr/timbrature/storico?mese=${mese}`)
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/hr/timbrature/presenti ─────────────────────────────────────────

describe('GET /api/hr/timbrature/presenti', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/hr/timbrature/presenti');
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (solo titolare)', async () => {
    const res = await request(app)
      .get('/api/hr/timbrature/presenti')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(403);
  });

  test('titolare → 200 con array presenti', async () => {
    const res = await request(app)
      .get('/api/hr/timbrature/presenti')
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('presenti');
    expect(Array.isArray(res.body.presenti)).toBe(true);
  });
});

// ─── GET /api/hr/assenze ─────────────────────────────────────────────────────

describe('GET /api/hr/assenze', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/hr/assenze');
    expect(res.status).toBe(401);
  });

  test('dipendente → 200 (vede solo le sue)', async () => {
    const res = await request(app)
      .get('/api/hr/assenze')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('richieste');
  });

  test('titolare → 200 (vede tutte)', async () => {
    const res = await request(app)
      .get('/api/hr/assenze')
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.richieste)).toBe(true);
  });
});

// ─── POST /api/hr/assenze ────────────────────────────────────────────────────

describe('POST /api/hr/assenze', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/hr/assenze').send({});
    expect(res.status).toBe(401);
  });

  test('campi mancanti → 400', async () => {
    const res = await request(app)
      .post('/api/hr/assenze')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ tipo: 'ferie' }); // mancano le date
    expect(res.status).toBe(400);
  });

  test('tipo non valido → 400', async () => {
    const res = await request(app)
      .post('/api/hr/assenze')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ tipo: 'vacanza', data_inizio: '2026-08-01', data_fine: '2026-08-07' });
    expect(res.status).toBe(400);
  });

  test('richiesta ferie valida → 201', async () => {
    const res = await request(app)
      .post('/api/hr/assenze')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ tipo: 'ferie', data_inizio: '2026-09-01', data_fine: '2026-09-07', note: 'Test' });
    expect(res.status).toBe(201);
    expect(res.body.richiesta.tipo).toBe('ferie');
    expect(res.body.richiesta.stato).toBe('in_attesa');
  });
});

// ─── PATCH /api/hr/assenze/:id/stato ─────────────────────────────────────────

describe('PATCH /api/hr/assenze/:id/stato', () => {
  let idRichiesta;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/hr/assenze')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ tipo: 'permesso', data_inizio: '2026-10-01', data_fine: '2026-10-01' });
    idRichiesta = res.body.richiesta?.id;
  });

  test('senza token → 401', async () => {
    const res = await request(app).patch(`/api/hr/assenze/${idRichiesta}/stato`).send({ stato: 'approvata' });
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (solo titolare)', async () => {
    const res = await request(app)
      .patch(`/api/hr/assenze/${idRichiesta}/stato`)
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ stato: 'approvata' });
    expect(res.status).toBe(403);
  });

  test('stato non valido → 400', async () => {
    const res = await request(app)
      .patch(`/api/hr/assenze/${idRichiesta}/stato`)
      .set(authHeader.titolare())
      .send({ stato: 'sospesa' });
    expect(res.status).toBe(400);
  });

  test('titolare approva → 200', async () => {
    const res = await request(app)
      .patch(`/api/hr/assenze/${idRichiesta}/stato`)
      .set(authHeader.titolare())
      .send({ stato: 'approvata' });
    expect(res.status).toBe(200);
    expect(res.body.richiesta.stato).toBe('approvata');
  });

  test('approvazione imposta data_decisione (per il riquadro "Ultime decisioni")', async () => {
    const res = await request(app)
      .patch(`/api/hr/assenze/${idRichiesta}/stato`)
      .set(authHeader.titolare())
      .send({ stato: 'rifiutata' });
    expect(res.status).toBe(200);
    expect(res.body.richiesta.data_decisione).toBeTruthy();
    const secondiFa = (Date.now() - new Date(res.body.richiesta.data_decisione).getTime()) / 1000;
    expect(secondiFa).toBeLessThan(10);
  });
});

// ─── Geolocalizzazione timbratura (Miglioramento HR 1) ────────────────────────

describe('POST /api/hr/timbrature — geolocalizzazione', () => {
  test('con lat/lon/distanza → salvati sulla timbratura', async () => {
    const res = await request(app)
      .post('/api/hr/timbrature')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ latitudine: 44.0773612, longitudine: 9.9127261, distanza_hotel: 12 });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.timbratura.latitudine)).toBeCloseTo(44.0773612, 5);
    expect(parseFloat(res.body.timbratura.longitudine)).toBeCloseTo(9.9127261, 5);
    expect(res.body.timbratura.distanza_hotel).toBe(12);
  });

  test('senza campi di geolocalizzazione → funziona comunque (opzionali)', async () => {
    const res = await request(app)
      .post('/api/hr/timbrature')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.timbratura.latitudine).toBeNull();
  });
});

// ─── GET /api/hr/comunicazioni ────────────────────────────────────────────────

describe('GET /api/hr/comunicazioni', () => {
  test('senza token → 401', async () => {
    const res = await request(app).get('/api/hr/comunicazioni');
    expect(res.status).toBe(401);
  });

  test('con token → 200 con array comunicazioni', async () => {
    const res = await request(app)
      .get('/api/hr/comunicazioni')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('comunicazioni');
    expect(Array.isArray(res.body.comunicazioni)).toBe(true);
  });
});

// ─── POST /api/hr/comunicazioni ───────────────────────────────────────────────

describe('POST /api/hr/comunicazioni', () => {
  let idComunicazione;

  test('senza token → 401', async () => {
    const res = await request(app).post('/api/hr/comunicazioni').send({});
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (solo titolare)', async () => {
    const res = await request(app)
      .post('/api/hr/comunicazioni')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ titolo: 'Test', testo: 'Test' });
    expect(res.status).toBe(403);
  });

  test('campi mancanti → 400', async () => {
    const res = await request(app)
      .post('/api/hr/comunicazioni')
      .set(authHeader.titolare())
      .send({ titolo: 'Solo titolo' });
    expect(res.status).toBe(400);
  });

  test('titolare crea comunicazione → 201', async () => {
    const res = await request(app)
      .post('/api/hr/comunicazioni')
      .set(authHeader.titolare())
      .send({ titolo: 'Riunione test', testo: 'Testo della comunicazione di test.' });
    expect(res.status).toBe(201);
    expect(res.body.comunicazione.titolo).toBe('Riunione test');
    idComunicazione = res.body.comunicazione.id;
  });

  test('DELETE /api/hr/comunicazioni/:id — titolare elimina → 200', async () => {
    if (!idComunicazione) return;
    const res = await request(app)
      .delete(`/api/hr/comunicazioni/${idComunicazione}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
  });

  test('DELETE — senza token → 401', async () => {
    const res = await request(app).delete('/api/hr/comunicazioni/999');
    expect(res.status).toBe(401);
  });
});

// ─── Turni settimanali (/api/hr/turni) ────────────────────────────────────────

describe('Turni settimanali (/api/hr/turni)', () => {
  let idTurno;

  test('GET senza token → 401', async () => {
    const res = await request(app).get('/api/hr/turni');
    expect(res.status).toBe(401);
  });

  test('POST senza token → 401', async () => {
    const res = await request(app).post('/api/hr/turni').send({});
    expect(res.status).toBe(401);
  });

  test('POST receptionist → 403 (solo titolare)', async () => {
    const res = await request(app)
      .post('/api/hr/turni')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ user_id: utenteTest.id, data: DATA_TURNO_TEST, ora_inizio: '07:00', ora_fine: '15:00' });
    expect(res.status).toBe(403);
  });

  test('POST campi obbligatori mancanti (user_id) → 400', async () => {
    const res = await request(app)
      .post('/api/hr/turni')
      .set(authHeader.titolare())
      .send({ data: DATA_TURNO_TEST });
    expect(res.status).toBe(400);
  });

  test('POST turno non di riposo senza orari → 400', async () => {
    const res = await request(app)
      .post('/api/hr/turni')
      .set(authHeader.titolare())
      .send({ user_id: utenteTest.id, data: DATA_TURNO_TEST, tipo_turno: 'mattina' });
    expect(res.status).toBe(400);
  });

  test('POST turno valido (titolare) → 201', async () => {
    const res = await request(app)
      .post('/api/hr/turni')
      .set(authHeader.titolare())
      .send({ user_id: utenteTest.id, data: DATA_TURNO_TEST, ora_inizio: '07:00', ora_fine: '15:00', tipo_turno: 'mattina' });
    expect(res.status).toBe(201);
    expect(res.body.turno).toHaveProperty('id');
    idTurno = res.body.turno.id;
  });

  test('POST turno di riposo senza orari → 201 (non richiesti per tipo_turno riposo)', async () => {
    const res = await request(app)
      .post('/api/hr/turni')
      .set(authHeader.titolare())
      .send({ user_id: utenteTest.id, data: '2026-11-03', tipo_turno: 'riposo' });
    expect(res.status).toBe(201);
    expect(res.body.turno.ora_inizio).toBeNull();
  });

  test('GET con settimana → dipendente vede solo i propri turni', async () => {
    const res = await request(app)
      .get(`/api/hr/turni?settimana=${DATA_TURNO_TEST}`)
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.turni)).toBe(true);
    for (const t of res.body.turni) expect(t.user_id).toBe(utenteTest.id);
  });

  test('GET con settimana → titolare vede tutti i turni della settimana', async () => {
    const res = await request(app)
      .get(`/api/hr/turni?settimana=${DATA_TURNO_TEST}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.turni.some(t => t.id === idTurno)).toBe(true);
  });

  test('PUT senza token → 401', async () => {
    const res = await request(app).put(`/api/hr/turni/${idTurno}`).send({});
    expect(res.status).toBe(401);
  });

  test('PUT receptionist → 403', async () => {
    const res = await request(app)
      .put(`/api/hr/turni/${idTurno}`)
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ ora_inizio: '08:00', ora_fine: '16:00', tipo_turno: 'mattina' });
    expect(res.status).toBe(403);
  });

  test('PUT titolare → 200, orari aggiornati', async () => {
    const res = await request(app)
      .put(`/api/hr/turni/${idTurno}`)
      .set(authHeader.titolare())
      .send({ ora_inizio: '08:00', ora_fine: '16:00', tipo_turno: 'mattina' });
    expect(res.status).toBe(200);
    expect(res.body.turno.ora_inizio.slice(0, 5)).toBe('08:00');
  });

  test('PUT turno inesistente → 404', async () => {
    const res = await request(app)
      .put('/api/hr/turni/999999999')
      .set(authHeader.titolare())
      .send({ ora_inizio: '08:00', ora_fine: '16:00', tipo_turno: 'mattina' });
    expect(res.status).toBe(404);
  });

  test('DELETE senza token → 401', async () => {
    const res = await request(app).delete(`/api/hr/turni/${idTurno}`);
    expect(res.status).toBe(401);
  });

  test('DELETE receptionist → 403', async () => {
    const res = await request(app)
      .delete(`/api/hr/turni/${idTurno}`)
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(403);
  });

  test('DELETE titolare → 200', async () => {
    const res = await request(app)
      .delete(`/api/hr/turni/${idTurno}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
  });
});

// ─── Turni standard (/api/hr/turni-standard) ──────────────────────────────────

describe('Turni standard (/api/hr/turni-standard)', () => {
  test('GET senza token → 401', async () => {
    const res = await request(app).get('/api/hr/turni-standard');
    expect(res.status).toBe(401);
  });

  test('GET receptionist → 403 (route protetta da soloTitolare, non solo il controller)', async () => {
    // Errore mio nella prima versione di questo test: avevo assunto 200 per
    // qualunque ruolo autenticato, ma la route in backend/routes/hr.js applica
    // soloTitolare PRIMA del controller — turniStandardCtrl.lista() non fa
    // nessun controllo di suo, ma non ci arriva mai se il ruolo non è ok.
    const res = await request(app)
      .get('/api/hr/turni-standard')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(403);
  });

  test('GET titolare → 200 con array turniStandard', async () => {
    const res = await request(app)
      .get('/api/hr/turni-standard')
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.turniStandard)).toBe(true);
  });

  test('POST senza token → 401', async () => {
    const res = await request(app).post('/api/hr/turni-standard').send({});
    expect(res.status).toBe(401);
  });

  test('POST campi obbligatori mancanti (tipo_turno) → 400', async () => {
    const res = await request(app)
      .post('/api/hr/turni-standard')
      .set(authHeader.titolare())
      .send({ user_id: utenteTest.id });
    expect(res.status).toBe(400);
  });

  test('POST valido (titolare) → 200, riga creata', async () => {
    const res = await request(app)
      .post('/api/hr/turni-standard')
      .set(authHeader.titolare())
      .send({ user_id: utenteTest.id, tipo_turno: 'mattina', ora_inizio: '07:00', ora_fine: '15:00' });
    expect(res.status).toBe(200);
    expect(res.body.turnoStandard.tipo_turno).toBe('mattina');
  });

  test('POST stesso user_id → aggiorna invece di duplicare (ON CONFLICT)', async () => {
    // Il turno standard "sera" impostato qui resta attivo per i test di
    // applica-standard più sotto, che si aspettano tipo_turno: 'sera'.
    const res = await request(app)
      .post('/api/hr/turni-standard')
      .set(authHeader.titolare())
      .send({ user_id: utenteTest.id, tipo_turno: 'sera', ora_inizio: '15:00', ora_fine: '23:00' });
    expect(res.status).toBe(200);
    expect(res.body.turnoStandard.tipo_turno).toBe('sera');

    const lista = await request(app).get('/api/hr/turni-standard').set(authHeader.titolare());
    const righe = lista.body.turniStandard.filter(s => s.user_id === utenteTest.id);
    expect(righe.length).toBe(1); // una sola riga per utente, mai duplicata
  });

  test('DELETE senza token → 401', async () => {
    const res = await request(app).delete(`/api/hr/turni-standard/${utenteTest.id}`);
    expect(res.status).toBe(401);
  });

  // Nessun test "titolare → 200" per la DELETE qui: il turno standard serve
  // ancora ai test di applica-standard subito sotto. Viene ripulito in afterAll.
});

// ─── POST /api/hr/turni/applica-standard ──────────────────────────────────────

describe('POST /api/hr/turni/applica-standard', () => {
  test('senza token → 401', async () => {
    const res = await request(app).post('/api/hr/turni/applica-standard').send({});
    expect(res.status).toBe(401);
  });

  test('receptionist → 403 (solo titolare)', async () => {
    const res = await request(app)
      .post('/api/hr/turni/applica-standard')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send(RANGE_APPLICA_STANDARD);
    expect(res.status).toBe(403);
  });

  test('campi mancanti (data_fine) → 400', async () => {
    const res = await request(app)
      .post('/api/hr/turni/applica-standard')
      .set(authHeader.titolare())
      .send({ data_inizio: RANGE_APPLICA_STANDARD.data_inizio });
    expect(res.status).toBe(400);
  });

  test('data_fine precedente a data_inizio → 400', async () => {
    const res = await request(app)
      .post('/api/hr/turni/applica-standard')
      .set(authHeader.titolare())
      .send({ data_inizio: '2027-02-28', data_fine: '2027-02-01' });
    expect(res.status).toBe(400);
  });

  test('genera i turni del periodo dal turno standard (utenteTest ha "sera")', async () => {
    const res = await request(app)
      .post('/api/hr/turni/applica-standard')
      .set(authHeader.titolare())
      .send(RANGE_APPLICA_STANDARD); // 3 giorni: 01, 02, 03 febbraio 2027
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.dipendentiSenzaStandard)).toBe(true);
    // Non verifichiamo un conteggio globale di "creati": questo è un DB di
    // sviluppo condiviso, non un DB di test vuoto — ci sono già dipendenti
    // reali con un turno standard configurato (da un uso genuino del
    // pannello "Turni standard", non da questi test). L'endpoint applica lo
    // standard a TUTTI loro, correttamente — è il comportamento richiesto,
    // non un bug. Isoliamo la verifica al nostro utente di test filtrando
    // per user_id, l'unico modo di ottenere un numero deterministico qui.
    expect(res.body.creati).toBeGreaterThanOrEqual(3);

    const verifica = await request(app)
      .get(`/api/hr/turni?settimana=${RANGE_APPLICA_STANDARD.data_inizio}&user_id=${utenteTest.id}`)
      .set(authHeader.titolare());
    expect(verifica.body.turni.length).toBe(3);
    expect(verifica.body.turni.every(t => t.tipo_turno === 'sera')).toBe(true);
  });

  test('richiamato di nuovo sullo stesso periodo → sostituisce, non duplica i turni del nostro utente', async () => {
    // Comportamento cambiato il 13/08/2026 (decisione esplicita del
    // titolare, inverte quella dell'11/08): non più skip, ma DELETE+INSERT
    // in transazione — richiamarlo sullo stesso periodo ricrea sempre le
    // stesse righe (creati torna un numero ≥3, non più 0), ma il conteggio
    // finale dei turni resta invariato: la verifica che conta davvero è che
    // non ci si ritrovi con turni duplicati (6 invece di 3), non che
    // "creati" sia zero.
    const res = await request(app)
      .post('/api/hr/turni/applica-standard')
      .set(authHeader.titolare())
      .send(RANGE_APPLICA_STANDARD);
    expect(res.status).toBe(200);
    expect(res.body.creati).toBeGreaterThanOrEqual(3);
    expect(res.body.sovrascritti).toBeGreaterThanOrEqual(3);

    const verifica = await request(app)
      .get(`/api/hr/turni?settimana=${RANGE_APPLICA_STANDARD.data_inizio}&user_id=${utenteTest.id}`)
      .set(authHeader.titolare());
    expect(verifica.body.turni.length).toBe(3); // ancora 3, non 6: non duplicato
  });
});

// ─── Scadenze (/api/hr/scadenze) ──────────────────────────────────────────────

describe('Scadenze (/api/hr/scadenze)', () => {
  let idScadenza;

  test('GET senza token → 401', async () => {
    const res = await request(app).get('/api/hr/scadenze');
    expect(res.status).toBe(401);
  });

  test('GET receptionist → 403 (solo titolare)', async () => {
    const res = await request(app)
      .get('/api/hr/scadenze')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(403);
  });

  test('POST campi obbligatori mancanti → 400', async () => {
    const res = await request(app)
      .post('/api/hr/scadenze')
      .set(authHeader.titolare())
      .send({ tipo: 'visita_medica' }); // mancano user_id e data_scadenza
    expect(res.status).toBe(400);
  });

  test('POST valida (titolare) → 201', async () => {
    const dataScadenza = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const res = await request(app)
      .post('/api/hr/scadenze')
      .set(authHeader.titolare())
      .send({ user_id: utenteTest.id, tipo: 'visita_medica', data_scadenza: dataScadenza, giorni_alert: 30 });
    expect(res.status).toBe(201);
    expect(res.body.scadenza).toHaveProperty('id');
    idScadenza = res.body.scadenza.id;
  });

  test('GET alert → include la scadenza imminente appena creata', async () => {
    const res = await request(app).get('/api/hr/scadenze/alert').set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.alert.some(a => a.id === idScadenza)).toBe(true);
  });

  test('GET alert → non include scadenze oltre la finestra di giorni_alert', async () => {
    const dataLontana = new Date(Date.now() + 400 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const lontana = await request(app)
      .post('/api/hr/scadenze')
      .set(authHeader.titolare())
      .send({ user_id: utenteTest.id, tipo: 'contratto', data_scadenza: dataLontana, giorni_alert: 30 });

    const res = await request(app).get('/api/hr/scadenze/alert').set(authHeader.titolare());
    expect(res.body.alert.some(a => a.id === lontana.body.scadenza.id)).toBe(false);

    await request(app).delete(`/api/hr/scadenze/${lontana.body.scadenza.id}`).set(authHeader.titolare());
  });

  test('PUT titolare → 200, campo aggiornato', async () => {
    const dataScadenza = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const res = await request(app)
      .put(`/api/hr/scadenze/${idScadenza}`)
      .set(authHeader.titolare())
      .send({ tipo: 'corso_haccp', data_scadenza: dataScadenza, giorni_alert: 15 });
    expect(res.status).toBe(200);
    expect(res.body.scadenza.tipo).toBe('corso_haccp');
  });

  test('DELETE senza token → 401', async () => {
    const res = await request(app).delete(`/api/hr/scadenze/${idScadenza}`);
    expect(res.status).toBe(401);
  });

  test('DELETE titolare → 200', async () => {
    const res = await request(app).delete(`/api/hr/scadenze/${idScadenza}`).set(authHeader.titolare());
    expect(res.status).toBe(200);
  });
});

// ─── Documenti dipendente (/api/hr/documenti) ─────────────────────────────────

describe('Documenti dipendente (/api/hr/documenti)', () => {
  let idDocumento;

  test('GET senza token → 401', async () => {
    const res = await request(app).get('/api/hr/documenti');
    expect(res.status).toBe(401);
  });

  test('POST upload senza file → 400', async () => {
    const res = await request(app)
      .post('/api/hr/documenti')
      .set(authHeader.titolare())
      .field('user_id', String(utenteTest.id))
      .field('tipo', 'busta_paga');
    expect(res.status).toBe(400);
  });

  test('POST upload receptionist → 403 (solo titolare)', async () => {
    // Niente .attach() qui: soloTitolare è applicato in routes/hr.js PRIMA
    // di upload.single('file'), quindi il rifiuto avviene senza che multer
    // legga mai il file — allegarne uno comunque ha causato un ECONNRESET
    // nel primo giro di test (il server risponde 403 e chiude mentre il
    // client sta ancora scrivendo lo stream del file sul socket). Il body
    // del file non serve a verificare questo controllo di permesso.
    const res = await request(app)
      .post('/api/hr/documenti')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .field('user_id', String(utenteTest.id))
      .field('tipo', 'busta_paga');
    expect(res.status).toBe(403);
  });

  test('POST upload valido (titolare) → 201', async () => {
    const res = await request(app)
      .post('/api/hr/documenti')
      .set(authHeader.titolare())
      .field('user_id', String(utenteTest.id))
      .field('tipo', 'busta_paga')
      .attach('file', FILE_TEST_DOCUMENTI);
    expect(res.status).toBe(201);
    expect(res.body.documento).toHaveProperty('id');
    idDocumento = res.body.documento.id;
  });

  test('GET lista → include il documento appena caricato', async () => {
    const res = await request(app).get('/api/hr/documenti').set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.documenti.some(d => d.id === idDocumento)).toBe(true);
  });

  test('GET download → un dipendente diverso dal proprietario riceve 403', async () => {
    const res = await request(app)
      .get(`/api/hr/documenti/${idDocumento}/download`)
      .set(authHeader.dipendente());
    expect(res.status).toBe(403);
  });

  test('GET download → 404 per id inesistente', async () => {
    const res = await request(app)
      .get('/api/hr/documenti/999999999/download')
      .set(authHeader.titolare());
    expect(res.status).toBe(404);
  });

  test('GET download-zip receptionist → 403 (solo titolare)', async () => {
    const res = await request(app)
      .get('/api/hr/documenti/download-zip?tipo=busta_paga')
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(403);
  });

  test('GET download-zip senza tipo → 400', async () => {
    const res = await request(app).get('/api/hr/documenti/download-zip').set(authHeader.titolare());
    expect(res.status).toBe(400);
  });

  test('GET download-zip tipo senza corrispondenze → 404', async () => {
    const res = await request(app)
      .get('/api/hr/documenti/download-zip?tipo=tipo_inesistente_xyz')
      .set(authHeader.titolare());
    expect(res.status).toBe(404);
  });

  test('DELETE senza token → 401', async () => {
    const res = await request(app).delete(`/api/hr/documenti/${idDocumento}`);
    expect(res.status).toBe(401);
  });

  test('DELETE titolare → 200', async () => {
    const res = await request(app).delete(`/api/hr/documenti/${idDocumento}`).set(authHeader.titolare());
    expect(res.status).toBe(200);
  });

  test('DELETE id inesistente → 404', async () => {
    const res = await request(app).delete('/api/hr/documenti/999999999').set(authHeader.titolare());
    expect(res.status).toBe(404);
  });
});

// ─── HACCP (/api/hr/haccp) ─────────────────────────────────────────────────────
// Riservato ad admin/titolare/cuoco (richiedeSezione('haccp')) — receptionist
// e altri ruoli di reparto sono esclusi anche dal backend, non solo dalla UI.

describe('HACCP (/api/hr/haccp)', () => {
  test('GET senza token → 401', async () => {
    const res = await request(app).get('/api/hr/haccp');
    expect(res.status).toBe(401);
  });

  test('GET receptionist → 403 (non è in admin/titolare/cuoco)', async () => {
    const res = await request(app)
      .get(`/api/hr/haccp?data=${DATA_HACCP_TEST}`)
      .set({ Authorization: `Bearer ${tokenUtente}` });
    expect(res.status).toBe(403);
  });

  test('GET data senza checklist esistente (cuoco) → lista default non compilata', async () => {
    const res = await request(app)
      .get(`/api/hr/haccp?data=${DATA_HACCP_TEST}`)
      .set({ Authorization: `Bearer ${tokenUtenteCuoco}` });
    expect(res.status).toBe(200);
    expect(res.body.esistente).toBe(false);
    expect(res.body.checklist.length).toBeGreaterThan(0);
    expect(res.body.checklist.every(v => v.completata === false)).toBe(true);
  });

  test('POST senza token → 401', async () => {
    const res = await request(app).post('/api/hr/haccp').send({});
    expect(res.status).toBe(401);
  });

  test('POST receptionist → 403 (non è in admin/titolare/cuoco)', async () => {
    const res = await request(app)
      .post('/api/hr/haccp')
      .set({ Authorization: `Bearer ${tokenUtente}` })
      .send({ data: DATA_HACCP_TEST, voci: [{ attrezzatura: 'Forno', completata: true }] });
    expect(res.status).toBe(403);
  });

  test('POST voci mancanti (cuoco) → 400', async () => {
    const res = await request(app)
      .post('/api/hr/haccp')
      .set({ Authorization: `Bearer ${tokenUtenteCuoco}` })
      .send({ data: DATA_HACCP_TEST });
    expect(res.status).toBe(400);
  });

  test('POST checklist valida (cuoco) → 200, salvata con l\'utente che l\'ha compilata', async () => {
    const res = await request(app)
      .post('/api/hr/haccp')
      .set({ Authorization: `Bearer ${tokenUtenteCuoco}` })
      .send({
        data: DATA_HACCP_TEST,
        voci: [
          { attrezzatura: 'Frigorifero cucina', completata: true, note: '' },
          { attrezzatura: 'Forno', completata: false, note: 'Da controllare' },
        ],
      });
    expect(res.status).toBe(200);

    const verifica = await request(app)
      .get(`/api/hr/haccp?data=${DATA_HACCP_TEST}`)
      .set({ Authorization: `Bearer ${tokenUtenteCuoco}` });
    expect(verifica.body.esistente).toBe(true);
    expect(verifica.body.checklist.length).toBe(2);
  });

  test('GET storico → include il giorno appena compilato', async () => {
    const res = await request(app)
      .get(`/api/hr/haccp/storico?da=${DATA_HACCP_TEST}&a=${DATA_HACCP_TEST}`)
      .set(authHeader.titolare());
    expect(res.status).toBe(200);
    expect(res.body.storico.length).toBe(2);
  });
});

// ─── Report mensile — foglio "Consulente" (GET /api/hr/timbrature/report-mensile) ──
// Mesi 2027 scelti apposta per non incrociare mai dati reali del gestionale
// in uso. Verifica sia il bug di ordine colonne trovato dal titolare
// (json_to_sheet riordinava le chiavi numeriche '1'..'31' prima di
// 'Dipendente' — fix: aoa_to_sheet, vedi timbratureController.js) sia il
// calcolo di ore/straordinari/N-D.
describe('Report mensile — foglio Consulente', () => {
  const MESE_INDETERMINATO = '2027-03';
  const MESE_CHIAMATA = '2027-04';

  test('senza token → 401', async () => {
    const res = await request(app).get(`/api/hr/timbrature/report-mensile?mese=${MESE_INDETERMINATO}`);
    expect(res.status).toBe(401);
  });

  test('con token receptionist → 403', async () => {
    const res = await request(app)
      .get(`/api/hr/timbrature/report-mensile?mese=${MESE_INDETERMINATO}`)
      .set(authHeader.receptionist());
    expect(res.status).toBe(403);
  });

  test('tempo indeterminato (soglia 8h): intestazione in ordine e straordinario calcolato', async () => {
    const db = getPool();
    await db.query('UPDATE users SET contratto_tipo = $1, fascia_oraria = $2 WHERE id = $3',
      ['tempo_indeterminato', 'diurna', utenteTest.id]);
    // Un giorno solo, 9h lavorate (08:00-17:00) → 1h di straordinario sopra la soglia di 8h
    await db.query(
      `INSERT INTO timbrature (user_id, tipo, timestamp) VALUES
       ($1, 'entrata', '2027-03-05 08:00:00'), ($1, 'uscita', '2027-03-05 17:00:00')`,
      [utenteTest.id]
    );

    const res = await request(app)
      .get(`/api/hr/timbrature/report-mensile?mese=${MESE_INDETERMINATO}`)
      .set(authHeader.titolare())
      .responseType('blob');
    expect(res.status).toBe(200);

    const wb = XLSX.read(res.body, { type: 'buffer' });
    expect(wb.SheetNames).toContain('Consulente');
    const righe = XLSX.utils.sheet_to_json(wb.Sheets['Consulente'], { header: 1 });

    // Intestazione: Dipendente per prima, Totale per ultima — il bug segnalato
    // dal titolare le metteva dopo tutte le colonne giorno.
    expect(righe[0][0]).toBe('Dipendente');
    expect(righe[0][1]).toBe('1');
    expect(righe[0][righe[0].length - 1]).toBe('Totale');
    expect(righe[0].length).toBe(1 + 31 + 1); // marzo ha 31 giorni

    const rigaOre = righe.find(r => r[0] === `${utenteTest.cognome} ${utenteTest.nome}`);
    expect(rigaOre).toBeDefined();
    expect(rigaOre[5]).toBe(9); // colonna giorno 5 (indice 5 = 'Dipendente' + giorni 1-4)
    expect(rigaOre[rigaOre.length - 1]).toBe(9); // Totale

    const idxRigaOre = righe.indexOf(rigaOre);
    const rigaStraord = righe[idxRigaOre + 1];
    expect(rigaStraord[0]).toBe('  di cui straordinari');
    expect(rigaStraord[5]).toBe(1);
    expect(rigaStraord[rigaStraord.length - 1]).toBe(1);
  });

  test("contratto a chiamata: straordinari 'N/D', mai una soglia inventata", async () => {
    const db = getPool();
    await db.query('UPDATE users SET contratto_tipo = $1, fascia_oraria = $2 WHERE id = $3',
      ['chiamata', null, utenteTest.id]);
    await db.query(
      `INSERT INTO timbrature (user_id, tipo, timestamp) VALUES
       ($1, 'entrata', '2027-04-05 10:00:00'), ($1, 'uscita', '2027-04-05 14:00:00')`,
      [utenteTest.id]
    );

    const res = await request(app)
      .get(`/api/hr/timbrature/report-mensile?mese=${MESE_CHIAMATA}`)
      .set(authHeader.titolare())
      .responseType('blob');
    expect(res.status).toBe(200);

    const wb = XLSX.read(res.body, { type: 'buffer' });
    const righe = XLSX.utils.sheet_to_json(wb.Sheets['Consulente'], { header: 1 });

    const rigaOre = righe.find(r => r[0] === `${utenteTest.cognome} ${utenteTest.nome}`);
    expect(rigaOre[5]).toBe(4); // 10:00-14:00

    const rigaStraord = righe[righe.indexOf(rigaOre) + 1];
    expect(rigaStraord[5]).toBe('N/D');
    expect(rigaStraord[rigaStraord.length - 1]).toBe('N/D');
  });

  test('turno notturno a cavallo di mezzanotte: le ore vanno sul giorno di ENTRATA, non di uscita', async () => {
    const MESE_NOTTURNO = '2027-05';
    const db = getPool();
    await db.query('UPDATE users SET contratto_tipo = $1, fascia_oraria = $2 WHERE id = $3',
      ['tempo_indeterminato', 'notturna', utenteTest.id]);
    // Entrata il 10 alle 23:00, uscita l'11 alle 07:00 — 8h, nessuno
    // straordinario (esattamente la soglia). Fix 13/08/2026: prima queste
    // ore finivano sotto il giorno 11 (quello della timbratura di uscita).
    await db.query(
      `INSERT INTO timbrature (user_id, tipo, timestamp) VALUES
       ($1, 'entrata', '2027-05-10 23:00:00'), ($1, 'uscita', '2027-05-11 07:00:00')`,
      [utenteTest.id]
    );

    const res = await request(app)
      .get(`/api/hr/timbrature/report-mensile?mese=${MESE_NOTTURNO}`)
      .set(authHeader.titolare())
      .responseType('blob');
    expect(res.status).toBe(200);

    const wb = XLSX.read(res.body, { type: 'buffer' });
    const righe = XLSX.utils.sheet_to_json(wb.Sheets['Consulente'], { header: 1 });
    const rigaOre = righe.find(r => r[0] === `${utenteTest.cognome} ${utenteTest.nome}`);

    expect(rigaOre[10]).toBe(8);  // giorno 10 (indice 10 = colonna giorno 10): le ore ci sono
    expect(rigaOre[11]).toBe(''); // giorno 11: vuoto, non ci deve finire nulla
  });

  test("turno l'ultimo giorno del mese (senza scavalco): prima andava perso del tutto", async () => {
    // Bug distinto da quello sopra, trovato verificando il fix sullo
    // scavalco: `new Date(anno, meseNum, 0).toISOString()` per calcolare
    // l'ultimo giorno del mese passa da UTC e sul server (Europe/Rome)
    // slittava sempre indietro di un giorno — l'ultimo giorno di OGNI mese
    // era invisibile al report, anche senza nessun turno notturno di mezzo.
    const MESE = '2027-06'; // giugno ha 30 giorni
    const db = getPool();
    await db.query('UPDATE users SET contratto_tipo = $1, fascia_oraria = $2 WHERE id = $3',
      ['tempo_indeterminato', 'diurna', utenteTest.id]);
    await db.query(
      `INSERT INTO timbrature (user_id, tipo, timestamp) VALUES
       ($1, 'entrata', '2027-06-30 08:00:00'), ($1, 'uscita', '2027-06-30 16:00:00')`,
      [utenteTest.id]
    );

    const res = await request(app)
      .get(`/api/hr/timbrature/report-mensile?mese=${MESE}`)
      .set(authHeader.titolare())
      .responseType('blob');
    expect(res.status).toBe(200);

    const wb = XLSX.read(res.body, { type: 'buffer' });
    const righe = XLSX.utils.sheet_to_json(wb.Sheets['Consulente'], { header: 1 });

    // Intestazione: l'ultima colonna giorno deve essere '30' (giugno ha 30
    // giorni) seguita da 'Totale' — se ultimoGiorno fosse ancora sballato
    // a '29' l'intestazione avrebbe una colonna in meno.
    expect(righe[0][righe[0].length - 2]).toBe('30');

    const rigaOre = righe.find(r => r[0] === `${utenteTest.cognome} ${utenteTest.nome}`);
    expect(rigaOre[30]).toBe(8); // colonna giorno 30
    expect(rigaOre[rigaOre.length - 1]).toBe(8); // Totale
  });

  test('turno a cavallo di fine ANNO: le ore restano nel mese/anno di entrata', async () => {
    const db = getPool();
    await db.query('UPDATE users SET contratto_tipo = $1, fascia_oraria = $2 WHERE id = $3',
      ['tempo_indeterminato', 'notturna', utenteTest.id]);
    // 31 dicembre 2027 23:00 → 1 gennaio 2028 07:00
    await db.query(
      `INSERT INTO timbrature (user_id, tipo, timestamp) VALUES
       ($1, 'entrata', '2027-12-31 23:00:00'), ($1, 'uscita', '2028-01-01 07:00:00')`,
      [utenteTest.id]
    );

    const resDicembre = await request(app)
      .get('/api/hr/timbrature/report-mensile?mese=2027-12')
      .set(authHeader.titolare())
      .responseType('blob');
    const wbDic = XLSX.read(resDicembre.body, { type: 'buffer' });
    const righeDic = XLSX.utils.sheet_to_json(wbDic.Sheets['Consulente'], { header: 1 });
    const rigaDic = righeDic.find(r => r[0] === `${utenteTest.cognome} ${utenteTest.nome}`);
    expect(rigaDic[31]).toBe(8); // 31 dicembre: le ore ci sono

    const resGennaio = await request(app)
      .get('/api/hr/timbrature/report-mensile?mese=2028-01')
      .set(authHeader.titolare())
      .responseType('blob');
    const wbGen = XLSX.read(resGennaio.body, { type: 'buffer' });
    const righeGen = XLSX.utils.sheet_to_json(wbGen.Sheets['Consulente'], { header: 1 });
    const rigaGen = righeGen.find(r => r[0] === `${utenteTest.cognome} ${utenteTest.nome}`);
    // Nessun doppio conteggio: a gennaio l'utente non ha ore (solo la coda
    // dell'entrata di dicembre, già contata lì)
    expect(rigaGen === undefined || rigaGen[1] === '').toBe(true);
  });
});
