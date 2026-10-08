import { useState } from 'preact/hooks';
import { useEscape } from './useEscape';
import type { GameActions } from '../app/gameApp';
import { DEFAULT_SPEEDS, type Settings, TOUCH_RADII } from '../app/save';
import { t } from '../i18n';

/**
 * Settings (§1.10, T6.2): volumes, haptics, default speed, auto-pause, touch radius,
 * left-handed layout, high contrast, reduced motion, larger text, language, restart the
 * tutorial and restore purchases. Every change is saved and applied at once.
 */

type Actions = Pick<GameActions, 'updateSettings' | 'restartTutorial' | 'restorePurchases'>;

function Toggle({
  id,
  label,
  on,
  onChange,
}: {
  id: string;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      class={`setting-toggle ${on ? 'on' : ''}`}
      data-testid={`setting-${id}`}
      aria-checked={on}
      onClick={() => onChange(!on)}
    >
      <span>{label}</span>
      <span class="toggle-knob" aria-hidden="true">
        {on ? t('settings.on') : t('settings.off')}
      </span>
    </button>
  );
}

function Choice<T extends string | number | boolean | null>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="setting-row" role="radiogroup" aria-label={label} data-testid={`setting-${id}`}>
      <span class="setting-label">{label}</span>
      <span class="segmented">
        {options.map((o) => (
          <button
            type="button"
            key={String(o.value)}
            role="radio"
            aria-checked={o.value === value}
            class={o.value === value ? 'selected' : ''}
            data-value={String(o.value)}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}

function Volume({
  id,
  label,
  value,
  onChange,
}: {
  id: 'master' | 'sfx' | 'music';
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label class="setting-row">
      <span class="setting-label">{label}</span>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={Math.round(value * 100)}
        data-testid={`setting-${id}`}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value) / 100)}
      />
    </label>
  );
}

export function SettingsPanel({
  settings: s,
  actions,
  onClose,
}: {
  settings: Settings;
  actions: Actions;
  onClose: () => void;
}) {
  useEscape(onClose);
  const [note, setNote] = useState('');
  const set = (patch: Partial<Settings>): void => actions.updateSettings(patch);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        class="sheet settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings-panel"
      >
        <h2 id="settings-title">{t('settings.title')}</h2>
        <h3>{t('settings.sound')}</h3>
        <Volume
          id="master"
          label={t('settings.master')}
          value={s.master}
          onChange={(v) => set({ master: v })}
        />
        <Volume
          id="sfx"
          label={t('settings.sfx')}
          value={s.sfx}
          onChange={(v) => set({ sfx: v })}
        />
        <Volume
          id="music"
          label={t('settings.music')}
          value={s.music}
          onChange={(v) => set({ music: v })}
        />
        <Toggle
          id="haptics"
          label={t('settings.haptics')}
          on={s.haptics}
          onChange={(v) => set({ haptics: v })}
        />

        <h3>{t('settings.play')}</h3>
        <Choice
          id="speed"
          label={t('settings.speed')}
          value={s.speed}
          options={DEFAULT_SPEEDS.map((v) => ({ value: v, label: `${v}×` }))}
          onChange={(v) => set({ speed: v })}
        />
        <Toggle
          id="autoPause"
          label={t('settings.autoPause')}
          on={s.autoPause}
          onChange={(v) => set({ autoPause: v })}
        />
        <Choice
          id="touchRadius"
          label={t('settings.touchRadius')}
          value={s.touchRadius}
          options={TOUCH_RADII.map((v) => ({ value: v, label: t(`settings.radius${v}`) }))}
          onChange={(v) => set({ touchRadius: v })}
        />

        <h3>{t('settings.access')}</h3>
        <Toggle
          id="leftHanded"
          label={t('settings.leftHanded')}
          on={s.leftHanded}
          onChange={(v) => set({ leftHanded: v })}
        />
        <Toggle
          id="highContrast"
          label={t('settings.highContrast')}
          on={s.highContrast}
          onChange={(v) => set({ highContrast: v })}
        />
        <Choice
          id="reducedMotion"
          label={t('settings.reducedMotion')}
          value={s.reducedMotion}
          options={[
            { value: null, label: t('settings.system') },
            { value: true, label: t('settings.on') },
            { value: false, label: t('settings.off') },
          ]}
          onChange={(v) => set({ reducedMotion: v })}
        />
        <Toggle
          id="largeText"
          label={t('settings.largeText')}
          on={s.largeText}
          onChange={(v) => set({ largeText: v })}
        />
        <Choice
          id="language"
          label={t('settings.language')}
          value={s.language}
          options={[
            { value: null, label: t('settings.system') },
            { value: 'en', label: 'English' },
            { value: 'hu', label: 'Magyar' },
          ]}
          onChange={(v) => set({ language: v })}
        />

        <h3>{t('settings.more')}</h3>
        <button
          type="button"
          class="text-button"
          data-testid="restart-tutorial"
          onClick={() => {
            actions.restartTutorial();
            setNote(t('settings.tutorialRestarted'));
          }}
        >
          {t('settings.restartTutorial')}
        </button>
        <button
          type="button"
          class="text-button"
          data-testid="restore-purchases"
          onClick={() =>
            void actions
              .restorePurchases()
              .then((r) =>
                setNote(
                  t(
                    r === 'restored'
                      ? 'settings.restored'
                      : r === 'none'
                        ? 'settings.nothingToRestore'
                        : 'settings.restoreFailed',
                  ),
                ),
              )
          }
        >
          {t('settings.restore')}
        </button>
        {note && (
          <p class="editor-hint" role="status" data-testid="settings-note">
            {note}
          </p>
        )}
        <button
          type="button"
          class="text-button primary sheet-done"
          data-testid="settings-close"
          onClick={onClose}
        >
          {t('props.done')}
        </button>
      </div>
    </div>
  );
}
