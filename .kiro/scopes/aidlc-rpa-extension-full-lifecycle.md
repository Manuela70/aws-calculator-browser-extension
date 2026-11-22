---
name: rpa-extension-full-lifecycle
depth: Standard
keywords: []
description: "Full inception+construction design spine to revive and fix the RPA v6 AWS Pricing Calculator MV3 extension"
change_control: relaxed
---

# rpa-extension-full-lifecycle scope

Composed custom scope for reviving and fixing the RPA v6 AWS Pricing Calculator
browser extension (Manifest V3, no build step, popup in Spanish, code in
English). It runs the full Inception design spine plus Construction, skipping
the Ideation framing stages and the heavier Operation tail. This scope has no
keywords and is selected by explicit name only.

Change Control defaults to relaxed: an input that changes after a human approved
or confirmed it is recorded and announced in one line, and the run continues.

## Why these stages, why skip those

This is a brownfield revival on a known codebase with existing
reverse-engineering artifacts. Verification Entropy is the top driver (no
automated tests, no build step for the unpacked extension), with structural
uncertainty and unresolved assumptions sitting at MED (mapping logic to be
pulled out of the n8n webhook, CloudScape selector-resilience decisions). The
plan was deliberately expanded past the mechanical screen to run the full
inception+construction design spine: reverse-engineering, practices-discovery,
requirements-analysis, user-stories, refined-mockups, domain-design,
units-generation, contract-design, delivery-planning, functional-design, the
NFR pair, and infrastructure-design, followed by code-generation and
build-and-test, then deployment-pipeline and deployment-execution to ship the
verified change.

It skips all Ideation framing (intent-capture, market-research, feasibility,
scope-definition, team-formation, rough-mockups, approval-handoff) because the
intent is already captured in the requirements docs, and it skips the heavier
Operation tail (ci-pipeline, environment-provisioning, observability-setup,
incident-response, performance-validation, feedback-optimization) that a
reversible unpacked extension does not need.

## Membership

EXECUTE (20): the three Initialization stages, reverse-engineering,
practices-discovery, requirements-analysis, user-stories, refined-mockups,
domain-design, units-generation, contract-design, delivery-planning,
functional-design, nfr-requirements, nfr-design, infrastructure-design,
code-generation, build-and-test, deployment-pipeline, deployment-execution.
SKIP (13): intent-capture, market-research, feasibility, scope-definition,
team-formation, rough-mockups, approval-handoff, ci-pipeline,
environment-provisioning, observability-setup, incident-response,
performance-validation, feedback-optimization.
