'use client';

import { useState, useEffect, useRef } from 'react';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';
const IMG_BASE = BASE_URL.replace('/api', '');

const ALLERGENI_ICONE = {
  'vegano': '🌱',
  'vegetariano': '🥗',
  'glutine': '🌾',
  'latte': '🥛',
  'uova': '🥚',
  'pesce': '🐟',
  'crostacei': '🦐',
  'arachidi': '🥜',
  'frutta a guscio': '🌰',
  'soia': '🫘',
};

function TagAllergene({ label, evidenziato }) {
  const icona = ALLERGENI_ICONE[label] || '⚠️';
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full capitalize"
          style={{
            background: evidenziato ? '#FEF3C7' : '#F3F4F6',
            color: evidenziato ? '#92400E' : '#6B7280',
            fontWeight: evidenziato ? 600 : 400,
            border: evidenziato ? '1px solid #FCD34D' : '1px solid transparent',
          }}>
      {icona} {label}
    </span>
  );
}

export default function MenuPubblico() {
  const [categorie, setCategorie] = useState([]);
  const [piatti, setPiatti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtriAttivi, setFiltriAttivi] = useState([]);
  const [catAttiva, setCatAttiva] = useState(null);
  const sectionRefs = useRef({});

  useEffect(() => {
    fetch(`${BASE_URL}/menu/pubblico`)
      .then(r => r.json())
      .then(d => { setCategorie(d.categorie || []); setPiatti(d.piatti || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Sticky nav: evidenzia la sezione corrente mentre si scrolla
  useEffect(() => {
    if (categorie.length === 0) return;
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => { if (e.isIntersecting) setCatAttiva(Number(e.target.dataset.catId)); });
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );
    Object.values(sectionRefs.current).forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [categorie]);

  function scrollTo(catId) {
    const el = sectionRefs.current[catId];
    if (!el) return;
    const navEl = document.getElementById('sticky-nav');
    const navH = navEl ? navEl.offsetHeight : 45;
    const y = el.getBoundingClientRect().top + window.scrollY - navH - 4;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  function toggleFiltro(a) {
    setFiltriAttivi(f => f.includes(a) ? f.filter(x => x !== a) : [...f, a]);
  }

  function piattoVisibile(p) {
    if (filtriAttivi.length === 0) return true;
    return filtriAttivi.every(f => p.allergeni?.includes(f));
  }

  const allergeniDisponibili = [...new Set(piatti.flatMap(p => p.allergeni || []))].sort();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAFAF8' }}>
        <p style={{ color: '#6B7280', fontSize: 14 }}>Caricamento menu...</p>
      </div>
    );
  }

  if (categorie.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAFAF8' }}>
        <div className="text-center">
          <p style={{ fontSize: 32 }}>🍽</p>
          <p style={{ color: '#374151', fontWeight: 600, marginTop: 8 }}>Menu non disponibile</p>
          <p style={{ color: '#6B7280', fontSize: 14, marginTop: 4 }}>Chiedi al personale</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#FAFAF8', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Header hotel */}
      <div style={{ background: '#1B3A5C', padding: '20px 16px 16px' }}>
        <p style={{ color: '#C98A3A', fontSize: 11, letterSpacing: 2, fontWeight: 600, textTransform: 'uppercase', margin: 0 }}>Hotel del Golfo</p>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '4px 0 0' }}>Menu</h1>
      </div>

      {/* Sticky nav categorie */}
      <div id="sticky-nav" style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: '#fff',
        borderBottom: '1px solid #E5E7EB',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}>
        <div style={{ display: 'inline-flex', gap: 0, padding: '0 4px' }}>
          {categorie.map(c => (
            <button key={c.id} onClick={() => scrollTo(c.id)}
                    style={{
                      padding: '12px 14px',
                      fontSize: 13,
                      fontWeight: catAttiva === c.id ? 700 : 500,
                      color: catAttiva === c.id ? '#1B3A5C' : '#6B7280',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: catAttiva === c.id ? '2px solid #1B3A5C' : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}>
              {c.titolo}
            </button>
          ))}
        </div>
      </div>

      {/* Filtri allergeni */}
      {allergeniDisponibili.length > 0 && (
        <div style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #F3F4F6' }}>
          <p style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Filtra per
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {allergeniDisponibili.map(a => {
              const attivo = filtriAttivi.includes(a);
              const icona = ALLERGENI_ICONE[a] || '⚠️';
              return (
                <button key={a} onClick={() => toggleFiltro(a)}
                        style={{
                          fontSize: 11, padding: '5px 10px', borderRadius: 20,
                          background: attivo ? '#1B3A5C' : '#F3F4F6',
                          color: attivo ? '#fff' : '#374151',
                          border: 'none', cursor: 'pointer',
                          fontWeight: attivo ? 600 : 400,
                          transition: 'all 0.15s',
                        }}>
                  {icona} {a}
                </button>
              );
            })}
            {filtriAttivi.length > 0 && (
              <button onClick={() => setFiltriAttivi([])}
                      style={{ fontSize: 11, padding: '5px 10px', borderRadius: 20, background: '#FEE2E2', color: '#991B1B', border: 'none', cursor: 'pointer' }}>
                ✕ Rimuovi filtri
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sezioni per categoria */}
      <div style={{ padding: '0 0 40px' }}>
        {categorie.map(cat => {
          const piattiCat = piatti.filter(p => p.categoria_id === cat.id && piattoVisibile(p));
          return (
            <section key={cat.id} ref={el => sectionRefs.current[cat.id] = el} data-cat-id={cat.id}
                     style={{ scrollMarginTop: 90 }}>
              {/* Titolo categoria */}
              <div style={{ padding: '20px 16px 8px', position: 'sticky', top: 45, background: '#FAFAF8', zIndex: 10 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1B3A5C', margin: 0, borderLeft: '3px solid #C98A3A', paddingLeft: 10 }}>
                  {cat.titolo}
                </h2>
              </div>

              {piattiCat.length === 0 ? (
                <p style={{ padding: '8px 16px', fontSize: 13, color: '#9CA3AF' }}>Nessun piatto disponibile al momento</p>
              ) : (
                <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  {piattiCat.map((p, i) => (
                    <div key={p.id} style={{
                      display: 'flex', gap: 10, padding: '12px 8px',
                      background: '#fff',
                      borderRadius: i === 0 ? '12px 12px 0 0' : i === piattiCat.length - 1 ? '0 0 12px 12px' : 0,
                      gridColumn: '1 / -1',
                      borderBottom: i < piattiCat.length - 1 ? '1px solid #F3F4F6' : 'none',
                    }}>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>{p.nome}</p>
                          {p.prezzo && (
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#C98A3A', flexShrink: 0 }}>
                              €{Number(p.prezzo).toFixed(2)}
                            </p>
                          )}
                        </div>
                        {p.descrizione && (
                          <p style={{ margin: '4px 0', fontSize: 12, color: '#6B7280', lineHeight: 1.4 }}>{p.descrizione}</p>
                        )}
                        {p.allergeni?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            {p.allergeni.map(a => <TagAllergene key={a} label={a} evidenziato={filtriAttivi.includes(a)} />)}
                          </div>
                        )}
                      </div>
                      {/* Foto */}
                      {p.immagine_url && (
                        <img src={`${IMG_BASE}${p.immagine_url}`} alt={p.nome}
                             style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Padding fondo — permette a tutte le sezioni di scrollare in cima */}
      <div style={{ height: '60vh' }} />

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '20px 16px 32px', borderTop: '1px solid #E5E7EB' }}>
        <p style={{ fontSize: 11, color: '#9CA3AF' }}>Hotel del Golfo — Lerici</p>
        <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Menu aggiornato in tempo reale</p>
      </div>
    </div>
  );
}
