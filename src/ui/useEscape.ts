import { useEffect, useRef } from 'preact/hooks';
import { getLifecycle } from '../platform/lifecycle';

/**
 * Closes a dialog with the back action: Escape on the web, the Android back button / gesture
 * natively (T6.4, T7.1). The dialog's handler sits on top of the game's while it is open.
 */
export function useEscape(onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(
    () =>
      getLifecycle().onBack(() => {
        close.current();
        return true;
      }),
    [],
  );
}
