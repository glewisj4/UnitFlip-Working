import React from 'react';
import { MessageSquareWarning } from 'lucide-react';

interface FeedbackButtonProps {
  onClick: () => void;
}

export const FeedbackButton: React.FC<FeedbackButtonProps> = ({ onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-5 right-5 z-20 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-lg transition-colors hover:bg-slate-50"
    >
      <MessageSquareWarning size={16} />
      Feedback
    </button>
  );
};
