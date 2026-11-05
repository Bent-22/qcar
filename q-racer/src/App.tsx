import { useEffect, useRef, useState } from 'react';
import { Stage } from './components/Stage';
import type { Sim } from './components/Stage';
import { Progress, SaveList, Sidebar } from './components/Panels';
import { ROAD_W, RoadMask, buildCenterline, buildPath, validate } from './core/track';
import type { Pt } from './core/track';
import { Trainer } from './core/trainer';
import type { Settings, Stats } from './core/trainer';
import { SaveData, deleteSave, downloadSave, listSaves, newId, putSave, validateSave } from './core/storage';

const DEF: Settings = { alpha: 0.15, gamma: 0.95, epsilon: 1, decay: 0.995, speed: 5, episodes: 1000 };

export default function App() {
  const sim = useRef<Sim>({ mode: 'draw', raw: [], center: null, si: 0, gi: 0, mask: null, trainer: null, replay: null, drag: null, onTick: () => {} }).current;
  const meta = useRef({ id: '', name: '' });
  const [screen, setScreen] = useState<'start' | 'draw' | 'work'>('start');
  const [settings, setSettings] = useState<Settings>(DEF);
  const [stats, setStats] = useState<Stats | null>(null);
  const [rep, setRep] = useState(false);
  const [msg, setMsg] = useState('');
  const [saves, setSaves] = useState<SaveData[]>([]);
  const [showSaves, setShowSaves] = useState(false);
  const [, force] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  sim.mode = screen === 'draw' ? 'draw' : 'work';

  const refreshSaves = async () => {
    try { setSaves((await listSaves()).sort((a, b) => b.updatedAt - a.updatedAt)); }
    catch { setMsg('Die Browser-Datenbank (IndexedDB) ist nicht verfügbar.'); }
  };
  useEffect(() => { refreshSaves(); }, []);

  const toSave = (): SaveData => {
    const t = sim.trainer;
    return {
      version: 1, id: meta.current.id, name: meta.current.name, updatedAt: Date.now(),
      center: sim.center!, roadWidth: ROAD_W, si: sim.si, gi: sim.gi,
      car: t ? { ...t.env.car } : { x: 0, y: 0, a: 0 },
      settings: t ? { ...t.settings } : { ...settings },
      episode: t?.episode ?? 0, epsilon: t?.epsilon ?? settings.epsilon,
      successes: t?.successes ?? 0, failures: t?.failures ?? 0, outcomes: t ? t.outcomes.slice() : [],
      bestRun: t?.bestRun ?? null, bestProgress: t?.bestProgress ?? 0, lastReward: t?.lastReward ?? 0,
      status: t?.status ?? 'idle', q: t ? Object.fromEntries(t.agent.q) : {},
    };
  };

  const persist = async (name?: string) => {
    if (!sim.center) return;
    if (!meta.current.id) meta.current.id = newId();
    if (name) meta.current.name = name;
    if (!meta.current.name) meta.current.name = 'Auto-Speicherstand ' + new Date().toLocaleString('de-DE');
    try { await putSave(toSave()); refreshSaves(); } catch { setMsg('Speichern fehlgeschlagen.'); }
  };

  sim.onTick = () => {
    const t = sim.trainer;
    setStats(t ? t.getStats() : null);
    setRep(!!sim.replay);
    if (t && t.needsSave) { t.needsSave = false; persist(); }
  };

  const newTrack = () => {
    Object.assign(sim, { raw: [], center: null, mask: null, trainer: null, replay: null, drag: null });
    meta.current = { id: '', name: '' }; setStats(null); setMsg(''); setScreen('draw');
  };

  const onStroke = (raw: Pt[]) => {
    const c = buildCenterline(raw);
    if (!c) { setMsg('Die Linie ist zu kurz – bitte neu zeichnen.'); sim.raw = []; return; }
    sim.center = c; setMsg('');
  };

  const finishDraw = () => {
    if (!sim.center) { setMsg('Bitte zeichne zuerst eine Strecke (linke Maustaste gedrückt halten).'); return; }
    sim.si = Math.floor(sim.center.length * 0.06); sim.gi = Math.floor(sim.center.length * 0.94);
    const err = validate(sim.center, sim.si, sim.gi);
    if (err) { setMsg(err); return; }
    sim.mask = new RoadMask(sim.center); setMsg(''); setScreen('work');
  };

  const start = () => {
    const err = validate(sim.center, sim.si, sim.gi);
    if (err || !sim.mask || !sim.center) { setMsg(err ?? 'Keine Strecke.'); return; }
    const t = new Trainer(sim.mask, buildPath(sim.center, sim.si, sim.gi), settings);
    t.status = 'running'; sim.trainer = t; setMsg(''); force(n => n + 1);
  };
  const withT = (f: (t: Trainer) => void) => () => { if (sim.trainer) { f(sim.trainer); sim.onTick(); } };
  const replay = () => { const t = sim.trainer; if (t?.bestRun) sim.replay = { frames: t.bestRun, i: 0 }; };

  const load = (sd: SaveData, mode: 'open' | 'resume' | 'new') => {
    const err = validate(sd.center, sd.si, sd.gi);
    if (err) { setMsg(err); return; }
    sim.center = sd.center; sim.si = sd.si; sim.gi = sd.gi; sim.mask = new RoadMask(sd.center);
    sim.raw = []; sim.replay = null; sim.drag = null;
    if (mode === 'new' || sd.episode === 0) {
      sim.trainer = null; setSettings({ ...sd.settings });
      meta.current = { id: '', name: mode === 'new' ? sd.name + ' (neues Training)' : sd.name };
      if (mode !== 'new') meta.current.id = sd.id;
    } else {
      const t = new Trainer(sim.mask, buildPath(sd.center, sd.si, sd.gi), sd.settings, sd);
      t.status = sd.episode >= sd.settings.episodes ? 'finished' : mode === 'resume' ? 'running' : 'paused';
      sim.trainer = t; setSettings({ ...sd.settings }); meta.current = { id: sd.id, name: sd.name };
    }
    setStats(sim.trainer ? sim.trainer.getStats() : null); setMsg(''); setScreen('work');
  };

  const rename = async (s: SaveData) => {
    const n = window.prompt('Neuer Name:', s.name);
    if (n && n.trim()) { await putSave({ ...s, name: n.trim() }); if (meta.current.id === s.id) meta.current.name = n.trim(); refreshSaves(); }
  };
  const remove = async (s: SaveData) => { if (window.confirm(`„${s.name}“ wirklich löschen?`)) { await deleteSave(s.id); refreshSaves(); } };
  const doImport = async (f: File) => {
    try {
      const sd = validateSave(JSON.parse(await f.text()));
      sd.id = newId(); sd.updatedAt = Date.now(); await putSave(sd); await refreshSaves(); setMsg(`„${sd.name}“ importiert.`);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Import fehlgeschlagen.'); }
  };
  const manualSave = () => {
    const n = window.prompt('Name des Speicherstands:', meta.current.name || 'Rennstrecke 1 – Erste Versuche');
    if (n && n.trim()) persist(n.trim());
  };
  const exportCurrent = () => { if (!sim.center) return; if (!meta.current.name) meta.current.name = 'Rennstrecke'; downloadSave({ ...toSave(), id: meta.current.id || newId() }); };
  const home = () => { sim.trainer?.pause(); if (sim.trainer) persist(); sim.trainer = null; setScreen('start'); refreshSaves(); };
  const newTraining = () => {
    if (!sim.trainer) return;
    const s = { ...sim.trainer.settings }; sim.trainer = null; sim.replay = null;
    meta.current = { id: '', name: '' }; setSettings(s); setStats(null);
  };

  const latest = saves.find(s => s.episode > 0);
  const listProps = { saves, onOpen: (s: SaveData) => load(s, 'open'), onResume: (s: SaveData) => load(s, 'resume'), onNew: (s: SaveData) => load(s, 'new'), onRename: rename, onExport: downloadSave, onDelete: remove };

  if (screen === 'start') return (
    <div className="start">
      <h1>Q-Learning Rennstrecke</h1>
      <p>Zeichne eine Strecke und sieh zu, wie ein Auto per Q-Learning selbst fahren lernt.</p>
      <div className="btns">
        <button className="primary big" onClick={newTrack}>Neue Strecke zeichnen</button>
        <button onClick={() => setShowSaves(!showSaves)}>Gespeicherten Speicherstand laden</button>
        <button disabled={!latest} onClick={() => latest && load(latest, 'resume')}>Vorhandenes Training fortsetzen</button>
        <button onClick={() => fileRef.current?.click()}>JSON importieren</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }} />
      </div>
      {msg && <div className="msg inline">{msg}</div>}
      {showSaves && <SaveList {...listProps} />}
    </div>
  );

  return (
    <div className="work">
      {screen === 'work' && (
        <Sidebar settings={settings} set={setSettings} status={sim.trainer?.status ?? 'idle'} hasBest={!!sim.trainer?.bestRun} replaying={rep} hasTrainer={!!sim.trainer}
          a={{ start, pause: withT(t => t.pause()), resume: withT(t => t.resume()), stop: withT(t => t.finish()), replay, save: manualSave, exportSave: exportCurrent, newTraining, home }} />
      )}
      <div className="stagewrap">
        <div className="stage">
          <Stage sim={sim} onStroke={onStroke} />
          {screen === 'draw' && <>
            <button className="finish primary" onClick={finishDraw}>Zeichnen beenden</button>
            {!sim.center && <div className="hint">Linke Maustaste gedrückt halten und die Strecke zeichnen</div>}
            {sim.center && <div className="hint">Straße erstellt – neu zeichnen oder „Zeichnen beenden“ klicken</div>}
          </>}
          {screen === 'work' && <Progress stats={stats} total={settings.episodes} />}
          {screen === 'work' && !sim.trainer && <div className="hint">Start (grün) und Ziel (rot) per Drag-and-drop auf die Straße ziehen</div>}
          {msg && <div className="msg" onClick={() => setMsg('')}>{msg}</div>}
        </div>
        {screen === 'draw' && <button className="ghost homebtn" onClick={() => setScreen('start')}>Hauptmenü</button>}
      </div>
    </div>
  );
}
