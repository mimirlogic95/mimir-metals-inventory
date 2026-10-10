// Development-only persistent race check. Never run without fixture-specific
// authorization; successful execution leaves fictional immutable history.
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const mode = process.argv[3];
if (!['--verify-only', '--execute-approved'].includes(mode)) {
  throw new Error(
    'Use --verify-only, or --execute-approved after fixture-specific authorization.',
  );
}
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
let host;
try {
  host = new URL(env.VITE_SUPABASE_URL).hostname;
} catch {
  throw new Error('Development URL is invalid.');
}
if (host !== `${verifiedRef}.supabase.co` || !env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('Development environment points to a different project.');
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
  throw new Error('Supabase CLI project verification failed.');
}
if (
  !Array.isArray(projects) ||
  !projects.some(
    (project) =>
      project.id === verifiedRef &&
      project.linked &&
      project.name === 'Mimir Metals Inventory Development',
  )
) {
  throw new Error('Linked project is not the approved development project.');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function signIn(email, password, expectedRole) {
  assert(email && password, 'Development test identity is not configured.');
  const client = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  assert(
    !error && data.user,
    `Fictional test sign-in failed (${error?.code ?? 'unknown'}).`,
  );
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role, active')
    .eq('id', data.user.id)
    .single();
  assert(
    !profileError && profile?.active && profile.role === expectedRole,
    'Test identity lacks the expected active inventory role.',
  );
  return client;
}

const [worker, supervisor] = await Promise.all([
  signIn(env.VITE_DEV_AUTH_EMAIL, env.VITE_DEV_AUTH_PASSWORD, 'worker'),
  signIn(
    env.VITE_DEV_SUPERVISOR_A_EMAIL,
    env.VITE_DEV_SUPERVISOR_A_PASSWORD,
    'supervisor',
  ),
]);
const { data: part, error: partError } = await worker
  .from('parts')
  .select('id')
  .eq('part_number', 'MM-A3815')
  .single();
assert(!partError && part, 'Fictional test part unavailable.');
const { data: racks, error: rackError } = await worker
  .from('locations')
  .select('id, location_code')
  .eq('location_type', 'rack')
  .eq('active', true)
  .order('location_code');
assert(!rackError && racks, 'Rack read failed.');
const { data: staging, error: stagingError } = await worker
  .from('locations')
  .select('id, location_code')
  .eq('location_type', 'shipping_staging')
  .eq('active', true)
  .limit(1);
assert(
  !stagingError && staging?.length === 1,
  'Active shipping staging unavailable.',
);
const { data: occupants, error: occupancyError } = await worker
  .from('pallets')
  .select('current_location_id')
  .neq('lifecycle_status', 'shipped')
  .not('current_location_id', 'is', null);
assert(!occupancyError && occupants, 'Rack occupancy read failed.');
const occupied = new Set(occupants.map((item) => item.current_location_id));
const fixtureRackCodes = Array.from(
  { length: 5 },
  (_, index) => `M11-LIVE-RACK-0${index + 1}`,
);
const openRacks = fixtureRackCodes.map((code) =>
  racks.find((rack) => rack.location_code === code && !occupied.has(rack.id)),
);
assert(
  openRacks.every(Boolean),
  'Five dedicated, open M11 fictional racks are required.',
);

if (mode === '--verify-only') {
  console.log(
    'Development identity and fictional fixture capacity verified; no records created.',
  );
  process.exit(0);
}

async function createAndStore(label, rack) {
  const nonce = randomUUID();
  const { data: created, error: createError } = await worker
    .rpc('create_pallet', {
      p_part_id: part.id,
      p_boxes: 2,
      p_heat_number: `M11-FICTIONAL-HEAT-${label}-${nonce}`,
      p_lot_number: `M11-FICTIONAL-LOT-${label}-${nonce}`,
      p_machine_code: 'M11-FICTIONAL-MACHINE',
      p_idempotency_key: `m11-create-${nonce}`,
    })
    .single();
  assert(
    !createError && created,
    `Fixture creation failed (${createError?.code ?? 'unknown'}).`,
  );
  const { error: storeError } = await worker
    .rpc('store_pallet', {
      p_pallet_code: created.pallet_code,
      p_destination_location_id: rack.id,
      p_idempotency_key: `m11-store-${nonce}`,
    })
    .single();
  assert(
    !storeError,
    `Fixture storage failed (${storeError?.code ?? 'unknown'}).`,
  );
  const { data: current, error: readError } = await worker
    .from('pallets')
    .select(
      'pallet_code, current_boxes, current_pieces, current_location_id, lifecycle_status, inventory_version',
    )
    .eq('id', created.id)
    .single();
  assert(
    !readError &&
      current?.current_boxes === 2 &&
      current.current_pieces === 1400 &&
      current.current_location_id === rack.id &&
      current.lifecycle_status === 'stored',
    'Fixture state did not match expected stored inventory.',
  );
  return current;
}

function shipRequest(pallet, key) {
  return {
    p_pallet_code: pallet.pallet_code,
    p_expected_current_location_id: pallet.current_location_id,
    p_expected_lifecycle_status: pallet.lifecycle_status,
    p_expected_current_boxes: pallet.current_boxes,
    p_expected_current_pieces: pallet.current_pieces,
    p_expected_inventory_version: pallet.inventory_version,
    p_po_reference: 'M11-FICTIONAL-PO',
    p_bol_reference: 'M11-FICTIONAL-BOL',
    p_reason_notes: null,
    p_idempotency_key: key,
  };
}

async function assertOneEvent(keys, types) {
  const { data, error } = await worker
    .from('inventory_transactions')
    .select('id, transaction_type, idempotency_key')
    .in('idempotency_key', keys);
  assert(
    !error && data?.length === 1 && types.includes(data[0].transaction_type),
    'Race produced missing or duplicate inventory events.',
  );
}

async function assertCurrent(code, expected) {
  const { data, error } = await worker
    .from('pallets')
    .select(
      'current_boxes, current_pieces, current_location_id, lifecycle_status',
    )
    .eq('pallet_code', code)
    .single();
  assert(
    !error && data && expected(data),
    'Final pallet state is inconsistent.',
  );
}

// Fixtures are created serially. A failure stops before the next fixture.
const samePallet = await createAndStore('SHIP', openRacks[0]);
const pullRace = await createAndStore('PULL', openRacks[1]);
const moveRace = await createAndStore('MOVE', openRacks[2]);
const stageRace = await createAndStore('STAGE', openRacks[3]);

const shipA = shipRequest(samePallet, `m11-race-ship-a-${randomUUID()}`);
const shipB = shipRequest(samePallet, `m11-race-ship-b-${randomUUID()}`);
const sameResults = await Promise.all([
  worker.rpc('ship_pallet', shipA).single(),
  supervisor.rpc('ship_pallet', shipB).single(),
]);
assert(
  sameResults.filter((result) => !result.error).length === 1 &&
    sameResults.filter((result) => result.error?.message === 'ALREADY SHIPPED')
      .length === 1,
  'Same-pallet shipping race must yield one success and one ALREADY SHIPPED.',
);
const winner = sameResults[0].error ? 1 : 0;
const winnerClient = winner === 0 ? worker : supervisor;
const winnerRequest = winner === 0 ? shipA : shipB;
const { data: retry, error: retryError } = await winnerClient
  .rpc('ship_pallet', winnerRequest)
  .single();
assert(
  !retryError &&
    retry?.transaction_id === sameResults[winner].data.transaction_id,
  'Exact successful retry must return original shipment event.',
);
await assertOneEvent(
  [shipA.p_idempotency_key, shipB.p_idempotency_key],
  ['shipped'],
);
await assertCurrent(
  samePallet.pallet_code,
  (pallet) =>
    pallet.lifecycle_status === 'shipped' &&
    pallet.current_boxes === 0 &&
    pallet.current_pieces === 0 &&
    pallet.current_location_id === null,
);

const pullKey = `m11-race-pull-${randomUUID()}`;
const pullShip = shipRequest(pullRace, `m11-race-pull-ship-${randomUUID()}`);
const pullResults = await Promise.all([
  worker
    .rpc('pull_boxes', {
      p_pallet_code: pullRace.pallet_code,
      p_boxes_to_pull: 1,
      p_expected_current_boxes: 2,
      p_expected_current_pieces: 1400,
      p_idempotency_key: pullKey,
    })
    .single(),
  supervisor.rpc('ship_pallet', pullShip).single(),
]);
assert(
  pullResults.filter((result) => !result.error).length === 1 &&
    pullResults.filter((result) =>
      ['PALLET SHIPPED', 'INVENTORY CHANGED'].includes(result.error?.message),
    ).length === 1,
  'Pull/Ship race must have one success and one stale/terminal rejection.',
);
await assertOneEvent(
  [pullKey, pullShip.p_idempotency_key],
  ['box_pull', 'shipped'],
);
await assertCurrent(
  pullRace.pallet_code,
  (pallet) =>
    (pallet.lifecycle_status === 'stored' &&
      pallet.current_boxes === 1 &&
      pallet.current_pieces === 700) ||
    (pallet.lifecycle_status === 'shipped' &&
      pallet.current_boxes === 0 &&
      pallet.current_pieces === 0 &&
      pallet.current_location_id === null),
);

const moveKey = `m11-race-move-${randomUUID()}`;
const moveShip = shipRequest(moveRace, `m11-race-move-ship-${randomUUID()}`);
const moveResults = await Promise.all([
  worker
    .rpc('move_pallet', {
      p_pallet_code: moveRace.pallet_code,
      p_expected_current_location_id: moveRace.current_location_id,
      p_destination_location_id: openRacks[4].id,
      p_idempotency_key: moveKey,
    })
    .single(),
  supervisor.rpc('ship_pallet', moveShip).single(),
]);
assert(
  moveResults.filter((result) => !result.error).length === 1 &&
    moveResults.filter((result) =>
      ['PALLET SHIPPED', 'INVENTORY CHANGED'].includes(result.error?.message),
    ).length === 1,
  'Move/Ship race must have one success and one stale/terminal rejection.',
);
await assertOneEvent(
  [moveKey, moveShip.p_idempotency_key],
  ['moved', 'shipped'],
);
await assertCurrent(
  moveRace.pallet_code,
  (pallet) =>
    (pallet.lifecycle_status === 'stored' &&
      pallet.current_location_id === openRacks[4].id &&
      pallet.current_boxes === 2) ||
    (pallet.lifecycle_status === 'shipped' &&
      pallet.current_location_id === null &&
      pallet.current_boxes === 0),
);

const stageKey = `m11-race-stage-${randomUUID()}`;
const stageShip = shipRequest(stageRace, `m11-race-stage-ship-${randomUUID()}`);
const stageResults = await Promise.all([
  worker
    .rpc('stage_pallet_for_shipping', {
      p_pallet_code: stageRace.pallet_code,
      p_expected_current_location_id: stageRace.current_location_id,
      p_expected_lifecycle_status: stageRace.lifecycle_status,
      p_expected_current_boxes: stageRace.current_boxes,
      p_expected_current_pieces: stageRace.current_pieces,
      p_expected_inventory_version: stageRace.inventory_version,
      p_destination_location_id: staging[0].id,
      p_idempotency_key: stageKey,
    })
    .single(),
  supervisor.rpc('ship_pallet', stageShip).single(),
]);
assert(
  stageResults.filter((result) => !result.error).length === 1 &&
    stageResults.filter((result) =>
      ['ALREADY SHIPPED', 'INVENTORY CHANGED'].includes(result.error?.message),
    ).length === 1,
  'Stage/Ship race must have one success and one stale/terminal rejection.',
);
await assertOneEvent(
  [stageKey, stageShip.p_idempotency_key],
  ['shipping_staging', 'shipped'],
);
await assertCurrent(
  stageRace.pallet_code,
  (pallet) =>
    (pallet.lifecycle_status === 'shipping_staging' &&
      pallet.current_location_id === staging[0].id &&
      pallet.current_boxes === 2) ||
    (pallet.lifecycle_status === 'shipped' &&
      pallet.current_location_id === null &&
      pallet.current_boxes === 0),
);

console.log(
  'Shipping races passed: Ship/Ship, Pull/Ship, Move/Ship, Stage/Ship; exact retry and one-event checks passed.',
);
