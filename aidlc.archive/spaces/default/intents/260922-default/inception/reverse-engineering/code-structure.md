# Code Structure Analysis — AWS Calculator RPA Extension

**Document Version**: 1.0  
**Created**: 2026-07-15  
**Project**: AWS Calculator RPA Chrome Extension (v6)

---

## File Overview

| File | Lines | Responsibility | Complexity |
|------|-------|----------------|------------|
| `manifest.json` | 26 | Extension configuration | Low |
| `popup.html` | 147 | UI markup + styling | Low |
| `popup.js` | 88 | UI controller + messaging | Medium |
| `content.js` | 1,193 | RPA engine (DOM automation) | **High** |

**Total**: ~1,454 lines of code

---

## `manifest.json` — Extension Configuration

**Lines**: 26  
**Purpose**: Chrome Extension Manifest V3 configuration

### Key Configuration

```json
{
  "manifest_version": 3,
  "name": "AWS Calculator — Applying",
  "version": "2.0.0",
  "permissions": ["activeTab", "scripting", "clipboardWrite", "tabs"],
  "host_permissions": [
    "https://calculator.aws/*",
    "https://dnd5zrqcec4or.cloudfront.net/*"  // STALE (P4)
  ],
  "action": { "default_popup": "popup.html" },
  "content_scripts": [
    {
      "matches": ["https://calculator.aws/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

### Issues (P4)
- Missing: `https://n8n-retirado.example/*` permission
- Stale: `dnd5zrqcec4or.cloudfront.net` (unknown purpose)

---

## `popup.html` — User Interface

**Lines**: 147 (includes inline CSS)  
**Purpose**: Extension popup UI

### Structure

```
<div class="header">          # Applying branding (orange gradient)
<div class="body">
  <textarea>                  # JSON input
  <button#btn-example>        # Load example JSON
  <button#btn-run>            # Generate estimate
  <div#progress>              # Progress bar
  <div#status>                # Status messages
  <div#url-box>               # URL display + copy button
```

### Styling
- Dark theme (`#0f1117` background)
- Applying brand colors (orange gradient `#FF9900` → `#FF6B00`)
- Spanish labels ("Generar Estimado", "Automatiza tu estimado en segundos")

---

## `popup.js` — UI Controller

**Lines**: 88  
**Purpose**: Handle UI interactions and message passing

### Constants

```javascript
const EXAMPLE_JSON = {
  "project": "POC Amazon SES - Full Assistance",
  "region": "us-east-1",
  "services": [
    { "name": "Amazon SES", "search_term": "Simple Email Service", "fields": {...} },
    { "name": "AWS Lambda", "search_term": "AWS Lambda", "fields": {...} }
  ]
};
```

### Functions

| Function | Lines | Purpose |
|----------|-------|---------|
| `setStatus(msg, type)` | 4 | Display status message (info/success/error/warning) |
| `setProgress(pct, text)` | 4 | Update progress bar |
| `showURL(url)` | 5 | Display public estimate URL |
| `setRunning(running)` | 3 | Enable/disable "Generate" button |

### Event Handlers

**Button Clicks**:
```javascript
'#btn-example' → Load EXAMPLE_JSON into textarea
'#btn-copy'    → Copy URL to clipboard
'#btn-run'     → Validate JSON, find/create tab, inject content.js, send RUN_RPA
```

**Message Listener**:
```javascript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PROGRESS')   { setProgress(...); setStatus(...); }
  if (message.type === 'DOM_FIELDS') { console.log(...); }  // Debug only
  if (message.type === 'DONE')       { showURL(...); }
  if (message.type === 'ERROR')      { setStatus(..., 'error'); }
});
```

### Injection Logic (lines 60-88)

```javascript
// 1. Find existing calculator.aws tab or create new one
const tabs = await chrome.tabs.query({ url: 'https://calculator.aws/*' });
let targetTab = tabs[0] || await chrome.tabs.create({ url: '...' });

// 2. Inject content.js if not already injected
try {
  await chrome.tabs.sendMessage(targetTab.id, { type: 'PING' });
} catch(e) {
  await chrome.scripting.executeScript({
    target: { tabId: targetTab.id },
    files: ['content.js']
  });
}

// 3. Send RUN_RPA message
await chrome.tabs.sendMessage(targetTab.id, { type: 'RUN_RPA', config });
```

