// Development-only live validation. --verify-only never writes; --run-approved
// creates fictional pallets, Counts, decisions, and immutable history.
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const env = loadEnv('development', process.cwd(), 'VITE_');
const verifiedRef = process.argv[2];
const mode = process.argv[3];
const linkedRef = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (
  !verifiedRef ||
  !/^[a-z]{20}$/.test(verifiedRef) ||
  linkedRef !== verifiedRef ||
  !['--verify-only', '--run-approved'].includes(mode)
) {
  throw new Error(
    'Pass the verified development project reference and an explicit mode.',
  );
}
let configuredHost;
try {
  configuredHost = new URL(env.VITE_SUPABASE_URL).hostname;
} catch {
  throw new Error('Development Supabase URL is invalid.');
}
if (
  configuredHost !== `${verifiedRef}.supabase.co` ||
  !env.VITE_SUPABASE_ANON_KEY ||
  !env.VITE_DEV_AUTH_EMAIL ||
  !env.VITE_DEV_AUTH_PASSWORD ||
  !env.VITE_DEV_SUPERVISOR_A_EMAIL ||
  !env.VITE_DEV_SUPERVISOR_A_PASSWORD ||
  !env.VITE_DEV_SUPERVISOR_B_EMAIL ||
  !env.VITE_DEV_SUPERVISOR_B_PASSWORD
) {
  throw new Error(
    'Development environment is incomplete or points to the wrong project.',
  );
}
let projects;
try {
  projects = JSON.parse(
    execSync('npx --yes supabase@2.119.0 projects list --output json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  );
} catch {
  throw new Error(
    'Supabase CLI could not verify development project identity.',
  );
}
if (
  !Array.isArray(projects) ||
  !projects.some(
    (project) =>
      project.id === verifiedRef &&
      project.name === 'Mimir Metals Inventory Development' &&
      project.linked,
  )
) {
  throw new Error('Linked project is not the approved development project.');
}

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

async function signedInClient(email, password, role) {
  const client = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data: auth, error: authError } = await client.auth.signInWithPassword(
    {
      email,
      password,
    },
  );
  assert(
    !authError && auth.user,
    `${role} sign-in failed (${authError?.code ?? 'unknown'}).`,
  );
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role, active')
    .eq('id', auth.user.id)
    .single();
  assert(
    !profileError && profile?.active && profile.role === role,
    `${role} profile is missing or inactive.`,
  );
  return client;
}

const [worker, supervisorA, supervisorB] = await Promise.all([
  signedInClient(env.VITE_DEV_AUTH_EMAIL, env.VITE_DEV_AUTH_PASSWORD, 'worker'),
  signedInClient(
    env.VITE_DEV_SUPERVISOR_A_EMAIL,
    env.VITE_DEV_SUPERVISOR_A_PASSWORD,
    'supervisor',
  ),
  signedInClient(
    env.VITE_DEV_SUPERVISOR_B_EMAIL,
    env.VITE_DEV_SUPERVISOR_B_PASSWORD,
    'supervisor',
  ),
]);
const fixturePlan = [
  { label: 'BROWSER_APPROVE', rackCode: 'B-002-AC', countedBoxes: 29 },
  { label: 'BROWSER_REJECT', rackCode: 'B-002-AD', countedBoxes: 30 },
  { label: 'BROWSER_ZERO', rackCode: 'B-003-AB', countedBoxes: 0 },
  { label: 'RACE_APPROVE', rackCode: 'B-003-AC', countedBoxes: 28 },
  { label: 'RACE_MIXED', rackCode: 'B-004-AA', countedBoxes: 27 },
];
const { data: part, error: partError } = await worker
  .from('parts')
  .select('id, active')
  .eq('part_number', 'MM-A3815')
  .single();
assert(!partError && part?.active, 'Fictional test part unavailable.');
const { data: packingSpec, error: packingError } = await worker
  .from('packing_specs')
  .select('pieces_per_box')
  .eq('part_id', part.id)
  .single();
assert(
  !packingError && packingSpec?.pieces_per_box === 700,
  'Fictional part must have the expected 700-piece packing specification.',
);
const { data: racks, error: rackError } = await worker
  .from('locations')
  .select('id, location_code')
  .eq('location_type', 'rack')
  .eq('active', true)
  .in(
    'location_code',
    fixturePlan.map((fixture) => fixture.rackCode),
  );
assert(
  !rackError && racks?.length === fixturePlan.length,
  'One or more approved fictional racks are unavailable.',
);
const { data: occupants, error: occupantError } = await worker
  .from('pallets')
  .select('current_location_id')
  .neq('lifecycle_status', 'shipped')
  .not('current_location_id', 'is', null);
assert(!occupantError && occupants, 'Rack occupancy could not be read.');
const occupied = new Set(occupants.map((pallet) => pallet.current_location_id));
for (const fixture of fixturePlan) {
  const rack = racks.find((row) => row.location_code === fixture.rackCode);
  assert(rack && !occupied.has(rack.id), `${fixture.rackCode} is occupied.`);
}
if (mode === '--verify-only') {
  console.log(
    'Verified development project, three fictional active accounts, packing spec, and five empty approved racks; no writes.',
  );
  process.exit(0);
}

async function createCountFixture(label, rack, countedBoxes) {
  const nonce = randomUUID();
  const { data: created, error: createError } = await worker
    .rpc('create_pallet', {
      p_part_id: part.id,
      p_boxes: 31,
      p_heat_number: `M10-FICTIONAL-HEAT-${label}-${nonce}`,
      p_lot_number: `M10-FICTIONAL-LOT-${label}-${nonce}`,
      p_machine_code: 'M10-FICTIONAL-MACHINE',
      p_idempotency_key: `m10-live-create-${nonce}`,
    })
    .single();
  assert(
    !createError && created,
    `Fixture ${label} creation failed (${createError?.code ?? 'unknown'}).`,
  );
  assert(
    created.original_boxes === 31 &&
      created.original_pieces === 21700 &&
      created.current_boxes === 31 &&
      created.current_pieces === 21700 &&
      created.pieces_per_box_snapshot === 700,
    `Fixture ${label} server-created quantities are unexpected.`,
  );
  console.log(`Created ${label}: ${created.pallet_code}.`);
  const { error: storeError } = await worker
    .rpc('store_pallet', {
      p_pallet_code: created.pallet_code,
      p_destination_location_id: rack.id,
      p_idempotency_key: `m10-live-store-${nonce}`,
    })
    .single();
  assert(
    !storeError,
    `Fixture ${label} storage failed (${storeError?.code ?? 'unknown'}).`,
  );
  console.log(
    `Stored ${label}: ${created.pallet_code} at ${rack.location_code}.`,
  );
  const { data: counted, error: countError } = await worker
    .rpc('count_pallet', {
      p_pallet_code: created.pallet_code,
      p_counted_boxes: countedBoxes,
      p_expected_current_boxes: 31,
      p_expected_current_pieces: 21700,
      p_expected_current_location_id: rack.id,
      p_reason_code: 'other',
      p_reason_notes: `Fictional Mission 10 ${label} discrepancy`,
      p_idempotency_key: `m10-live-count-${nonce}`,
    })
    .single();
  assert(
    !countError &&
      counted?.outcome === 'discrepancy' &&
      counted.adjustment_request_id,
    `Fixture ${label} Count failed (${countError?.code ?? 'unknown'}).`,
  );
  console.log(
    `Counted ${label}: ${created.pallet_code}, request ${counted.adjustment_request_id}.`,
  );
  return {
    label,
    rack,
    palletCode: created.pallet_code,
    requestId: counted.adjustment_request_id,
  };
}

const fixtures = [];
for (const fixture of fixturePlan) {
  const rack = racks.find((row) => row.location_code === fixture.rackCode);
  fixtures.push(
    await createCountFixture(fixture.label, rack, fixture.countedBoxes),
  );
}
const [browserApprove, browserReject, browserZero, raceApprove, raceMixed] =
  fixtures;
console.log(
  'Created five fictional Count fixtures; first three remain pending for browser decisions.',
);
console.log(
  `Browser approval fixture: ${browserApprove.palletCode}, request ${browserApprove.requestId}`,
);
console.log(
  `Browser rejection fixture: ${browserReject.palletCode}, request ${browserReject.requestId}`,
);
console.log(
  `Browser zero-result fixture: ${browserZero.palletCode}, request ${browserZero.requestId}`,
);

const workerDenied = await worker
  .rpc('approve_adjustment_request', {
    p_request_id: browserApprove.requestId,
    p_review_notes: '',
    p_idempotency_key: `m10-live-worker-denied-${randomUUID()}`,
  })
  .single();
assert(
  workerDenied.error?.message === 'SUPERVISOR ACCESS REQUIRED',
  'Worker could call approval RPC.',
);

const approveKeys = [randomUUID(), randomUUID()].map(
  (id) => `m10-live-race-approve-${id}`,
);
const approveArgs = approveKeys.map((key) => ({
  p_request_id: raceApprove.requestId,
  p_review_notes: 'Fictional two-supervisor race',
  p_idempotency_key: key,
}));
const approveRace = await Promise.all([
  supervisorA.rpc('approve_adjustment_request', approveArgs[0]).single(),
  supervisorB.rpc('approve_adjustment_request', approveArgs[1]).single(),
]);
assert(
  approveRace.filter((result) => !result.error).length === 1,
  'Approve race did not have one winner.',
);
assert(
  approveRace.filter(
    (result) => result.error?.message === 'REQUEST ALREADY RESOLVED',
  ).length === 1,
  'Competing approval was not safely rejected.',
);
const winnerIndex = approveRace.findIndex((result) => !result.error);
const winningClient = winnerIndex === 0 ? supervisorA : supervisorB;
const { data: retry, error: retryError } = await winningClient
  .rpc('approve_adjustment_request', approveArgs[winnerIndex])
  .single();
assert(
  !retryError &&
    retry.transaction_id === approveRace[winnerIndex].data.transaction_id,
  'Exact winning approval retry did not return the original event.',
);

const mixedApproveKey = `m10-live-race-mixed-approve-${randomUUID()}`;
const mixedRejectKey = `m10-live-race-mixed-reject-${randomUUID()}`;
const mixedRace = await Promise.all([
  supervisorA
    .rpc('approve_adjustment_request', {
      p_request_id: raceMixed.requestId,
      p_review_notes: null,
      p_idempotency_key: mixedApproveKey,
    })
    .single(),
  supervisorB
    .rpc('reject_adjustment_request', {
      p_request_id: raceMixed.requestId,
      p_review_notes: 'Fictional concurrent rejection',
      p_idempotency_key: mixedRejectKey,
    })
    .single(),
]);
assert(
  mixedRace.filter((result) => !result.error).length === 1,
  'Mixed race did not have one winner.',
);
assert(
  mixedRace.filter(
    (result) => result.error?.message === 'REQUEST ALREADY RESOLVED',
  ).length === 1,
  'Competing mixed decision was not safely rejected.',
);

const requestIds = fixtures.map((fixture) => fixture.requestId);
const { data: savedRequests, error: requestError } = await supervisorA
  .from('adjustment_requests')
  .select('id,status')
  .in('id', requestIds);
assert(
  !requestError && savedRequests?.length === 5,
  'Fixture requests were not found.',
);
const statusOf = (id) =>
  savedRequests.find((request) => request.id === id)?.status;
assert(
  statusOf(browserApprove.requestId) === 'pending' &&
    statusOf(browserReject.requestId) === 'pending' &&
    statusOf(browserZero.requestId) === 'pending' &&
    statusOf(raceApprove.requestId) === 'approved' &&
    statusOf(raceMixed.requestId) ===
      (mixedRace[0].error ? 'rejected' : 'approved'),
  'Saved request statuses do not match race outcomes.',
);
const { data: savedPallets, error: palletError } = await worker
  .from('pallets')
  .select(
    'pallet_code,current_boxes,current_pieces,lifecycle_status,current_location_id',
  )
  .in(
    'pallet_code',
    fixtures.map((fixture) => fixture.palletCode),
  );
assert(
  !palletError && savedPallets?.length === 5,
  'Fixture pallets were not found.',
);
for (const fixture of fixtures) {
  const pallet = savedPallets.find(
    (row) => row.pallet_code === fixture.palletCode,
  );
  const expectedBoxes =
    fixture === raceApprove
      ? 28
      : fixture === raceMixed && !mixedRace[0].error
        ? 27
        : 31;
  assert(
    pallet?.current_boxes === expectedBoxes &&
      pallet.current_pieces === expectedBoxes * 700 &&
      pallet.lifecycle_status === 'stored' &&
      pallet.current_location_id === fixture.rack.id,
    `Fixture ${fixture.label} final pallet state is incorrect.`,
  );
}
const decisionKeys = [...approveKeys, mixedApproveKey, mixedRejectKey];
const { data: events, error: eventError } = await supervisorA
  .from('inventory_transactions')
  .select(
    'id,idempotency_key,transaction_type,adjustment_request_id,box_change,piece_change',
  )
  .in('idempotency_key', decisionKeys);
assert(
  !eventError && events?.length === 2,
  'Expected exactly two winning decision events.',
);
assert(
  events.filter(
    (event) => event.adjustment_request_id === raceApprove.requestId,
  ).length === 1 &&
    events.filter(
      (event) => event.adjustment_request_id === raceMixed.requestId,
    ).length === 1,
  'Decision race produced duplicate or missing audit events.',
);
console.log(
  'Approve-vs-approve: one winner, stale competitor rejected, exact retry returned one event.',
);
console.log(
  'Approve-vs-reject: one winner, one decision event, authoritative quantity verified.',
);
console.log(
  'Worker approval RPC rejected; browser fixtures remain pending; no history deleted.',
);
