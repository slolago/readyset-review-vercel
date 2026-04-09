---
phase: 30
slug: asset-review-status
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 30 — Validation Strategy

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
| 30-01-01 | 01 | 1 | STATUS-01 | build | `npm run build` | ✅ | ⬜ pending |
| 30-01-02 | 01 | 1 | STATUS-01 | build | `npm run build` | ✅ | ⬜ pending |
| 30-01-03 | 01 | 1 | STATUS-02 | build | `npm run build` | ✅ | ⬜ pending |
| 30-02-01 | 02 | 2 | STATUS-02 | build | `npm run build` | ✅ | ⬜ pending |
| 30-02-02 | 02 | 2 | STATUS-02 | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Right-click context menu shows status options | STATUS-01 | UI interaction | Right-click an asset → confirm Approved / Needs Revision / In Review options appear |
| Setting status persists after refresh | STATUS-01 | State persistence | Set a status → refresh page → confirm badge still shows |
| Colored badge appears on grid card | STATUS-02 | Visual | Set status → confirm colored badge appears on asset card in grid |
| Badge appears in asset viewer | STATUS-02 | Visual | Open asset viewer → confirm badge is visible |
| No badge for unset status | STATUS-02 | Visual absence | Asset with no status set → confirm no badge rendered |
| Clear status removes badge | STATUS-01 | State mutation | Set status → clear it → confirm badge disappears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
