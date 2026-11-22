# Interaction Diagrams — AWS Calculator RPA Extension

**Document Version**: 1.0  
**Created**: 2026-07-15  
**Project**: AWS Calculator RPA Chrome Extension (v6)

---

## 1. High-Level RPA Flow

```mermaid
sequenceDiagram
    actor User
    participant Popup as popup.js
    participant Chrome as Chrome APIs
    participant Content as content.js
    participant AWS as calculator.aws
    participant N8N as n8n Webhook
    participant Claude as Anthropic Claude

    User->>Popup: Paste JSON + Click "Generate"
    Popup->>Chrome: Query tabs (calculator.aws)
    Chrome-->>Popup: Tab found/created
    Popup->>Chrome: Inject content.js
    Chrome->>Content: Script loaded
    Popup->>Content: RUN_RPA message
    
    loop For Each Service
        Content->>AWS: Add service + Configure
        Content->>AWS: Apply toggles
        Content->>AWS: Scan form (scanForm)
        Content->>N8N: POST Ronda 1 (prepare)
        N8N->>Claude: Map expand actions
        Claude-->>N8N: Expand actions
        N8N-->>Content: Return actions
        Content->>AWS: Execute expand actions
        Content->>AWS: Scan expanded form
        Content->>N8N: POST Ronda 2 (map)
        N8N->>Claude: Map fill actions
        Claude-->>N8N: Fill actions
        N8N-->>Content: Return actions
        Content->>AWS: Execute fill actions
        Content->>AWS: Save service
        Content->>Popup: PROGRESS message
    end
    
    Content->>AWS: Rename estimate
    Content->>AWS: Share estimate
    AWS-->>Content: Public URL
    Content->>Popup: DONE message
    Popup->>User: Display URL + Copy button
```

---

## 2. Popup Initialization Flow

```mermaid
flowchart TD
    A[User clicks extension icon] --> B[Chrome opens popup.html]
    B --> C[Load popup.js]
    C --> D[Register event listeners]
    D --> E{User action?}
    
    E -->|Load Example| F[Fill textarea with EXAMPLE_JSON]
    F --> E
    
    E -->|Generate| G[Parse JSON]
    G --> H{Valid?}
    H -->|No| I[Show error status]
    I --> E
    H -->|Yes| J[Query calculator.aws tabs]
    J --> K{Tab exists?}
    K -->|Yes| L[Activate existing tab]
    K -->|No| M[Create new tab]
    M --> N[Wait for tab load]
    N --> O[Inject content.js]
    L --> O
    O --> P[Send RUN_RPA message]
    P --> Q[Listen for progress messages]
    
    E -->|Copy URL| R[navigator.clipboard.writeText]
    R --> E
```

---

## 3. Content Script Injection Flow

```mermaid
flowchart TD
    A[popup.js: Send RUN_RPA] --> B{content.js injected?}
    B -->|Check| C[Send PING message]
    C --> D{Response?}
    D -->|Yes| E[Already injected]
    D -->|No - Error| F[chrome.scripting.executeScript]
    F --> G[Wait 1 second]
    G --> E
    E --> H[Send RUN_RPA message]
    H --> I[content.js: Message listener]
    I --> J[Call runRPA with config]
```

---

## 4. Add Service Flow (Per Service)

```mermaid
flowchart TD
    A[Start: addService] --> B[Navigate to /estimate]
    B --> C[Click 'Add service']
    C --> D[Select 'Search all services']
    D --> E[Fill search box with search_term]
    E --> F[Wait for results]
    F --> G[Find correct service card]
    G --> H[Click 'Configure']
    H --> I[Wait for form load]
    I --> J{First service?}
    J -->|Yes| K[Set region dropdown]
    J -->|No| L[Skip region]
    K --> L
    L --> M{Has __switch__ toggles?}
    M -->|Yes| N[Apply all toggles BEFORE scan]
    M -->|No| O[Skip toggles]
    N --> P[Wait 5s for conditional fields]
    O --> P
    P --> Q[scanForm: Extract initial fields]
    Q --> R[Ronda 1: prepareForm]
    R --> S{Got expand actions?}
    S -->|Yes| T[Execute expand actions]
    S -->|No| U[expandAllSections fallback]
    T --> V
    U --> V[scanForm: Extract expanded fields]
    V --> W[Ronda 2: mapFields]
    W --> X[Execute fill actions]
    X --> Y[saveService: Click Save]
    Y --> Z[Return to /estimate]
```

