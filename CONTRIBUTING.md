# Contributing to Kazi App

## Branch Naming

| Type | Pattern | Example |
|---|---|---|
| Feature | `feat/<short-description>` | `feat/edit-vat-bill` |
| Bug fix | `fix/<short-description>` | `fix/payment-modal-reset` |
| Chore / refactor | `chore/<short-description>` | `chore/update-dependencies` |

Always branch off `master`.

## Commit Messages

Use the format: `type: short summary`

```
feat: add cancelled documents section to billing
fix: reset editingId on cancel button click
chore: update .gitignore to exclude service account key
```

Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `style`

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Fill in the PR template (auto-loaded when you open a PR)
- At least one review before merging

## Local Setup

See the [README](README.md#getting-started) for full setup instructions.

## Security

- **Never commit** `.env`, `serviceAccountKey.json`, or any file containing API keys or private keys
- These are blocked by `.gitignore` — keep it that way
- If you accidentally expose a secret, rotate the key immediately
