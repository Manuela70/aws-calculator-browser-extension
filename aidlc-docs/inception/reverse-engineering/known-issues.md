# Known Issues Analysis — AWS Calculator RPA Extension

**Document Version**: 1.0  
**Created**: 2026-07-15  
**Project**: AWS Calculator RPA Chrome Extension (v6)

---

## Issues Overview

This document catalogs known issues from REVIVAL_PLAN.md (P1-P4) and documented fixes in content.js (FIX-1 through FIX-9).

---

## REVIVAL_PLAN Problems (P1-P4)

### P1: Brain Location (CRITICAL)

**Status**: 🔴 **Blocker**  
**Severity**: Critical  
**Component**: Architecture

**Problem**:
The field-mapping "brain" (Claude AI logic) lives in an external n8n webhook at `https://n8n-retirado.example/webhook/aws-field-mapper`. The fetch runs from page context (calculator.aws origin) and is fragile to:
1. **CORS blocking**: If n8n doesn't return `Access-Control-Allow-Origin` header, browser blocks the request
2. **Downtime**: If n8n workflow is inactive or down, extension is completely non-functional
3. **Silent failures**: If webhook returns empty, RPA continues but doesn't fill any fields (P3)

**Impact**:
- Extension cannot function without n8n webhook
- No offline capability
- No control over uptime
- User has no visibility into webhook status

**Evidence**:
- `content.js:20` — Hardcoded n8n URL
- `content.js:86-95` — `callN8N()` runs fetch from page context
- `manifest.json` — Missing n8n host in `host_permissions` (P4)

**Proposed Solutions**:

**Option A: Background Service Worker** (Short-term fix)
- Move `fetch()` to background service worker
- Add `https://n8n-retirado.example/*` to `host_permissions`
- Fetch from extension context (not subject to CORS)
- Content script sends message to background, background fetches, returns result

**Option B: Direct Claude API** (Long-term fix)
- Remove n8n dependency entirely
- Call Anthropic Claude API directly from background service worker
- Store API key in `chrome.storage.local` (encrypted)
- User provides their own API key via popup settings

**Option C: Embed Logic** (Alternative)
- Move mapping logic into extension code
- Use rule-based mapping or local ML model
- Loses flexibility of Claude's intelligence

**Recommendation**: Option A short-term, migrate to Option B long-term

**Test to Verify**: REVIVAL_PLAN Test C

---

### P2: Selector Resilience (HIGH)

**Status**: 🟡 **Risk**  
**Severity**: High  
**Component**: content.js DOM selectors

**Problem**:
CloudScape selectors may be stale after ~14 months without AWS UI updates. The extension relies on:
- `awsui_*` class names (e.g., `awsui_option-content`, `awsui_selectable-item`)
- Button text ("Add service", "Configure", "Save", "Share")
- ARIA attribute patterns
- DOM structure assumptions

If AWS updates the Pricing Calculator UI (CloudScape version upgrade, redesign, localization), selectors break and RPA fails silently.

**Impact**:
- Buttons not found → RPA stuck
- Fields not resolved → no filling
- Save fails → estimate incomplete
- User sees "loading" forever, no clear error

**Evidence**:
- Last code update: April-May 2025 (~14 months ago)
- CloudScape is actively developed by AWS
- No selector validation tests

**High-Risk Selectors**:
- `[class*="awsui_option-content"]` — Dropdown options (content.js:702)
- `[class*="awsui_selectable-item"]` — Selectable items (content.js:717)
- `button[aria-expanded="false"]` — Section expansion (content.js:377)
- Button text matching — Multiple locations

**Proposed Solutions**:

**Option A: Verify and Update** (Immediate)
- Run REVIVAL_PLAN Test B against current calculator.aws
- Manually test each service type
- Update selectors as needed

**Option B: Add Selector Tests** (Short-term)
- Puppeteer integration tests
- Automated validation of critical selectors
- CI/CD to catch AWS UI changes

**Option C: Selector Auto-Healing** (Long-term)
- Detect when selectors fail
- Use Claude to analyze new DOM and suggest updated selectors
- Self-healing RPA

**Recommendation**: Option A immediately, Option B for ongoing maintenance

**Test to Verify**: REVIVAL_PLAN Test B

---

### P3: Silent Failures (MEDIUM)

