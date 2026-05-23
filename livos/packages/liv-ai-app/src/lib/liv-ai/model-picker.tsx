"use client";

// Phase 199-04 — LivAiModelPicker (frontend).
//
// Phase 201-04 — Ported from livos/packages/ui/src/features/liv-ai/
//   model-picker.tsx. Path remaps applied:
//     livos UI shadcn dropdown-menu path → @/components/ui/dropdown-menu
//
// Standalone shadcn DropdownMenu over the LIV_AI_MODELS registry. Pure UI:
// `value` + `onChange` are props; this component does NOT read/write Redis
// directly. assistant.tsx wires onChange to postSetActiveModel and hydrates
// value from fetchActiveModel (Plan 201-04 native-fetch path).

import { Check, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { LIV_AI_MODELS, type LivAiModelId } from "./models";

export interface LivAiModelPickerProps {
  value: LivAiModelId;
  onChange: (next: LivAiModelId) => void;
}

export function LivAiModelPicker({ value, onChange }: LivAiModelPickerProps) {
  const current =
    LIV_AI_MODELS.find((m) => m.id === value) ?? LIV_AI_MODELS[0];
  const CurrentIcon = current.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
        aria-label="Select model"
        data-testid="liv-ai-model-picker-trigger"
      >
        <CurrentIcon className="size-3.5" />
        <span>{current.name}</span>
        <ChevronDown className="size-3.5 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {LIV_AI_MODELS.map((m) => {
          const ModelIcon = m.Icon;
          const selected = m.id === value;
          return (
            <DropdownMenuItem
              key={m.id}
              onSelect={() => onChange(m.id)}
              data-testid={`liv-ai-model-picker-item-${m.id}`}
              className="flex items-start gap-2"
            >
              {selected ? (
                <Check className="mt-0.5 size-4 shrink-0" />
              ) : (
                <ModelIcon className="mt-0.5 size-4 shrink-0 opacity-50" />
              )}
              <div className="flex flex-col">
                <span className="text-sm font-medium">{m.name}</span>
                <span className="text-xs text-muted-foreground">
                  {m.description}
                </span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LivAiModelPicker;
