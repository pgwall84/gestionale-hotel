'use client';

// Componente riusabile — scansione documento d'identità con OCR (Modulo 5.2
// Fase A, 03/08/2026). Scatto foto singolo (input file + capture="environment"),
// stesso pattern già collaudato in frontend/app/ztl/page.jsx e
// frontend/app/magazzino/scansiona/page.jsx — MAI streaming live (vedi
// commento in frontend/lib/ocrDocumento.js per il perché).
//
// Passo di ritaglio (aggiunto in sessione, dopo test reali su CIE): inquadrare
// a mano solo la fascia MRZ con la fotocamera del telefono si è rivelato
// troppo impreciso — il testo restava troppo piccolo/decentrato e l'OCR
// falliva in modo incostante scatto per scatto. Ora si scatta la foto
// dell'intero retro del documento, poi l'operatore isola con due maniglie
// trascinabili solo la striscia con le righe di caratteri prima di lanciare
// l'OCR — riempendo il fotogramma di ritaglio con solo quel testo si ottiene
// una risoluzione effettiva molto più alta sulla parte che conta.
//
// Non salva mai da solo: onDatiEstratti riceve i campi letti dalla zona MRZ
// (se il documento ne ha una) perché il form del chiamante li precompili,
// sempre modificabili prima del salvataggio vero e proprio.

import { useState, useRef } from 'react';
import { Camera, Loader2, AlertTriangle, CheckCircle2, Check, X } from 'lucide-react';
import { leggiDocumento } from '@/lib/ocrDocumento';

// Fascia di ritaglio di default: sui documenti italiani (CIE, patente) la
// MRZ/le info stampate stanno nella parte bassa del retro — punto di
// partenza comodo, l'operatore la aggiusta trascinando le maniglie.
const RITAGLIO_DEFAULT = { top: 65, bottom: 95 };

