<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project conventions

- UI text is Hebrew; layout is RTL. Use logical Tailwind classes (`ms-`, `pe-`, `start-`, `end-`), never left/right.
- Business logic lives in `src/modules/<domain>/service.ts`. Services take the acting user (`actor`) and enforce
  permissions themselves via `src/modules/permissions/check.ts`. Pages and `actions.ts` files stay thin.
- Server actions wrap service calls with `runAction` (`src/lib/action.ts`); client components call them via `useAction`.
- Client components must not value-import services, firebase or session code; put shared types/constants in a
  `types.ts` next to the service. `npm run lint` enforces this (`scripts/check-client-imports.mjs`).
- Every schedule mutation goes through `applyChanges` in `src/modules/schedule/engine.ts`.
- Audit entries are written in the same transaction as the change (`auditInTx`).
- New Firestore queries with range/order + filters need an entry in `firestore.indexes.json` (the emulator does not enforce indexes).
- Checks before pushing: `npm run lint && npm run typecheck && npm test && npm run test:integration && npm run build`.
