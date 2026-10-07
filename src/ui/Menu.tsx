import type { MenuActions } from '../app/gameApp';
import type { LevelCard, MenuView, WorldCard } from '../app/menu';
import { t } from '../i18n';

/** Small pixel padlock (code-drawn, no bitmap assets). */
export function LockIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 7 8" shape-rendering="crispEdges" aria-hidden="true">
      <path fill="currentColor" d="M2 0h3v1h1v2h1v5H0V3h1V1h1zM2 1v2h3V1zM3 5v2h1V5z" />
    </svg>
  );
}

function Stars({ count, label }: { count: number; label?: boolean }) {
  return (
    <span class="level-stars" aria-label={label ? t('end.stars', { count }) : undefined}>
      {[1, 2, 3].map((n) => (
        <span key={n} class={n <= count ? 'star on' : 'star'} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      class="icon-button menu-back"
      data-testid="menu-back"
      aria-label={t('menu.back')}
      title={t('menu.back')}
      onClick={onBack}
    >
      ‹
    </button>
  );
}

function WorldButton({ w, actions }: { w: WorldCard; actions: MenuActions }) {
  const locked = !w.open;
  return (
    <button
      type="button"
      class={`world-card world-${w.id} ${locked ? 'locked' : ''}`}
      data-testid={`world-${w.id}`}
      aria-disabled={locked}
      onClick={() => !locked && actions.openWorld(w.id)}
    >
      <span class="world-title">{w.title}</span>
      <span class="world-meta">
        {locked ? (
          <>
            <LockIcon /> {t('menu.worldLocked')}
          </>
        ) : (
          t('menu.worldProgress', { solved: w.solved, total: w.total, stars: w.stars })
        )}
      </span>
      {w.paid && !locked && (
        <span class="world-paid">
          <LockIcon /> {t('menu.partlyPaid')}
        </span>
      )}
    </button>
  );
}

function LevelButton({ l, actions }: { l: LevelCard; actions: MenuActions }) {
  const playable = l.state === 'open' || l.state === 'solved';
  const label =
    l.state === 'locked'
      ? t('menu.levelLocked', { n: l.number })
      : l.state === 'paid'
        ? t('menu.levelPaid', { n: l.number })
        : `${l.number}. ${l.title}`;
  return (
    <button
      type="button"
      class={`level-card ${l.state}`}
      data-testid={`level-${l.id}`}
      data-state={l.state}
      aria-label={label}
      title={label}
      aria-disabled={l.state === 'locked'}
      onClick={() => {
        if (l.state !== 'locked') actions.playLevel(l.id);
      }}
    >
      <span class="level-number">{l.number}</span>
      {playable ? <Stars count={l.stars} /> : <LockIcon />}
      {l.withHelp && (
        <span class="level-help" aria-hidden="true">
          ?
        </span>
      )}
    </button>
  );
}

/** The full-game offer (T8 connects the purchase). Never shown mid-level. */
export function OfferSheet({
  price,
  onBuy,
  onClose,
}: {
  price: string;
  onBuy?: () => void;
  onClose: () => void;
}) {
  return (
    <div class="sheet-backdrop">
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('offer.title')}
        data-testid="offer"
      >
        <h2>{t('offer.title')}</h2>
        <p>{t('offer.text')}</p>
        <div class="end-buttons">
          {onBuy && (
            <button
              type="button"
              class="text-button primary"
              data-testid="offer-buy"
              onClick={onBuy}
            >
              {t('offer.buy', { price })}
            </button>
          )}
          <button type="button" class="text-button" data-testid="offer-later" onClick={onClose}>
            {t('offer.later')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** World map and level select (the main page stays in `App`). */
export function MenuPages({ menu, actions }: { menu: MenuView; actions: MenuActions }) {
  if (menu.page === 'worlds') {
    return (
      <div class="menu-page" data-testid="world-map">
        <div class="menu-header">
          <BackButton onBack={() => actions.menuBack()} />
          <h2>{t('menu.worlds')}</h2>
        </div>
        <div class="world-list">
          {menu.worlds.map((w) => (
            <WorldButton key={w.id} w={w} actions={actions} />
          ))}
        </div>
      </div>
    );
  }
  if (menu.page === 'levels' && menu.world) {
    const world = menu.worlds.find((w) => w.id === menu.world);
    return (
      <div class="menu-page" data-testid="level-select" data-world={menu.world}>
        <div class="menu-header">
          <BackButton onBack={() => actions.menuBack()} />
          <h2>{world?.title}</h2>
        </div>
        {world && (
          <p class="menu-sub">
            {t('menu.worldProgress', {
              solved: world.solved,
              total: world.total,
              stars: world.stars,
            })}
          </p>
        )}
        <div class="level-grid">
          {menu.levels.map((l) => (
            <LevelButton key={l.id} l={l} actions={actions} />
          ))}
        </div>
        {!menu.fullGame && menu.levels.some((l) => l.state === 'paid') && (
          <p class="menu-sub" data-testid="paid-note">
            <LockIcon /> {t('menu.paidNote', { price: menu.price })}
          </p>
        )}
      </div>
    );
  }
  return null;
}
