import { describe, expect, it } from "vitest";
import { comparePlatformMigrationStatus } from "./platformMigrationStatus";

describe("platform migration compatibility", () => {
  it("matches the new repository identity only after all migrations are applied", () => {
    expect(
      comparePlatformMigrationStatus({
        migrationCount: 100,
        currentMigrationVersion: "20260922072519",
        evaluatedAt: "2026-09-22T04:42:59.668966+00:00",
      }),
    ).toMatchObject({
      state: "match",
      expected: {
        migrationCount: 100,
        currentMigrationVersion: "20260922072519",
      },
    });
  });

  it.each([
    // Current production identity remains blocked until separately authorized migration.
    { migrationCount: 99, currentMigrationVersion: "20260816044645" },
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
