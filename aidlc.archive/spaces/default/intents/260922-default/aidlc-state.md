# AI-DLC State — AWS Calculator RPA Extension Revival

**Project**: AWS Calculator RPA Chrome Extension (Manifest V3)  
**Started**: 2026-07-15T11:57:37-05:00  
**Type**: Brownfield (existing v6 codebase)  
**Status**: In Progress

---

## Workspace Context

- **Project Type**: Chrome Browser Extension (Manifest V3)
- **Technology Stack**: Vanilla JavaScript, Chrome Extension APIs, CloudScape UI
- **Architecture**: RPA (Robotic Process Automation)
  - `popup.js`: UI orchestrator
  - `content.js`: Injected DOM automation script
  - External dependency: n8n webhook (Claude-powered field mapper)
- **Target Site**: https://calculator.aws/
- **Last Modified**: April–May 2025 (~14 months stale)
- **Version Control**: None (first priority quick win)

### Existing Codebase Files
```
aws-calculator-extension/
├── manifest.json          # MV3 config
├── popup.html            # Extension UI (Spanish)
├── popup.js              # UI controller + message handler
├── content.js            # RPA engine (scanForm, executeActions, etc.)
├── icon16.png, icon48.png, icon128.png
└── REVIVAL_PLAN.md       # Diagnosis (3-phase test plan)

requirements/
├── calculator-rpa-requirements.md  # Complete FR/NFR specs
└── constraints.md                  # Technical constraints
```

### Critical Architecture Details
- **"Brain" location**: External n8n webhook (`https://n8n-retirado.example/webhook/aws-field-mapper`)
- **Problem P1** (from REVIVAL_PLAN): Brain lives outside repo, fragile to CORS and downtime
- **Core primitives**: 
  - `scanForm()`: Universal DOM scanner (inputs, selects, CloudScape dropdowns, radios, toggles, sliders, instance tables)
  - `resolveElementByLabel()`: Intelligent element resolver
  - `executeActions()`: Applies Claude's mapped actions

---

## Extension Configuration

No extensions loaded yet.

---

## Workflow Execution Plan

### 🔵 INCEPTION PHASE

- [x] **Workspace Detection** — COMPLETED (2026-07-15T11:57:37-05:00)
  - Detected: Brownfield project with existing v6 implementation
  - No previous reverse engineering artifacts found
  - Next: Reverse Engineering

- [x] **Reverse Engineering** — COMPLETED (2026-07-15T12:25:56-05:00)
  - Business overview analysis — ✅ DONE
  - Architecture documentation — ✅ DONE
  - Code structure analysis — ✅ DONE
  - Technology stack inventory — ✅ DONE
  - Component inventory — ✅ DONE
  - Interaction diagrams — ✅ DONE
  - Dependencies mapping — ✅ DONE
  - Known issues analysis — ✅ DONE
  - Summary document — ✅ DONE
  - **Artifacts**: 9 documents, 3,191 lines
  - Next: Requirements Analysis

- [ ] **Requirements Analysis** — REQUIRED
  - Depth: Standard (requirements already documented, need validation)
  - Intent analysis
  - Gap analysis (current state vs requirements)
  - Clarifying questions if needed

- [ ] **User Stories** — TO BE ASSESSED
  - Will assess after Requirements Analysis

- [ ] **Workflow Planning** — REQUIRED
  - Determine Construction phase depth
  - Multi-package change sequence (if applicable)

- [ ] **Application Design** — TO BE ASSESSED
  - Will determine after Workflow Planning

- [ ] **Units Generation** — TO BE ASSESSED
  - Will determine after Workflow Planning

### 🟢 CONSTRUCTION PHASE

Status: Not started (pending Inception completion)

### 🟡 OPERATIONS PHASE

Status: Not started (pending Construction completion)

---

## Current Stage

**Active**: Workspace Detection  
**Status**: ✅ COMPLETED

**Next**: Reverse Engineering (brownfield with no artifacts)

---

## Decisions Log

### Decision 1: Workflow Type
- **Context**: User wants to "revive and resume" existing v6 implementation
- **Assessment**: Brownfield project (~14 months stale, no git history)
- **Decision**: Full Reverse Engineering required before any changes
- **Rationale**: Code is complex (1,100+ lines in content.js), has external dependencies, and contains undocumented fixes (FIX-1 through FIX-9). Must understand current state before proposing changes.

---

## Notes

- REVIVAL_PLAN.md provides excellent 3-phase diagnostic approach (Tests A, B, C)
- Critical: n8n webhook status unknown — must verify in Reverse Engineering
- Quick wins identified: init git, fix manifest permissions, improve error feedback
- 9 documented fixes in content.js (FIX-1 through FIX-9) — need to understand context
