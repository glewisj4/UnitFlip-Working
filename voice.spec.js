import playwrightTest from 'file:///C:/Users/BigDaddy/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/@playwright/test/index.js';

const { test, expect } = playwrightTest;
let focusedStorageInitScriptId = 0;

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
    .poll(async () => {
      if (consoleMessages.some((message) => message.includes('[DevSeedTrigger] Demo data seed completed. Reloading app...'))) {
        return true;
      }
      const states = await Promise.all([
        page.getByTestId('focused-home-screen').isVisible().catch(() => false),
        page.getByTestId('focused-unit-select-screen').isVisible().catch(() => false),
        page.getByRole('heading', { name: 'Simple inspection and materials flow.' }).isVisible().catch(() => false),
      ]);
      return states.some(Boolean);
    })
    .toBe(true);

  await expect
    .poll(async () => {
      const context = await readKvValue(page, 'unitflip_app_context_v1');
      const orgId = context?.org?.id;
      if (!orgId) return 0;
      const units = await readKvValue(page, `unitflip_units_v1:${orgId}`);
      return Array.isArray(units) ? units.length : 0;
    }, { timeout: 30000 })
    .toBeGreaterThanOrEqual(3);
};

const continueIfDuplicateModalVisible = async (page) => {
  const duplicateModal = page.getByTestId('focused-duplicate-modal');
  if (await duplicateModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    await duplicateModal.getByRole('button', { name: 'Continue New' }).click();
  }
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

const ensureFocusedHome = async (page) => {
  const focusedHomeHeading = page.getByRole('heading', { name: 'Simple inspection and materials flow.' });
  const focusedToggle = page.locator('header').getByRole('button', { name: /Focused/i });
  if ((await focusedToggle.count()) > 0) {
    await focusedToggle.click();
  }
  await expect
    .poll(async () => {
      const visibility = await Promise.all([
        page.getByTestId('focused-home-screen').isVisible().catch(() => false),
        focusedHomeHeading.isVisible().catch(() => false),
        page.getByTestId('focused-unit-select-screen').isVisible().catch(() => false),
      ]);
      return visibility.some(Boolean);
    })
    .toBe(true);
};

const buildFocusedStorageKey = (role = 'developer') => `unitflip:focused-workflow:${role}`;

const readFocusedStorage = async (page, role = 'developer') =>
  page.evaluate((storageKey) => {
    return {
      local: window.localStorage.getItem(storageKey),
      session: window.sessionStorage.getItem(storageKey),
    };
  }, buildFocusedStorageKey(role));

const writeFocusedStorage = async (page, value, role = 'developer') =>
  page.evaluate(
    ({ storageKey, nextValue }) => {
      const serialized = nextValue === null ? null : JSON.stringify(nextValue);
      if (serialized === null) {
        window.localStorage.removeItem(storageKey);
        window.sessionStorage.removeItem(storageKey);
        return;
      }
      window.localStorage.setItem(storageKey, serialized);
      window.sessionStorage.setItem(storageKey, serialized);
    },
    { storageKey: buildFocusedStorageKey(role), nextValue: value },
  );

const writeFocusedStorageBranches = async (page, branches, role = 'developer') =>
  page.evaluate(
    ({ storageKey, nextLocal, nextSession }) => {
      if (typeof nextLocal === 'string') {
        window.localStorage.setItem(storageKey, nextLocal);
      } else if (nextLocal === null) {
        window.localStorage.removeItem(storageKey);
      }

      if (typeof nextSession === 'string') {
        window.sessionStorage.setItem(storageKey, nextSession);
      } else if (nextSession === null) {
        window.sessionStorage.removeItem(storageKey);
      }
    },
    { storageKey: buildFocusedStorageKey(role), nextLocal: branches.local, nextSession: branches.session },
  );

const writeFocusedStorageAndReload = async (page, value, role = 'developer') =>
  page.evaluate(
    ({ storageKey, nextValue }) => {
      const serialized = nextValue === null ? null : JSON.stringify(nextValue);
      if (serialized === null) {
        window.localStorage.removeItem(storageKey);
        window.sessionStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, serialized);
        window.sessionStorage.setItem(storageKey, serialized);
      }
      window.location.reload();
    },
    { storageKey: buildFocusedStorageKey(role), nextValue: value },
  );

const writeFocusedStorageBranchesAndReload = async (page, branches, role = 'developer') =>
  page.evaluate(
    ({ storageKey, nextLocal, nextSession }) => {
      if (typeof nextLocal === 'string') {
        window.localStorage.setItem(storageKey, nextLocal);
      } else if (nextLocal === null) {
        window.localStorage.removeItem(storageKey);
      }

      if (typeof nextSession === 'string') {
        window.sessionStorage.setItem(storageKey, nextSession);
      } else if (nextSession === null) {
        window.sessionStorage.removeItem(storageKey);
      }

      window.location.reload();
    },
    { storageKey: buildFocusedStorageKey(role), nextLocal: branches.local, nextSession: branches.session },
  );

const stageFocusedStorageBranchesForNextLoad = async (page, branches, role = 'developer') => {
  const marker = `__unitflip-focused-storage-stage:${focusedStorageInitScriptId++}`;
  await page.addInitScript(
    ({ storageKey, nextLocal, nextSession, markerKey }) => {
      try {
        if (window.sessionStorage.getItem(markerKey)) {
          return;
        }

        if (typeof nextLocal === 'string') {
          window.localStorage.setItem(storageKey, nextLocal);
        } else if (nextLocal === null) {
          window.localStorage.removeItem(storageKey);
        }

        if (typeof nextSession === 'string') {
          window.sessionStorage.setItem(storageKey, nextSession);
        } else if (nextSession === null) {
          window.sessionStorage.removeItem(storageKey);
        }

        window.sessionStorage.setItem(markerKey, '1');
      } catch {
        // Ignore staging failures inside test bootstrap.
      }
    },
    { storageKey: buildFocusedStorageKey(role), nextLocal: branches.local, nextSession: branches.session, markerKey: marker },
  );
};

