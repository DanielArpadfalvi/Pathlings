import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import type { TutorialView } from '../app/tutorial';
import { type TranslationKey, t } from '../i18n';

/** Code-drawn pointing hand (no bitmap assets). */
function HandIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">
      <path
        fill="#fff8e6"
        stroke="#1a1626"
        stroke-width="0.6"
        d="M4 0h1v5h1V3h1v2h1V4h1v2h1V5h1v4l-1 2H5L3 8V6h1z"
      />
    </svg>
  );
}

function centreOf(testId: string): { x: number; y: number } | null {
  const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}

/**
 * Tutorial bubble (§1.4): the step text with "Got it" / "Skip tutorial", a ghost hand tapping
 * at the target (a control or a creature) and a pulsing highlight on target controls.
 */
export function TutorialOverlay({
  view,
  onOk,
  onSkip,
}: {
  view: TutorialView;
  onOk: () => void;
  onSkip: () => void;
}) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const target = view.target;
  const ui = target && 'ui' in target ? target.ui : null;

  useLayoutEffect(() => {
    if (!target) setPoint(null);
    else if ('ui' in target) setPoint(centreOf(target.ui));
    else setPoint({ x: target.x, y: target.y });
  }, [ui, target && 'x' in target ? target.x : null, target && 'y' in target ? target.y : null]);

  useEffect(() => {
    if (!ui) return;
    const el = document.querySelector<HTMLElement>(`[data-testid="${ui}"]`);
    el?.classList.add('tutorial-target');
    return () => el?.classList.remove('tutorial-target');
  }, [ui]);

  return (
    <>
      <div
        class="tutorial-bubble"
        role="status"
        data-testid="tutorial-bubble"
        data-step={view.step}
      >
        <p>{t(view.text as TranslationKey)}</p>
        <div class="tutorial-actions">
          <button type="button" class="tutorial-skip" data-testid="tutorial-skip" onClick={onSkip}>
            {t('tutorial.skip')}
          </button>
          {view.showOk && (
            <button
              type="button"
              class="text-button primary"
              data-testid="tutorial-ok"
              onClick={onOk}
            >
              {t('tutorial.ok')}
            </button>
          )}
        </div>
      </div>
      {point && (
        <div
          class="tutorial-hand"
          data-testid="tutorial-hand"
          data-x={point.x}
          data-y={point.y}
          data-target={ui ?? 'creature'}
          style={{ left: `${point.x}px`, top: `${point.y}px` }}
        >
          <HandIcon />
        </div>
      )}
    </>
  );
}
