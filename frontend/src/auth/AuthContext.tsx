import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { AuthUser } from "../types";
import { authApi, setTokens, clearTokens } from "../lib/api";

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasRole: (role: string) => boolean;
  hasAnyRole: (...roles: string[]) => boolean;
  hasBranchAccess: (branchId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("access_token");
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const userData = await authApi.getMe();
        setUser(userData);
      } catch (error) {
        // Token invalid or expired, try refresh
        const refreshToken = localStorage.getItem("refresh_token");
        if (refreshToken) {
          try {
            const { session } = await authApi.refreshToken(refreshToken);
            setTokens(session.access_token, session.refresh_token);
            const userData = await authApi.getMe();
            setUser(userData);
          } catch {
            clearTokens();
          }
        } else {
          clearTokens();
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: userData, session } = await authApi.login(email, password);
    setTokens(session.access_token, session.refresh_token);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await authApi.getMe();
      setUser(userData);
    } catch {
      // Ignore refresh errors
    }
  }, []);

  const hasRole = useCallback(
    (role: string) => {
      return user?.roles?.includes(role as AuthUser["roles"][number]) ?? false;
    },
    [user]
  );

  const hasAnyRole = useCallback(
    (...roles: string[]) => {
      return roles.some((role) => hasRole(role));
    },
    [hasRole]
  );

  const hasBranchAccess = useCallback(
    (branchId: string) => {
      // HM has access to all branches (ADMIN role merged into HM)
      if (hasRole("HM")) return true;
      return user?.branches?.some((b) => b.branch_id === branchId) ?? false;
    },
    [user, hasRole]
  );

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
    hasRole,
    hasAnyRole,
    hasBranchAccess,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
