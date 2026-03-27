import playwrightTest from 'file:///C:/Users/BigDaddy/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/@playwright/test/index.js';

const { test, expect } = playwrightTest;

const resetLocalSession = async (page) => {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = window.indexedDB.open('unitflip', 3);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['kv'], 'readwrite');
        tx.objectStore('kv').delete('unitflip_app_context_v1');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'key' });
        }
      };
    });
  });
};

const clearSearchInput = async (page) => {
  const search = page.getByPlaceholder(/Search units, buildings, facilities/i);
  if ((await search.count()) > 0) {
    await search.fill('');
  }
};

const signInFromLanding = async (page, demoLabel) => {
  await expect(page.getByRole('heading', { name: 'Sign in to UnitFlip locally.' })).toBeVisible({ timeout: 20000 });
  await page.getByLabel('Local demo user').selectOption({ label: demoLabel });
  await page.getByRole('button', { name: 'Sign In Locally' }).click();
};

const switchSession = async (page, demoLabel) => {
  await page.getByRole('button', { name: 'Switch Session' }).click();
  await signInFromLanding(page, demoLabel);
};

const signInDeveloperAndSeed = async (page, consoleMessages) => {
  await page.goto('/');
  await resetLocalSession(page);
  await page.reload();

  await signInFromLanding(page, 'Developer Demo');
  await expect(page.getByTestId('focused-home-screen')).toBeVisible({ timeout: 20000 });

  await page.locator('header').getByRole('button', { name: 'Seed Demo Data', exact: true }).click();
  await page.waitForFunction(
    () => {
      const navigationEntry = window.performance.getEntriesByType('navigation')[0];
      return navigationEntry && 'type' in navigationEntry && navigationEntry.type === 'reload';
    },
    undefined,
    { timeout: 30000 },
  );
  await expect
    .poll(() => consoleMessages.some((message) => message.includes('[DevSeedTrigger] Starting demo data seed...')))
    .toBe(true);
  await expect
    .poll(() => consoleMessages.some((message) => message.includes('[DevSeedTrigger] Demo data seed completed. Reloading app...')))
    .toBe(true);
};

const openUnitWorkspaceForUnit = async (page, unitLabel) => {
  await page.getByRole('button', { name: 'Unit Workspace', exact: true }).first().click();
  await expect(
    page.getByRole('heading', {
      name: /Follow one unit through inspection, scope, procurement, vendor work, and verification/i,
    }),
  ).toBeVisible({ timeout: 20000 });
  await clearSearchInput(page);
  await page.getByPlaceholder(/Search units, buildings, facilities/i).fill(unitLabel);
  await page.getByRole('button', { name: new RegExp(unitLabel, 'i') }).first().click();
};

const dismissFeedbackIfOpen = async (page) => {
  const feedbackHeading = page.getByRole('heading', { name: 'Send Feedback' });
  if (await feedbackHeading.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'Feedback' }).click();
    await expect(feedbackHeading).toHaveCount(0);
  }
};

