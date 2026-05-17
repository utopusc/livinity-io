// Force dynamic rendering so the install wizard is never prerendered as a
// long-lived static asset. This page is auth-gated and client-driven; the
// previous `Cache-Control: s-maxage=31536000` (set by Next.js for `○` static
// pages) caused browsers to pin the HTML for up to a year, hiding deploys.
export const dynamic = "force-dynamic";

export default function DashboardInstallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
