# Griglia statica tipologie×periodi in /tariffe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire, nella pagina `/tariffe`, il layer di selezione "una scheda tipologia alla volta" (fila di chip + `SchedaPrezzoTipologia` unica visibile) con una griglia statica — righe = tipi camera, colonne = periodi stagionali + una colonna "Tutto l'anno" (solo tipi derivati) — le cui celle, cliccate, aprono in un modal la stessa `SchedaPrezzoTipologia` già esistente, pre-selezionata sul periodo della cella.

**Architecture:** Nessun nuovo file. Due file toccati: `SchedaPrezzoTipologia.jsx` guadagna un prop opzionale `periodoIniziale` che, quando presente, sovrascrive la sua logica di auto-selezione del periodo all'apertura (comportamento di default invariato quando il prop è assente). `page.jsx` sostituisce interamente la funzione `SezionePrezziTipologia` con una versione a tabella e aggiunge una nuova funzione `ModalPrezzoTipologia` che calcola `isDerivata`/`regolePerTipo`/`tariffePerTipo` per il tipo cliccato e rende `SchedaPrezzoTipologia` dentro un overlay, con `key` su `${tipo.id}-${periodoId}` per un remount pulito ad ogni cella diversa. Nessun ordinamento nuovo sui periodi: la griglia mostra `periodiStagionali` nell'ordine in cui arriva dall'API, esattamente come fa oggi `ChipPeriodi`.

