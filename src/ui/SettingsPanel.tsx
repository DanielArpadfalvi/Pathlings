import { useState } from 'preact/hooks';
import type { SettingsActions } from '../app/gameApp';
import { type Settings, TOUCH_RADII } from '../app/settings';
import type { PurchaseView } from '../app/gameApp';
import type { PurchaseOutcome } from '../platform/purchases';
import { type TranslationKey, t } from '../i18n';

function Toggle({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label class="setting-row">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        class="switch"
        data-testid={`set-${id}`}
        checked={value}
        onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
      />
    </label>
  );
}

function Choice<T extends string | number>({
  id,
  label,
  value,
  options,
  render,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  render: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <div class="setting-row" role="radiogroup" aria-label={label} data-testid={`set-${id}`}>
      <span>{label}</span>
      <span class="segmented">
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={o === value}
            class={`option ${o === value ? 'selected' : ''}`}
            data-testid={`set-${id}-${o}`}
            onClick={() => onChange(o)}
          >
            {render(o)}
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
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label class="setting-row">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        data-testid={`set-${id}`}
        aria-valuetext={`${Math.round(value * 100)}%`}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value) / 100)}
      />
    </label>
  );
}

/** Settings (§1.10, T6.2): every change is saved at once and takes effect immediately. */
export function SettingsPanel({
  settings: s,
  purchase,
  actions,
  onClose,
}: {
  settings: Settings;
  purchase: PurchaseView;
  actions: SettingsActions & { buy(id: 'supporter'): Promise<PurchaseOutcome> };
  onClose: () => void;
}) {
  const [support, setSupport] = useState<PurchaseOutcome | 'busy' | null>(null);
  const [tutorialReset, setTutorialReset] = useState(false);
  const [restore, setRestore] = useState<'idle' | 'busy' | 'owned' | 'none'>('idle');
  const set = (patch: Partial<Settings>): void => actions.setSettings(patch);
  const audio = (k: keyof Settings['audio'], v: number): void =>
    set({ audio: { ...s.audio, [k]: v } });
  return (
    <div class="sheet-backdrop">
      <div
        class="sheet settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
        data-testid="settings"
      >
        <h2>{t('settings.title')}</h2>
        <h3>{t('settings.sound')}</h3>
        <Volume
          id="master"
          label={t('settings.master')}
          value={s.audio.master}
          onChange={(v) => audio('master', v)}
        />
        <Volume
          id="sfx"
          label={t('settings.sfx')}
          value={s.audio.sfx}
          onChange={(v) => audio('sfx', v)}
        />
        <Volume
          id="music"
          label={t('settings.music')}
          value={s.audio.music}
          onChange={(v) => audio('music', v)}
        />
        <Toggle
          id="haptics"
          label={t('settings.haptics')}
          value={s.haptics}
          onChange={(v) => set({ haptics: v })}
        />

        <h3>{t('settings.play')}</h3>
        <Choice
          id="speed"
          label={t('settings.defaultSpeed')}
          value={s.defaultSpeed}
          options={[1, 2] as const}
          render={(v) => `${v}×`}
          onChange={(v) => set({ defaultSpeed: v })}
        />
        <Toggle
          id="autopause"
          label={t('settings.autoPause')}
          value={s.autoPause}
          onChange={(v) => set({ autoPause: v })}
        />
        <Choice
          id="radius"
          label={t('settings.touchRadius')}
          value={s.touchRadius}
          options={TOUCH_RADII}
          render={(v) => t(`settings.radius.${v}` as TranslationKey)}
          onChange={(v) => set({ touchRadius: v })}
        />

        <h3>{t('settings.access')}</h3>
        <Toggle
          id="lefthanded"
          label={t('settings.leftHanded')}
          value={s.leftHanded}
          onChange={(v) => set({ leftHanded: v })}
        />
        <Toggle
          id="contrast"
          label={t('settings.highContrast')}
          value={s.highContrast}
          onChange={(v) => set({ highContrast: v })}
        />
        <Choice
          id="motion"
          label={t('settings.reducedMotion')}
          value={s.reducedMotion}
          options={['system', 'on', 'off'] as const}
          render={(v) => t(`settings.motion.${v}` as TranslationKey)}
          onChange={(v) => set({ reducedMotion: v })}
        />
        <Toggle
          id="largetext"
          label={t('settings.largeText')}
          value={s.largeText}
          onChange={(v) => set({ largeText: v })}
        />
        <Choice
          id="language"
          label={t('settings.language')}
          value={s.language}
          options={['auto', 'en', 'hu'] as const}
          render={(v) => t(`settings.lang.${v}` as TranslationKey)}
          onChange={(v) => set({ language: v })}
        />

        <h3>{t('supporter.title')}</h3>
        <p class="editor-hint">{t('supporter.text')}</p>
        {purchase.supporter ? (
          <p data-testid="supporter-owned">{t('supporter.thanks')}</p>
        ) : purchase.available ? (
          <button
            type="button"
            class="text-button"
            data-testid="buy-supporter"
            disabled={support === 'busy'}
            onClick={() => {
              setSupport('busy');
              void actions.buy('supporter').then(setSupport);
            }}
          >
            {t('supporter.buy', { price: purchase.supporterPrice })}
          </button>
        ) : (
          <p class="editor-hint">{t('offer.appOnly')}</p>
        )}
        {support === 'cancelled' || support === 'failed' || support === 'offline' ? (
          <p class="editor-hint" role="status">
            {t(`offer.${support}`)}
          </p>
        ) : null}

        <div class="end-buttons">
          <button
            type="button"
            class="text-button"
            data-testid="restart-tutorial"
            onClick={() => {
              actions.restartTutorial();
              setTutorialReset(true);
            }}
          >
            {tutorialReset ? t('settings.tutorialRestarted') : t('settings.restartTutorial')}
          </button>
          <button
            type="button"
            class="text-button"
            data-testid="restore-purchases"
            disabled={restore === 'busy'}
            onClick={() => {
              setRestore('busy');
              void actions.restorePurchases().then((owned) => setRestore(owned ? 'owned' : 'none'));
            }}
          >
            {restore === 'owned'
              ? t('settings.restored')
              : restore === 'none'
                ? t('settings.nothingToRestore')
                : t('settings.restore')}
          </button>
        </div>
        <div class="end-buttons">
          <button
            type="button"
            class="text-button primary"
            data-testid="settings-close"
            onClick={onClose}
          >
            {t('code.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
