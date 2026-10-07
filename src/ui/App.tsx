import { useEffect, useState } from 'preact/hooks';
import type { EditorView } from '../app/editorScreen';
import type { EditorActions, GameActions } from '../app/gameApp';
import type { HudState } from '../app/hud';
import type { Store } from '../app/store';
import { getLanguage, onLanguageChange, t } from '../i18n';
import type { DirectionFilter } from '../input/selection';
import { EditorHud } from './EditorHud';
import { CodePanel, MyLevelsPanel } from './Panels';
import type { MyLevel } from '../app/myLevels';
import { NEXT_FILTER, PlayHud } from './PlayHud';

export interface AppProps {
  hud: Store<HudState>;
  editor: Store<EditorView | null>;
  myLevels: Store<MyLevel[]>;
  actions: GameActions & EditorActions;
}

/** Pixel arrows: ← →, ←, or →. */
function FilterIcon({ filter }: { filter: DirectionFilter }) {
  const left = 'M0 6l4-4v3h4v2H4v3z';
  const right = 'M16 6l-4-4v3H8v2h4v3z';
  const d = filter === 'left' ? left : filter === 'right' ? right : `${left}${right}`;
  return (
    <svg width="28" height="14" viewBox="0 0 16 12" shape-rendering="crispEdges" aria-hidden="true">
      <path fill="currentColor" d={d} />
    </svg>
  );
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

function useStore<T>(store: Store<T>): T {
  const [value, setValue] = useState(store.get());
  useEffect(() => {
    setValue(store.get());
    return store.subscribe(setValue);
  }, [store]);
  return value;
}

/** Root of the DOM overlay above the Pixi canvas: title card or the play HUD. */
export function App({ hud: store, editor: editorStore, myLevels: myStore, actions }: AppProps) {
  const [, setLanguage] = useState(getLanguage());
  useEffect(() => onLanguageChange(setLanguage), []);
  const hud = useStore(store);
  const editorView = useStore(editorStore);
  const [codeOpen, setCodeOpen] = useState(false);
  const [myOpen, setMyOpen] = useState(false);
  const myLevels = useStore(myStore);

  if (hud.mode === 'title') {
    return (
      <div class="title-card" data-testid="title-card">
        <h1 class="title">{t('app.title')}</h1>
        <p class="tagline">{t('app.tagline')}</p>
        <button
          type="button"
          class="text-button primary play-button"
          data-testid="play"
          onClick={() => actions.play()}
        >
          {t('title.play')}
        </button>
        <button
          type="button"
          class="text-button editor-button"
          data-testid="open-editor"
          onClick={() => actions.openEditor()}
        >
          {t('title.editor')}
        </button>
        <button
          type="button"
          class="text-button editor-button"
          data-testid="open-code"
          onClick={() => setCodeOpen(true)}
        >
          {t('title.code')}
        </button>
        <button
          type="button"
          class="text-button editor-button"
          data-testid="open-my-levels"
          onClick={() => setMyOpen(true)}
        >
          {t('title.myLevels')}
        </button>
        {codeOpen && <CodePanel actions={actions} onClose={() => setCodeOpen(false)} />}
        {myOpen && (
          <MyLevelsPanel levels={myLevels} actions={actions} onClose={() => setMyOpen(false)} />
        )}
      </div>
    );
  }

  const wholeLevel = (
    <button
      type="button"
      class="icon-button"
      data-testid="whole-level"
      aria-label={t('camera.wholeLevel')}
      title={t('camera.wholeLevel')}
      onClick={() => actions.toggleWholeLevel()}
    >
      <WholeLevelIcon />
    </button>
  );

  if (hud.mode === 'editor' && editorView) {
    return (
      <EditorHud
        view={editorView}
        actions={actions}
        floating={
          <>
            <span />
            {wholeLevel}
          </>
        }
      />
    );
  }

  const floating = (
    <>
      <button
        type="button"
        class="icon-button"
        data-testid="direction-filter"
        data-filter={hud.filter}
        aria-label={t(`filter.${hud.filter}`)}
        title={t(`filter.${hud.filter}`)}
        onClick={() => actions.setFilter(NEXT_FILTER[hud.filter])}
      >
        <FilterIcon filter={hud.filter} />
      </button>
      {hud.testPlay ? (
        <button
          type="button"
          class="icon-button"
          data-testid="test-edit"
          aria-label={t('end.edit')}
          title={t('end.edit')}
          onClick={() => actions.backToEditor()}
        >
          ✎
        </button>
      ) : null}
      {wholeLevel}
    </>
  );
  return <PlayHud hud={hud} actions={actions} floating={floating} />;
}
