import { useEffect, useState, useCallback, useRef } from 'react';
import WelcomeScreen from './components/WelcomeScreen';
import ConnectingScreen from './components/ConnectingScreen';
import SuccessScreen from './components/SuccessScreen';
import ErrorScreen from './components/ErrorScreen';

type Screen = 'welcome' | 'connecting' | 'success' | 'error';

interface PollResponse {
  status: string;
  userCode: string | null;
  verificationUri: string | null;
  deviceName: string | null;
  errorMessage: string | null;
}

function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [deviceName, setDeviceName] = useState('');
  const [userCode, setUserCode] = useState('');
  const [verificationUri, setVerificationUri] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch device name and initial status on mount
  useEffect(() => {
    fetch('/api/status')
      .then((res) => res.json())
      .then((data: { deviceName: string; status: string }) => {
        setDeviceName(data.deviceName);
        // If status is already past awaiting_setup (e.g., page refresh during flow),
        // resume from the correct screen
        if (data.status === 'connecting' || data.status === 'polling') {
          setScreen('connecting');
        } else if (data.status === 'success') {
          setScreen('success');
        } else if (data.status === 'error') {
          setScreen('error');
        }
      })
      .catch(() => {
        setDeviceName('Unknown Device');
      });
  }, []);

  // Poll for status while connecting
  useEffect(() => {
    if (screen !== 'connecting') {
      // Clear any existing poll interval when not in connecting screen
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/poll-status');
        const data = (await res.json()) as PollResponse;

        if (data.status === 'polling' && data.userCode && data.verificationUri) {
          setUserCode(data.userCode);
          setVerificationUri(data.verificationUri);
        }

        if (data.status === 'success') {
          if (data.deviceName) setDeviceName(data.deviceName);
          setScreen('success');
        } else if (data.status === 'error') {
          setErrorMessage(data.errorMessage || 'An unexpected error occurred.');
          setScreen('error');
        }
      } catch {
        // Ignore poll errors silently
      }
    }, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [screen]);

  // Auto-close window after success
  useEffect(() => {
    if (screen !== 'success') return;

    const timeout = setTimeout(() => {
      window.close();
      // If window.close() is blocked by the browser, the SuccessScreen
      // already shows "This window will close automatically" text.
      // We don't need additional handling -- the user can close manually.
    }, 5000);

    return () => clearTimeout(timeout);
  }, [screen]);

  const handleConnect = useCallback(async () => {
    setScreen('connecting');
    try {
      const res = await fetch('/api/start-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName }),
      });
      const data = (await res.json()) as { started: boolean };
      if (!data.started) {
        setErrorMessage('Failed to start setup process.');
        setScreen('error');
      }
    } catch {
      setErrorMessage('Could not connect to the setup server.');
      setScreen('error');
    }
  }, [deviceName]);

  const handleRetry = useCallback(async () => {
    // Reset server-side state
    try {
      await fetch('/api/retry', { method: 'POST' });
    } catch {
      // If retry endpoint fails, still reset UI
    }
    // Reset UI state
    setErrorMessage('');
    setUserCode('');
    setVerificationUri('');
    setScreen('welcome');
  }, []);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Livinity wordmark */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Livinity
          </h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          {screen === 'welcome' && (
            <WelcomeScreen deviceName={deviceName} onConnect={handleConnect} />
          )}
          {screen === 'connecting' && (
            <ConnectingScreen
              userCode={userCode}
              verificationUri={verificationUri}
            />
          )}
          {screen === 'success' && <SuccessScreen deviceName={deviceName} />}
          {screen === 'error' && (
            <ErrorScreen message={errorMessage} onRetry={handleRetry} />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
