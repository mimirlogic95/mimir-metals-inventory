import migrationSql from '../../../supabase/migrations/20261004150000_create_v1_database_foundation.sql?raw';
import createPalletMigrationSql from '../../../supabase/migrations/20261004200000_add_create_pallet_rpc.sql?raw';
import storePalletMigrationSql from '../../../supabase/migrations/20261004210000_add_store_pallet_rpc.sql?raw';
import countPalletMigrationSql from '../../../supabase/migrations/20261009120000_add_count_pallet_rpc.sql?raw';
import adjustmentDecisionsMigrationSql from '../../../supabase/migrations/20261009180000_add_supervisor_adjustment_decisions.sql?raw';
import seedSql from '../../../supabase/seed.sql?raw';

const v1Tables = [
  'profiles',
  'parts',
  'packing_specs',
  'locations',
  'pallets',
  'inventory_transactions',
  'adjustment_requests',
];

describe('V1 database migration source', () => {
  it.each(v1Tables)('creates and protects the %s table', (tableName) => {
    expect(migrationSql).toContain(`create table public.${tableName}`);
    expect(migrationSql).toContain(
      `alter table public.${tableName} enable row level security`,
    );
  });

  it('protects pallet quantities and packing snapshots with constraints', () => {
    expect(migrationSql).toContain('pallets_original_boxes_positive');
    expect(migrationSql).toContain('pallets_current_boxes_nonnegative');
    expect(migrationSql).toContain('pallets_current_pieces_nonnegative');
    expect(migrationSql).toContain('pallets_original_piece_math');
    expect(migrationSql).toContain('pallets_current_piece_math');
    expect(migrationSql).not.toMatch(/full_partial|fill_status/);
  });

  it('preserves the lifecycle state that an on-hold pallet must return to', () => {
    expect(migrationSql).toContain(
      'lifecycle_status_before_hold public.pallet_lifecycle_status',
    );
    expect(migrationSql).toContain('pallets_hold_state_consistent');
    expect(migrationSql).toContain('and lifecycle_status_before_hold is null');
  });

  it('enforces one active pallet per rack without globally uniquing locations', () => {
    expect(migrationSql).toContain(
      'create function public.enforce_rack_location_capacity()',
    );
    expect(migrationSql).toMatch(/order by id\s+for update;/);
    expect(migrationSql).toContain("destination_type = 'rack'");
    expect(migrationSql).toContain(
      "occupying_pallet.lifecycle_status <> 'shipped'",
    );
    expect(migrationSql).toContain("message = 'LOCATION OCCUPIED'");
    expect(migrationSql).toContain(
      "detail = destination_code || ' already contains a pallet.'",
    );
    expect(migrationSql).toContain("hint = 'Scan another location.'");
    expect(migrationSql).toContain(
      'create trigger locations_enforce_type_capacity',
    );
    expect(migrationSql).not.toMatch(/unique\s*\(\s*current_location_id\s*\)/i);
    expect(migrationSql).not.toMatch(
      /create\s+unique\s+index[^;]*current_location_id/i,
    );
  });

  it('defines the documented constrained lifecycle values', () => {
    for (const value of ['worker', 'supervisor']) {
      expect(migrationSql).toContain(`'${value}'`);
    }

    for (const value of [
      'created',
      'stored',
      'shipping_staging',
      'on_hold',
      'shipped',
      'pending',
      'approved',
      'rejected',
      'rack',
      'packing',
    ]) {
      expect(migrationSql).toContain(`'${value}'`);
    }
  });

  it('only permits pending adjustments to become approved or rejected', () => {
    expect(migrationSql).toContain(
      'adjustment_requests_enforce_status_transition',
    );
    expect(migrationSql).toContain("old.status <> 'pending'");
    expect(migrationSql).toContain(
      "new.status not in ('approved', 'rejected')",
    );
  });

  it('requires adjustment mismatches to be nonzero and directionally consistent', () => {
    expect(migrationSql).toContain('adjustment_requests_difference_nonzero');
    expect(migrationSql).toContain('adjustment_requests_difference_direction');
  });

  it('keeps browser roles read-only until protected operations exist', () => {
    expect(migrationSql).toContain('revoke all on table');
    expect(migrationSql).toContain('from anon, authenticated');
    expect(migrationSql).toContain('grant select on table');
    expect(migrationSql).not.toMatch(
      /for\s+(insert|update|delete)\s+to authenticated/i,
    );
  });

  it('limits adjustment visibility to the requester or an active supervisor', () => {
    expect(migrationSql).toContain(
      'requested_by_user_id = (select auth.uid())',
    );
    expect(migrationSql).toContain("profiles.role = 'supervisor'");
    expect(migrationSql).toContain('and profiles.active');
  });

  it('uses restrictive foreign-key deletion behavior for historical data', () => {
    expect(migrationSql).toContain('on delete restrict');
    expect(migrationSql).not.toMatch(/on delete cascade/i);
  });

  it('supports idempotency and append-only transaction history', () => {
    expect(migrationSql).toContain('idempotency_key text unique');
    expect(migrationSql).toContain('Append-only audit history');
    expect(migrationSql).toContain(
      'inventory_transactions_quantity_dimensions_together',
    );
  });
});

