# Question Answers for E2E Testing

Pre-crafted answers to use when testing the question-evolution workflow. Each answer is designed to potentially trigger map changes.

## QA-01: Deployment model question
**Question:** Should we support self-hosted deployment or cloud-only?
**Answer:** Cloud-only for the first 18 months. Self-hosted is a Phase 3 initiative targeting enterprise customers with strict data residency requirements. For now, we offer multi-region cloud deployment (US-East, EU-West, APAC-Singapore) to satisfy data residency needs without the operational burden of self-hosted support.

*Expected outcome:* Should trigger creation of a "Multi-Region Deployment" step with tasks for region configuration and data routing.

## QA-02: Pricing model question
**Question:** What's the pricing model — per-event, per-seat, or tiered?
**Answer:** Tiered pricing based on monthly tracked users (MTU), not events. Three tiers: Starter (up to 10K MTU, $299/mo), Growth (up to 100K MTU, $999/mo), Enterprise (custom). All tiers include unlimited events per user and unlimited seats. This avoids penalizing high-engagement products.

*Expected outcome:* Informational — may not trigger map changes, or may add billing-related tasks.

## QA-03: Mobile app question
**Question:** Do we need a mobile companion app for alert management?
**Answer:** Not a native app — but we need a responsive PWA that works well on mobile for alert acknowledgment and quick metric checks. The full dashboard builder is desktop-only. Push notifications via the PWA service worker replace the need for a native app.

*Expected outcome:* Should trigger tasks for PWA implementation and push notification setup under a "Mobile Experience" step.

## QA-04: Metric backfill question
**Question:** How do we handle metric backfill when computation logic changes?
**Answer:** Implement a versioned computation pipeline. When a metric definition changes, create a new version. Historical data is recomputed asynchronously using the new version, with a progress indicator in the UI. During recomputation, the UI shows the old values with a "recomputing" badge. Backfill jobs are deprioritized behind real-time computation to avoid impacting live dashboards.

*Expected outcome:* Should trigger creation of tasks for versioned computation, backfill job runner, and recomputation UI indicators.
