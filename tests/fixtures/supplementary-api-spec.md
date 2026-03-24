# CloudMetrics — API & Integration Specification (Supplement)

## REST API Design

### Authentication
All API requests require an API key passed via `X-API-Key` header. Keys are scoped to environments (production, staging, development) and can be rotated without downtime.

### Event Ingestion Endpoint

```
POST /v1/events
Content-Type: application/json

{
  "events": [
    {
      "event_type": "page_view",
      "user_id": "usr_abc123",
      "timestamp": "2026-03-20T14:30:00Z",
      "properties": {
        "page": "/dashboard",
        "duration_ms": 4500,
        "referrer": "google"
      }
    }
  ]
}
```

### Batch Limits
- Maximum 1000 events per batch
- Maximum 1MB payload size
- Events older than 72 hours rejected (configurable per tenant)

### SDK Requirements

**JavaScript SDK:**
- Auto-capture page views and clicks
- Session tracking with configurable timeout (default 30min)
- Offline queue with automatic retry
- Tree-shakeable for bundle size optimization
- Must support both browser and Node.js environments

**Python SDK:**
- Async event sending with configurable batch size
- Context manager for automatic flush on exit
- Django and Flask middleware for automatic request tracking
- Type hints throughout

**Ruby SDK:**
- Thread-safe event batching
- Rails middleware for automatic controller action tracking
- Sidekiq integration for background job tracking

## Webhook Integration

### Outbound Webhooks
- Configurable per alert type
- Payload includes: alert details, current metric value, threshold, historical context
- Retry policy: 3 attempts with exponential backoff (1s, 10s, 60s)
- HMAC-SHA256 signature verification
- Webhook delivery logs with response codes

### Inbound Webhooks
- Stripe: subscription lifecycle events for MRR calculation
- Intercom: conversation events for support ticket health scoring
- Salesforce: deal stage changes for revenue pipeline metrics

## Data Export API

### Endpoints
- `GET /v1/metrics/{metric_id}/timeseries` — historical values
- `GET /v1/cohorts/{cohort_id}/retention` — retention matrix
- `GET /v1/accounts/{account_id}/health` — health score breakdown
- `POST /v1/reports/generate` — async report generation

### Rate Limits
- Standard tier: 100 requests/minute
- Professional tier: 1000 requests/minute
- Enterprise tier: custom limits

## Security Considerations

- All data encrypted at rest (AES-256) and in transit (TLS 1.3)
- API keys hashed with bcrypt before storage
- PII fields (email, name) encrypted with tenant-specific keys
- Audit log for all configuration changes
- IP allowlisting available for Enterprise tier
