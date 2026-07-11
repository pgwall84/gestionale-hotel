'use client';

// Stampa QR prodotti magazzino su A4 — stesso pattern di /menu-stampa:
// pagina standalone con CSS print inline, un QR per prodotto (etichetta da scaffale).
// Il QR codifica il codice interno (prodotti.qr_code), non un URL — viene letto
// dalla fotocamera dell'app stessa in /magazzino/scansiona?modo=qr.

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';

export default function MagazzinoQrStampa() {
  const [prodotti, setProdotti] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = document.cookie.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
    fetch(`${BASE_URL}/magazzino/prodotti`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setProdotti(d.prodotti || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, fontFamily: 'system-ui' }}>Caricamento...</div>;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, sans-serif; background: #fff; color: #1a1a1a; }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .pagina { padding: 10mm; }
        }
        @media screen {
          body { background: #f5f5f5; }
          .pagina { max-width: 210mm; margin: 20px auto; background: #fff; padding: 14mm; box-shadow: 0 4px 20px rgba(0,0,0,0.12); }
        }
        .griglia { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; }
        .etichetta { border: 1px dashed #ccc; border-radius: 6px; padding: 6mm; display: flex; flex-direction: column; align-items: center; gap: 3mm; page-break-inside: avoid; }
      `}</style>

      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, zIndex: 100, display: 'flex', gap: 8 }}>
        <button onClick={() => window.print()}
                style={{ background: '#16344b', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          🖨 Stampa / Salva PDF
        </button>
        <button onClick={() => window.close()}
                style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 13, cursor: 'pointer' }}>
          ✕ Chiudi
        </button>
      </div>

      <div className="pagina">
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#16344b', marginBottom: 16 }}>
          Etichette QR magazzino — Hotel del Golfo
        </h1>
        {prodotti.length === 0 ? (
          <p style={{ fontSize: 13, color: '#6b7280' }}>Nessun prodotto da stampare.</p>
        ) : (
          <div className="griglia">
            {prodotti.map(p => (
              <div key={p.id} className="etichetta">
                <QRCodeSVG value={p.qr_code} size={100} fgColor="#16344b" />
                <p style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' }}>{p.nome}</p>
                <p style={{ fontSize: 9, color: '#6b7280' }}>{p.qr_code}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
