export class StageTimer {
  readonly #starts = new Map<string, number>();
  constructor(private readonly now: () => number = Date.now) {}
  start(stage: string) {
    this.#starts.set(stage, this.now());
  }
  finish(stage: string) {
    const end = this.now(), start = this.#starts.get(stage) ?? end;
    this.#starts.delete(stage);
    return Math.max(0, end - start);
  }
}
