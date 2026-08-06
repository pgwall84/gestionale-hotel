'use client';

// Pagina Impostazioni ▸ ROSS1000 — Modulo 2.6, Fase 1 (04/08/2026). Genera
// l'XML del tracciato ROSS1000/ISTAT (docs/ross1000/tracciato.pdf) per un
// intervallo di date, per verifica manuale — NESSUN invio reale (mancano le
// credenziali HTTP Basic di Regione Liguria, endpoint
// https://turismows.regione.liguria.it/ws/checkinV2?wsdl). Stesso approccio
// già seguito per Alloggiati Web: prima si genera/verifica, poi si invia
// quando arrivano le credenziali (Fase 2, non ancora implementata).
// Riservata ad admin/titolare (shared/ruoli.js sezione 'ross1000').

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import CampoData from '@/components/ui/CampoData';
import { Download, AlertTriangle, FileCode } from 'lucide-react';

const RUOLI_PAGINA = ['admin', 'titolare'];

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

function oggi() {
  return new Date().toISOString().slice(0, 10);
}
function primoGiornoMeseCorrente() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function primoGiornoMeseProssimo() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10);
}

export default function PaginaRoss1000() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const [dataInizio, setDataInizio] = useState(primoGiornoMeseCorrente());
  const [dataFine, setDataFine] = useState(primoGiornoMeseProssimo());
  const [giorniChiusuraTesto, setGiorniChiusuraTesto] = useState('');
  const [generazione, setGenerazione] = useState(false);
  const [errore, setErrore] = useState('');
  const [risultato, setRisultato] = useState(null); // { xml, avvisi, nome_file }

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_PAGINA.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  async function genera() {
    if (!dataInizio || !dataFine) {
      setErrore('Indica data di inizio e data di fine.');
      return;
    }
    setGenerazione(true);
    setErrore('');
    setRisultato(null);
    try {
      const giorniChiusura = giorniChiusuraTesto
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const res = await api.get(
        `/ross1000/export?data_inizio=${dataInizio}&data_fine=${dataFine}` +
        (giorniChiusura.length ? `&giorni_chiusura=${giorniChiusura.join(',')}` : '')
      );
      setRisultato(res.data);
    } catch (err) {
      setErrore(err.message || "Errore nella generazione dell'XML.");
    } finally {
      setGenerazione(false);
    }
  }

  function scarica() {
    if (!risultato) return;
    const blob = new Blob([risultato.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = risultato.nome_file || 'ross1000.xml';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (loading || !utente) return null;

  return (
    <AppShell titolo="Export ROSS1000">
      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--status-blue-bg)', border: '0.5px solid var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--foreground)' }}>
          Fase 1 — genera solo il file XML per verifica manuale. Nessun invio reale al webservice regionale:
          mancano ancora le credenziali (Ufficio Turismo Regione Liguria). Controlla il contenuto e gli avvisi
          prima di considerarlo pronto per un invio futuro.
        </p>
      </div>

      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4" style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}

      <div className="rounded-xl p-4 mb-4 space-y-3" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Genera export</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Dal (incluso)</label>
            <CampoData value={dataInizio} onChange={v => setDataInizio(v)}
                   className="px-3" style={inputStyle} />
          </div>
          <div>
            <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Al (escluso)</label>
            <CampoData value={dataFine} onChange={v => setDataFine(v)}
                   className="px-3" style={inputStyle} />
          </div>
        </div>
        <div>
          <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            Giorni di chiusura nell'intervallo (opzionale, separati da virgola — es. 2026-01-10, 2026-01-11)
          </label>
          <input value={giorniChiusuraTesto} onChange={e => setGiorniChiusuraTesto(e.target.value)}
                 placeholder="Nessuna chiusura, struttura sempre aperta nell'intervallo"
                 className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />
        </div>
        <button onClick={genera} disabled={generazione}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60"
                style={{ background: 'var(--hotel-navy)' }}>
          <FileCode size={14} /> {generazione ? 'Generazione...' : 'Genera XML'}
        </button>
      </div>

      {risultato && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Risultato</h3>
            <button onClick={scarica}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white"
                    style={{ background: 'var(--hotel-amber)' }}>
              <Download size={13} /> Scarica {risultato.nome_file}
            </button>
          </div>

          {risultato.avvisi?.length > 0 && (
            <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
              <p className="flex items-center gap-1.5 font-medium"><AlertTriangle size={13} /> {risultato.avvisi.length} avviso/i da verificare prima dell'invio</p>
              <ul className="list-disc list-inside space-y-0.5">
                {risultato.avvisi.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}

          <pre className="text-[10px] p-3 rounded-lg overflow-x-auto max-h-96 overflow-y-auto"
               style={{ background: 'var(--background)', border: '0.5px solid var(--border)', color: 'var(--foreground)' }}>
            {risultato.xml}
          </pre>
        </div>
      )}
    </AppShell>
  );
}
