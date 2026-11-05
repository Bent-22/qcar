// Dauerhafte Speicherung (IndexedDB), Export/Import mit Versionskennung und Validierung.
import type { Pt } from './track';
import type { Settings } from './trainer';

export interface SaveData {
  version: 1; id: string; name: string; updatedAt: number;
  center: Pt[]; roadWidth: number; si: number; gi: number;
  car: { x: number; y: number; a: number };
  settings: Settings; episode: number; epsilon: number;
  successes: number; failures: number; outcomes: number[];
  bestRun: number[] | null; bestProgress: number; lastReward: number;
  status: string; q: Record<string, number[]>;
}

const DB = 'q-racer', STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export const putSave = (s: SaveData) => run('readwrite', st => st.put(s));
export const listSaves = () => run<SaveData[]>('readonly', st => st.getAll());
export const deleteSave = (id: string) => run('readwrite', st => st.delete(id));
export const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

/** Prüft ein (importiertes) Objekt; wirft einen Error mit verständlicher Meldung. */
export function validateSave(o: any): SaveData {
  const bad = (m: string): never => { throw new Error('Ungültige Datei: ' + m); };
  const num = (v: any) => typeof v === 'number' && isFinite(v);
  if (!o || typeof o !== 'object') bad('kein Speicherstand');
  if (o.version !== 1) bad(`Versionskennung "${o.version}" wird nicht unterstützt`);
  if (!Array.isArray(o.center) || o.center.length < 40 || o.center.length > 5000 ||
      !o.center.every((p: any) => p && num(p.x) && num(p.y))) bad('Strecke fehlt oder ist beschädigt');
  if (!Number.isInteger(o.si) || !Number.isInteger(o.gi) || o.si < 0 || o.gi < 0 ||
      o.si >= o.center.length || o.gi >= o.center.length || o.si === o.gi) bad('Start/Ziel');
  const s = o.settings;
  if (!s || !['alpha', 'gamma', 'epsilon', 'decay', 'speed', 'episodes'].every(k => num(s[k])) || s.episodes < 1) bad('Einstellungen');
  if (!num(o.episode) || !num(o.epsilon) || !num(o.successes) || !num(o.failures) ||
      !Array.isArray(o.outcomes) || !o.outcomes.every((v: any) => v === 0 || v === 1)) bad('Statistik');
  if (o.bestRun != null && (!Array.isArray(o.bestRun) || o.bestRun.length % 3 !== 0 || !o.bestRun.every(num))) bad('Beste Fahrt');
  if (!o.q || typeof o.q !== 'object' ||
      !Object.values(o.q).every((r: any) => Array.isArray(r) && r.length === 5 && r.every(num))) bad('Q-Tabelle');
  return {
    ...o, id: String(o.id || ''), name: String(o.name || 'Import'), bestRun: o.bestRun ?? null,
    bestProgress: num(o.bestProgress) ? o.bestProgress : 0, lastReward: num(o.lastReward) ? o.lastReward : 0,
    roadWidth: num(o.roadWidth) ? o.roadWidth : 60, status: String(o.status || 'paused'),
  } as SaveData;
}

export function downloadSave(s: SaveData) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(s)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = s.name.replace(/[^\w\-äöüÄÖÜß ]+/g, '_') + '.json';
  a.click(); URL.revokeObjectURL(url);
}