---

## 5. scanForm: DOM Analysis Flow

```mermaid
flowchart TD
    A[Start: scanForm] --> B[Initialize empty fields array]
    B --> C[Query all inputs not hidden]
    
    C --> D{Input type?}
    D -->|checkbox| E[Resolve via aria-labelledby + label-for + container]
    D -->|radio in table| F[Detect tr/row, extract row text]
    D -->|radio normal| G[Group by name, resolve labels]
    D -->|text/number| H[Resolve aria-label + clean + split compound]
    
    E --> I[Add to fields array]
    F --> I
    G --> I
    H --> I
    
    I --> J[Query all select elements]
    J --> K[Resolve aria-label + options]
    K --> I
    
    I --> L[Query all button aria-haspopup]
    L --> M{Is Unit button?}
    M -->|Yes| N[parseUnitButtonLabel]
    M -->|No| O[Parse normal dropdown]
    N --> I
    O --> I
    
    I --> P[Query all input type=range]
    P --> Q[Resolve aria-label + min/max]
    Q --> I
    
    I --> R[Serialize radiogroups]
    R --> S[Return fields array]
```

---

## 6. fillByLabel: Action Execution Flow

```mermaid
flowchart TD
    A[Start: fillByLabel] --> B{Action type?}
    
    B -->|instance_search| C[Find search input]
    C --> D[Fill search term]
    D --> E[Wait for results]
    E --> F[Find row with value]
    F --> G[Click radio]
    G --> Z[Done]
    
    B -->|instance_radio| H[Find table row by text]
    H --> I[Click radio in row]
    I --> Z
    
    B -->|__switch__| J[setToggle]
    J --> Z
    
    B -->|Other| K[resolveElementByLabel]
    K --> L{Element type?}
    
    L -->|radio| M[Find radio in group]
    M --> N[Click label or radio]
    N --> Z
    
    L -->|checkbox| O[Toggle to desired state]
    O --> Z
    
    L -->|SELECT| P[selectNative]
    P --> Z
    
    L -->|BUTTON| Q[selectAwsDropdown]
    Q --> Z
    
    L -->|INPUT| R[fillInput]
    R --> Z
```

---

## 7. Claude Mapping: Two-Round Interaction

```mermaid
sequenceDiagram
    participant Content as content.js
    participant N8N as n8n Webhook
    participant Claude as Anthropic Claude

    Note over Content: Toggle timing (FIX-7)
    Content->>Content: Apply __switch__ toggles
    Content->>Content: Wait 5s for conditional fields

    Note over Content,Claude: Ronda 1 — Prepare
    Content->>Content: scanForm() → initial fields
    Content->>N8N: POST {round:1, domFields, requestedValues}
    N8N->>Claude: "What sections should be expanded?"
    Claude-->>N8N: [{"action":"expand","label":"Advanced"}]
    N8N-->>Content: Return expand actions
    Content->>Content: executeActions(expand)
    
    Note over Content,Claude: Ronda 2 — Map
    Content->>Content: scanForm() → expanded fields
    Content->>N8N: POST {round:2, domFields, requestedValues}
    N8N->>Claude: "Map values to fields"
    Claude-->>N8N: [{"action":"fill","label":"...","value":"..."}]
    N8N-->>Content: Return fill actions
    Content->>Content: executeActions(fill)
```

---

## 8. setToggle: Resolution Strategy

```mermaid
flowchart TD
    A[Start: setToggle] --> B[Normalize toggle name]
    B --> C[Strategy 1: Find label-for with exact text]
    C --> D{Found?}
    D -->|Yes| E[Get input by ID]
    E --> F{Already in desired state?}
    F -->|Yes| G[Log: already set]
    F -->|No| H[Click input]
    H --> Z[Done]
    G --> Z
    
    D -->|No| I[Strategy 2: Find input by aria-labelledby]
    I --> J[Reconstruct label from IDs]
    J --> K{Match?}
    K -->|Yes| F
    K -->|No| L[Strategy 3: Find awsui_native-input]
    L --> M[Extract container text]
    M --> N{Match?}
    N -->|Yes| F
    N -->|No| O[Log: toggle not found]
    O --> Z
```

