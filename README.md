# CallPro CRM — Multi-Team Call Center Enterprise Platform

A production-grade, offline-first, multi-team Call Center CRM platform built to manage cold calling, leads, customers, callbacks, chronological conversations, team assignments, team leaders, agents, and management reporting with granular RBAC, audit logs, CSV import/export, and VoIP/AI integrations.

---

## 🚀 Quick Start

### 1. Launch the CRM Server
```powershell
& "C:\Program Files\PostgreSQL\17\pgAdmin 4\python\python.exe" run.py
```
Open your browser at: **`http://127.0.0.1:5050`** (or `5000` if custom PORT set)

### 2. Pre-Configured Test Accounts (Section 62)
| Role | Username | Password | Assigned Team | Permissions Scope |
|---|---|---|---|---|
| **Super Admin** | `admin` | `admin123` | All Teams | Unrestricted company-wide |
| **Team Leader A** | `leader_a` | `leader123` | Team A | Full Team A leads & agents |
| **Team Leader B** | `leader_b` | `leader123` | Team B | Full Team B leads & agents |
| **Agent 1 (Ali)** | `agent_ali` | `agent123` | Team A | Own leads + Team A leads |
| **Agent 2 (Ahmed)**| `agent_ahmed` | `agent123` | Team A | Own leads + Team A leads |
| **Agent 3 (Sara)** | `agent_sara` | `agent123` | Team B | Own leads + Team B leads |

---

## 🏗️ Architecture & Features

### 1. Offline-First Architecture (Sections 24–27)
- **Local IndexedDB (`CallProCRM_DB`)**: Stores customers, calls, callbacks, conversations, and metadata locally.
- **Sync Queue**: Captures offline mutations with timestamp and local UUIDs.
- **Conflict Resolution**: Server detects simultaneous updates; non-destructively merges metadata while preserving call history, and records conflicts in `SyncConflict`.
- **Offline Simulator**: Toggle the online/offline pill in the header to simulate network disconnection and test offline cold calling.

### 2. Dedicated Cold-Calling Cockpit (Section 37)
- **3-Column Layout**:
  - **Left**: Customer contact details, industry, previous terminal provider, and tags.
  - **Center**: Live duration timer, one-click outcome dispositions (Interested, Converted, Callback Requested, etc.), call notes, next action, and inline callback scheduler.
  - **Right**: Complete chronological conversation timeline.

### 3. Multi-Team Dynamic RBAC (Sections 2–5, 16–18, 29)
- Server-side scope filters prevent agents from viewing cross-team data.
- Controlled "Assign to Team Leader" workflow.
- Team-to-team transfers with approval tracking.

### 4. Automated Test Suite (Section 55 & 62)
Run the full 14-test verification suite:
```powershell
& "C:\Program Files\PostgreSQL\17\pgAdmin 4\python\python.exe" run_tests.py
```
Includes full automated verification of Section 62: Final Acceptance Test.
