'use client';

// Pagina Tassa di soggiorno — Modulo 2.4, Fase 2A.
// Vista operativa per la reception: elenco soggiorni del periodo con
// calcolo e riscossione della tassa, più export Excel per il report al
// Comune di Lerici (formato non ancora noto — export generico adattabile,
// vedi docs/EVOLUTIVE.md). La configurazione dell'aliquota (storico,
// esenzioni) è in /impostazioni/tassa-soggiorno, riservata ad admin/titolare.
// Permessi qui: admin, titolare, receptionist (shared/ruoli.js sezione
// 'tassa_soggiorno', azioni 'lettura'/'scrittura' — stesso set di ruoli per
// entrambe, quindi un solo controllo basta).

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import Cookies from 'js-cookie';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api, { getApiUrl } from '@/lib/api';
import DataTable from '@/components/ui/DataTable';
import CampoData from '@/components/ui/CampoData';

const RUOLI_OPERATIVI = ['admin', 'titolare', 'receptionist'];

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

// Fix 12/08/2026: questa pagina duplicava getApiUrl() con una copia locale
// (getApiBaseUrl) che mancava del ramo produzione — puntava sempre alla
// porta 7001 diretta, non aperta nel firewall di produzione (stesso bug
// della SSE cucina/sala/ristorante dell'11/08, mai notato qui perché
// nessuno aveva ancora provato l'export da hdgolfo-gestionale.com). Ora
// usa la funzione condivisa, esportata da lib/api.js dall'11/08/2026 —
// la nota "non esportata da lì" che c'era qui prima è superata.

// Primo e ultimo giorno del mese corrente, in locale — niente toISOString()
// (shifterebbe il giorno per fuso orario), stesso motivo per cui
// backend/config/db.js ha un type-parser dedicato per le colonne DATE.
function defaultRangeMese() {
  const oggi = new Date();
  const primo = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
  const ultimo = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { dal: fmt(primo), al: fmt(ultimo) };
}

