// OCR documenti d'identità — Modulo 5.2 Fase A (03/08/2026).
// Stesso motore già in uso in frontend/app/ztl/page.jsx (tesseract.js,
// createWorker + recognize su una foto singola, MAI streaming live — vedi
// il commento in cima a frontend/app/magazzino/scansiona/page.jsx per il
// perché: getUserMedia richiede un contesto sicuro (HTTPS/localhost), che
// in LAN su IP semplice non c'è finché non si fa il deploy VPS, modulo 1.10).
// File indipendente, non importato da/importante per ztl/page.jsx — quel
// modulo è "non toccare" per convenzione (CLAUDE.md Sezione 13), quindi
// niente refactor condiviso: piccola duplicazione di pattern accettata.
//
// Legge il testo dalla foto e, se presente, prova a interpretare la zona
// MRZ (Machine Readable Zone) di passaporti/carte d'identità con chip —
// due formati standard ICAO 9303:
//   TD3 (passaporto):    2 righe da 44 caratteri
//   TD1 (carta d'identità elettronica): 3 righe da 30 caratteri
// Se non trova una MRZ valida (es. vecchia carta d'identità cartacea senza
// zona leggibile a macchina), restituisce comunque il testo grezzo
// riconosciuto — il chiamante lo mostra per il completamento manuale.
// Il risultato non viene MAI salvato automaticamente: è solo una proposta
// di precompilazione che l'operatore deve sempre poter correggere.

// Charset ammesso nella zona MRZ: solo maiuscole, cifre e '<' di riempimento.
const CARATTERI_MRZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

// Esegue l'OCR su una foto e prova a estrarne i dati del documento.
// Restituisce { testoGrezzo, mrz: {...} | null, confidenza: 'alta'|'bassa' }.
export async function leggiDocumento(file) {
  const { createWorker } = await import('tesseract.js');
  // Le carte lucide/olografiche (es. CIE) producono foto con riflessi e
  // gradienti di luce che variano molto scatto per scatto — anche seguendo
  // bene i consigli (vicino, a fuoco, dritto) l'affidabilità dell'OCR resta
  // incostante. Appiattire l'immagine in bianco/nero puro prima di passarla
  // a tesseract aiuta molto e in modo più ripetibile che affidarsi solo
  // alla qualità dello scatto. Se il preprocessing fallisce per qualche
  // motivo, si prosegue comunque con la foto originale.
  const immagine = await preelaboraImmagine(file).catch(() => file);
  const worker = await createWorker('eng');
  try {
    const { data: { text } } = await worker.recognize(immagine);
    const testoGrezzo = text;
    let mrz = estraiMrz(text);

    // La prima passata usa il layout automatico di default, pensato per
    // pagine di testo — su una foto intera del documento (volto, sfondo
    // colorato, codice a barre) spesso non isola bene la striscia MRZ,
    // piccola e in font monospaziato. Se non troviamo nulla, ritentiamo con
    // impostazioni mirate: charset ristretto ai soli caratteri ammessi in
    // MRZ (elimina il rumore di minuscole/punteggiatura lette per errore) e
    // layout "sparse text" (PSM 11), più adatto a isolare una striscia di
    // testo dentro una foto non ritagliata rispetto al layout automatico.
    if (!mrz) {
      await worker.setParameters({
        tessedit_char_whitelist: CARATTERI_MRZ,
        tessedit_pageseg_mode: '11',
      });
      const { data: { text: testoRitentativo } } = await worker.recognize(immagine);
      mrz = estraiMrz(testoRitentativo);
    }

    // Terzo tentativo (test, 04/08/2026): modello Tesseract specializzato
    // per la sola zona MRZ — addestrato sul font OCR-B della MRZ invece che
    // su testo "normale" come il modello generico 'eng'. File .traineddata
    // ospitato in questo stesso progetto (public/tessdata/mrz.traineddata.gz,
    // estratto dal pacchetto open source "web-mrz-reader", licenza ISC — non
    // installato come dipendenza: bastava il singolo file del modello, non
    // il resto del pacchetto, e la sua dipendenza da tesseract.js^5 avrebbe
    // creato un conflitto con la versione 7 già in uso per ZTL). Un worker
    // dedicato, separato da quello sopra, perché richiede un langPath
    // diverso (i pass 'eng' usano il CDN di default di tesseract.js).
    if (!mrz) {
      try {
        const workerMrz = await createWorker('mrz', 1, { langPath: '/tessdata' });
        try {
          const { data: { text: testoMrz } } = await workerMrz.recognize(immagine);
          mrz = estraiMrz(testoMrz);
        } finally {
          await workerMrz.terminate();
        }
      } catch {
        // Modello specializzato non caricabile per qualche motivo: si
        // prosegue comunque con l'esito dei primi due tentativi, senza
        // bloccare la funzione.
      }
    }

    return { testoGrezzo, mrz, confidenza: mrz ? 'alta' : 'bassa' };
  } finally {
    await worker.terminate();
  }
}

