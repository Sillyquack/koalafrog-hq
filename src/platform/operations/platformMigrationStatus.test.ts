import { describe, expect, it } from "vitest";
import { comparePlatformMigrationStatus } from "./platformMigrationStatus";

describe("platform migration compatibility", () => {
  it("matches the reconciled production identity to generated repository evidence", () => {
    expect(
      comparePlatformMigrationStatus({
        migrationCount: 99,
        currentMigrationVersion: "20260816044645",
        evaluatedAt: "2026-09-22T04:42:59.668966+00:00",
      }),
    ).toMatchObject({
      state: "match",
      expected: {
        migrationCount: 99,
        currentMigrationVersion: "20260816044645",
      },
    });
  });

  it.each([
    { migrationCount: 99, currentMigrationVersion: "20260816044500" },
    { migrationCount: 98, currentMigrationVersion: "20260816044645" },
  ])("fails closed for an unreconciled head or different count: %j", (actual) => {
    expect(
      comparePlatformMigrationStatus({
        ...actual,
        evaluatedAt: "2026-09-22T04:42:59.668966+00:00",
      }).state,
    ).toBe("mismatch");
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