const expectFocusedSafeSurface = async (page) => {
  const homeHeading = page.getByRole('heading', { name: 'Simple inspection and materials flow.' });
  const unitSelect = page.getByTestId('focused-unit-select-screen');
  const inspection = page.getByTestId('focused-inspection-screen');
  const materials = page.getByTestId('focused-materials-screen');
  const loading = page.getByText(/Preparing inspection\. Focused Mode is loading the unit, rooms, and checklist now\./i);
  await expect
    .poll(async () => {
      const visible = await Promise.all([
        homeHeading.isVisible().catch(() => false),
        unitSelect.isVisible().catch(() => false),
        inspection.isVisible().catch(() => false),
        materials.isVisible().catch(() => false),
        loading.isVisible().catch(() => false),
      ]);
      return visible.some(Boolean);
    })
    .toBe(true);
};

const readKvValue = async (page, key) =>
  page.evaluate(async (storageKey) => {
    return await new Promise((resolve, reject) => {
      const request = window.indexedDB.open('unitflip', 3);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['kv'], 'readonly');
        const store = tx.objectStore('kv');
        const getRequest = store.get(storageKey);
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
          if (!getRequest.result?.value) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(getRequest.result.value));
          } catch (error) {
            reject(error);
          }
        };
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'key' });
        }
      };
    });
  }, key);

