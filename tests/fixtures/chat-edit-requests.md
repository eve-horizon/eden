# Chat Edit Request Prompts for E2E Testing

These are natural language prompts to send to the map-chat agent during E2E testing. Each prompt should result in a changeset proposal.

## Simple Entity Creation

### CHAT-01: Add a persona
> Add a new persona called "Data Engineer" with code DE and color #8B5CF6. They are responsible for configuring event schemas, managing data pipelines, and troubleshooting ingestion failures.

### CHAT-02: Add a task to an existing step
> Add a task under the Event Ingestion activity for the Data Engineer persona: "Configure dead letter queue monitoring" with acceptance criteria: alerts fire when DLQ depth exceeds 1000 events, failed events are automatically retried after schema fix.

### CHAT-03: Add a new activity with steps and tasks
> Add a new activity called "Compliance & Security" with two steps: "Data Governance" containing tasks for GDPR data residency configuration and PII field encryption setup, and "Audit & Access Control" containing tasks for SOC 2 audit log implementation and IP allowlist management. Assign these to the Data Engineer persona.

## Modification Requests

### CHAT-04: Rename and restructure
> Rename the "Dashboard & Visualization" activity to "Analytics Experience" and split the "Widget Builder" step into two steps: "Core Widgets" for the standard widget types and "Custom Widgets" for the drag-and-drop builder and embeddable widgets.

### CHAT-05: Reprioritize tasks
> Mark all tasks related to alerting as high priority. The alert delivery SLA of under 60 seconds is a key differentiator and these should be in our MVP release.

## Cross-Cutting Changes

### CHAT-06: Add questions about ambiguous requirements
> I'm not sure about the pricing model yet. Can you add questions about: (1) whether per-event pricing will discourage high-volume usage, (2) how seat-based pricing handles API-only integrations with no human users, and (3) whether we need a free tier for developer adoption?

## Complex Multi-Entity Changes

### CHAT-07: Expand a feature area
> The Customer Health Scoring section needs more detail. Add steps for: "Health Score Configuration" with tasks for defining score weights and configuring data sources, "Risk Detection" with tasks for automated red-flag identification and churn prediction model integration, and "Intervention Workflows" with tasks for CSM task auto-assignment and escalation policy configuration. Assign the CSM persona as owner and Product Manager as contributor.
