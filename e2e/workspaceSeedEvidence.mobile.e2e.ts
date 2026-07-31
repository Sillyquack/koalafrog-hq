import { expect, test } from "@playwright/test";
import { createIngredient, signIn } from "./ingredientKnowledge.helpers";

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

test("canonical Supplier selection and receipt remain usable at 390 by 844", async ({
  page,
}) => {
  await signIn(page);
  const stamp = Date.now();
  const supplierName = `Mobile canonical Supplier ${stamp}`;
  await page.goto("/suppliers");
  await page.getByRole("button", { name: "New supplier" }).click();
  await page.locator("form.supplier-create").getByLabel("Legal name").fill(supplierName);
  await page.getByRole("button", { name: "Create supplier" }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(supplierName) }),
  ).toHaveAttribute("aria-pressed", "true");
  const supplierId = new URL(page.url()).searchParams.get("supplier");
  expect(supplierId).toBeTruthy();

  const ingredientId = await createIngredient(
    page,
    `Mobile canonical ingredient ${stamp}`,
    `MOBILE CANONICAL INCI ${stamp}`,
  );
  await page.goto(`/ingredients/${ingredientId}`);
  await page.getByRole("button", { name: "Add supplier product" }).click();
  const form = page.locator("form.supplier-product-form");
  await expect(form).toBeVisible();
  expect(
    await form.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
  const canonicalSupplier = form.getByLabel("Canonical supplier");
  await expect(
    canonicalSupplier.locator(`option[value="${supplierId!}"]`),
  ).toHaveCount(1);
  await canonicalSupplier.selectOption(supplierId!);
  await form
    .getByLabel("Product name")
    .fill(`Mobile canonical candidate ${stamp}`);
  await form.getByRole("button", { name: "Save Supplier Product" }).click();
  const receipt = page.getByTestId("operation-receipt");
  await expect(receipt.getByText("CREATE confirmed")).toBeVisible();
  await expect(
    receipt.getByText(`supplier id: ${supplierId!}`, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: `Mobile canonical candidate ${stamp}` }),
  ).toBeVisible();
});
