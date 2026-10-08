import type { HelpInfo } from '../app/hud';
import { useEscape } from './useEscape';
import { t } from '../i18n';

/**
 * Hints and the solution replay of the current level (T5.7): both free and unlimited, unlocked
 * by failed tries (§1.3). Locked items show how many more tries they need.
 */
export function HelpPanel({
  help,
  onWatch,
  onClose,
}: {
  help: HelpInfo;
  onWatch: () => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const hintsLeft = Math.max(0, help.hintFails - help.fails);
  const solutionLeft = Math.max(0, help.solutionFails - help.fails);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        data-testid="help-panel"
      >
        <h2 id="help-title">{t('help.title')}</h2>
        {help.hints.length === 0 ? (
          <p class="editor-hint">{t('help.noHints')}</p>
        ) : help.hintsUnlocked ? (
          <ol class="help-hints" data-testid="help-hints">
            {help.hints.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ol>
        ) : (
          <p class="editor-hint" data-testid="help-hints-locked">
            {t('help.hintsLocked', { n: hintsLeft })}
          </p>
        )}
        {help.hasSolution &&
          (help.solutionUnlocked ? (
            <button
              type="button"
              class="text-button primary"
              data-testid="watch-solution"
              onClick={onWatch}
            >
              {t('help.watch')}
            </button>
          ) : (
            <p class="editor-hint" data-testid="solution-locked">
              {t('help.solutionLocked', { n: solutionLeft })}
            </p>
          ))}
        <p class="editor-hint">{t('help.free')}</p>
        <button
          type="button"
          class="text-button sheet-done"
          data-testid="help-close"
          onClick={onClose}
        >
          {t('code.close')}
        </button>
      </div>
    </div>
  );
}
