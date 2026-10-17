# Kazi Mobile

A React Native (Expo) rebuild of the ERP app at https://github.com/jenithroy/kazi-app.

This project targets feature parity with the web ERP, using Expo Router + React Query and module-by-module UI implementation from the Claude Design source.

## Tech Stack

- Expo SDK 57
- React Native 0.86
- React 19
- TypeScript
- Expo Router (file-based routing)
- React Query (mock data layer for now)

## Prerequisites

- Node.js 20+ recommended
- npm 10+ recommended
- For mobile testing:
  - Android Studio emulator, or
  - iOS Simulator (macOS), or
  - Expo Go on a physical device

## Setup

1. Clone the repository.
2. Install dependencies:

```bash
npm install
```

## Run the App

Start the Expo dev server:

```bash
npm run start
```

Then use one of these options:

- Press `a` in the terminal (or run `npm run android`) for Android.
- Press `i` in the terminal (or run `npm run ios`) for iOS (macOS only).
- Press `w` in the terminal (or run `npm run web`) for web.

Direct run commands:

```bash
npm run android
npm run ios
npm run web
```

## Type Checking

Run TypeScript checks:

```bash
npx tsc --noEmit
```

## Project Structure

- src/app: Expo Router routes and layouts
- src/screens: screen-level UI by module
- src/data: per-module mock API, hooks, and types
- src/components: shared UI primitives and app components
- src/theme: centralized design tokens and theme provider

## Current Progress

- Phases 0-5: completed
- Phase 6: Accounting and Employees and HR completed
- Phase 6 pending: Attendance and Directors
- Phase 7 pending: Admin Panel, Messenger, Changelog

For detailed build status and conventions, see [BUILD_PLAN.md](BUILD_PLAN.md).

## Notes

- The app currently uses typed mock data behind React Query hooks.
- Backend wiring (planned Firebase integration) is not connected yet.
- Follow versioned Expo docs for SDK 57: https://docs.expo.dev/versions/v57.0.0/
