// Development-only parallel Pull check. It leaves fictional immutable history
// intact and refuses a target other than the verified development project.
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
  !env.VITE_SUPABASE_URL ||
  !env.VITE_SUPABASE_ANON_KEY ||
  !env.VITE_DEV_AUTH_EMAIL ||
  !env.VITE_DEV_AUTH_PASSWORD ||
  configuredHost !== `${verifiedRef}.supabase.co`
) {
  throw new Error(
    'Development environment is incomplete or points to another project.',
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
    'Mission 7 development project identity verified; no test records created.',
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

const [workerA, workerB] = await Promise.all([
  authenticatedClient(),
  authenticatedClient(),
]);
const { data: part, error: partError } = await workerA
  .from('parts')
  .select('id')
  .eq('part_number', 'MM-A3815')
  .single();
assert(
  !partError && part,
  `Fictional part unavailable (${partError?.code ?? 'unknown'}).`,
);

const { data: racks, error: rackError } = await workerA
  .from('locations')
  .select('id, location_code')
  .eq('location_type', 'rack')
  .eq('active', true)
  .order('location_code');
assert(
  !rackError && racks,
  `Rack read failed (${rackError?.code ?? 'unknown'}).`,
);
const { data: occupants, error: occupantError } = await workerA
  .from('pallets')
  .select('current_location_id')
  .neq('lifecycle_status', 'shipped')
  .not('current_location_id', 'is', null);
assert(
  !occupantError && occupants,
  `Occupancy read failed (${occupantError?.code ?? 'unknown'}).`,
);
const occupied = new Set(occupants.map((pallet) => pallet.current_location_id));
const rack = racks.find((candidate) => !occupied.has(candidate.id));
assert(rack, 'An open fictional rack is required for the live race check.');

const createKey = `m7-race-create-${randomUUID()}`;
const { data: created, error: createError } = await workerA
  .rpc('create_pallet', {
    p_part_id: part.id,
    p_boxes: 10,
    p_heat_number: `M7-FICTIONAL-RACE-HEAT-${randomUUID()}`,
    p_lot_number: `M7-FICTIONAL-RACE-LOT-${randomUUID()}`,
    p_idempotency_key: createKey,
    p_machine_code: 'M7-FICTIONAL-MACHINE',
  })
  .single();
assert(
  !createError && created,
  `Fictional pallet creation failed (${createError?.code ?? 'unknown'}).`,
);

const { data: stored, error: storeError } = await workerA
  .rpc('store_pallet', {
    p_pallet_code: created.pallet_code,
    p_destination_location_id: rack.id,
    p_idempotency_key: `m7-race-store-${randomUUID()}`,
  })
  .single();
assert(
  !storeError && stored,
  `Fictional pallet storage failed (${storeError?.code ?? 'unknown'}).`,
);

const fractional = await workerA
  .rpc('pull_boxes', {
    p_pallet_code: created.pallet_code,
    p_boxes_to_pull: 1.5,
    p_expected_current_boxes: 0,
    p_expected_current_pieces: 0,
    p_idempotency_key: `m7-fractional-${randomUUID()}`,
  })
  .single();
assert(
  fractional.error && fractional.error.message !== 'INVENTORY CHANGED',
  'Fractional box input was accepted as an integer by the RPC boundary.',
);

const requestA = {
  p_pallet_code: created.pallet_code,
  p_boxes_to_pull: 6,
  p_expected_current_boxes: 10,
  p_expected_current_pieces: 10 * created.pieces_per_box_snapshot,
  p_idempotency_key: `m7-race-pull-a-${randomUUID()}`,
};
const requestB = {
  ...requestA,
  p_boxes_to_pull: 3,
  p_idempotency_key: `m7-race-pull-b-${randomUUID()}`,
};
const [resultA, resultB] = await Promise.all([
  workerA.rpc('pull_boxes', requestA).single(),
  workerB.rpc('pull_boxes', requestB).single(),
]);
const results = [resultA, resultB];
assert(
  results.filter((result) => !result.error).length === 1,
  'Exactly one concurrent Pull must succeed.',
);
assert(
  results.filter((result) => result.error?.message === 'INVENTORY CHANGED')
    .length === 1,
  'The losing concurrent Pull must report INVENTORY CHANGED.',
);

const winnerIndex = resultA.error ? 1 : 0;
const winnerResult = results[winnerIndex].data;
const winnerRequest = winnerIndex === 0 ? requestA : requestB;
const winnerClient = winnerIndex === 0 ? workerA : workerB;
const loserRequest = winnerIndex === 0 ? requestB : requestA;
const { data: retry, error: retryError } = await winnerClient
  .rpc('pull_boxes', winnerRequest)
  .single();
assert(
  !retryError && retry && retry.transaction_id === winnerResult.transaction_id,
  'Exact retry must return the original Pull event.',
);

const { data: state, error: stateError } = await workerA
  .from('pallets')
  .select('current_boxes, current_pieces, current_location_id')
  .eq('id', created.id)
  .single();
assert(
  !stateError && state,
  `Pallet read failed (${stateError?.code ?? 'unknown'}).`,
);
assert(
  state.current_boxes === 10 - winnerRequest.p_boxes_to_pull &&
    state.current_pieces ===
      state.current_boxes * created.pieces_per_box_snapshot &&
    state.current_location_id === rack.id,
  'Concurrent Pull produced an invalid pallet balance or changed location.',
);
const { data: history, error: historyError } = await workerA
  .from('inventory_transactions')
  .select('id, idempotency_key, transaction_type')
  .in('idempotency_key', [
    winnerRequest.p_idempotency_key,
    loserRequest.p_idempotency_key,
  ]);
assert(
  !historyError &&
    history?.length === 1 &&
    history[0].idempotency_key === winnerRequest.p_idempotency_key &&
    history[0].transaction_type === 'box_pull',
  'Exactly one concurrent box_pull event must exist.',
);

console.log(
  'Parallel Pull: one success, one INVENTORY CHANGED; one transaction and correct pallet balance.',
);
console.log(
  'Exact retry returned the original transaction without a second quantity change.',
);
console.log('Fractional input was rejected at the real RPC boundary.');
console.log(`Fictional browser-test pallet: ${created.pallet_code}`);
console.log(`Fictional browser-test rack: ${rack.location_code}`);
console.log('Fictional development records remain for immutable history.');
