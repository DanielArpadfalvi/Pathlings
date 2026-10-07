import type { SkillId } from '../core/level';

/**
 * The tutorial of World 1 (§1.4, T5.2): contextual bubbles on levels 1–8, each introducing one
 * skill, plus the controls over levels 1–3. A step appears when its trigger holds, optionally
 * pauses the game at the key moment, points the ghost hand at a button or a creature, and ends
 * when the player does what it asks. The whole tutorial can be skipped.
 */

export type TutorialTrigger =
  | { kind: 'start' }
  | { kind: 'creatureX'; creature: number; gte: number }
  | { kind: 'tick'; tick: number };

export type TutorialTarget =
  /** A DOM control by its data-testid. */
  | { ui: string }
  /** A creature by its id (the ghost hand follows it). */
  | { creature: number };

export type TutorialDone =
  /** The player taps "Got it". */
  | { kind: 'ok' }
  | { kind: 'skillSelected'; skill: SkillId }
  | { kind: 'assigned'; skill: SkillId }
  /** Disappears on its own after a few seconds. */
  | { kind: 'timeout'; ms: number };

export interface TutorialStep {
  /** i18n key of the bubble text. */
  text: string;
  trigger: TutorialTrigger;
  target?: TutorialTarget;
  /** Pause the game while this step is shown (resumed when it is done). */
  pause?: boolean;
  done: TutorialDone;
}

/** The usual pair: pause when the pioneer reaches `x`, pick the skill, tap the pioneer. */
function teach(skill: SkillId, x: number, creature = 0): TutorialStep[] {
  return [
    {
      text: `tutorial.pick.${skill}`,
      trigger: { kind: 'creatureX', creature, gte: x },
      target: { ui: `skill-${skill}` },
      pause: true,
      done: { kind: 'skillSelected', skill },
    },
    {
      text: 'tutorial.tapCreature',
      trigger: { kind: 'tick', tick: 0 },
      target: { creature },
      pause: true,
      done: { kind: 'assigned', skill },
    },
  ];
}

export const TUTORIAL: Readonly<Record<string, readonly TutorialStep[]>> = {
  'w1-01': [
    { text: 'tutorial.welcome', trigger: { kind: 'start' }, pause: true, done: { kind: 'ok' } },
    ...teach('delver', 120),
    {
      text: 'tutorial.follow',
      trigger: { kind: 'tick', tick: 0 },
      done: { kind: 'timeout', ms: 4000 },
    },
  ],
  'w1-02': [
    {
      text: 'tutorial.pause',
      trigger: { kind: 'start' },
      target: { ui: 'pause' },
      done: { kind: 'timeout', ms: 5000 },
    },
    ...teach('mason', 170),
    {
      text: 'tutorial.speed',
      trigger: { kind: 'tick', tick: 0 },
      target: { ui: 'speed' },
      done: { kind: 'timeout', ms: 5000 },
    },
  ],
  'w1-03': [
    {
      text: 'tutorial.camera',
      trigger: { kind: 'start' },
      target: { ui: 'whole-level' },
      done: { kind: 'timeout', ms: 6000 },
    },
    ...teach('burrower', 135),
    {
      text: 'tutorial.rewind',
      trigger: { kind: 'tick', tick: 0 },
      target: { ui: 'rewind' },
      done: { kind: 'timeout', ms: 5000 },
    },
  ],
  'w1-04': teach('warden', 195),
  'w1-05': [
    ...teach('scaler', 60),
    {
      text: 'tutorial.permanent',
      trigger: { kind: 'tick', tick: 0 },
      done: { kind: 'timeout', ms: 5000 },
    },
  ],
  'w1-06': teach('glider', 60),
  'w1-07': teach('sloper', 80),
  'w1-08': [
    ...teach('popper', 150),
    {
      text: 'tutorial.popAll',
      trigger: { kind: 'tick', tick: 0 },
      target: { ui: 'pop-all' },
      done: { kind: 'timeout', ms: 5000 },
    },
  ],
};
