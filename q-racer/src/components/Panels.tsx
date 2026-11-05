import { useMemo, useState } from 'react';
import type { Settings, Stats } from '../core/trainer';
import type { SaveData } from '../core/storage';

const fmt = (v: number, d = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
export const STATUS_TEXT: Record<string, string> = { idle: 'Bereit', running: 'Training läuft', paused: 'Pausiert', finished: 'Abgeschlossen' };
export const SPEEDS: [number, string][] = [[1, 'Langsam (1 Schritt/Frame)'], [2, 'Normal (2)'], [5, 'Schnell (5)'], [20, 'Sehr schnell (20)'], [100, 'Turbo (100)'], [1e6, 'Maximal']];

function Slider(p: { label: string; hint: string; value: number; min: number; max: number; step: number; digits: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <label className="field" title={p.hint}>
      <span>{p.label}<b>{fmt(p.value, p.digits)}</b></span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} disabled={p.disabled} onChange={e => p.onChange(Number(e.target.value))} />
      <small>{p.hint}</small>
    </label>
  );
}

export interface Actions {
  start: () => void; pause: () => void; resume: () => void; stop: () => void; replay: () => void;
  save: () => void; exportSave: () => void; newTraining: () => void; home: () => void;
}

export function Sidebar(p: { settings: Settings; set: (s: Settings) => void; status: string; hasBest: boolean; replaying: boolean; hasTrainer: boolean; a: Actions }) {
  const locked = p.status !== 'idle';
  const s = p.settings, up = (k: keyof Settings) => (v: number) => p.set({ ...s, [k]: v });
  const canReplay = p.hasBest && !p.replaying && (p.status === 'paused' || p.status === 'finished');
  return (
    <aside className="sidebar">
      <h2>Einstellungen</h2>
      {locked && <div className="lock">Gesperrt: Die Parameter gelten für diese Trainingseinheit. Für andere Werte bitte ein neues Training starten.</div>}
      <Slider label="Lernrate (Alpha)" hint="Wie stark neue Erfahrungen die bisherigen Q-Werte verändern." value={s.alpha} min={0.01} max={1} step={0.01} digits={2} disabled={locked} onChange={up('alpha')} />
      <Slider label="Discount-Faktor (Gamma)" hint="Wie stark zukünftige Belohnungen die aktuelle Entscheidung beeinflussen." value={s.gamma} min={0} max={0.99} step={0.01} digits={2} disabled={locked} onChange={up('gamma')} />
      <Slider label="Explorationsrate (Epsilon)" hint="Wie oft das Auto zufällige Lenkaktionen ausprobiert (Startwert)." value={s.epsilon} min={0.05} max={1} step={0.01} digits={2} disabled={locked} onChange={up('epsilon')} />
      <Slider label="Explorationsabnahme (Decay)" hint="Faktor, mit dem Epsilon nach jeder Episode multipliziert wird (Minimum 0,05)." value={s.decay} min={0.9} max={1} step={0.001} digits={3} disabled={locked} onChange={up('decay')} />
      <label className="field" title="Anzahl der Lernschritte pro Bildschirm-Frame. Verändert die Lernregeln nicht.">
        <span>Simulationsgeschwindigkeit</span>
        <select value={s.speed} disabled={locked} onChange={e => up('speed')(Number(e.target.value))}>
          {SPEEDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <small>Nur Darstellungstempo, die Q-Learning-Regel bleibt identisch.</small>
      </label>
      <label className="field" title="Maximale Anzahl der Trainingsversuche.">
        <span>Anzahl der Episoden</span>
        <input type="number" list="eps" min={1} max={100000} value={s.episodes} disabled={locked}
          onChange={e => up('episodes')(Math.max(1, Math.min(100000, Math.floor(Number(e.target.value) || 1))))} />
        <datalist id="eps">{[100, 500, 1000, 5000, 10000].map(v => <option key={v} value={v} />)}</datalist>
        <small>Beispiele: 100, 500, 1.000, 5.000, 10.000 – oder eigener Wert.</small>
      </label>
      <div className="btns">
        {p.status === 'idle' && <button className="primary" onClick={p.a.start}>Training starten</button>}
        {p.status === 'running' && <button onClick={p.a.pause}>Training pausieren</button>}
        {p.status === 'paused' && <button className="primary" onClick={p.a.resume}>Training fortsetzen</button>}
        {(p.status === 'running' || p.status === 'paused') && <button onClick={p.a.stop}>Training beenden</button>}
        <button disabled={!canReplay} onClick={p.a.replay}>{p.replaying ? 'Wiedergabe läuft…' : 'Beste Fahrt wiedergeben'}</button>
        <button onClick={p.a.save}>Speicherstand sichern</button>
        <button onClick={p.a.exportSave}>Als JSON exportieren</button>
        {p.hasTrainer && <button onClick={p.a.newTraining}>Neues Training mit dieser Strecke</button>}
        <button className="ghost" onClick={p.a.home}>Hauptmenü</button>
      </div>
    </aside>
  );
}

export function Progress({ stats, total }: { stats: Stats | null; total: number }) {
  const [open, setOpen] = useState(false);
  const outcomes = stats?.outcomes;
  const poly = useMemo(() => {   // gleitende Erfolgsquote (letzte 100 Episoden)
    const o = outcomes ?? [], n = o.length;
    if (n < 2) return '';
    const pre = [0]; for (const v of o) pre.push(pre[pre.length - 1] + v);
    const k = Math.max(1, Math.floor(n / 200)), out: string[] = [];
    for (let i = 1; i <= n; i += k) { const lo = Math.max(0, i - 100); out.push(`${((i / n) * 200).toFixed(1)},${(49 - ((pre[i] - pre[lo]) / (i - lo)) * 48).toFixed(1)}`); }
    return out.join(' ');
  }, [outcomes?.length]);   // eslint-disable-line
  const st = stats ?? { status: 'idle', episode: 0, total, successes: 0, failures: 0, rate100: 0, epsilon: 0, bestProgress: 0, lastReward: 0, states: 0, bestSteps: 0, outcomes: [] } as Stats;
  return (
    <div className="progress">
      <div className="row"><span>{STATUS_TEXT[st.status]}</span><b>Episode {st.episode.toLocaleString('de-DE')} / {st.total.toLocaleString('de-DE')}</b></div>
      <div className="bar"><div style={{ width: `${Math.min(100, (st.episode / st.total) * 100)}%` }} /></div>
      <div className="grid">
        <span>Erfolgsquote (letzte 100)</span><b>{fmt(st.rate100 * 100, 0)} %</b>
        <span>Epsilon</span><b>{fmt(st.epsilon, 3)}</b>
        <span>Bester Streckenfortschritt</span><b>{fmt(st.bestProgress * 100, 0)} %</b>
      </div>
      <button className="link" onClick={() => setOpen(!open)}>{open ? 'Weniger' : 'Mehr Statistik'}</button>
      {open && (
        <div>
          <div className="grid">
            <span>Erfolgreich / Fehlgeschlagen</span><b>{st.successes} / {st.failures}</b>
            <span>Reward letzte Episode</span><b>{fmt(st.lastReward, 1)}</b>
            <span>Bekannte Zustände</span><b>{st.states}</b>
            <span>Beste Fahrt (Schritte)</span><b>{st.bestSteps || '–'}</b>
          </div>
          <svg viewBox="0 0 200 50" className="chart"><rect width="200" height="50" fill="none" stroke="#333" />{poly && <polyline points={poly} fill="none" stroke="#5ee1c8" strokeWidth="1.5" />}</svg>
          <small>Gleitende Erfolgsquote (0–100 %) über alle bisherigen Episoden</small>
        </div>
      )}
    </div>
  );
}

export function SaveList(p: { saves: SaveData[]; onOpen: (s: SaveData) => void; onResume: (s: SaveData) => void; onNew: (s: SaveData) => void; onRename: (s: SaveData) => void; onExport: (s: SaveData) => void; onDelete: (s: SaveData) => void }) {
  if (!p.saves.length) return <p className="muted">Noch keine Speicherstände vorhanden.</p>;
  return (
    <ul className="saves">
      {p.saves.map(s => (
        <li key={s.id}>
          <div><b>{s.name}</b><small>{new Date(s.updatedAt).toLocaleString('de-DE')} · Episode {s.episode}/{s.settings.episodes} · {s.episode ? Math.round((s.outcomes.slice(-100).reduce((a, b) => a + b, 0) / Math.min(100, s.outcomes.length)) * 100) : 0} % Erfolg</small></div>
          <div className="row2">
            <button onClick={() => p.onOpen(s)}>Öffnen</button><button onClick={() => p.onResume(s)}>Fortsetzen</button>
            <button onClick={() => p.onNew(s)}>Als neues Training</button><button onClick={() => p.onRename(s)}>Umbenennen</button>
            <button onClick={() => p.onExport(s)}>Export</button><button onClick={() => p.onDelete(s)}>Löschen</button>
          </div>
        </li>
      ))}
    </ul>
  );
}