---

## `content.js` — RPA Engine

**Lines**: 1,193  
**Purpose**: Automate AWS Pricing Calculator UI  
**Complexity**: **High** (9 documented fixes, complex selector logic)

### Configuration

```javascript
const DELAY = {
  SHORT:  600,    // After simple actions
  MEDIUM: 1200,   // After form changes
  LONG:   2500,   // After navigation
  TYPING: 60      // Per character (unused)
};

const N8N_MAPPER_URL = 'https://n8n-retirado.example/webhook/aws-field-mapper';
```

### Module Breakdown

#### 1. Utilities (lines 15-56)

| Function | Purpose | Complexity |
|----------|---------|------------|
| `sleep(ms)` | Promise-based delay | Trivial |
| `log(msg)` | Console logging with `[RPA]` prefix | Trivial |
| `getText(el)` | Extract clean text from element | Low |
| `cleanAriaLabel(raw)` | Strip AWS placeholder contamination (FIX-1) | Medium |
| `parseUnitButtonLabel(lbParts)` | Parse Unit button labels (FIX-2) | Medium |
| `isToggleOn(el)` | Detect checkbox state | Medium |

**FIX-1: cleanAriaLabel()** (lines 23-35)
- **Problem**: AWS embeds placeholders in aria-labels ("Enter amount", "Enter the number of...")
- **Solution**: Regex patterns to strip common placeholder patterns
- **Services Affected**: CloudWatch, KMS, SageMaker, ELB, WAF

**FIX-2: parseUnitButtonLabel()** (lines 37-56)
- **Problem**: CloudScape Unit buttons have inconsistent aria-labelledby segment order
- **Solution**: Semantic parsing instead of positional (identify "Unit", section, value)
- **Services Affected**: ELB, WAF

#### 2. Claude Interface (lines 86-115)

| Function | Lines | Purpose |
|----------|-------|---------|
| `callN8N(payload)` | 86-95 | POST to n8n webhook, handle 3 response formats |
| `prepareForm(...)` | 99-106 | Ronda 1 — get expand actions |
| `mapFields(...)` | 108-115 | Ronda 2 — get fill actions |

**Response Format Handling**:
```javascript
if (Array.isArray(data))                 return data;           // Direct array
if (Array.isArray(data.actions))         return data.actions;   // Wrapped
if (Array.isArray(data.mappedFields))    return data.mappedFields;
if (typeof data.mappedFields === 'string') return JSON.parse(data.mappedFields);
return [];
```

#### 3. Action Executor (lines 117-172)

**`executeActions(actions)`** — Main action dispatcher

**Supported Actions**:
- `expand`: Expand collapsed section (find button by text)
- `toggle_on` / `toggle_off`: Enable/disable feature toggle
- `fill`, `select`, `dropdown`, `radio`, `checkbox`, `instance_search`, `instance_radio`: Fill form fields

**Error Handling**: Logs warnings, continues on failure (no throw)

#### 4. Wait Utilities (lines 174-219)

| Function | Timeout | Purpose |
|----------|---------|---------|
| `waitForButton(text)` | 15s | Poll for button by text |
| `waitForEstimatePage()` | 20s | Poll for /estimate page load |
| `waitForText(text)` | 10s | Poll for text in DOM |

**Pattern**: Poll every 200-300ms until condition met or timeout

#### 5. UI Interaction Primitives (lines 221-289)

| Function | Purpose | Complexity |
|----------|---------|------------|
| `findButton(text)` | Find visible button by text content | Low |
| `mouseClick(el)` | Dispatch realistic mouse event sequence | Medium |
| `click(el)` | Scroll + mouseClick + delay | Low |
| `fillInput(el, value)` | Fill text/number input (native setter) | Medium |
| `selectNative(el, value)` | Set native select option | Low |

**`mouseClick()` Event Sequence** (lines 240-250):
```javascript
mouseover → mouseenter → mousedown → mouseup → click → el.click()
```

#### 6. Toggle Handler (lines 291-366, FIX-9)

**`setToggle(toggleName, wantOn)`** — Find and toggle checkbox

