'use client';

import { Languages, Check } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'tr', name: 'Turkce' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Francais' },
  { code: 'es', name: 'Espanol' },
];

export default function LanguageSection() {
  // For now, just show the language selector. i18n integration comes later.
  return (
    <div className="space-y-4">
      <p className="text-xs text-text-tertiary">Select interface language:</p>
      <div className="space-y-1">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-white/5"
          >
            <span className="text-text-secondary">{lang.name}</span>
            {lang.code === 'en' && <Check className="h-3.5 w-3.5 text-brand" />}
          </button>
        ))}
      </div>
    </div>
  );
}
