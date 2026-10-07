import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { EditorView } from '../app/editorScreen';
import type { EditorActions } from '../app/gameApp';
import type { LevelObjectType } from '../core/level';
import { OBJECT_TYPES } from '../core/level';
import type { BrushSize } from '../core/raster';
import { STAMPS } from '../core/stamps';
import { PAINT_MATERIALS } from '../editor/palette';
import type { PaintMaterial, ShapeKind, Tool } from '../editor/tools';
import { format, t } from '../i18n';
import {
  BOUNCE_ART,
  ENTRANCE_ART,
  EXIT_ART,
  OBJECT_KEY,
  TELEPORT_ART,
  TRAP_ART,
} from '../render/objectArt';
import { PALETTES } from '../render/palette';
import type { ColorKey, PixelGrid } from '../render/pixelArt';
import { NextIcon, PlayIcon, RetryIcon } from './icons';
import { PropertySheet } from './Panels';

/** Renders a pixel grid as crisp SVG rects (editor previews; no bitmap assets). */
function GridSvg({
  grid,
  colors,
  size = 28,
}: {
  grid: PixelGrid;
  colors: ColorKey;
  size?: number;
}) {
  const w = grid.rows[0]?.length ?? 1;
  const h = grid.rows.length;
  const rects: preact.JSX.Element[] = [];
  grid.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = colors[row[x] as string];
      if (c === undefined) continue;
      rects.push(
        <rect
          key={`${x},${y}`}
          x={x}
          y={y}
          width={1}
          height={1}
          fill={`#${c.toString(16).padStart(6, '0')}`}
        />,
      );
    }
  });
  const scale = size / Math.max(w, h);
  return (
    <svg
      width={Math.round(w * scale)}
      height={Math.round(h * scale)}
      viewBox={`0 0 ${w} ${h}`}
      shape-rendering="crispEdges"
      aria-hidden="true"
    >
      {rects}
    </svg>
  );
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

const OBJECT_PREVIEW: Partial<Record<LevelObjectType, PixelGrid>> = {
  entrance: ENTRANCE_ART,
  exit: EXIT_ART,
  trap: TRAP_ART,
  teleport: TELEPORT_ART,
  bounce: BOUNCE_ART,
};

function ObjectIcon({ type, theme }: { type: LevelObjectType; theme: EditorView['theme'] }) {
  const art = OBJECT_PREVIEW[type];
  if (art) return <GridSvg grid={art} colors={OBJECT_KEY} size={26} />;
  const p = PALETTES[theme];
  const body = type === 'water' ? p.water.body : p.lava.body;
  const top = type === 'water' ? p.water.surface : p.lava.surface;
  return (
    <svg width="26" height="14" viewBox="0 0 13 7" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="0" y="1" width="13" height="6" fill={hex(body)} />
      <rect x="0" y="0" width="13" height="1" fill={hex(top)} />
    </svg>
  );
}

const TOOL_ICONS: Record<Tool['kind'], string> = {
  brush: 'M8 0h3v3H8zM6 2h3v3H6zM4 4h3v3H4zM1 7h4v4H1z',
  shape: 'M0 1h7v6H0zM8 5a4 4 0 1 0 0.01 0z',
  stamp: 'M4 0h4v5H4zM1 5h10v3H1zM0 9h12v2H0z',
  eraser: 'M5 1h5l2 2-6 6H3L1 7zM1 10h10v1H1z',
  object: 'M1 3h10v8H1zM3 5h2v4H3zM7 5h2v4H7zM4 0h4v3H4z',
  hand: 'M3 3h1V1h1v4h1V0h1v5h1V1h1v5h1V3h1v6l-2 3H5L2 8V5h1z',
};

function ToolIcon({ kind }: { kind: Tool['kind'] }) {
  return (
    <svg width="22" height="22" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">
      <path fill="currentColor" d={TOOL_ICONS[kind]} />
    </svg>
  );
}

const SHAPE_ICONS: Record<ShapeKind, string> = {
  rect: 'M1 2h10v8H1z',
  circle: 'M4 1h4v1h2v2h1v4h-1v2H8v1H4v-1H2V8H1V4h1V2h2z',
  ramp: 'M11 1v10H1z',
  poly: 'M5 0l6 4-2 7H3L0 5z',
};

function defaultTool(kind: Tool['kind'], current: Tool, stamps: readonly string[]): Tool {
  const m: PaintMaterial = 'm' in current ? current.m : 1;
  const size: BrushSize = 'size' in current ? current.size : 1;
  switch (kind) {
    case 'brush':
      return { kind, size, m };
    case 'eraser':
      return { kind, size };
    case 'shape':
      return { kind, shape: 'rect', m };
    case 'stamp':
      return { kind, id: stamps[0] ?? 'boulder', flip: false, m };
    case 'object':
      return { kind, type: 'trap' };
    case 'hand':
      return { kind };
  }
}

