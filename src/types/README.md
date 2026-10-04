# Supabase Database Types

The Supabase schema type generated from the linked development database lives at:

```text
src/types/database.generated.ts
```

It was generated after the repository migration executed successfully against the dedicated Supabase development project. Do not edit it manually or replace it with hand-authored database shapes.

After any schema migration is applied, regenerate the type from the database that actually ran it:

```bash
npx --yes supabase@2.119.0 gen types typescript --linked --schema public > src/types/database.generated.ts
```

For a local Supabase runtime, use:

```bash
npx --yes supabase@2.119.0 gen types typescript --local --schema public > src/types/database.generated.ts
```

The shared Supabase client imports `Database` from this module so future data-access code receives schema-generated types at the boundary.
