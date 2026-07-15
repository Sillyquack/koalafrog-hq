import type {
  ContextManifest,
  IntelligenceResponse,
} from "./intelligenceContract";
export interface IntelligenceModelProvider {
  analyze(input: {
    prompt: string;
    contextManifest: ContextManifest;
    previousResponses: IntelligenceResponse[];
  }): Promise<unknown>;
}
export class DeterministicTestIntelligenceProvider implements IntelligenceModelProvider {
  constructor(private fixture: IntelligenceResponse) {}
  analyze() {
    return Promise.resolve(structuredClone(this.fixture));
  }
}