function MaterialPicker({ view, actions }: { view: EditorView; actions: EditorActions }) {
  const tool = view.tool;
  if (!('m' in tool)) return null;
  const p = PALETTES[view.theme];
  return (
    <div class="editor-row" role="radiogroup">
      {PAINT_MATERIALS.map((m) => (
        <button
          type="button"
          key={m}
          class={`swatch ${tool.m === m ? 'selected' : ''}`}
          data-testid={`editor-material-${m}`}
          role="radio"
          aria-checked={tool.m === m}
          aria-label={t(`material.${m}`)}
          title={t(`material.${m}`)}
          style={{ background: hex(p.materials[m]!.shades[1]) }}
          onClick={() => actions.setTool({ ...tool, m } as Tool)}
        >
          {m === 4 ? '←' : m === 5 ? '→' : ''}
        </button>
      ))}
    </div>
  );
}

function SizePicker({ view, actions }: { view: EditorView; actions: EditorActions }) {
  const tool = view.tool;
  if (tool.kind !== 'brush' && tool.kind !== 'eraser') return null;
  return (
    <div class="editor-row" role="radiogroup">
      {([0, 1, 2] as const).map((size) => (
        <button
          type="button"
          key={size}
          class={`option ${tool.size === size ? 'selected' : ''}`}
          data-testid={`editor-size-${size}`}
          role="radio"
          aria-checked={tool.size === size}
          aria-label={format(t('editor.brushSize'), { n: size + 1 })}
          onClick={() => actions.setTool({ ...tool, size })}
        >
          <span class="dot" style={{ width: `${6 + size * 6}px`, height: `${6 + size * 6}px` }} />
        </button>
      ))}
    </div>
  );
}

function ToolOptions({ view, actions }: { view: EditorView; actions: EditorActions }) {
  const tool = view.tool;
  switch (tool.kind) {
    case 'brush':
      return (
        <>
          <SizePicker view={view} actions={actions} />
          <MaterialPicker view={view} actions={actions} />
        </>
      );
    case 'eraser':
      return <SizePicker view={view} actions={actions} />;
    case 'shape':
      return (
        <>
          <div class="editor-row" role="radiogroup">
            {(['rect', 'circle', 'ramp', 'poly'] as const).map((shape) => (
              <button
                type="button"
                key={shape}
                class={`option ${tool.shape === shape ? 'selected' : ''}`}
                data-testid={`editor-shape-${shape}`}
                role="radio"
                aria-checked={tool.shape === shape}
                aria-label={t(`editor.shape.${shape}`)}
                onClick={() => actions.setTool({ ...tool, shape })}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 12 12"
                  shape-rendering="crispEdges"
                  aria-hidden="true"
                >
                  <path fill="currentColor" d={SHAPE_ICONS[shape]} />
                </svg>
              </button>
            ))}
            {tool.shape === 'poly' && (
              <button
                type="button"
                class="option wide"
                data-testid="editor-poly-done"
                disabled={view.polyCorners < 3}
                onClick={() => actions.finishPoly()}
              >
                {format(t('editor.polyDone'), { n: view.polyCorners })}
              </button>
            )}
          </div>
          <MaterialPicker view={view} actions={actions} />
        </>
      );
    case 'stamp': {
      const p = PALETTES[view.theme];
      const colors: Record<string, number> = { '#': p.materials[tool.m]!.shades[1] };
      for (let m = 1; m <= 6; m++) colors[String(m)] = p.materials[m]!.shades[1];
      return (
        <>
          <div class="editor-row scroll" role="radiogroup">
            {view.stamps.map((id, i) => (
              <button
                type="button"
                key={id}
                class={`option stamp ${tool.id === id ? 'selected' : ''}`}
                data-testid={`editor-stamp-${id}`}
                role="radio"
                aria-checked={tool.id === id}
                aria-label={format(t('editor.stampN'), { n: i + 1 })}
                onClick={() => actions.setTool({ ...tool, id })}
              >
                <GridSvg grid={{ rows: STAMPS[id]!.rows, ox: 0 }} colors={colors} size={30} />
              </button>
            ))}
          </div>
          <div class="editor-row">
            <button
              type="button"
              class={`option wide ${tool.flip ? 'selected' : ''}`}
              data-testid="editor-stamp-flip"
              aria-pressed={tool.flip}
              onClick={() => actions.setTool({ ...tool, flip: !tool.flip })}
            >
              {t('editor.flipStamp')}
            </button>
          </div>
          <MaterialPicker view={view} actions={actions} />
        </>
      );
    }
    case 'object':
      return (
        <div class="editor-row scroll" role="radiogroup">
          {OBJECT_TYPES.map((type) => (
            <button
              type="button"
              key={type}
              class={`option ${tool.type === type ? 'selected' : ''}`}
              data-testid={`editor-object-${type}`}
              role="radio"
              aria-checked={tool.type === type}
              aria-label={t(`object.${type}`)}
              title={t(`object.${type}`)}
              onClick={() => actions.setTool({ kind: 'object', type })}
            >
              <ObjectIcon type={type} theme={view.theme} />
            </button>
          ))}
        </div>
      );
    case 'hand':
      return view.selected ? (
        <div class="editor-row">
          <span class="editor-label">{t(`object.${view.selected.type}`)}</span>
          {view.selected.type === 'entrance' && (
            <button
              type="button"
              class="option wide"
              data-testid="editor-flip"
              onClick={() => actions.flipSelected()}
            >
              {t('editor.flip')} {view.selected.dir > 0 ? '→' : '←'}
            </button>
          )}
          <button
            type="button"
            class="option wide danger"
            data-testid="editor-delete"
            onClick={() => actions.deleteSelected()}
          >
            {t('editor.delete')}
          </button>
        </div>
      ) : (
        <p class="editor-hint">{t('editor.handHint')}</p>
      );
  }
}

