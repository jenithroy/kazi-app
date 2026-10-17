@AGENTS.md

# kazi-mobile

## What this is
A React Native (Expo) rebuild of the ERP app at [jenithroy/kazi-app](https://github.com/jenithroy/kazi-app). Goal is feature parity with that repo — same data/functionality — reimplemented as a mobile app.

## Current phase: building to the Claude Design UI
Full UI designs now exist — a style guide plus 20 interactive per-module screen prototypes, authored in Claude Design (not Google Stitch, which was the original plan; superseded), project `8b0bd055-9d76-4713-a6cc-2839ebf51432` ("Kazi mobile ERP style guide", https://claude.ai/design/p/8b0bd055-9d76-4713-a6cc-2839ebf51432). The app is being built out screen-by-screen to match those designs — visuals, interactions, and animations — via the `mcp__claude-design__*` tools.
- Styling: plain `StyleSheet` + a centralized `src/theme/` tokens module (no NativeWind/Tailwind).
- Data: frontend/mock-only for now — typed mock data behind a thin React Query hook boundary per module, so a real backend can be wired in later without touching components. Real backend is planned to be Firebase (matching the reference app), config to be provided by the user later.
- **See `BUILD_PLAN.md` (repo root) for current progress and exactly what to build next** — architecture conventions, reusable components, gotchas already solved, and the remaining phase-by-phase module list. Read it before starting any new work on this app; keep it updated as modules ship.

## Stack
- Expo ~57, React 19.2, React Native 0.86, TypeScript
- `expo-router` (file-based routing), `react-native-reanimated` + `react-native-gesture-handler` (animation), React Query (mock data layer)

## Skills installed (global, `~/.agents/skills/`)
- `expo-project-structure` — folder/file layout for a new Expo Router app
- `expo-router` — file-based routing, tabs, modals
- `expo-data-fetching` — API calls, caching, offline handling
- `react-native-best-practices` — perf: re-renders, bundle size, Hermes
- `vercel-react-native-skills` — general RN/Expo component & native-API patterns

Not installed yet (no dedicated skill for design-token/animation fidelity beyond the above — the Claude Design tokens extracted into `src/theme/` are the source of truth): `expo-native-ui`, `expo-design-system`, `expo-tailwind-setup`, `mobile-app-ui-design`.

## Source of truth for scope
Reference [jenithroy/kazi-app](https://github.com/jenithroy/kazi-app) for what modules/data/features the ERP needs to support.
