# Phase 1 – Foundation Development Guide (Copilot Context)

## Project Name
**Petrozone Pulse**  
Multi-Branch Auto-Repair Order Management System

This document defines **Phase 1 (Sprint 1)** implementation rules, scope, and development order.  
It is intended to be used as **primary context for GitHub Copilot** during development.

---

## Phase 1 Objective

Establish a **secure, role-based, branch-aware system foundation** that all future features can safely build upon.

Phase 1 focuses on **architecture, security, and correctness**, not business workflows or UI polish.

---

## Repository Structure (Authoritative)

Copilot must assume and respect the following structure:

```txt
petrozone-pulse/
├─ backend/
│  ├─ src/
│  │  ├─ auth/
│  │  ├─ rbac/
│  │  ├─ branches/
│  │  ├─ audit/
│  │  ├─ middleware/
│  │  └─ routes/
│  └─ package.json
│
├─ frontend/
│  ├─ src/
│  │  ├─ auth/
│  │  ├─ routes/
│  │  ├─ pages/
│  │  ├─ components/
│  │  ├─ validations/
│  │  └─ lib/
│  └─ package.json
│
├─ docs/
│  ├─ requirements/
│  └─ checklist/
│
└─ README.md
Reference Requirements (Mandatory)
Copilot must treat all files under /docs/requirements/ as the source of truth:

Functional and Non-Functional Requirements

Use Case Diagram

BPMN Analysis

User Stories

SYSTEM_CONCEPT.md

No requirements may be invented or assumed.

If behavior is unclear, implement the minimum safe and configurable solution.

Technology Stack (Locked for Phase 1)
Frontend: React + TypeScript

Backend: Node.js + TypeScript (Express or Fastify)

Database & Auth: Supabase (PostgreSQL)

Architecture: PERN

Security: Supabase Auth + Row Level Security (RLS)

Phase 1 Scope (Allowed Work)
1. Authentication
Integrate Supabase Auth

Enforce login for all protected routes

Session-based access only

User creation restricted to Admin/System roles

2. Role-Based Access Control (RBAC)
Define role templates:
HM (Higher Management)

POC (POC Supervisor)

JS (Junior Supervisor)

R (Receptionists)

T (Technician)

Users may have:

Multiple roles

Multiple branch assignments

RBAC must be enforced using:

Database-level RLS (primary)

Backend middleware (secondary)

Role checks must NOT be hardcoded in frontend UI

3. Branch Management
Branch is a first-class entity

Create, update, and view branch profiles

Branches must be linkable to:

Users

Customers

Vehicles

Branch isolation must be enforced at the database level

4. Mandatory Field Enforcement
Identify critical fields for all Phase 1 entities

Enforce validation:

Frontend (form-level blocking)

Backend (request-level validation)

Incomplete or invalid data must never be persisted

5. Audit Logging
Implement system-wide audit logging

Audit logs must record:

Login and logout events

Create / Update / Delete actions

Role and branch assignments

Audit logs must be:

Append-only

Immutable

Accessible only to authorized roles

6. Core Architecture Verification
Verify correctness of:

Login enforcement

RBAC behavior

Branch isolation

Audit log recording

Unit tests or manual verification are acceptable

Focus on correctness over coverage

Explicitly Out of Scope (Do NOT Implement)
Job orders or job workflows

Pricing matrices

Inventory management

Dashboards with real data

Reporting or analytics

Notifications or reminders

Performance optimization

UI polish or final design

If any of these appear during implementation, stop immediately.

Development Order (Strict)
Copilot must follow this order:

Authentication setup

RBAC models and enforcement

Branch schema and APIs

Mandatory field validation

Audit logging

Core verification and testing

Skipping or reordering steps is not allowed.

Architectural Rules (Non-Negotiable)
All security must be enforced server-side or at the database level

Supabase Row Level Security is mandatory for data protection

No business rules in frontend components

No hardcoded role checks

Audit logs must never be modified or deleted

Favor extensibility over completeness

Prefer configuration over conditional logic

Coding Standards
Write clean, readable, production-quality TypeScript

Use comments to explain intent, not obvious syntax

Keep modules small and focused

Avoid premature optimization

If uncertain, implement the minimum safe version and document assumptions

Documentation & Testing Requirement
As part of Phase 1, a manual testing checklist must be created at:

/docs/checklist/phase-1-checklist.md
The checklist must:

Use Markdown checkbox format (- [ ])

Be step-by-step and verifiable

Cover:

Environment setup

Authentication

RBAC

Branch assignment

Mandatory field validation

Audit log verification

Access restriction (negative tests)

Phase 1 Definition of Done
Phase 1 is complete only when:

All users must authenticate to access the system

RBAC correctly restricts access by role and branch

Branch data is fully isolated

Mandatory fields are enforced consistently

Audit logs record all key actions

Phase 1 checklist can be completed successfully

This document is a contract for Phase 1.

No Phase 2 development may begin until Phase 1 is verified and complete.