describe('Create Pallet protected operation source', () => {
  it('keeps identity, packing values, quantities, and pallet codes server-authoritative', () => {
    expect(createPalletMigrationSql).toContain('actor_id uuid := auth.uid()');
    expect(createPalletMigrationSql).toContain('part.active');
    expect(createPalletMigrationSql).toContain(
      'p_boxes::bigint * selected_part.pieces_per_box::bigint',
    );
    expect(createPalletMigrationSql).toContain(
      'selected_part.boxes_per_full_pallet',
    );
    expect(createPalletMigrationSql).toContain(
      "pg_catalog.nextval('public.pallet_code_seq'::regclass)",
    );
    expect(createPalletMigrationSql).not.toMatch(
      /p_(pieces|pieces_per_box|boxes_per_full_pallet)/,
    );
  });

  it('creates the pallet and complete audit quantities inside one function', () => {
    expect(createPalletMigrationSql).toContain('insert into public.pallets');
    expect(createPalletMigrationSql).toContain(
      'insert into public.inventory_transactions',
    );
    expect(createPalletMigrationSql).toContain("'pallet_created'");
    expect(createPalletMigrationSql).toMatch(
      /0,\s+p_boxes,\s+p_boxes,\s+0,\s+authoritative_pieces,\s+authoritative_pieces,/,
    );
  });

  it('serializes idempotent retries and rejects changed requests using the same key', () => {
    expect(createPalletMigrationSql).toContain(
      'pg_catalog.pg_advisory_xact_lock',
    );
    expect(createPalletMigrationSql).toContain(
      'transaction.idempotency_key = normalized_idempotency_key',
    );
    expect(createPalletMigrationSql).toContain('IDEMPOTENCY KEY CONFLICT');
  });

  it('uses a hardened security-definer boundary with least-privilege execution', () => {
    expect(createPalletMigrationSql).toContain('security definer');
    expect(createPalletMigrationSql).toContain("set search_path = ''");
    expect(createPalletMigrationSql).toContain(
      'revoke all on function public.create_pallet',
    );
    expect(createPalletMigrationSql).toContain('from public, anon');
    expect(createPalletMigrationSql).toContain('to authenticated');
    expect(createPalletMigrationSql).not.toMatch(
      /grant execute[^;]+to\s+(public|anon)/is,
    );
  });
});