---

## 9. selectAwsDropdown: CloudScape Dropdown Flow

```mermaid
flowchart TD
    A[Start: selectAwsDropdown] --> B[Click dropdown button]
    B --> C[Loop 6 attempts, 500ms each]
    C --> D{awsui_option-content found?}
    D -->|No| C
    D -->|Yes| E[Find option by text]
    E --> F{Exact match?}
    F -->|Yes| G[Click awsui_selectable-item]
    F -->|No| H{Partial match?}
    H -->|Yes| G
    H -->|No| I[Close listbox - body.click]
    G --> J[Return true]
    I --> K[Return false]
```

---

## 10. saveService: Retry Strategy

```mermaid
flowchart TD
    A[Start: saveService] --> B[Attempt = 0]
    B --> C[Scroll to bottom]
    C --> D[Try button texts: Save and add service, Add to my estimate, Save]
    D --> E[Find visible enabled button]
    E --> F{Found?}
    F -->|Yes| G[Scroll to button]
    G --> H[Click button]
    H --> I[Wait DELAY.LONG]
    I --> J{URL has /estimate OR Add service button found?}
    J -->|Yes| K[Return true]
    J -->|No| L{Attempt < 3?}
    L -->|Yes| M[Attempt++]
    M --> C
    L -->|No| N[Log warning]
    N --> O[Return false]
    F -->|No| L
    K --> P[Done]
    O --> P
```

---

## 11. Message Passing Architecture

```mermaid
flowchart LR
    subgraph Extension Context
        P[popup.js]
    end
    
    subgraph Page Context
        C[content.js]
    end
    
    P -->|chrome.tabs.sendMessage| C
    C -->|chrome.runtime.sendMessage| P
    
    P -.->|PING| C
    C -.->|status: OK| P
    
    P -.->|RUN_RPA + config| C
    C -.->|status: started| P
    
    C -.->|PROGRESS + pct + text| P
    C -.->|DONE + url| P
    C -.->|ERROR + message| P
    C -.->|DOM_FIELDS + fields| P
```

---

## 12. Error Recovery Flow

```mermaid
flowchart TD
    A[RPA Running] --> B{Error occurs?}
    B -->|No| C[Continue]
    B -->|Yes| D{Error type?}
    
    D -->|Service not found| E[Log error]
    E --> F[Return to /estimate]
    F --> G[Continue to next service]
    
    D -->|Selector not found| H[Log warning]
    H --> I[Skip action]
    I --> C
    
    D -->|n8n returns empty| J[No error logged]
    J --> K[Skip filling - Silent failure]
    K --> L[Save anyway]
    L --> G
    
    D -->|Button not found in 3 retries| M[Log warning]
    M --> N[Assume saved]
    N --> G
    
    D -->|Timeout in waitFor| O[Throw error]
    O --> E
```

---

## 13. Region Configuration Flow (First Service Only)

```mermaid
flowchart TD
    A[addService: First service?] --> B{isFirstService == true?}
    B -->|No| Z[Skip region]
    B -->|Yes| C[Find label: Choose a Region]
    C --> D{Label found?}
    D -->|No| Z
    D -->|Yes| E[Get button by label-for ID]
    E --> F{Button found?}
    F -->|No| Z
    F -->|Yes| G[Map region code to display name]
    G --> H[REGION_MAP lookup]
    H --> I{Current value == desired?}
    I -->|Yes| Z
    I -->|No| J[selectAwsDropdown]
    J --> K[Wait DELAY.LONG]
    K --> Z
```

---

## 14. Toggle Timing Fix (FIX-7) Flow

```mermaid
flowchart TD
    A[addService: Form loaded] --> B[Extract __switch__ entries from fields]
    B --> C{Has toggles?}
    C -->|No| D[Skip to scanForm]
    C -->|Yes| E[Separate ON vs OFF toggles]
    E --> F[Activate all that should be ON]
    F --> G[Deactivate all that should be OFF]
    G --> H[Query all checkboxes currently ON]
    H --> I{In wantOn set?}
    I -->|No| J[Deactivate default toggle]
    I -->|Yes| K[Skip]
    J --> L[Wait DELAY.LONG * 2 - 5 seconds]
    K --> L
    L --> D[scanForm: Now conditional fields are visible]
```

