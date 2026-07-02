'use client';

import { useState, useEffect } from 'react';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';
const IMG_BASE = BASE_URL.replace('/api', '');

const ALLERGENI_ICONE = {
  'vegano': '🌱', 'vegetariano': '🥗', 'glutine': '🌾', 'latte': '🥛',
  'uova': '🥚', 'pesce': '🐟', 'crostacei': '🦐', 'arachidi': '🥜',
  'frutta a guscio': '🌰', 'soia': '🫘',
};

export default function MenuStampa() {
  const [categorie, setCategorie] = useState([]);
  const [piatti, setPiatti] = useState([]);
  const [logoUrl, setLogoUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${BASE_URL}/menu/pubblico`).then(r => r.json()),
      fetch(`${BASE_URL}/menu/logo`).then(r => r.ok ? r.url || `${BASE_URL}/menu/logo` : null).catch(() => null),
    ]).then(([menu, logo]) => {
      setCategorie(menu.categorie || []);
      setPiatti(menu.piatti || []);
      if (logo) setLogoUrl(`${BASE_URL}/menu/logo?t=${Date.now()}`);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, fontFamily: 'Georgia, serif' }}>Caricamento...</div>;

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
          .pagina { max-width: 210mm; margin: 20px auto; background: #fff; padding: 16mm 18mm; box-shadow: 0 4px 20px rgba(0,0,0,0.12); }
        }
      `}</style>

      {/* Pulsante stampa — solo schermo */}
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
        {/* Intestazione */}
        <div style={{ textAlign: 'center', marginBottom: 28, paddingBottom: 20, borderBottom: '2px solid #1B3A5C' }}>
          {logoUrl && (
            <img src={logoUrl} alt="Logo Hotel del Golfo"
                 style={{ maxHeight: 70, maxWidth: 200, objectFit: 'contain', marginBottom: 12 }} />
          )}
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1B3A5C', letterSpacing: 1 }}>Hotel del Golfo</h1>
          <p style={{ fontSize: 13, color: '#C98A3A', marginTop: 4, letterSpacing: 2, textTransform: 'uppercase' }}>Lerici · La Spezia</p>
          <p style={{ fontSize: 20, color: '#1B3A5C', marginTop: 10, fontStyle: 'italic' }}>Menù</p>
        </div>

        {/* Categorie e piatti */}
        {categorie.map((cat, ci) => {
          const piattiCat = piatti.filter(p => p.categoria_id === cat.id);
          if (piattiCat.length === 0) return null;
          return (
            <div key={cat.id} style={{ marginBottom: 24, pageBreakInside: 'avoid' }}>
              {/* Titolo categoria */}
              <h2 style={{
                fontSize: 15, fontWeight: 700, color: '#1B3A5C',
                textTransform: 'uppercase', letterSpacing: 2,
                borderBottom: '1px solid #C98A3A', paddingBottom: 5, marginBottom: 12,
              }}>
                {cat.titolo}
              </h2>

              {/* Piatti */}
              {piattiCat.map((p, i) => (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  gap: 12, paddingBottom: 10, marginBottom: 10,
                  borderBottom: i < piattiCat.length - 1 ? '1px solid #f0f0f0' : 'none',
                  pageBreakInside: 'avoid',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{p.nome}</span>
                      {p.allergeni?.map(a => (
                        <span key={a} style={{ fontSize: 10, color: '#888' }}>
                          {ALLERGENI_ICONE[a] || ''} {a}
                        </span>
                      ))}
                    </div>
                    {p.descrizione && (
                      <p style={{ fontSize: 12, color: '#555', marginTop: 3, fontStyle: 'italic', lineHeight: 1.5 }}>{p.descrizione}</p>
                    )}
                  </div>
                  {p.prezzo && (
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#C98A3A', flexShrink: 0 }}>
                      € {Number(p.prezzo).toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {/* Footer */}
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #e0e0e0', textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: '#aaa', letterSpacing: 1 }}>
            I prezzi sono espressi in Euro e includono IVA · Gli allergeni sono indicati a titolo informativo
          </p>
          <p style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
            Hotel del Golfo · Lerici (SP) · info@hoteldelgolfo.com
          </p>
        </div>
      </div>
    </>
  );
}
