'use client';

// Pagina Gruppi — elenco di tutte le comitive/famiglie multi-prenotazione
// (Fase 2A, seguito modulo Prenotazioni, 15/08/2026). Prima di questa
// pagina un gruppo era raggiungibile solo cliccando una prenotazione che ne
// fa già parte (ModalDettaglioGruppo, in planning-camere) — nessun punto
// per vedere tutti i gruppi passati/presenti o ritrovarne uno ricorrente
// (es. la stessa comitiva che torna ogni anno) senza ricordarne il nome
// esatto. Stesso motivo per cui esiste /clienti per gli ospiti singoli.
// Nessuna migration, nessun nuovo permesso: riusa shared/ruoli.js sezione
// 'gruppi' (già esistente) e GET /api/gruppi (esteso con colonne aggregate
// da gruppiController.lista()).
// Click su una riga naviga a /planning-camere?gruppo=<id>, che apre
// ModalDettaglioGruppo direttamente (nessuna prenotazione "corrente" da
// cui partire, a differenza dell'apertura normale dal planning).

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import DataTable from '@/components/ui/DataTable';
import { Search, Users, AlertTriangle } from 'lucide-react';

const RUOLI_LETTURA = ['admin', 'titolare', 'receptionist', 'portiere_notte'];

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

function formatDataBreve(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PaginaGruppi() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [gruppi, setGruppi] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_LETTURA.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const caricaGruppi = useCallback(async (termine) => {
    setCaricamento(true);
    setErrore('');
    try {
      const parametri = new URLSearchParams();
      if (termine) parametri.set('search', termine);
      const res = await api.get(`/gruppi?${parametri.toString()}`);
      setGruppi(res.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento dei gruppi.');
    } finally {
      setCaricamento(false);
    }
  }, []);

  // Debounce leggero sulla ricerca — stesso pattern di /clienti.
  useEffect(() => {
    if (!utente || !RUOLI_LETTURA.includes(utente.ruolo)) return;
    const timer = setTimeout(() => caricaGruppi(search), 300);
    return () => clearTimeout(timer);
  }, [search, utente, caricaGruppi]);

  if (loading || !utente) return null;

  const colonne = [
    {
      header: 'Gruppo',
      accessor: g => (
        <span className="flex items-center gap-1.5 font-medium">
          <Users size={13} style={{ color: 'var(--muted-foreground)' }} /> {g.nome}
        </span>
      ),
    },
    {
      header: 'Referente',
      accessor: g => (
        <div className="text-xs">
          <p>{g.referente_nome || '—'}</p>
          {(g.referente_telefono || g.referente_email) && (
            <p style={{ color: 'var(--muted-foreground)' }}>
              {[g.referente_telefono, g.referente_email].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      ),
    },
    { header: 'Camere occupate ora', accessor: g => Number(g.camere_occupate_ora) },
    { header: 'Storico soggiorni', accessor: g => Number(g.storico_soggiorni) },
    { header: 'Storico ospiti', accessor: g => Number(g.storico_ospiti) },
    { header: 'Pagato', accessor: g => `${Number(g.totale_pagamenti).toFixed(2)} €` },
    { header: 'Creato il', accessor: g => formatDataBreve(g.created_at) },
  ];

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Gruppi</h1>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Comitive e famiglie su più camere — dati aggregati su tutte le prenotazioni collegate.
          </p>
        </div>

        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per nome gruppo o referente..."
            className="w-full pl-8 pr-3 rounded-lg text-sm"
            style={inputStyle}
          />
        </div>

        {errore && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
               style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
            <AlertTriangle size={14} /> {errore}
          </div>
        )}

        {caricamento ? (
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : (
          <DataTable
            colonne={colonne}
            dati={gruppi}
            onRowClick={g => router.push(`/planning-camere?gruppo=${g.id}`)}
            emptyText="Nessun gruppo trovato."
          />
        )}

        {/* Limite noto (15/08/2026): GET /gruppi restituisce al massimo 30
            righe, senza paginazione — sufficiente per il volume atteso di un
            hotel di 20 camere, da rivedere se in futuro superasse questa
            soglia (vedi commento in gruppiController.lista()). */}
      </div>
    </AppShell>
  );
}
