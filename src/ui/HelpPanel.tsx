import type { HelpInfo } from '../app/hud';
import { t } from '../i18n';

/**
 * Hints and "watch the solution" (§1.4, T5.7): both free, unlocked by failed attempts. Before
 * that the panel says how many more tries are needed.
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
  return (
    <div class="sheet-backdrop">
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('help.title')}
        data-testid="help-panel"
      >
        <h2>{t('help.title')}</h2>
        {help.hintCount === 0 ? (
          <p class="editor-hint">{t('help.noHints')}</p>
        ) : help.hintsUnlocked ? (
          <ol class="hint-list" data-testid="hint-list">
            {help.hints.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ol>
        ) : (
          <p class="editor-hint" data-testid="hints-locked">
            {t('help.hintsLocked', { count: help.failsToHints })}
          </p>
        )}
        {help.hasSolution && (
          <p class="editor-hint" data-testid="solution-state">
            {help.solutionUnlocked
              ? t('help.solutionNote')
              : t('help.solutionLocked', { count: help.failsToSolution })}
          </p>
        )}
        <div class="end-buttons">
          {help.hasSolution && (
            <button
              type="button"
              class="text-button primary"
              data-testid="watch-solution"
              disabled={!help.solutionUnlocked}
              onClick={onWatch}
            >
              {t('help.watch')}
            </button>
          )}
          <button type="button" class="text-button" data-testid="help-close" onClick={onClose}>
            {t('code.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
