import React from 'react';
import { ClipboardList, PackageCheck } from 'lucide-react';
import { FocusedTopControlBar } from './FocusedTopControlBar';

interface FocusedHomeProps {
  canStartInspection: boolean;
  canProcessMaterials: boolean;
  onStartInspection: () => void;
  onProcessMaterials: () => void;
  onSwitchFullMode: () => void;
}

const actionCardClass =
  'flex min-h-[180px] flex-col justify-between rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-lowes-blue hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0';

export const FocusedHome: React.FC<FocusedHomeProps> = ({
  canStartInspection,
  canProcessMaterials,
  onStartInspection,
  onProcessMaterials,
  onSwitchFullMode,
}) => {
  return (
    <>
      <FocusedTopControlBar title="Focused Mode" onSwitchFullMode={onSwitchFullMode} />
      <section data-testid="focused-home-screen" className="mx-auto max-w-5xl space-y-4">
        <div className="space-y-1 px-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Focused Mode</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Start work fast.</h1>
          <p className="text-sm text-slate-600">Inspect a unit or move materials forward.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button data-testid="focused-home-start-inspection" type="button" onClick={onStartInspection} disabled={!canStartInspection} className={actionCardClass}>
            <div className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-lowes-blue">
                <ClipboardList size={20} />
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-900">Start Inspection</div>
                <p className="mt-1 text-sm text-slate-600">Choose a unit and continue the guided capture flow.</p>
              </div>
            </div>
            <div className="text-sm font-medium text-slate-500">
              {canStartInspection ? 'Primary action' : 'Inspection is unavailable for the current role.'}
            </div>
          </button>

          <button data-testid="focused-home-process-materials" type="button" onClick={onProcessMaterials} disabled={!canProcessMaterials} className={actionCardClass}>
            <div className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <PackageCheck size={20} />
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-900">Process Materials</div>
                <p className="mt-1 text-sm text-slate-600">Review the current materials list and hand it forward.</p>
              </div>
            </div>
            <div className="text-sm font-medium text-slate-500">
              {canProcessMaterials ? 'Secondary action' : 'Materials processing is unavailable for the current role.'}
            </div>
          </button>
        </div>
      </section>
    </>
  );
};
