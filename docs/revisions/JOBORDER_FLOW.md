**Workflow Logic**

The Job Order lifecycle is structured as a controlled state progression that reflects the real operational journey of a service job. A Job Order begins in DRAFT, which represents a configurable state where scope and pricing are still being constructed. During this stage, authorized users may add packages, select individual services or products, apply pricing matrices, and recompute totals. The job is not yet committed to the customer. Once the scope and pricing are finalized, the Job Order transitions to PENDING\_APPROVAL. This state indicates that the customer has been asked to approve the exact scope and total amount. At this point, the system freezes all scope and pricing fields because this is what the customer is reviewing. No further edits to line items or totals are permitted.

If the customer provides consent, the job moves to APPROVED, which means the system now allows operational execution to begin. From here, a technician may transition the job into IN\_PROGRESS, which marks the start of actual work and triggers time tracking. When work is completed, the job moves to READY\_FOR\_RELEASE, indicating operational completion but not yet formal closure. Finally, once the job is formally closed by an authorized manager or point-of-contact, it transitions to COMPLETED, becoming read-only and reportable. There are also alternative outcomes. A job in PENDING\_APPROVAL may move to REJECTED if the customer declines the scope or pricing. A job in DRAFT or PENDING\_APPROVAL may move to CANCELLED if operations halt for internal reasons. Every transition between states requires specific preconditions and triggers system-level actions such as logging and timestamping. No state change is allowed unless all defined conditions are satisfied.

| Status | Operational meaning | Editable scope/pricing? | Next best action |
| :---: | ----- | :---: | ----- |
| **DRAFT** | JO created from a finalized JE; scope/pricing can be built | Yes | Request Approval |
| **PENDING\_APPROVAL** | Approval requested; waiting for customer decision | No | Record Approval / Reject |
| **APPROVED** | Customer approved; ready to start work | No | Start Work |
| **IN\_PROGRESS** | Work is ongoing | No | Update Progress / Mark Ready |
| **READY\_FOR\_RELEASE** | Work done; awaiting closure | No | Complete Job |
| **COMPLETED** | Closed; reporting-only | No | View Summary |
| **REJECTED** | Customer declined | No | Create Revised Estimate (new JE) |
| **CANCELLED** | Stopped/called off | No | View Cancellation Details |

| From → To | Allowed roles | Preconditions (hard gates) | System actions (atomic) | Block error |
| :---: | :---: | ----- | ----- | ----- |
| **DRAFT → PENDING\_APPROVAL** | R, T | has\_line\_items=true; total\>0; approval\_contact or approval\_method=MANUAL; all matrix-priced items resolved | create ApprovalLog(request); ActivityLog(STATUS\_CHANGE); set approval\_status=REQUESTED; set approval\_requested\_at | “Missing scope/total/contact or unresolved pricing.” |
| **PENDING\_APPROVAL → APPROVED** | R, T | approval\_method present; approval\_timestamp present | update ApprovalLog(approved); ActivityLog(STATUS\_CHANGE); set approval\_status=APPROVED; set approved\_at | “Approval details incomplete.” |
| **PENDING\_APPROVAL → REJECTED** | R, T | rejection\_reason present | update ApprovalLog(rejected); ActivityLog(STATUS\_CHANGE); set approval\_status=REJECTED; set rejected\_at | “Provide rejection reason.” |
| **APPROVED → IN\_PROGRESS** | T | assigned\_technician\_id present | set start\_time if null; ActivityLog(STATUS\_CHANGE) | “Assign technician first.” |
| **IN\_PROGRESS → READY\_FOR\_RELEASE** | T | (optional) checklist\_complete=true | ActivityLog(STATUS\_CHANGE) | “Completion checklist not met.” |
| **READY\_FOR\_RELEASE → COMPLETED** | HM, POC | completion\_time set or auto-set allowed | set completion\_time if null; ActivityLog(STATUS\_CHANGE) | “Missing completion time.” |
| **DRAFT → CANCELLED** | POC, JS, R | cancellation\_reason present | set cancelled fields; ActivityLog(STATUS\_CHANGE) | “Provide cancellation reason.” |
| **PENDING\_APPROVAL → CANCELLED** | POC, R | cancellation\_reason present | set cancelled fields; ActivityLog(STATUS\_CHANGE) | “Provide cancellation reason.” |

