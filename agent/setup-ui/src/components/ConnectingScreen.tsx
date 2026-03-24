import { motion } from 'framer-motion';

interface ConnectingScreenProps {
  userCode: string;
  verificationUri: string;
}

function ConnectingScreen({ userCode, verificationUri }: ConnectingScreenProps) {
  const hasCode = userCode.length > 0;

  return (
    <div className="text-center">
      {hasCode ? (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Enter this code
          </h2>

          {/* User code displayed prominently */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="mb-4"
          >
            <p className="text-4xl font-mono font-bold tracking-widest text-gray-900">
              {userCode}
            </p>
          </motion.div>

          {/* Verification link */}
          <p className="text-sm text-gray-500 mb-6">
            at{' '}
            <a
              href={verificationUri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 underline hover:text-indigo-700 transition-colors"
            >
              {verificationUri}
            </a>
          </p>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Starting setup...
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Contacting Livinity servers
          </p>
        </>
      )}

      {/* Spinner */}
      <div className="flex items-center justify-center gap-3">
        <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <span className="text-sm text-gray-400">Waiting for approval...</span>
      </div>
    </div>
  );
}

export default ConnectingScreen;
