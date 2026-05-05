export const DASHBOARD_JWT_AUDIENCE = 'dashboard' as const;

/** Client website JWT audience — distinct from dashboard tokens. */
export const CLIENT_JWT_AUDIENCE = 'client' as const;

export const PERMISSIONS_KEY = 'permissions_required' as const;

/** Handler requires at least one of these permissions (OR). */
export const ANY_PERMISSIONS_KEY = 'permissions_any' as const;
