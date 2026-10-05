// Development-only live race check. Creates two fictional pallets and leaves
// their immutable history intact. Never run against a production project.
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
const expectedHost = `${verifiedDevelopmentRef}.supabase.co`;
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
  configuredHost !== expectedHost
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
    'Supabase CLI could not verify the development project identity.',
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
const openRacks = racks.filter((rack) => !occupied.has(rack.id));
assert(
  openRacks.length >= 2,
  'At least two empty fictional racks are required.',
);

async function createFictionalPallet(client, label) {
  const nonce = randomUUID();
  const { data, error } = await client
    .rpc('create_pallet', {
      p_part_id: part.id,
      p_boxes: 31,
      p_heat_number: `M5-FICTIONAL-HEAT-${label}-${nonce}`,
      p_lot_number: `M5-FICTIONAL-LOT-${label}-${nonce}`,
      p_idempotency_key: `mission-5-concurrency-create-${nonce}`,
      p_machine_code: 'M5-FICTIONAL-MACHINE',
    })
    .single();
  assert(
    !error && data,
    `Fictional pallet creation failed (${error?.code ?? 'unknown'}).`,
  );
  return data;
}

const [palletA, palletB] = await Promise.all([
  createFictionalPallet(workerA, 'A'),
  createFictionalPallet(workerB, 'B'),
]);

const requestA = {
  p_pallet_code: palletA.pallet_code,
  p_destination_location_id: openRacks[0].id,
  p_idempotency_key: `mission-5-concurrency-store-${randomUUID()}`,
};
const requestB = {
  p_pallet_code: palletB.pallet_code,
  p_destination_location_id: openRacks[0].id,
  p_idempotency_key: `mission-5-concurrency-store-${randomUUID()}`,
};

const [resultA, resultB] = await Promise.all([
  workerA.rpc('store_pallet', requestA).single(),
  workerB.rpc('store_pallet', requestB).single(),
]);
const results = [resultA, resultB];
assert(
  results.filter((result) => !result.error).length === 1,
  'Exactly one concurrent Store must succeed.',
);
assert(
  results.filter((result) => result.error?.message === 'LOCATION OCCUPIED')
    .length === 1,
  'The losing concurrent Store must report LOCATION OCCUPIED.',
);

const winnerIndex = resultA.error ? 1 : 0;
const winner = winnerIndex === 0 ? palletA : palletB;
const loser = winnerIndex === 0 ? palletB : palletA;
const winnerRequest = winnerIndex === 0 ? requestA : requestB;
const winnerClient = winnerIndex === 0 ? workerA : workerB;
const { data: retry, error: retryError } = await winnerClient
  .rpc('store_pallet', winnerRequest)
  .single();
assert(
  !retryError && retry,
  `Idempotent retry failed (${retryError?.code ?? 'unknown'}).`,
);
assert(
  retry.stored_at === results[winnerIndex].data.stored_at,
  'Retry must return the original Store event.',
);

const { data: state, error: stateError } = await workerA
  .from('pallets')
  .select('id, current_location_id, lifecycle_status')
  .in('id', [winner.id, loser.id]);
assert(
  !stateError && state?.length === 2,
  `Pallet verification failed (${stateError?.code ?? 'unknown'}).`,
);
assert(
  state.some(
    (pallet) =>
      pallet.id === winner.id &&
      pallet.current_location_id === openRacks[0].id &&
      pallet.lifecycle_status === 'stored',
  ),
  'Winning pallet must be stored in the target rack.',
);
assert(
  state.some(
    (pallet) =>
      pallet.id === loser.id &&
      pallet.current_location_id === null &&
      pallet.lifecycle_status === 'created',
  ),
  'Losing pallet must remain created and unstored.',
);

const { data: history, error: historyError } = await workerA
  .from('inventory_transactions')
  .select('id, idempotency_key')
  .in('idempotency_key', [
    requestA.p_idempotency_key,
    requestB.p_idempotency_key,
  ]);
assert(
  !historyError && history?.length === 1,
  `Store history check failed (${historyError?.code ?? 'unknown'}).`,
);

console.log(
  'Concurrent Store: one success, one LOCATION OCCUPIED; pallet state and single history event verified.',
);
console.log(
  'Idempotent retry: original Store event returned without duplicate history.',
);
console.log(`Fictional browser-test pallet: ${loser.pallet_code}`);
console.log(`Open fictional browser-test rack: ${openRacks[1].location_code}`);
console.log(
  'Fictional concurrency test records were retained to preserve immutable history.',
);
