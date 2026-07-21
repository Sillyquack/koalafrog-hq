import { safeTraceEvent } from "./SafeDiagnostics.ts";
import type { IntelligenceTrace, IntelligenceTraceEvent } from "./TraceTypes.ts";
export class IntelligenceTraceBuilder {
  readonly #events: IntelligenceTraceEvent[] = [];
  readonly #started = new Map<IntelligenceTraceEvent["stage"], number>();
  constructor(
    readonly supportId: string,
    readonly analysisId: string,
    readonly now: () => number = Date.now,
  ) {}
  start(
    stage: IntelligenceTraceEvent["stage"],
    metadata: Pick<IntelligenceTraceEvent, "provider" | "model"> = {},
  ): IntelligenceTraceEvent {
    const at = this.now();
    this.#started.set(stage, at);
    return this.add({
      stage,
      result: "started",
      elapsedMs: 0,
      timestamp: new Date(at).toISOString(),
      ...metadata,
    });
  }
  finish(
    stage: IntelligenceTraceEvent["stage"],
    result: Exclude<IntelligenceTraceEvent["result"], "started">,
    metadata: Partial<
      Omit<
        IntelligenceTraceEvent,
        | "stage"
        | "result"
        | "elapsedMs"
        | "timestamp"
        | "supportId"
        | "analysisId"
      >
    > = {},
  ): IntelligenceTraceEvent {
    const at = this.now(), started = this.#started.get(stage) ?? at;
    this.#started.delete(stage);
    return this.add({
      stage,
      result,
      elapsedMs: at - started,
      timestamp: new Date(at).toISOString(),
      ...metadata,
    });
  }
  add(
    event: Omit<IntelligenceTraceEvent, "supportId" | "analysisId">,
  ): IntelligenceTraceEvent {
    const safe = safeTraceEvent({
      ...event,
      supportId: this.supportId,
      analysisId: this.analysisId,
    });
    this.#events.push(safe);
    return safe;
  }
  snapshot(): IntelligenceTrace {
    return {
      supportId: this.supportId,
      analysisId: this.analysisId,
      events: [...this.#events],
    };
  }
}
