import { forwardRef, type SVGProps } from "react";

/**
 * Canonical Livinity mark — the donut (per Downloads/logo.html, 2026-05-15).
 *
 * Ported into the liv-ai-app subapp from livos/packages/ui/src/assets/
 * livinity-logo.tsx so the subapp does not import across workspace
 * boundaries. The mark is a solid circle with a centred hole; the outer
 * ring uses `currentColor` so it inherits the surrounding text color, and
 * the inner cut-out reads `var(--bg, #ffffff)` to invert cleanly on dark
 * surfaces.
 */
const LivinityLogo = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
  ({ style, width = 16, ...props }, ref) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      viewBox="0 0 32 32"
      fill="none"
      ref={ref}
      style={style}
      {...props}
    >
      {/* Hardcoded black ring + white center — operator-locked branding. */}
      <circle cx="16" cy="16" r="16" fill="#000000" />
      <circle cx="16" cy="16" r="8.6" fill="#ffffff" />
    </svg>
  )
);
LivinityLogo.displayName = "LivinityLogo";

export default LivinityLogo;