| Action type | Allowed roles | Allowed statuses | Notes |
| :---: | ----- | :---: | ----- |
| **Add Package to JO** | POC, JS, R | DRAFT only | Package expands into line items |
| **Add Service/Product item** | POC, JS, R | DRAFT only | Item becomes a line item |
| **Apply Pricing Matrix** | POC, JS, R | DRAFT only | Resolves unit prices via matrix |
| **Recompute totals** | POC, JS, R | DRAFT only | Must log pricing computation |
| **Edit line item qty/override price** | POC, JS | DRAFT only | If you allow overrides, store override reason |
| **Progress updates (notes, time logs)** | POC, R, T | IN\_PROGRESS primarily | Must be audit-logged |
| **Soft delete JO** | POC, JS, R | DRAFT only | Removes from active lists; keeps audit |

**Data Integrity Expectations**

The Job Order stores a historical snapshot of all information relevant to the transaction. This includes customer details, vehicle information, selected packages, expanded line items, computed totals, and any pricing matrix trace used to determine prices. These values are copied into the Job Order and treated as authoritative transaction records.

Once a Job Order moves into PENDING\_APPROVAL, the snapshot becomes immutable. Scope, pricing, and matrix-derived values cannot be altered beyond this point. This ensures that what the customer approved is preserved exactly as it was at the moment of consent.

The system enforces several structural constraints. Only one active Job Order may exist per Job Estimate. Deletions are soft deletes only, meaning the record is flagged but never physically removed from the database. Timestamps must follow logical order — approval time cannot precede request time, and completion time cannot precede start time. Any line item priced through a matrix must store the resolved unit price so that historical reporting does not depend on future matrix changes. Field requirements evolve as the job progresses. At creation, a valid estimate reference, branch, and at least one line item are required. Before requesting approval, customer contact and resolved totals must be present. Before starting work, approval must be recorded and a technician assigned. Before completion, completion time must be set. These stage-based requirements ensure the system mirrors real operational rigor.

| Data domain | Snapshot contents | Source | Lock point |
| :---: | ----- | :---: | ----- |
| **Customer snapshot** | name, address, contact | From JE initially | Locks at PENDING\_APPROVAL |
| **Vehicle snapshot** | year/make/model/plate/km/time-in | From JE initially | Locks at PENDING\_APPROVAL |
| **Scope snapshot** | final line items to be performed \+ totals | Built in JO DRAFT (from packages/items) | Locks at PENDING\_APPROVAL |
| **Pricing trace** | matrix identifiers \+ inputs \+ resolved prices | From matrix selection | Locks at PENDING\_APPROVAL |

| Constraint | Rule | Implementation note |
| :---: | ----- | ----- |
| **One active JO per JE** | Only one JO where je\_id matches AND is\_deleted=false AND status NOT IN (CANCELLED, REJECTED) | Partial unique index or service guard |
| **Immutability after approval request** | Once status=PENDING\_APPROVAL or beyond: line items/totals/pricing trace cannot change | Enforce server-side (reject update) |
| **Soft delete only** | delete sets is\_deleted=true, deleted\_at, deleted\_by | Do not remove child rows |
| **Idempotent approval request** | If already PENDING\_APPROVAL with approval\_status=REQUESTED: only “Resend Approval” allowed (same payload hash or new log entry with resend flag) | Prevent duplicates |
| **Timestamp coherence** | approved\_at ≥ approval\_requested\_at; start\_time ≥ approved\_at; completion\_time ≥ start\_time | Validate on writes |
| **Matrix resolution completeness** | Any line item flagged “matrix\_priced” must have resolved\_unit\_price | Block request approval otherwise |