---

## 15. Complete Service Addition Sequence Diagram

```mermaid
sequenceDiagram
    participant C as content.js
    participant AWS as calculator.aws DOM
    participant N8N as n8n Webhook

    C->>AWS: Navigate /estimate
    C->>AWS: Click "Add service"
    C->>AWS: Select "Search all services"
    C->>AWS: Fill search_term
    C->>AWS: Click "Configure"
    
    opt First Service
        C->>AWS: Set region dropdown
    end
    
    opt Has __switch__ Toggles
        C->>AWS: Apply all toggles (FIX-7)
        Note over C: Wait 5s for conditional fields
    end
    
    C->>AWS: scanForm() → initial fields
    C->>N8N: POST Ronda 1 (prepare)
    N8N-->>C: Expand actions
    
    alt Got expand actions
        C->>AWS: Execute expand actions
    else No expand actions
        C->>AWS: expandAllSections()
    end
    
    C->>AWS: scanForm() → expanded fields
    C->>N8N: POST Ronda 2 (map)
    N8N-->>C: Fill actions
    C->>AWS: executeActions(fill)
    C->>AWS: saveService()
    C->>AWS: Return to /estimate
```

---

## 16. Share Estimate Flow

```mermaid
flowchart TD
    A[shareEstimate] --> B[Wait DELAY.MEDIUM]
    B --> C[Find Share button]
    C --> D{Found?}
    D -->|No| E[Return current URL]
    D -->|Yes| F[Click Share]
    F --> G[Wait DELAY.LONG]
    G --> H[Find Agree and continue button]
    H --> I{Found?}
    I -->|Yes| J[Click Agree]
    J --> K[Wait DELAY.LONG]
    I -->|No| K
    K --> L[Find readonly input with calculator.aws URL]
    L --> M{Found?}
    M -->|Yes| N[Extract URL from input.value]
    M -->|No| E
    N --> O[Find Copy public link button]
    O --> P{Found?}
    P -->|Yes| Q[Click Copy]
    P -->|No| R[Skip copy]
    Q --> S[Return URL]
    R --> S
    E --> T[Done]
    S --> T
```

---

## Key Interaction Patterns

### Pattern 1: Poll-and-Wait
Used in: `waitForButton`, `waitForEstimatePage`, `waitForText`
- Poll every 200-300ms
- Timeout after 10-20s
- Throw error on timeout

### Pattern 2: Retry with Fallback
Used in: `saveService`, `resolveElementByLabel`, `setToggle`
- Try primary strategy
- If fails, try alternative
- Log warning, continue

### Pattern 3: Two-Round Intelligence
Used in: Claude mapping
- Round 1: Decide what to expand
- Execute expansions
- Round 2: Map and fill with full context

### Pattern 4: Cascading Resolution
Used in: `resolveElementByLabel`, `setToggle`
- Try most specific strategy first
- Fall back to more general strategies
- Return null if all fail

### Pattern 5: Progressive Enhancement
Used in: `addService` toggle timing
- Apply structural changes first (toggles)
- Wait for DOM to settle
- Then read final state (scanForm)

---

## Timing Characteristics

| Interaction | Typical Duration | Bottleneck |
|-------------|------------------|------------|
| Add service | 8-12s | n8n round-trips (2x) + AWS UI render |
| scanForm | 50-200ms | DOM traversal |
| n8n Ronda 1 | 1-3s | Network + Claude API |
| n8n Ronda 2 | 1-3s | Network + Claude API |
| Fill fields | 2-5s | Delays between actions |
| Save service | 1-3s | Button search + retry |
| Full estimate (5 services) | 60-90s | Total of all services |

---

## Critical Interaction Points (Fragility)

| Interaction | Fragility | Reason |
|-------------|-----------|--------|
| Button text matching | **High** | Localization, AWS UI changes |
| CloudScape selectors | **High** | Class names may change |
| n8n webhook | **High** | External dependency (P1) |
| ARIA attribute parsing | **Medium** | Complex, but stable standard |
| Save button detection | **Medium** | Multiple fallbacks |
| Region name mapping | **Low** | AWS region names stable |