**Strategy** (cascading fallback):
1. `label[for]` with exact text match
2. `input[aria-labelledby]` reconstruction (FIX-9)
3. `awsui_native-input` with container text

**FIX-9: aria-labelledby Resolution** (lines 322-330)
- **Problem**: Bedrock, SageMaker toggles have no label[for]
- **Solution**: Reconstruct label from aria-labelledby IDs

#### 7. Section Expander (lines 368-399)

**`expandAllSections()`** — Expand all collapsed sections (fallback)

**Logic**:
- Find all `button[aria-expanded="false"]`
- Filter out dropdown triggers (awsui_trigger, awsui_button)
- Keep only section headers (awsui_header, awsui_expand)
- Click all in 5 rounds (handles dynamic sections)

#### 8. DOM Scanner (lines 401-585, FIX-3 through FIX-6)

**`scanForm()`** — Universal field scanner (CORE PRIMITIVE)

**Returns**: Array of field descriptors (JSON-safe, no DOM references)

**Capabilities**:

| Field Type | Selector Strategy | Fixes Applied |
|------------|-------------------|---------------|
| Text/Number Input | aria-label, aria-labelledby, split compound labels | FIX-1 |
| Checkbox (Toggle) | aria-labelledby, label[for], container text | FIX-4 |
| Radio (Normal) | Group by name, resolve label, heading-based group name | FIX-6 |
| Radio (Instance Table) | Detect tr/role=row, extract row text | FIX-5 |
| Native Select | aria-label, aria-labelledby | — |
| CloudScape Dropdown | aria-labelledby multi-part parsing | FIX-2 |
| Slider | aria-label, aria-valuenow/min/max | — |
| Instance Search | Detect search input by placeholder/role | — |

**FIX-3: resolveSection()** (lines 415-444)
- **Problem**: CloudWatch has no role="group" for sections
- **Solution**: Fallback to nearest preceding heading in DOM

**FIX-4: Toggle Resolution** (lines 468-481)
- **Problem**: Bedrock, SageMaker toggles use aria-labelledby only
- **Solution**: Reconstruct label from aria-labelledby IDs

**FIX-5: Instance Radio Detection** (lines 497-506)
- **Problem**: EC2 instance tables have radios without clear labels
- **Solution**: Detect tr/role=row context, extract row text as label

**FIX-6: Radiogroup Name** (lines 508-527)
- **Problem**: Dynamic radiogroup names (awsui-..., numeric) are not human-readable
- **Solution**: Extract name from radiogroup's heading/legend

**Field Descriptor Format**:
```javascript
{
  label: "Section > Field Name",  // Hierarchical label
  type: "dropdown",               // Field type
  current: "US East (N. Virginia)", // Current value
  options: [...],                 // Available options (selects/radios)
  checked: true,                  // Checkbox state
  placeholder: "...",             // Input placeholder
  expanded: false,                // Dropdown state
  min: 0, max: 100               // Slider range
}
```

#### 9. Element Resolver (lines 587-659, FIX-8)

**`resolveElementByLabel(labelText)`** — Find DOM element from scanForm label

**Input**: `"Section > Field Name"` or `"Field Name"`

**Strategy** (cascading fallback):
1. aria-label exact match (all segments)
2. aria-labelledby reconstruction (FIX-8 for Unit buttons)
3. label[for] by field name
4. Section context disambiguation (multiple fields with same name)

**FIX-8: Unit Button Resolution** (lines 611-630)
- **Problem**: CloudScape Unit buttons have no label[for]
- **Solution**: Reconstruct from aria-labelledby and match section + "Unit"

#### 10. CloudScape Dropdown Handler (lines 661-687)

**`selectAwsDropdown(buttonEl, value)`** — Handle custom dropdowns

**Flow**:
1. Click button to open listbox
2. Wait for `awsui_option-content` elements (6 attempts, 500ms each)
3. Find option by exact or partial text match
4. Click `awsui_selectable-item` wrapper
5. Close listbox if not found

#### 11. Fill Handler (lines 689-977)

**`fillByLabel(labelText, value, type)`** — Execute single action

**Routing Logic**:

