# Reverse Engineering Phase — Planning

**Project**: AWS Calculator RPA Extension  
**Phase Start**: 2026-07-15T11:58:00-05:00  
**Target**: Existing v6 implementation (~14 months stale)

---

## Artifacts to Generate

### 1. Business Overview
- [ ] End-to-end business transaction flow
- [ ] User personas and use cases
- [ ] Value proposition and business impact

### 2. Architecture Documentation
- [ ] High-level architecture diagram
- [ ] Component interaction patterns
- [ ] Message passing flows (popup ↔ content ↔ n8n)
- [ ] External dependencies

### 3. Code Structure Analysis
- [ ] File-by-file responsibility breakdown
- [ ] Key functions and their purposes
- [ ] Data structures and schemas
- [ ] Error handling patterns

### 4. API Documentation
- [ ] Chrome Extension APIs used
- [ ] n8n webhook contract (request/response)
- [ ] AWS Calculator DOM structure expectations

### 5. Component Inventory
- [ ] popup.js components
- [ ] content.js modules
- [ ] Shared utilities and constants

### 6. Interaction Diagrams
- [ ] Add service flow
- [ ] DOM scanning sequence
- [ ] Claude mapping rounds (prepare + map)
- [ ] Error recovery flows

### 7. Technology Stack
- [ ] Runtime: Chrome Extension APIs
- [ ] Language: JavaScript (ES6+)
- [ ] UI: HTML/CSS (CloudScape patterns)
- [ ] External: n8n + Claude (Anthropic API)

### 8. Dependencies Documentation
- [ ] Chrome APIs: activeTab, scripting, clipboardWrite, tabs
- [ ] Host permissions: calculator.aws, n8n.cloud
- [ ] External service: n8n webhook (critical dependency)
- [ ] DOM libraries: none (vanilla JS)

### 9. Known Issues Analysis
- [ ] P1: Brain location (CORS, downtime risk)
- [ ] P2: Selector resilience (CloudScape changes)
- [ ] P3: Silent failures
- [ ] P4: Repo hygiene (no git, stale permissions)
- [ ] FIX-1 through FIX-9 context

---

## Execution Order

1. Business Overview (understand the "why")
2. Architecture Documentation (understand the "what")
3. Code Structure Analysis (understand the "how")
4. Component Inventory (catalog the pieces)
5. Interaction Diagrams (visualize the flows)
6. API Documentation (understand the contracts)
7. Technology Stack (understand the tools)
8. Dependencies (understand the requirements)
9. Known Issues (understand the problems)

---

## Notes

- All diagrams will use Mermaid syntax (per content-validation.md)
- Code examples will reference actual line numbers from source files
- Known issues will link to REVIVAL_PLAN.md diagnostics
