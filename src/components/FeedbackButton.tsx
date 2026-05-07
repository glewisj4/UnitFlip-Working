import React from 'react';
import { MessageSquareWarning } from 'lucide-react';

interface FeedbackButtonProps {
  onClick: () => void;
  compactOnMobile?: boolean;
}

export const FeedbackButton: React.FC<FeedbackButtonProps> = ({ onClick, compactOnMobile = false }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`fixed z-20 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-800 shadow-lg transition-colors hover:bg-slate-50 ${
        compactOnMobile
          ? 'bottom-14 right-3 h-10 w-10 justify-center px-0 py-0 md:bottom-5 md:right-5 md:h-auto md:w-auto md:justify-start md:px-4 md:py-3'
          : 'bottom-5 right-5 px-4 py-3'
      }`}
    >
      <MessageSquareWarning size={16} />
      <span className={compactOnMobile ? 'hidden md:inline' : undefined}>Feedback</span>
    </button>
  );
};
