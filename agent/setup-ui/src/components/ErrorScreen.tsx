interface ErrorScreenProps {
  message: string;
  onRetry: () => void;
}

function ErrorScreen({ message, onRetry }: ErrorScreenProps) {
  return (
    <div className="text-center">
      {/* Red X icon */}
      <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-3">
        Something went wrong
      </h2>

      {/* Error message box */}
      <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3 mb-6 text-left">
        {message}
      </div>

      {/* Retry button (outline variant) */}
      <button
        onClick={onRetry}
        className="w-full py-3 px-4 rounded-xl font-medium border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        Try Again
      </button>
    </div>
  );
}

export default ErrorScreen;
