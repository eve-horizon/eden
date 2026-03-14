# Scenario 08: Document Ingestion Pipeline — Optimization Report

**Date:** 2026-03-14
**Runs:** 7 iterations (3 from prior session + 4 this session)

## Summary

Reduced total LLM calls from **88 to ~40** (55% reduction) across the 3-step ingestion pipeline (ingest → extract → synthesize). All steps complete successfully with correct changeset creation.

## Results

| Run | Ingest | Extract | Synthesize | Total | Key Change |
|-----|--------|---------|------------|-------|------------|
| 3   | 7      | 24      | 57         | 88    | Baseline (skill fixes from prior session) |
| 4   | 9      | 11      | 32         | 52    | Skill documentation improvements |
| 5   | 8      | 13      | 18         | 39    | Fixed missing port in resolved API URLs |
| 6   | 8      | 11      | 20         | 39    | Removed `.eve/resources/index.json` checks from extract/synthesis |
| 7   | 9      | 11      | 25         | 45    | Switched to curl, temp file for changeset JSON |

## Changes Made

### Platform (eve-horizon-2)

1. **Fixed missing port in API URL resolution** (prior session, commit `c6d113d7`)
   - `eve agents sync` was storing manifests without the `services` section
   - `resolveApisFromManifest()` couldn't extract port 3000, producing URLs without port suffix
   - Synthesis agent wasted ~14 calls retrying connection timeouts
   - Fix: CLI now includes `services` and `environments` in workflow manifest sync

2. **Kept curl in agent-runtime Docker image** (commit `81757952`, release v0.1.207)
   - Dockerfile was purging curl after build (`apt-get purge -y --auto-remove curl`)
   - Agents need curl for simple API calls — it's far more efficient than `node --input-type=module -e` with `fetch()`
   - Removed the purge line

3. **Restored curl examples in `buildAppApiInstructionBlock`** (same commit)
   - Previously removed curl examples thinking curl wasn't available
   - Now that curl IS available, restored the dual curl/fetch examples

### Eden Skills

4. **Removed `.eve/resources/index.json` checks from extract and synthesis skills**
   - Only the ingest step has materialized resources via `resource_refs`
   - Extract and synthesis steps were wasting 1 call each checking for a non-existent file
   - Updated skills to say "Do NOT check `.eve/resources/index.json`"

5. **Switched all skills from `node --input-type=module -e` to curl** (commit `04468f8`)
   - Simpler, fewer quoting issues, more natural for agents
   - 7 skills updated: synthesis, alignment, question, coordinator, map-chat, ingestion, extraction
   - For complex POST payloads: write JSON to temp file, then `curl -d @/tmp/payload.json`
   - Ingestion/extraction: clarified "don't call APIs" (not "no curl")

6. **Temp file pattern for changeset creation**
   - Agents were hitting shell quoting issues with inline `node -e` scripts containing large JSON
   - New pattern: `cat > /tmp/changeset.json << 'JSON'` then `curl -d @/tmp/changeset.json`

### Eden Skill Documentation Fixes (prior session)

7. **Removed `/api/` prefix from API endpoint docs** — agents were prepending `/api/` to all calls
8. **Removed source confirmation from ingestion skill** — was causing duplicate pipeline triggers
9. **Added explicit document discovery instructions** — agents now know exactly where to find files
10. **Added `EVE_APP_API_URL_API` env var usage** — agents no longer hardcode API URLs

## Remaining Issues

### Platform Gaps (tracked as beads)

1. **`with_apis` is workflow-level, not per-step** — The extract step gets API info it doesn't need, causing agents to waste 1 call trying the API. Should support per-step `with_apis` configuration.

2. **CLI npm publish needed** — The `eve agents sync` fix for including services in manifests (commit `c6d113d7`) is in the source but hasn't been published to npm. Users running the npm-installed CLI still hit the missing-port bug.

### Minor Variability

- Synthesis step varies between 18-25 calls depending on:
  - Initial API connection latency (Eden sandbox cold start)
  - Whether the agent calls the ingest-complete webhook (useful but adds 1 call)
  - Quote escaping attempts before finding the temp file pattern

## Verification

All runs produced valid changesets with extracted requirements (personas, activities, steps, tasks) from the high-level summary document. The changeset POST to the Eden API succeeded, and the ingest-complete webhook was called to update source status.
