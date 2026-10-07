import type { LevelDef } from '../core/level';
import { type TranslationKey, t } from '../i18n';
import { WORLDS, type WorldId } from '../levels/validate';
import { type LevelState, type WorldsInput, levelStates, worldOpen } from './progression';
import type { SaveManager } from './save';

/**
 * Menu pages over the attract demo (T6.1): main menu → world map → level select. Plain data for
 * the DOM overlay, rebuilt from the save whenever the menu changes.
 */

export type MenuPage = 'main' | 'worlds' | 'levels';

export interface WorldCard {
  id: WorldId;
  title: string;
  solved: number;
  total: number;
  stars: number;
  /** Reachable by progression. */
  open: boolean;
  /** Some unsolved level of it needs the full game. */
  paid: boolean;
}

export interface LevelCard {
  id: string;
  number: number;
  title: string;
  state: LevelState;
  stars: number;
  withHelp: boolean;
}

export interface MenuView {
  page: MenuPage;
  world: WorldId | null;
  worlds: WorldCard[];
  levels: LevelCard[];
  /** Localized price of the full-game unlock. */
  price: string;
  fullGame: boolean;
  /** The unlock offer sheet is open. */
  offer: boolean;
}

export function worldTitle(id: WorldId): string {
  return t(`world.${id}` as TranslationKey);
}

function title(l: LevelDef): string {
  return l.titleKey ? t(l.titleKey as TranslationKey) : l.title;
}

export function buildMenu(
  page: MenuPage,
  world: WorldId | null,
  levels: Readonly<Record<WorldId, readonly LevelDef[]>>,
  save: SaveManager,
  fullGame: boolean,
  price: string,
  offer = false,
): MenuView {
  const input: WorldsInput = { levels, solved: (id) => save.level(id).solved, fullGame };
  const worlds: WorldCard[] = WORLDS.filter((w) => levels[w.id].length > 0).map((w) => {
    const list = levels[w.id];
    const states = levelStates(w.id, input);
    return {
      id: w.id,
      title: worldTitle(w.id),
      solved: list.filter((l) => save.level(l.id).solved).length,
      total: list.length,
      stars: list.reduce((n, l) => n + save.level(l.id).stars, 0),
      open: worldOpen(w.id, input),
      paid: states.includes('paid'),
    };
  });
  const cards: LevelCard[] =
    page === 'levels' && world
      ? (() => {
          const states = levelStates(world, input);
          return levels[world].map((l, i) => {
            const p = save.level(l.id);
            return {
              id: l.id,
              number: i + 1,
              title: title(l),
              state: states[i] as LevelState,
              stars: p.stars,
              withHelp: p.solved && !p.clean,
            };
          });
        })()
      : [];
  return { page, world, worlds, levels: cards, price, fullGame, offer };
}
