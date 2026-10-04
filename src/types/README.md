# Supabase Database Types

The generated Supabase schema type will live at:

```text
src/types/database.generated.ts
```

That file is intentionally absent in Mission 2 because this repository is not linked to a remote Supabase project and a local Supabase/PostgreSQL runtime is not available. Do not hand-author a file and label it as generated.

After the migration has been applied to a local Supabase instance, generate the type from the database that actually ran it:

```bash
npx supabase gen types typescript --local --schema public > src/types/database.generated.ts
```

For a linked development project, use its project ID instead:

```bash
npx supabase gen types typescript --project-id <project-id> --schema public > src/types/database.generated.ts
```

Application data-access modules should import `Database` from that generated module once it exists. The generated file should not be edited manually.
