'use client';

// Pagina Magazzino — lista prodotti con giacenza calcolata, alert sottoscorta,
// registrazione consegne (prodotti freschi) e nuovo prodotto (manuale o da scansione).
// Il food cost periodo è visibile solo a admin/titolare.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Package, AlertTriangle, Plus, Truck, Camera, X } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

function meseCorrente() {
  const oggi = new Date();
  const primo = new Date(oggi.getFullYear(), oggi.getMonth(), 1).toISOString().slice(0, 10);
  const ultimo = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { da: primo, a: ultimo };
}

export default function MagazzinoPage() {
  const { utente } = useAuth();
  const router = useRouter();
  const isAdmin = utente && ['admin', 'titolare'].includes(utente.ruolo);

  const [prodotti, setProdotti] = useState([]);
  const [fornitori, setFornitori] = useState([]);
  const [foodCost, setFoodCost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [ricerca, setRicerca] = useState('');

  const [mostraNuovo, setMostraNuovo] = useState(false);
  const [mostraConsegna, setMostraConsegna] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const caricaDati = useCallback(async () => {
    try {
      setLoading(true); setErrore(null);
      const [rProdotti, rFornitori] = await Promise.all([
        api.get('/magazzino/prodotti'),
        api.get('/magazzino/fornitori'),
      ]);
      setProdotti(rProdotti.data.prodotti || []);
      setFornitori(rFornitori.data.fornitori || []);
    } catch (err) {
      setErrore(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { caricaDati(); }, [caricaDati]);

  useEffect(() => {
    if (!isAdmin) return;
    const { da, a } = meseCorrente();
    api.get(`/magazzino/food-cost?da=${da}&a=${a}`).then(r => setFoodCost(r.data)).catch(() => {});
  }, [isAdmin]);

  const prodottiFiltrati = prodotti.filter(p =>
    p.nome.toLowerCase().includes(ricerca.toLowerCase()) ||
    (p.categoria || '').toLowerCase().includes(ricerca.toLowerCase())
  );
  const sottoscorta = prodotti.filter(p => p.sottoscorta);

  return (
    <AppShell titolo="Magazzino">
      <div className="flex flex-col gap-4 max-w-2xl mx-auto">

        <div className="flex justify-between items-center gap-2">
          <h1 className="font-bold text-xl" style={{ color: 'var(--foreground)' }}>Magazzino</h1>
          <div className="flex gap-2 shrink-0">
            {isAdmin && (
              <button onClick={() => window.open('/magazzino-qr-stampa', '_blank')}
                      className="px-3 py-2 rounded-lg text-sm font-medium"
                      style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                🖨 QR
              </button>
            )}
            <button onClick={() => router.push('/magazzino/scansiona?modo=qr')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
              <Camera size={16} /> Scansiona QR
            </button>
          </div>
        </div>

        {/* Alert sottoscorta */}
        {sottoscorta.length > 0 && (
          <div className="rounded-xl p-3" style={{ background: '#FCEBEB', border: '1px solid #F09595' }}>
            <p className="font-bold text-sm flex items-center gap-1.5" style={{ color: '#A32D2D' }}>
              <AlertTriangle size={16} /> {sottoscorta.length} prodott{sottoscorta.length === 1 ? 'o' : 'i'} sotto scorta
            </p>
            <p className="text-xs mt-1" style={{ color: '#A32D2D' }}>
              {sottoscorta.map(p => p.nome).join(', ')}
            </p>
          </div>
        )}

        {/* Food cost periodo — solo admin/titolare */}
        {isAdmin && foodCost && (
          <div className="rounded-xl p-3 flex items-center justify-between"
               style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Food cost — mese corrente</p>
              <p className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>
                {foodCost.costo_medio_per_coperto !== null ? `€${foodCost.costo_medio_per_coperto.toFixed(2)}/coperto` : '—'}
              </p>
            </div>
            <p className="text-xs text-right" style={{ color: 'var(--muted-foreground)' }}>
              Spesa €{foodCost.spesa.toFixed(2)}<br />{foodCost.coperti} coperti
            </p>
          </div>
        )}

        {/* Azioni */}
        <div className="flex gap-2">
          <button onClick={() => setMostraNuovo(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: '#16344b', color: '#fff' }}>
            <Plus size={16} /> Nuovo prodotto
          </button>
          <button onClick={() => setMostraConsegna(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
            <Truck size={16} /> Registra consegna
          </button>
        </div>

        {/* Ricerca */}
        <input
          type="text"
          placeholder="Cerca prodotto o categoria..."
          value={ricerca}
          onChange={e => setRicerca(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
        />

        {/* Lista prodotti */}
        {loading ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : errore ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--status-red-text)' }}>{errore}</p>
        ) : prodottiFiltrati.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessun prodotto trovato.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {prodottiFiltrati.map(p => (
              <div key={p.id}
                   className="rounded-xl px-4 py-3 flex items-center justify-between"
                   style={{
                     background: p.sottoscorta ? '#FCEBEB' : 'var(--card)',
                     border: p.sottoscorta ? '1px solid #F09595' : '1px solid var(--border)',
                   }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <Package size={18} style={{ color: p.sottoscorta ? '#A32D2D' : 'var(--muted-foreground)' }} />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: p.sottoscorta ? '#A32D2D' : 'var(--foreground)' }}>
                      {p.nome}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {p.categoria || 'senza categoria'}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm" style={{ color: p.sottoscorta ? '#A32D2D' : 'var(--foreground)' }}>
                    {p.giacenza} {p.unita_misura || ''}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    min. {p.soglia_minima}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {mostraNuovo && (
        <BottomSheetNuovoProdotto
          onSalva={async (dati) => {
            setSalvando(true);
            try {
              await api.post('/magazzino/prodotti', dati);
              setMostraNuovo(false);
              await caricaDati();
            } catch (err) {
              alert(err.response?.data?.errore || err.message);
            } finally {
              setSalvando(false);
            }
          }}
          onScansiona={() => router.push('/magazzino/scansiona?modo=barcode')}
          onAnnulla={() => setMostraNuovo(false)}
          loading={salvando}
        />
      )}

      {mostraConsegna && (
        <BottomSheetConsegna
          prodotti={prodotti}
          fornitori={fornitori}
          onSalva={async (dati) => {
            setSalvando(true);
            try {
              await api.post('/magazzino/movimenti', { ...dati, tipo: 'carico' });
              setMostraConsegna(false);
              await caricaDati();
            } catch (err) {
              alert(err.response?.data?.errore || err.message);
            } finally {
              setSalvando(false);
            }
          }}
          onAnnulla={() => setMostraConsegna(false)}
          loading={salvando}
        />
      )}
    </AppShell>
  );
}

// ── Bottom sheet: nuovo prodotto ────────────────────────────────────────────────
function BottomSheetNuovoProdotto({ onSalva, onScansiona, onAnnulla, loading }) {
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');
  const [unitaMisura, setUnitaMisura] = useState('');
  const [sogliaMinima, setSogliaMinima] = useState('');

  const valido = nome.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
         style={{ background: 'rgba(0,0,0,0.45)' }}
         onClick={onAnnulla}>
      <div className="w-full max-w-xl rounded-t-2xl p-5 flex flex-col gap-3"
           style={{ background: 'var(--card)' }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>Nuovo prodotto</p>
          <button onClick={onAnnulla}><X size={20} style={{ color: 'var(--muted-foreground)' }} /></button>
        </div>

        <button onClick={onScansiona}
                className="w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-1.5"
                style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
          <Camera size={16} /> Scansiona barcode EAN
        </button>
        <p className="text-xs text-center" style={{ color: 'var(--muted-foreground)' }}>oppure inserisci manualmente</p>

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

        <button
          onClick={() => onSalva({ nome, categoria, unita_misura: unitaMisura, soglia_minima: sogliaMinima || 0 })}
          disabled={loading || !valido}
          className="w-full py-3.5 rounded-xl font-bold text-base"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: (loading || !valido) ? 0.6 : 1 }}>
          {loading ? 'Salvataggio...' : 'Crea prodotto'}
        </button>
      </div>
    </div>
  );
}

// ── Bottom sheet: registra consegna (prodotti freschi) ──────────────────────────
function BottomSheetConsegna({ prodotti, fornitori, onSalva, onAnnulla, loading }) {
  const [prodottoId, setProdottoId] = useState('');
  const [fornitoreId, setFornitoreId] = useState('');
  const [quantita, setQuantita] = useState('');
  const [dataScadenza, setDataScadenza] = useState('');
  const [ddtNumero, setDdtNumero] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');

  const valido = prodottoId && quantita && parseFloat(quantita) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
         style={{ background: 'rgba(0,0,0,0.45)' }}
         onClick={onAnnulla}>
      <div className="w-full max-w-xl rounded-t-2xl p-5 flex flex-col gap-3 overflow-y-auto"
           style={{ background: 'var(--card)', maxHeight: '85vh' }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>Registra consegna</p>
          <button onClick={onAnnulla}><X size={20} style={{ color: 'var(--muted-foreground)' }} /></button>
        </div>

        <select value={prodottoId} onChange={e => setProdottoId(e.target.value)}
                className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>
          <option value="">Seleziona prodotto *</option>
          {prodotti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>

        <select value={fornitoreId} onChange={e => setFornitoreId(e.target.value)}
                className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>
          <option value="">Fornitore (opzionale)</option>
          {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>

        <input type="number" placeholder="Quantità *" value={quantita} onChange={e => setQuantita(e.target.value)}
               className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Scadenza</label>
            <input type="date" value={dataScadenza} onChange={e => setDataScadenza(e.target.value)}
                   className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />
          </div>
          <input type="text" placeholder="N. DDT" value={ddtNumero} onChange={e => setDdtNumero(e.target.value)}
                 className="flex-1 rounded-xl p-3 text-sm self-end" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />
        </div>

        <input type="number" step="0.01" placeholder="Costo unitario € (per food cost)" value={costoUnitario} onChange={e => setCostoUnitario(e.target.value)}
               className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />

        <button
          onClick={() => onSalva({
            prodotto_id: parseInt(prodottoId), fornitore_id: fornitoreId ? parseInt(fornitoreId) : undefined,
            quantita, data_scadenza: dataScadenza || undefined, ddt_numero: ddtNumero || undefined,
            costo_unitario: costoUnitario || undefined,
          })}
          disabled={loading || !valido}
          className="w-full py-3.5 rounded-xl font-bold text-base"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: (loading || !valido) ? 0.6 : 1 }}>
          {loading ? 'Salvataggio...' : 'Registra consegna'}
        </button>
      </div>
    </div>
  );
}
