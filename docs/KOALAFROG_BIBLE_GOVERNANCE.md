# Koalafrog Bible governance

## Adding or changing an article

1. Audit the implemented route, labels, domain types, actions, validation, repository behavior, migrations, RLS, empty states, and relevant tests.
2. Add or update one typed `BibleArticle` in `bibleContent.ts`. Required metadata is enforced by TypeScript and tests: ID, canonical title, section/order, summary, audience, verification status/date, routes, entities, workflows, related articles, keywords, sources reviewed, limitation status, and non-empty content blocks.
3. Add a major route to `majorRouteBibleMap` when it enters primary navigation. A deliberate exemption must be documented below with owner, reason, and review date.
4. Add limitations in the affected article and centralized limitations register. Never describe roadmap intent as current behavior.
5. Run `npm run test:bible`, `npm test`, lint, build, secret scan, and broken-link checks. Verify desktop and exactly 390px.

## Status and terminology

`verified` means checked against the current repository on `lastVerified`. `partial` means the route exists but material behavior is incomplete. `limitation` is a centralized constraint article. Use exact UI labels and domain enum capitalization. “Approved,” “Completed,” “Active,” “Released,” and “Launched” must be qualified as internal where authority could be misunderstood.

## Links, screenshots, and roadmap changes

Related article IDs must resolve. Heading IDs are deterministically derived from headings. Prefer text instructions over screenshots; any screenshot must record app version and review date. A roadmap item that changes behavior must include a Bible review in its definition of done.

## Navigation exemptions

There are no current major-navigation exemptions. Suppliers and Equipment have explicit limitation articles rather than exemptions.

## Review checklist

- Behavioral claim has an implementation source.
- Prerequisites, aftermath, authority, immutability, status, mistakes, and limitations are explicit.
- Cross-links and contextual route mapping work.
- No credentials, project URL, private binary, or sensitive developer configuration is indexed.
- Search returns a useful excerpt.
- Article and long content remain usable at 390px without destructive page overflow.
