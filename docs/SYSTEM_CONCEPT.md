
# Petrozone Pulse Auto-Repair Order Management System
## System Conceptualization & Implementation Guide

---

## 1. System Actors / Roles

### Higher Management (HM)
- View multi-branch dashboards
- Review reports and analytics
- Access audit logs
- Monitor staff and branch performance

### Point-of-Contact Supervisor (POC)
- Manage quotations, estimates, job orders
- Approve workflows and pricing
- Manage pricing matrices
- Monitor inventory and staff performance

### Junior Supervisor (JS)
- Assist with job orders and estimates
- Manage daily operations
- Monitor branch-level dashboards
- Supervise technicians

### Receptionist (R)
- Customer and vehicle intake
- Create quotations, estimates, order cards
- Trigger customer approvals
- Generate daily reports and reminders

### Technician (T)
- View assigned jobs
- Update job status
- Consume inventory parts
- Request customer approvals

### System Administrator / Developer
- Manage users, roles, and branches
- Configure RBAC
- Maintain system and audit logs

---

## 2. Core End-to-End Workflows

### 2.1 Customer Service → Job Completion
Customer Intake → Quotation → Job Estimate → Customer Approval → Job Order  
Estimate → Approved → In-Progress → QC → Billing → Released

### 2.2 Inventory Replenishment
Low Stock Detected → PO Creation → Approval → Stock-In → Inventory Update

### 2.3 Pricing Matrix Management
Define Services/Products → Create/Edit Matrix → Validation → Propagation

### 2.4 Reporting & Analytics
Operational Data → Aggregation → Dashboards → Exportable Reports

### 2.5 Notifications & Reminders
System Event → Notification Trigger → In-App/Email → Audit Log

---

## 3. Role-Based Dashboards

### Management Dashboard
- Sales by branch
- Inventory health
- Vehicles in workshop
- Staff performance trends

### Supervisor Dashboard
- Active job orders
- Pending approvals
- Inventory alerts
- Revenue metrics

### Receptionist Dashboard
- Today’s customers
- Job progress
- Inventory availability
- Daily sales snapshot

### Technician Dashboard
- Assigned jobs
- Job status timeline
- Required parts

---

## 4. Screen / Page Inventory

### Authentication
- Login
- Forgot Password
- Change Password

### Dashboards
- Management Dashboard
- Operations Dashboard
- Technician Dashboard

### Order Fulfillment
- Customer Profile
- Vehicle Profile
- Quotation Builder
- Job Estimate
- Job Order Workflow
- Customer Approval

### Inventory
- Inventory Overview
- Purchase Orders
- Supplier Management

### Pricing
- Pricing Matrix List
- Pricing Matrix Editor

### Reporting & Analytics
- Report Builder
- Staff Performance Analytics

### Administration
- User Management
- Branch Management
- Notifications Configuration
- Audit Logs

---

## 5. High-Level System Architecture

### Layers
- Presentation Layer (Web / Tablet UI)
- Application Layer (Workflow, Pricing, Notifications, Reporting)
- Domain Services (Order, Inventory, CRM, Auth, Audit)
- Data Layer (Transactional DB, Analytics Store, Logs)

---

## 6. Non-Functional Requirements → Design Decisions

- Task ≤ 3 minutes → Optimized forms, templates
- Dashboard ≤ 30s refresh → Event-driven or cached aggregates
- RBAC → Policy-based authorization
- Scalability → Stateless services
- 99% uptime → Health checks, redundancy
- No-code config → Configurable tables and rules
- Audit trail → Immutable append-only logs
- Tablet usability → Responsive, touch-friendly UI

---

## 7. Gaps, Conflicts, and Assumptions

### Gaps
- Payment/billing integration
- SMS provider for reminders
- Offline mode for technicians

### Conflicts
- Real-time defined as both ≤30s and 1–5 mins → assume near real-time

### Assumptions
- Single currency
- Branch-owned inventory
- One active pricing matrix per branch
- Internet connectivity available

---

## 8. Step-by-Step Implementation Guide

### Phase 1: Foundations
1. RBAC and permissions
2. Audit logging
3. Branch-aware data model

### Phase 2: Core Flows
4. Customer & vehicle management
5. Pricing matrix engine
6. Quotation → Job order workflow

### Phase 3: Inventory & Automation
7. Inventory tracking & PO workflows
8. Notification engine

### Phase 4: Dashboards & Reporting
9. Analytics aggregation
10. Dashboard widgets
11. Report builder

### Phase 5: Hardening
12. Performance tuning
13. Validation and edge cases
14. Role-based UI refinement
