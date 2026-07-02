'use client';

// Pagina HACCP — checklist igienica giornaliera per il cuoco.
// Il cuoco spunta le attrezzature controllate ogni giorno.
// Il titolare può vedere lo storico per eventuali ispezioni ASL.

import { useState, useEffect, useCallback } from 'react';
import { CheckSquare, Square, Save } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import StatusBadge from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

export default function PaginaChecklist() {
  const { utente } = useAuth();
  const oggi = new Date().toISOString().split('T')[0];
  const [data, setData] = useState(oggi);
  const [voci, setVoci] = useState([]);
  const [esistente, setEsistente] = useState(false);
  const [loading, setLoading] = useState(true);
  const [invio, setInvio] = useState(false);
  const [salvato, setSalvato] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/hr/haccp?data=${data}`);
      setVoci(r.data.checklist.map(v => ({ ...v })));
      setEsistente(r.data.esistente);
    } catch {} finally { setLoading(false); }
  }, [data]);

  useEffect(() => { carica(); }, [carica]);

  function toggleVoce(index) {
    setVoci(prev => prev.map((v, i) => i === index ? { ...v, completata: !v.completata } : v));
  }

  function aggiornaNote(index, note) {
    setVoci(prev => prev.map((v, i) => i === index ? { ...v, note } : v));
  }

  async function salva() {
    setInvio(true);
    try {
      await api.post('/hr/haccp', { data, voci });
      setSalvato(true);
      setEsistente(true);
      setTimeout(() => setSalvato(false), 3000);
    } catch {} finally { setInvio(false); }
  }

  const completate = voci.filter(v => v.completata).length;
  const totale     = voci.length;
  const percentuale = totale > 0 ? Math.round((completate / totale) * 100) : 0;

  return (
    <AppShell titolo="Checklist HACCP">
      <div className="max-w-lg mx-auto">

        {/* Selettore data + stato */}
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-2">
            <input type="date" value={data} onChange={e => setData(e.target.value)}
                   className="px-3 rounded-lg text-sm outline-none"
                   style={{ height: '36px', border: '0.5px solid var(--border)', background: 'var(--card)' }} />
            {esistente && <StatusBadge status="green" label="Compilata" />}
          </div>

          {/* Barra progresso */}
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full transition-all"
                   style={{ width: `${percentuale}%`, background: percentuale === 100 ? '#16a34a' : 'var(--hotel-amber)' }} />
            </div>
            <span className="text-[12px] font-medium tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
              {completate}/{totale}
            </span>
          </div>
        </div>

        {/* Lista attrezzature */}
        {loading ? (
          <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : (
          <div className="rounded-xl overflow-hidden mb-4"
               style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
            {voci.map((voce, i) => (
              <div key={voce.attrezzatura}
                   className="px-4 py-3 flex flex-col gap-1.5"
                   style={{ borderBottom: i < voci.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                <div className="flex items-center gap-3">
                  {/* Toggle checkbox */}
                  <button onClick={() => toggleVoce(i)} className="shrink-0 transition-colors"
                          style={{ color: voce.completata ? '#16a34a' : 'var(--muted-foreground)' }}>
                    {voce.completata ? <CheckSquare size={20} /> : <Square size={20} />}
                  </button>
                  <span className="text-sm flex-1"
                        style={{
                          color: voce.completata ? 'var(--muted-foreground)' : 'var(--foreground)',
                          textDecoration: voce.completata ? 'line-through' : 'none',
                        }}>
                    {voce.attrezzatura}
                  </span>
                </div>
                {/* Campo note opzionale — appare se la voce è completata */}
                {voce.completata && (
                  <input type="text" placeholder="Note (opzionale)" value={voce.note || ''}
                         onChange={e => aggiornaNote(i, e.target.value)}
                         className="ml-8 text-xs px-2 py-1 rounded outline-none"
                         style={{ border: '0.5px solid var(--border)', background: 'var(--background)', color: 'var(--muted-foreground)' }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pulsante salva */}
        {!loading && (
          <button onClick={salva} disabled={invio}
                  className="w-full flex items-center justify-center gap-2 rounded-xl font-medium text-white disabled:opacity-60 transition-colors"
                  style={{ height: '48px', background: percentuale === 100 ? '#16a34a' : 'var(--hotel-amber)' }}>
            <Save size={18} />
            {invio ? 'Salvataggio...' : percentuale === 100 ? 'Salva checklist completata' : `Salva (${completate}/${totale} completate)`}
          </button>
        )}

        {salvato && (
          <p className="text-[13px] text-center mt-3" style={{ color: 'var(--status-green-text)' }}>
            Checklist HACCP salvata con successo.
          </p>
        )}

        {/* Storico visibile solo al titolare */}
        {utente?.ruolo === 'titolare' && (
          <div className="mt-6">
            <p className="text-[13px] font-medium mb-3" style={{ color: 'var(--foreground)' }}>
              Storico compilazioni
            </p>
            <StoricoBadge data={data} />
          </div>
        )}
      </div>
    </AppShell>
  );
}

// Mini componente storico — mostra quante voci erano completate per la data selezionata
function StoricoBadge({ data }) {
  const [storico, setStorico] = useState([]);

  useEffect(() => {
    // Carica gli ultimi 30 giorni per mostrare un riepilogo
    const da = new Date();
    da.setDate(da.getDate() - 30);
    const daStr = da.toISOString().split('T')[0];
    api.get(`/hr/haccp/storico?da=${daStr}&a=${data}`)
      .then(r => setStorico(r.data.storico))
      .catch(() => {});
  }, [data]);

  // Raggruppa per data
  const perData = storico.reduce((acc, voce) => {
    const d = new Date(voce.data).toISOString().split('T')[0];
    if (!acc[d]) acc[d] = { totale: 0, completate: 0 };
    acc[d].totale++;
    if (voce.completata) acc[d].completate++;
    return acc;
  }, {});

  const dateOrdinate = Object.keys(perData).sort().reverse().slice(0, 7);

  if (dateOrdinate.length === 0) {
    return <p className="text-[12px]" style={{ color: 'var(--muted-foreground)' }}>Nessuno storico disponibile.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {dateOrdinate.map(d => {
        const { totale, completate } = perData[d];
        const pct = Math.round((completate / totale) * 100);
        return (
          <div key={d} className="flex items-center justify-between px-3 py-2 rounded-lg"
               style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
            <span className="text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
              {new Date(d).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            <StatusBadge
              status={pct === 100 ? 'green' : pct >= 50 ? 'amber' : 'red'}
              label={`${completate}/${totale}`}
            />
          </div>
        );
      })}
    </div>
  );
}
