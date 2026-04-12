# Contributing

Thanks for helping improve Studio.

## Setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Before Opening a Pull Request

Run the baseline checks:

```bash
pnpm typecheck
pnpm test:stability:quick
```

If you changed generation logic, templates, or repair behavior, also run:

```bash
pnpm test:workspace:eval
```

## Development Notes

- Keep the UI local-first unless the change explicitly introduces server persistence
- Prefer small, inspectable prompt/runtime changes over large hidden rewrites
- For template workbench changes, attach screenshots or short recordings when possible
- For generation changes, include the prompt or scenario that motivated the fix

## Pull Request Tips

- Explain the user-facing problem first
- Call out any behavior changes in generation, template manifest extraction, or review/repair
- Mention test coverage and any intentionally deferred follow-up work
