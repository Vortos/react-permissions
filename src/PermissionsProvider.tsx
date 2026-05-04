import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { fetchJson, stableSerialize } from './request';

export interface PermissionsResponse {
  permissions?: string[];
  roles?: string[];
  scopes?: Record<string, unknown>;
  version?: string;
}

export interface PermissionsState {
  permissions: string[];
  roles: string[];
  scopes: Record<string, unknown>;
  version: string | null;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  error: Error | null;
  lastUpdatedAt: number | null;
}

export interface PermissionsContextValue extends PermissionsState {
  refetch: () => Promise<void>;
  has: (permission: string) => boolean;
  hasAny: (...permissions: string[]) => boolean;
  hasAll: (...permissions: string[]) => boolean;
}

export interface PermissionsProviderProps {
  endpoint?: string;
  children: React.ReactNode;
  headers?: Record<string, string>;
  initialPermissions?: string[];
  initialRoles?: string[];
  initialScopes?: Record<string, unknown>;
  initialVersion?: string | null;
  refreshInterval?: number;
  refetchOnWindowFocus?: boolean;
  staleTime?: number;
  retries?: number;
  retryDelayMs?: number;
  cacheKey?: string;
  persist?: boolean;
  onError?: (error: Error) => void;
  onUpdate?: (state: PermissionsState) => void;
}

const defaultState: PermissionsState = {
  permissions: [],
  roles: [],
  scopes: {},
  version: null,
  loading: true,
  refreshing: false,
  stale: true,
  error: null,
  lastUpdatedAt: null,
};

const noopRefetch = async () => undefined;

const PermissionsContext = createContext<PermissionsContextValue>({
  ...defaultState,
  refetch: noopRefetch,
  has: () => false,
  hasAny: () => false,
  hasAll: () => false,
});

export function PermissionsProvider({
  endpoint = '/api/me/permissions',
  headers = {},
  children,
  initialPermissions,
  initialRoles,
  initialScopes,
  initialVersion = null,
  refreshInterval,
  refetchOnWindowFocus = false,
  staleTime,
  retries = 0,
  retryDelayMs = 500,
  cacheKey,
  persist = false,
  onError,
  onUpdate,
}: PermissionsProviderProps) {
  const headersKey = stableSerialize(headers);
  const cachedState = readCachedState(cacheKey);
  const initialState = useMemo<PermissionsState>(() => {
    if (cachedState) {
      return {
        ...cachedState,
        stale: isStale(cachedState.lastUpdatedAt, staleTime),
      };
    }

    if (initialPermissions) {
      return {
        permissions: initialPermissions,
        roles: initialRoles ?? [],
        scopes: initialScopes ?? {},
        version: initialVersion,
        loading: false,
        refreshing: false,
        stale: isStale(Date.now(), staleTime),
        error: null,
        lastUpdatedAt: Date.now(),
      };
    }

    return defaultState;
  }, []);
  const [state, setState] = useState<PermissionsState>(initialState);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const applyState = useCallback(
    (next: PermissionsState) => {
      setState(next);

      if (persist && cacheKey) {
        writeCachedState(cacheKey, next);
      }

      onUpdate?.(next);
    },
    [cacheKey, onUpdate, persist]
  );

  const refetch = useCallback(async () => {
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setState((current: PermissionsState) => ({
      ...current,
      loading: current.lastUpdatedAt === null,
      refreshing: current.lastUpdatedAt !== null,
      error: null,
    }));

    try {
      const data = await fetchJson<PermissionsResponse>({
        endpoint,
        headers,
        signal: controller.signal,
        retries,
        retryDelayMs,
      });

      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      applyState({
        permissions: data.permissions ?? [],
        roles: data.roles ?? [],
        scopes: data.scopes ?? {},
        version: data.version ?? null,
        loading: false,
        refreshing: false,
        stale: false,
        error: null,
        lastUpdatedAt: Date.now(),
      });
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      const normalized = normalizeError(error);
      onError?.(normalized);

      setState((current: PermissionsState) => ({
        ...current,
        loading: false,
        refreshing: false,
        error: normalized,
      }));
    }
  }, [applyState, endpoint, headersKey, onError, retries, retryDelayMs]);

  useEffect(() => {
    mountedRef.current = true;
    refetch();

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [refetch]);

  useEffect(() => {
    if (!refreshInterval) {
      return;
    }

    const interval = window.setInterval(() => {
      refetch();
    }, refreshInterval);

    return () => window.clearInterval(interval);
  }, [refetch, refreshInterval]);

  useEffect(() => {
    if (!refetchOnWindowFocus) {
      return;
    }

    const onFocus = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      if (!staleTime || isStale(state.lastUpdatedAt, staleTime)) {
        refetch();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refetch, refetchOnWindowFocus, staleTime, state.lastUpdatedAt]);

  useEffect(() => {
    if (!staleTime || state.lastUpdatedAt === null) {
      return;
    }

    const remaining = staleTime - (Date.now() - state.lastUpdatedAt);

    if (remaining <= 0) {
      setState((current: PermissionsState) => ({ ...current, stale: true }));
      return;
    }

    const timeout = window.setTimeout(() => {
      setState((current: PermissionsState) => ({ ...current, stale: true }));
    }, remaining);

    return () => window.clearTimeout(timeout);
  }, [staleTime, state.lastUpdatedAt]);

  const value = useMemo<PermissionsContextValue>(() => {
    const has = (permission: string) => state.permissions.includes(permission);
    const hasAny = (...permissions: string[]) =>
      permissions.some((permission) => has(permission));
    const hasAll = (...permissions: string[]) =>
      permissions.every((permission) => has(permission));

    return {
      ...state,
      refetch,
      has,
      hasAny,
      hasAll,
    };
  }, [refetch, state]);

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): string[] {
  return useContext(PermissionsContext).permissions;
}

export function usePermissionsState(): PermissionsContextValue {
  return useContext(PermissionsContext);
}

export function usePermission(permission: string): boolean {
  return useContext(PermissionsContext).has(permission);
}

export function usePermissionState(permission: string) {
  const state = useContext(PermissionsContext);

  return {
    allowed: state.has(permission),
    loading: state.loading,
    refreshing: state.refreshing,
    stale: state.stale,
    error: state.error,
    refetch: state.refetch,
  };
}

export function useAnyPermission(...permissions: string[]): boolean {
  return useContext(PermissionsContext).hasAny(...permissions);
}

export function useAllPermissions(...permissions: string[]): boolean {
  return useContext(PermissionsContext).hasAll(...permissions);
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isStale(lastUpdatedAt: number | null, staleTime?: number): boolean {
  if (!staleTime || lastUpdatedAt === null) {
    return false;
  }

  return Date.now() - lastUpdatedAt >= staleTime;
}

function readCachedState(cacheKey?: string): PermissionsState | null {
  if (!cacheKey || typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(cacheKey);
    return raw ? (JSON.parse(raw) as PermissionsState) : null;
  } catch {
    return null;
  }
}

function writeCachedState(cacheKey: string, state: PermissionsState): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(state));
  } catch {
    // Storage can fail in private mode or when quota is exhausted.
  }
}
