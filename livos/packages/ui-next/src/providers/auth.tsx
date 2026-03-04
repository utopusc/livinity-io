'use client';

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { trpcReact, getJwt, setJwt, removeJwt } from '@/trpc/client';

interface AuthContextValue {
  isLoggedIn: boolean;
  isLoading: boolean;
  userExists: boolean;
  userExistsLoading: boolean;
  login: (password: string, totpToken?: string) => Promise<void>;
  register: (name: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const {
    data: isLoggedIn,
    isLoading: isLoggedInLoading,
    refetch: refetchIsLoggedIn,
  } = trpcReact.user.isLoggedIn.useQuery(undefined, {
    enabled: !!getJwt(),
    retry: false,
  });

  const {
    data: userExists,
    isLoading: userExistsLoading,
  } = trpcReact.user.exists.useQuery();

  const loginMutation = trpcReact.user.login.useMutation();
  const registerMutation = trpcReact.user.register.useMutation();
  const logoutMutation = trpcReact.user.logout.useMutation();

  // Stale JWT cleanup
  useEffect(() => {
    const jwt = getJwt();
    if (jwt && isLoggedIn === false && !isLoggedInLoading) {
      removeJwt();
      router.push('/login');
    }
  }, [isLoggedIn, isLoggedInLoading, router]);

  const login = useCallback(
    async (password: string, totpToken?: string) => {
      const jwt = await loginMutation.mutateAsync({
        password,
        totpToken,
      });
      setJwt(jwt);
      await refetchIsLoggedIn();
      router.push('/');
    },
    [loginMutation, refetchIsLoggedIn, router],
  );

  const register = useCallback(
    async (name: string, password: string) => {
      await registerMutation.mutateAsync({ name, password });
      // After register, login automatically
      const jwt = await loginMutation.mutateAsync({ password });
      setJwt(jwt);
      await refetchIsLoggedIn();
      router.push('/onboarding/account-created');
    },
    [registerMutation, loginMutation, refetchIsLoggedIn, router],
  );

  const logout = useCallback(() => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        removeJwt();
        router.push('/login');
      },
    });
  }, [logoutMutation, router]);

  const value: AuthContextValue = {
    isLoggedIn: !!getJwt() && isLoggedIn === true,
    isLoading: isLoggedInLoading,
    userExists: userExists ?? false,
    userExistsLoading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