```javascript
if (isInstanceSearch)           → Search input + select row
if (type === 'instance_radio')  → Find row by text, click radio
if (labelText.startsWith('__switch__:')) → setToggle()
else {
  el = resolveElementByLabel(labelText);
  if (el.type === 'radio')      → Find radio in group, click
  if (el.type === 'checkbox')   → Toggle to desired state
  if (el.tagName === 'SELECT')  → selectNative()
  if (el.tagName === 'BUTTON')  → selectAwsDropdown()
  else                          → fillInput()
}
```

**Instance Search Flow** (lines 703-737):
1. Find search input by placeholder/role/class
2. Fill search term
3. Wait 2s for results
4. Find row containing value text
5. Click radio or awsui_selectable-item

#### 12. Service Saver (lines 979-1008)

**`saveService(name)`** — Save and return to estimate

**Strategy**: 3 retry attempts, multiple button text variations:
- "Save and add service"
- "Add to my estimate"
- "Save"

**Success Detection**: URL includes `/estimate` OR `Add service` button found

#### 13. Estimate Renamer (lines 1010-1042)

**`renameEstimate(projectName)`** — Rename estimate to project name

**Flow**:
1. Find and click "Edit" button (with preventDefault to avoid navigation)
2. Wait for name input (placeholder contains "Name" or value contains "Estimate")
3. Focus, select, fill with projectName
4. Click "Save"

#### 14. Share Handler (lines 1044-1070)

**`shareEstimate()`** — Generate public URL

**Flow**:
1. Click "Share" button
2. Click "Agree and continue" (if modal appears)
3. Find readonly input with URL
4. Optionally click "Copy public link"
5. Return URL

#### 15. Service Flow (lines 1072-1161, FIX-7)

**`addService(svc, isFirstService)`** — Per-service automation

**Flow**:
```
1. Navigate to /estimate
2. Click "Add service"
3. Select "Search all services"
4. Search for service by search_term
5. Click "Configure" on correct service card
6. Wait for form load
7. Set region (first service only)
8. Apply __switch__ toggles BEFORE scanForm (FIX-7)
9. scanForm() → extract initial fields
10. prepareForm() → Ronda 1 → get expand actions
11. Execute expand actions (or expandAllSections fallback)
12. scanForm() → extract expanded fields
13. mapFields() → Ronda 2 → get fill actions
14. executeActions() → fill all fields
15. saveService() → save and return to /estimate
```

**FIX-7: Toggle Timing** (lines 1126-1175)
- **Problem**: Bedrock providers, SageMaker features are conditional fields — don't exist until toggle is ON
- **Solution**: Apply __switch__ toggles BEFORE first scanForm, wait for DOM update
- **Logic**:
  1. Extract __switch__ entries from fields
  2. Activate all that should be ON
  3. Deactivate all that should be OFF
  4. Deactivate all that are ON by default but not requested
  5. Wait 5s (DELAY.LONG * 2) for conditional fields to render

**Region Mapping** (lines 1119-1142):
```javascript
const REGION_MAP = {
  'us-east-1': 'US East (N. Virginia)',
  'us-east-2': 'US East (Ohio)',
  // ... 20+ regions
};
```

#### 16. RPA Runner (lines 1163-1191)

**`runRPA(config, sendProgress)`** — Main entry point

**Flow**:
```
1. Navigate to /estimate, wait for load
2. For each service:
   - Send progress update (10% + 75% * i/total)
   - addService(service, isFirst)
   - Catch errors, return to /estimate
3. renameEstimate(config.project)
4. shareEstimate() → get URL
5. Return URL
```

