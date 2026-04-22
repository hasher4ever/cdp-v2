---
name: Browser for recon only
description: Use browser to understand workflows/inputs/API calls, not to write/fix FE tests — too fragile, gets stuck every session
type: feedback
---

Stop writing/fixing FE E2E tests with Chrome — selectors break constantly (Mantine renders unpredictably), sub-agents get stuck on browser interactions almost every session, ROI is terrible.

**Why:** Almost every autopilot session wastes cycles on Chrome-based selector debugging. The browser is unreliable as a test execution tool in this pipeline.

**How to apply:**
- Use browser ONLY for reconnaissance: snapshot pages, catalog UI elements, trace button→API request mappings
- Write API-level tests from browser observations (deterministic, fast, no selector drift)
- Treat existing E2E tests as maintenance baseline — fix obvious breaks but don't invest in writing new ones
- Focus new test writing on backend/business logic where real bugs live