**Status**: 🟡 **User Experience**  
**Severity**: Medium  
**Component**: Error handling throughout

**Problem**:
When errors occur, they are logged to console but NOT surfaced to the user in the popup:
- If n8n returns `[]` (empty actions), nothing happens, no error shown
- If selector not found, action skipped, logged, but no user feedback
- If service not found, logged but user sees "Processing..." forever

User has no visibility into what went wrong or whether RPA succeeded.

**Impact**:
- User doesn't know RPA failed
- Debugging requires opening DevTools console
- Poor user experience

**Evidence**:
- `content.js:104` — `prepareForm()` returns `[]` on error, no message to popup
- `content.js:113` — `mapFields()` returns `[]` on error, no message to popup
- `content.js:159` — `executeActions()` logs warnings, no error thrown
- `content.js:1184` — `addService()` catches errors but continues to next service

**Proposed Solutions**:

**Option A: Error Message System** (Short-term)
- Add new message type: `{ type: 'WARNING', message: '...' }`
- Send warning to popup when n8n returns empty
- Send warning when critical selectors not found
- Display warnings in popup status box (orange/yellow state)

**Option B: Error Accumulator** (Medium-term)
- Track all errors/warnings during RPA run
- Display summary at end: "3 of 5 services configured successfully"
- Show which services failed and why

**Option C: Verbose Mode** (Long-term)
- Add toggle in popup for verbose logging
- Stream real-time action log to popup
- Show exactly what RPA is doing at each step

**Recommendation**: Option A immediately (add warning messages)

---

### P4: Repo Hygiene (LOW)

**Status**: 🟢 **Quick Fix**  
**Severity**: Low  
**Component**: Project setup

**Problem**:
1. **No version control**: No git repository, hard to track changes
2. **Stale permissions**: `manifest.json` has dead host permission (`dnd5zrqcec4or.cloudfront.net`)
3. **Missing permission**: n8n host not in `host_permissions`

**Impact**:
- Can't track changes or revert
- Stale permissions clutter manifest
- Missing n8n permission → CORS workaround needed (P1)

**Evidence**:
- No `.git` directory in project
- `manifest.json:11` — `dnd5zrqcec4or.cloudfront.net` (unknown purpose)
- `manifest.json` — Missing `n8n-retirado.example`

**Proposed Solutions**:

**Fix 1: Initialize Git**
```bash
cd /home/manue/extension
git init
git add .
git commit -m "Initial commit - AWS Calculator RPA v6 baseline"
```

**Fix 2: Update manifest.json**
```json
"host_permissions": [
  "https://calculator.aws/*",
  "https://n8n-retirado.example/*"
]
```
Remove `dnd5zrqcec4or.cloudfront.net`

**Recommendation**: Apply both fixes immediately

---

## Documented Fixes (FIX-1 through FIX-9)

These are fixes already implemented in content.js v6. Documenting for context.

### FIX-1: cleanAriaLabel() (Line 23-35)

**Problem**: AWS embeds placeholders in aria-labels  
**Example**: `"Number of requests Enter amount"` (should be just `"Number of requests"`)  
**Services Affected**: CloudWatch, KMS, SageMaker, ELB, WAF  
**Solution**: Regex to strip patterns like "Enter amount", "Enter the number of..."

---

### FIX-2: parseUnitButtonLabel() (Line 37-56)

**Problem**: CloudScape Unit button aria-labelledby segments in inconsistent order  
**Example**: ELB has [section, "Unit", value], WAF has ["Unit", section, value]  
**Solution**: Semantic parsing — identify "Unit", section, value by content, not position

---

### FIX-3: resolveSection() Fallback (Line 429-444)

**Problem**: CloudWatch has no `role="group"` for sections  
**Solution**: Fallback to nearest preceding heading in DOM  
**Services Affected**: CloudWatch

---

### FIX-4: Toggle Resolution via aria-labelledby (Line 468-481)

**Problem**: Bedrock, SageMaker toggles have no `label[for]`  
**Solution**: Reconstruct label from `aria-labelledby` IDs  
**Services Affected**: Bedrock, SageMaker

---

### FIX-5: Instance Radio Detection (Line 497-506)

**Problem**: EC2 instance tables have radios without clear labels  
**Solution**: Detect `tr`/`role=row` context, extract row text as label  
**Services Affected**: EC2, RDS, any service with instance tables

