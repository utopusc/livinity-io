import React, { forwardRef } from "react";
import { cn } from "../lib/cn";
import type { NavBarProps } from "./NavBar.types";
import "../styles/composites.css";

export const NavBar = forwardRef<HTMLElement, NavBarProps>(
  ({ brand, actions, className, as = "header" }, ref) => {
    const Tag = as as React.ElementType;
    return (
      <Tag ref={ref} className={cn("navbar", className)}>
        <div className="navbar-brand">{brand}</div>
        {actions && <div className="navbar-actions">{actions}</div>}
      </Tag>
    );
  },
);
NavBar.displayName = "NavBar";
