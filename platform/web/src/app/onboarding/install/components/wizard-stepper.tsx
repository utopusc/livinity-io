"use client";

export default function WizardStepper({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div key={n} className="flex flex-1 items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
              n === current
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                : n < current
                ? "bg-emerald-500 text-white"
                : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
            }`}
          >
            {n < current ? "✓" : n}
          </div>
          {n < total && (
            <div
              className={`h-0.5 flex-1 ${
                n < current ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-700"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
