'use client';

// Pagina Archivio documentale — resoconti Z, DDT, fatture, scontrini POS, altro.
// Upload da fotocamera/galleria, ricerca per categoria e data, download, eliminazione.

import { useState, useEffect, useCallback } from 'react';
import { Archive, Upload, Download, Trash2, X } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import api from '@/lib/api';

const CATEGORIE = {
  resoconto_z: 'Resoconto Z',
  ddt:         'DDT',
  fattura:     'Fattura',
  pos:         'Scontrino POS',
  altro:       'Altro',
};

export default function ArchivioPage() {
  const [documenti, setDocumenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [dataDa, setDataDa] = useState('');
  const [dataA, setDataA] = useState('');
  const [mostraUpload, setMostraUpload] = useState(false);
  const [caricando, setCaricando] = useState(false);

  const carica = useCallback(async () => {
    try {
      setLoading(true); setErrore(null);
      const params = new URLSearchParams();
      if (filtroTipo) params.set('tipo', filtroTipo);
      if (dataDa) params.set('data_da', dataDa);
      if (dataA) params.set('data_a', dataA);
      const r = await api.get(`/archivio?${params.toString()}`);
      setDocumenti(r.data.documenti || []);
    } catch (err) {
      setErrore(err.message);
    } finally {
      setLoading(false);
    }
  }, [filtroTipo, dataDa, dataA]);

  useEffect(() => { carica(); }, [carica]);

  // Download autenticato — fetch con Bearer + blob, stesso pattern già usato
  // per i documenti HR (personale/page.jsx): window.open da solo non può
  // allegare l'header Authorization.
  const scarica = async (id, filename) => {
    try {
      const token = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('token='))?.split('=')[1];
      const { protocol, hostname } = window.location;
      const base = `${protocol}//${hostname}:7001/api`;
      const res = await fetch(`${base}/archivio/${id}/download`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { alert('Errore durante il download.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename || `documento_${id}`;
      a.click(); URL.revokeObjectURL(url);
    } catch {
      alert('Errore durante il download.');
    }
  };

  const elimina = async (id) => {
    if (!confirm('Eliminare questo documento?')) return;
    try {
      await api.delete(`/archivio/${id}`);
      await carica();
    } catch (err) {
      alert(err.response?.data?.errore || err.message);
    }
  };

  return (
    <AppShell titolo="Archivio">
      <div className="flex flex-col gap-4 max-w-2xl mx-auto">

        <div className="flex justify-between items-center">
          <h1 className="font-bold text-xl" style={{ color: 'var(--foreground)' }}>Archivio documentale</h1>
          <button onClick={() => setMostraUpload(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#16344b', color: '#fff' }}>
            <Upload size={16} /> Carica documento
          </button>
        </div>

        {/* Filtri ricerca */}
        <div className="flex gap-2 flex-wrap">
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>
            <option value="">Tutte le categorie</option>
            {Object.entries(CATEGORIE).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
          <input type="date" value={dataDa} onChange={e => setDataDa(e.target.value)}
                 className="rounded-lg px-3 py-2 text-sm"
                 style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />
          <input type="date" value={dataA} onChange={e => setDataA(e.target.value)}
                 className="rounded-lg px-3 py-2 text-sm"
                 style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />
        </div>

        {/* Lista documenti */}
        {loading ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : errore ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--status-red-text)' }}>{errore}</p>
        ) : documenti.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessun documento trovato.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {documenti.map(d => (
              <div key={d.id} className="rounded-xl px-4 py-3 flex items-center justify-between"
                   style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <Archive size={18} style={{ color: 'var(--muted-foreground)' }} />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--foreground)' }}>
                      {CATEGORIE[d.tipo] || d.tipo}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {new Date(d.data_documento).toLocaleDateString('it-IT')}
                      {d.nome ? ` · ${d.nome} ${d.cognome}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => scarica(d.id, d.filename)} title="Scarica"
                          className="p-2 rounded-lg" style={{ color: 'var(--primary)' }}>
                    <Download size={16} />
                  </button>
                  <button onClick={() => elimina(d.id)} title="Elimina"
                          className="p-2 rounded-lg" style={{ color: 'var(--status-red-text)' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {mostraUpload && (
        <BottomSheetUpload
          loading={caricando}
          onAnnulla={() => setMostraUpload(false)}
          onCarica={async (formData) => {
            setCaricando(true);
            try {
              await api.post('/archivio', formData); // FormData: lib/api.js non forza Content-Type JSON
              setMostraUpload(false);
              await carica();
            } catch (err) {
              alert(err.response?.data?.errore || err.message);
            } finally {
              setCaricando(false);
            }
          }}
        />
      )}
    </AppShell>
  );
}

function BottomSheetUpload({ onCarica, onAnnulla, loading }) {
  const [tipo, setTipo] = useState('altro');
  const [dataDocumento, setDataDocumento] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);

  const valido = !!file;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
         style={{ background: 'rgba(0,0,0,0.45)' }}
         onClick={onAnnulla}>
      <div className="w-full max-w-xl rounded-t-2xl p-5 flex flex-col gap-3"
           style={{ background: 'var(--card)' }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>Carica documento</p>
          <button onClick={onAnnulla}><X size={20} style={{ color: 'var(--muted-foreground)' }} /></button>
        </div>

        <select value={tipo} onChange={e => setTipo(e.target.value)}
                className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>
          {Object.entries(CATEGORIE).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
        </select>

        <input type="date" value={dataDocumento} onChange={e => setDataDocumento(e.target.value)}
               className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />

        <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)}
               className="w-full text-sm" style={{ color: 'var(--foreground)' }} />

        <textarea placeholder="Note (opzionale)" value={note} onChange={e => setNote(e.target.value)}
                  rows={2} className="w-full rounded-xl p-3 text-sm resize-none"
                  style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />

        <button
          onClick={() => {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('tipo', tipo);
            fd.append('data_documento', dataDocumento);
            if (note) fd.append('note', note);
            onCarica(fd);
          }}
          disabled={loading || !valido}
          className="w-full py-3.5 rounded-xl font-bold text-base"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: (loading || !valido) ? 0.6 : 1 }}>
          {loading ? 'Caricamento...' : 'Carica'}
        </button>
      </div>
    </div>
  );
}