const writeKvValue = async (page, key, value) =>
  page.evaluate(
    async ({ storageKey, nextValue }) => {
      await new Promise((resolve, reject) => {
        const request = window.indexedDB.open('unitflip', 3);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['kv'], 'readwrite');
          const store = tx.objectStore('kv');
          store.put({ key: storageKey, value: JSON.stringify(nextValue) });
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
    },
    { storageKey: key, nextValue: value },
  );

const getLocalSession = async (page) => {
  await expect(page.getByTestId('focused-home-screen')).toBeVisible({ timeout: 20000 });
  const session = await readKvValue(page, 'unitflip_app_context_v1');
  if (session?.org?.id && session?.user?.id) {
    return session;
  }
  return {
    org: { id: 'local_org_my_organization' },
    user: { id: 'local_user_devon_developer' },
  };
};

const createFocusedFixtureItem = (id, label, roomLabel, overrides = {}) => ({
  id,
  sourceTemplateItemId: `${id}-template`,
  sourceRecipeSectionId: `${id}-recipe`,
  label,
  category: 'general',
  itemType: 'inspection',
  inputMode: 'none',
  status: 'not_started',
  required: true,
  photoIds: [],
  roomType: 'living_room',
  roomLabel,
  notes: undefined,
  order: 1,
  severity: undefined,
  findingIds: [],
  repairTaskIds: [],
  materialRequirementIds: [],
  updatedAt: Date.now(),
  ...overrides,
});

const createFocusedFixtureSection = (id, roomLabel, items) => ({
  id,
  sourceRecipeSectionId: `${id}-recipe`,
  title: roomLabel,
  roomType: 'living_room',
  roomLabel,
  order: 1,
  items,
});

const installFocusedValidationFixtures = async (page) => {
  const session = await getLocalSession(page);
  const orgId = session.org.id;
  const userId = session.user.id;
  const unitsKey = `unitflip_units_v1:${orgId}`;
  const inspectionsKey = `unitflip_inspections_v1:${orgId}`;
  const layoutsKey = 'unitflip_layout_templates_v1';
  const mappingsKey = 'unitflip_layout_checklist_mappings_v1';

  const unitsValue = await readKvValue(page, unitsKey);
  const inspectionsValue = await readKvValue(page, inspectionsKey);
  const layoutsValue = await readKvValue(page, layoutsKey);
  const mappingsValue = await readKvValue(page, mappingsKey);
  const units = Array.isArray(unitsValue) ? unitsValue : [];
  const inspections = Array.isArray(inspectionsValue) ? inspectionsValue : [];
  const storedLayouts = Array.isArray(layoutsValue) ? layoutsValue : [];
  const storedMappings = Array.isArray(mappingsValue) ? mappingsValue : [];
  const now = Date.now();

  const startUnitId = 'focused-fixture-unit-start';
  const resumeUnitId = 'focused-fixture-unit-resume';
  const completedUnitId = 'focused-fixture-unit-completed';
  const brokenTemplateUnitId = 'focused-fixture-unit-broken-template';
  const postSubmitUnitId = 'focused-fixture-unit-post-submit';

  const nextUnits = [
    ...units.filter(
      (unit) =>
        ![startUnitId, resumeUnitId, completedUnitId, brokenTemplateUnitId, postSubmitUnitId].includes(unit.id),
    ),
    {
      id: startUnitId,
      orgId,
      name: 'Focused Start Fixture',
      unitCode: 'FX-START',
      assignedLayoutTemplateId: 'layout-2br-1ba-v1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: resumeUnitId,
      orgId,
      name: 'Focused Resume Fixture',
      unitCode: 'FX-RESUME',
      assignedLayoutTemplateId: 'layout-2br-1ba-v1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: completedUnitId,
      orgId,
      name: 'Focused Completed Fixture',
      unitCode: 'FX-COMPLETE',
      assignedLayoutTemplateId: 'layout-2br-1ba-v1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: brokenTemplateUnitId,
      orgId,
      name: 'Focused Broken Template Fixture',
      unitCode: 'FX-BROKEN',
      assignedLayoutTemplateId: 'layout-focused-broken-v1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: postSubmitUnitId,
      orgId,
      name: 'Focused Post Submit Fixture',
      unitCode: 'FX-POST',
      assignedLayoutTemplateId: 'layout-1br-1ba-v1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const resumeSections = [
    createFocusedFixtureSection('focused-resume-living-room', 'Living Room', [
      createFocusedFixtureItem('focused-resume-item-1', 'Repair wall patch', 'Living Room'),
    ]),
    createFocusedFixtureSection('focused-resume-bedroom-2', 'Bedroom 2', [
      createFocusedFixtureItem('focused-resume-item-2', 'Replace switch plate', 'Bedroom 2'),
    ]),
  ];
  const completedSections = [
    createFocusedFixtureSection('focused-completed-living-room', 'Living Room', [
      createFocusedFixtureItem('focused-completed-item-1', 'Completed inspection item', 'Living Room', {
        focusedAction: 'repair',
        materialRequirementIds: ['focused-completed-material-1'],
      }),
    ]),
  ];
  const postSubmitSections = [
    createFocusedFixtureSection('focused-post-submit-living-room', 'Living Room', [
      createFocusedFixtureItem('focused-post-submit-item-1', 'Replace damaged faucet', 'Living Room'),
    ]),
  ];

  const nextInspections = [
    ...inspections.filter(
      (inspection) =>
        ![
          'focused-fixture-inspection-resume',
          'focused-fixture-inspection-completed',
          'focused-fixture-inspection-post-submit',
        ].includes(inspection.id),
    ),
    {
      id: 'focused-fixture-inspection-resume',
      orgId,
      unitId: resumeUnitId,
      title: 'Focused Resume Fixture Inspection',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      createdByUserId: userId,
      lastEditedByUserId: userId,
      photoIds: [],
      productIds: [],
      templateSnapshot: {
        layoutTemplateId: 'layout-2br-1ba-v1',
        layoutTemplateVersion: 1,
        checklistTemplateId: 'checklist-standard-turn-v1',
        checklistTemplateVersion: 1,
        generatedAt: now,
      },
      generatedSections: resumeSections,
      generatedItems: resumeSections.flatMap((section) => section.items),
    },
    {
      id: 'focused-fixture-inspection-completed',
      orgId,
      unitId: completedUnitId,
      title: 'Focused Completed Fixture Inspection',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
      createdByUserId: userId,
      lastEditedByUserId: userId,
      photoIds: [],
      productIds: [],
      templateSnapshot: {
        layoutTemplateId: 'layout-2br-1ba-v1',
        layoutTemplateVersion: 1,
        checklistTemplateId: 'checklist-standard-turn-v1',
        checklistTemplateVersion: 1,
        generatedAt: now,
      },
      generatedSections: completedSections,
      generatedItems: completedSections.flatMap((section) => section.items),
    },
    {
      id: 'focused-fixture-inspection-post-submit',
      orgId,
      unitId: postSubmitUnitId,
      title: 'Focused Post Submit Fixture Inspection',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      createdByUserId: userId,
      lastEditedByUserId: userId,
      photoIds: [],
      productIds: [],
      templateSnapshot: {
        layoutTemplateId: 'layout-1br-1ba-v1',
        layoutTemplateVersion: 1,
        checklistTemplateId: 'checklist-standard-turn-v1',
        checklistTemplateVersion: 1,
        generatedAt: now,
      },
      generatedSections: postSubmitSections,
      generatedItems: postSubmitSections.flatMap((section) => section.items),
    },
  ];

  const nextLayouts = [
    ...storedLayouts.filter((layout) => layout.id !== 'layout-focused-broken-v1'),
    {
      id: 'layout-focused-broken-v1',
      orgId,
      name: 'Broken Focused Fixture Layout',
      slug: 'broken-focused-fixture-layout',
      isSystem: false,
      isActive: true,
      version: 1,
      unitType: 'apartment',
      bedrooms: 1,
      bathroomsFull: 1,
      bathroomsHalf: 0,
      defaultChecklistTemplateId: undefined,
      roomBlueprint: [
        {
          id: 'layout-focused-broken-room-living',
          roomType: 'living_room',
          label: 'Living Room',
          order: 10,
          required: true,
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const nextMappings = [
    ...storedMappings.filter((mapping) => mapping.id !== 'mapping-focused-broken-v1'),
    {
      id: 'mapping-focused-broken-v1',
      orgId,
      layoutTemplateId: 'layout-focused-broken-v1',
      checklistTemplateId: 'checklist-does-not-exist',
      isDefault: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  await writeKvValue(page, unitsKey, nextUnits);
  await writeKvValue(page, inspectionsKey, nextInspections);
  await writeKvValue(page, layoutsKey, nextLayouts);
  await writeKvValue(page, mappingsKey, nextMappings);
  await page.reload();
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
  await page.getByRole('button', { name: 'Templates', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Template Management' })).toBeVisible({ timeout: 20000 });

  await switchSession(page, 'Admin Demo');
  await expect(page.locator('header').getByText('Addison Admin', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seed Demo Data', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Feedback Management', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Templates', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retention & Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Templates', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Template Management' })).toBeVisible({ timeout: 20000 });
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
  await expect(page.getByRole('button', { name: 'Templates', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retention & Settings', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'All Products', exact: true }).click();
  await expect(page.getByText(/Read-only catalog view\. Admin or developer access is required to manage products\./i)).toBeVisible({ timeout: 20000 });
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

test('new inspection modal stays usable at constrained viewport height', async ({ page }) => {
  test.setTimeout(240000);
  const consoleMessages = [];

  await page.setViewportSize({ width: 1280, height: 620 });
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await signInDeveloperAndSeed(page, consoleMessages);
  await dismissFeedbackIfOpen(page);

  await page.locator('header').getByRole('button', { name: 'Full Mode', exact: true }).click();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /See what needs attention now and route directly into the work/i })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Open Portfolio' }).first().click();
  await expect(page.getByRole('heading', { name: /Browse units and decide where work should happen next/i })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Open Unit Workspace' }).click();
  await expect(page.getByRole('heading', { name: /Follow one unit through inspection, scope, procurement, vendor work, and verification/i })).toBeVisible({ timeout: 20000 });
  await page.getByTestId('unit-workspace-tab-inspection').click();
  await page.getByRole('button', { name: 'Start inspection' }).first().click();
  await expect(page.getByRole('heading', { name: 'Inspection queue' })).toBeVisible({ timeout: 20000 });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: 'New Inspection' }).click();

  const modalHeading = page.getByRole('heading', { name: 'New Inspection' }).last();
  const createWithLayoutButton = page.getByRole('button', { name: 'Create With Layout' });
  await expect(modalHeading).toBeVisible({ timeout: 20000 });
  await expect(createWithLayoutButton).toBeVisible({ timeout: 20000 });
  const createWithoutTemplateButton = page.getByRole('button', { name: 'Create Without Template' });
  await expect(createWithoutTemplateButton).toBeVisible({ timeout: 20000 });
  const primaryButtonBox = await createWithLayoutButton.boundingBox();
  const secondaryButtonBox = await createWithoutTemplateButton.boundingBox();

  expect(primaryButtonBox).toBeTruthy();
  expect(secondaryButtonBox).toBeTruthy();
  expect(primaryButtonBox.y + primaryButtonBox.height).toBeLessThanOrEqual(620);
  expect(secondaryButtonBox.y + secondaryButtonBox.height).toBeLessThanOrEqual(620);
  expect(primaryButtonBox.y).toBeGreaterThanOrEqual(0);
  expect(secondaryButtonBox.y).toBeGreaterThanOrEqual(0);
});

test('focused role, storage, and restore integrity audit', async ({ page }) => {
  test.setTimeout(240000);
  const consoleMessages = [];

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await signInDeveloperAndSeed(page, consoleMessages);
  await installFocusedValidationFixtures(page);
  await dismissFeedbackIfOpen(page);

  await page.getByTestId('focused-home-start-inspection').click();
  await expect(page.getByTestId('focused-unit-select-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-unit-search').fill('Focused Resume Fixture');
  await page.getByTestId('focused-unit-action-focused-fixture-unit-resume').click();
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Bedroom 2' }).click();
  await page.getByTestId('focused-inspection-screen').getByRole('button', { name: 'Repair' }).first().click();
  await expect(page.getByTestId('focused-continuity-hint')).toContainText(/Choose a product and save materials when you are ready/i);

  const focusedStorageState = await page.evaluate(() => {
    const storageKey = 'unitflip:focused-workflow:developer';
    return {
      local: window.localStorage.getItem(storageKey),
      session: window.sessionStorage.getItem(storageKey),
    };
  });
  expect(focusedStorageState.local).toBeTruthy();
  expect(focusedStorageState.session).toBeTruthy();
  const parsedLocal = JSON.parse(focusedStorageState.local);
  const parsedSession = JSON.parse(focusedStorageState.session);
  expect(parsedLocal.inspectionId).toBe('focused-fixture-inspection-resume');
  expect(parsedSession.inspectionId).toBe('focused-fixture-inspection-resume');
  expect(parsedLocal.roomId).toBe('Bedroom 2');
  expect(parsedSession.roomId).toBe('Bedroom 2');

  await switchSession(page, 'Admin Demo');
  await ensureFocusedHome(page);
  if ((await page.getByTestId('focused-home-start-inspection').count()) > 0) {
    await expect(page.getByTestId('focused-home-start-inspection')).toBeVisible();
    await page.getByTestId('focused-home-start-inspection').click();
  }
  await expect(page.getByTestId('focused-unit-select-screen')).toBeVisible({ timeout: 20000 });

  await switchSession(page, 'Manager Demo');
  await ensureFocusedHome(page);
  if ((await page.getByTestId('focused-home-start-inspection').count()) > 0) {
    await expect(page.getByTestId('focused-home-start-inspection')).toBeVisible();
    await page.getByTestId('focused-home-start-inspection').click();
  }
  await expect(page.getByTestId('focused-unit-select-screen')).toBeVisible({ timeout: 20000 });

  await switchSession(page, 'Vendor Demo');
  await ensureFocusedHome(page);
  await expect(page.getByTestId('focused-home-start-inspection')).toBeDisabled();
  if ((await page.getByTestId('focused-home-process-materials').count()) > 0) {
    await expect(page.getByTestId('focused-home-process-materials')).toBeVisible();
    await page.getByTestId('focused-home-process-materials').click();
  }
  await expect(page.getByRole('heading', { name: 'Procurement Workspace' })).toBeVisible({ timeout: 20000 });
});

test('focused storage corruption and divergence audit', async ({ page }) => {
  test.setTimeout(240000);
  const consoleMessages = [];

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await signInDeveloperAndSeed(page, consoleMessages);
  await installFocusedValidationFixtures(page);
  await dismissFeedbackIfOpen(page);

  await page.getByTestId('focused-home-start-inspection').click();
  await expect(page.getByTestId('focused-unit-select-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-unit-search').fill('Focused Resume Fixture');
  await page.getByTestId('focused-unit-action-focused-fixture-unit-resume').click();
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Bedroom 2' }).click();
  await page.getByTestId('focused-item-focused-resume-item-2').getByRole('button', { name: 'Repair' }).click();

  const storedResumeState = await readFocusedStorage(page, 'developer');
  expect(storedResumeState.local).toBeTruthy();
  expect(storedResumeState.session).toBeTruthy();
  const validFocusedSession = JSON.parse(storedResumeState.local);

  await writeFocusedStorageBranchesAndReload(page, { local: '{"broken"', session: storedResumeState.session }, 'developer');
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Bedroom 2' })).toHaveClass(/bg-blue-50/);

  await writeFocusedStorageBranchesAndReload(page, { local: storedResumeState.local, session: '{"broken"' }, 'developer');
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Bedroom 2' })).toHaveClass(/bg-blue-50/);

  await stageFocusedStorageBranchesForNextLoad(
    page,
    {
      local: JSON.stringify({
        intent: 'inspection',
        step: 'inspection',
        roomId: 'Bedroom 2',
      }),
      session: JSON.stringify({
        intent: 'inspection',
        step: 'inspection',
        roomId: 'Bedroom 2',
      }),
    },
    'developer',
  );
  await page.reload();
  await expectFocusedSafeSurface(page);
  await expect
    .poll(async () => {
      const homeVisible = await page.getByRole('heading', { name: 'Simple inspection and materials flow.' }).isVisible().catch(() => false);
      const selectVisible = await page.getByTestId('focused-unit-select-screen').isVisible().catch(() => false);
      return homeVisible || selectVisible;
    })
    .toBe(true);
  await expect(page.getByTestId('focused-inspection-screen')).toHaveCount(0);

  await writeFocusedStorageBranchesAndReload(
    page,
    {
      local: JSON.stringify(validFocusedSession),
      session: JSON.stringify({
        intent: 'inspection',
        step: 'inspection',
        unitId: 'focused-fixture-unit-start',
      }),
    },
    'developer',
  );
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Bedroom 2' })).toHaveClass(/bg-blue-50/);

  await writeFocusedStorageAndReload(
    page,
    {
      ...validFocusedSession,
      intent: 'materials',
      step: 'materials',
      submissionState: {
        inspectionId: 'focused-fixture-inspection-resume',
        outcome: 'submitted',
        unitName: 'Focused Resume Fixture',
        itemCount: 1,
        estimatedTotal: 0,
        requirementIds: ['missing-requirement-id'],
        nextStep: 'Review procurement.',
        detail: 'Stale requirement ids.',
      },
    },
    'developer',
  );
  await expectFocusedSafeSurface(page);
  await expect
    .poll(async () => {
      const materialsVisible = await page.getByTestId('focused-materials-screen').isVisible().catch(() => false);
      const inspectionVisible = await page.getByTestId('focused-inspection-screen').isVisible().catch(() => false);
      return materialsVisible || inspectionVisible;
    })
    .toBe(true);
  await expect(page.getByTestId('focused-submission-status')).toHaveCount(0);

  await writeFocusedStorageAndReload(
    page,
    {
      intent: 'inspection',
      step: 'inspection',
      inspectionId: 'missing-inspection-id',
      unitId: 'focused-fixture-unit-resume',
      roomId: 'Bedroom 2',
    },
    'developer',
  );
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Bedroom 2' })).toHaveClass(/bg-blue-50/);

  await writeFocusedStorageBranchesAndReload(page, { local: null, session: JSON.stringify(validFocusedSession) }, 'developer');
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });

  await writeFocusedStorageBranchesAndReload(page, { local: JSON.stringify(validFocusedSession), session: null }, 'developer');
  await expectFocusedSafeSurface(page);

  const recoveredState = await readFocusedStorage(page, 'developer');
  expect(recoveredState.local).toBeTruthy();
  expect(recoveredState.session).toBeTruthy();
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
  await page.getByLabel('Unit name').fill('Focused Demo Unit 101');
  await page.getByLabel('Unit code').fill('FOCUS-DUPE');
  await page.getByLabel('Address').fill('1200 Harbor View Dr');
  await page.getByTestId('focused-layout-template-select').selectOption({ label: '2 Bed / 1 Bath' });
  await page.getByTestId('focused-create-unit').click();
  await continueIfDuplicateModalVisible(page);
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Bedroom 2' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Bathroom' })).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-inspection-screen').getByRole('button', { name: 'Repair' }).first().click();
  await page.getByTestId('focused-inspection-screen').locator('select').first().selectOption({ index: 1 });
  await page.getByRole('button', { name: /Add to Materials|Update Materials/ }).first().click();
  await expect(page.getByText(/Materials list updated automatically|Focused inspection is ready for the next step|Saved\. Next item is ready/i).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Review Summary' }).first().click();
  await expect(page.getByTestId('focused-summary-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Room summaries/i)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Missing or incomplete/i)).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-summary-screen').getByRole('button', { name: 'View Materials' }).click();
  await expect(page.getByTestId('focused-materials-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Total estimated cost:/i)).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-submit-to-procurement').click();
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
    await expect(page.getByTestId('inspection-detail-header')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Opened from Dashboard/i).first()).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Dashboard', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: /See what needs attention now and route directly into the work/i })).toBeVisible({ timeout: 20000 });
  }
  await expect(page.getByText(/Unit complete/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'Open Portfolio' }).first().click();

  await expect(page.getByRole('heading', { name: /Browse units and decide where work should happen next/i })).toBeVisible({ timeout: 20000 });
  await page.getByPlaceholder(/Search facilities, buildings, units/i).fill('MR-A-102');
  await page.getByRole('button', { name: /MR-A-102/i }).first().click();
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
  await page.getByRole('button', { name: 'Open Procurement', exact: true }).click();
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
  const editInspectionHeader = page.getByTestId('inspection-detail-header');
  const inspectionHomeHeading = page.getByRole('heading', { name: 'Start or continue inspection work.' });
  if (await editInspectionHeader.isVisible({ timeout: 5000 }).catch(() => false)) {
    await expect(editInspectionHeader).toBeVisible({ timeout: 20000 });
  } else {
    await expect(inspectionHomeHeading).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /Focused Inspection/i }).first().click();
    await expect(editInspectionHeader).toBeVisible({ timeout: 20000 });
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
  await expect(page.getByTestId('inspection-detail-header')).toBeVisible({ timeout: 20000 });
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
  const vendorQueueItem = page.getByTestId(/vendor-queue-item-/).first();
  if ((await vendorQueueItem.count()) > 0) {
    await expect(vendorQueueItem).toBeVisible({ timeout: 20000 });
    const assignedVendorLabel = vendorQueueItem.getByText(/Assigned to /i).first();
    if ((await assignedVendorLabel.count()) > 0) {
      await expect(assignedVendorLabel).toContainText(/Val Vendor/i);
    }
    await expect(page.getByText(/Selected procurement product for this assigned work/i).first()).toBeVisible({ timeout: 20000 });
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
  } else {
    await expect(page.getByText(/No vendor work is assigned right now/i).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Internal users still need to assign activated work before anything appears here/i).first()).toBeVisible({ timeout: 20000 });
  }

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
  await page.getByLabel('Unit name').fill('Focused Post Submit Unit 101');
  await page.getByLabel('Unit code').fill('FOCUS-POST-1');
  await page.getByLabel('Address').fill('1200 Harbor View Dr');
  await page.getByTestId('focused-layout-template-select').selectOption({ label: '2 Bed / 1 Bath' });
  await page.getByTestId('focused-create-unit').click();
  await continueIfDuplicateModalVisible(page);
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-inspection-screen').getByRole('button', { name: 'Repair' }).first().click();
  await page.getByTestId('focused-inspection-screen').locator('select').first().selectOption({ index: 1 });
  await page.getByRole('button', { name: /Add to Materials|Update Materials/ }).first().click();
  await expect(page.getByText(/Materials list updated automatically|Focused inspection is ready for the next step|Saved\. Next item is ready/i).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Saved locally and ready to continue|Saved on this device|Saved locally/i).last()).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-review-summary').click();
  await expect(page.getByTestId('focused-summary-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-summary-screen').getByRole('button', { name: 'View Materials' }).click({ force: true });
  await expect(page.getByTestId('focused-materials-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-submit-to-procurement').click();
  await expect(page.getByTestId('focused-submission-status')).toContainText(/Submitted successfully/i);
  await expect(page.getByTestId('focused-submission-status')).toContainText(/You are done here unless you want to act in Procurement immediately or start the next unit/i);
  await expect(page.getByTestId('focused-post-submit-start-another')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('focused-post-submit-unit-list')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-post-submit-start-another').click();
  await expect(page.getByTestId('focused-unit-select-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByLabel('Unit name')).toHaveValue('');
  await dismissFeedbackIfOpen(page);

  await page.getByLabel('Unit name').fill('Focused Post Submit Unit 102');
  await page.getByLabel('Unit code').fill('FOCUS-POST-2');
  await page.getByLabel('Address').fill('1200 Harbor View Dr');
  await page.getByTestId('focused-layout-template-select').selectOption({ label: '2 Bed / 1 Bath' });
  await page.getByTestId('focused-create-unit').click();
  await continueIfDuplicateModalVisible(page);
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-inspection-screen').getByRole('button', { name: 'Repair' }).first().click();
  await page.getByTestId('focused-inspection-screen').locator('select').first().selectOption({ index: 1 });
  await page.getByRole('button', { name: /Add to Materials|Update Materials/ }).first().click();
  await expect(page.getByText(/Materials list now includes|Materials list updated automatically|Focused inspection is ready for the next step|Saved\. Next item is ready/i).first()).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-review-summary').click();
  await expect(page.getByTestId('focused-summary-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-summary-screen').getByRole('button', { name: 'View Materials' }).click({ force: true });
  await expect(page.getByTestId('focused-materials-screen')).toBeVisible({ timeout: 20000 });
  await page.context().setOffline(true);
  await page.getByTestId('focused-submit-to-procurement').click();
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

  await page.getByLabel('Unit name').fill('Focused Post Submit Unit 103');
  await page.getByLabel('Unit code').fill('FOCUS-POST-3');
  await page.getByLabel('Address').fill('1200 Harbor View Dr');
  await page.getByTestId('focused-layout-template-select').selectOption({ label: '2 Bed / 1 Bath' });
  await page.getByTestId('focused-create-unit').click();
  await continueIfDuplicateModalVisible(page);
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-inspection-screen').getByRole('button', { name: 'Repair' }).first().click();
  await page.getByTestId('focused-inspection-screen').locator('select').first().selectOption({ index: 1 });
  await page.getByRole('button', { name: /Add to Materials|Update Materials/ }).first().click();
  await expect(page.getByText(/Materials list now includes|Materials list updated automatically|Focused inspection is ready for the next step|Saved\. Next item is ready/i).first()).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-review-summary').click();
  await expect(page.getByTestId('focused-summary-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-summary-screen').getByRole('button', { name: 'View Materials' }).click({ force: true });
  await expect(page.getByTestId('focused-materials-screen')).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    (window).__unitflipTestFlags = { forceFocusedSubmitFailureOnce: true };
  });
  await page.getByTestId('focused-submit-to-procurement').click();
  await expect(page.getByTestId('focused-submission-status')).toContainText(/Retry needed/i);
  await expect(page.getByTestId('focused-post-submit-retry')).toBeVisible({ timeout: 20000 });
});

test('focused launch, template recovery, and CTA audit', async ({ page }) => {
  test.setTimeout(240000);
  const consoleMessages = [];

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await signInDeveloperAndSeed(page, consoleMessages);
  await installFocusedValidationFixtures(page);
  await dismissFeedbackIfOpen(page);

  await expect(page.getByTestId('focused-home-start-inspection')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-home-start-inspection').click();
  await expect(page.getByTestId('focused-unit-select-screen')).toBeVisible({ timeout: 20000 });

  await page.getByTestId('focused-unit-search').fill('Focused Start Fixture');
  await expect(page.getByTestId('focused-unit-action-focused-fixture-unit-start')).toHaveText('Start Inspection');

  await page.getByTestId('focused-unit-search').fill('Focused Completed Fixture');
  await expect(page.getByTestId('focused-unit-action-focused-fixture-unit-completed')).toHaveText('Start New Inspection');
  await expect(page.getByRole('button', { name: 'Review Last Inspection' })).toBeVisible({ timeout: 20000 });

  await page.getByTestId('focused-unit-search').fill('Focused Broken Template Fixture');
  await page.getByTestId('focused-unit-action-focused-fixture-unit-broken-template').click();
  await expect(page.getByTestId('focused-template-recovery')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('focused-template-recovery')).toContainText(/Template required/i);
  await expect(page.getByTestId('focused-template-recovery')).toContainText(/Focused Broken Template Fixture/i);
  await page.getByTestId('focused-template-recovery-choose-another').click();
  await expect(page.getByTestId('focused-template-recovery')).toHaveCount(0);

  await page.getByTestId('focused-unit-action-focused-fixture-unit-broken-template').click();
  await expect(page.getByTestId('focused-template-recovery-unit-details')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-template-recovery-unit-details').click();
  await expect(page.getByRole('heading', { name: /Follow one unit through inspection, scope, procurement, vendor work, and verification/i })).toBeVisible({ timeout: 20000 });
});

test('focused continuity, focus preservation, and post-submit guidance audit', async ({ page }) => {
  test.setTimeout(240000);
  const consoleMessages = [];

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await signInDeveloperAndSeed(page, consoleMessages);
  await installFocusedValidationFixtures(page);
  await dismissFeedbackIfOpen(page);

  await page.getByTestId('focused-home-start-inspection').click();
  await expect(page.getByTestId('focused-unit-select-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-unit-search').fill('Focused Resume Fixture');
  await page.getByTestId('focused-unit-action-focused-fixture-unit-resume').click();
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Bedroom 2' }).click();
  await page.getByTestId('focused-inspection-screen').getByRole('button', { name: 'Repair' }).first().click();
  await expect(page.getByTestId('focused-continuity-hint')).toContainText(/Choose a product and save materials when you are ready/i);
  await expect(page.getByRole('button', { name: 'Bedroom 2' })).toHaveClass(/bg-blue-50/);
  await page.reload();
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Bedroom 2' })).toHaveClass(/bg-blue-50/);
  await page.getByTestId('focused-product-select-focused-resume-item-2').selectOption({ index: 1 });
  await expect(page.getByTestId('focused-product-select-focused-resume-item-2')).not.toHaveValue('');
  await page.getByTestId('focused-add-material-focused-resume-item-2').click();
  await expect(page.getByText(/Materials list updated automatically|Materials list now includes/i).first()).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-view-materials-primary').click();
  await expect(page.getByTestId('focused-materials-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-submit-to-procurement').click();
  await expect(page.getByTestId('focused-submission-status')).toContainText(/Submitted successfully/i);
  await expect(page.getByTestId('focused-post-submit-start-another')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('focused-post-submit-unit-list')).toBeVisible({ timeout: 20000 });
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
  await page.getByRole('button', { name: 'Dashboard', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /See what needs attention now and route directly into the work/i })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Open Portfolio' }).first().click();
  await expect(page.getByRole('heading', { name: /Browse units and decide where work should happen next/i })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('portfolio-template-status')).toContainText(/Template ready/i);
  await page.getByRole('button', { name: 'Manage Record' }).click();
  await expect(page.getByText(/Unit record management/i)).toBeVisible({ timeout: 20000 });
  await page.getByTestId('unit-record-template-select').selectOption('');
  await page.getByRole('button', { name: 'Save Unit Details' }).click();
  await page.getByRole('button', { name: 'Back to Portfolio' }).click();
  await expect(page.getByTestId('portfolio-template-status')).toContainText(/Suggested template/i);
  await expect(page.getByTestId('portfolio-apply-suggested-template')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('portfolio-apply-suggested-template').click();
  await expect(page.getByTestId('portfolio-template-status')).toContainText(/Template ready/i);
  await page.locator('header').getByRole('button', { name: /Focused/i }).click();
  await page.getByTestId('focused-home-start-inspection').click();
  await expect(page.getByTestId('focused-unit-select-screen')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('focused-unit-search').fill('MR-A-102');
  await page.getByTestId(/focused-unit-action-/).first().click();
  await expect(page.getByTestId('focused-inspection-screen')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Living Room' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Kitchen' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Bedroom 1' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Bathroom' })).toBeVisible({ timeout: 20000 });
  await page.locator('header').getByRole('button', { name: 'Full Mode', exact: true }).click();
  await page.getByRole('button', { name: 'Portfolio', exact: true }).first().click();
  await expect(page.getByTestId('portfolio-template-status')).toContainText(/Template ready/i);

  await expect(page.getByRole('heading', { name: /Browse units and decide where work should happen next/i })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Selected Unit/i)).toBeVisible({ timeout: 20000 });
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
    await expect(page.getByTestId('inspection-detail-header')).toBeVisible({ timeout: 20000 });
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

test('imported product auto-category assignment audit', async ({ page }) => {
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
  await page.getByRole('button', { name: 'All Products', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Product Catalog' })).toBeVisible({ timeout: 20000 });

  await page.getByTestId('product-manager-catalog-import').click();
  await expect(page.getByRole('heading', { name: 'Catalog Import' })).toBeVisible({ timeout: 20000 });
  await page.getByTestId('catalog-import-mode-paste').click();
  await page.getByTestId('catalog-import-paste-input').fill([
    'QA Decorator Wall Plate | Current House | QA-PLATE | Electrical & Lighting > Switches & Outlets | qa-wall-plate | switch;outlet;cover | 7.99',
    'QA Cordless Faux Wood Blind 35x64 | Window Supply Co. | QA-BLIND |  | qa-blind | blind;window;bedroom | 39.99',
    'QA Refresh Bundle | Turn Supply Co. | QA-REFRESH-1 |  | qa-refresh | refresh;bundle | 14.99',
  ].join('\n'));
  await page.getByTestId('catalog-import-submit').click();
  await expect(page.getByTestId('catalog-import-status')).toContainText(/Imported 3 products/i);
  await expect(page.getByTestId('catalog-import-status')).toContainText(/auto-assigned 2/i);
  await expect(page.getByTestId('catalog-import-status')).toContainText(/flagged 2 for review/i);
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByTestId('product-manager-quality-filter').selectOption('needs_category_review');
  await expect(page.getByText('QA Refresh Bundle').first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('row', { name: /QA Refresh Bundle/i }).dispatchEvent('click');
  await page.getByTestId('product-inspector-category-select').first().selectOption({ label: 'Cleaning & Turnover Supplies' });
  await page.getByTestId('product-inspector-subcategory-select').first().selectOption({ label: 'Cleaning Chemicals' });
  await page.getByTestId('product-inspector-remember-category').first().dispatchEvent('click');
  await expect(page.getByText(/manual review/i).first()).toBeVisible({ timeout: 20000 });

  await page.getByTestId('product-manager-catalog-import').click();
  await page.getByTestId('catalog-import-mode-paste').click();
  await page.getByTestId('catalog-import-paste-input').fill(
    'QA Refresh Bundle | Turn Supply Co. | QA-REFRESH-2 |  | qa-refresh-repeat | refresh;bundle | 16.99'
  );
  await page.getByTestId('catalog-import-submit').click();
  await expect(page.getByTestId('catalog-import-status')).toContainText(/Imported 1 products/i);
  await expect(page.getByTestId('catalog-import-status')).toContainText(/flagged 0 for review/i);
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByTestId('product-manager-quality-filter').selectOption('all');
  await page.getByPlaceholder(/Search products/i).fill('QA Refresh Bundle');
  await page.getByRole('row', { name: /QA Refresh Bundle/i }).last().dispatchEvent('click');
  await expect(page.getByText(/org memory|manual review/i).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Cleaning & Turnover Supplies / Cleaning Chemicals').first()).toBeVisible({ timeout: 20000 });
});

test('catalog review intelligence audit', async ({ page }) => {
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
  await page.getByRole('button', { name: 'All Products', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Product Catalog' })).toBeVisible({ timeout: 20000 });

  await page.getByTestId('catalog-review-show-flagged').click();
  await expect(page.getByTestId('product-manager-quality-filter')).toHaveValue('flagged_imports');
  await expect(page.getByText(/groups missing tiers/i).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Clean groups/i).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Almost done/i).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Blocked/i).first()).toBeVisible({ timeout: 20000 });

  await page.getByPlaceholder(/Search products/i).fill('Low confidence detector battery sample');
  await page.getByRole('row', { name: /Low confidence detector battery sample/i }).dispatchEvent('click');
  await expect(page.getByTestId('catalog-review-signal-panel').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('catalog-review-group-completion').first()).toContainText(/Blocked|Needs review|Almost done|Clean/i);
  await expect(page.getByTestId('catalog-review-sibling-scope').first()).toContainText(/Sibling cleanup scope/i);
  await expect(page.getByTestId('catalog-review-copy-category-to-siblings').first()).toContainText(/\(\d+\)/);
  await expect(page.locator('[data-testid^="catalog-review-sibling-category-diff-"]').first()).toContainText(/Category:/i);
  await expect(page.locator('[data-testid^="catalog-review-sibling-hints-diff-"]').first()).toContainText(/Hints:/i);
  await expect(page.getByTestId('catalog-review-sibling-scope').first()).toContainText(/already matches|no change|No cleanup needed/i);
  await expect(page.getByText(/Imported assignment confidence is/i).first()).toBeVisible({ timeout: 20000 });
  await page.getByTestId('catalog-review-focus-group').first().dispatchEvent('click');
  await expect(page.getByTestId('product-manager-review-group-filter')).not.toHaveValue('all');

  await page.getByTestId('product-inspector-category-select').first().selectOption({ label: 'Cleaning & Turnover Supplies' });
  await page.getByTestId('product-inspector-subcategory-select').first().selectOption({ label: 'Cleaning Chemicals' });
  await page.getByTestId('catalog-review-copy-category-to-siblings').first().dispatchEvent('click');
  await expect(page.getByTestId('catalog-review-cleanup-feedback').first()).toContainText(/Applied category changes to/i);
  await expect(page.getByTestId('catalog-review-group-completion').first()).toContainText(/still blocks completion|issues left|rows still flagged|last remaining issue/i);
  await expect(page.getByTestId('product-manager-review-group-filter')).not.toHaveValue('all');

  await page.getByPlaceholder(/Search products/i).fill('Missing source detector battery sample');
  await page.getByRole('row', { name: /Missing source detector battery sample/i }).dispatchEvent('click');
  await expect(page.getByText('Cleaning & Turnover Supplies / Cleaning Chemicals').first()).toBeVisible({ timeout: 20000 });
});
