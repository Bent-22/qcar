// Trainingssteuerung: Episoden, Statistik, beste Fahrt.
import { Env } from './env';
import { QAgent } from './qlearning';
import type { Pt, RoadMask } from './track';

export interface Settings { alpha: number; gamma: number; epsilon: number; decay: number; speed: number; episodes: number }
export type Status = 'idle' | 'running' | 'paused' | 'finished';
export const EPS_MIN = 0.05;

export interface TrainerSnap {
  episode: number; epsilon: number; successes: number; failures: number; outcomes: number[];
  bestRun: number[] | null; bestProgress: number; lastReward: number; q: Record<string, number[]>;
}

export interface Stats {
  status: Status; episode: number; total: number; successes: number; failures: number; rate100: number;
  epsilon: number; bestProgress: number; lastReward: number; states: number; bestSteps: number; outcomes: number[];
}

export class Trainer {
  env: Env;
  agent: QAgent;
  settings: Settings;
  status: Status = 'idle';
  episode = 0;
  epsilon: number;
  successes = 0;
  failures = 0;
  outcomes: number[] = [];
  bestRun: number[] | null = null;   // flache Liste x,y,winkel je Schritt
  bestProgress = 0;
  lastReward = 0;
  needsSave = false;
  private s = 0;
  private rec: number[] = [];
  private epReward = 0;
  private lastHint = 0;

  constructor(mask: RoadMask, path: Pt[], settings: Settings, snap?: TrainerSnap) {
    this.settings = { ...settings };
    this.env = new Env(mask, path);
    this.agent = new QAgent(settings.alpha, settings.gamma);
    this.epsilon = settings.epsilon;
    if (snap) {
      this.episode = snap.episode; this.epsilon = snap.epsilon;
      this.successes = snap.successes; this.failures = snap.failures;
      this.outcomes = snap.outcomes.slice(); this.bestRun = snap.bestRun ? snap.bestRun.slice() : null;
      this.bestProgress = snap.bestProgress; this.lastReward = snap.lastReward;
      for (const k of Object.keys(snap.q)) this.agent.q.set(Number(k), snap.q[k].slice());
    }
    this.begin();
  }

  private begin() {
    this.s = this.env.reset();
    this.rec = [this.env.car.x, this.env.car.y, this.env.car.a];
    this.epReward = 0;
  }

  private stepOnce() {
    const a = this.agent.act(this.s, this.epsilon);
    const r = this.env.step(a);
    const s2 = this.env.stateKey();
    this.agent.update(this.s, a, r.reward, s2, r.done);
    this.rec.push(this.env.car.x, this.env.car.y, this.env.car.a);
    this.epReward += r.reward;
    this.s = s2;
    if (r.done) this.endEpisode(r.success);
  }

  private endEpisode(ok: boolean) {
    this.episode++;
    this.outcomes.push(ok ? 1 : 0);
    if (ok) this.successes++; else this.failures++;
    this.epsilon = Math.max(EPS_MIN, this.epsilon * this.settings.decay);
    this.bestProgress = Math.max(this.bestProgress, this.env.bestIdx / (this.env.path.length - 1));
    this.lastReward = this.epReward;
    if (ok && (!this.bestRun || this.rec.length < this.bestRun.length)) this.bestRun = this.rec.slice();
    const now = Date.now();
    if (this.episode % 25 === 0 || (ok && now - this.lastHint > 5000)) { this.needsSave = true; this.lastHint = now; }
    if (this.episode >= this.settings.episodes) this.finish(); else this.begin();
  }

  /** Führt bis zu maxSteps Lernschritte aus (begrenzt durch ein Zeitbudget, damit die UI flüssig bleibt). */
  tick(maxSteps: number, budgetMs: number) {
    const t0 = performance.now();
    for (let n = 0; n < maxSteps && this.status === 'running'; n++) {
      this.stepOnce();
      if ((n & 63) === 63 && performance.now() - t0 > budgetMs) break;
    }
  }

  pause() { if (this.status === 'running') { this.status = 'paused'; this.needsSave = true; } }
  resume() { if (this.status === 'paused') this.status = 'running'; }
  finish() { this.status = 'finished'; this.needsSave = true; }

  getStats(): Stats {
    const last = this.outcomes.slice(-100);
    return {
      status: this.status, episode: this.episode, total: this.settings.episodes,
      successes: this.successes, failures: this.failures,
      rate100: last.length ? last.reduce((a, b) => a + b, 0) / last.length : 0,
      epsilon: this.epsilon, bestProgress: this.bestProgress, lastReward: this.lastReward,
      states: this.agent.q.size, bestSteps: this.bestRun ? this.bestRun.length / 3 - 1 : 0,
      outcomes: this.outcomes,
    };
  }
}
