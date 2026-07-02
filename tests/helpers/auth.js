// Helper autenticazione per i test.
// Genera token JWT firmati direttamente (senza passare per il DB) per ogni ruolo.
// Usato nei test per simulare utenti con permessi diversi.

const jwt = require('jsonwebtoken');

// Payload minimo che i middleware del backend si aspettano su req.utente
function creaToken(opzioni = {}) {
  const payload = {
    id:    opzioni.id    ?? 9999,
    email: opzioni.email ?? 'test@hotel.it',
    ruolo: opzioni.ruolo ?? 'receptionist',
    nome:  opzioni.nome  ?? 'Test',
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// Token pronti per i ruoli più usati nei test
const token = {
  admin:          () => creaToken({ id: 1, ruolo: 'admin',          email: 'admin@hotel.it' }),
  titolare:       () => creaToken({ id: 2, ruolo: 'titolare',       email: 'titolare@hotel.it' }),
  receptionist:   () => creaToken({ id: 3, ruolo: 'receptionist',   email: 'rec@hotel.it' }),
  cameriere:      () => creaToken({ id: 4, ruolo: 'cameriere',      email: 'cam@hotel.it' }),
  cuoco:          () => creaToken({ id: 5, ruolo: 'cuoco',          email: 'cuoco@hotel.it' }),
  portiere_notte: () => creaToken({ id: 6, ruolo: 'portiere_notte', email: 'notte@hotel.it' }),
  dipendente:     () => creaToken({ id: 7, ruolo: 'dipendente',     email: 'dip@hotel.it' }),
};

// Header Authorization pronto per supertest: .set(authHeader.titolare())
const authHeader = {
  admin:          () => ({ Authorization: `Bearer ${token.admin()}` }),
  titolare:       () => ({ Authorization: `Bearer ${token.titolare()}` }),
  receptionist:   () => ({ Authorization: `Bearer ${token.receptionist()}` }),
  cameriere:      () => ({ Authorization: `Bearer ${token.cameriere()}` }),
  cuoco:          () => ({ Authorization: `Bearer ${token.cuoco()}` }),
  portiere_notte: () => ({ Authorization: `Bearer ${token.portiere_notte()}` }),
  dipendente:     () => ({ Authorization: `Bearer ${token.dipendente()}` }),
};

module.exports = { creaToken, token, authHeader };
