import { motion } from 'framer-motion';

interface SuccessScreenProps {
  deviceName: string;
}

function SuccessScreen({ deviceName }: SuccessScreenProps) {
  return (
    <div className="text-center">
      {/* Green checkmark with spring animation */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="mx-auto mb-6 w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center"
      >
        <svg
          className="w-8 h-8 text-emerald-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </motion.div>

      <h2 className="text-xl font-semibold text-emerald-600 mb-2">
        Connected!
      </h2>

      <p className="text-sm text-gray-600 mb-1">
        <span className="font-medium">{deviceName}</span> is now linked to your
        Livinity account.
      </p>

      <p className="text-xs text-gray-400 mt-4">
        This window will close automatically
      </p>
    </div>
  );
}

export default SuccessScreen;
