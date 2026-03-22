import React from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';

export interface InspectionWorkspaceRoom {
  id: string;
  label: string;
  subtitle?: string;
  itemCount: number;
  checklistCount: number;
}

interface InspectionRoomWorkspaceProps {
  inspectionTitle: string;
  room: InspectionWorkspaceRoom | null;
  roomIndex: number;
  roomCount: number;
  onBack: () => void;
  onPreviousRoom: () => void;
  onNextRoom: () => void;
  onSelectRoom: (roomId: string) => void;
  rooms: InspectionWorkspaceRoom[];
  checklistSummaryLabel: string;
  captureStrip: React.ReactNode;
  checklistPanel: React.ReactNode;
  feed: React.ReactNode;
}

export const InspectionRoomWorkspace: React.FC<InspectionRoomWorkspaceProps> = ({
  inspectionTitle,
  room,
  roomIndex,
  roomCount,
  onBack,
  onPreviousRoom,
  onNextRoom,
  onSelectRoom,
  rooms,
  checklistSummaryLabel,
  captureStrip,
  checklistPanel,
  feed,
}) => {
  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Inspection Workspace</p>
            <h2 className="truncate text-xl font-bold text-slate-900">{inspectionTitle}</h2>
            <p className="text-sm text-slate-500">{checklistSummaryLabel}</p>
          </div>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          Room {roomCount === 0 ? 0 : roomIndex + 1} of {roomCount}
        </div>
      </div>

      <div className="rounded-2xl bg-slate-900 p-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Current Room</p>
            <h3 className="text-2xl font-bold">{room?.label || 'Unit Overview'}</h3>
            <p className="text-sm text-slate-300">
              {room?.subtitle || 'No room metadata available yet.'}
            </p>
          </div>
          <div className="text-right text-sm text-slate-300">
            <div>{room?.itemCount || 0} captured</div>
            <div>{room?.checklistCount || 0} checklist items</div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onPreviousRoom}
            disabled={roomCount <= 1}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
            Prev
          </button>
          <button
            type="button"
            onClick={onNextRoom}
            disabled={roomCount <= 1}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-40"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-2">
          {rooms.map((entry) => {
            const isActive = entry.id === room?.id;

            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelectRoom(entry.id)}
                className={`min-w-[140px] rounded-2xl border px-3 py-3 text-left transition-colors ${
                  isActive
                    ? 'border-lowes-blue bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                }`}
              >
                <p className="truncate text-sm font-semibold">{entry.label}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {entry.itemCount} captured • {entry.checklistCount} checks
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {captureStrip}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        {checklistPanel}
        {feed}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <button
          type="button"
          onClick={onPreviousRoom}
          disabled={roomCount <= 1}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 disabled:opacity-40"
        >
          <ChevronLeft size={16} />
          Previous Room
        </button>
        <button
          type="button"
          onClick={onNextRoom}
          disabled={roomCount <= 1}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 disabled:opacity-40"
        >
          Next Room
          <ChevronRight size={16} />
        </button>
      </div>
    </section>
  );
};
