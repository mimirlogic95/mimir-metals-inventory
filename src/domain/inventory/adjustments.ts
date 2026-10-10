export type AdjustmentIssue = { title: string; message: string };

const issues: Record<string, AdjustmentIssue> = {
  SUPERVISOR_ACCESS_REQUIRED: {
    title: 'SUPERVISOR ACCESS REQUIRED',
    message: 'Sign in as an active supervisor to review adjustments.',
  },
  AUTHENTICATION_REQUIRED: {
    title: 'SUPERVISOR ACCESS REQUIRED',
    message: 'Sign in as an active supervisor to review adjustments.',
  },
  REQUEST_NOT_FOUND: {
    title: 'REQUEST NOT FOUND',
    message: 'This adjustment request could not be found.',
  },
  REQUEST_ALREADY_RESOLVED: {
    title: 'REQUEST ALREADY RESOLVED',
    message: 'Refresh to see the decision already recorded.',
  },
  INVENTORY_CHANGED: {
    title: 'INVENTORY CHANGED',
    message:
      'The pallet changed after this Count. Reject and request a new physical count.',
  },
  PALLET_NOT_ELIGIBLE: {
    title: 'PALLET NOT ELIGIBLE',
    message: 'This pallet cannot be adjusted in its current state.',
  },
  INVALID_ADJUSTMENT: {
    title: 'INVALID ADJUSTMENT',
    message:
      'The saved Count evidence is inconsistent. Investigate before deciding.',
  },
  CANNOT_APPROVE_OWN_REQUEST: {
    title: 'CANNOT APPROVE OWN REQUEST',
    message: 'A different active supervisor must approve this Count.',
  },
  ZERO_BALANCE_NOT_SUPPORTED: {
    title: 'ZERO BALANCE NOT SUPPORTED',
    message:
      'A zero-box adjustment cannot be approved in V1. Reject with an investigation or recount reason.',
  },
  REJECTION_REASON_REQUIRED: {
    title: 'REJECTION REASON REQUIRED',
    message: 'Enter a short reason before rejecting.',
  },
  IDEMPOTENCY_CONFLICT: {
    title: 'REQUEST CHANGED',
    message: 'Refresh before making a different decision.',
  },
};

export function getAdjustmentIssue(
  error: unknown,
  context: 'read' | 'decision' = 'decision',
): AdjustmentIssue {
  const known = error instanceof Error ? issues[error.message] : undefined;
  if (known) return known;
  return context === 'read'
    ? { title: "COULDN'T LOAD", message: 'Check the connection and try again.' }
    : {
        title: 'NOT SAVED YET',
        message:
          'The decision could not be confirmed. Retry this same request.',
      };
}