// Converte la foto in bianco/nero puro (scala di grigi + soglia automatica
// di Otsu, che si adatta da sola alla luce di ogni scatto invece di un
// valore fisso) prima dell'OCR — riduce di molto l'effetto dei riflessi
// sulle carte lucide/olografiche sulla lettura dei singoli caratteri.
async function preelaboraImmagine(file) {
  const bitmap = await createImageBitmap(file);
  // Ingrandisce solo le foto a bassa risoluzione (es. da libreria/compresse):
  // le foto scattate da vicino con la fotocamera sono già ad alta risoluzione.
  const scala = bitmap.width < 1200 ? 2 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scala);
  canvas.height = Math.round(bitmap.height * scala);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const immagineDati = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const dati = immagineDati.data;
  const numPixel = dati.length / 4;
  const grigi = new Uint8ClampedArray(numPixel);
  const istogramma = new Array(256).fill(0);
  for (let i = 0, p = 0; i < dati.length; i += 4, p++) {
    const grigio = Math.round(0.299 * dati[i] + 0.587 * dati[i + 1] + 0.114 * dati[i + 2]);
    grigi[p] = grigio;
    istogramma[grigio]++;
  }
  const soglia = sogliaOtsu(istogramma, numPixel);
  // <= e non <: sogliaOtsu calcola la classe "scura" come somma cumulativa
  // istogramma[0..soglia] inclusa — usare '<' qui disallineerebbe la soglia
  // dal suo stesso calcolo, classificando come chiari (255) proprio i pixel
  // di valore uguale alla soglia che invece dovrebbero risultare scuri (0).
  for (let i = 0, p = 0; i < dati.length; i += 4, p++) {
    const valore = grigi[p] <= soglia ? 0 : 255;
    dati[i] = dati[i + 1] = dati[i + 2] = valore;
  }
  ctx.putImageData(immagineDati, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('toBlob fallito'))), 'image/png');
  });
}

// Metodo di Otsu: trova nell'istogramma della foto la soglia di bianco/nero
// che separa meglio le due classi di pixel (testo scuro / sfondo chiaro) —
// si adatta da sola alla luce di ogni scatto, a differenza di un valore
// fisso che con luce diversa scatto per scatto avrebbe fatto più danni che
// benefici.
function sogliaOtsu(istogramma, totalePixel) {
  let sommaTotale = 0;
  for (let i = 0; i < 256; i++) sommaTotale += i * istogramma[i];

  let sommaB = 0, pesoB = 0, varianzaMax = 0, soglia = 128;
  for (let i = 0; i < 256; i++) {
    pesoB += istogramma[i];
    if (pesoB === 0) continue;
    const pesoF = totalePixel - pesoB;
    if (pesoF === 0) break;
    sommaB += i * istogramma[i];
    const mediaB = sommaB / pesoB;
    const mediaF = (sommaTotale - sommaB) / pesoF;
    const varianza = pesoB * pesoF * (mediaB - mediaF) ** 2;
    if (varianza > varianzaMax) {
      varianzaMax = varianza;
      soglia = i;
    }
  }
  return soglia;
}