describe('Store Pallet protected operation source', () => {
  it('keeps actor, lifecycle, rack validation, and occupancy server-authoritative', () => {
    expect(storePalletMigrationSql).toContain('actor_id uuid := auth.uid()');
    expect(storePalletMigrationSql).toContain(
      "selected_pallet.lifecycle_status <> 'created'",
    );
    expect(storePalletMigrationSql).toContain(
      "destination.location_type <> 'rack'",
    );
    expect(storePalletMigrationSql).toContain('order by location.id');
    expect(storePalletMigrationSql).toContain('for update;');
    expect(storePalletMigrationSql).toContain(
      "occupying_pallet.lifecycle_status <> 'shipped'",
    );
    expect(storePalletMigrationSql).toContain("message = 'LOCATION OCCUPIED'");
  });

  it('updates current state and inserts a zero-quantity-change event atomically', () => {
    expect(storePalletMigrationSql).toContain(
      'update public.pallets as pallet',
    );
    expect(storePalletMigrationSql).toContain("lifecycle_status = 'stored'");
    expect(storePalletMigrationSql).toContain(
      'insert into public.inventory_transactions',
    );
    expect(storePalletMigrationSql).toContain("'stored',");
    expect(storePalletMigrationSql).toContain(
      'selected_pallet.current_location_id',
    );
    expect(storePalletMigrationSql).toContain('normalized_idempotency_key');
  });

  it('serializes retries and limits execution to authenticated callers', () => {
    expect(storePalletMigrationSql).toContain(
      'pg_catalog.pg_advisory_xact_lock',
    );
    expect(storePalletMigrationSql).toContain('IDEMPOTENCY KEY CONFLICT');
    expect(storePalletMigrationSql).toContain('security definer');
    expect(storePalletMigrationSql).toContain("set search_path = ''");
    expect(storePalletMigrationSql).toContain(
      'revoke all on function public.store_pallet',
    );
    expect(storePalletMigrationSql).toContain('to authenticated;');
    expect(storePalletMigrationSql).not.toMatch(
      /grant execute[^;]+to\s+(public|anon)/is,
    );
  });
});

describe('Count protected operation source', () => {
  it('locks and compares reviewed state before writing without mutating pallet quantities', () => {
    expect(countPalletMigrationSql).toContain('for update of pallet');
    expect(countPalletMigrationSql).toContain('p_expected_current_boxes');
    expect(countPalletMigrationSql).toContain('p_expected_current_pieces');
    expect(countPalletMigrationSql).toContain('p_expected_current_location_id');
    expect(countPalletMigrationSql).toContain('INVENTORY CHANGED');
    expect(countPalletMigrationSql).not.toMatch(/update public\.pallets/);
  });

  it('uses snapshot math, one pending request, and linked zero-delta audit events', () => {
    expect(countPalletMigrationSql).toContain(
      'pieces_per_box_snapshot::bigint',
    );
    expect(countPalletMigrationSql).toContain(
      'adjustment_requests_one_pending_per_pallet_idx',
    );
    expect(countPalletMigrationSql).toContain(
      'insert into public.adjustment_requests',
    );
    expect(countPalletMigrationSql).toContain(
      'insert into public.inventory_transactions',
    );
    expect(countPalletMigrationSql).toContain("'count_matched'");
    expect(countPalletMigrationSql).toContain("'adjustment_requested'");
    expect(countPalletMigrationSql).toContain('ADJUSTMENT ALREADY PENDING');
  });

  it('keeps the definer boundary authenticated and retries idempotently', () => {
    expect(countPalletMigrationSql).toContain('actor_id uuid := auth.uid()');
    expect(countPalletMigrationSql).toContain('security definer');
    expect(countPalletMigrationSql).toContain("set search_path = ''");
    expect(countPalletMigrationSql).toContain(
      'pg_catalog.pg_advisory_xact_lock',
    );
    expect(countPalletMigrationSql).toContain('IDEMPOTENCY KEY CONFLICT');
    expect(countPalletMigrationSql).toContain(
      'from public, anon, authenticated',
    );
    expect(countPalletMigrationSql).toContain('to authenticated;');
  });
});

