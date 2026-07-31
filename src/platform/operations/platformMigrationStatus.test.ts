import { describe, expect, it } from "vitest";
import { comparePlatformMigrationStatus } from "./platformMigrationStatus";

describe("platform migration compatibility", () => {
  it("matches actual local state to generated repository evidence", () => {
    expect(
      comparePlatformMigrationStatus({
        migrationCount: 90,
        currentMigrationVersion: "20260731044225",
        evaluatedAt: "2026-07-31T05:00:00.000Z",
      }).state,
    ).toBe("match");
  });

  it("fails closed for mismatch and unavailable status", () => {
    expect(
      comparePlatformMigrationStatus({
        migrationCount: 89,
        currentMigrationVersion: "20260730154408",
        evaluatedAt: "2026-07-31T05:00:00.000Z",
      }).state,
    ).toBe("mismatch");
    expect(comparePlatformMigrationStatus(null).state).toBe("unknown");
  });
});
