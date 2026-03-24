interface WelcomeScreenProps {
  deviceName: string;
  onConnect: () => void;
}

function WelcomeScreen({ deviceName, onConnect }: WelcomeScreenProps) {
  return (
    <div className="text-center">
      {/* Icon */}
      <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-primary"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z"
          />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Set up your agent
      </h2>

      <p className="text-sm text-gray-500 mb-6">
        Connect this device to your Livinity account to enable remote AI
        control.
      </p>

      {/* Device name pill */}
      {deviceName && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-sm text-gray-600 font-medium">
            {deviceName}
          </span>
        </div>
      )}

      {/* CTA Button */}
      <button
        onClick={onConnect}
        className="w-full py-3 px-4 rounded-xl text-white font-medium bg-indigo-600 hover:bg-indigo-700 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        Connect Your Account
      </button>

      <p className="text-xs text-gray-400 mt-3">
        Links this device to your Livinity account
      </p>
    </div>
  );
}

export default WelcomeScreen;
