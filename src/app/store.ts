/**
 * Minimal observable value for game → UI state (HUD numbers, end screen). `set` only notifies
 * when the value actually changed (structural comparison of plain data), so publishing every
 * frame is cheap for the UI.
 */
export class Store<T> {
  private value: T;
  private key: string;
  private readonly listeners = new Set<(v: T) => void>();

  constructor(initial: T) {
    this.value = initial;
    this.key = JSON.stringify(initial);
  }

  get(): T {
    return this.value;
  }

  set(next: T): void {
    const key = JSON.stringify(next);
    if (key === this.key) return;
    this.key = key;
    this.value = next;
    for (const l of this.listeners) l(next);
  }

  subscribe(listener: (v: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
