import type { IntelligenceRuleCode } from "./TraceCodes.ts";
import { intelligenceRuleCodes } from "./TraceCodes.ts";
import type {
  IntelligenceStage,
  SafeExpected,
  SafeReceived,
} from "./TraceTypes.ts";
export interface ValidationFailure {
  success: false;
  ruleCode: IntelligenceRuleCode;
  jsonPath: string;
  expected: SafeExpected;
  received: SafeReceived;
  validator: string;
  stage: IntelligenceStage;
}
export type ValidationTrace<T = unknown> =
  | { success: true; value: T }
  | ValidationFailure;
export const validationSuccess = <T>(value: T): ValidationTrace<T> => ({
  success: true,
  value,
});
export const validationFailure = (
  failure: Omit<ValidationFailure, "success">,
): ValidationFailure => ({ success: false, ...failure });
export function executeValidation<T>(
  stage: IntelligenceStage,
  validator: string,
  operation: () => ValidationTrace<T>,
): ValidationTrace<T> {
  try {
    return operation();
  } catch {
    return validationFailure({
      ruleCode: intelligenceRuleCodes.unexpectedValidatorException,
      jsonPath: "$",
      expected: "object",
      received: "unknown",
      validator,
      stage,
    });
  }
}
