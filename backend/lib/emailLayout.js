// Layout HTML condiviso da tutte le email in uscita (modulo 5.3, estensione
// 04/08/2026): le 3 email automatiche (backend/lib/emailPrenotazioni.js) e le
// offerte dedicate (backend/lib/offerteEmail.js) usano lo stesso involucro e
// lo stesso footer, letto da impostazioni_email (Impostazioni ▸ Testi email).
// Anche la sostituzione dei placeholder {nome_ospite}/{elenco_soggiorni}/
// {hotel} nei testi salvati in email_template vive qui, per non duplicarla
// tra invio automatico e pulsante di test.

const pool = require('../config/db');

const NOME_HOTEL = 'Hotel del Golfo';

function escapeTesto(valore) {
  return String(valore ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Converte testo semplice (con a-capo) in paragrafi HTML — il corpo salvato
// in email_template/offerte_email è sempre testo semplice, mai HTML scritto
// a mano dall'operatore.
function testoInHtml(testo) {
  return escapeTesto(testo)
    .split('\n')
    .map(riga => riga.trim() === '' ? '<br>' : `<p style="margin:0 0 12px;">${riga}</p>`)
    .join('');
}

// Sostituisce {nome_ospite} e {hotel} (testo, va scappato) e qualunque
// placeholder elencato in blocchiHtml (es. {elenco_soggiorni},
// {link_pre_checkin} — HTML già pronto, <ul>/<a>, non va scappato: si
// spezza il testo attorno ad ogni occorrenza e si inserisce l'HTML tra i
// pezzi già convertiti). Usata da tutte le email — automatiche, pulsante di
// test, offerte, inviti al pre check-in — così la sostituzione vive in un
// solo posto.
function renderizzaCorpoEmail(corpoTemplate, { nomeOspite, hotel, blocchiHtml = {} } = {}) {
  let testo = String(corpoTemplate ?? '')
    .split('{nome_ospite}').join(nomeOspite ?? 'Gentile cliente')
    .split('{hotel}').join(hotel ?? NOME_HOTEL);

  const segmenti = [testo];
  for (const [placeholder, html] of Object.entries(blocchiHtml)) {
    const chiave = `{${placeholder}}`;
    const nuoviSegmenti = [];
    for (const segmento of segmenti) {
      // I segmenti HTML già inseriti (stringhe che non sono l'ultimo pezzo di
      // testo originale) non vengono più riscansionati: split solo sul testo,
      // marcato con un flag implicito (segmento string vs {html:true}).
      if (typeof segmento !== 'string') { nuoviSegmenti.push(segmento); continue; }
      const parti = segmento.split(chiave);
      parti.forEach((parte, i) => {
        nuoviSegmenti.push(parte);
        if (i < parti.length - 1) nuoviSegmenti.push({ html });
      });
    }
    segmenti.length = 0;
    segmenti.push(...nuoviSegmenti);
  }

  return segmenti.map(s => (typeof s === 'string' ? testoInHtml(s) : s.html)).join('');
}

// Il template contiene questo placeholder? Usata dal chiamante (job
// promemoria, invito pre check-in) per decidere se aggiungere comunque il
// blocco in coda quando il testo non lo cita esplicitamente — così l'ospite
// riceve sempre il link quando previsto, anche se il titolare non ha
// ancora aggiornato il testo da Impostazioni ▸ Testi email.
function contienePlaceholder(corpoTemplate, placeholder) {
  return String(corpoTemplate ?? '').includes(`{${placeholder}}`);
}

// Bottone HTML per il link di pre check-in — stesso blocco sia se inserito
// tramite {link_pre_checkin} nel testo sia se aggiunto in coda come fallback.
function bloccoLinkPreCheckin(link) {
  return `<p style="margin:16px 0;"><a href="${escapeTesto(link)}" style="display:inline-block; background:#0a3d5c; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none;">Completa il pre check-in</a></p>`;
}

async function recuperaFooter() {
  const result = await pool.query(
    'SELECT footer_indirizzo, footer_telefono, footer_email, footer_sito, logo_url FROM impostazioni_email WHERE id = 1',
    []
  );
  return result.rows[0] || {};
}

// Involucro HTML comune — intestazione, corpo, footer con i dati dell'hotel
// (Impostazioni ▸ Testi email). Il logo compare solo se logo_url è
// valorizzato: il gestionale è raggiungibile solo da LAN oggi (1.10 Deploy
// VPS non fatto), quindi serve un URL pubblico esterno, non un upload locale.
async function involucroHtml(titolo, corpoHtml) {
  const footer = await recuperaFooter();
  const righeFooter = [footer.footer_indirizzo, footer.footer_telefono, footer.footer_email, footer.footer_sito]
    .filter(Boolean)
    .map(escapeTesto)
    .join(' · ');

  return `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
    ${footer.logo_url ? `<img src="${escapeTesto(footer.logo_url)}" alt="${NOME_HOTEL}" style="max-height:60px; margin-bottom:16px;" />` : ''}
    <h2 style="color: #0a3d5c;">${escapeTesto(titolo)}</h2>
    ${corpoHtml}
    <p style="margin-top: 24px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 12px;">
      <strong>${NOME_HOTEL}</strong>${righeFooter ? `<br>${righeFooter}` : ''}
    </p>
  </div>`;
}

module.exports = { NOME_HOTEL, escapeTesto, testoInHtml, renderizzaCorpoEmail, involucroHtml, contienePlaceholder, bloccoLinkPreCheckin };
