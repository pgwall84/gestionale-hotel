'use client';

// Ricevuta di cortesia — stampabile, NON fiscale (14/08/2026, modulo
// check-out). Riepilogo camera + addebiti extra + tassa di soggiorno −
// pagamenti = saldo, stesso dato di GET /api/prenotazioni/:id/conto già
// mostrato nel pannello check-out — qui solo in una veste stampabile.
// Stesso pattern CSS di /menu-stampa (@media print, pulsante no-print,
// window.print()), ma protetta da autenticazione (usa api.get, non fetch
// pubblico) perché contiene dati ospite/economici, non un menu pubblico.
//
// Documento deliberatamente NON fiscale: l'emissione fiscale reale
// (scontrino/fattura camera) arriverà con l'integrazione A-Cube (modulo
// 3.1, non ancora iniziata) — questa ricevuta è solo un promemoria di
// cortesia per l'ospite, non sostituisce alcun obbligo fiscale.

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';

function formatData(iso) {
  if (!iso) return '—';
  const [y, m, g] = iso.split('-');
  return `${g}/${m}/${y}`;
}

export default function RicevutaCortesia() {
  const { id } = useParams();
  const [dati, setDati] = useState(null);
  const [conto, setConto] = useState(null);
  const [errore, setErrore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/prenotazioni/${id}`),
      api.get(`/prenotazioni/${id}/conto`),
    ]).then(([risDati, risConto]) => {
      setDati(risDati.data);
      setConto(risConto.data);
    }).catch((err) => {
      setErrore(err.message || 'Errore nel caricamento');
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, fontFamily: 'system-ui' }}>Caricamento...</div>;
  if (errore || !dati || !conto) {
    return (
      <div style={{ textAlign: 'center', padding: 40, fontFamily: 'system-ui', color: '#b91c1c' }}>
        {errore || 'Ricevuta non disponibile.'}
      </div>
    );
  }

  const soggiorno = dati.soggiorni?.[0];
  const intestatario = soggiorno?.ospiti?.find(o => ['16', '17', '18'].includes(o.tipo_alloggiato)) || soggiorno?.ospiti?.[0];
  const oraEmissione = new Date().toLocaleString('it-IT');

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Georgia', 'Times New Roman', serif; background: #fff; color: #1a1a1a; }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .pagina { padding: 12mm 14mm; }
        }
        @media screen {
          body { background: #f5f5f5; }
          .pagina { max-width: 148mm; margin: 20px auto; background: #fff; padding: 14mm 16mm; box-shadow: 0 4px 20px rgba(0,0,0,0.12); }
        }
      `}</style>

      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, zIndex: 100, display: 'flex', gap: 8 }}>
        <button onClick={() => window.print()}
                style={{ background: '#1B3A5C', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }}>
          🖨 Stampa / Salva PDF
        </button>
        <button onClick={() => window.close()}
                style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }}>
          ✕ Chiudi
        </button>
      </div>

      <div className="pagina">
        <div style={{ textAlign: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid #1B3A5C' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1B3A5C', letterSpacing: 1 }}>Hotel del Golfo</h1>
          <p style={{ fontSize: 12, color: '#C98A3A', marginTop: 4, letterSpacing: 2, textTransform: 'uppercase' }}>Lerici · La Spezia</p>
          <p style={{ fontSize: 16, color: '#1B3A5C', marginTop: 10, fontStyle: 'italic' }}>Ricevuta di cortesia</p>
          <p style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>Documento non fiscale — emessa il {oraEmissione}</p>
        </div>

        <div style={{ marginBottom: 20, fontSize: 13 }}>
          <p><strong>Ospite:</strong> {intestatario ? `${intestatario.nome} ${intestatario.cognome}` : '—'}</p>
          {soggiorno && (
            <>
              <p><strong>Camera:</strong> {soggiorno.camera_numero}</p>
              <p><strong>Soggiorno:</strong> {formatData(soggiorno.data_arrivo)} → {formatData(soggiorno.data_partenza)}</p>
            </>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
          <tbody>
            <tr>
              <td style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}>Camera</td>
              <td style={{ padding: '6px 0', borderBottom: '1px solid #eee', textAlign: 'right' }}>€ {conto.camera.totale.toFixed(2)}</td>
            </tr>
            {conto.addebiti_extra.voci.map(a => (
              <tr key={a.id}>
                <td style={{ padding: '6px 0', borderBottom: '1px solid #eee', color: '#555' }}>{a.descrizione}</td>
                <td style={{ padding: '6px 0', borderBottom: '1px solid #eee', textAlign: 'right', color: '#555' }}>€ {Number(a.importo).toFixed(2)}</td>
              </tr>
            ))}
            {conto.tassa_soggiorno.dovuta > 0 && (
              <tr>
                <td style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}>Tassa di soggiorno</td>
                <td style={{ padding: '6px 0', borderBottom: '1px solid #eee', textAlign: 'right' }}>€ {conto.tassa_soggiorno.dovuta.toFixed(2)}</td>
              </tr>
            )}
            {conto.pagamenti.voci.map(p => (
              <tr key={p.id}>
                <td style={{ padding: '6px 0', borderBottom: '1px solid #eee', color: '#555' }}>Pagato — {p.metodo || '—'} ({p.tipo})</td>
                <td style={{ padding: '6px 0', borderBottom: '1px solid #eee', textAlign: 'right', color: '#555' }}>− € {Number(p.importo).toFixed(2)}</td>
              </tr>
            ))}
            {conto.tassa_soggiorno.riscossa > 0 && (
              <tr>
                <td style={{ padding: '6px 0', borderBottom: '1px solid #eee', color: '#555' }}>Tassa di soggiorno già riscossa</td>
                <td style={{ padding: '6px 0', borderBottom: '1px solid #eee', textAlign: 'right', color: '#555' }}>− € {conto.tassa_soggiorno.riscossa.toFixed(2)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#1B3A5C', paddingTop: 8, borderTop: '2px solid #1B3A5C' }}>
          <span>Saldo</span>
          <span>€ {conto.saldo_da_incassare.toFixed(2)}</span>
        </div>

        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #e0e0e0', textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: '#aaa', letterSpacing: 1 }}>
            Documento non fiscale, promemoria di cortesia — non sostituisce scontrino o fattura
          </p>
          <p style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
            Hotel del Golfo · Lerici (SP) · info@hoteldelgolfo.com
          </p>
        </div>
      </div>
    </>
  );
}
