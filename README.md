# @vortos/permissions

React permissions provider, hooks, and components for Vortos applications.

The backend decides what the current user can do. This package keeps the frontend permission state local, observable, refreshable, and easy to consume from React components.

```txt
Backend decides.
Frontend remembers.
Components ask locally.
Backend still enforces.
```

## Install

```bash
npm install @vortos/permissions
```

React is a peer dependency:

```txt
react >= 18
```

## Basic Setup

Wrap your app once near the router:

```tsx
import { PermissionsProvider } from '@vortos/permissions';

export function App() {
  return (
    <PermissionsProvider endpoint="/api/me/permissions">
      <Router />
    </PermissionsProvider>
  );
}
```

The endpoint can be any route. `/api/me/permissions` is only the default Vortos convention.

```tsx
<PermissionsProvider endpoint="/internal/session/permissions">
  <App />
</PermissionsProvider>
```

## Response Contract

Minimum response:

```json
{
  "permissions": ["ROLE_ADMIN", "athletes.update.any"]
}
```

Enterprise response with metadata:

```json
{
  "permissions": ["athletes.update.own"],
  "roles": ["ROLE_COACH"],
  "scopes": {
    "federationId": "fed_123",
    "teamIds": ["team_7", "team_9"]
  },
  "version": "perm_2026_05_04_001"
}
```

`permissions` drives UI checks. `roles`, `scopes`, and `version` are available through the stateful API for debugging, audit, tenant-aware UI, and observability.

## Simple Hooks

```tsx
import {
  usePermission,
  usePermissions,
  useAnyPermission,
  useAllPermissions,
} from '@vortos/permissions';

const canEdit = usePermission('athletes.update.own');
const permissions = usePermissions();
const isPrivileged = useAnyPermission('ROLE_ADMIN', 'ROLE_SUPER_ADMIN');
const canSeeAnalytics = useAllPermissions('reports.read.any', 'analytics.view.any');
```

These hooks are intentionally simple and return only booleans or arrays.

## Stateful Hooks

Use `usePermissionsState()` when a screen needs loading, stale, refresh, or error state:

```tsx
import { usePermissionsState } from '@vortos/permissions';

function PermissionPanel() {
  const {
    permissions,
    roles,
    scopes,
    version,
    loading,
    refreshing,
    stale,
    error,
    refetch,
    has,
    hasAny,
    hasAll,
  } = usePermissionsState();

  if (loading) return <Spinner />;
  if (error) return <RetryPanel error={error} onRetry={refetch} />;

  return (
    <button disabled={refreshing} onClick={() => refetch()}>
      Refresh permissions
    </button>
  );
}
```

For one permission plus state:

```tsx
import { usePermissionState } from '@vortos/permissions';

function DeletePostButton() {
  const { allowed, loading, error, refetch } = usePermissionState('posts.delete.any');

  if (loading) return <button disabled>Loading</button>;
  if (error) return <button onClick={() => refetch()}>Retry</button>;

  return <button disabled={!allowed}>Delete</button>;
}
```

## Components

Use `Can` for conditional UI:

```tsx
import { Can } from '@vortos/permissions';

<Can permission="billing.manage">
  <BillingSettings />
</Can>
```

With fallback:

```tsx
<Can permission="billing.manage" fallback={<ReadOnlyBillingNotice />}>
  <BillingSettings />
</Can>
```

Disable unavailable actions instead of hiding them:

```tsx
<Can
  permission="invoices.refund.any"
  fallbackMode="disable"
  deniedReason="You need the invoices.refund.any permission."
>
  <button>Refund invoice</button>
</Can>
```

Use `RequirePermission` for route guards:

```tsx
import { RequirePermission } from '@vortos/permissions';

export function AdminRoute() {
  return (
    <RequirePermission
      permission="admin.dashboard.view"
      loadingFallback={<PageSpinner />}
      fallback={<Navigate to="/" replace />}
    >
      <AdminDashboard />
    </RequirePermission>
  );
}
```

## Auth Headers

Headers are part of the provider's refetch identity. If a token changes, permissions refetch.

```tsx
<PermissionsProvider
  endpoint="/api/me/permissions"
  headers={{ Authorization: `Bearer ${token}` }}
>
  <Router />
</PermissionsProvider>
```

## Refreshing, Stale State, And Cache

```tsx
<PermissionsProvider
  endpoint="/api/me/permissions"
  headers={{ Authorization: `Bearer ${token}` }}
  staleTime={30_000}
  refreshInterval={60_000}
  refetchOnWindowFocus
  retries={2}
  retryDelayMs={500}
  persist
  cacheKey={`permissions:${userId}:${tenantId}`}
>
  <Router />
</PermissionsProvider>
```

Use tenant-aware cache keys:

```txt
permissions:${userId}:${tenantId}
```

This prevents one user's cached permissions from appearing after another user logs in on the same browser.

## SSR Initial Data

```tsx
<PermissionsProvider
  initialPermissions={serverPermissions}
  initialRoles={serverRoles}
  initialScopes={serverScopes}
  initialVersion={serverPermissionVersion}
>
  <App />
</PermissionsProvider>
```

The provider still refetches on the client after mount.

## Observability

```tsx
<PermissionsProvider
  endpoint="/api/me/permissions"
  onError={(error) => logger.capture(error)}
  onUpdate={(state) => {
    analytics.track('permissions.updated', {
      count: state.permissions.length,
      version: state.version,
      stale: state.stale,
    });
  }}
>
  <Router />
</PermissionsProvider>
```

## Security Boundary

Frontend permission checks are UX only. Every protected API route, command, query, and controller must still enforce authorization on the backend.
