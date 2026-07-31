import { expect, test, type Locator } from "@playwright/test";
import { createIngredient, signIn } from "./ingredientKnowledge.helpers";

const receiptId = async (receipt: Locator) =>
  receipt.locator("dd").first().innerText();

test("owner receives stable evidence for all five Seed V2 create domains", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  const stamp = Date.now();

  const ingredientId = await createIngredient(
    page,
    `Evidence ingredient ${stamp}`,
    `EVIDENCE INCI ${stamp}`,
  );
  await page.goto(`/ingredients/${ingredientId}`);
  await page.getByRole("button", { name: "Add supplier product" }).click();
  await page.getByLabel("Supplier", { exact: true }).fill("Evidence Supplier");
  await page
    .getByLabel("Product name")
    .fill(`Evidence candidate product ${stamp}`);
  await page.getByRole("button", { name: "Save Supplier Product" }).click();
  const supplierReceipt = page.getByTestId("operation-receipt");
  await expect(supplierReceipt.getByText("CREATE confirmed")).toBeVisible();
  const supplierProductId = await receiptId(supplierReceipt);
  await page.reload();
  await expect(
    page.getByText(`Evidence candidate product ${stamp}`),
  ).toBeVisible();
  await expect(page.getByTestId("operation-receipt")).toHaveCount(0);

  await page.goto("/equipment");
  await page.getByRole("button", { name: "Add Equipment" }).click();
  await page.getByLabel("Name", { exact: true }).fill(`Evidence scale ${stamp}`);
  await page.getByLabel("Ownership state").selectOption("planned");
  await page.getByRole("button", { name: "Save Equipment" }).click();
  const equipmentReceipt = page.getByTestId("operation-receipt");
  await expect(equipmentReceipt.getByText("CREATE confirmed")).toBeVisible();
  const equipmentId = await receiptId(equipmentReceipt);

  await page.goto("/packaging");
  await page.getByRole("button", { name: "Plan Component" }).click();
  await page
    .getByLabel("Component name")
    .fill(`Evidence bottle ${stamp}`);
  await page.getByLabel("Component type").fill("bottle");
  await page.getByRole("button", { name: "Save planning record" }).click();
  const packagingReceipt = page.getByTestId("operation-receipt");
  await expect(packagingReceipt.getByText("CREATE confirmed")).toBeVisible();
  const packagingId = await receiptId(packagingReceipt);
  await expect(page).toHaveURL(new RegExp(`/packaging/components/${packagingId}$`));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: `Evidence bottle ${stamp}` }),
  ).toBeVisible();

  await page.goto("/procurement");
  await page.getByRole("button", { name: "New request" }).click();
  const requestForm = page.locator("form.procurement-request-form");
  await requestForm
    .getByLabel("Request title")
    .fill(`Evidence request ${stamp}`);
  await requestForm.getByLabel("Category").fill("raw_material");
  await page.getByRole("button", { name: "Save request" }).click();
  const requestReceipt = page.getByTestId("operation-receipt");
  const requestId = await receiptId(requestReceipt);
  await expect(requestReceipt.getByText("CREATE confirmed")).toBeVisible();
  await page
    .getByRole("link", { name: new RegExp(`Evidence request ${stamp}`) })
    .click();
  await page.getByRole("button", { name: "Add requested item" }).click();
  const itemForm = page.locator("form.procurement-detail-form");
  await itemForm.getByLabel("Requirement name").fill(`Evidence item ${stamp}`);
  await itemForm.getByLabel("Category", { exact: true }).fill("carrier_oil");
  await page.getByRole("button", { name: "Save item" }).click();
  const childReceipt = page.getByTestId("operation-receipt");
  await expect(childReceipt.getByText("CREATE confirmed")).toBeVisible();
  await expect(childReceipt.getByText(requestId, { exact: true })).toBeVisible();
  const childId = await receiptId(childReceipt);

  await page.goto("/platform");
  const status = page.locator(".migration-status-card");
  await expect(status.getByRole("heading", { name: "Match" })).toBeVisible();
  await expect(status.getByText("20260731044225", { exact: true })).toHaveCount(
    2,
  );
  await page.getByRole("button", { name: "Preview JSON" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Operation evidence preview",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close operation evidence preview" }),
  ).toBeFocused();
  const json = await dialog.locator("pre").innerText();
  for (const id of [
    supplierProductId,
    equipmentId,
    packagingId,
    requestId,
    childId,
  ])
    expect(json).toContain(id);
  expect(json).not.toMatch(/access_token|refresh_token|service_role|password/i);

  await dialog.getByRole("button", { name: "Copy exact JSON" }).click();
  await expect(page.getByText("Owner-scoped operation evidence JSON copied.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(json);
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download exact JSON" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let downloaded = "";
  for await (const chunk of stream) downloaded += chunk.toString();
  expect(downloaded).toBe(json);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
