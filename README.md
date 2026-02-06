# Petrozone Pulse System

A multi-branch Auto-Repair Order Management System designed to streamline operations across multiple automotive service branches with role-based access control, comprehensive audit logging, and branch-isolated data management.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [User Roles](#user-roles)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)

---

## Overview

Petrozone Pulse is an enterprise-grade auto-repair order management system that enables:

- **Multi-branch operations** with complete data isolation
- **Role-based access control (RBAC)** with granular permissions
- **Comprehensive audit logging** for compliance and accountability
- **Streamlined workflows** from customer intake to job completion

The system is designed to support various roles including Higher Management, POC Supervisors, Junior Supervisors, Receptionists, and Technicians, each with tailored dashboards and functionalities.

---

## Features

### Current Features (Phase 1 Complete)

- **Authentication & Authorization**
  - Secure login with Supabase Auth
  - JWT-based session management
  - Protected routes with role verification

- **Role-Based Access Control (RBAC)**
  - Five distinct user roles with specific permissions
  - Multi-role support per user
  - Multi-branch assignment support
  - Database-level security with Row Level Security (RLS)

- **Branch Management**
  - Create, update, and deactivate branches
  - Branch code and details management
  - User-to-branch assignment with primary branch designation

- **User Management**
  - Create users with roles and branch assignments
  - Update user roles and status
  - Assign/reassign users to branches

- **Audit Logging**
  - Comprehensive logging of all system actions
  - Login/logout event tracking
  - CRUD operation logging with old/new values
  - Immutable append-only audit trail

- **Role-Based Dashboards**
  - Customized sidebar navigation per role
  - Role-specific dashboard views
  - Responsive design for desktop and tablet

### Planned Features (Future Phases)

- Customer & Vehicle Management
- Quotation & Job Order Workflows
- Pricing Matrix Engine
- Inventory Management
- Notifications & Reminders
- Reporting & Analytics
- Performance Dashboards

---

## Technology Stack

| Layer      | Technology                           |
|------------|--------------------------------------|
| Frontend   | React 18, TypeScript, Vite, TailwindCSS |
| Backend    | Node.js, Express, TypeScript         |
| Database   | Supabase (PostgreSQL)               |
| Auth       | Supabase Auth + JWT                  |
| Security   | Row Level Security (RLS), RBAC       |
| Icons      | React Icons (Lucide)                |

---

## User Roles

### Higher Management (HM)
**Full system access and administrative capabilities**

| Access                  | Description                                |
|-------------------------|--------------------------------------------|
| Dashboard               | Overview and system statistics             |
| User Management         | Create, edit, and manage all system users  |
| Branch Management       | Create and manage all branches             |
| Inventory               | Full inventory access across branches      |
| Pricing Config          | Configure pricing rules and rates          |
| Order & Sales           | Access to all orders and sales data        |
| Reports                 | Generate system-wide reports               |
| Audit Logs              | Full audit trail access                    |
| Messages                | System messaging                           |
| Settings                | System configuration                       |

### POC Supervisor (POC)
**Branch operations and staff management**

| Access                  | Description                                |
|-------------------------|--------------------------------------------|
| Dashboard               | Branch operations overview                 |
| Inventory               | Branch inventory management                |
| Pricing Config          | View and manage branch pricing             |
| Orders                  | Manage branch orders                       |
| Reports                 | Generate branch reports                    |
| Customers               | Manage customer information                |
| Messages                | Staff and customer messaging               |

### Junior Supervisor (JS)
**Daily operations and technician supervision**

| Access                  | Description                                |
|-------------------------|--------------------------------------------|
| Dashboard               | Daily operations view                      |
| Inventory               | View and consume inventory                 |
| Pricing Config          | View pricing information                   |
| Orders                  | Manage and track orders                    |
| Reports                 | View operational reports                   |
| Customers               | Customer interaction                       |
| Messages                | Team messaging                             |

### Receptionist (R)
**Customer-facing operations**

| Access                  | Description                                |
|-------------------------|--------------------------------------------|
| Dashboard               | Daily customer overview                    |
| Orders                  | Create and track orders                    |
| Reports                 | Daily reports                              |
| Customers               | Customer intake and management             |
| Messages                | Customer communication                     |

### Technician (T)
**Job execution and status updates**

| Access                  | Description                                |
|-------------------------|--------------------------------------------|
| Dashboard               | Assigned jobs overview                     |
| Orders                  | View assigned orders                       |
| Reports                 | Job completion reports                     |
| Customers               | Customer interaction                       |
| Messages                | Team communication                         |

---

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm or yarn
- Supabase account and project

### Environment Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Petrozone-Pulse-System
   ```

2. **Configure Backend**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your Supabase credentials
   npm install
   ```

3. **Configure Frontend**
   ```bash
   cd frontend
   cp .env.example .env
   # Edit .env with your API URL and Supabase credentials
   npm install
   ```

4. **Set up Supabase**
   - Create required tables (user_profiles, user_roles, branches, etc.)
   - Configure Row Level Security policies
   - Set up authentication

### Running the Application

**Backend (Port 4000)**
```bash
cd backend
npm run dev
```

**Frontend (Port 5173)**
```bash
cd frontend
npm run dev
```

Access the application at `http://localhost:5173`

---

## Project Structure

```
Petrozone-Pulse-System/
├── backend/
│   ├── src/
│   │   ├── audit/          # Audit logging routes
│   │   ├── auth/           # Authentication routes
│   │   ├── config/         # Environment configuration
│   │   ├── lib/            # Supabase client setup
│   │   ├── middleware/     # Auth & RBAC middleware
│   │   ├── rbac/           # Role management routes
│   │   ├── routes/         # Branch routes
│   │   └── types/          # TypeScript type definitions
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── auth/           # Auth context & protected routes
│   │   ├── components/     # Reusable UI components
│   │   ├── lib/            # API client & Supabase setup
│   │   ├── pages/          # Page components
│   │   │   └── admin/      # Admin management pages
│   │   ├── types/          # TypeScript type definitions
│   │   └── validations/    # Form validation schemas
│   └── package.json
│
├── docs/
│   ├── requirements/       # Functional requirements
│   ├── checklist/          # Testing checklists
│   ├── CREDENTIALS.md      # Test user credentials
│   ├── PHASE1.md           # Phase 1 development guide
│   └── SYSTEM_CONCEPT.md   # System overview
│
└── README.md
```

---

## API Documentation

### Authentication Endpoints

| Method | Endpoint              | Description                |
|--------|----------------------|----------------------------|
| POST   | `/api/auth/login`    | User login                 |
| POST   | `/api/auth/logout`   | User logout                |
| GET    | `/api/auth/me`       | Get current user info      |
| POST   | `/api/auth/refresh`  | Refresh access token       |

### Branch Endpoints

| Method | Endpoint                    | Description                | Access  |
|--------|----------------------------|----------------------------|---------|
| GET    | `/api/branches`            | List all branches          | Auth    |
| GET    | `/api/branches/:id`        | Get branch details         | Auth    |
| POST   | `/api/branches`            | Create new branch          | HM only |
| PUT    | `/api/branches/:id`        | Update branch              | HM only |
| DELETE | `/api/branches/:id`        | Delete/deactivate branch   | HM only |
| GET    | `/api/branches/:id/users`  | Get branch users           | Auth    |

### RBAC Endpoints

| Method | Endpoint                        | Description                | Access  |
|--------|---------------------------------|----------------------------|---------|
| GET    | `/api/rbac/roles`               | List available roles       | HM only |
| GET    | `/api/rbac/users`               | List all users             | HM only |
| POST   | `/api/rbac/users`               | Create new user            | HM only |
| PUT    | `/api/rbac/users/:id/roles`     | Update user roles          | HM only |
| PUT    | `/api/rbac/users/:id/branches`  | Update user branches       | HM only |
| PUT    | `/api/rbac/users/:id/status`    | Activate/deactivate user   | HM only |

### Audit Endpoints

| Method | Endpoint                        | Description                |
|--------|--------------------------------|----------------------------|
| GET    | `/api/audit`                   | List audit logs            |
| GET    | `/api/audit/entity/:type/:id`  | Get entity audit history   |
| GET    | `/api/audit/user/:id`          | Get user activity logs     |
| GET    | `/api/audit/stats`             | Get audit statistics       |

---

## Security Features

- **Authentication**: Supabase Auth with JWT tokens
- **Authorization**: Backend middleware + Database RLS policies
- **Data Isolation**: Branch-level data separation enforced at database level
- **Audit Trail**: Immutable, append-only audit logs
- **Input Validation**: Frontend and backend validation
- **Session Management**: Secure token handling with refresh capability

---
