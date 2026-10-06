import { useEffect, useState } from 'preact/hooks';
import { getLanguage, onLanguageChange, t } from '../i18n';

export interface AppProps {
  /** Title card over the attract-mode demo (hidden when a level is opened directly). */
  showTitle: boolean;
}

/** Root of the DOM overlay above the Pixi canvas. */
export function App({ showTitle }: AppProps) {
  const [, setLanguage] = useState(getLanguage());
  useEffect(() => onLanguageChange(setLanguage), []);

  if (!showTitle) return null;
  return (
    <div class="title-card" data-testid="title-card">
      <h1 class="title">{t('app.title')}</h1>
      <p class="tagline">{t('app.tagline')}</p>
    </div>
  );
}
