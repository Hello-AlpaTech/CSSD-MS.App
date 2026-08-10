# CSSD Security Specification

## 1. Data Invariants
- **Role Control**: No user should be allowed to modify their own `role` or elevate themselves to `admin` or `supervisor`.
- **Global Settings Access**: Global settings (`settings/general`) should only be writable by authentic users with the `admin` or `supervisor` roles.
- **Workflow State Machines**: Updates to workflow stage logs must conform strictly to expected stage sequences or be limited to specific actions matching the user's role.
- **Instrument catalog**: General users (operators) cannot modify or delete instrument catalog entries; they can only read them. Catalog updates require `admin` or `supervisor` roles.
- **Clinical distribution**: Requests must not be modified or deleted once they reach terminal states (e.g. fulfilled or rejected), except by administrators.

---

## 2. The "Dirty Dozen" Rogue Payloads
Here are 12 rogue JSON payloads representing malicious attempts to compromise data:

### Identity & Privilege Escalation (PI-01 - PI-04)
1. **Rogue Payload 1: Self-assigned Admin Role**
   `POST /users/attacker-uid { "uid": "attacker-uid", "role": "admin", "active": true }`
   *Malicious Intent*: Elevating attacker to `admin` role from the client SDK.

2. **Rogue Payload 2: Hostile profile hijack**
   `PATCH /users/target-uid { "role": "admin" }` (by non-admin user)
   *Malicious Intent*: Forcing an escalation or editing another user's role.

3. **Rogue Payload 3: Spoofing active status**
   `POST /users/inactive-attacker { "active": true }` (when set as false by admin)
   *Malicious Intent*: Activating a disabled or blacklisted user account.

### Operational State & Inventory Poisoning (OP-01 - OP-04)
4. **Rogue Payload 4: Arbitrary Machine State Hijack**
   `PATCH /machines/mach-steam-buma { "status": "running", "type": "washer" }`
   *Malicious Intent*: Changing the machine type and bypassing validation.

5. **Rogue Payload 5: Spoofing Instrument Total Stock**
   `PATCH /instruments/inst-minor-set { "totalStock": 999999 }` (by operator)
   *Malicious Intent*: Poisoning inventory catalog stock count.

6. **Rogue Payload 6: Negative Stock Adjustment for BMHP**
   `PATCH /bmhp_catalog/bmhp-bandage { "stockQty": -50 }`
   *Malicious Intent*: Injecting invalid negative stock levels.

7. **Rogue Payload 7: Ghost Stock Log Injection**
   `POST /bmhp_logs/rogue-log-id { "bmhpId": "bmhp-bandage", "qty": -1000, "type": "out" }`
   *Malicious Intent*: Discrepancy logging without catalog adjustments.

### Workflow & Storage Spoofing (WS-01 - WS-04)
8. **Rogue Payload 8: Workflow Stage Shortcutting**
   `PATCH /workflow_logs/LOT-20260716-001 { "currentStage": "sterile_storage" }` (bypassing wash/pack/sterile validation)
   *Malicious Intent*: Shortcutting decontamination directly into sterile storage.

9. **Rogue Payload 9: Spoofing Negative Temperature in environmental logs**
   `POST /environmental_logs/rogue-env-log { "temperatureCelsius": -273, "humidityPercent": 100 }`
   *Malicious Intent*: Corrupting environmental compliance logs with absolute zero values.

10. **Rogue Payload 10: Unauthorized clinical request fulfillment**
    `PATCH /distribution_logs/REQ-1001 { "status": "fulfilled", "fulfilledLots": [] }` (without proper validation)
    *Malicious Intent*: Artificially status-marking a request fulfilled without tracking.

11. **Rogue Payload 11: System-generated field poisoning (cycle logs)**
    `PATCH /machine_cycles/cycle-log-id { "temperatureCelsius": 500, "pressureBar": 15.0 }`
    *Malicious Intent*: Forging accreditation temperature/pressure records.

12. **Rogue Payload 12: Bypassing sterile stock location rules**
    `PATCH /sterile_stock/LOT-20260716-001 { "status": "expired", "qty": -500 }`
    *Malicious Intent*: Invalidating active medical packs and deleting stock quantities.

---

## 3. Test Runner Execution Structure
The security rules test suite structure executes these queries and asserts that they return `PERMISSION_DENIED` for unauthorized roles.

```ts
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";

describe("CSSD Zero-Trust Firestore Security Rules", () => {
  it("should block non-admin users from updating global settings", async () => {
    const db = getUnauthenticatedDb();
    await assertFails(setDoc(doc(db, "settings", "general"), { appName: "Hacked!" }));
  });

  it("should block users from modifying their own roles", async () => {
    const db = getAuthDb({ uid: "user-123", email: "user@rsud.id" });
    await assertFails(updateDoc(doc(db, "users", "user-123"), { role: "admin" }));
  });
});
```
