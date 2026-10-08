import { useState } from 'preact/hooks';
import { useEscape } from './useEscape';
import type { GameActions } from '../app/gameApp';
import type { HudState } from '../app/hud';
import type { LevelState, WorldState } from '../app/progression';
import { type TranslationKey, t } from '../i18n';
import type { WorldId } from '../levels/validate';
import { StarIcon } from './icons';

/**
 * World map and level select (T6.1): portrait lists with large touch targets. Locked levels show
 * a lock; levels of the full game show a lock and the price from the first minute (§2).
 */

const WORLD_THEME: Record<WorldId, TranslationKey> = {
  w1: 'theme.glade',
  w2: 'theme.deep',
  w3: 'theme.clockworks',
  w4: 'theme.skyreach',
  bonus: 'world.bonus',
};

export function worldName(id: WorldId): string {
  return t(WORLD_THEME[id]);
}

/** A small padlock drawn in code. */
function LockIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 7 8" shape-rendering="crispEdges" aria-hidden="true">
      <path fill="currentColor" d="M2 0h3v1h1v2h1v5H0V3h1V1h1zM2 1v2h3V1zM3 5v2h1V5z" />
    </svg>
  );
}

function Stars({ count, label }: { count: number; label?: string }) {
  return (
    <span
      class="tile-stars"
      {...(label === ''
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': label ?? t('end.stars', { count }) })}
    >
      {[1, 2, 3].map((n) => (
        <StarIcon key={n} filled={n <= count} size={14} />
      ))}
    </span>
  );
}

function MenuHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div class="menu-header">
      <button
        type="button"
        class="icon-button"
        data-testid="menu-back"
        aria-label={t('menu.back')}
        onClick={onBack}
      >
        ←
      </button>
      <h2>{title}</h2>
    </div>
  );
}

function FullGameNote({ price, onClose }: { price: string; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" data-testid="full-game-note">
        <h2>{t('menu.fullGame')}</h2>
        <p>{t('menu.fullGameText', { price })}</p>
        <button type="button" class="text-button sheet-done" onClick={onClose}>
          {t('code.close')}
        </button>
      </div>
    </div>
  );
}

export function WorldMap({ hud, actions }: { hud: HudState; actions: GameActions }) {
  return (
    <div class="menu-screen" data-testid="world-map">
      <MenuHeader title={t('menu.worlds')} onBack={() => actions.openMenu('main')} />
      <ul class="world-list">
        {hud.worlds.map((w: WorldState) => {
          const locked = !w.open;
          return (
            <li key={w.id}>
              <button
                type="button"
                class={`world-card ${locked ? 'locked' : ''}`}
                data-testid={`world-${w.id}`}
                data-open={w.open}
                onClick={() => actions.openMenu('levels', w.id)}
              >
                <span class="world-name">
                  {locked && <LockIcon />} {worldName(w.id)}
                </span>
                <span class="world-meta">
                  <span>
                    {w.solved}/{w.levels.length}
                  </span>
                  <span class="world-stars">
                    <StarIcon filled size={16} /> {w.stars}/{w.maxStars}
                  </span>
                </span>
                {w.paid && (
                  <span class="price-tag">
                    <LockIcon /> {hud.price}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LevelTile({
  level,
  price,
  onPlay,
  onPaid,
}: {
  level: LevelState;
  price: string;
  onPlay: () => void;
  onPaid: () => void;
}) {
  const playable = level.access === 'open' || level.access === 'solved';
  const label =
    level.access === 'paid'
      ? t('menu.levelPaid', { n: level.number, price })
      : level.access === 'locked'
        ? t('menu.levelLocked', { n: level.number })
        : t('menu.level', { n: level.number, stars: level.stars });
  return (
    <button
      type="button"
      class={`level-tile ${level.access}`}
      data-testid={`level-${level.id}`}
      data-access={level.access}
      aria-label={label}
      aria-disabled={level.access === 'locked'}
      onClick={() => (playable ? onPlay() : level.access === 'paid' ? onPaid() : undefined)}
    >
      <span class="tile-number">{level.number}</span>
      {playable ? (
        <Stars count={level.stars} label="" />
      ) : (
        <span class="tile-lock">
          <LockIcon />
          {level.access === 'paid' && <span class="tile-price">{price}</span>}
        </span>
      )}
    </button>
  );
}

export function LevelSelect({
  hud,
  actions,
  onPaid,
}: {
  hud: HudState;
  actions: GameActions;
  onPaid: () => void;
}) {
  const world = hud.worlds.find((w) => w.id === hud.menu.world);
  if (!world) return null;
  return (
    <div class="menu-screen" data-testid="level-select" data-world={world.id}>
      <MenuHeader title={worldName(world.id)} onBack={() => actions.openMenu('worlds')} />
      <p class="menu-sub">
        {world.solved}/{world.levels.length} · <StarIcon filled size={16} /> {world.stars}/
        {world.maxStars}
      </p>
      <div class="level-grid">
        {world.levels.map((l) => (
          <LevelTile
            key={l.id}
            level={l}
            price={hud.price}
            onPlay={() => actions.playLevel(l.id)}
            onPaid={onPaid}
          />
        ))}
      </div>
    </div>
  );
}

/** Menu pages above the attract demo; the note about the full game opens from locked items. */
export function MenuPages({ hud, actions }: { hud: HudState; actions: GameActions }) {
  const [note, setNote] = useState(false);
  const page =
    hud.menu.screen === 'worlds' ? (
      <WorldMap hud={hud} actions={actions} />
    ) : (
      <LevelSelect hud={hud} actions={actions} onPaid={() => setNote(true)} />
    );
  return (
    <>
      {page}
      {note && <FullGameNote price={hud.price} onClose={() => setNote(false)} />}
    </>
  );
}
