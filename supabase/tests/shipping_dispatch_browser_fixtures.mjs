// One-time, fictional development fixtures. This leaves immutable history and
// must never run without explicit fixture-specific authorization.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const [verifiedRef, mode] = process.argv.slice(2);
if (!['--verify-only', '--execute-approved'].includes(mode)) {
  throw new Error(
    'Use --verify-only or explicitly authorized --execute-approved.',
  );
}
const env = loadEnv('development', process.cwd(), 'VITE_');
const linkedRef = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (
  !verifiedRef ||
  !/^[a-z]{20}$/.test(verifiedRef) ||
  linkedRef !== verifiedRef
) {
  throw new Error('Linked development project reference mismatch.');
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
  throw new Error('Only the linked development project is permitted.');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  env.VITE_DEV_AUTH_EMAIL && env.VITE_DEV_AUTH_PASSWORD,
  'Fictional worker credentials are not configured locally.',
);
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: session, error: authError } =
  await client.auth.signInWithPassword({
    email: env.VITE_DEV_AUTH_EMAIL,
    password: env.VITE_DEV_AUTH_PASSWORD,
  });
assert(!authError && session.user, 'Fictional worker sign-in failed.');
const { data: profile, error: profileError } = await client
  .from('profiles')
  .select('role, active')
  .eq('id', session.user.id)
  .single();
assert(
  !profileError && profile?.active && profile.role === 'worker',
  'Fictional worker is not active and authorized.',
);
const { data: part, error: partError } = await client
  .from('parts')
  .select('id')
  .eq('part_number', 'MM-A3815')
  .eq('active', true)
  .single();
assert(!partError && part, 'Approved fictional part is not active.');

const rackCode = 'M11-BROWSER-RACK-01';
const stagingCode = 'SHIPPING-STAGING-01';
const { data: locations, error: locationError } = await client
  .from('locations')
  .select('id, location_code, location_type, active')
  .in('location_code', [rackCode, stagingCode]);
assert(
  !locationError && locations?.length === 2,
  'Approved locations are missing.',
);
const rack = locations.find((location) => location.location_code === rackCode);
const staging = locations.find(
  (location) => location.location_code === stagingCode,
);
assert(
  rack?.active &&
    rack.location_type === 'rack' &&
    staging?.active &&
    staging.location_type === 'shipping_staging',
  'Approved location type or active status changed.',
);
const { data: occupant, error: occupantError } = await client
  .from('pallets')
  .select('id')
  .eq('current_location_id', rack.id)
  .neq('lifecycle_status', 'shipped')
  .limit(1);
assert(!occupantError && occupant?.length === 0, 'Browser rack is occupied.');

const hotHeat = 'M11-FICTIONAL-HOT-HEAT-01';
const storedHeat = 'M11-FICTIONAL-STORED-HEAT-01';
const { data: existing, error: existingError } = await client
  .from('pallets')
  .select('id')
  .in('heat_number', [hotHeat, storedHeat])
  .limit(1);
assert(
  !existingError && existing?.length === 0,
  'Browser fixture identifiers already exist.',
);

if (mode === '--verify-only') {
  console.log(
    'Browser fixture preflight passed; no inventory records created.',
  );
  process.exit(0);
}

async function readFixture(
  code,
  expectedBoxes,
  expectedLocationId,
  expectedLifecycle,
  eventTypes,
) {
  const { data: pallet, error: palletError } = await client
    .from('pallets')
    .select(
      'id, pallet_code, current_boxes, current_pieces, current_location_id, lifecycle_status, original_boxes, original_pieces',
    )
    .eq('pallet_code', code)
    .single();
  assert(
    !palletError &&
      pallet &&
      pallet.current_boxes === expectedBoxes &&
      pallet.current_pieces === expectedBoxes * 700 &&
      pallet.current_location_id === expectedLocationId &&
      pallet.lifecycle_status === expectedLifecycle &&
      pallet.original_boxes === expectedBoxes &&
      pallet.original_pieces === expectedBoxes * 700,
    'Browser fixture pallet state is inconsistent.',
  );
  const { data: events, error: eventError } = await client
    .from('inventory_transactions')
    .select('id, transaction_type')
    .eq('pallet_id', pallet.id)
    .order('occurred_at');
  assert(
    !eventError &&
      events?.length === eventTypes.length &&
      events.every(
        (event, index) => event.transaction_type === eventTypes[index],
      ),
    'Browser fixture immutable audit history is inconsistent.',
  );
  return {
    pallet_code: pallet.pallet_code,
    lifecycle: pallet.lifecycle_status,
    boxes: pallet.current_boxes,
    pieces: pallet.current_pieces,
    location: expectedLifecycle === 'stored' ? rackCode : null,
    events,
  };
}

async function createFixture(boxes, heat, lot, key) {
  const { data, error } = await client
    .rpc('create_pallet', {
      p_part_id: part.id,
      p_boxes: boxes,
      p_heat_number: heat,
      p_lot_number: lot,
      p_machine_code: 'M11-FICTIONAL-MACHINE',
      p_idempotency_key: key,
    })
    .single();
  assert(
    !error && data,
    `Approved pallet creation failed (${error?.code ?? 'unknown'}).`,
  );
  return data;
}

const hot = await createFixture(
  31,
  hotHeat,
  'M11-FICTIONAL-HOT-LOT-01',
  'm11-browser-hot-create-20261010',
);
const hotState = await readFixture(hot.pallet_code, 31, null, 'created', [
  'pallet_created',
]);
console.log(`Hot-job fixture: ${JSON.stringify(hotState)}`);

const stored = await createFixture(
  1,
  storedHeat,
  'M11-FICTIONAL-STORED-LOT-01',
  'm11-browser-stored-create-20261010',
);
await readFixture(stored.pallet_code, 1, null, 'created', ['pallet_created']);
const { error: storeError } = await client
  .rpc('store_pallet', {
    p_pallet_code: stored.pallet_code,
    p_destination_location_id: rack.id,
    p_idempotency_key: 'm11-browser-stored-store-20261010',
  })
  .single();
assert(
  !storeError,
  `Approved pallet storage failed (${storeError?.code ?? 'unknown'}).`,
);
const storedState = await readFixture(
  stored.pallet_code,
  1,
  rack.id,
  'stored',
  ['pallet_created', 'stored'],
);
console.log(`Stored fixture: ${JSON.stringify(storedState)}`);
