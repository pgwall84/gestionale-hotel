'use client';

// Pagina scansione fotocamera magazzino — due modalità via query param ?modo=:
//   barcode → scan EAN prodotto nuovo → lookup Open Food Facts → form → crea prodotto
//   qr      → scan QR scaffale prodotto esistente → form quantità → registra movimento
// Il flusso è autonomo: la scansione, il form e il salvataggio avvengono tutti qui,
// poi si torna a /magazzino. Nessuna chiamata a API esterne dal frontend (Open Food
// Facts passa sempre dal backend, vedi magazzinoController.lookupEan).
//
// Acquisizione: scatto foto singolo (input file + capture="environment"), NON
// streaming live. Html5Qrcode.start() (video live) richiede getUserMedia, che i
// browser bloccano fuori da un contesto sicuro (HTTPS o localhost) — sul telefono
// in LAN si accede via IP semplice (http://192.168.x.x:7000), quindi lo streaming
// live fallisce con "camera streaming not supported". Html5Qrcode.scanFile() invece
// decodifica un'immagine già scattata (canvas, lato client) senza toccare la
// fotocamera live: nessun requisito di contesto sicuro. Stesso approccio già usato
// da ZTL per l'OCR targhe (foto nativa, non live).

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Camera, ArrowLeft } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import api from '@/lib/api';

// Le foto scattate da fotocamera sono spesso enormi (3000x4000px) — Html5Qrcode
// decodifica alla risoluzione originale (nessun resize interno), il che peggiora
// il riconoscimento dei barcode 1D (EAN). Ridimensionare prima della decodifica
// migliora sensibilmente la percentuale di successo.
function ridimensionaImmagine(file, latoMax = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scala = Math.min(1, latoMax / Math.max(img.width, img.height));
      const w = Math.round(img.width * scala);
      const h = Math.round(img.height * scala);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Impossibile elaborare la foto.')); return; }
        resolve(new File([blob], file.name || 'foto.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.9);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Impossibile caricare la foto.')); };
    img.src = url;
  });
}

function ScansionaInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const modo = searchParams.get('modo') === 'barcode' ? 'barcode' : 'qr';

  const [scansionato, setScansionato] = useState(null); // codice decodificato dalla foto
  const [cercando, setCercando] = useState(false);
  const [erroreScan, setErroreScan] = useState(null);
  const [erroreLettura, setErroreLettura] = useState(null); // nessun codice trovato nella foto
  const [leggendoFoto, setLeggendoFoto] = useState(false);
  const fileInputRef = useRef(null);

  // Dati del prodotto trovato/lookup (per il form successivo)
  const [datiProdotto, setDatiProdotto] = useState(null); // { nome, categoria } da EAN
  const [prodottoQr, setProdottoQr] = useState(null);     // { id, nome, ... } da QR

  // Form nuovo prodotto (dopo scan barcode)
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');
  const [unitaMisura, setUnitaMisura] = useState('');
  const [sogliaMinima, setSogliaMinima] = useState('');

  // Form movimento (dopo scan QR)
  const [tipo, setTipo] = useState('scarico');
  const [quantita, setQuantita] = useState('');

  const [salvando, setSalvando] = useState(false);
  const [inserimentoManuale, setInserimentoManuale] = useState(false);
  const [codiceManuale, setCodiceManuale] = useState('');

  // L'utente tocca il pulsante → si apre la fotocamera nativa del telefono (capture)
  // → alla scelta della foto, la ridimensioniamo e la decodifichiamo lato client
  // (no streaming). formatsToSupport limita la ricerca al tipo di codice atteso
  // (più veloce e più accurato); useBarCodeDetectorIfSupported usa il decoder
  // nativo del browser quando disponibile — più robusto dello zxing via JS puro
  // su foto reali, soprattutto per barcode 1D (EAN).
  const onFotoScattata = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permette di riselezionare la stessa foto in caso di retry
    if (!file) return;

    setLeggendoFoto(true);
    setErroreLettura(null);
    try {
      const fileRidotto = await ridimensionaImmagine(file);
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      const formati = modo === 'barcode'
        ? [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
           Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
           Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39]
        : [Html5QrcodeSupportedFormats.QR_CODE];
      const scanner = new Html5Qrcode('qr-reader', {
        formatsToSupport: formati,
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      });
      const decodedText = await scanner.scanFile(fileRidotto, false);
      scanner.clear();
      setScansionato(decodedText);
    } catch (err) {
      setErroreLettura('Nessun codice leggibile nella foto. Avvicinati, illumina bene e inquadra il codice ben dritto e a fuoco, poi riprova — oppure inseriscilo a mano qui sotto.');
      console.error('Errore decodifica foto:', err);
    } finally {
      setLeggendoFoto(false);
    }
  };

  // Dopo la scansione, cerca il prodotto (EAN → Open Food Facts, QR → nostro DB)
  useEffect(() => {
    if (!scansionato) return;
    setCercando(true);
    setErroreScan(null);
    if (modo === 'barcode') {
      api.get(`/magazzino/prodotti/lookup-ean/${encodeURIComponent(scansionato)}`)
        .then(r => {
          if (r.data.trovato) {
            setDatiProdotto({ nome: r.data.nome, categoria: r.data.categoria });
            setNome(r.data.nome);
            setCategoria(r.data.categoria);
          } else {
            setDatiProdotto({ nome: '', categoria: '' }); // form manuale, EAN già noto
          }
        })
        .catch(() => setDatiProdotto({ nome: '', categoria: '' }))
        .finally(() => setCercando(false));
    } else {
      api.get(`/magazzino/prodotti/qr/${encodeURIComponent(scansionato)}`)
        .then(r => setProdottoQr(r.data.prodotto))
        .catch(err => setErroreScan(err.response?.data?.errore || 'QR non riconosciuto.'))
        .finally(() => setCercando(false));
    }
  }, [scansionato, modo]);

  const creaProdotto = async () => {
    setSalvando(true);
    try {
      await api.post('/magazzino/prodotti', {
        nome, categoria, unita_misura: unitaMisura, soglia_minima: sogliaMinima || 0, barcode_ean: scansionato,
      });
      router.push('/magazzino');
    } catch (err) {
      alert(err.response?.data?.errore || err.message);
    } finally {
      setSalvando(false);
    }
  };

  const registraMovimento = async () => {
    setSalvando(true);
    try {
      await api.post('/magazzino/movimenti', { prodotto_id: prodottoQr.id, tipo, quantita });
      router.push('/magazzino');
    } catch (err) {
      alert(err.response?.data?.errore || err.message);
    } finally {
      setSalvando(false);
    }
  };

  const riprova = () => {
    setScansionato(null); setErroreScan(null); setErroreLettura(null);
    setProdottoQr(null); setDatiProdotto(null);
    fileInputRef.current?.click();
  };

  return (
    <AppShell titolo="Scansiona">
      <div className="flex flex-col gap-4 max-w-xl mx-auto">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/magazzino')} style={{ color: 'var(--primary)' }}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>
            {modo === 'barcode' ? 'Scansiona barcode EAN' : 'Scansiona QR scaffale'}
          </h1>
        </div>

        {/* Contenitore richiesto da Html5Qrcode anche in modalità scanFile (non mostra video live) */}
        <div id="qr-reader" style={{ display: 'none' }} />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFotoScattata}
          style={{ display: 'none' }}
        />

        {!scansionato && (
          <>
            <button onClick={() => fileInputRef.current?.click()}
                    disabled={leggendoFoto}
                    className="w-full py-10 rounded-xl flex flex-col items-center gap-2"
                    style={{ background: 'var(--muted)', border: '2px dashed var(--border)', opacity: leggendoFoto ? 0.6 : 1 }}>
              <Camera size={32} style={{ color: 'var(--primary)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {leggendoFoto ? 'Lettura in corso...' : `Scatta foto del ${modo === 'barcode' ? 'barcode' : 'QR'}`}
              </span>
            </button>
            <p className="text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Inquadra il {modo === 'barcode' ? 'barcode del prodotto' : 'QR sullo scaffale'} ben centrato e a fuoco
            </p>
            {erroreLettura && (
              <div className="flex flex-col gap-3 items-center py-2">
                <p className="text-sm text-center" style={{ color: 'var(--status-red-text)' }}>{erroreLettura}</p>
                <button onClick={riprova} className="px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                  Riprova
                </button>
              </div>
            )}

            {/* Rete di sicurezza: se la foto continua a non decodificare, inserimento manuale */}
            {!inserimentoManuale ? (
              <button onClick={() => setInserimentoManuale(true)}
                      className="text-center text-xs underline"
                      style={{ color: 'var(--muted-foreground)' }}>
                Il codice non si legge? Inseriscilo a mano
              </button>
            ) : (
              <div className="flex gap-2">
                <input type="text" placeholder={modo === 'barcode' ? 'Codice EAN' : 'Codice QR'}
                       value={codiceManuale} onChange={e => setCodiceManuale(e.target.value)}
                       className="flex-1 rounded-xl p-3 text-sm"
                       style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />
                <button onClick={() => setScansionato(codiceManuale.trim())}
                        disabled={!codiceManuale.trim()}
                        className="px-4 rounded-xl text-sm font-medium"
                        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: codiceManuale.trim() ? 1 : 0.5 }}>
                  Cerca
                </button>
              </div>
            )}
          </>
        )}

        {scansionato && cercando && (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Ricerca in corso...</p>
        )}

        {scansionato && !cercando && erroreScan && (
          <div className="flex flex-col gap-3 items-center py-8">
            <p className="text-sm text-center" style={{ color: 'var(--status-red-text)' }}>{erroreScan}</p>
            <button onClick={riprova} className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
              Riprova
            </button>
          </div>
        )}

        {/* Form nuovo prodotto dopo scan EAN */}
        {scansionato && !cercando && modo === 'barcode' && datiProdotto && (
          <div className="flex flex-col gap-3">
            {datiProdotto.nome ? (
              <p className="text-xs" style={{ color: 'var(--status-green-text)' }}>Trovato su Open Food Facts — verifica e completa i dati.</p>
            ) : (
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Prodotto non trovato online — inserisci i dati manualmente.</p>
            )}
            <input type="text" placeholder="Nome prodotto *" value={nome} onChange={e => setNome(e.target.value)}
                   className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />
            <input type="text" placeholder="Categoria" value={categoria} onChange={e => setCategoria(e.target.value)}
                   className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />
            <div className="flex gap-2">
              <input type="text" placeholder="Unità (kg, pz, lt...)" value={unitaMisura} onChange={e => setUnitaMisura(e.target.value)}
                     className="flex-1 rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />
              <input type="number" placeholder="Soglia minima" value={sogliaMinima} onChange={e => setSogliaMinima(e.target.value)}
                     className="flex-1 rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />
            </div>
            <button onClick={creaProdotto} disabled={salvando || !nome.trim()}
                    className="w-full py-3.5 rounded-xl font-bold text-base"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: (salvando || !nome.trim()) ? 0.6 : 1 }}>
              {salvando ? 'Salvataggio...' : 'Crea prodotto'}
            </button>
          </div>
        )}

        {/* Form movimento dopo scan QR */}
        {scansionato && !cercando && modo === 'qr' && prodottoQr && (
          <div className="flex flex-col gap-3">
            <p className="font-semibold text-base" style={{ color: 'var(--foreground)' }}>{prodottoQr.nome}</p>
            <div className="flex gap-2">
              {['scarico', 'carico'].map(t => (
                <button key={t} onClick={() => setTipo(t)}
                        className="flex-1 py-2 rounded-xl text-sm font-medium capitalize"
                        style={{
                          background: tipo === t ? 'var(--primary)' : 'var(--muted)',
                          color: tipo === t ? 'var(--primary-foreground)' : 'var(--foreground)',
                        }}>
                  {t}
                </button>
              ))}
            </div>
            <input type="number" placeholder={`Quantità (${prodottoQr.unita_misura || 'unità'}) *`}
                   value={quantita} onChange={e => setQuantita(e.target.value)}
                   className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />
            <button onClick={registraMovimento} disabled={salvando || !quantita || parseFloat(quantita) <= 0}
                    className="w-full py-3.5 rounded-xl font-bold text-base"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: (salvando || !quantita) ? 0.6 : 1 }}>
              {salvando ? 'Salvataggio...' : `Registra ${tipo}`}
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function ScansionaPage() {
  return (
    <Suspense>
      <ScansionaInner />
    </Suspense>
  );
}
