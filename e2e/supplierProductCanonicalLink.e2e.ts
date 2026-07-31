import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import {
  createIngredient,
  owner,
  signIn,
} from "./ingredientKnowledge.helpers";

async function localOwnerClient() {
  const credentials = owner();
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(credentials.url))
    throw new Error("Canonical Supplier link E2E requires local Supabase.");
  const client = createClient(credentials.url, credentials.publishableKey, {
    auth: { persistSession: false },
  });
  const signedIn = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (signedIn.error) throw signedIn.error;
  return client;
}

test("owner explicitly links a legacy Supplier Product without changing its stable identity", async ({
  page,
}) => {
  await signIn(page);
  const credentials = owner();
  const stamp = Date.now();
  const supplierName = `Recovery Supplier ${stamp}`;
  await page.goto("/suppliers");
  await page.getByRole("button", { name: "New supplier" }).click();
  await page.locator("form.supplier-create").getByLabel("Legal name").fill(supplierName);
  await page.getByRole("button", { name: "Create supplier" }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(supplierName) }),
  ).toHaveAttribute("aria-pressed", "true");
  const supplierId = new URL(page.url()).searchParams.get("supplier");
  expect(supplierId).toBeTruthy();

  const ingredientName = `Recovery ingredient ${stamp}`;
  const ingredientInci = `RECOVERY INCI ${stamp}`;
  const ingredientId = await createIngredient(
    page,
    ingredientName,
    ingredientInci,
  );
  const client = await localOwnerClient();
  const workspace = await client
    .from("workspaces")
    .select("id")
    .eq("owner_id", credentials.userId)
    .single();
  if (workspace.error) throw workspace.error;

  const legacyId = crypto.randomUUID();
  const legacyName = `Legacy unlinked candidate ${stamp}`;
  const createdAt = "2026-07-31T08:00:00.000Z";
  const verification = {
    inci: "unknown",
    supplierSpecification: "unknown",
    sds: "unknown",
    coa: "unknown",
    allergenInformation: "unknown",
    shelfLife: "unknown",
    origin: "unknown",
    extractionMethod: "unknown",
    processingMethod: "unknown",
    ifra: "unknown",
    cosing: "unknown",
  };
  const inserted = await client.from("supplier_products").insert({
    id: legacyId,
    workspace_id: workspace.data.id,
    owner_id: credentials.userId,
    ingredient_id: ingredientId,
    supplier_id: null,
    supplier_name: supplierName,
    product_name: legacyName,
    lifecycle_status: "candidate",
    price_state: "unknown",
    product_status: "research",
    declared_inci: ingredientInci,
    category_snapshot: "E2E material",
    default_inventory_unit: "g",
    cosing_functions_snapshot: [],
    research_profile_snapshot: "",
    price: null,
    currency: null,
    package_quantity: null,
    package_unit: null,
    package_description: null,
    notes: "",
    operational_notes: "",
    verification_notes: "",
    verification,
    is_preferred: false,
    created_at: createdAt,
    updated_at: createdAt,
  });
  expect(inserted.error).toBeNull();

  const before = await client
    .from("supplier_products")
    .select("*")
    .eq("id", legacyId)
    .single();
  expect(before.error).toBeNull();

  await page.goto(`/ingredients/${ingredientId}`);
  const legacyCard = page
    .locator(".supplier-products article")
    .filter({ hasText: legacyName });
  await expect(legacyCard).toBeVisible();
  await legacyCard.getByRole("button", { name: "Edit" }).click();
  const form = page.locator("form.supplier-product-form");
  await expect(
    form.getByLabel("Canonical supplier").locator("option").first(),
  ).toContainText("Legacy supplier name — not canonically linked");
  await form.getByLabel("Canonical supplier").selectOption(supplierId!);
  await form.getByRole("button", { name: "Save Supplier Product" }).click();

  const receipt = page.getByTestId("operation-receipt");
  await expect(receipt.getByText("UPDATE confirmed")).toBeVisible();
  await expect(receipt.getByText(legacyId, { exact: true })).toBeVisible();
  await expect(
    receipt.getByText(`supplier id: ${supplierId!}`, { exact: true }),
  ).toBeVisible();

  const after = await client
    .from("supplier_products")
    .select("*")
    .eq("id", legacyId)
    .single();
  expect(after.error).toBeNull();
  expect(after.data).toMatchObject({
    id: legacyId,
    ingredient_id: ingredientId,
    supplier_id: supplierId,
    supplier_name: supplierName,
    product_name: legacyName,
    lifecycle_status: "candidate",
    price_state: "unknown",
    price: null,
    currency: null,
    package_quantity: null,
    package_unit: null,
    created_at: createdAt,
  });
  for (const field of [
    "id",
    "ingredient_id",
    "product_name",
    "lifecycle_status",
    "price_state",
    "price",
    "currency",
    "package_quantity",
    "package_unit",
    "package_description",
    "notes",
    "created_at",
  ])
    expect(after.data?.[field]).toEqual(before.data?.[field]);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: legacyName }),
  ).toBeVisible();
  await page.goto("/platform");
  await page.getByRole("button", { name: "Preview JSON" }).click();
  const payload = JSON.parse(
    await page
      .getByRole("dialog", { name: "Operation evidence preview" })
      .locator("pre")
      .innerText(),
  );
  expect(
    payload.records.supplier_product.find(
      (record: { id: string }) => record.id === legacyId,
    ),
  ).toMatchObject({
    id: legacyId,
    supplier_id: supplierId,
    supplier_name: supplierName,
  });

  await page.keyboard.press("Escape");
  await page.goto(`/ingredients/${ingredientId}`);
  await page.getByRole("button", { name: "Add supplier product" }).click();
  const duplicateForm = page.locator("form.supplier-product-form");
  await duplicateForm.getByLabel("Canonical supplier").selectOption(supplierId!);
  await duplicateForm.getByLabel("Product name").fill(legacyName);
  await duplicateForm
    .getByRole("button", { name: "Save Supplier Product" })
    .click();
  await expect(
    duplicateForm.getByRole("alert").getByText(/already exists/),
  ).toBeVisible();
  await expect(duplicateForm).toBeVisible();
  await expect(page.getByTestId("operation-receipt")).toHaveCount(0);

  const finalRows = await client
    .from("supplier_products")
    .select("id")
    .eq("ingredient_id", ingredientId)
    .eq("supplier_id", supplierId!)
    .eq("product_name", legacyName);
  expect(finalRows.error).toBeNull();
  expect(finalRows.data).toEqual([{ id: legacyId }]);
});
