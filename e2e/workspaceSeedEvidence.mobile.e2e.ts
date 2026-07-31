import { expect, test } from "@playwright/test";
import { signIn } from "./ingredientKnowledge.helpers";

test("seed evidence diagnostics remain usable at 390 by 844", async ({ page }) => {
  await signIn(page);
  await page.goto("/platform");
  await expect(
    page.locator(".migration-status-card").getByRole("heading", { name: "Match" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview JSON" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Operation evidence preview",
  });
  await expect(dialog).toBeVisible();
  const overflow = await dialog.evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(dialog.getByText("Stable internal record IDs are included.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
