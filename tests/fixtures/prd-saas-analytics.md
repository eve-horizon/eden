# CloudMetrics — SaaS Analytics Platform PRD

## Overview

CloudMetrics is a real-time analytics platform for SaaS businesses. It ingests product usage events, computes key metrics (MRR, churn, activation, retention), and surfaces insights via dashboards and automated alerts.

## Target Users

- **SaaS Founder/CEO**: Needs high-level health metrics (MRR, churn rate, runway) at a glance. Weekly board report generation.
- **Product Manager**: Tracks feature adoption, activation funnels, and user cohorts. Needs to slice data by plan tier, geography, and signup date.
- **Customer Success Manager**: Monitors account health scores, identifies at-risk customers, and triggers intervention workflows.
- **Data Engineer**: Configures event schemas, manages data pipelines, sets up custom metrics, and troubleshoots ingestion failures.

## Core Capabilities

### 1. Event Ingestion Pipeline
- Accept events via REST API and client SDKs (JS, Python, Ruby)
- Schema validation with auto-detection of new event types
- Real-time streaming into analytics engine (sub-second latency target)
- Dead letter queue for malformed events with retry mechanism
- Rate limiting per API key with burst allowance

### 2. Metric Computation Engine
- Pre-built SaaS metrics: MRR, ARR, churn rate, expansion revenue, net revenue retention
- Activation funnel tracking with configurable milestone definitions
- Cohort analysis (weekly/monthly) with retention curves
- Custom metric builder using SQL-like expressions over event streams
- Scheduled computation jobs with configurable intervals (hourly, daily, weekly)

### 3. Dashboard & Visualization
- Drag-and-drop dashboard builder with 12 widget types
- Real-time auto-refresh (configurable 30s to 5min intervals)
- Shareable dashboard links with optional password protection
- Embeddable widgets for external portals
- Export to PDF, PNG, CSV

### 4. Alerting & Notifications
- Threshold-based alerts (metric exceeds/drops below value)
- Anomaly detection alerts (deviation from historical baseline)
- Multi-channel delivery: email, Slack, PagerDuty, webhook
- Alert escalation policies with configurable cool-down periods
- Alert acknowledgment and resolution tracking

### 5. Customer Health Scoring
- Composite health score from usage frequency, feature breadth, support ticket volume, NPS
- Automated risk segmentation (green/yellow/red)
- Intervention playbook triggers (auto-assign CSM tasks when score drops)
- Historical health trend tracking per account

### 6. Reporting & Export
- Scheduled report generation (daily/weekly/monthly)
- Board-ready report templates with exec summary
- Custom report builder with drag-and-drop sections
- API for programmatic report generation
- White-label report branding

## Technical Constraints
- Must handle 100K events/second at peak
- 99.9% uptime SLA for ingestion API
- Data retention: 2 years hot, 5 years cold storage
- SOC 2 Type II compliance required
- GDPR: data residency options (US, EU, APAC)
- Single sign-on via SAML 2.0 and OIDC

## Non-Functional Requirements
- P95 dashboard load time < 2 seconds
- Metric computation lag < 5 minutes for standard metrics
- Alert delivery < 60 seconds from trigger condition
- Support 500 concurrent dashboard viewers per tenant

## Open Questions
- Should we support self-hosted deployment or cloud-only?
- What's the pricing model — per-event, per-seat, or tiered?
- Do we need a mobile companion app for alert management?
- How do we handle metric backfill when computation logic changes?
- Should custom metrics support JOINs across event types?