**Nota di scope (da confermare col titolare prima o durante l'esecuzione):** questo piano tocca SOLO `SezionePrezziTipologia`. `SchedaTrattamento` (supplemento mezza/pensione completa, sezione separata sotto la griglia) resta invariata — non è per-tipologia, non ha senso in questa griglia. `SezionePeriodi` (CRUD periodi) resta l'unico punto per creare il primo periodo quando `periodiStagionali` è vuoto: nessuna nuova UX di creazione periodo dentro la griglia.

**Tech Stack:** Next.js 15 (App Router), React (client components, `'use client'`), nessuna libreria nuova — riusa `lucide-react` (già importata in `page.jsx`) e `@/lib/api`.

## Global Constraints

- Nessuna modifica a controller backend, rotte, o logica di calcolo prezzi (`calcolaPrezzoCameraPerNotte`, `calcolaTariffa`, ecc.) — questo piano è frontend-only.
- Nessuna modifica alla logica di salvataggio esistente in `SchedaPrezzoTipologia.jsx` (`salvaMadre`, `salvaDerivata`, `elimina`, gestione 409 min/max del Piano 1) — resta bit-per-bit identica, tranne l'aggiunta del prop `periodoIniziale` e la riga che lo consuma nel `useEffect` di inizializzazione.
- `SchedaTrattamento.jsx` e `ChipPeriodi.jsx` non vengono toccati da nessun task di questo piano.
- Solo struttura a griglia statica, click singolo per aprire il modal — NESSUN drag-select multi-cella, NESSUN bulk-edit (scelta esplicita del titolare, per non ripetere l'errore della timeline trascinabile bocciata il 20/08/2026, vedi commento in testa a `page.jsx`).
- Colonna "Tutto l'anno" cliccabile solo sulle righe dei tipi derivati (`isDerivata === true`); sulle righe madre la cella corrispondente mostra `—` e non è un bottone (i tipi madre non hanno concetto di fallback: `salvaMadre` lega sempre `data_inizio`/`data_fine` a un periodo specifico).
- Nessuna infrastruttura di test frontend esiste in questo repo (nessun file `*.test.jsx`): non scrivere test per questi file. L'unica verifica eseguibile da questa sandbox è `npx esbuild --bundle --jsx=automatic` sui file `.jsx` toccati (controllo sintattico e di risoluzione import) — mai una vera build Next, mai un controllo visivo, mai un avvio del dev server. Dichiararlo esplicitamente ad ogni consegna.
- Mai eseguire comandi `git` da questa sandbox (il "tab Code" del titolare gestisce git/test/deploy). Nessuno step di questo piano contiene un commit — l'esecuzione è inline, task per task, senza subagent, con consegna dei file a fine blocco tramite `SendUserFile` + `device_commit_files`.
- Ad ogni step, valori esatti (nomi prop, chiavi, testi UI) sono quelli scritti qui — non inventarne varianti.

---

### Task 1: `periodoIniziale` opzionale in `SchedaPrezzoTipologia`

**Files:**
- Modify: `gestionale-hotel/frontend/components/tariffe/SchedaPrezzoTipologia.jsx:28-56`

**Interfaces:**
- Consumes: nessuna — è il primo task, tocca solo la firma e l'inizializzazione del componente esistente.
- Produces: `SchedaPrezzoTipologia` accetta ora un prop opzionale `periodoIniziale`, con questi tre valori possibili:
  - `undefined` (prop assente) → comportamento identico a oggi (derivata: fallback selezionato; madre: primo periodo con tariffa esistente, o nessuno).
  - un oggetto periodo tratto da `periodiStagionali` (es. `{ id, nome, data_inizio, data_fine }`) → seleziona quel periodo specifico, fallback disattivato.
  - la stringa letterale `'fallback'` → seleziona "Tutto l'anno" (ha senso solo quando `isDerivata` è `true`; se passata con `isDerivata === false` la UI comunque ignora il fallback per i tipi madre perché `ChipPeriodi` riceve `allowFallback={isDerivata}`).
  - Il task 2 passa questo prop dal wrapper modal della griglia.

- [ ] **Step 1: Aggiungere il prop alla firma del componente**

In `SchedaPrezzoTipologia.jsx`, sostituire:

```jsx
export default function SchedaPrezzoTipologia({
  tipo,                // {id, nome}
  tipiCamera,           // tutti i tipi (selettore "deriva da", solo modo derivata)
  periodiStagionali,
  isDerivata,
  regolePerTipo,        // righe regole_derivazione_tariffe per questo tipo (solo se isDerivata)
  tariffePerTipo,        // righe tariffe per questo tipo (solo se !isDerivata)
  tariffeTutte,          // tutte le righe tariffe (per l'anteprima calcolo: prezzo del tipo base)
  puoScrivere,
  onCambiato,
  onErrore,
}) {
```

con:

```jsx
export default function SchedaPrezzoTipologia({
  tipo,                // {id, nome}
  tipiCamera,           // tutti i tipi (selettore "deriva da", solo modo derivata)
  periodiStagionali,
  isDerivata,
  regolePerTipo,        // righe regole_derivazione_tariffe per questo tipo (solo se isDerivata)
  tariffePerTipo,        // righe tariffe per questo tipo (solo se !isDerivata)
  tariffeTutte,          // tutte le righe tariffe (per l'anteprima calcolo: prezzo del tipo base)
  periodoIniziale,       // opzionale (redesign griglia, Piano 2, 24/08/2026): periodo object | 'fallback' | undefined —
                          // se presente sovrascrive la selezione di default nel useEffect qui sotto. Usato dal
                          // wrapper modal della griglia (frontend/app/tariffe/page.jsx) per aprire la scheda già
                          // sul periodo/colonna cliccata, senza cambiare il comportamento quando il prop è assente.
  puoScrivere,
  onCambiato,
  onErrore,
}) {
```

- [ ] **Step 2: Far consumare il prop dal `useEffect` di inizializzazione**

Nello stesso file, sostituire:

```jsx
  useEffect(() => {
    if (isDerivata) {
      setFallbackSelezionato(true);
      setPeriodoAttivoId(null);
    } else {
      const prima = tariffePerTipo.find(t => t.periodo_id != null);
      setPeriodoAttivoId(prima ? prima.periodo_id : null);
      setFallbackSelezionato(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo.id, isDerivata]);
```

con:

```jsx
  useEffect(() => {
    if (periodoIniziale === 'fallback') {
      setFallbackSelezionato(true);
      setPeriodoAttivoId(null);
    } else if (periodoIniziale) {
      setPeriodoAttivoId(periodoIniziale.id);
      setFallbackSelezionato(false);
    } else if (isDerivata) {
      setFallbackSelezionato(true);
      setPeriodoAttivoId(null);
    } else {
      const prima = tariffePerTipo.find(t => t.periodo_id != null);
      setPeriodoAttivoId(prima ? prima.periodo_id : null);
      setFallbackSelezionato(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo.id, isDerivata, periodoIniziale]);
```

- [ ] **Step 3: Verifica sintattica con esbuild**

Da `gestionale-hotel/frontend`:

```bash
npx esbuild components/tariffe/SchedaPrezzoTipologia.jsx --bundle --jsx=automatic --loader:.jsx=jsx \
  --external:react --external:react-dom --external:lucide-react "--external:@/*" \
  --outfile=/tmp/verifica-scheda-prezzo.js
```

Expected: esce con codice 0, nessun errore di sintassi o di risoluzione import. Questo NON è una build Next reale né un test — solo un controllo sintattico/di import, da dichiarare esplicitamente come tale in ogni consegna (nessun accesso DB, nessun controllo visivo possibile da questa sandbox).

---

### Task 2: Griglia statica in `page.jsx` (sostituisce `SezionePrezziTipologia`)

**Files:**
- Modify: `gestionale-hotel/frontend/app/tariffe/page.jsx:69` (rimozione stato `tipoSelezionato`)
- Modify: `gestionale-hotel/frontend/app/tariffe/page.jsx:127-137` (props passate a `SezionePrezziTipologia`)
- Modify: `gestionale-hotel/frontend/app/tariffe/page.jsx:173-233` (sostituzione completa della funzione `SezionePrezziTipologia` + commento sopra + nuova funzione `ModalPrezzoTipologia`)

**Interfaces:**
- Consumes: il prop `periodoIniziale` di `SchedaPrezzoTipologia` prodotto dal Task 1 (`undefined | oggetto periodo | 'fallback'`).
- Produces: nessuno — ultimo task del piano.

- [ ] **Step 1: Rimuovere lo stato `tipoSelezionato` da `PaginaTariffe`**

In `page.jsx`, dentro `PaginaTariffe`, eliminare la riga:

```jsx
  const [tipoSelezionato, setTipoSelezionato] = useState(null);
```

(la griglia mostra tutte le tipologie contemporaneamente — non serve più un "tipo selezionato" a livello di pagina).

- [ ] **Step 2: Aggiornare le props passate a `SezionePrezziTipologia`**

Sostituire:

```jsx
          <SezionePrezziTipologia
            tipiCamera={tipiCamera}
            periodiStagionali={periodiStagionali}
            tariffeTutte={tariffeTutte}
            regoleTutte={regoleTutte}
            tipoSelezionato={tipoSelezionato}
            setTipoSelezionato={setTipoSelezionato}
            puoScrivere={puoScrivere}
            onCambiato={caricaBase}
            onErrore={setErrore}
          />
```

con:

```jsx
          <SezionePrezziTipologia
            tipiCamera={tipiCamera}
            periodiStagionali={periodiStagionali}
            tariffeTutte={tariffeTutte}
            regoleTutte={regoleTutte}
            puoScrivere={puoScrivere}
            onCambiato={caricaBase}
            onErrore={setErrore}
          />
```

- [ ] **Step 3: Sostituire il commento + la funzione `SezionePrezziTipologia` con la griglia, e aggiungere `ModalPrezzoTipologia`**

Sostituire l'intero blocco (commento incluso) da:

```jsx
// ── Prezzi per tipologia (madre + derivate, timeline unificata) ───────────
// Un tipo camera è "madre" se non ha righe in regole_derivazione_tariffe
// (prezzo diretto, tabella tariffe), altrimenti "derivata" (percentuale sul
// tipo base + range, tabella regole_derivazione_tariffe) — dedotto dai dati,
// mai da un elenco fisso di nomi.

// Un tipo camera diventa un'etichetta nella fila in alto (non più una
// tendina): tocchi "Singola" e vedi SOLO la sua scheda, stessa card di
// Matrimoniale — evita di avere 5 schede (madre + 4 derivate) una sotto
// l'altra sulla stessa pagina, che avrebbe ricreato il problema di
// leggibilità della prima versione da un'altra porta (chiesto
// esplicitamente dal titolare, 20/08/2026).

function SezionePrezziTipologia({ tipiCamera, periodiStagionali, tariffeTutte, regoleTutte, tipoSelezionato, setTipoSelezionato, puoScrivere, onCambiato, onErrore }) {
  const tipo = tipiCamera.find(t => String(t.id) === String(tipoSelezionato)) || null;
  const regolePerTipo = tipoSelezionato ? regoleTutte.filter(r => String(r.tipo_camera_id) === String(tipoSelezionato)) : [];
  const isDerivata = regolePerTipo.length > 0;
  const tariffePerTipo = tipoSelezionato ? tariffeTutte.filter(t => String(t.tipo_camera_id) === String(tipoSelezionato)) : [];

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Prezzi per tipologia</h3>

      <div className="flex gap-2 mb-4 flex-wrap">
        {tipiCamera.map(t => (
          <button key={t.id} onClick={() => setTipoSelezionato(String(t.id))}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg"
                  style={String(tipoSelezionato) === String(t.id)
                    ? { background: 'var(--hotel-navy)', color: 'white' }
                    : { border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
            {t.nome}
          </button>
        ))}
      </div>

      {!tipo ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--muted-foreground)' }}>Scegli una tipologia qui sopra per vedere e modificare i prezzi.</p>
      ) : (
        <>
          <span className="inline-block text-xs px-2 py-0.5 rounded-full mb-3"
                style={{ background: 'var(--hotel-amber-light)', color: 'var(--hotel-amber-dark)' }}>
            {isDerivata ? 'Tipo derivato' : 'Tipo madre — prezzo diretto'}
          </span>

          <SchedaPrezzoTipologia
            tipo={tipo}
            tipiCamera={tipiCamera}
            periodiStagionali={periodiStagionali}
            isDerivata={isDerivata}
            regolePerTipo={regolePerTipo}
            tariffePerTipo={tariffePerTipo}
            tariffeTutte={tariffeTutte}
            puoScrivere={puoScrivere}
            onCambiato={onCambiato}
            onErrore={onErrore}
          />
        </>
      )}
    </div>
  );
}
```

a:

```jsx
// ── Prezzi per tipologia (griglia statica, redesign Piano 2, 24/08/2026) ──
// Un tipo camera è "madre" se non ha righe in regole_derivazione_tariffe
// (prezzo diretto, tabella tariffe), altrimenti "derivata" (percentuale sul
// tipo base + range, tabella regole_derivazione_tariffe) — dedotto dai dati,
// mai da un elenco fisso di nomi.

// Quarto redesign di questa sezione (dopo i tre descritti in testa al file):
// da "una scheda alla volta" (fila di chip + scheda unica visibile) a una
// tabella statica — righe = tipi camera, colonne = periodi stagionali +
// "Tutto l'anno" (solo righe derivate: i tipi madre non hanno concetto di
// fallback). Ogni cella è un bottone che apre in un modal la STESSA
// SchedaPrezzoTipologia di sempre (nessuna riscrittura della logica di
// salvataggio), pre-selezionata sul periodo cliccato tramite il prop
// periodoIniziale. Decisione del titolare, non nuova: parcheggiata il
// 20/08/2026, richiamata in docs/EVOLUTIVE.md. Solo struttura statica,
// click singolo per editare — nessun drag-select multi-cella, nessun
// bulk-edit (per non ripetere l'errore della timeline trascinabile bocciata
// lo stesso giorno).

function SezionePrezziTipologia({ tipiCamera, periodiStagionali, tariffeTutte, regoleTutte, puoScrivere, onCambiato, onErrore }) {
  const [cellaAperta, setCellaAperta] = useState(null); // null | { tipoId, periodoId } — periodoId è un id numerico oppure la stringa 'fallback'

  function apriCella(tipoId, periodoId) { setCellaAperta({ tipoId, periodoId }); }
  function chiudiCella() { setCellaAperta(null); }

  const tipoAperto = cellaAperta ? tipiCamera.find(t => String(t.id) === String(cellaAperta.tipoId)) || null : null;

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Prezzi per tipologia</h3>

      {tipiCamera.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--muted-foreground)' }}>Nessuna tipologia camera configurata (vedi Impostazioni ▸ Camere).</p>
      ) : periodiStagionali.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--muted-foreground)' }}>
          Nessun periodo stagionale definito — crealo nella sezione &quot;Periodi stagionali&quot; qui sotto, poi torna qui per impostare i prezzi.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th className="text-left px-2 py-1.5" style={{ color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}>Tipologia</th>
                {periodiStagionali.map(p => (
                  <th key={p.id} className="text-left px-2 py-1.5 font-medium" style={{ color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}>
                    {p.nome}
                  </th>
                ))}
                <th className="text-left px-2 py-1.5 font-medium" style={{ color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}>
                  Tutto l&apos;anno
                </th>
              </tr>
            </thead>
            <tbody>
              {tipiCamera.map(tipo => {
                const regolePerTipo = regoleTutte.filter(r => String(r.tipo_camera_id) === String(tipo.id));
                const isDerivata = regolePerTipo.length > 0;
                const tariffePerTipo = tariffeTutte.filter(t => String(t.tipo_camera_id) === String(tipo.id));
                const valoreFallback = isDerivata ? (regolePerTipo.find(r => r.periodo_id === null) || null) : null;

                return (
                  <tr key={tipo.id}>
                    <td className="px-2 py-1.5" style={{ borderBottom: '0.5px solid var(--border)' }}>
                      <span className="font-medium">{tipo.nome}</span>
                      <span className="block text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                        {isDerivata ? 'derivato' : 'madre'}
                      </span>
                    </td>
                    {periodiStagionali.map(p => {
                      const valore = isDerivata
                        ? regolePerTipo.find(r => r.periodo_id === p.id) || null
                        : tariffePerTipo.find(t => t.periodo_id === p.id) || null;
                      return (
                        <td key={p.id} className="px-2 py-1.5" style={{ borderBottom: '0.5px solid var(--border)' }}>
                          <button type="button" onClick={() => apriCella(tipo.id, p.id)}
                                  className="w-full text-left px-2 py-1 rounded-lg"
                                  style={{ border: '1px solid var(--border)', color: valore ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                            {valore
                              ? (isDerivata ? `${Number(valore.percentuale) > 0 ? '+' : ''}${valore.percentuale}%` : `${valore.prezzo_notte} €`)
                              : '+ Imposta'}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5" style={{ borderBottom: '0.5px solid var(--border)' }}>
                      {isDerivata ? (
                        <button type="button" onClick={() => apriCella(tipo.id, 'fallback')}
                                className="w-full text-left px-2 py-1 rounded-lg"
                                style={{ border: '1px solid var(--border)', color: valoreFallback ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                          {valoreFallback ? `${Number(valoreFallback.percentuale) > 0 ? '+' : ''}${valoreFallback.percentuale}%` : '+ Imposta'}
                        </button>
                      ) : (
                        <span className="block text-center" style={{ color: 'var(--muted-foreground)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tipoAperto && (
        <ModalPrezzoTipologia
          tipo={tipoAperto}
          tipiCamera={tipiCamera}
          periodiStagionali={periodiStagionali}
          tariffeTutte={tariffeTutte}
          regoleTutte={regoleTutte}
          periodoId={cellaAperta.periodoId}
          puoScrivere={puoScrivere}
          onCambiato={onCambiato}
          onErrore={onErrore}
          onChiudi={chiudiCella}
        />
      )}
    </div>
  );
}

// ── Modal cella griglia (Piano 2, 24/08/2026) ──────────────────────────────
// Riusa SchedaPrezzoTipologia senza modificarne la logica di
// salvataggio/eliminazione: calcola qui isDerivata/regolePerTipo/
// tariffePerTipo per il tipo cliccato (stessa logica già usata sopra per
// colorare le celle) e passa periodoIniziale per pre-selezionare la
// colonna cliccata. La key su tipo.id+periodoId forza un remount pulito
// ogni volta che si clicca una cella diversa, invece di gestire a mano la
// re-inizializzazione dello stato interno della scheda.

function ModalPrezzoTipologia({ tipo, tipiCamera, periodiStagionali, tariffeTutte, regoleTutte, periodoId, puoScrivere, onCambiato, onErrore, onChiudi }) {
  const regolePerTipo = regoleTutte.filter(r => String(r.tipo_camera_id) === String(tipo.id));
  const isDerivata = regolePerTipo.length > 0;
  const tariffePerTipo = tariffeTutte.filter(t => String(t.tipo_camera_id) === String(tipo.id));
  const periodoIniziale = periodoId === 'fallback' ? 'fallback' : (periodiStagionali.find(p => p.id === periodoId) || null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onChiudi}>
      <div className="w-full max-w-lg rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{tipo.nome}</h4>
            <span className="inline-block text-xs px-2 py-0.5 rounded-full mt-1"
                  style={{ background: 'var(--hotel-amber-light)', color: 'var(--hotel-amber-dark)' }}>
              {isDerivata ? 'Tipo derivato' : 'Tipo madre — prezzo diretto'}
            </span>
          </div>
          <button type="button" onClick={onChiudi} className="text-xs px-2 py-1 rounded-lg border">Chiudi</button>
        </div>

        <SchedaPrezzoTipologia
          key={`${tipo.id}-${periodoId}`}
          tipo={tipo}
          tipiCamera={tipiCamera}
          periodiStagionali={periodiStagionali}
          isDerivata={isDerivata}
          regolePerTipo={regolePerTipo}
          tariffePerTipo={tariffePerTipo}
          tariffeTutte={tariffeTutte}
          periodoIniziale={periodoIniziale}
          puoScrivere={puoScrivere}
          onCambiato={onCambiato}
          onErrore={onErrore}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verifica sintattica con esbuild**

Da `gestionale-hotel/frontend`:

```bash
npx esbuild app/tariffe/page.jsx --bundle --jsx=automatic --loader:.jsx=jsx \
  --external:react --external:react-dom --external:next/navigation --external:lucide-react "--external:@/*" \
  --outfile=/tmp/verifica-tariffe-page.js
```

Expected: esce con codice 0, nessun errore di sintassi o di risoluzione import. Dichiarare esplicitamente che questo NON sostituisce una build Next reale, l'esecuzione di Jest (non applicabile: nessun test frontend nel repo), o un controllo visivo — nessuno dei tre è possibile da questa sandbox.

---

## Self-review (svolto durante la stesura di questo piano)

1. **Copertura spec:** griglia statica righe/colonne (Task 2, Step 3) ✓; colonna "Tutto l'anno" solo per derivati (Task 2, cella `—` per madre) ✓; riuso di `SchedaPrezzoTipologia` senza riscriverla (Task 1 aggiunge solo un prop opzionale, la logica di salvataggio non cambia) ✓; `SchedaTrattamento` fuori scope (nessun task la tocca) ✓; nessuna nuova UX di creazione periodo (messaggio nella griglia rimanda a `SezionePeriodi`, già esistente) ✓; nessun drag/bulk-edit (celle sono singoli bottoni con `onClick` singolo) ✓.
2. **Placeholder scan:** nessun "TBD"/"gestire i casi limite"/codice omesso — ogni step porta il diff completo.
3. **Coerenza dei tipi/nomi:** `periodoIniziale` (Task 1, prop di `SchedaPrezzoTipologia`) è lo stesso nome e stessi tre valori (`undefined | oggetto periodo | 'fallback'`) usati da `ModalPrezzoTipologia` (Task 2); `cellaAperta.periodoId` (numero o `'fallback'`) è lo stesso valore passato come `periodoId` a `ModalPrezzoTipologia` e poi confrontato con `periodoId === 'fallback'` per calcolare `periodoIniziale` — nessuna divergenza di nome tra i due task.