const TOOLS: readonly Tool['kind'][] = ['brush', 'shape', 'stamp', 'eraser', 'object', 'hand'];

/** The editor's overlay: undo/redo + status on top, tools and their options at the bottom. */
export function EditorHud({
  view,
  actions,
  floating,
}: {
  view: EditorView;
  actions: EditorActions;
  floating: preact.ComponentChildren;
}) {
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const [showProps, setShowProps] = useState(false);
  useLayoutEffect(() => {
    const report = (): void => {
      const tr = top.current?.getBoundingClientRect();
      const br = bottom.current?.getBoundingClientRect();
      actions.setInsets(tr ? tr.bottom : 0, br ? window.innerHeight - br.top : 0);
    };
    report();
    const ro = new ResizeObserver(report);
    if (top.current) ro.observe(top.current);
    if (bottom.current) ro.observe(bottom.current);
    return () => ro.disconnect();
  }, [actions]);

  const st = view.status;
  const kb = (n: number): string => (n / 1024).toFixed(1);
  return (
    <>
      <div class="hud-top editor-top" ref={top} data-testid="editor">
        <button
          type="button"
          class="control-button narrow"
          data-testid="editor-back"
          aria-label={t('editor.back')}
          onClick={() => actions.exitEditor()}
        >
          <span class="flip-x">
            <NextIcon />
          </span>
        </button>
        <button
          type="button"
          class="control-button narrow"
          data-testid="editor-undo"
          aria-label={t('editor.undo')}
          disabled={!view.canUndo}
          onClick={() => actions.undo()}
        >
          <span class="flip-x">
            <RetryIcon />
          </span>
        </button>
        <button
          type="button"
          class="control-button narrow"
          data-testid="editor-redo"
          aria-label={t('editor.redo')}
          disabled={!view.canRedo}
          onClick={() => actions.redo()}
        >
          <RetryIcon />
        </button>
        <button
          type="button"
          class="control-button narrow"
          data-testid="editor-props"
          aria-label={t('editor.properties')}
          title={t('editor.properties')}
          onClick={() => setShowProps(true)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 12 12"
            shape-rendering="crispEdges"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M0 1h12v2H0zM0 5h12v2H0zM0 9h12v2H0zM3 0h2v4H3zM7 4h2v4H7zM2 8h2v4H2z"
            />
          </svg>
        </button>
        <button
          type="button"
          class="control-button narrow test-play"
          data-testid="editor-test"
          aria-label={t('editor.testPlay')}
          title={t('editor.testPlay')}
          disabled={!view.status.playable}
          onClick={() => actions.testPlay()}
        >
          <PlayIcon />
        </button>
        <div class="editor-status" data-testid="editor-status" data-playable={st.playable}>
          <span>{format(t('editor.ops'), { ops: st.opCount, max: 1024 })}</span>
          <span>
            {format(t('editor.codeSize'), { kb: kb(st.codeBytes), max: kb(st.codeLimit) })}
          </span>
          <span
            class={st.playable ? 'hud-good' : 'hud-warn'}
            title={st.errors.map((e) => e.message).join('\n')}
          >
            {st.playable ? t('editor.ok') : format(t('editor.problems'), { n: st.errors.length })}
          </span>
        </div>
      </div>
      <div class="hud-bottom editor-bottom" ref={bottom}>
        <div class="floating-row">{floating}</div>
        <ToolOptions view={view} actions={actions} />
        <div class="editor-tools" role="toolbar">
          {TOOLS.map((kind) => (
            <button
              type="button"
              key={kind}
              class={`skill-button ${view.tool.kind === kind ? 'selected' : ''}`}
              data-testid={`editor-tool-${kind}`}
              aria-pressed={view.tool.kind === kind}
              aria-label={t(`editor.tool.${kind}`)}
              title={t(`editor.tool.${kind}`)}
              onClick={() => actions.setTool(defaultTool(kind, view.tool, view.stamps))}
            >
              <ToolIcon kind={kind} />
            </button>
          ))}
        </div>
      </div>
      {showProps && (
        <PropertySheet view={view} actions={actions} onClose={() => setShowProps(false)} />
      )}
    </>
  );
}
