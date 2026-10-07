import { useState } from 'preact/hooks';
import type { EditorView } from '../app/editorScreen';
import type { CodeLoadResult, EditorActions } from '../app/gameApp';
import type { ThemeId } from '../core/level';
import { LEVEL_SIZE_PRESETS, SKILLS, THEMES, TICKS_PER_SECOND } from '../core/level';
import type { LevelProps } from '../editor/doc';
import { format, t } from '../i18n';
import { getClipboard } from '../platform/clipboard';
import { SkillIcon } from './icons';

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  testId,
  render,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  testId: string;
  render?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div class="stepper" data-testid={testId}>
      <span class="stepper-label">{label}</span>
      <button
        type="button"
        class="option"
        aria-label={`${label} −`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        −
      </button>
      <span class="stepper-value" data-testid={`${testId}-value`}>
        {render ? render(value) : value}
      </span>
      <button
        type="button"
        class="option"
        aria-label={`${label} +`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        +
      </button>
    </div>
  );
}

const clock = (ticks: number): string => {
  const s = Math.round(ticks / TICKS_PER_SECOND);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** §1.8 properties: size, world, counts, skills, time, release, title, author, hints. */
export function PropertySheet({
  view,
  actions,
  onClose,
}: {
  view: EditorView;
  actions: EditorActions;
  onClose: () => void;
}) {
  const p = view.props;
  const set = (patch: Partial<LevelProps>): void => actions.setProps(patch);
  return (
    <div class="sheet-backdrop">
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('editor.properties')}
        data-testid="properties"
      >
        <h2>{t('editor.properties')}</h2>
        <label class="field">
          <span>{t('props.title')}</span>
          <input
            type="text"
            maxLength={32}
            value={p.title}
            data-testid="prop-title"
            onChange={(e) => set({ title: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label class="field">
          <span>{t('props.author')}</span>
          <input
            type="text"
            maxLength={24}
            value={p.author}
            data-testid="prop-author"
            onChange={(e) => set({ author: (e.target as HTMLInputElement).value })}
          />
        </label>
        <div class="field">
          <span>{t('props.theme')}</span>
          <div class="editor-row wrap">
            {THEMES.map((theme: ThemeId) => (
              <button
                type="button"
                key={theme}
                class={`option wide ${p.theme === theme ? 'selected' : ''}`}
                data-testid={`prop-theme-${theme}`}
                onClick={() => set({ theme })}
              >
                {t(`theme.${theme}`)}
              </button>
            ))}
          </div>
        </div>
        <div class="field">
          <span>{t('props.size')}</span>
          <div class="editor-row wrap">
            {LEVEL_SIZE_PRESETS.map((s, i) => (
              <button
                type="button"
                key={i}
                class={`option wide ${p.sizePreset === i ? 'selected' : ''}`}
                data-testid={`prop-size-${i}`}
                onClick={() => set({ sizePreset: i })}
              >
                {s.w}×{s.h}
              </button>
            ))}
          </div>
        </div>
        <Stepper
          label={t('props.creatures')}
          testId="prop-creatures"
          value={p.creatures}
          min={1}
          max={100}
          onChange={(v) => set({ creatures: v })}
        />
        <Stepper
          label={t('props.required')}
          testId="prop-required"
          value={p.required}
          min={1}
          max={p.creatures}
          onChange={(v) => set({ required: v, master: Math.max(v, p.master) })}
        />
        <Stepper
          label={t('props.master')}
          testId="prop-master"
          value={p.master}
          min={p.required}
          max={p.creatures}
          onChange={(v) => set({ master: v })}
        />
        <Stepper
          label={t('props.frugal')}
          testId="prop-frugal"
          value={p.frugal}
          min={0}
          max={99}
          onChange={(v) => set({ frugal: v })}
        />
        <Stepper
          label={t('props.time')}
          testId="prop-time"
          value={p.timeLimitTicks}
          min={2 * 60 * TICKS_PER_SECOND}
          max={(9 * 60 + 59) * TICKS_PER_SECOND}
          step={15 * TICKS_PER_SECOND}
          render={clock}
          onChange={(v) => set({ timeLimitTicks: v })}
        />
        <Stepper
          label={t('props.release')}
          testId="prop-release"
          value={p.minReleaseTicks}
          min={4}
          max={240}
          step={4}
          onChange={(v) => set({ minReleaseTicks: v })}
        />
        <div class="field">
          <span>{t('props.skills')}</span>
          {SKILLS.map((skill) => (
            <div class="stepper" key={skill} data-testid={`prop-skill-${skill}`}>
              <span class="stepper-label">
                <SkillIcon skill={skill} size={18} /> {t(`skill.${skill}`)}
              </span>
              <button
                type="button"
                class="option"
                aria-label={`${t(`skill.${skill}`)} −`}
                disabled={p.skills[skill] <= 0}
                onClick={() => set({ skills: { ...p.skills, [skill]: p.skills[skill] - 1 } })}
              >
                −
              </button>
              <span class="stepper-value">{p.skills[skill]}</span>
              <button
                type="button"
                class="option"
                aria-label={`${t(`skill.${skill}`)} +`}
                disabled={p.skills[skill] >= 99}
                onClick={() => set({ skills: { ...p.skills, [skill]: p.skills[skill] + 1 } })}
              >
                +
              </button>
            </div>
          ))}
        </div>
        {[0, 1].map((i) => (
          <label class="field" key={i}>
            <span>{t(i === 0 ? 'props.hint1' : 'props.hint2')}</span>
            <input
              type="text"
              maxLength={160}
              value={p.hints[i] ?? ''}
              data-testid={`prop-hint-${i}`}
              onChange={(e) => {
                const hints = [p.hints[0] ?? '', p.hints[1] ?? ''];
                hints[i] = (e.target as HTMLInputElement).value;
                set({ hints });
              }}
            />
          </label>
        ))}
        <button
          type="button"
          class="text-button primary sheet-done"
          data-testid="prop-done"
          onClick={onClose}
        >
          {t('props.done')}
        </button>
      </div>
    </div>
  );
}

/** After a won test play: the code to share, with a copy button. */
export function PublishPanel({ code, onClose }: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div class="sheet-backdrop">
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('publish.title')}
        data-testid="publish"
      >
        <h2>{t('publish.title')}</h2>
        <textarea class="code-box" readOnly value={code} data-testid="publish-code" rows={5} />
        <p class="editor-hint">{t('publish.hint')}</p>
        <div class="end-buttons">
          <button
            type="button"
            class="text-button primary"
            data-testid="publish-copy"
            onClick={() => {
              void getClipboard()
                .write(code)
                .then((ok) => setCopied(ok));
            }}
          >
            {copied ? t('publish.copied') : t('publish.copy')}
          </button>
          <button type="button" class="text-button" data-testid="publish-close" onClick={onClose}>
            {t('code.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function codeError(r: Extract<CodeLoadResult, { ok: false }>): string {
  if (r.error === 'newerVersion') return t('code.errorNewer');
  if (r.error === 'checksum' || r.error === 'corrupt' || r.error === 'encoding') {
    return t('code.errorDamaged');
  }
  return t('code.error');
}

/** "Play a code": paste (or type) a level code, see whether it is verified, play it. */
export function CodePanel({
  actions,
  onClose,
}: {
  actions: Pick<EditorActions, 'loadCode' | 'playLoaded'>;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<CodeLoadResult | null>(null);
  const load = (value: string): void => setResult(actions.loadCode(value));
  return (
    <div class="sheet-backdrop">
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('title.code')}
        data-testid="code-panel"
      >
        <h2>{t('title.code')}</h2>
        <textarea
          class="code-box"
          rows={5}
          placeholder={t('code.placeholder')}
          value={text}
          data-testid="code-input"
          onInput={(e) => {
            const v = (e.target as HTMLTextAreaElement).value;
            setText(v);
            setResult(null);
          }}
        />
        <div class="end-buttons">
          <button
            type="button"
            class="text-button"
            data-testid="code-paste"
            onClick={() => {
              void getClipboard()
                .read()
                .then((v) => {
                  if (v) {
                    setText(v);
                    load(v);
                  }
                });
            }}
          >
            {t('code.paste')}
          </button>
          <button
            type="button"
            class="text-button primary"
            data-testid="code-load"
            disabled={text.trim().length === 0}
            onClick={() => load(text)}
          >
            {t('code.load')}
          </button>
        </div>
        {result && !result.ok && (
          <p class="code-error" data-testid="code-error" role="alert">
            {codeError(result)}
          </p>
        )}
        {result?.ok && (
          <div class="code-result" data-testid="code-result" data-verified={result.verified}>
            <strong>{result.title}</strong>
            {result.author && <span> {format(t('code.by'), { author: result.author })}</span>}
            <p class={result.verified ? 'hud-good' : 'hud-warn'}>
              {result.verified ? t('code.verified') : t('code.unverified')}
            </p>
            <button
              type="button"
              class="text-button primary"
              data-testid="code-play"
              onClick={() => actions.playLoaded()}
            >
              {t('code.play')}
            </button>
          </div>
        )}
        <button
          type="button"
          class="text-button sheet-done"
          data-testid="code-close"
          onClick={onClose}
        >
          {t('code.close')}
        </button>
      </div>
    </div>
  );
}