// Isola le righe che sembrano MRZ (solo A-Z, 0-9, '<', lunghezza vicina a
// 30 o 44) e prova prima il formato TD3 (passaporto), poi TD1 (carta
// d'identità). L'OCR spesso introduce spazi spuri nella MRZ (dove ci sono
// i riempitivi '<'): li rimuoviamo prima di valutare la lunghezza riga.
// Pattern strutturale della riga 2 del TD1 (dati anagrafici): nascita YYMMDD
// + cifra di controllo + sesso + scadenza YYMMDD — molto riconoscibile anche
// se il resto della riga (dato opzionale + controllo finale) manca.
const RE_RIGA2_TD1 = /^\d{6}\d[MF<]\d{6}/;
// Riconosce la riga 3 del TD1 (nome: COGNOME<<NOME) in modo tollerante al
// rumore OCR sul separatore — che dovrebbe essere sempre '<<' ma l'OCR a
// volte lo legge come un solo '<', tre '<', o con un carattere spurio in
// mezzo. Divide su QUALSIASI sequenza di '<' invece di richiedere
// esattamente '<<': se il primo pezzo sembra un vero cognome (solo lettere,
// almeno 2 caratteri), il resto — anche se rumoroso — è comunque meglio di
// niente per la precompilazione, tanto il campo resta sempre correggibile.
function estraiNomeRigaTd1(riga) {
  const pezzi = riga.split(/<+/).filter(Boolean);
  if (pezzi.length < 2 || !/^[A-Z]{2,}$/.test(pezzi[0])) return null;
  return { cognome: pezzi[0], nome: pezzi.slice(1).join(' ') };
}

function estraiMrz(testoGrezzo) {
  const righeGrezze = testoGrezzo.split(/\r?\n/).map(r => r.toUpperCase().replace(/[^A-Z0-9<]/g, ''));
  const righe = righeGrezze.filter(r => r.length >= 28); // scarta subito righe troppo corte per essere MRZ

  // TD3 — passaporto: 2 righe consecutive di ~44 caratteri, la prima inizia con 'P<'
  for (let i = 0; i < righe.length - 1; i++) {
    if (righe[i].startsWith('P<') && vicinoALunghezza(righe[i], 44) && vicinoALunghezza(righe[i + 1], 44)) {
      const risultato = parseTd3(righe[i], righe[i + 1]);
      if (risultato) return risultato;
    }
  }

  // TD1 — carta d'identità: 3 righe consecutive di ~30 caratteri (lettura pulita)
  for (let i = 0; i < righe.length - 2; i++) {
    if (vicinoALunghezza(righe[i], 30) && vicinoALunghezza(righe[i + 1], 30) && vicinoALunghezza(righe[i + 2], 30)) {
      const risultato = parseTd1(righe[i], righe[i + 1], righe[i + 2]);
      if (risultato) return risultato;
    }
  }

  // Fallback TD1: sulle carte lucide/olografiche (es. CIE) i caratteri di
  // riempimento '<' a fine riga hanno poco contrasto e l'OCR spesso li
  // perde, facendo fallire il controllo di lunghezza sopra anche quando i
  // dati veri sono stati letti bene. Qui non guardiamo più la lunghezza ma
  // la FORMA delle righe 2 e 3 (le più leggibili, testo nero su sfondo
  // chiaro) — se le troviamo, meglio precompilare nome/nascita/sesso/
  // nazionalità/scadenza che niente, anche senza la riga 1 (numero
  // documento, spesso più vicina al codice a barre e più difficile da
  // isolare): quel campo resta vuoto, da completare a mano.
  const idxRiga2 = righeGrezze.findIndex(r => RE_RIGA2_TD1.test(r));
  if (idxRiga2 !== -1) {
    let datiNome = null;
    let idxRiga3 = -1;
    for (let i = idxRiga2 + 1; i <= idxRiga2 + 2 && i < righeGrezze.length; i++) {
      datiNome = estraiNomeRigaTd1(righeGrezze[i]);
      if (datiNome) { idxRiga3 = i; break; }
    }
    if (idxRiga3 !== -1) {
      const riga2 = righeGrezze[idxRiga2].padEnd(30, '<');
      const dataNascita = parseDataMrz(riga2.slice(0, 6), 'nascita');
      const sesso = riga2[7] === 'M' ? 'M' : riga2[7] === 'F' ? 'F' : null;
      const scadenza = parseDataMrz(riga2.slice(8, 14), 'scadenza');
      const nazionalita = correggiCifreComeLettere(riga2.slice(15, 18).replace(/</g, '').trim());
      const { cognome, nome } = datiNome;
      if (cognome) {
        return {
          formato: 'TD1 (carta d\'identità — lettura parziale, controlla il numero documento)',
          cognome, nome,
          numeroDocumento: '', // riga 1 non isolata in modo affidabile: da inserire a mano
          nazionalita, dataNascita, sesso, scadenza,
        };
      }
    }
  }

  return null;
}

function vicinoALunghezza(riga, attesa, tolleranza = 3) {
  return Math.abs(riga.length - attesa) <= tolleranza;
}

