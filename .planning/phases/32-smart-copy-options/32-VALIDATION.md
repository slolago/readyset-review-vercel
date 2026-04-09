---
phase: 32
slug: smart-copy-options
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 32 — Validation Strategy

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
| 32-01-01 | 01 | 1 | REVIEW-01 | build | `npm run build` | ✅ | ⬜ pending |
| 32-01-02 | 01 | 1 | REVIEW-01, REVIEW-02 | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Latest version only" toggle visible for stacked asset | REVIEW-01 | UI visibility | Open copy modal on a versioned asset → confirm toggle appears |
| Toggle hidden for standalone asset | REVIEW-01 | Conditional UI | Open copy modal on a non-versioned asset → confirm no toggle |
| Latest version only copies head version | REVIEW-01 | State change | Enable toggle → copy → confirm only latest version in destination |
| All versions copied when toggle off | REVIEW-01 | State change | Disable toggle → copy → confirm all versions in destination |
| "Comments not copied" note visible | REVIEW-02 | UI disclosure | Open copy modal → confirm info note is present |
| No comments in destination after copy | REVIEW-02 | Data integrity | Copy asset with comments → open destination → confirm no comments |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