#### 17. Message Listener (lines 1193-1210)

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING')    { return { status: 'OK', url: ... }; }
  if (message.type === 'RUN_RPA') { runRPA(...); return { status: 'started' }; }
});
```

---

## Data Structures

### JSON Input Schema

```javascript
{
  project: string,              // Estimate name
  region: string,               // AWS region code (us-east-1, etc.)
  services: [
    {
      name: string,             // Display name
      search_term: string,      // Search query
      fields: {
        "<field label>": "<value>",       // Normal field
        "__switch__:<toggle>": "on|off"   // Feature toggle
      }
    }
  ]
}
```

### Field Descriptor Schema (scanForm output)

```javascript
{
  label: string,          // "Section > Field" or "Field"
  type: string,           // "text", "number", "dropdown", "radio", "checkbox", ...
  current?: string,       // Current value
  options?: string[],     // Available options (selects, radios)
  checked?: boolean,      // Checkbox state
  placeholder?: string,   // Input placeholder
  expanded?: boolean,     // Dropdown state
  min?: number,           // Slider min
  max?: number,           // Slider max
  disabled?: boolean,     // Field disabled
  name?: string           // Radiogroup name
}
```

### Action Schema (Claude response)

```javascript
{
  action: string,  // "fill", "select", "dropdown", "radio", "checkbox", "expand", "toggle_on", "toggle_off", "instance_search", "instance_radio"
  label: string,   // Field label (from scanForm)
  value?: any,     // Value to set
  type?: string    // Field type hint
}
```

---

## Error Handling Patterns

### Try-Catch Blocks
- `executeActions()`: Catch per action, log, continue
- `addService()`: Catch per service, log, return to /estimate
- `renameEstimate()`: Catch, log, continue

### Fallback Strategies
- `saveService()`: 3 retries with multiple button texts
- `waitFor*()`: Polling with timeout
- `expandAllSections()`: Fallback when Claude doesn't specify
- `resolveElementByLabel()`: 4 cascading strategies

### Silent Failures (P3)
- `callN8N()` returns `[]` → `executeActions()` does nothing → no error shown
- `resolveElementByLabel()` returns `null` → logged, action skipped
- `selectAwsDropdown()` option not found → logged, returns false

---

## Complexity Hotspots

| Function | Complexity | Reason |
|----------|------------|--------|
| `scanForm()` | **Very High** | 10+ field types, 6 fixes, section resolution |
| `fillByLabel()` | **High** | 8+ action types, special cases |
| `addService()` | **High** | 15-step flow, toggle timing (FIX-7) |
| `resolveElementByLabel()` | **Medium** | 4 fallback strategies |
| `setToggle()` | **Medium** | 3 fallback strategies |

---

## Code Quality Observations

### Strengths
- ✅ Clear module organization (utilities → primitives → orchestration)
- ✅ Descriptive function names
- ✅ Consistent error logging with `[RPA]` prefix
- ✅ Well-documented fixes (FIX-1 through FIX-9)
- ✅ Defensive programming (multiple fallbacks)

### Weaknesses
- ❌ No automated tests
- ❌ Hardcoded n8n URL (lines 20)
- ❌ Magic numbers (DELAY values, retry counts)
- ❌ Silent failures (P3)
- ❌ No TypeScript/JSDoc type annotations

---

## Dependencies

### Chrome Extension APIs
- `chrome.runtime.sendMessage()` — content → popup
- `chrome.runtime.onMessage.addListener()` — popup ← content
- `chrome.tabs.query()` — find tabs
- `chrome.tabs.update()` — activate tab
- `chrome.tabs.create()` — create tab
- `chrome.tabs.sendMessage()` — popup → content
- `chrome.scripting.executeScript()` — inject content script
- `navigator.clipboard.writeText()` — copy URL

### External Services
- **n8n Webhook**: `https://n8n-retirado.example/webhook/aws-field-mapper`
- **AWS Calculator**: `https://calculator.aws/` (DOM manipulation target)

### DOM APIs (Vanilla JavaScript)
- `document.querySelector()`, `querySelectorAll()`
- `Element.scrollIntoView()`, `focus()`, `click()`
- `HTMLInputElement.value` (native setter)
- `Event`, `MouseEvent` (event simulation)
- `window.getComputedStyle()` (toggle detection)
- `Node.compareDocumentPosition()` (section resolution)

---

## Maintenance Considerations

### High-Risk Areas (likely to break)
1. **Selectors** (P2): CloudScape class names (`awsui_*`) may change
2. **Button Text**: "Add service", "Configure", "Save" are localized
3. **DOM Structure**: Section/group hierarchy may change

### Low-Risk Areas (stable)
- Message passing (Chrome API contract)
- JSON parsing (user input)
- Utility functions (sleep, log, getText)

### Technical Debt
- Hardcoded configuration (n8n URL, delays, retries)
- No unit tests
- No integration tests
- No CI/CD
- No version control (P4)
