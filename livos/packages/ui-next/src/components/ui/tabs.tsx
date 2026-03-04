'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/* ── Context ──────────────────────────────────────────────────────────────── */

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabs must be used within Tabs');
  return ctx;
}

/* ── Root ─────────────────────────────────────────────────────────────────── */

interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

function Tabs({ value: controlledValue, defaultValue = '', onValueChange, children, className }: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = controlledValue ?? internalValue;
  const handleChange = onValueChange ?? setInternalValue;

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

/* ── TabsList ─────────────────────────────────────────────────────────────── */

function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-xl bg-surface-0 p-1',
        className,
      )}
      role="tablist"
      {...props}
    />
  );
}

/* ── TabsTrigger ──────────────────────────────────────────────────────────── */

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

function TabsTrigger({ value, className, children, ...props }: TabsTriggerProps) {
  const { value: selected, onValueChange } = useTabs();
  const isSelected = selected === value;

  return (
    <button
      role="tab"
      aria-selected={isSelected}
      className={cn(
        'relative rounded-lg px-3 py-1.5 text-body font-medium transition-colors cursor-pointer',
        isSelected ? 'text-text' : 'text-text-tertiary hover:text-text-secondary',
        className,
      )}
      onClick={() => onValueChange(value)}
      {...props}
    >
      {isSelected && (
        <motion.div
          className="absolute inset-0 rounded-lg bg-surface-2"
          layoutId="tabs-indicator"
          transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

/* ── TabsContent ──────────────────────────────────────────────────────────── */

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

function TabsContent({ value, className, ...props }: TabsContentProps) {
  const { value: selected } = useTabs();
  if (selected !== value) return null;

  return (
    <motion.div
      className={className}
      role="tabpanel"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
