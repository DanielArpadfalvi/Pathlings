import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { PublishPanel } from './Panels';
import { TutorialOverlay } from './TutorialOverlay';
import type { SkillId } from '../core/level';
import { SKILLS } from '../core/level';
import type { EditorActions, GameActions } from '../app/gameApp';
import type { HudState } from '../app/hud';
import { format, t } from '../i18n';
import type { DirectionFilter } from '../input/selection';
import {
  FastIcon,
  MinusIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  PopAllIcon,
  RetryIcon,
  RewindIcon,
  SkillIcon,
  StarIcon,
} from './icons';

/** Pop-all needs a 0.6 s hold, then a confirming tap within this window (§1.1). */
export const POP_ALL_HOLD_MS = 600;
export const POP_ALL_CONFIRM_MS = 2500;

const NEXT_FILTER: Record<DirectionFilter, DirectionFilter> = {
  both: 'left',
  left: 'right',
  right: 'both',
};

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function TopBar({ hud }: { hud: HudState }) {
  const low = hud.timeLeftSeconds <= 30;
  return (
    <>
      <div class="hud-numbers">
        <span class="hud-item" title={t('hud.out')} data-testid="hud-out">
          <span class="hud-label">{t('hud.out')}</span> {hud.out}
        </span>
        <span
          class={`hud-item ${hud.saved >= hud.required ? 'hud-good' : ''}`}
          title={t('hud.saved')}
          data-testid="hud-saved"
        >
          <span class="hud-label">{t('hud.saved')}</span> {hud.saved}/{hud.required}
        </span>
        <span
          class={`hud-item ${low ? 'hud-warn' : ''}`}
          title={t('hud.time')}
          data-testid="hud-time"
        >
          {clock(hud.timeLeftSeconds)}
        </span>
      </div>
      {hud.daily && (
        <div class="daily-badge" data-testid="daily-badge">
          {t('daily.badge', { date: hud.daily.date })} · {hud.daily.modifier}
        </div>
      )}
      <div class={`timeline ${hud.rewinding ? 'rewinding' : ''}`} aria-hidden="true">
        <div class="timeline-fill" style={{ width: `${hud.progress * 100}%` }} />
      </div>
    </>
  );
}

function SkillBar({ hud, actions }: { hud: HudState; actions: GameActions }) {
  return (
    <div class="skill-bar" role="toolbar">
      {SKILLS.map((skill: SkillId) => {
        const stock = hud.skills?.[skill] ?? 0;
        const selected = hud.selected === skill;
        return (
          <button
            type="button"
            key={skill}
            class={`skill-button ${selected ? 'selected' : ''}`}
            data-testid={`skill-${skill}`}
            aria-pressed={selected}
            aria-label={`${t(`skill.${skill}`)} (${stock})`}
            title={t(`skill.${skill}`)}
            disabled={stock <= 0}
            onClick={() => actions.selectSkill(skill)}
          >
            <SkillIcon skill={skill} size={22} />
            <span class="skill-stock">{stock}</span>
          </button>
        );
      })}
    </div>
  );
}

function PopAllButton({ hud, actions }: { hud: HudState; actions: GameActions }) {
  const [state, setState] = useState<'idle' | 'holding' | 'armed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  const clear = (): void => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => clear, []);

  const down = (): void => {
    if (hud.nuked) return;
    if (state === 'armed') {
      clear();
      setState('idle');
      actions.popAll();
      return;
    }
    setState('holding');
    clear();
    timer.current = window.setTimeout(() => {
      setState('armed');
      timer.current = window.setTimeout(() => setState('idle'), POP_ALL_CONFIRM_MS);
    }, POP_ALL_HOLD_MS);
  };
  const up = (): void => {
    if (state === 'holding') {
      clear();
      setState('idle');
    }
  };

  return (
    <button
      type="button"
      class={`control-button pop-all ${state}`}
      data-testid="pop-all"
      data-state={state}
      disabled={hud.nuked}
      aria-label={state === 'armed' ? t('control.popAllConfirm') : t('control.popAll')}
      title={t('control.popAll')}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
    >
      <PopAllIcon />
    </button>
  );
}

function RewindButton({ hud, actions }: { hud: HudState; actions: GameActions }) {
  const stop = (): void => actions.rewindEnd();
  return (
    <button
      type="button"
      class={`control-button ${hud.rewinding ? 'active' : ''}`}
      data-testid="rewind"
      data-rewinding={hud.rewinding}
      aria-label={t('control.rewind')}
      title={t('control.rewind')}
      disabled={!hud.canRewind && !hud.rewinding}
      onPointerDown={() => actions.rewindStart()}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      <RewindIcon />
    </button>
  );
}

function ControlBar({ hud, actions }: { hud: HudState; actions: GameActions }) {
  return (
    <div class="control-bar">
      <button
        type="button"
        class={`control-button ${hud.paused ? 'active' : ''}`}
        data-testid="pause"
        aria-pressed={hud.paused}
        aria-label={hud.paused ? t('control.resume') : t('control.pause')}
        onClick={() => actions.togglePause()}
      >
        {hud.paused ? <PlayIcon /> : <PauseIcon />}
      </button>
      <button
        type="button"
        class={`control-button ${hud.speed !== 1 ? 'active' : ''}`}
        data-testid="speed"
        data-speed={hud.speed}
        aria-label={format(t('control.speed'), { speed: hud.speed })}
        onClick={() => actions.cycleSpeed()}
      >
        <FastIcon />
        <span class="control-label">{hud.speed}×</span>
      </button>
      <RewindButton hud={hud} actions={actions} />
      <div class="release" role="group" aria-label={t('control.releaseRate')}>
        <button
          type="button"
          class="control-button narrow"
          data-testid="release-slower"
          aria-label={t('control.releaseSlower')}
          disabled={!hud.canSlower}
          onClick={() => actions.release(-1)}
        >
          <MinusIcon />
        </button>
        <span class="release-value" data-testid="release-value">
          {hud.releaseFactor.toFixed(1)}
        </span>
        <button
          type="button"
          class="control-button narrow"
          data-testid="release-faster"
          aria-label={t('control.releaseFaster')}
          disabled={!hud.canFaster}
          onClick={() => actions.release(1)}
        >
          <PlusIcon />
        </button>
      </div>
      <PopAllButton hud={hud} actions={actions} />
    </div>
  );
}

