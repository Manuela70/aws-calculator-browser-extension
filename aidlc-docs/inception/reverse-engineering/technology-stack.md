# Technology Stack — AWS Calculator RPA Extension

**Document Version**: 1.0  
**Created**: 2026-07-15  
**Project**: AWS Calculator RPA Chrome Extension (v6)

---

## Runtime Environment

### Chrome Extension Platform
- **Manifest Version**: 3
- **Minimum Chrome Version**: ~88+ (Manifest V3 requirement)
- **Execution Contexts**:
  - Extension context (popup.js) — privileged
  - Page context (content.js) — semi-privileged, injected into calculator.aws

---

## Programming Languages

### JavaScript (ES6+)
- **Version**: ES2018+ (async/await, spread operator, optional chaining)
- **Build Step**: None — vanilla JS, no transpilation
- **Modules**: No ES modules, all code in global scope

---

## UI Technologies

### HTML5
- **Semantic Elements**: `<textarea>`, `<button>`, `<div>` containers
- **No Framework**: Vanilla HTML

### CSS3
- **Styling**: Inline `<style>` block in popup.html
- **Techniques**:
  - Flexbox layout
  - CSS gradients (Applying brand colors)
  - Transitions and transforms (button hover effects)
  - Dark theme (`#0f1117` background)
- **Framework**: None — hand-written CSS

---

## Chrome Extension APIs

### Permissions-Required APIs

| API | Permission | Usage |
|-----|------------|-------|
| `chrome.tabs` | `tabs` | Query, create, update tabs |
| `chrome.scripting` | `scripting` | Inject content.js programmatically |
| `chrome.runtime` | Built-in | Message passing (popup ↔ content) |
| `navigator.clipboard` | `clipboardWrite` | Copy public URL |

### Messaging APIs

**popup → content**:
```javascript
chrome.tabs.sendMessage(tabId, { type: 'RUN_RPA', config })
```

**content → popup**:
```javascript
chrome.runtime.sendMessage({ type: 'PROGRESS', pct, text })
```

### Script Injection
```javascript
chrome.scripting.executeScript({
  target: { tabId },
  files: ['content.js']
});
```

---

## DOM Manipulation

### Native Web APIs
- **Selection**: `document.querySelector()`, `querySelectorAll()`
- **Events**: `MouseEvent`, `Event` (simulation for RPA)
- **Properties**: `Element.value`, `checked`, `selected`, `disabled`
- **Methods**: `click()`, `focus()`, `scrollIntoView()`, `dispatchEvent()`
- **Computed Styles**: `window.getComputedStyle()` (for toggle detection)
- **DOM Traversal**: `closest()`, `parentElement`, `previousElementSibling`
- **Position**: `Element.compareDocumentPosition()` (for section resolution)

### No Libraries
- No jQuery
- No React/Vue/Angular
- No DOM utility libraries
- Pure vanilla JavaScript

---

## External Services

### n8n Workflow Automation
- **Host**: `https://n8n-retirado.example`
- **Endpoint**: `/webhook/aws-field-mapper`
- **Method**: POST
- **Content-Type**: `application/json`
- **Purpose**: Claude AI field mapping intelligence

**Request Schema**:
```json
{
  "round": 1 | 2,
  "service": "AWS Lambda",
  "domFields": [ { "label": "...", "type": "...", ... } ],
  "requestedValues": { "Field Name": "value" }
}
```

**Response Schema**:
```json
[
  { "action": "fill", "label": "...", "value": "...", "type": "..." }
]
```

### Anthropic Claude API (via n8n)
- **Model**: Unknown (configured in n8n workflow)
- **Purpose**: Map JSON field values to AWS form fields
- **Prompting**: Two-round interaction (prepare → map)

### AWS Pricing Calculator
- **Host**: `https://calculator.aws/`
- **UI Framework**: CloudScape Design System (AWS)
- **DOM Pattern**: Custom components with `awsui_*` class names
- **Interaction**: RPA via DOM manipulation (no API)

---

## UI Framework (Target Site)

### CloudScape Design System
- **Vendor**: AWS
- **Version**: Unknown (evolves continuously)
- **Characteristics**:
  - Custom dropdowns (`button[aria-haspopup]` + `awsui_option-content`)
  - Native-styled inputs (`awsui_native-input`)
  - Aria-heavy (aria-label, aria-labelledby, aria-expanded)
  - Section collapsibles (`button[aria-expanded]`)

**Selector Patterns**:
- `[class*="awsui_option-content"]` — Dropdown options
- `[class*="awsui_selectable-item"]` — Selectable items
- `[class*="awsui_native-input"]` — Checkbox inputs
- `[class*="awsui_header"]` — Section headers
- `[class*="awsui_expand"]` — Expand buttons

---

## Development Tools

### Version Control
- **Status**: ❌ None (P4 issue)
- **Recommendation**: Git + GitHub/GitLab

### Testing
- **Unit Tests**: ❌ None
- **Integration Tests**: ❌ None
- **Manual Testing**: Via Chrome DevTools + extension reload

### Debugging
- **Console Logging**: `[RPA]` prefix for all RPA logs
- **Chrome DevTools**: Inspect popup (right-click icon → Inspect) and page console

