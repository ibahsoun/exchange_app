import { Clock } from 'lucide-react';

export function SettlementTermsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full -mt-12">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
        <Clock className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-xl font-bold mb-2">Settlement Terms</h1>
      <p className="text-text-muted text-sm text-center max-w-md leading-relaxed">
        This section will allow you to configure settlement terms for transactions
        — e.g. Today, Tomorrow, Next Week, Next Month — with rate adjustments
        for each term.
      </p>
      <div className="mt-6 px-4 py-2.5 rounded-lg bg-status-blue-subtle border border-status-blue/20 text-status-blue text-xs font-medium">
        Coming Soon
      </div>
    </div>
  );
}
