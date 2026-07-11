'use client';

// Pagina scansione fotocamera magazzino — due modalità via query param ?modo=:
//   barcode → scan EAN prodotto nuovo → lookup Open Food Facts → form → crea prodotto
//   qr      → scan QR scaffale prodotto esistente → form quantità → registra movimento
// Il flusso è autonomo: la scansione, il form e il salvataggio avvengono tutti qui,
// poi si torna a /magazzino. Nessuna chiamata a API esterne dal frontend (Open Food
// Facts passa sempre dal backend, vedi magazzinoController.lookupEan).

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Camera, X, ArrowLeft } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import api from '@/lib/api';

function ScansionaInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const modo = searchParams.get('modo') === 'barcode' ? 'barcode' : 'qr';

  const [scansionato, setScansionato] = useState(null); // codice letto dalla fotocamera
  const [cercando, setCercando] = useState(false);
  const [erroreScan, setErroreScan] = useState(null);
  const [erroreCamera, setErroreCamera] = useState(null);
  const scannerRef = useRef(null);

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

  // Avvia la fotocamera al mount, la ferma allo smontaggio o dopo una scansione riuscita.
  useEffect(() => {
    let attivo = true;
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (!attivo) return;
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          scanner.stop().catch(() => {});
          setScansionato(decodedText);
        },
        () => {} // errore di frame singolo (nessun codice nel fotogramma) — ignorato
      ).catch((err) => {
        setErroreCamera('Impossibile accedere alla fotocamera. Verifica i permessi del browser.');
        console.error('Errore avvio fotocamera:', err);
      });
    });
    return () => {
      attivo = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
          scannerRef.current?.clear?.();
        });
      }
    };
  }, []);

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
    setScansionato(null); setErroreScan(null); setProdottoQr(null); setDatiProdotto(null);
    window.location.reload(); // il modo più semplice per riavviare pulito la fotocamera
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

        {!scansionato && (
          <>
            {erroreCamera ? (
              <p className="text-center py-8 text-sm" style={{ color: 'var(--status-red-text)' }}>{erroreCamera}</p>
            ) : (
              <div id="qr-reader" className="w-full rounded-xl overflow-hidden" style={{ background: '#000' }} />
            )}
            <p className="text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
              <Camera size={14} className="inline mr-1" />
              Inquadra il {modo === 'barcode' ? 'barcode del prodotto' : 'QR sullo scaffale'}
            </p>
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
