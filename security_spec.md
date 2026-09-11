# Security Specification for EVOLVE GESTÃO Firestore Database

This document outlines the security architecture, invariants, and threat models for the EVOLVE GESTÃO system.

## 1. Core Data Invariants

1. **Authentication Boundary**: No unauthenticated client can read or write to any collection.
2. **Identity Lock**: Standard users cannot modify or self-assign roles or credentials. User profiles can only be updated/read by the actual owner or authorized personnel.
3. **Immutability of Key Fields**: Once a proposal is created, its `proposalNumber`, `clientId`, `createdAt`, and `originalOwnerId` (if any) cannot be mutated.
4. **Valid Reference Constraint**: Referencing entities (such as proposals referencing a client, bank, product, promoter, or partner) must have those referenced IDs verified or structurally locked.
5. **Workflow State Guard**: Standard digitizers can only transition proposals across permitted states and cannot shortcut terminal states like "PAGO", "CANCELADO", or "REPROVADO" without proper authorization.
6. **PII Protection**: Personally Identifiable Information (PII) like borrower CPFs, emails, and phone numbers in `clients` must be read-restricted to signed-in users.
7. **Audit Preservation**: Audit log entries are strictly write-once, read-only. Standard users can never delete or update audit logs.

---

## 2. The "Dirty Dozen" Malicious Payloads

The following payloads represent exploit attempts to bypass business rules or compromise security. They must be rejected by the security rules with `PERMISSION_DENIED`.

### Payload 1: Privilege Escalation (Self-Admin Role Injection)
*   **Target Collection**: `/users/attacker-uid`
*   **Attack Vector**: Attacker attempts to register a new user or update their own profile with `role: "MASTER"`.
*   **Payload**:
    ```json
    {
      "id": "attacker-uid",
      "name": "Malicious User",
      "email": "attacker@evil.com",
      "role": "MASTER",
      "active": true,
      "createdAt": "2026-09-10T20:45:00Z",
      "updatedAt": "2026-09-10T20:45:00Z"
    }
    ```

### Payload 2: ID Poisoning & Resource Exhaustion (Denial of Wallet)
*   **Target Collection**: `/promoters/POISON_ID_999999... [1000 characters]`
*   **Attack Vector**: Attacker attempts to write a document with a massive ID string consisting of junk characters to exhaust indexing storage.
*   **Payload**:
    ```json
    {
      "id": "POISON_ID_999999_A_REALLY_LONG_MALICIOUS_STRING_TO_EXHAUST_RESOURCES...",
      "name": "EXPLOIT_PROMOTER",
      "active": true,
      "createdAt": "2026-09-10T20:45:00Z",
      "updatedAt": "2026-09-10T20:45:00Z"
    }
    ```

### Payload 3: Illegal State Transition Shortcutting (Terminal State PAGO Hijack)
*   **Target Collection**: `/proposals/prop-123`
*   **Attack Vector**: Standard digitizer updates status to `PAGO` (st-9) directly without actual integration verification.
*   **Payload**:
    ```json
    {
      "statusId": "st-9",
      "currentResponsible": "SISTEMA",
      "paidAt": "2026-09-10T20:45:00Z"
    }
    ```

### Payload 4: Overwriting Immutable Field (Tampering proposalNumber)
*   **Target Collection**: `/proposals/prop-123`
*   **Attack Vector**: Attacker attempts to change the structural proposal number of an existing contract.
*   **Payload**:
    ```json
    {
      "proposalNumber": "HACKED_NUMBER_999999"
    }
    ```

### Payload 5: Anonymous Guest Exploitation
*   **Target Collection**: `/clients/cli-456`
*   **Attack Vector**: Attempt to read borrower records or create clients without active, verified authentication.
*   **Payload**: (Sent as unauthenticated connection)
    ```json
    {
      "fullName": "ANONYMOUS READ ATTEMPT"
    }
    ```