type HudActions = GameActions & Pick<EditorActions, 'backToEditor' | 'publish'>;

function EndScreen({
  hud,
  actions,
  onHelp,
}: {
  hud: HudState;
  actions: HudActions;
  onHelp: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const end = hud.end;
  if (!end) return null;
  if (code) return <PublishPanel code={code} onClose={() => setCode(null)} />;
  if (hud.replay) {
    return (
      <div class="end-backdrop">
        <div class="end-card" role="dialog" aria-modal="true" data-testid="replay-end">
          <h2>{t('help.replayDone')}</h2>
          <div class="end-buttons">
            <button
              type="button"
              class="text-button primary"
              data-testid="retry"
              onClick={() => actions.retry()}
            >
              <RetryIcon /> {t('help.yourTurn')}
            </button>
          </div>
        </div>
      </div>
    );
  }
  const heading = end.won ? t('end.won') : end.reason === 'time' ? t('end.timeUp') : t('end.lost');
  const helpReady = !end.won && hud.help && (hud.help.hintsUnlocked || hud.help.solutionUnlocked);
  return (
    <div class="end-backdrop">
      <div
        class="end-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-title"
        data-testid="end-screen"
        data-won={end.won}
      >
        <h2 id="end-title" class={end.won ? 'end-won' : 'end-lost'}>
          {heading}
        </h2>
        <div class="end-stars" aria-label={format(t('end.stars'), { count: end.stars })}>
          {[1, 2, 3].map((n) => (
            <StarIcon key={n} filled={n <= end.stars} />
          ))}
        </div>
        {hud.testPlay && !end.won && <p class="editor-hint">{t('end.publishHint')}</p>}
        {end.won && end.withHelp && (
          <p class="editor-hint" data-testid="solved-with-help">
            {t('help.solvedWithHelp')}
          </p>
        )}
        <p class="end-saved">
          {format(t('end.saved'), { saved: end.saved, total: end.total, required: end.required })}
        </p>
        <div class="end-buttons">
          <button
            type="button"
            class="text-button"
            data-testid="retry"
            onClick={() => actions.retry()}
          >
            <RetryIcon /> {t('end.retry')}
          </button>
          {helpReady && (
            <button type="button" class="text-button" data-testid="end-help" onClick={onHelp}>
              {t('help.title')}
            </button>
          )}
          {hud.testPlay && (
            <button
              type="button"
              class="text-button"
              data-testid="edit"
              onClick={() => actions.backToEditor()}
            >
              {t('end.edit')}
            </button>
          )}
          {hud.testPlay && end.won && (
            <button
              type="button"
              class="text-button primary"
              data-testid="publish-level"
              onClick={() => setCode(actions.publish())}
            >
              {t('end.publish')}
            </button>
          )}
          {end.hasNext && (
            <button
              type="button"
              class="text-button primary"
              data-testid="next"
              onClick={() => actions.next()}
            >
              {t('end.next')} <NextIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Whole play overlay: HUD numbers on top, skill + control bars at the bottom, end screen. */
export function PlayHud({
  hud,
  actions,
  floating,
  onHelp,
}: {
  hud: HudState;
  actions: HudActions;
  floating: preact.ComponentChildren;
  onHelp: () => void;
}) {
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Tell the camera which screen strips the UI covers, so it frames the level between them.
  useLayoutEffect(() => {
    const report = (): void => {
      const tr = top.current?.getBoundingClientRect();
      const br = bottom.current?.getBoundingClientRect();
      actions.setInsets(tr ? tr.bottom : 0, br ? window.innerHeight - br.top : 0);
    };
    report();
    const ro = new ResizeObserver(report);
    if (top.current) ro.observe(top.current);
    if (bottom.current) ro.observe(bottom.current);
    window.addEventListener('resize', report);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [actions]);

  return (
    <>
      <div class="hud-top" ref={top} data-testid="hud">
        <TopBar hud={hud} />
      </div>
      <div class="hud-bottom" ref={bottom}>
        <div class="floating-row">{floating}</div>
        <SkillBar hud={hud} actions={actions} />
        <ControlBar hud={hud} actions={actions} />
      </div>
      {hud.rewinding && (
        <div class="rewind-badge" data-testid="rewind-badge">
          <RewindIcon /> {t('hud.rewinding')}
        </div>
      )}
      {hud.tutorial && !hud.end && (
        <TutorialOverlay
          view={hud.tutorial}
          onOk={() => actions.tutorialOk()}
          onSkip={() => actions.skipTutorial()}
        />
      )}
      {hud.replay && !hud.end && (
        <div class="replay-badge" data-testid="replay-badge">
          {t('help.replaying')}
        </div>
      )}
      <EndScreen hud={hud} actions={actions} onHelp={onHelp} />
    </>
  );
}

export { NEXT_FILTER };
