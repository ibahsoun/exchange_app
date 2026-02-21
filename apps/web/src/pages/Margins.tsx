import { Percent } from 'lucide-react';

export function MarginsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full -mt-12">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
        <Percent className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-xl font-bold mb-2">Margins</h1>
      <p className="text-text-muted text-sm text-center max-w-md leading-relaxed">
        This section will allow you to define fee tiers based on transaction
        amount ranges — e.g. $1–$10,000 at 1%, $10,001–$50,000 at 0.5%, etc.
      </p>
      <div className="mt-6 px-4 py-2.5 rounded-lg bg-status-blue-subtle border border-status-blue/20 text-status-blue text-xs font-medium">
        Coming Soon
      </div>
    </div>
  );
}
