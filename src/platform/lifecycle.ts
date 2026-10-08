/**
 * App lifecycle behind the platform layer (T7.1): going to the background / coming back, and
 * the "back" action (Android back button / gesture natively, the Escape key on the web).
 * Back handlers form a stack: the newest one (an open dialog) is asked first; a handler returns
 * true when it consumed the action. When nobody does, the native app exits (Android convention).
 */
export type BackHandler = () => boolean;

export interface Lifecycle {
  onPause(listener: () => void): () => void;
  onResume(listener: () => void): () => void;
  /** Registers a back handler on top of the stack; returns its removal. */
  onBack(handler: BackHandler): () => void;
  /** Runs the back action (also used by tests); true when a handler consumed it. */
  back(): boolean;
}

export interface LifecycleCore extends Lifecycle {
  emitPause(): void;
  emitResume(): void;
}

/** The shared listener bookkeeping; `exit` runs when no back handler consumed the action. */
export function createLifecycleCore(exit: () => void = () => undefined): LifecycleCore {
  const pause = new Set<() => void>();
  const resume = new Set<() => void>();
  const stack: { handler: BackHandler }[] = [];
  const add = (set: Set<() => void>, l: () => void): (() => void) => {
    const entry = (): void => l();
    set.add(entry);
    return () => set.delete(entry);
  };
  return {
    onPause: (l) => add(pause, l),
    onResume: (l) => add(resume, l),
    onBack(handler) {
      const entry = { handler };
      stack.push(entry);
      return () => {
        const i = stack.indexOf(entry);
        if (i >= 0) stack.splice(i, 1);
      };
    },
    back() {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]?.handler()) return true;
      }
      exit();
      return false;
    },
    emitPause: () => {
      for (const l of [...pause]) l();
    },
    emitResume: () => {
      for (const l of [...resume]) l();
    },
  };
}

/** Web: tab hidden / shown, Escape = back (never "exits"). */
export function createWebLifecycle(doc: Document | undefined = globalThis.document): Lifecycle {
  const core = createLifecycleCore();
  doc?.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') core.emitPause();
    else core.emitResume();
  });
  doc?.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat) return;
    if (core.back()) e.preventDefault();
  });
  return core;
}

let current: Lifecycle | null = null;

export function getLifecycle(): Lifecycle {
  current ??= createWebLifecycle();
  return current;
}

/** The native shell installs its implementation here (`platform/native.ts`). */
export function setLifecycle(l: Lifecycle): void {
  current = l;
}