### Payload 6: Spoofing Owner Identity (Ghost Client Attribution)
*   **Target Collection**: `/proposals/prop-new`
*   **Attack Vector**: Creating a proposal under another digitizer's ID (`digitizerId`) to frame them or steal credit commissions.
*   **Payload**:
    ```json
    {
      "id": "prop-new",
      "proposalNumber": "12345678",
      "clientId": "cli-maria-jose",
      "productId": "prod-port",
      "bankId": "bank-c6",
      "promoterId": "prom-dg",
      "partnerId": "part-kauai",
      "digitizerId": "u-other-digitizer-id",
      "statusId": "st-1",
      "currentResponsible": "CLIENTE",
      "createdAt": "2026-09-10T20:45:00Z",
      "updatedAt": "2026-09-10T20:45:00Z"
    }
    ```

### Payload 7: Audit Log Erasure
*   **Target Collection**: `/audit_logs/audit-1`
*   **Attack Vector**: Attacker attempts to delete or clear audit log documents to hide fraudulent behaviors.
*   **Action**: `delete` operation on `/audit_logs/audit-1`.

### Payload 8: Illegal Client CPF Malformatting
*   **Target Collection**: `/clients/cli-bad`
*   **Attack Vector**: Attacker inserts a CPF with invalid structure (e.g. 20-character alphabet string) to crash parsing utilities on client dashboard.
*   **Payload**:
    ```json
    {
      "id": "cli-bad",
      "cpf": "NOT_A_CPF_XYZ",
      "fullName": "SPOOFED CLIENT",
      "createdAt": "2026-09-10T20:45:00Z",
      "updatedAt": "2026-09-10T20:45:00Z"
    }
    ```

### Payload 9: Mutating Closed Holiday Records
*   **Target Collection**: `/holidays/h-1`
*   **Attack Vector**: Attacker attempts to change the date of an official holiday to disrupt SLA calculation batch jobs.
*   **Payload**:
    ```json
    {
      "date": "2026-09-15"
    }
    ```

### Payload 10: Injecting Ghost Fields (Shadow Update Attack)
*   **Target Collection**: `/partners/part-kauai`
*   **Attack Vector**: Attempting to inject unmapped variables like `isBypassed: true` or `vipLevel: 100` into partner records.
*   **Payload**:
    ```json
    {
      "id": "part-kauai",
      "fullName": "KAUAI AMORIM GOUVEIA",
      "login": "KAUAI@16740",
      "promoterId": "prom-dg",
      "active": true,
      "ghostField_isBypassed": true,
      "createdAt": "2026-01-01T00:00:00Z",
      "updatedAt": "2026-09-10T20:45:00Z"
    }
    ```

### Payload 11: Fake Simulation Request
*   **Target Collection**: `/simulation_requests/sim-fake`
*   **Attack Vector**: Creating a pre-sales loan simulation and self-assigning it as approved `DIGITADA PELA MESA` without review.
*   **Payload**:
    ```json
    {
      "id": "sim-fake",
      "cpf": "01138777498",
      "partnerId": "part-kauai",
      "createdById": "attacker-uid",
      "status": "DIGITADA PELA MESA",
      "createdAt": "2026-09-10T20:45:00Z",
      "updatedAt": "2026-09-10T20:45:00Z"
    }
    ```

### Payload 12: Blanket Data Scraping Attack (Query Trust Bypass)
*   **Target Collection**: `/notifications`
*   **Attack Vector**: Attacker queries the complete list of notifications belonging to all other users in the system without specific filtering criteria.
*   **Action**: Global `list` query execution on `/notifications` collection.

---

## 3. Threat Model Evaluation and Rules Verification

The upcoming `firestore.rules` will implement:
- **Default-deny** catch-all for unauthorized access.
- Valid identifier constraints (`isValidId()`).
- Full attribute schema integrity with `isValid[Entity]()`.
- Action-level validation via `affectedKeys().hasOnly(...)`.
- Immortality of historical trails (audit logs and status histories).
