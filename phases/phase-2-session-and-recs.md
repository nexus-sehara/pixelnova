# Phase 2: Session & User Models, Recommendation Engine

## Go/No-Go Checklist

- [ ] Implement robust session management (expiry, guest, opt-in/out logic).
- [ ] Design and implement user profile (authenticated) vs. anonymous logic.
- [ ] Build initial rule-based recommendation engine.
- [ ] Cover core scoring factors: tags, collections, price, recency, popularity.
- [ ] Support device-specific recommendations.
- [ ] Document and enforce privacy: expire/delete guest data as per policy.
- [ ] Add in-code and API toggles for A/B testing logic and fallback flows.
- [ ] E2E and unit tests for all session/user transitions and recommendation results.

### Acceptance Criteria
- Recommendations change appropriately by user/session state.
- All privacy, fallback, and opt-in/out edge cases have tests.
- Architect walkthrough/demo and sign-off.
