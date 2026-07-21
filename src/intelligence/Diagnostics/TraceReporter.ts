import { safeTraceEvent } from "./SafeDiagnostics.ts";
import type { IntelligenceTraceEvent } from "./TraceTypes.ts";
export interface TraceSink {
  write(event: IntelligenceTraceEvent): void;
}
export const consoleTraceSink: TraceSink = {
  write(event) {
    console.info(
      JSON.stringify({
        event: "koalafrog_intelligence_trace",
        ...safeTraceEvent(event),
      }),
    );
  },
};
export class TraceReporter {
  constructor(private readonly sink: TraceSink = consoleTraceSink) {}
  report(event: IntelligenceTraceEvent) {
    this.sink.write(safeTraceEvent(event));
  }
}