export default function ScannerDocumento({ onDatiEstratti }) {
  const fileRef = useRef(null);
  const contenitoreRef = useRef(null);
  const [leggendo, setLeggendo] = useState(false);
  const [errore, setErrore] = useState(null);
  const [esito, setEsito] = useState(null); // 'trovata' | 'non_trovata' | null
  // Documenti senza MRZ (patente di guida, vecchia carta d'identità
  // cartacea) non hanno campi da precompilare, ma il testo letto dalla foto
  // resta comunque utile all'operatore per confrontarlo a vista mentre
  // compila a mano — non buttarlo, solo niente precompilazione automatica.
  const [testoGrezzo, setTestoGrezzo] = useState('');

  // Foto appena scattata, in attesa che l'operatore isoli la fascia MRZ
  // prima di lanciare l'OCR.
  const [fotoInAttesa, setFotoInAttesa] = useState(null); // File
  const [fotoUrl, setFotoUrl] = useState(null);
  const [ritaglio, setRitaglio] = useState(RITAGLIO_DEFAULT);
  const trascinamento = useRef(null); // 'top' | 'bottom' | null

  function handleFotoScattata(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrore(null);
    setEsito(null);
    setTestoGrezzo('');
    setRitaglio(RITAGLIO_DEFAULT);
    setFotoInAttesa(file);
    setFotoUrl(URL.createObjectURL(file));
  }

  function annullaRitaglio() {
    if (fotoUrl) URL.revokeObjectURL(fotoUrl);
    setFotoInAttesa(null);
    setFotoUrl(null);
  }

  function posizionePercentuale(clientY) {
    const rect = contenitoreRef.current.getBoundingClientRect();
    const pct = ((clientY - rect.top) / rect.height) * 100;
    return Math.min(100, Math.max(0, pct));
  }

  function iniziaTrascinamento(maniglia) {
    return (e) => {
      e.preventDefault();
      trascinamento.current = maniglia;
    };
  }

  function muoviTrascinamento(e) {
    if (!trascinamento.current || !contenitoreRef.current) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const pct = posizionePercentuale(clientY);
    setRitaglio((prev) => {
      if (trascinamento.current === 'top') {
        return { ...prev, top: Math.min(pct, prev.bottom - 5) };
      }
      return { ...prev, bottom: Math.max(pct, prev.top + 5) };
    });
  }

  function fineTrascinamento() {
    trascinamento.current = null;
  }

  // Ritaglia la foto originale alla sola fascia selezionata (percentuali →
  // pixel reali sull'immagine intera, indipendente dalla dimensione a
  // schermo) e lancia l'OCR solo su quella porzione.
  async function confermaRitaglioELeggi() {
    setLeggendo(true);
    try {
      const bitmap = await createImageBitmap(fotoInAttesa);
      const yInizio = Math.round((ritaglio.top / 100) * bitmap.height);
      const altezza = Math.round(((ritaglio.bottom - ritaglio.top) / 100) * bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = altezza;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, yInizio, bitmap.width, altezza, 0, 0, bitmap.width, altezza);
      const ritagliato = await new Promise((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob fallito'))), 'image/png')
      );

      const { mrz, testoGrezzo: testo } = await leggiDocumento(ritagliato);
      // Il testo grezzo si mostra sempre (non solo quando la MRZ non viene
      // trovata): utile all'operatore per un controllo veloce, e per fare
      // debug quando la lettura è parziale o sbagliata pur "riuscendo".
      setTestoGrezzo(testo || '');
      if (mrz) {
        setEsito('trovata');
        onDatiEstratti({
          nome: mrz.nome || '',
          cognome: mrz.cognome || '',
          dataNascita: mrz.dataNascita || '',
          documentoNumero: mrz.numeroDocumento || '',
          documentoScadenza: mrz.scadenza || '',
          nazionalita: mrz.nazionalita || '',
          sesso: mrz.sesso || '',
        });
      } else {
        setEsito('non_trovata');
      }
    } catch (err) {
      setErrore('Lettura non riuscita — riprova con una foto più nitida o compila a mano.');
    } finally {
      setLeggendo(false);
      annullaRitaglio();
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
             className="hidden" onChange={handleFotoScattata} />

      {!fotoInAttesa && (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={leggendo}
                className="flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border disabled:opacity-60"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          {leggendo ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
          {leggendo ? 'Lettura in corso...' : 'Scansiona documento'}
        </button>
      )}

      {/* STEP DI RITAGLIO — l'operatore isola la fascia con le righe di
          caratteri (MRZ) trascinando le due maniglie prima di lanciare l'OCR. */}
      {fotoInAttesa && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            Trascina le due linee per isolare solo la striscia con le righe di caratteri, poi conferma.
          </p>
          <div
            ref={contenitoreRef}
            className="relative select-none touch-none rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--border)' }}
            onMouseMove={muoviTrascinamento}
            onMouseUp={fineTrascinamento}
            onMouseLeave={fineTrascinamento}
            onTouchMove={muoviTrascinamento}
            onTouchEnd={fineTrascinamento}
          >
            <img src={fotoUrl} alt="Documento scattato" className="w-full block" draggable={false} />
            {/* Maschera sopra/sotto la fascia selezionata */}
            <div className="absolute inset-x-0 top-0 pointer-events-none"
                 style={{ height: `${ritaglio.top}%`, background: 'rgba(0,0,0,0.55)' }} />
            <div className="absolute inset-x-0 bottom-0 pointer-events-none"
                 style={{ height: `${100 - ritaglio.bottom}%`, background: 'rgba(0,0,0,0.55)' }} />
            {/* Maniglia superiore */}
            <div
              onMouseDown={iniziaTrascinamento('top')}
              onTouchStart={iniziaTrascinamento('top')}
              className="absolute inset-x-0 flex items-center justify-center cursor-ns-resize"
              style={{ top: `${ritaglio.top}%`, height: '28px', marginTop: '-14px' }}
            >
              <div className="w-full h-1" style={{ background: 'var(--hotel-amber)' }} />
            </div>
            {/* Maniglia inferiore */}
            <div
              onMouseDown={iniziaTrascinamento('bottom')}
              onTouchStart={iniziaTrascinamento('bottom')}
              className="absolute inset-x-0 flex items-center justify-center cursor-ns-resize"
              style={{ top: `${ritaglio.bottom}%`, height: '28px', marginTop: '-14px' }}
            >
              <div className="w-full h-1" style={{ background: 'var(--hotel-amber)' }} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={annullaRitaglio} disabled={leggendo}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border disabled:opacity-60"
                    style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              <X size={13} /> Rifai foto
            </button>
            <button type="button" onClick={confermaRitaglioELeggi} disabled={leggendo}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-60"
                    style={{ background: 'var(--hotel-amber)', color: '#fff' }}>
              {leggendo ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {leggendo ? 'Lettura in corso...' : 'Usa questo ritaglio'}
            </button>
          </div>
        </div>
      )}

      {esito === 'trovata' && (
        <p className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--status-green-text)' }}>
          <CheckCircle2 size={12} /> Dati letti dal documento — controlla e correggi se serve prima di salvare
          (la lettura può essere parziale o imprecisa: verifica sempre con il testo qui sotto).
        </p>
      )}
      {esito === 'non_trovata' && (
        <p className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          <AlertTriangle size={12} /> Nessuna zona leggibile trovata (es. patente di guida o carta d'identità
          cartacea, senza banda MRZ) — niente precompilazione automatica, ma il testo letto dalla foto è qui
          sotto per confronto mentre compili a mano.
        </p>
      )}
      {testoGrezzo && (
        <details className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          <summary className="cursor-pointer">Testo letto dalla foto</summary>
          <pre className="whitespace-pre-wrap mt-1 p-2 rounded-lg text-[10px]"
               style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>{testoGrezzo}</pre>
        </details>
      )}
      {errore && (
        <p className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--status-red-text)' }}>
          <AlertTriangle size={12} /> {errore}
        </p>
      )}
    </div>
  );
}
