# Observability + Cost Tracking

## Use When
- You need to trace a request or job through the system using correlation IDs.
- You need to inspect execution receipts, token usage, or cost breakdowns.
- You need analytics dashboards for org health, job stats, or pipeline metrics.
- You need to configure OpenTelemetry or inspect provider/model availability.

## Load Next
- `references/cli.md` for full analytics and admin CLI syntax.
- `references/jobs.md` for job lifecycle phases and attempt details.
- `references/deploy-debug.md` for real-time log streaming and debugging.

## Ask If Missing
- Confirm the org ID for analytics queries (all analytics are org-scoped).
- Confirm the time window for usage and cost reports (default varies by endpoint).
- Confirm whether OTEL is enabled and where the collector endpoint is.

## Correlation IDs

Every request carries `x-eve-correlation-id`. If missing on inbound, the API generates a UUID and echoes it back. The ID propagates: API -> Orchestrator -> Worker -> Runner.

Standard structured log fields:

| Field | Always | When Available |
|---|---|---|
| `timestamp`, `level`, `service`, `message` | Yes | -- |
| `correlation_id`, `trace_id` | Yes | -- |
| `job_id`, `attempt_id`, `event_id` | -- | Yes |

Job execution lifecycle events are also written to `execution_logs` with correlation fields in the lifecycle `meta` object.

## Execution Receipts

Receipts capture timing, token usage, and cost breakdowns per attempt. Assembled from lifecycle events plus `llm.call` usage events.

- `llm.call` events contain usage only (no content). Emitted by harnesses after each provider call.
- `eve job follow` displays live cost totals when `llm.call` events stream.

```bash
eve job receipt <job-id>              # View cost receipt for a job
eve job compare <job-id-1> <job-id-2> # Compare receipts across jobs
```

API: `GET /jobs/{job_id}/receipt`

### Receipt Fields

| Field | Description |
|---|---|
| `duration_ms` | Wall-clock execution time |
| `input_tokens` | Total input tokens across all LLM calls |
| `output_tokens` | Total output tokens across all LLM calls |
| `total_cost` | Computed cost from rate card |
| `model` | Model used (may differ from requested if bridged) |
| `provider` | Resolved provider |

### Admin Receipt Recompute

```bash
eve admin receipts recompute                        # Recompute all
eve admin receipts recompute --since 2026-01-01     # From date
eve admin receipts recompute --project proj_xxx     # Single project
eve admin receipts recompute --dry-run              # Preview only
```

## Analytics Dashboard

All analytics are org-scoped. Return aggregate counters, not per-item listings. Use `--json` for machine-readable output.

```bash
eve analytics summary --org org_xxx [--window 7d]
eve analytics jobs --org org_xxx [--window 7d]
eve analytics pipelines --org org_xxx [--window 7d]
eve analytics env-health --org org_xxx
```

| Endpoint | Returns |
|---|---|
| `summary` | Org-wide aggregate (jobs, pipelines, envs) |
| `jobs` | Job counters: created, completed, failed, active |
| `pipelines` | Pipeline success rates and durations |
| `env-health` | Environment snapshot: total, healthy, degraded, unknown |

`--window` accepts relative durations: `7d`, `24h`, `30d`.

## Cost Tracking

Eve tracks costs through execution receipts, resource classes, per-job budgets, and an org balance ledger.

### Rate Cards

```bash
eve admin pricing seed-defaults       # Seed default rate cards (admin)
```

Rate cards map model + provider to per-token costs. The platform uses these to compute receipt costs automatically.

### Balance + Usage

```bash
eve admin balance show <org_id>                     # Current balance
eve admin balance credit <org_id> --amount 100.00   # Add credit
eve admin balance transactions <org_id>             # Transaction history

eve admin usage list --org org_xxx                   # Usage records
  [--since 2026-01-01] [--until 2026-02-01]
eve admin usage summary --org org_xxx                # Aggregated summary

eve org spend --org org_xxx                          # Org spend overview
eve project spend --project proj_xxx                 # Project spend
```

## Provider + Harness Discovery

```bash
eve providers list [--json]                         # Registered providers
eve providers discover <provider> [--json]          # Live model list (cached with TTL)
eve harness list [--capabilities]                   # Harness model support matrix
```

## OpenTelemetry Configuration

OTEL is enabled when `OTEL_ENABLED=true` or `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Uses OTLP HTTP exporter with automatic Node.js instrumentation.

| Variable | Purpose |
|---|---|
| `OTEL_ENABLED` | `true`/`false` -- enable OTEL |
| `OTEL_DISABLED` | `true` -- hard disable (overrides OTEL_ENABLED) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint (e.g. `http://otel-collector:4318`) |

## Real-Time Monitoring

```bash
eve job follow <id>                   # Stream harness logs + live cost totals
eve job watch <id>                    # Combined status + logs streaming
eve job runner-logs <id>              # K8s runner pod stdout/stderr
eve system logs <service> [--tail 50] # Service logs (api, orchestrator, worker, postgres)
eve system events [--limit 50]        # Recent platform events
```

## CLI Quick Reference

| Intent | Command |
|---|---|
| Trace a request | Check `x-eve-correlation-id` in response headers |
| Job cost receipt | `eve job receipt <id>` |
| Compare job costs | `eve job compare <id1> <id2>` |
| Org analytics | `eve analytics summary --org <id> --window 7d` |
| Job metrics | `eve analytics jobs --org <id>` |
| Pipeline metrics | `eve analytics pipelines --org <id>` |
| Env health | `eve analytics env-health --org <id>` |
| Org balance | `eve admin balance show <org_id>` |
| Usage report | `eve admin usage summary --org <id>` |
| Recompute receipts | `eve admin receipts recompute [--dry-run]` |
| Provider models | `eve providers discover <provider>` |
| Stream job logs | `eve job follow <id>` |
| Platform events | `eve system events` |
