# Reverse Engineering Summary — AWS Calculator RPA Extension

**Document Version**: 1.0  
**Created**: 2026-07-15  
**Project**: AWS Calculator RPA Chrome Extension (v6)

---

## Executive Summary

Comprehensive reverse engineering of the AWS Calculator RPA Extension v6 has been completed. This internal automation tool at Applying transforms JSON specifications into shareable AWS cost estimates by automating the AWS Pricing Calculator UI end-to-end.

---

## What This Extension Does

**Business Value**: Reduces estimate creation time from 15-30 minutes to 1-2 minutes (90-95% time savings)

**Technical Approach**: RPA (Robotic Process Automation) — acts as a virtual user that programmatically interacts with calculator.aws DOM at machine speed

**Core Flow**:
1. User pastes JSON specification into popup
2. Extension injects content script into calculator.aws tab
3. For each service: scan form → ask Claude (via n8n) to map fields → fill form → save
4. Rename estimate, generate public share URL, return to user

---

## Architecture Overview

```
popup.js (UI) → chrome.scripting → content.js (RPA Engine) → calculator.aws DOM
                                           ↓
                                    n8n webhook → Claude API
```

**Components**:
- **popup.html/js** (147 + 88 lines) — UI layer, orchestration
- **content.js** (1,193 lines) — RPA engine with 9 documented fixes
- **n8n webhook** — External "brain" for Claude AI field mapping

---

## Key Findings

### Strengths
✅ Sophisticated DOM scanner handles 10+ field types  
✅ 9 documented fixes for CloudScape edge cases (FIX-1 through FIX-9)  
✅ Two-round Claude interaction (expand → map) for accuracy  
✅ Visual spotlight feedback during RPA execution  
✅ Defensive programming with multiple fallback strategies  

### Critical Issues
🔴 **P1: Brain Location** — n8n webhook is single point of failure, CORS fragility  
🟡 **P2: Selector Resilience** — 14 months stale, AWS UI may have changed  
🟡 **P3: Silent Failures** — No error feedback to user when things break  
🟢 **P4: Repo Hygiene** — No git, stale manifest permissions  

---

## Component Breakdown

| Component | Lines | Complexity | Risk |
|-----------|-------|------------|------|
| manifest.json | 26 | Low | Low |
| popup.html | 147 | Low | Low |
| popup.js | 88 | Medium | Low |
| **content.js** | **1,193** | **Very High** | **High** |
| n8n webhook | N/A | Unknown | **Critical** |

**Highest Complexity**: content.js with 42 functions across 18 modules

---

## Technology Stack

- **Platform**: Chrome Extension Manifest V3
- **Language**: JavaScript ES6+ (vanilla, no build step)
- **UI**: HTML + CSS (dark theme, Applying branding)
- **Target**: CloudScape Design System (AWS)
- **Intelligence**: Anthropic Claude API (via n8n)
- **Testing**: None (no unit tests, no integration tests)

---

## Critical Dependencies

1. **n8n Webhook** (⚠️ Status Unknown)
   - `https://n8n-retirado.example/webhook/aws-field-mapper`
   - CRITICAL: Extension non-functional without this
   - Must verify with REVIVAL_PLAN Test C

2. **AWS Calculator UI** (⚠️ Possibly Stale)
   - `https://calculator.aws/`
   - Selectors may be outdated after 14 months
   - Must verify with REVIVAL_PLAN Test B

3. **Chrome Extension Platform** (✅ Stable)
   - Manifest V3, Chrome 88+
   - Standard APIs: tabs, scripting, runtime, clipboard

---

## Documented Fixes (Already Implemented)

These fixes solve CloudScape UI edge cases:

- **FIX-1**: Clean aria-label placeholders (CloudWatch, KMS, SageMaker)
- **FIX-2**: Parse Unit button labels (ELB, WAF)
- **FIX-3**: Section resolution fallback (CloudWatch)
- **FIX-4**: Toggle resolution via aria-labelledby (Bedrock, SageMaker)
- **FIX-5**: Instance radio detection (EC2 tables)
- **FIX-6**: Radiogroup name from heading (EC2)
- **FIX-7**: Toggle timing — apply BEFORE scanForm (Bedrock, SageMaker conditional fields)
- **FIX-8**: Unit button element resolution (ELB, WAF)
- **FIX-9**: Toggle search via aria-labelledby in setToggle()