---

### FIX-6: Radiogroup Name from Heading (Line 508-527)

**Problem**: Dynamic radiogroup names (`awsui-...`, numeric) are not human-readable  
**Solution**: Extract name from radiogroup's heading/legend  
**Services Affected**: EC2 pricing options

---

### FIX-7: Toggle Timing (Line 1126-1175)

**Problem**: Bedrock providers, SageMaker features are conditional fields — don't exist until toggle is ON  
**Solution**: Apply `__switch__` toggles BEFORE first `scanForm()`, wait 5s for DOM update  
**Services Affected**: Bedrock, SageMaker, any service with conditional fields

---

### FIX-8: Unit Button Resolution in resolveElementByLabel() (Line 611-630)

**Problem**: CloudScape Unit buttons have no `label[for]`, hard to find  
**Solution**: Reconstruct from aria-labelledby and match section + "Unit"  
**Services Affected**: ELB, WAF, any service with Unit dropdowns

---

### FIX-9: Toggle Resolution via aria-labelledby in setToggle() (Line 322-330)

**Problem**: Same as FIX-4 but in `setToggle()` function  
**Solution**: Search by aria-labelledby in addition to `label[for]`  
**Services Affected**: Bedrock, SageMaker

---

## Issue Priority Matrix

| Issue | Severity | Impact | Effort | Priority |
|-------|----------|--------|--------|----------|
| **P1: Brain Location** | 🔴 Critical | Complete failure if n8n down | Medium | **1 (Highest)** |
| **P2: Selector Resilience** | 🟡 High | Partial/complete failure if UI changed | Low (test) | **2** |
| **P3: Silent Failures** | 🟡 Medium | Poor UX, hard to debug | Low | **3** |
| **P4: Repo Hygiene** | 🟢 Low | Maintenance burden | Very Low | **4** |

---

## Recommended Fix Order (Revival Phase)

### Phase 0: Verification (Before touching code)
1. **Run REVIVAL_PLAN Test A** — Verify content script injects
2. **Run REVIVAL_PLAN Test B** — Verify selectors against current AWS UI
3. **Run REVIVAL_PLAN Test C** — Verify n8n webhook status and CORS

### Phase 1: Quick Wins (P4)
1. `git init` — Initialize version control
2. Update `manifest.json` — Fix permissions
3. Commit baseline

### Phase 2: Critical Fixes (P1, P3)
1. **P3**: Add error messages to popup (warning state)
2. **P1**: Move n8n fetch to background service worker (if webhook is alive)
   OR plan migration to direct Claude API (if webhook is dead)

### Phase 3: Selector Updates (P2)
1. Test each service type manually
2. Update stale selectors
3. Add selector validation tests (Puppeteer)

### Phase 4: Long-Term Improvements
1. Remove n8n dependency (direct Claude API)
2. Add comprehensive tests
3. Implement selector auto-healing

---

## Test Plan (from REVIVAL_PLAN.md)

### Test A: Content Script Injection
```javascript
// In calculator.aws console after clicking "Generate"
// Look for: [RPA] Initiating RPA: ...
```
**Pass**: Log appears  
**Fail**: No log → injection failed

### Test B: Selector Validation
```javascript
// In calculator.aws console on a service config page
// Look for: [RPA] 📋 DOM escaneado: N campos
```
**Pass**: N > 10 (many fields detected)  
**Fail**: N = 0 or very low → selectors stale

### Test C: n8n Webhook Health
```javascript
// In calculator.aws console
fetch('https://n8n-retirado.example/webhook/aws-field-mapper', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    round: 2, service: 'AWS Lambda',
    domFields: [{ label: 'Number of requests', type: 'number' }],
    requestedValues: { 'Number of requests': '1000' }
  })
})
.then(r => r.json())
.then(d => console.log('✅ N8N OK:', d))
.catch(e => console.error('❌ N8N FAIL:', e));
```
**Pass**: Returns action array  
**Fail**: CORS error, 404, or empty

---

## Conclusion

**Critical Blockers**:
- P1 (n8n dependency) — Must verify status with Test C before proceeding
- P2 (selectors) — Must verify with Test B before assuming they work

**Next Steps**:
1. Complete Reverse Engineering documentation
2. Present completion message to user
3. Wait for user approval
4. Proceed to Requirements Analysis phase
