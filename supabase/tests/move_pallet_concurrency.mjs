// Development-only live race check. Leaves fictional pallets and immutable
// history intact. Never run against a production project.
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const env = loadEnv('development', process.cwd(), 'VITE_');
const verifiedDevelopmentRef = process.argv[2];
const linkedRef = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (
  !verifiedDevelopmentRef ||
  !/^[a-z]{20}$/.test(verifiedDevelopmentRef) ||
  linkedRef !== verifiedDevelopmentRef
) {
  throw new Error(
    'Pass the separately verified linked development project reference.',
  );
}
let configuredHost;
try {
  configuredHost = new URL(env.VITE_SUPABASE_URL).hostname;
} catch {
  throw new Error('Development Supabase URL is invalid.');
}
if (
  !env.VITE_SUPABASE_URL ||
  !env.VITE_SUPABASE_ANON_KEY ||
  !env.VITE_DEV_AUTH_EMAIL ||
  !env.VITE_DEV_AUTH_PASSWORD ||
  configuredHost !== `${verifiedDevelopmentRef}.supabase.co`
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
      project.id === verifiedDevelopmentRef &&
      project.name === 'Mimir Metals Inventory Development',
  )
) {
  throw new Error('Linked project is not the approved development project.');
}
if (process.argv[3] === '--verify-only') {
  console.log(
    'Linked development project identity verified; no test records created.',
  );
  process.exit(0);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function authenticatedClient() {
  const client = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { error } = await client.auth.signInWithPassword({
    email: env.VITE_DEV_AUTH_EMAIL,
    password: env.VITE_DEV_AUTH_PASSWORD,
  });
  assert(!error, `Development sign-in failed (${error?.code ?? 'unknown'}).`);
  return client;
}

const [sessionA, sessionB] = await Promise.all([
  authenticatedClient(),
  authenticatedClient(),
]);
const { data: part, error: partError } = await sessionA
  .from('parts')
  .select('id')
  .eq('part_number', 'MM-A3815')
  .single();
assert(
  !partError && part,
  `Fictional part unavailable (${partError?.code ?? 'unknown'}).`,
);
const { data: racks, error: rackError } = await sessionA
  .from('locations')
  .select('id, location_code')
  .eq('location_type', 'rack')
  .eq('active', true)
  .order('location_code');
assert(
  !rackError && racks,
  `Rack read failed (${rackError?.code ?? 'unknown'}).`,
);
const { data: occupants, error: occupantError } = await sessionA
  .from('pallets')
  .select('current_location_id')
  .neq('lifecycle_status', 'shipped')
  .not('current_location_id', 'is', null);
assert(
  !occupantError && occupants,
  `Occupancy read failed (${occupantError?.code ?? 'unknown'}).`,
);
const occupied = new Set(occupants.map((pallet) => pallet.current_location_id));
const openRacks = racks.filter((rack) => !occupied.has(rack.id));
assert(
  openRacks.length >= 6,
  'Six open fictional racks are required before this persistent race check.',
);

async function createAndStore(label, rack) {
  const nonce = randomUUID();
  const { data: created, error: createError } = await sessionA
    .rpc('create_pallet', {
      p_part_id: part.id,
      p_boxes: 31,
      p_heat_number: `M8-FICTIONAL-HEAT-${label}-${nonce}`,
      p_lot_number: `M8-FICTIONAL-LOT-${label}-${nonce}`,
      p_idempotency_key: `mission-8-concurrency-create-${nonce}`,
      p_machine_code: 'M8-FICTIONAL-MACHINE',
    })
    .single();
  assert(
    !createError && created,
    `Fictional pallet creation failed (${createError?.code ?? 'unknown'}).`,
  );
  const { error: storeError } = await sessionA
    .rpc('store_pallet', {
      p_pallet_code: created.pallet_code,
      p_destination_location_id: rack.id,
      p_idempotency_key: `mission-8-concurrency-store-${nonce}`,
    })
    .single();
  assert(
    !storeError,
    `Fictional pallet storage failed (${storeError?.code ?? 'unknown'}).`,
  );
  return created;
}

const [palletA, palletB, palletC] = await Promise.all([
  createAndStore('A', openRacks[0]),
  createAndStore('B', openRacks[1]),
  createAndStore('C', openRacks[3]),
]);

const sameRackRequests = [
  {
    p_pallet_code: palletA.pallet_code,
    p_expected_current_location_id: openRacks[0].id,
    p_destination_location_id: openRacks[2].id,
    p_idempotency_key: `mission-8-race-a-${randomUUID()}`,
  },
  {
    p_pallet_code: palletB.pallet_code,
    p_expected_current_location_id: openRacks[1].id,
    p_destination_location_id: openRacks[2].id,
    p_idempotency_key: `mission-8-race-b-${randomUUID()}`,
  },
];
const sameRackResults = await Promise.all([
  sessionA.rpc('move_pallet', sameRackRequests[0]).single(),
  sessionB.rpc('move_pallet', sameRackRequests[1]).single(),
]);
assert(
  sameRackResults.filter((result) => !result.error).length === 1,
  'Exactly one pallet must move into the shared destination.',
);
assert(
  sameRackResults.filter(
    (result) => result.error?.message === 'LOCATION OCCUPIED',
  ).length === 1,
  'The losing rack request must receive LOCATION OCCUPIED.',
);
const winnerIndex = sameRackResults.findIndex((result) => !result.error);
const winnerRequest = sameRackRequests[winnerIndex];
const winnerResult = sameRackResults[winnerIndex].data;
const { data: retry, error: retryError } = await sessionA
  .rpc('move_pallet', winnerRequest)
  .single();
assert(
  !retryError && retry.transaction_id === winnerResult.transaction_id,
  'Exact retry must return the original Move event.',
);

const samePalletRequests = [
  {
    p_pallet_code: palletC.pallet_code,
    p_expected_current_location_id: openRacks[3].id,
    p_destination_location_id: openRacks[4].id,
    p_idempotency_key: `mission-8-race-c1-${randomUUID()}`,
  },
  {
    p_pallet_code: palletC.pallet_code,
    p_expected_current_location_id: openRacks[3].id,
    p_destination_location_id: openRacks[5].id,
    p_idempotency_key: `mission-8-race-c2-${randomUUID()}`,
  },
];
const samePalletResults = await Promise.all([
  sessionA.rpc('move_pallet', samePalletRequests[0]).single(),
  sessionB.rpc('move_pallet', samePalletRequests[1]).single(),
]);
assert(
  samePalletResults.filter((result) => !result.error).length === 1,
  'Exactly one competing same-pallet Move must succeed.',
);
assert(
  samePalletResults.filter(
    (result) => result.error?.message === 'LOCATION CHANGED',
  ).length === 1,
  'The stale same-pallet Move must receive LOCATION CHANGED.',
);

const { data: finalPallets, error: finalPalletError } = await sessionA
  .from('pallets')
  .select(
    'pallet_code, current_location_id, current_boxes, current_pieces, lifecycle_status',
  )
  .in('pallet_code', [
    palletA.pallet_code,
    palletB.pallet_code,
    palletC.pallet_code,
  ]);
assert(
  !finalPalletError && finalPallets?.length === 3,
  'Final pallet read failed.',
);
assert(
  finalPallets.filter(
    (pallet) => pallet.current_location_id === openRacks[2].id,
  ).length === 1,
  'One pallet must occupy the contested rack.',
);
assert(
  finalPallets.every(
    (pallet) =>
      pallet.lifecycle_status === 'stored' &&
      pallet.current_boxes === 31 &&
      pallet.current_pieces === 21700,
  ),
  'Concurrent Move must preserve lifecycle and quantities.',
);
const keys = [...sameRackRequests, ...samePalletRequests].map(
  (request) => request.p_idempotency_key,
);
const { data: events, error: eventError } = await sessionA
  .from('inventory_transactions')
  .select('id, idempotency_key, transaction_type')
  .in('idempotency_key', keys);
assert(
  !eventError &&
    events?.length === 2 &&
    events.every((event) => event.transaction_type === 'moved'),
  'Only two successful Move events may exist.',
);
console.log(
  'Move races passed: contested rack 1 success/1 occupied; same pallet 1 success/1 stale; retry matched; no duplicate event.',
);
