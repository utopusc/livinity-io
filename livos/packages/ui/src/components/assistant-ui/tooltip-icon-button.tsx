"use client";

import { type ComponentPropsWithRef, forwardRef } from "react";
// Phase 200-02 Rule 1 fix: registry source imports `Slot` from "radix-ui" umbrella
// and accesses `Slot.Slottable`. The path-remap target `@radix-ui/react-slot`
// exposes `Slottable` as a *named* export (v1.0.2 in this package), not as a
// property on `Slot`. Import both directly.
import { Slottable } from "@radix-ui/react-slot";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shadcn-components/ui/tooltip";
import { Button } from "@/shadcn-components/ui/button";
import { cn } from "@/shadcn-lib/utils";

export type TooltipIconButtonProps = ComponentPropsWithRef<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
};

export const TooltipIconButton = forwardRef<
  HTMLButtonElement,
  TooltipIconButtonProps
>(({ children, tooltip, side = "bottom", className, ...rest }, ref) => {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-only"
            {...rest}
            className={cn("aui-button-icon size-6 p-1", className)}
            ref={ref}
          >
            <Slottable>{children}</Slottable>
            <span className="aui-sr-only sr-only">{tooltip}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side={side}>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

TooltipIconButton.displayName = "TooltipIconButton";
