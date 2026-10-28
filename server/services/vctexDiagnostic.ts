/** Sanitized evidence only. Product presence is not an authorization grant. */
export type CltPermission = 'CONFIRMED' | 'DENIED' | 'UNPROVEN';
export type VctexDiagnostic = {
  timestamp: string;
  latencyMs: number;
  httpStatus: number | null;
  authenticationSucceeded: boolean;
  tokenRecognized: boolean;
  authenticationRecognized: boolean;
  permissionsClt: CltPermission;
  permissionsVerified: boolean;
  transportAvailable: boolean;
  transport: 'Oracle';
  fields: string[];
  error: string | null;
};

export function vctexPermissions(body: unknown): CltPermission {
  const b = body as any;
  // Explicitly disabled product is negative evidence. No permission-name mapping was supplied.
  if (b?.data?.products?.consignado === false) return 'DENIED';
  // restrictedAccess/restrictions and permissions have no confirmed CLT schema yet.
  // Neither an empty restriction list nor a present product proves permission.
  return 'UNPROVEN';
}

export function vctexConnectionStatus(config: {enabled:boolean;hasCredentials:boolean;gatewayReady:boolean}, last: VctexDiagnostic | null) {
  if (!config.enabled) return 'DISABLED' as const;
  if (!config.hasCredentials || !config.gatewayReady) return 'ATTENTION' as const;
  const fresh = last && Date.now() - Date.parse(last.timestamp) >= 0 && Date.now() - Date.parse(last.timestamp) < 15 * 60 * 1000;
  if (!fresh) return 'ATTENTION' as const;
  if (!last.transportAvailable || !last.authenticationSucceeded) return 'OFFLINE' as const;
  if (!last.tokenRecognized || last.permissionsClt !== 'CONFIRMED') return 'ATTENTION' as const;
  return 'ONLINE' as const;
}