describe('supervisor adjustment decision migration source', () => {
  it('captures pallet version and count-time lifecycle without reconstructing old requests', () => {
    expect(adjustmentDecisionsMigrationSql).toContain(
      'add column inventory_version bigint',
    );
    expect(adjustmentDecisionsMigrationSql).toContain(
      'pallets_bump_inventory_version',
    );
    expect(adjustmentDecisionsMigrationSql).toContain(
      'adjustment_requests_capture_count_context',
    );
    expect(adjustmentDecisionsMigrationSql).toContain(
      'count_inventory_version is null',
    );
  });

  it('locks pallet before request and enforces the V1 zero-result policy inside approval', () => {
    expect(adjustmentDecisionsMigrationSql).toContain('for update of pallet');
    expect(adjustmentDecisionsMigrationSql).toContain('for update;');
    expect(adjustmentDecisionsMigrationSql).toContain(
      'selected_pallet.inventory_version <> selected_request.count_inventory_version',
    );
    expect(adjustmentDecisionsMigrationSql).toContain(
      'ZERO BALANCE NOT SUPPORTED',
    );
    expect(adjustmentDecisionsMigrationSql).toContain(
      'CANNOT APPROVE OWN REQUEST',
    );
    expect(adjustmentDecisionsMigrationSql).toContain(
      'pieces_per_box_snapshot::bigint',
    );
  });

  it('keeps both decisions at an authenticated-only security-definer boundary', () => {
    expect(adjustmentDecisionsMigrationSql).toContain(
      'actor_id uuid := auth.uid()',
    );
    expect(adjustmentDecisionsMigrationSql).toContain(
      "profile.role = 'supervisor'",
    );
    expect(adjustmentDecisionsMigrationSql).toContain(
      "security definer set search_path = ''",
    );
    expect(adjustmentDecisionsMigrationSql).toContain(
      'pg_catalog.pg_advisory_xact_lock',
    );
    expect(adjustmentDecisionsMigrationSql).toContain('IDEMPOTENCY CONFLICT');
    expect(adjustmentDecisionsMigrationSql).not.toMatch(
      /grant execute[^;]+to\s+(public|anon)/is,
    );
  });
});

describe('V1 fictional seed source', () => {
  it('contains the documented fictional parts and repeatable inserts', () => {
    for (const partNumber of [
      'MM-A141',
      'MM-A3815',
      'MM-A1212',
      'MM-A586',
      'MM-SC343',
      'MM-SC785',
      'MM-SC18',
    ]) {
      expect(seedSql).toContain(partNumber);
    }

    expect(seedSql).toContain('on conflict (part_number) do update');
    expect(seedSql).toContain('join public.parts using (part_number)');
    expect(seedSql).toContain('on conflict (part_id) do update');
    expect(seedSql).toContain('on conflict (location_code) do update');
  });

  it('uses positive, internally consistent fictional packing values', () => {
    const packingRows = [
      ...seedSql.matchAll(
        /\('(MM-[A-Z0-9]+)', (\d+), (\d+), (\d+\.\d+), (\d+\.\d+)\)/g,
      ),
    ];

    expect(packingRows).toHaveLength(7);

    for (const row of packingRows) {
      const piecesPerBox = Number(row[2]);
      const boxesPerPallet = Number(row[3]);
      const boxWeight = Number(row[4]);
      const palletWeight = Number(row[5]);

      expect(piecesPerBox).toBeGreaterThan(0);
      expect(boxesPerPallet).toBeGreaterThan(0);
      expect(boxWeight).toBeGreaterThan(0);
      expect(palletWeight).toBe(boxWeight * boxesPerPallet);
    }
  });

  it('defines unique fictional location codes', () => {
    const locationCodes = [
      ...seedSql.matchAll(
        /'((?:B-\d{3}-[A-Z]{2}|PACKING-01|SHIPPING-STAGING-01))'/g,
      ),
    ].map((match) => match[1]);

    expect(locationCodes).toHaveLength(16);
    expect(new Set(locationCodes).size).toBe(locationCodes.length);
  });
});
