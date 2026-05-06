type ReportRecord = Record<string, unknown>;

interface ReportSnapshotLike {
  generatedAt?: number;
  findings?: ReportRecord[];
  repairTasks?: ReportRecord[];
  materialRequirements?: ReportRecord[];
  summary?: {
    findings?: {
      total?: number;
    };
    repairTasks?: {
      total?: number;
    };
    materialRequirements?: {
      total?: number;
    };
  };
}

interface InspectionLike {
  id: string;
  title: string;
  status: string;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
  photoCount?: number;
}

interface UnitLike {
  id: string;
  name: string;
  unitCode?: string;
  facilityName?: string;
  buildingName?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatTimestamp = (value?: number) => {
  if (!value) return 'Not available';
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const countFromSnapshot = (
  directItems: ReportRecord[] | undefined,
  summaryCount: number | undefined
) => directItems?.length ?? summaryCount ?? 0;

const renderIdentityRow = (label: string, value?: string | number | null) => `
  <div class="identity-row">
    <dt>${escapeHtml(label)}</dt>
    <dd>${escapeHtml(value || 'Not provided')}</dd>
  </div>
`;

const renderMaterialList = (materials: ReportRecord[] | undefined) => {
  if (!materials || materials.length === 0) {
    return '<p class="muted">No material requirements were included in this snapshot.</p>';
  }

  return `
    <ul class="material-list">
      ${materials
        .map((material) => {
          const label = material.itemDescription || material.description || material.title || 'Material requirement';
          const quantity = material.quantity ?? 1;
          const unit = material.unit || 'ea';
          const status = material.status || 'scoped';
          return `
            <li>
              <span>${escapeHtml(label)}</span>
              <small>${escapeHtml(quantity)} ${escapeHtml(unit)} · ${escapeHtml(status)}</small>
            </li>
          `;
        })
        .join('')}
    </ul>
  `;
};

export const renderInspectionReportHtml = (params: {
  orgId: string;
  reportId: string;
  inspectionId: string;
  inspection?: InspectionLike;
  unit?: UnitLike;
  snapshot?: ReportSnapshotLike;
}) => {
  const { orgId, reportId, inspectionId, inspection, unit, snapshot } = params;
  const generatedAt = snapshot?.generatedAt || Date.now();
  const findingsCount = countFromSnapshot(snapshot?.findings, snapshot?.summary?.findings?.total);
  const repairTaskCount = countFromSnapshot(snapshot?.repairTasks, snapshot?.summary?.repairTasks?.total);
  const materialCount = countFromSnapshot(
    snapshot?.materialRequirements,
    snapshot?.summary?.materialRequirements?.total
  );
  const address = [unit?.address1, unit?.address2, unit?.city, unit?.state, unit?.zip].filter(Boolean).join(', ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(inspection?.title || 'UnitFlip Inspection Report')}</title>
    <style>
      body {
        margin: 0;
        background: #f8fafc;
        color: #0f172a;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        max-width: 920px;
        margin: 0 auto;
        padding: 32px 20px;
      }
      .panel {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #ffffff;
        padding: 24px;
      }
      h1,
      h2 {
        margin: 0;
      }
      h1 {
        font-size: 28px;
        line-height: 1.2;
      }
      h2 {
        margin-top: 28px;
        font-size: 18px;
      }
      .muted {
        color: #64748b;
      }
      .identity-grid,
      .metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-top: 20px;
      }
      .identity-row,
      .metric {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 12px;
      }
      dt,
      .metric-label {
        color: #64748b;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }
      dd,
      .metric-value {
        margin: 6px 0 0;
        font-size: 16px;
        font-weight: 700;
      }
      .material-list {
        margin: 12px 0 0;
        padding: 0;
        list-style: none;
      }
      .material-list li {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        border-top: 1px solid #e2e8f0;
        padding: 10px 0;
      }
      small {
        color: #64748b;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <p class="muted">UnitFlip report artifact</p>
        <h1>${escapeHtml(inspection?.title || 'Inspection Report')}</h1>
        <p class="muted">Generated ${escapeHtml(formatTimestamp(generatedAt))}</p>

        <dl class="identity-grid">
          ${renderIdentityRow('Organization', orgId)}
          ${renderIdentityRow('Report', reportId)}
          ${renderIdentityRow('Inspection', inspection?.id || inspectionId)}
          ${renderIdentityRow('Inspection Status', inspection?.status)}
          ${renderIdentityRow('Unit', unit?.name)}
          ${renderIdentityRow('Unit Code', unit?.unitCode)}
          ${renderIdentityRow('Property', unit?.facilityName || unit?.buildingName)}
          ${renderIdentityRow('Address', address)}
        </dl>

        <div class="metrics">
          <div class="metric">
            <div class="metric-label">Findings</div>
            <div class="metric-value">${escapeHtml(findingsCount)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Repair Tasks</div>
            <div class="metric-value">${escapeHtml(repairTaskCount)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Materials</div>
            <div class="metric-value">${escapeHtml(materialCount)}</div>
          </div>
        </div>

        <h2>Material Requirements</h2>
        ${renderMaterialList(snapshot?.materialRequirements)}
      </section>
    </main>
  </body>
</html>`;
};
