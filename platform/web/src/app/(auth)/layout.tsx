export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-white px-6 py-16 text-[#1d1d1f] dark:bg-black dark:text-[#f5f5f7]"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif",
        letterSpacing: '-0.01em',
      }}
    >
      <div className="w-full max-w-md">
        <div className="mb-10 flex justify-center">
          <span className="inline-flex items-center gap-2.5 text-[18px] font-semibold tracking-[-0.02em] text-[#1d1d1f] dark:text-[#f5f5f7]">
            <span className="relative inline-block h-[26px] w-[26px] rounded-full bg-[#1d1d1f] dark:bg-[#f5f5f7]">
              <span className="absolute inset-[7px] rounded-full bg-white dark:bg-black" />
            </span>
            Livinity
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
