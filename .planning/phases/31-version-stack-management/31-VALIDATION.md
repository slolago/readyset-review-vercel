---
phase: 31
slug: version-stack-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 31 — Validation Strategy

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
| 31-01-01 | 01 | 1 | VSTK-01 | build | `npm run build` | ✅ | ⬜ pending |
| 31-01-02 | 01 | 1 | VSTK-02 | build | `npm run build` | ✅ | ⬜ pending |
| 31-02-01 | 02 | 2 | VSTK-01 | build | `npm run build` | ✅ | ⬜ pending |
| 31-02-02 | 02 | 2 | VSTK-02 | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Unstack option visible per version in modal | VSTK-01 | UI interaction | Open version stack modal → confirm each row has "Unstack" button |
| Unstacked version reappears as standalone in grid | VSTK-01 | State change | Click Unstack on a version → confirm it leaves the stack and appears as a standalone card |
| Version numbers gapless after unstack | VSTK-01 | Data integrity | Unstack V2 from a V1/V2/V3 stack → confirm remaining stack renumbers to V1/V2 |
| Drag-to-reorder works in modal | VSTK-02 | UI drag interaction | Drag a version row to a new position → confirm order updates |
| Version numbers update after reorder | VSTK-02 | Data integrity | Reorder versions → confirm version numbers reflect the new order |
| Numbering gapless after reorder | VSTK-02 | Data integrity | Reorder → confirm no gaps in version sequence |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
