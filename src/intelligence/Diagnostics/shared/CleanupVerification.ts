import {
  type IntelligenceRuleCode,
  intelligenceRuleCodes,
} from "../TraceCodes";
export interface CleanupVerification {
  success: boolean;
  ruleCode?: IntelligenceRuleCode;
}
export function verifyCleanup(
  input: {
    requestedCount: number;
    acknowledgedCount: number | null;
    deleteError: boolean;
    verificationError: boolean;
    remainingCount: number | null;
  },
): CleanupVerification {
  if (input.deleteError) {
    return {
      success: false,
      ruleCode: intelligenceRuleCodes.cleanupDeleteFailed,
    };
  }
  if (input.acknowledgedCount !== input.requestedCount) {
    return {
      success: false,
      ruleCode: intelligenceRuleCodes.cleanupAcknowledgementMismatch,
    };
  }
  if (input.verificationError || input.remainingCount !== 0) {
    return {
      success: false,
      ruleCode: intelligenceRuleCodes.cleanupVerificationFailed,
    };
  }
  return { success: true };
}