export default function PaginaTassaSoggiorno() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const rangeIniziale = defaultRangeMese();
  const [dal, setDal] = useState(rangeIniziale.dal);
  const [al, setAl] = useState(rangeIniziale.al);
  const [righe, setRighe] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [successo, setSuccesso] = useState('');
  const [calcolandoId, setCalcolandoId] = useState(null);
  const [esportando, setEsportando] = useState(false);

  const [riscuotiTarget, setRiscuotiTarget] = useState(null); // riga | null
  const [importoRiscuoti, setImportoRiscuoti] = useState('');
  const [noteRiscuoti, setNoteRiscuoti] = useState('');
  const [salvataggioRiscuoti, setSalvataggioRiscuoti] = useState(false);

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_OPERATIVI.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const caricaReport = useCallback(async () => {
    setCaricamento(true);
    setErrore('');
    try {
      const res = await api.get(`/tassa-soggiorno/report?dal=${dal}&al=${al}`);
      setRighe(res.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento del report.');
    } finally {
      setCaricamento(false);
    }
  }, [dal, al]);

  useEffect(() => {
    if (utente && RUOLI_OPERATIVI.includes(utente.ruolo)) caricaReport();
  }, [utente, caricaReport]);

  async function calcola(riga) {
    setCalcolandoId(riga.soggiorno_id);
    setErrore('');
    try {
      await api.get(`/tassa-soggiorno/calcolo/${riga.soggiorno_id}`);
      await caricaReport();
    } catch (err) {
      setErrore(err.message || 'Errore nel calcolo della tassa dovuta.');
    } finally {
      setCalcolandoId(null);
    }
  }

  function apriRiscuoti(riga) {
    setRiscuotiTarget(riga);
    setImportoRiscuoti(String(riga.importo_dovuto));
    setNoteRiscuoti('');
    setErrore('');
  }

  async function confermaRiscuoti() {
    if (!importoRiscuoti) {
      setErrore('Importo riscosso obbligatorio.');
      return;
    }
    setSalvataggioRiscuoti(true);
    setErrore('');
    try {
      await api.post(`/tassa-soggiorno/${riscuotiTarget.soggiorno_id}/riscuoti`, {
        importo_riscosso: Number(importoRiscuoti),
        note: noteRiscuoti || null,
      });
      setRiscuotiTarget(null);
      setSuccesso('Tassa di soggiorno registrata come riscossa.');
      caricaReport();
    } catch (err) {
      setErrore(err.message || 'Errore nella registrazione della riscossione.');
    } finally {
      setSalvataggioRiscuoti(false);
    }
  }

  async function esporta() {
    setEsportando(true);
    setErrore('');
    try {
      const token = Cookies.get('token');
      const res = await fetch(`${getApiUrl()}/tassa-soggiorno/report/export?dal=${dal}&al=${al}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setErrore('Errore nell\'esportazione del report.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tassa_soggiorno_${dal}_${al}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrore('Errore nell\'esportazione del report.');
    } finally {
      setEsportando(false);
    }
  }

  if (loading || !utente) return null;

  const colonne = [
    { header: 'Camera', accessor: r => r.camera_numero },
    { header: 'Ospite', accessor: r => `${r.ospite_cognome} ${r.ospite_nome}` },
    { header: 'Arrivo', accessor: r => r.data_arrivo },
    { header: 'Partenza', accessor: r => r.data_partenza },
    { header: 'Notti tass.', accessor: r => r.notti_tassabili ?? '—' },
    { header: 'Ospiti tass.', accessor: r => r.ospiti_tassabili ?? '—' },
    { header: 'Dovuto', accessor: r => (r.importo_dovuto != null ? `€${Number(r.importo_dovuto).toFixed(2)}` : '—') },
    { header: 'Riscosso', accessor: r => (r.importo_riscosso != null ? `€${Number(r.importo_riscosso).toFixed(2)}` : '—') },
    {
      header: 'Azioni',
      accessor: r => {
        if (r.importo_dovuto == null) {
          return (
            <button onClick={() => calcola(r)} disabled={calcolandoId === r.soggiorno_id}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg disabled:opacity-60"
                    style={{ background: 'var(--hotel-amber-light)', color: 'var(--hotel-amber-dark)', border: '1px solid var(--hotel-amber)' }}>
              {calcolandoId === r.soggiorno_id ? 'Calcolo...' : 'Calcola'}
            </button>
          );
        }
        if (r.importo_riscosso == null) {
          return (
            <button onClick={() => apriRiscuoti(r)}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg text-white"
                    style={{ background: 'var(--hotel-navy)' }}>
              Segna riscossa
            </button>
          );
        }
        return (
          <span className="text-[11px] px-1.5 py-0.5 rounded"
                style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
            Riscossa
          </span>
        );
      },
    },
  ];

  return (
    <AppShell titolo="Tassa di soggiorno">
      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}
      {successo && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
          {successo}
        </div>
      )}

      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Dal</label>
            <CampoData value={dal} onChange={v => setDal(v)}
                   className="px-3" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Al</label>
            <CampoData value={al} onChange={v => setAl(v)}
                   className="px-3" style={inputStyle} />
          </div>
          <button onClick={caricaReport}
                  className="text-xs font-medium px-3 py-2 rounded-lg text-white"
                  style={{ background: 'var(--hotel-navy)', height: '38px' }}>
            Applica filtro
          </button>
          <button onClick={esporta} disabled={esportando}
                  className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-60 ml-auto"
                  style={{ background: 'var(--hotel-amber-light)', color: 'var(--hotel-amber-dark)', border: '1px solid var(--hotel-amber)', height: '38px' }}>
            <Download size={13} /> {esportando ? 'Esportazione...' : 'Esporta Excel'}
          </button>
        </div>
      </div>

      {riscuotiTarget && (
        <div className="rounded-xl p-4 mb-4 space-y-2" style={{ background: 'var(--card)', border: '1px solid var(--hotel-amber)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            Registra riscossione — Camera {riscuotiTarget.camera_numero}, {riscuotiTarget.ospite_cognome} {riscuotiTarget.ospite_nome}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min={0} step="0.01" placeholder="Importo riscosso" value={importoRiscuoti}
                   onChange={e => setImportoRiscuoti(e.target.value)}
                   className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
            <input placeholder="Note (opzionale)" value={noteRiscuoti}
                   onChange={e => setNoteRiscuoti(e.target.value)}
                   className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
          </div>
          <div className="flex gap-2">
            <button onClick={confermaRiscuoti} disabled={salvataggioRiscuoti}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                    style={{ background: 'var(--hotel-navy)' }}>
              {salvataggioRiscuoti ? 'Salvataggio...' : 'Conferma riscossione'}
            </button>
            <button onClick={() => setRiscuotiTarget(null)} className="text-xs font-medium px-3 py-1.5 rounded-lg border">Annulla</button>
          </div>
        </div>
      )}

      <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        {caricamento ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : (
          <DataTable colonne={colonne} dati={righe} emptyText="Nessun soggiorno nel periodo selezionato." />
        )}
      </div>
    </AppShell>
  );
}
