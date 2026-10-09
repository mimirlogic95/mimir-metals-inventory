// Development-only race check. Creates fictional pallets and leaves immutable
// history in place. Never run against production.
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const env = loadEnv('development', process.cwd(), 'VITE_');
const verifiedRef = process.argv[2];
const linkedRef = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (
  !verifiedRef ||
  !/^[a-z]{20}$/.test(verifiedRef) ||
  linkedRef !== verifiedRef
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
  !env.VITE_SUPABASE_ANON_KEY ||
  !env.VITE_DEV_AUTH_EMAIL ||
  !env.VITE_DEV_AUTH_PASSWORD ||
  configuredHost !== `${verifiedRef}.supabase.co`
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

function assert(ok, message) {
  if (!ok) throw new Error(message);
}
async function signedInClient() {
  const client = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({
    email: env.VITE_DEV_AUTH_EMAIL,
    password: env.VITE_DEV_AUTH_PASSWORD,
  });
  assert(!error, `Development sign-in failed (${error?.code ?? 'unknown'}).`);
  return client;
}
const [sessionA, sessionB] = await Promise.all([
  signedInClient(),
  signedInClient(),
]);
const { data: part, error: partError } = await sessionA
  .from('parts')
  .select('id')
  .eq('part_number', 'MM-A3815')
  .single();
assert(!partError && part, 'Fictional test part unavailable.');
const { data: racks, error: rackError } = await sessionA
  .from('locations')
  .select('id, location_code')
  .eq('location_type', 'rack')
  .eq('active', true)
  .order('location_code');
assert(!rackError && racks, 'Active rack read failed.');
const { data: occupants, error: occupantError } = await sessionA
  .from('pallets')
  .select('current_location_id')
  .neq('lifecycle_status', 'shipped')
  .not('current_location_id', 'is', null);
assert(!occupantError && occupants, 'Rack occupancy read failed.');
const occupied = new Set(occupants.map((pallet) => pallet.current_location_id));
const open = racks.filter((rack) => !occupied.has(rack.id));
assert(
  open.length >= 2,
  'Two open fictional racks are required; no records were created.',
);

async function createAndStore(label, rack) {
  const nonce = randomUUID();
  const { data: created, error: createError } = await sessionA
    .rpc('create_pallet', {
      p_part_id: part.id,
      p_boxes: 31,
      p_heat_number: `M9-FICTIONAL-HEAT-${label}-${nonce}`,
      p_lot_number: `M9-FICTIONAL-LOT-${label}-${nonce}`,
      p_idempotency_key: `mission-9-race-create-${nonce}`,
      p_machine_code: 'M9-FICTIONAL-MACHINE',
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
      p_idempotency_key: `mission-9-race-store-${nonce}`,
    })
    .single();
  assert(
    !storeError,
    `Fictional pallet storage failed (${storeError?.code ?? 'unknown'}).`,
  );
  return created;
}

const [palletA, palletB] = await Promise.all([
  createAndStore('A', open[0]),
  createAndStore('B', open[1]),
]);
const requests = [29, 30].map((count, index) => ({
  p_pallet_code: palletA.pallet_code,
  p_counted_boxes: count,
  p_expected_current_boxes: 31,
  p_expected_current_pieces: 21700,
  p_expected_current_location_id: open[0].id,
  p_reason_code: 'other',
  p_reason_notes: `Fictional concurrent observation ${index + 1}`,
  p_idempotency_key: `mission-9-race-count-${randomUUID()}`,
}));
const concurrent = await Promise.all([
  sessionA.rpc('count_pallet', requests[0]).single(),
  sessionB.rpc('count_pallet', requests[1]).single(),
]);
assert(
  concurrent.filter((result) => !result.error).length === 1,
  'Exactly one competing discrepancy Count must succeed.',
);
assert(
  concurrent.filter(
    (result) => result.error?.message === 'ADJUSTMENT ALREADY PENDING',
  ).length === 1,
  'The competing Count must receive ADJUSTMENT ALREADY PENDING.',
);
const winner = concurrent.findIndex((result) => !result.error);
const retrySession = winner === 0 ? sessionA : sessionB;
const { data: retry, error: retryError } = await retrySession
  .rpc('count_pallet', requests[winner])
  .single();
assert(
  !retryError &&
    retry.transaction_id === concurrent[winner].data.transaction_id,
  'Exact retry must return the original Count event.',
);
const keys = requests.map((request) => request.p_idempotency_key);
const { data: countEvents, error: countEventsError } = await sessionA
  .from('inventory_transactions')
  .select('id, adjustment_request_id, transaction_type')
  .in('idempotency_key', keys);
assert(
  !countEventsError &&
    countEvents?.length === 1 &&
    countEvents[0].transaction_type === 'adjustment_requested' &&
    countEvents[0].adjustment_request_id,
  'Concurrent discrepancies must create exactly one request/event.',
);

const pullKey = `mission-9-race-pull-${randomUUID()}`;
const { error: pullError } = await sessionB
  .rpc('pull_boxes', {
    p_pallet_code: palletB.pallet_code,
    p_boxes_to_pull: 2,
    p_expected_current_boxes: 31,
    p_expected_current_pieces: 21700,
    p_idempotency_key: pullKey,
  })
  .single();
assert(
  !pullError,
  `Fictional competing Pull failed (${pullError?.code ?? 'unknown'}).`,
);
const staleKey = `mission-9-race-stale-${randomUUID()}`;
const { error: staleError } = await sessionA
  .rpc('count_pallet', {
    p_pallet_code: palletB.pallet_code,
    p_counted_boxes: 29,
    p_expected_current_boxes: 31,
    p_expected_current_pieces: 21700,
    p_expected_current_location_id: open[1].id,
    p_reason_code: 'other',
    p_reason_notes: null,
    p_idempotency_key: staleKey,
  })
  .single();
assert(
  staleError?.message === 'INVENTORY CHANGED',
  'Count reviewed before a successful Pull must fail as stale.',
);
const { data: finalPallets, error: finalError } = await sessionA
  .from('pallets')
  .select(
    'pallet_code, current_boxes, current_pieces, lifecycle_status, current_location_id',
  )
  .in('pallet_code', [palletA.pallet_code, palletB.pallet_code]);
assert(
  !finalError &&
    finalPallets?.length === 2 &&
    finalPallets.some(
      (row) =>
        row.pallet_code === palletA.pallet_code &&
        row.current_boxes === 31 &&
        row.current_pieces === 21700,
    ) &&
    finalPallets.some(
      (row) =>
        row.pallet_code === palletB.pallet_code &&
        row.current_boxes === 29 &&
        row.current_pieces === 20300,
    ),
  'Concurrent Count did not change inventory; successful Pull did.',
);
const { data: staleEvents, error: staleEventsError } = await sessionA
  .from('inventory_transactions')
  .select('id')
  .eq('idempotency_key', staleKey);
assert(
  !staleEventsError && staleEvents?.length === 0,
  'Stale Count must not write history.',
);
console.log(
  'Count race passed: one pending request/event; competing Count rejected; exact retry matched; stale Count after Pull rejected with no event.',
);