// YYMMDD → 'YYYY-MM-DD'. Euristica sul secolo: le date di nascita sono quasi
// sempre nel passato (1900-oggi), le scadenze quasi sempre future (oggi-2100)
// — usiamo `tipo` per scegliere il secolo più plausibile invece di una
// singola regola per entrambe.
function parseDataMrz(yymmdd, tipo) {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const gg = yymmdd.slice(4, 6);
  const annoCorrente2cifre = new Date().getFullYear() % 100;
  let secolo;
  if (tipo === 'scadenza') {
    // Le scadenze sono sempre nel futuro (o al più recentissimo passato) —
    // se yy è molto minore dell'anno corrente a 2 cifre, è comunque 20xx
    // (es. un documento emesso nel 2020 con scadenza 2030: yy=30 > annoCorrente).
    secolo = 2000;
  } else {
    // Nascita: se yy risulta "nel futuro" rispetto a oggi, è quasi certamente 19xx.
    secolo = yy > annoCorrente2cifre ? 1900 : 2000;
  }
  const anno = secolo + yy;
  if (Number(mm) < 1 || Number(mm) > 12) return null;
  return `${anno}-${mm}-${gg}`;
}

// Corregge le confusioni OCR più comuni cifra↔lettera (0/O, 1/I, 5/S, 8/B)
// in un campo che nella MRZ può contenere SOLO lettere per costruzione (es.
// il codice nazionalità a 3 lettere) — una cifra lì è sempre un errore di
// lettura, mai un dato vero, quindi la sostituzione è sicura.
function correggiCifreComeLettere(campo) {
  return campo.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B');
}

function parseNomeCognomeMrz(campoNome) {
  // Formato MRZ: COGNOME<<NOME<PROPRIO<<<<<<<<<<<<< (riempito con '<' fino
  // alla lunghezza fissa) — il primo blocco è il cognome, il resto (fino ai
  // riempitivi finali) sono i nomi propri. Si divide su QUALSIASI sequenza
  // di '<' (non solo '<<' esatto): l'OCR a volte legge il separatore come
  // un solo '<' o con rumore in mezzo invece dei due canonici — vedi
  // estraiNomeRigaTd1, stessa tolleranza applicata anche qui per coerenza.
  const pezzi = campoNome.split(/<+/).filter(Boolean);
  const cognome = pezzi[0] ?? '';
  const nome = pezzi.slice(1).join(' ');
  return { cognome, nome };
}

function parseTd3(riga1, riga2) {
  try {
    const campoNome = riga1.slice(5); // dopo 'P<ISS'
    const { cognome, nome } = parseNomeCognomeMrz(campoNome);
    const numeroDocumento = riga2.slice(0, 9).replace(/</g, '').trim();
    const nazionalita = correggiCifreComeLettere(riga2.slice(10, 13).replace(/</g, '').trim());
    const dataNascita = parseDataMrz(riga2.slice(13, 19), 'nascita');
    const sesso = riga2[20] === 'M' ? 'M' : riga2[20] === 'F' ? 'F' : null;
    const scadenza = parseDataMrz(riga2.slice(21, 27), 'scadenza');
    if (!cognome && !numeroDocumento) return null; // troppo poco per fidarsi
    return {
      formato: 'TD3 (passaporto)',
      cognome, nome, numeroDocumento, nazionalita,
      dataNascita, sesso, scadenza,
    };
  } catch {
    return null;
  }
}

function parseTd1(riga1, riga2, riga3) {
  try {
    const numeroDocumento = riga1.slice(5, 14).replace(/</g, '').trim();
    const dataNascita = parseDataMrz(riga2.slice(0, 6), 'nascita');
    const sesso = riga2[7] === 'M' ? 'M' : riga2[7] === 'F' ? 'F' : null;
    const scadenza = parseDataMrz(riga2.slice(8, 14), 'scadenza');
    const nazionalita = correggiCifreComeLettere(riga2.slice(15, 18).replace(/</g, '').trim());
    const { cognome, nome } = parseNomeCognomeMrz(riga3);
    if (!cognome && !numeroDocumento) return null;
    return {
      formato: 'TD1 (carta d\'identità)',
      cognome, nome, numeroDocumento, nazionalita,
      dataNascita, sesso, scadenza,
    };
  } catch {
    return null;
  }
}