### Build System
- **Status**: None — no build step
- **Rationale**: Vanilla JS, no transpilation needed

---

## Data Formats

### JSON
- **Input**: User-provided service specification
- **Output**: scanForm field descriptors, Claude action arrays
- **Parsing**: `JSON.parse()`, `JSON.stringify()`

### Markdown
- **Usage**: Documentation (requirements, REVIVAL_PLAN)

---

## Network Protocols

### HTTPS
- **calculator.aws**: DOM target (no fetch/XHR to calculator.aws)
- **n8n.cloud**: CORS-sensitive fetch from page context

### Fetch API
```javascript
fetch(N8N_MAPPER_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify(payload)
})
```

**CORS Requirement**: n8n must return `Access-Control-Allow-Origin` header (P1 issue)

---

## Accessibility Technologies

### ARIA (Accessibility-Rich Internet Applications)
- **Heavy Usage**: AWS Calculator is ARIA-driven
- **Attributes Used**:
  - `aria-label` — Field labels
  - `aria-labelledby` — Multi-part labels (reconstructed by RPA)
  - `aria-expanded` — Collapsible sections
  - `aria-checked` — Toggle state
  - `aria-haspopup` — Dropdown triggers
  - `role="radiogroup"`, `role="listbox"`, `role="option"`, etc.

**Critical for RPA**: ~80% of field resolution depends on ARIA attributes

---

## Security Considerations

### Content Security Policy (CSP)
- **Extension CSP**: Default Manifest V3 CSP
- **Page CSP**: Inherits calculator.aws CSP (fetch to n8n must comply)

### Permissions Model
- **Principle of Least Privilege**: ✅ Only requests necessary permissions
- **Host Permissions**: Scoped to calculator.aws and n8n.cloud (needs fix for n8n)

### Secrets Management
- **API Keys**: None stored in extension
- **Webhook URL**: Hardcoded but not secret (authenticated via n8n config)

---

## Performance Characteristics

### Latency Sources
1. **DOM Polling**: waitFor* functions (200-300ms intervals)
2. **Network RTT**: 2 round-trips to n8n per service (~500-2000ms total)
3. **UI Rendering**: AWS Calculator form rendering (1-3s per service)
4. **Delays**: Hardcoded DELAY.SHORT/MEDIUM/LONG (600ms to 2.5s)

### Bottlenecks
- **Sequential Processing**: Services added one at a time
- **Synchronous DOM Waits**: Must wait for each UI update

---

## Browser Compatibility

### Supported
- ✅ Chrome 88+ (Manifest V3)
- ✅ Edge 88+ (Chromium-based, Manifest V3)

### Not Supported
- ❌ Firefox (different extension API, requires manifest.json v2/v3 hybrid)
- ❌ Safari (different extension API)
- ❌ Chrome <88 (no Manifest V3)

---

## Deployment

### Distribution Method
- **Manual Load Unpacked**: Developer mode in chrome://extensions
- **Not Published**: Not in Chrome Web Store

### Installation
1. Enable Developer mode
2. Load unpacked → select extension directory
3. No build step required

---

## Technology Decisions & Rationale

### Decision 1: No Build Step
**Rationale**: Simple codebase, no dependencies, vanilla JS is sufficient

**Trade-offs**:
- ✅ Zero setup, fast iteration
- ✅ No build tool complexity
- ❌ No TypeScript type safety
- ❌ No minification
- ❌ No module bundling

### Decision 2: No UI Framework
**Rationale**: Popup is simple (textarea + buttons), no need for React/Vue

**Trade-offs**:
- ✅ Lightweight (147 lines HTML+CSS)
- ✅ Fast load time
- ❌ Manual DOM manipulation in popup.js

### Decision 3: Vanilla DOM Manipulation
**Rationale**: Target site (calculator.aws) has no API, must use RPA

**Trade-offs**:
- ✅ Only option (no API exists)
- ❌ Fragile to UI changes (P2)

### Decision 4: External n8n Webhook
**Rationale**: Avoid embedding API keys in extension

**Trade-offs**:
- ✅ No key management in extension
- ✅ Can update mapping logic without republishing
- ❌ Single point of failure (P1)
- ❌ CORS fragility (P1)

---

## Dependencies Summary

### Runtime Dependencies
- **Chrome Extension Platform** (v88+)
- **n8n Workflow** (n8n-retirado.example)
- **Anthropic Claude API** (via n8n)

### Development Dependencies
- None (no build, no tests)

### Recommended Additions
- Git (version control)
- ESLint (code quality)
- Jest (unit testing)
- Puppeteer (integration testing)

---

## Technology Evolution Recommendations

### Short-Term
1. **Add Version Control**: `git init` (P4 fix)
2. **Add Linter**: ESLint for code quality
3. **Document n8n Workflow**: Export and commit n8n workflow JSON

### Medium-Term
1. **Add Unit Tests**: Jest for utilities and pure functions
2. **Add Integration Tests**: Puppeteer for end-to-end RPA flows
3. **TypeScript Migration**: Gradual migration for type safety

### Long-Term
1. **Remove n8n Dependency**: Move to background service worker + direct Claude API
2. **Publish to Chrome Web Store**: Automated updates
3. **Multi-Browser Support**: Firefox, Safari extensions
