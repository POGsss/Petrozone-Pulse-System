# Petrozone Pulse – Project Setup & Phase 1 Development Guide

This document defines the **approved folder structure**, **project setup steps**, and a **Phase 1 (Sprint 1) development guide** intended to be used directly as context for GitHub Copilot.

This is a **FOUNDATION document**. Do not skip steps.

---

## 1. Approved Folder Structure (Sprint 1)

This project intentionally uses a **simple backend / frontend split** to reduce friction and speed up development.

petrozone-pulse/
├─ frontend/                    # React application (JavaScript)
│  ├─ src/
│  │  ├─ auth/                  # Auth context, guards
│  │  ├─ routes/                # Protected & public routes
│  │  ├─ components/            # Shared UI components
│  │  ├─ validations/           # Form validation rules
│  │  ├─ lib/                   # Supabase client, helpers
│  │  └─ pages/                 # Page-level components
│  ├─ public/
│  └─ package.json
│
├─ backend/                     # Node.js API
│  ├─ src/
│  │  ├─ auth/                  # Auth middleware, helpers
│  │  ├─ rbac/                  # Role & permission logic
│  │  ├─ branches/              # Branch domain logic
│  │  ├─ audit/                 # Audit logging
│  │  ├─ middleware/            # Request middleware
│  │  └─ routes/                # API routes
│  ├─ tests/                    # Core module tests
│  └─ package.json
│
├─ supabase/                    # Supabase-related assets
│  ├─ migrations/               # SQL migrations
│  ├─ rls/                      # RLS policies
│  └─ seed.sql                  # Initial seed data
│
├─ docs/
│  ├─ requirements/             # Provided requirement files
│  └─ checklist/                # Testing checklists
│
├─ .env.example
└─ README.md

Folder Structure Rules
Do not collapse frontend and backend into one app
Do not over-engineer monorepos in Sprint 1
Keep domains separated (auth, rbac, audit)
Copilot must respect this structure when generating files

2. Project Setup Guide (Step-by-Step)
2.1 Repository Initialization
Create a new Git repository

Initialize folders:
frontend/
backend/
supabase/
docs/requirements/
docs/checklist/
Commit the empty structure

2.2 Frontend Setup
Create React app using Vite
Use TypeScript

Install dependencies:
react-router-dom
@supabase/supabase-js
form validation library (e.g. zod or yup)

Create Supabase client inside:
frontend/src/lib/supabase.js

2.3 Backend Setup
Initialize Node.js project
Use Express or Fastify

Install dependencies:
cors
dotenv
@supabase/supabase-js

Create entry point:
backend/src/index.js
Add basic health check route (/health)

2.4 Supabase Setup
Create Supabase project
Enable Email/Password auth
Configure environment variables:
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

Create base SQL migrations:
branches
roles
users ↔ branches mapping
audit_logs
Implement Row Level Security (RLS)

2.5 Environment Configuration
Create .env.example
Mirror env vars for frontend and backend
Never commit real secrets

3. Phase 1 Development Guide (Sprint 1)
Phase 1 Goal
Establish a secure, branch-aware, role-based system backbone with auditability.
No business workflows are finalized in this phase.

4. Phase 1 Development Order (IMPORTANT)
Copilot should follow this order strictly.

Step 1: Authentication
Integrate Supabase Auth
Enforce login for all protected routes
Ensure sessions persist correctly
Restrict user creation to Admin/System roles

Step 2: Role-Based Access Control (RBAC)
Define role templates:
Admin
HM
POC
JS
R
T

Implement role-to-user mapping
Enforce access rules using:
Supabase RLS (primary)
Backend middleware (secondary)
No role checks hardcoded in UI

Step 3: Branch Management
Create branch entity
Allow create / update / view branches

Link branches to:
Users
Customers
Vehicles
Enforce branch isolation at DB level

Step 4: Mandatory Field Enforcement
Identify critical fields (IDs, names, references)

Enforce validation:
Frontend (form blocking)
Backend (request validation)
Reject incomplete or invalid submissions

Step 5: Audit Logging
Create append-only audit_logs table

Log:
Authentication events
Create / Update / Delete actions
Role and branch assignments
Ensure audit logs cannot be modified or deleted

Step 6: Core Architecture Testing
Verify login enforcement
Verify role restrictions
Verify branch isolation
Verify audit log entries
Add minimal tests or manual verification scripts

5. Phase 1 Rules for Copilot (Non-Negotiable)
Do NOT implement job workflows
Do NOT implement pricing logic
Do NOT implement inventory movement
Do NOT implement dashboards with real data
Do NOT implement reports or analytics
Do NOT optimize prematurely

If a feature is unclear:
Implement the minimum safe version
Leave a TODO
Document the assumption

6. Phase 1 Definition of Done
Phase 1 is complete when:
Users must log in to access the system
RBAC works correctly
Branch data is isolated correctly
Mandatory fields are enforced
Audit logs are recorded consistently
Manual testing checklist can be completed successfully

This document is intended to be used as:
A Copilot context file
A developer execution guide
A Sprint 1 boundary contract

Do not proceed to Sprint 2 until Phase 1 is verified.