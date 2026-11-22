# AWS Calculator RPA Extension — Requirements

## 1. Overview

Chrome browser extension (Manifest V3) that automates the AWS Pricing Calculator
(calculator.aws) end-to-end from a JSON specification. It is an internal RPA tool
at Applying that turns a solution's service list into a shareable AWS cost estimate.
This effort is a revival/resume of an existing v6 implementation.

## 2. Context to review before building

The agent must read and reverse-engineer the current implementation before making changes:

- manifest.json, popup.html, popup.js, content.js (current v6 implementation)
- REVIVAL_PLAN.md (diagnosis of what is broken and why)

content.js already contains the DOM analysis engine (scanForm() = "analyzeDOM")
and the element resolver (resolveElementByLabel()). Review both to ensure a
high-quality product.

## 3. Operating modes

Two modes selectable in the popup:

- Create Calculator: execute the JSON spec deterministically.
- ReAct: reason-and-act loop that uses the AWS Well-Architected Framework to
  recommend and/or act. Accepts a natural-language prompt in addition to, or
  instead of, the JSON spec.

## 4. Input schema

The user pastes JSON or a prompt into the popup:

{ project, region, services: [ { name, search_term,
  fields: { "<field label>": "<value>" }, "__switch__:<toggle>": "on|off" } ] }

## 5. Functional requirements

- FR1 — Input: the popup accepts JSON or a prompt and exposes a mode selector
  (Create Calculator | ReAct).
- FR2 — Injection: on "Generate Estimate", inject the content script into an open
  calculator.aws tab (or open one) and navigate to #/estimate.
- FR3 — analyzeDOM (core primitive): scan the form and enumerate every field —
  text/number inputs, native selects, CloudScape dropdown buttons, radios,
  radiogroups, sliders, and instance tables — resolving each field's label and section.
- FR4 — Per-service flow: for each service: Add service -> Search all services ->
  find the service card -> Configure; set the region on the first service; apply
  boolean toggles; run analyzeDOM; map each requested value to the correct field and
  apply it (fill / select / dropdown / radio / instance search); save the service;
  return to My Estimate.
- FR5 — Spotlight visual feedback: while the RPA runs autonomously, as each target
  field is located and before it is filled, draw a blue outline around that element
  and dim the rest of the page (box-shadow spotlight technique), with an optional
  tooltip showing the field label; remove the overlay once the field is done. This is
  cosmetic only — the RPA still acts by itself, no human interaction required. The
  overlay must use pointer-events:none, a very high z-index, follow scroll, and always
  clean up (including on error).
- FR6 — Finalize: after all services, rename the estimate to the project name, click
  Share, accept the public-link modal, and return the public estimate URL.
- FR7 — Progress & errors: show progress and clear, visible error states in the popup.

## 6. Problems to solve (detail in REVIVAL_PLAN.md)

- P1 — Mapping brain location: the field-mapping "brain" currently lives in an external
  n8n webhook; the fetch runs from the page context and is fragile to CORS and to the
  workflow being down. Review the project and decide/implement a robust home for it.
- P2 — Selector resilience: CloudScape selectors may be stale after ~14 months;
  analyzeDOM and the action executor must be resilient to AWS UI changes.
- P3 — Silent failures: failures are silent today (if mapping returns nothing, nothing
  happens); surface errors to the user.
- P4 — Repo hygiene: no version control; the manifest has a dead host permission and is
  missing the brain's host permission.

## 7. Acceptance criteria (high level)

- A valid JSON spec produces a shareable public estimate URL with no manual interaction.
- analyzeDOM enumerates all field types listed in FR3 against the live calculator.aws UI.
- Any mapping or selector failure is surfaced in the popup with a clear, visible message.
- The spotlight overlay never blocks or alters the RPA's own clicks/inputs.