test('authentication, session, and navigation audit', async ({ page }) => {
  test.setTimeout(240000);
  const consoleMessages = [];

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await signInDeveloperAndSeed(page, consoleMessages);

  await expect(page.locator('header').getByText('Devon Developer', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seed Demo Data', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('header').getByText('Devon Developer', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('focused-home-screen')).toBeVisible();

  await page.locator('header').getByRole('button', { name: 'Full Mode', exact: true }).click();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /See what needs attention now and route directly into the work/i })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Portfolio', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unit Workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inspection', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Procurement', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Templates', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retention & Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Feedback Management', exact: true })).toBeVisible();

  await switchSession(page, 'Admin Demo');
  await expect(page.locator('header').getByText('Addison Admin', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seed Demo Data', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Feedback Management', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retention & Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspection', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Start or continue inspection work.' })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Dashboard', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /See what needs attention now and route directly into the work/i })).toBeVisible({ timeout: 20000 });

  await switchSession(page, 'Manager Demo');
  await expect(page.locator('header').getByText('Morgan Manager', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Portfolio', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unit Workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Procurement', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retention & Settings', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Portfolio', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /Browse units and decide where work should happen next/i })).toBeVisible({ timeout: 20000 });

  await switchSession(page, 'Vendor Demo');
  await expect(page.getByRole('heading', { name: 'Procurement Workspace' })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('header').getByText('Val Vendor', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Procurement', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unit Workspace' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Portfolio' })).toHaveCount(0);
});

test('end-to-end workflow audit across portfolio, unit workspace, inspection, procurement, and vendor access', async ({ page }) => {
  test.setTimeout(240000);
  const consoleMessages = [];

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await signInDeveloperAndSeed(page, consoleMessages);
  await dismissFeedbackIfOpen(page);

  await expect(page.getByTestId('focused-home-start-inspection')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-home-start-inspection').click();
  await expect(page.getByTestId('focused-unit-select-screen')).toBeVisible({ timeout: 20000 });
  await page.getByLabel('Unit name').fill('Unit 101');
  await page.getByLabel('Unit code').fill('FOCUS-DUPE');
  await page.getByLabel('Address').fill('1200 Harbor View Dr');
  await page.getByTestId('focused-layout-template-select').selectOption({ label: '2 Bed / 1 Bath' });
  await page.getByTestId('focused-create-unit').click();
  await expect(page.getByTestId('focused-duplicate-modal')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-duplicate-modal').getByRole('button', { name: 'Continue New' }).click();
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Bedroom 2' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Bathroom' })).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-inspection-screen').getByRole('button', { name: 'Repair' }).first().click();
  await page.getByTestId('focused-inspection-screen').locator('select').first().selectOption({ index: 1 });
  await page.getByRole('button', { name: /Add to Materials|Update Materials/ }).first().click();
  await expect(page.getByText(/Materials list now includes/i).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Review Summary' }).click();
  await expect(page.getByTestId('focused-summary-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Room summaries/i)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Missing or incomplete/i)).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-summary-screen').getByRole('button', { name: 'View Materials' }).click();
  await expect(page.getByTestId('focused-materials-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Total estimated cost:/i)).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-materials-screen').getByRole('button', { name: 'Submit to Procurement' }).click({ force: true });
  await expect(page.getByTestId('focused-submission-status')).toContainText(/Submitted successfully/i);
  await expect(page.getByTestId('focused-submission-status')).toContainText(/Materials are now in Procurement/i);
  await page.getByTestId('focused-post-submit-procurement').click();
  await expect(page.getByRole('heading', { name: 'Procurement Workspace' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('procurement-focused-arrival')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('procurement-focused-arrival')).toContainText(/Focused submission arrived in Procurement/i);
  await page.locator('header').getByRole('button', { name: /Focused/i }).click();
  await expect(page.getByTestId('focused-materials-screen')).toBeVisible({ timeout: 20000 });
  await page.locator('header').getByRole('button', { name: /Full/i }).click();
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true }).first()).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Dashboard', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /See what needs attention now and route directly into the work/i })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('dashboard-priority-summary')).toContainText(/Start with/i);
  const exactWorkButton = page.getByRole('button', { name: 'Open Exact Work' }).first();
  if (await exactWorkButton.isVisible()) {
    await exactWorkButton.click();
    await expect(page.getByRole('heading', { name: 'Edit Inspection' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Opened from Dashboard/i).first()).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Dashboard', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: /See what needs attention now and route directly into the work/i })).toBeVisible({ timeout: 20000 });
  }
  await expect(page.getByText(/Unit complete/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'Open Portfolio' }).first().click();

  await expect(page.getByRole('heading', { name: /Browse units and decide where work should happen next/i })).toBeVisible({ timeout: 20000 });
  await page.getByPlaceholder(/Search facilities, buildings, units/i).fill('Unit 104');
  await page.getByRole('button', { name: /Unit 104/i }).first().click();
  await expect(page.getByTestId('portfolio-priority-summary')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Needs attention/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'Open Unit Workspace' }).click();

  await expect(page.getByRole('heading', { name: /Follow one unit through inspection, scope, procurement, vendor work, and verification/i })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('unit-workspace-tab-overview')).toBeVisible();
  await expect(page.getByTestId('unit-workspace-tab-inspection')).toBeVisible();
  await expect(page.getByTestId('unit-workspace-tab-scope')).toBeVisible();
  await expect(page.getByTestId('unit-workspace-tab-procurement')).toBeVisible();
  await expect(page.getByTestId('unit-workspace-tab-vendor')).toBeVisible();
  await expect(page.getByTestId('unit-workspace-tab-verification')).toBeVisible();
  await page.getByTestId('unit-workspace-tab-scope').click();
  await expect(page.getByTestId('unit-workspace-panel-scope')).toBeVisible();
  await page.getByTestId('unit-workspace-tab-procurement').click();
  await page.getByRole('button', { name: 'Open Procurement Workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Procurement Workspace' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Unit context is active/i)).toBeVisible();
  await expect(page.getByTestId('procurement-origin-context')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('procurement-mode-selection')).toBeVisible();
  await expect(page.getByTestId('procurement-mode-assignment')).toBeVisible();
  await expect(page.getByTestId('procurement-mode-vendor')).toBeVisible();
  await expect(page.getByTestId('procurement-mode-receiving')).toBeVisible();
  await expect(page.getByTestId('procurement-mode-verification')).toBeVisible();
  await expect(page.getByTestId('procurement-mode-exceptions')).toBeVisible();

  await page.getByRole('button', { name: 'Inspection', exact: true }).first().click();
  const editInspectionHeading = page.getByRole('heading', { name: 'Edit Inspection' });
  const inspectionHomeHeading = page.getByRole('heading', { name: 'Start or continue inspection work.' });
  if (await editInspectionHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
    await expect(editInspectionHeading).toBeVisible({ timeout: 20000 });
  } else {
    await expect(inspectionHomeHeading).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /Focused Inspection/i }).first().click();
    await expect(editInspectionHeading).toBeVisible({ timeout: 20000 });
  }
  await expect(page.getByText(/Inspection Intelligence/i)).toBeVisible();
  await expect(page.getByText(/Guided Scope Progression/i)).toBeVisible();
  await expect(page.getByText(/Continue inspection capture|Add findings/i).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Capture Strip' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Structured Scope From Capture' })).toBeVisible();
  await page.getByPlaceholder('Try: 2 broken blinds, paint walls, missing fridge').fill('Kitchen wall stain near sink line');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Suggested Finding' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Creates finding:/i)).toBeVisible();
  await page.getByRole('button', { name: 'Create Finding' }).click();
  await expect(page.getByText(/Structured scope updated/i)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Finding created\./i).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Open created finding' }).click();
  await expect(page.getByTestId('inspection-scope-focus-banner')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Focused finding/i)).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('inspection-findings-guidance')).toContainText(/need attention/i);
  await page.getByRole('button', { name: 'Open Unit Workspace' }).click();
  await expect(page.getByRole('heading', { name: /Follow one unit through inspection, scope, procurement, vendor work, and verification/i })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('unit-workspace-priority-summary')).toContainText(/Priority now/i);
  await page.getByTestId('unit-workspace-tab-overview').click();
  await expect(page.getByTestId('unit-workspace-recent-work')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('unit-workspace-recent-work').getByRole('button').first()).toBeVisible({ timeout: 20000 });
  await page.getByTestId('unit-workspace-open-priority-inspection').click();
  await expect(page.getByRole('heading', { name: 'Edit Inspection' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: /Generate Tasks/i })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /Generate Tasks/i }).click();
  await expect(page.getByTestId('inspection-scope-focus-banner')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Focused task/i)).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('inspection-tasks-guidance')).toContainText(/need attention/i);
  await expect(page.getByRole('button', { name: /Generate Materials/i })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /Generate Materials/i }).click();
  await expect(page.getByTestId('inspection-scope-focus-banner')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Focused material requirement/i)).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('inspection-materials-guidance')).toContainText(/need attention/i);
  await expect(page.getByText(/Continue in Unit Workspace|Continue into Procurement/i).first()).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Procurement', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Procurement Workspace' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Procurement Workspace/i).first()).toBeVisible();
  await page.getByTestId('procurement-mode-assignment').click();
  await expect(page.getByText(/Needs Assignment/i).first()).toBeVisible();
  if ((await page.getByLabel(/Assign vendor for /).count()) > 0) {
    await page.getByLabel(/Assign vendor for /).first().selectOption({ label: 'Val Vendor' });
    await page.getByRole('button', { name: /Assign Vendor|Reassign Vendor/ }).first().click();
  }
  await page.getByTestId('procurement-mode-receiving').click();
  await expect(page.getByText(/Pending Receiving/i).first()).toBeVisible();
  await page.getByTestId('procurement-mode-verification').click();
  await expect(page.getByText(/Pending Verification/i).first()).toBeVisible();
  await expect(page.getByTestId('procurement-closeout-guidance')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Dashboard', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /See what needs attention now and route directly into the work/i })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('dashboard-recent-work')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('dashboard-recent-work-item-procurement').first()).toBeVisible({ timeout: 20000 });
  await page.getByTestId('dashboard-recent-work-item-procurement').first().click();
  await expect(page.getByRole('heading', { name: 'Procurement Workspace' })).toBeVisible({ timeout: 20000 });

  await switchSession(page, 'Vendor Demo');
  await expect(page.getByRole('heading', { name: 'Procurement Workspace' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('heading', { name: 'Vendor Action Queue' })).toBeVisible();
  await expect(page.getByTestId('vendor-queue-guidance')).toBeVisible({ timeout: 20000 });
  await expect(page.getByLabel(/Correction route for /)).toHaveCount(0);
  await expect(page.getByText(/Assigned to Val Vendor/i).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Selected procurement product for this assigned work/i).first()).toBeVisible({ timeout: 20000 });
  const vendorQueueItem = page.getByTestId(/vendor-queue-item-/).first();
  await vendorQueueItem.getByPlaceholder('Replaced fixture and confirmed operation').fill('Vendor completion note from browser audit');
  await vendorQueueItem
    .getByPlaceholder('Brief closeout details for the internal receiving and verification review.')
    .fill('Completed install and tested operation before leaving the unit.');
  const acknowledgeButton = vendorQueueItem.locator('button:not([disabled])', { hasText: 'Acknowledge' }).first();
  await expect(acknowledgeButton).toBeVisible({ timeout: 20000 });
  await acknowledgeButton.click();
  await expect(page.getByText(/acknowledged\./i).first()).toBeVisible({ timeout: 20000 });
  const inProgressButton = vendorQueueItem.locator('button:not([disabled])', { hasText: 'Mark In Progress' }).first();
  await expect(inProgressButton).toBeVisible({ timeout: 20000 });
  await inProgressButton.click();
  await expect(page.getByText(/marked in progress/i).first()).toBeVisible({ timeout: 20000 });
  const completeButton = vendorQueueItem.locator('button:not([disabled])', { hasText: 'Mark Completed' }).first();
  await expect(completeButton).toBeVisible({ timeout: 20000 });
  await completeButton.click();
  await expect(page.getByText(/waits on internal receiving or verification/i).first()).toBeVisible({ timeout: 20000 });

  await switchSession(page, 'Developer Demo');
  await page.getByRole('button', { name: 'Procurement', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Procurement Workspace' })).toBeVisible({ timeout: 20000 });
});

test('focused post-submit decision guidance audit', async ({ page }) => {
  test.setTimeout(240000);
  const consoleMessages = [];

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await signInDeveloperAndSeed(page, consoleMessages);
  await dismissFeedbackIfOpen(page);

  await expect(page.getByTestId('focused-home-start-inspection')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-home-start-inspection').click();
  await expect(page.getByTestId('focused-unit-select-screen')).toBeVisible({ timeout: 20000 });
  await page.getByLabel('Unit name').fill('Unit 101');
  await page.getByLabel('Unit code').fill('FOCUS-POST-1');
  await page.getByLabel('Address').fill('1200 Harbor View Dr');
  await page.getByTestId('focused-layout-template-select').selectOption({ label: '2 Bed / 1 Bath' });
  await page.getByTestId('focused-create-unit').click();
  await expect(page.getByTestId('focused-duplicate-modal')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-duplicate-modal').getByRole('button', { name: 'Continue New' }).click();
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-inspection-screen').getByRole('button', { name: 'Repair' }).first().click();
  await page.getByTestId('focused-inspection-screen').locator('select').first().selectOption({ index: 1 });
  await page.getByRole('button', { name: /Add to Materials|Update Materials/ }).first().click();
  await expect(page.getByText(/Materials list now includes/i).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Saved locally and ready to continue|Saved on this device|Saved locally/i).last()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Review Summary' }).click({ force: true });
  await expect(page.getByTestId('focused-summary-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-summary-screen').getByRole('button', { name: 'View Materials' }).click({ force: true });
  await expect(page.getByTestId('focused-materials-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-materials-screen').getByRole('button', { name: 'Submit to Procurement' }).click({ force: true });
  await expect(page.getByTestId('focused-submission-status')).toContainText(/Submitted successfully/i);
  await expect(page.getByTestId('focused-submission-status')).toContainText(/You are done here unless you want to act in Procurement immediately or start the next unit/i);
  await expect(page.getByTestId('focused-post-submit-start-another')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('focused-post-submit-unit-list')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-post-submit-start-another').click();
  await expect(page.getByTestId('focused-unit-select-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByLabel('Unit name')).toHaveValue('');
  await dismissFeedbackIfOpen(page);

  await page.getByLabel('Unit name').fill('Unit 101');
  await page.getByLabel('Unit code').fill('FOCUS-POST-2');
  await page.getByLabel('Address').fill('1200 Harbor View Dr');
  await page.getByTestId('focused-layout-template-select').selectOption({ label: '2 Bed / 1 Bath' });
  await page.getByTestId('focused-create-unit').click();
  await expect(page.getByTestId('focused-duplicate-modal')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-duplicate-modal').getByRole('button', { name: 'Continue New' }).click();
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-inspection-screen').getByRole('button', { name: 'Repair' }).first().click();
  await page.getByTestId('focused-inspection-screen').locator('select').first().selectOption({ index: 1 });
  await page.getByRole('button', { name: /Add to Materials|Update Materials/ }).first().click();
  await expect(page.getByText(/Materials list now includes/i).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Review Summary' }).click({ force: true });
  await expect(page.getByTestId('focused-summary-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-summary-screen').getByRole('button', { name: 'View Materials' }).click({ force: true });
  await expect(page.getByTestId('focused-materials-screen')).toBeVisible({ timeout: 20000 });
  await page.context().setOffline(true);
  await page.getByTestId('focused-materials-screen').getByRole('button', { name: 'Submit to Procurement' }).click({ force: true });
  await expect(page.getByTestId('focused-submission-status')).toContainText(/Queued offline/i);
  await expect(page.getByTestId('focused-submission-status')).toContainText(/Nothing was lost|on this device/i);
  await page.context().setOffline(false);
  await page.locator('header').getByRole('button', { name: 'Full Mode', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true }).first()).toBeVisible({ timeout: 20000 });
  await page.locator('header').getByRole('button', { name: /Focused/i }).click();
  await expect(page.getByTestId('focused-materials-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('focused-submission-status')).toContainText(/Queued offline/i);
  await expect(page.getByTestId('focused-post-submit-retry-queued')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-post-submit-retry-queued').click();
  await expect(page.getByTestId('focused-submission-status')).toContainText(/Submitted successfully/i);
  await page.getByTestId('focused-post-submit-unit-list').click();
  await expect(page.getByTestId('focused-unit-select-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByLabel('Unit name')).toHaveValue('');

  await page.getByLabel('Unit name').fill('Unit 101');
  await page.getByLabel('Unit code').fill('FOCUS-POST-3');
  await page.getByLabel('Address').fill('1200 Harbor View Dr');
  await page.getByTestId('focused-layout-template-select').selectOption({ label: '2 Bed / 1 Bath' });
  await page.getByTestId('focused-create-unit').click();
  await expect(page.getByTestId('focused-duplicate-modal')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-duplicate-modal').getByRole('button', { name: 'Continue New' }).click();
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-inspection-screen').getByRole('button', { name: 'Repair' }).first().click();
  await page.getByTestId('focused-inspection-screen').locator('select').first().selectOption({ index: 1 });
  await page.getByRole('button', { name: /Add to Materials|Update Materials/ }).first().click();
  await expect(page.getByText(/Materials list now includes/i).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Review Summary' }).click({ force: true });
  await expect(page.getByTestId('focused-summary-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-summary-screen').getByRole('button', { name: 'View Materials' }).click({ force: true });
  await expect(page.getByTestId('focused-materials-screen')).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    (window).__unitflipTestFlags = { forceFocusedSubmitFailureOnce: true };
  });
  await page.getByTestId('focused-materials-screen').getByRole('button', { name: 'Submit to Procurement' }).click({ force: true });
  await expect(page.getByTestId('focused-submission-status')).toContainText(/Retry needed/i);
  await expect(page.getByTestId('focused-post-submit-retry')).toBeVisible({ timeout: 20000 });
});

test('exception and correction-route audit', async ({ page }) => {
  test.setTimeout(240000);
  const consoleMessages = [];

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await signInDeveloperAndSeed(page, consoleMessages);
  await page.locator('header').getByRole('button', { name: 'Full Mode', exact: true }).click();
  await page.getByRole('button', { name: 'Portfolio', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /Browse units and decide where work should happen next/i })).toBeVisible({ timeout: 20000 });
  await page.getByPlaceholder(/Search facilities, buildings, units/i).fill('LC-A-101');
  await page.getByRole('button', { name: /Unit 101/i }).first().click();
  await expect(page.getByTestId('portfolio-template-status')).toContainText(/Template ready/i);
  await page.getByRole('button', { name: 'Manage Record' }).click();
  await expect(page.getByText(/Unit record management/i)).toBeVisible({ timeout: 20000 });
  await page.getByTestId('unit-record-template-select').selectOption('');
  await page.getByRole('button', { name: 'Save Unit Details' }).click();
  await page.getByRole('button', { name: 'Back to Portfolio' }).click();
  await expect(page.getByTestId('portfolio-template-status')).toContainText(/Suggested template/i);
  await expect(page.getByTestId('portfolio-apply-suggested-template')).toBeVisible({ timeout: 20000 });
  await page.locator('header').getByRole('button', { name: /Focused/i }).click();
  await page.getByTestId('focused-home-start-inspection').click();
  await expect(page.getByTestId('focused-unit-select-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-unit-search').fill('LC-A-101');
  await page.getByTestId(/focused-unit-action-/).first().click();
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Living Room' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Kitchen' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Bedroom 1' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Bathroom' })).toBeVisible({ timeout: 20000 });
  await page.locator('header').getByRole('button', { name: 'Full Mode', exact: true }).click();
  await page.getByRole('button', { name: 'Portfolio', exact: true }).first().click();
  await page.getByPlaceholder(/Search facilities, buildings, units/i).fill('LC-A-101');
  await page.getByRole('button', { name: /Unit 101/i }).first().click();
  await expect(page.getByTestId('portfolio-template-status')).toContainText(/Template ready/i);

  await expect(page.getByRole('heading', { name: /Browse units and decide where work should happen next/i })).toBeVisible({ timeout: 20000 });
  await page.getByPlaceholder(/Search facilities, buildings, units/i).fill('Unit 106');
  await page.getByRole('button', { name: /Unit 106/i }).first().click();
  await expect(page.getByText(/Unit complete/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'Open Unit Workspace' }).click();

  await expect(page.getByRole('heading', { name: /Follow one unit through inspection, scope, procurement, vendor work, and verification/i })).toBeVisible({ timeout: 20000 });
  await page.getByTestId('unit-workspace-tab-verification').click();
  await page.getByRole('button', { name: 'Open verification queue' }).click();
  await expect(page.getByRole('heading', { name: 'Procurement Workspace' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Unit context is active/i)).toBeVisible();
  await expect(page.getByTestId('procurement-mode-verification')).toBeVisible();
  if ((await page.getByLabel(/Correction route for /).count()) > 0) {
    await page.getByLabel(/Correction route for /).first().selectOption('scope');
    await page.getByRole('button', { name: 'Fail and Reroute' }).first().click();
    await expect(page.getByText(/Correct via Scope/i).first()).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Open Scope Correction' }).first().click();
    await expect(page.getByRole('heading', { name: 'Edit Inspection' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Opened from Procurement • Scope Correction')).toBeVisible();
    await expect(page.getByTestId('inspection-scope-focus-banner')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Focused material requirement/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Generated Checklist/i)).toBeVisible({ timeout: 20000 });
    await page.locator('select').filter({ has: page.locator('option[value="failed"]') }).first().selectOption('failed');
    await page.getByRole('button', { name: 'Create Structured Finding' }).first().click();
    await expect(page.getByRole('button', { name: 'Open Finding' }).first()).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Open Finding' }).first().click();
    await expect(page.getByTestId('inspection-scope-focus-banner')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Opened from checklist row/i)).toBeVisible({ timeout: 20000 });
  } else {
    await expect(page.getByText(/No material requirements match the current queue/i)).toBeVisible();
  }
});