---

## Known Issues (from REVIVAL_PLAN.md)

### P1: Brain Location (CRITICAL)
- n8n webhook is external single point of failure
- Fragile to CORS and downtime
- **Fix**: Move to background service worker + direct Claude API

### P2: Selector Resilience (HIGH)
- CloudScape selectors may be stale after 14 months
- **Fix**: Test and update selectors, add automated tests

### P3: Silent Failures (MEDIUM)
- Errors logged to console but not shown to user
- **Fix**: Add warning messages to popup

### P4: Repo Hygiene (LOW)
- No git, stale permissions in manifest
- **Fix**: `git init`, update manifest.json

---

## Reverse Engineering Artifacts Generated

1. ✅ **Business Overview** — Transaction flows, value proposition, stakeholders
2. ✅ **Architecture Documentation** — Component interaction, message passing, data flow
3. ✅ **Code Structure Analysis** — File-by-file breakdown, 42 functions cataloged
4. ✅ **Technology Stack** — Platform, APIs, frameworks, deployment
5. ✅ **Component Inventory** — 18 modules in content.js, dependencies mapped
6. ✅ **Interaction Diagrams** — 16 Mermaid diagrams (flows, sequences, state machines)
7. ✅ **Dependencies** — 3 critical dependencies analyzed with risk assessment
8. ✅ **Known Issues** — P1-P4 + FIX-1 through FIX-9 documented

**Total Documentation**: 8 comprehensive documents

---

## Recommended Revival Approach

### Phase 0: Verification (BEFORE touching code)
1. **Test A**: Verify content script injection
2. **Test B**: Verify selectors against current AWS UI
3. **Test C**: Verify n8n webhook status and CORS

**Action**: Run REVIVAL_PLAN.md 3-phase diagnostic

### Phase 1: Quick Wins (P4)
- Initialize git
- Update manifest.json permissions
- Commit baseline

### Phase 2: Critical Fixes (P1, P3)
- Add error messages to popup
- Move n8n fetch to background worker OR plan Claude API migration

### Phase 3: Selector Updates (P2)
- Test services manually
- Update stale selectors
- Add automated tests

### Phase 4: Long-Term Architecture
- Remove n8n dependency (direct Claude API)
- Add comprehensive testing
- Implement selector auto-healing

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| n8n webhook down | Medium | Critical | Verify status (Test C), plan migration |
| Selectors stale | High | High | Test immediately (Test B), update |
| CORS blocks fetch | Medium | Critical | Move to background worker |
| AWS UI redesign | Low | High | Add automated selector tests |

---

## Key Metrics

- **Codebase Size**: ~1,454 lines
- **Complexity Hotspot**: content.js (1,193 lines, 42 functions)
- **Last Updated**: April-May 2025 (~14 months ago)
- **Test Coverage**: 0% (no tests)
- **External Dependencies**: 2 critical (n8n, AWS Calculator)
- **Documented Fixes**: 9 (FIX-1 through FIX-9)
- **Known Issues**: 4 (P1-P4)

---

## Next Phase: Requirements Analysis

With the current state fully documented, the next step is **Requirements Analysis** to:
1. Validate existing requirements docs against reverse-engineered understanding
2. Identify gaps between current state and desired state
3. Prioritize revival work (P1-P4 fixes + ReAct mode)
4. Clarify any ambiguities in requirements
5. Define success criteria for revival

**Estimated Depth**: Standard (requirements already documented, need validation and gap analysis)

---

## Conclusion

The AWS Calculator RPA Extension v6 is a **sophisticated automation tool with proven business value** (90-95% time savings). The codebase is well-structured with defensive programming patterns and 9 documented edge case fixes.

**Critical Risks**:
- External n8n dependency (P1) — must verify status before proceeding
- Selector staleness (P2) — 14 months without updates

**Recommended Action**: Run REVIVAL_PLAN Tests A, B, C to verify current state before proposing any changes.

The reverse engineering phase has established a complete baseline understanding. Ready to proceed to Requirements Analysis.
