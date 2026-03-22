import playwrightTest from 'file:///C:/Users/BigDaddy/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/@playwright/test/index.js';

const { test, expect } = playwrightTest;

const unitName = 'Phase 6A Validation Unit';
const inspectionTitle = 'Phase 6A Validation Inspection';

test('phase 6A navigation clarification and unit management flow', async ({ page }) => {
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt' && dialog.message().includes('Enter Unit Name')) {
      await dialog.accept(unitName);
      return;
    }
    await dialog.dismiss();
  });

  await page.goto('/');
  const inspectionNavButton = page.getByRole('button', { name: 'Inspection', exact: true }).first();
  const unitManagementNavButton = page.getByRole('button', { name: 'Unit Management', exact: true }).first();
  const retentionNavButton = page.getByRole('button', { name: 'Retention & Settings', exact: true }).first();

  await expect(inspectionNavButton).toBeVisible();
  await expect(unitManagementNavButton).toBeVisible();
  await expect(retentionNavButton).toBeVisible();
  await expect(page.getByText('Inspection Mode')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Inspections' })).toHaveCount(0);

  await inspectionNavButton.click();
  await expect(page.getByRole('heading', { name: 'Start or continue inspection work.' })).toBeVisible();
  await expect(page.getByText('Resume active inspections')).toBeVisible();

  await unitManagementNavButton.click();
  await expect(page.getByRole('heading', { name: 'Manage units, active inspections, and setup.' })).toBeVisible();
  await expect(page.getByText('Active inspections and statuses')).toBeVisible();
  await expect(page.getByText('Units grouped by facility or building')).toBeVisible();

  const existingUnit = page.getByText(unitName, { exact: true }).first();
  if ((await existingUnit.count()) === 0) {
    await page.getByRole('button', { name: 'Add Unit' }).click();
    await expect(page.getByText(unitName, { exact: true }).first()).toBeVisible();
  }

  await inspectionNavButton.click();
  await page.getByRole('button', { name: /Start Inspection|Choose Unit|Show all/i }).first().click();
  await page.getByText(unitName, { exact: true }).first().click();

  await expect(page.getByRole('heading', { name: 'Inspection queue' })).toBeVisible();
  await page.getByRole('button', { name: 'New Inspection' }).click();
  await expect(page.getByRole('heading', { name: 'New Inspection' })).toBeVisible();
  await page.getByPlaceholder('Move-out Check').fill(inspectionTitle);
  await page.getByRole('button', { name: 'Create Without Template' }).click();

  await expect(page.getByText('Generated Checklist')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Room Checklist')).toBeVisible();

  await unitManagementNavButton.click();
  await expect(page.getByText('Active inspections and statuses')).toBeVisible();
  await expect(page.getByText(unitName, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/draft|in progress|completed/i).first()).toBeVisible();
});
