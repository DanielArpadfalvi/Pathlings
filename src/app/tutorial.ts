import type { TutorialStep } from '../levels/tutorial';
import type { PlayScreen } from './playScreen';

/** What the overlay shows for the active tutorial step. */
export interface TutorialView {
  /** i18n key. */
  text: string;
  showOk: boolean;
  /** Ghost-hand target: a control (by test id) or a screen point (CSS px). */
  target: { ui: string } | { x: number; y: number } | null;
  step: number;
  count: number;
}

/**
 * Runs a level's tutorial steps (`src/levels/tutorial.ts`) against a play screen: shows a step
 * when its trigger holds, pauses the game for steps that ask for it, and advances when the player
 * has done what the step asks (picked the skill, assigned it, tapped "Got it") or after a timeout.
 */
export class TutorialDirector {
  private index = 0;
  private active = false;
  private shownAt = 0;
  private logAtShow = 0;
  private okPressed = false;
  private pausedByTutorial = false;

  constructor(
    private readonly steps: readonly TutorialStep[],
    private readonly screen: PlayScreen,
  ) {}

  get finished(): boolean {
    return this.index >= this.steps.length;
  }

  ok(): void {
    this.okPressed = true;
  }

  /** Call every frame with a real-time clock (ms). */
  update(nowMs: number): void {
    // Several steps can complete / start in one frame (e.g. "pick" → "tap" → resume).
    for (let guard = 0; guard < this.steps.length + 1 && !this.finished; guard++) {
      const step = this.steps[this.index] as TutorialStep;
      if (!this.active) {
        if (!this.triggered(step)) break;
        this.active = true;
        this.shownAt = nowMs;
        this.logAtShow = this.screen.session.sim.log.length;
        this.okPressed = false;
        if (step.pause && !this.screen.session.paused) {
          this.screen.session.paused = true;
          this.pausedByTutorial = true;
        }
        break;
      }
      if (!this.completed(step, nowMs)) break;
      this.index++;
      this.active = false;
      const next = this.steps[this.index];
      const nextPausesNow = next !== undefined && next.pause === true && this.triggered(next);
      if (this.pausedByTutorial && !nextPausesNow) {
        this.screen.session.paused = false;
        this.pausedByTutorial = false;
      }
    }
  }

  private triggered(step: TutorialStep): boolean {
    const t = step.trigger;
    const sim = this.screen.session.sim;
    switch (t.kind) {
      case 'start':
        return true;
      case 'tick':
        return sim.tick >= t.tick;
      case 'creatureX': {
        const c = sim.creatures[t.creature];
        return c !== undefined && c.state === 0 && c.x >= t.gte;
      }
    }
  }

  private completed(step: TutorialStep, nowMs: number): boolean {
    const d = step.done;
    switch (d.kind) {
      case 'ok':
        return this.okPressed;
      case 'skillSelected':
        return this.screen.skill === d.skill;
      case 'assigned':
        return this.screen.session.sim.log
          .slice(this.logAtShow)
          .some((c) => c.kind === 'assign' && c.skill === d.skill);
      case 'timeout':
        return nowMs - this.shownAt >= d.ms;
    }
  }

  get view(): TutorialView | null {
    if (!this.active || this.finished) return null;
    const step = this.steps[this.index] as TutorialStep;
    let target: TutorialView['target'] = null;
    if (step.target && 'ui' in step.target) target = { ui: step.target.ui };
    else if (step.target) {
      const c = this.screen.session.sim.creatures[step.target.creature];
      if (c) {
        const p = this.screen.camera.toScreen({ x: c.x + 0.5, y: c.y - 5 });
        target = { x: Math.round(p.x), y: Math.round(p.y) };
      }
    }
    return {
      text: step.text,
      showOk: step.done.kind === 'ok',
      target,
      step: this.index,
      count: this.steps.length,
    };
  }

  /** Stop: hand control back (resume if the tutorial paused the game). */
  stop(): void {
    if (this.pausedByTutorial) this.screen.session.paused = false;
    this.pausedByTutorial = false;
    this.index = this.steps.length;
    this.active = false;
  }
}
