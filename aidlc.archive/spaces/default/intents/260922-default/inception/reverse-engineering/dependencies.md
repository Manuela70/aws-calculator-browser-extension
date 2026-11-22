# Dependencies Documentation — AWS Calculator RPA Extension

**Document Version**: 1.0  
**Created**: 2026-07-15  

---

## Critical External Dependencies

### 1. n8n Webhook (CRITICAL - P1)
- **Host**: `https://n8n-retirado.example/webhook/aws-field-mapper`
- **Purpose**: Claude AI field mapping
- **Impact**: Extension non-functional without this
- **Risk**: 🔴 Critical (single point of failure)
- **Status**: ⚠️ Unknown (needs verification)

### 2. AWS Calculator UI (HIGH - P2)
- **Host**: `https://calculator.aws/`
- **Purpose**: Target automation site
- **Impact**: Selectors may be stale after 14 months
- **Risk**: 🟡 High (UI changes break RPA)
- **Status**: ⚠️ Needs testing

### 3. Chrome Extension Platform
- **Version**: Manifest V3 (Chrome 88+)
- **APIs**: tabs, scripting, runtime, clipboard
- **Risk**: 🟢 Low (stable platform)
- **Status**: ✅ OK

---

## Priority Actions

1. **Verify n8n status** — Run REVIVAL_PLAN Test C
2. **Test selectors** — Run REVIVAL_PLAN Test B
3. **Fix manifest permissions** — Add n8n host, remove stale hosts
