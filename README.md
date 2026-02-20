# Petrozone Pulse System

A multi-branch Auto-Repair Order Management System designed to streamline operations across multiple automotive service branches with role-based access control, comprehensive audit logging, and branch-isolated data management.

## Production Branch
This is the `main` branch. It contains the **stable, production-ready** code that is deployed to the live environment.
All code here has been tested, reviewed, and verified before merging.
For active development and upcoming features, switch to the [`development`](../../tree/development) branch.

## Branch Strategy

| Branch | Purpose | Stability |
|--------|---------|-----------|
| `main` | Production-ready code. Deployed to live environment. | Stable |
| `development` | Active development. New features, bug fixes, and experiments. | Unstable |

## Workflow

1. All new features and fixes are developed on the `development` branch
2. Once a module/sprint is complete and tested, `development` is merged into `main`
3. Major version tags (v1.0.0, v2.0.0, etc.) are created on `main` at merge points
4. Minor/patch version tags (v2.1.0, v2.0.1) may be created on `development` to track progress

## Versioning

This project uses [Semantic Versioning]:
- **Major** (x.0.0) — New module/sprint merged to main
- **Minor** (0.x.0) — New feature added
- **Patch** (0.0.x) — Bug fix or cleanup

See [Releases](../../releases) for the full version history.