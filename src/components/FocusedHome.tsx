import React from 'react';
import { ClipboardList, PackageCheck } from 'lucide-react';

interface FocusedHomeProps {
  canStartInspection: boolean;
  canProcessMaterials: boolean;
  onStartInspection: () => void;
  onProcessMaterials: () => void;
}

const actionCardClass =
  'flex min-h-[220px] flex-col justify-between rounded-[28px] border border-slate-200 bg-white p-8 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-lowes-blue hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0';

export const FocusedHome: React.FC<FocusedHomeProps> = ({
  canStartInspection,
  canProcessMaterials,
  onStartInspection,
  onProcessMaterials,
}) => {
  return (
    <section data-testid="focused-home-screen" className="mx-auto max-w-5xl space-y-8">
      <div className="rounded-[32px] border border-slate-200 bg-white px-8 py-10 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Focused Mode</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Simple inspection and materials flow.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
          Start a unit inspection, build the materials list inline, review the summary, and hand materials forward without opening the full operations workspace.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <button data-testid="focused-home-start-inspection" type="button" onClick={onStartInspection} disabled={!canStartInspection} className={actionCardClass}>
          <div className="space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-lowes-blue">
              <ClipboardList size={24} />
            </div>
            <div>
              <div className="text-2xl font-semibold text-slate-900">Start Inspection</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Choose or add a unit, walk rooms quickly, attach notes and photos inline, and build the materials list as you go.
              </p>
            </div>
          </div>
          <div className="text-sm font-medium text-slate-500">
            {canStartInspection ? 'Create or resume a focused inspection.' : 'Inspection is unavailable for the current role.'}
          </div>
        </button>

        <button data-testid="focused-home-process-materials" type="button" onClick={onProcessMaterials} disabled={!canProcessMaterials} className={actionCardClass}>
          <div className="space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <PackageCheck size={24} />
            </div>
            <div>
              <div className="text-2xl font-semibold text-slate-900">Process Materials</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Review the current materials list, confirm cost, and submit work into the existing procurement path with less navigation.
              </p>
            </div>
          </div>
          <div className="text-sm font-medium text-slate-500">
            {canProcessMaterials ? 'Open the focused materials review flow.' : 'Materials processing is unavailable for the current role.'}
          </div>
        </button>
      </div>
    </section>
  );
};
