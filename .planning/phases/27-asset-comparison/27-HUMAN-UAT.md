---
status: partial
phase: 27-asset-comparison
source: [27-VERIFICATION.md]
started: 2026-04-08T00:00:00Z
updated: 2026-04-08T00:00:00Z
---

## Current Test

number: 1
name: Video sync accuracy
expected: |
  Play/pause and scrubber keep both videos within ~100ms of each other throughout playback
awaiting: user response

## Tests

### 1. Video sync accuracy
expected: Play/pause and scrubber keep both videos within ~100ms of each other throughout playback.
result: [pending]

### 2. Audio toggle behavior
expected: Clicking the audio toggle mutes one side and unmutes the other; only one side plays audio at a time.
result: [pending]

### 3. Controls bar visibility for image-only pairs
expected: When both selected assets are images (no video), play/pause and scrubber are hidden or replaced with a static display.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
