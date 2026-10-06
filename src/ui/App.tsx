import { useEffect, useState } from 'preact/hooks';
import { getLanguage, onLanguageChange, t } from '../i18n';

/** Root of the DOM overlay above the Pixi canvas. */
export function App() {
  const [, setLanguage] = useState(getLanguage());
  useEffect(() => onLanguageChange(setLanguage), []);

  return (
    <div class="title-card" data-testid="title-card">
      <h1 class="title">{t('app.title')}</h1>
      <p class="tagline">{t('app.tagline')}</p>
    </div>
  );
}
