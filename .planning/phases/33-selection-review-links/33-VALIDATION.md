---
phase: 33
slug: selection-review-links
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Next.js build + TypeScript |
| **Config file** | none — build-time validation |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | REVIEW-03 | build | `npm run build` | ✅ | ⬜ pending |
| 33-01-02 | 01 | 1 | REVIEW-03 | build | `npm run build` | ✅ | ⬜ pending |
| 33-02-01 | 02 | 2 | REVIEW-03 | build | `npm run build` | ✅ | ⬜ pending |
| 33-02-02 | 02 | 2 | REVIEW-03 | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Toolbar shows review link button on multi-select | REVIEW-03 | UI visibility | Select 2+ assets → confirm "Review link" button appears in toolbar |
| 50-asset cap warning/disable | REVIEW-03 | Conditional UI | Select 51+ assets → confirm button is disabled or warns |
| Generated link only shows selected assets | REVIEW-03 | Data scope | Create selection review link → open link → confirm only selected assets visible |
| No folder browser sidebar on review page | REVIEW-03 | Layout | Open any review link → confirm no folder tree sidebar |
| Deleted asset shows placeholder | REVIEW-03 | Error resilience | Create review link → delete one asset → open link → confirm placeholder shown |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
