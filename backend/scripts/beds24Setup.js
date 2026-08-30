// backend/scripts/beds24Setup.js
// Uso: node scripts/beds24Setup.js <invite-code>
// Scambia un invite code (generato a mano in Beds24 ▸ MARKETPLACE ▸ API,
// valido 24h, one-shot) con un refresh token duraturo, salvato in
// beds24_config. Da eseguire una sola volta per collegare l'account —
// stesso pattern operativo di scripts/generaC59.js.

require('dotenv').config();
const { scambiaInviteCode } = require('../lib/beds24Client');

async function main() {
  const inviteCode = process.argv[2];
  if (!inviteCode) {
    console.error('Uso: node scripts/beds24Setup.js <invite-code>');
    process.exit(1);
  }

  try {
    const risultato = await scambiaInviteCode(inviteCode);
    console.log('Collegamento Beds24 riuscito.');
    console.log(`Token valido per ${risultato.expiresIn} secondi, refresh token salvato su beds24_config.`);
    process.exit(0);
  } catch (err) {
    console.error('Collegamento Beds24 fallito:', err.message);
    process.exit(1);
  }
}

main();
