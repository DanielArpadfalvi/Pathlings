import { h, render } from 'preact';
import './ui/styles.css';
import { createStage } from './render/stage';
import { App } from './ui/App';
import { getLanguage } from './i18n';

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  const stage = document.getElementById('stage');
  const ui = document.getElementById('ui');
  if (!root || !stage || !ui) throw new Error('Missing #app, #stage or #ui root element');
  document.documentElement.lang = getLanguage();
  await createStage(stage);
  render(h(App, {}), ui);
  root.dataset.ready = 'true';
}

void boot();