| Field | DRAFT (create) | Before Request Approval | Before Start Work | Before Complete |
| :---: | :---: | :---: | :---: | :---: |
| **je\_id** | Req | Req | Req | Req |
| **branch\_id** | Req | Req | Req | Req |
| **customer\_name\_snapshot** | Req | Req | Req | Req |
| **customer\_contact\_snapshot** | Opt | Req (unless manual approval method) | Req | Req |
| **vehicle\_plate\_snapshot** | Opt | Opt | Opt | Opt |
| **job\_order\_line\_items (\>=1)** | Req | Req | Req | Req |
| **total\_amount\_snapshot (\>0)** | Req | Req | Req | Req |
| **pricing\_matrix\_trace (if used)** | Opt | Req (if any matrix-priced items exist) | Req | Req |
| **assigned\_technician\_id** | Opt | Opt | Req | Req |
| **approval\_method** | — | — | Req (via ApprovalLog) | Req |
| **approval\_timestamp** | — | — | Req | Req |
| **start\_time** | Opt | Opt | Req (auto-set ok) | Req |
| **completion\_time** | — | — | — | Req (auto-set ok) |
| **cancellation\_reason** | — | — | — | — (only when cancelling) |

**COMPLIANCE / AUDIT EXPECTATIONS**

Every significant action within a Job Order must generate an audit trail. Creating a Job Order records the creator and timestamp. Any scope modification during DRAFT records the delta in line items and totals. Every pricing computation records the breakdown and, if applicable, the pricing matrix trace used.

Requesting approval logs the method, timestamp, and payload reference. Recording approval logs the decision, time, and actor. Every status transition logs the previous and new state. Cancellation records the reason and responsible user. Even soft deletion must record who performed it and when.

Audit logs are append-only. They cannot be deleted or rewritten. Approval records are permanent once written. This ensures the system behaves like a transactional ledger capable of reconstructing every operational and pricing decision.

| Capability | HM | POC | JS | R | T |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **Create JO from JE (UC31)** | Optional | Yes | Yes | Yes | No |
| **View JO list/detail (UC32)** | Yes | Yes | Yes | Yes | Yes |
| **Build scope: add package/item \+ apply matrix** | Optional | Yes | Yes | Yes | No (recommended) |
| **Update JO (non-scope fields)** | Limited | Yes | Yes | Yes | Yes (progress only) |
| **Delete JO (UC34)** | No | Yes (DRAFT only) | Yes (DRAFT only) | Yes (DRAFT only) | No |
| **Request approval (UC35)** | No | No | No | Yes | Yes |
| **Record approval (UC36)** | No | No | No | Yes | Yes |
| **Start work** | No | No | No | No | Yes |
| **Mark ready** | No | Limited | No | No | Yes |
| **Complete job** | Yes | Yes | No | No | No |
| **Export reports** | Yes | Yes | Optional | Optional | No |

| Event | When it fires | Must capture |
| :---: | ----- | ----- |
| **JO\_CREATED** | UC31 successful create | jo\_id, je\_id, actor, timestamp, snapshot\_summary |
| **JO\_SCOPE\_CHANGED** | any add/remove/override in DRAFT | delta (line items \+ totals), actor, timestamp |
| **JO\_PRICING\_COMPUTED** | totals recalculated in DRAFT | pricing\_summary \+ matrix\_trace delta, actor, timestamp |
| **APPROVAL\_REQUESTED** | DRAFT→PENDING\_APPROVAL | request\_channel/method, contact, payload\_hash, requested\_at, actor |
| **APPROVAL\_RECORDED** | PENDING\_APPROVAL→APPROVED/REJECTED | method, approval\_timestamp, result, remarks, actor |
| **STATUS\_CHANGED** | any transition | from/to, actor, timestamp |
| **JO\_CANCELLED** | cancel transition | reason, actor, cancelled\_at |
| **JO\_SOFT\_DELETED** | UC34 | deleted\_by, deleted\_at |

