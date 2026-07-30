# Local backup and restore rehearsal

The purpose is to prove that a schema and data snapshot can be restored without changing a remote environment.

1. Reset the local Supabase database from migrations.
2. Run all pgTAP and integration contracts.
3. Create schema and data dumps with checksums in a temporary directory.
4. Restore them into a disposable local PostgreSQL database.
5. Compare table, function, policy, and migration counts.
6. Run owner-isolation and critical read smoke queries against the restored database.
7. Destroy only the explicitly named disposable database and temporary dump directory.
8. Record command output, checksums, timings, and any baseline warnings in the validation report.

Hosted recovery time and storage-provider restoration remain unproven until a separately authorized hosted rehearsal is completed.
