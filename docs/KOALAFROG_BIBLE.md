# Koalafrog Bible

The Koalafrog Bible is the repository-versioned, in-app operations manual at `/knowledge/bible`. It is deliberately static at runtime: no model call, hosted documentation table, or duplicated domain record is required.

## Architecture

The canonical typed manifest is `src/features/knowledge/bible/bibleContent.ts`. It owns article metadata, content blocks, cross-links, search input, and the major-route help mapping. `BiblePage.tsx` renders the index, search results, article table of contents, breadcrumbs, related links, and previous/next navigation. `ContextualGuideLink.tsx` preserves the current route in a `from` query parameter.

The manifest is the executable content source because Vite does not currently provide a Markdown content pipeline. The `docs/bible` hierarchy is the editorial and audit index; do not copy article prose into a second runtime manifest.

## Traceability and current audit

Content was checked against application routes, `src/types/domain.ts`, feature domain logic/tests, repository boundaries, Supabase migrations/RPC/RLS, platform backup code, and the existing architecture documents on 2026-07-16. Implementation wins when an older planning document disagrees.

Known boundaries found during audit:

- Phase 10A implements Suppliers, procurement planning, and Equipment. Existing raw-material and packaging Supplier Products remain in their owning domains and link to normalized Suppliers.
- Finished Goods and Platform are implemented routes but are not primary sidebar items.
- Local remains the development default in startup configuration; a controlled hosted deployment must explicitly select Supabase. There is no runtime fallback or dual write.
- Historical Intelligence runs can legitimately lack usage/cost metadata.

See [governance](KOALAFROG_BIBLE_GOVERNANCE.md), the [limitations register](../src/features/knowledge/bible/bibleContent.ts), and [backup guidance](BACKUP_AND_RESTORE.md).
