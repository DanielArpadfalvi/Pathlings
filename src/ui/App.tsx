import { useEffect, useState } from 'preact/hooks';
import { getLanguage, onLanguageChange, t } from '../i18n';

export interface AppProps {
  /** Title card over the attract-mode demo (hidden when a level is opened directly). */
  showTitle: boolean;
  /** Shows the "whole level" camera button when set. */
  onWholeLevel?: () => void;
}

/** Four corner brackets: "show everything". Drawn in code, no bitmap assets. */
function WholeLevelIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 13 13" shape-rendering="crispEdges" aria-hidden="true">
      <path
        fill="currentColor"
        d="M0 0h5v2H2v3H0zM8 0h5v5h-2V2H8zM0 8h2v3h3v2H0zM11 8h2v5H8v-2h3zM5 5h3v3H5z"
      />
    </svg>
  );
}

/** Root of the DOM overlay above the Pixi canvas. */
export function App({ showTitle, onWholeLevel }: AppProps) {
  const [, setLanguage] = useState(getLanguage());
  useEffect(() => onLanguageChange(setLanguage), []);

  return (
    <>
      {showTitle && (
        <div class="title-card" data-testid="title-card">
          <h1 class="title">{t('app.title')}</h1>
          <p class="tagline">{t('app.tagline')}</p>
        </div>
      )}
      {onWholeLevel && (
        <button
          type="button"
          class="icon-button whole-level"
          data-testid="whole-level"
          aria-label={t('camera.wholeLevel')}
          title={t('camera.wholeLevel')}
          onClick={onWholeLevel}
        >
          <WholeLevelIcon />
        </button>
      )}
    </>
  );
}
