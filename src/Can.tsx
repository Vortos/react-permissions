import React from 'react';
import { usePermissionState } from './PermissionsProvider';

export interface CanProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  fallbackMode?: 'hide' | 'disable' | 'skeleton';
  loadingFallback?: React.ReactNode;
  deniedReason?: string;
}

export function Can({
  permission,
  children,
  fallback = null,
  fallbackMode = 'hide',
  loadingFallback = null,
  deniedReason,
}: CanProps) {
  const { allowed, loading } = usePermissionState(permission);

  if (loading && loadingFallback) {
    return <>{loadingFallback}</>;
  }

  if (allowed) {
    return <>{children}</>;
  }

  if (fallbackMode === 'disable') {
    return <>{disableChildren(children, deniedReason)}</>;
  }

  if (fallbackMode === 'skeleton') {
    return <>{fallback ?? loadingFallback}</>;
  }

  return <>{fallback}</>;
}

export interface RequirePermissionProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loadingFallback?: React.ReactNode;
}

export function RequirePermission({
  permission,
  children,
  fallback = null,
  loadingFallback = null,
}: RequirePermissionProps) {
  const { allowed, loading } = usePermissionState(permission);

  if (loading) {
    return <>{loadingFallback}</>;
  }

  return allowed ? <>{children}</> : <>{fallback}</>;
}

function disableChildren(children: React.ReactNode, deniedReason?: string) {
  return React.Children.map(children, (child: React.ReactNode) => {
    if (!React.isValidElement(child)) {
      return child;
    }

    const props: Record<string, unknown> = {
      disabled: true,
      'aria-disabled': true,
    };

    if (deniedReason) {
      props.title = deniedReason;
    }

    return React.cloneElement(child, props);
  });
}
