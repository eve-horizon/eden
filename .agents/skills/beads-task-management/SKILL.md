---
name: beads-task-management
description: Work tracking with Beads - setup, maintenance, task breakdown, and finding work
---

# Beads Task Management

This skill covers how to use Beads for AI-native issue tracking in this repository.

## Overview

Beads uses a Dolt database (version-controlled SQL) as its storage backend. The database lives in `.beads/dolt/` and is gitignored. The canonical exchange format is `.beads/issues.jsonl` which is committed alongside your code. Mutations auto-flush to JSONL — no manual export needed.

## New Repository Setup

### Fresh Clone

After cloning a repo with beads configured:

```bash
bd bootstrap                # Set up database (auto-detects best source)
bd doctor                   # Verify setup is healthy
bd list                     # See available work
```

### Initializing Beads in a New Repo

```bash
bd init                     # Creates .beads/ structure with Dolt backend
```

The config file `.beads/config.yaml` uses sensible defaults:
```yaml
# issue-prefix auto-detects from directory name if not set
```

## Health Checks

Run `bd doctor` regularly to verify setup:

```bash
bd doctor           # Check health
bd doctor --fix     # Auto-fix common issues
```

**Healthy output looks like:**
```
✓ 60 passed  ⚠ 2 warnings  ✖ 0 failed
```

**Common issues and fixes:**

| Issue | Fix |
|-------|-----|
| Missing hooks | `bd doctor --fix` |
| Database corruption | `bd bootstrap` |
| Outdated hooks | `bd hooks install --force` |

## Daily Workflow

### Starting a Session

```bash
bd ready             # Show unblocked work available to claim
bd list              # Show all open issues
```

### Finding What to Work On

When asked to "do the next bit of work" or find work autonomously:

1. **Check for in-progress work first:**
   ```bash
   bd list --status=in_progress
   ```
   If you have work in progress, continue that.

2. **Find ready work (unblocked, unassigned):**
   ```bash
   bd ready
   ```

3. **Priority order:**
   - P0 (critical) > P1 (high) > P2 (medium) > P3 (low) > P4 (backlog)
   - Prefer tasks over epics (epics are containers)
   - Prefer unblocked work (no `blockedBy` dependencies)

4. **Claim and start:**
   ```bash
   bd show <id>                           # Read full description
   bd update <id> --status=in_progress    # Claim it
   ```

### During Work

```bash
bd update <id> --status=in_progress      # Mark as started
bd comment <id> "Found the issue in X"   # Add progress notes
bd create --title="Fix Y" --type=task    # Create discovered work
bd dep add <new-id> <parent-id>          # Link as subtask
```

All mutations auto-flush to `.beads/issues.jsonl` — no manual export needed during work.

### Completing Work

```bash
bd close <id>                    # Mark complete (auto-flushes)
bd close <id> --reason="Done"    # With note
bd close <id1> <id2> <id3>       # Close multiple at once
```

**Close issues immediately** when work is done - don't batch at session end.

### Ending a Session

Mutations auto-flush to JSONL throughout the session. Commit `.beads/issues.jsonl` alongside your code changes — no separate sync step needed.

## Breaking Down Large Tasks

When facing a large task or epic, decompose it into actionable subtasks:

### 1. Create the Epic (Container)

```bash
bd create --title="Implement feature X" --type=epic --priority=2
# Returns: eden-abc
```

### 2. Break into Subtasks

Think about:
- What are the distinct deliverables?
- What can be done in parallel vs sequentially?
- What are the risk areas that need investigation first?

```bash
# Create subtasks
bd create --title="Research approach for X" --type=task
bd create --title="Implement core X logic" --type=task
bd create --title="Add tests for X" --type=task
bd create --title="Update docs for X" --type=task
```

### 3. Link Dependencies

```bash
# Subtask depends on epic (parent-child)
bd dep add eden-def eden-abc

# Task blocked by another task
bd dep add eden-ghi eden-def  # ghi waits for def
```

### 4. Verify Structure

```bash
bd show eden-abc    # See epic with children
bd blocked                 # See what's waiting on what
bd ready                   # See what can be started now
```

### Decomposition Guidelines

| Task Size | Action |
|-----------|--------|
| < 1 hour | Just do it, no subtasks needed |
| 1-4 hours | Single task, maybe split if distinct phases |
| 4+ hours | Definitely break down into subtasks |
| Multi-day | Create epic with child tasks |

**Good subtask characteristics:**
- Single clear deliverable
- Can be verified as done
- Minimal dependencies on other subtasks
- Fits in one focused session

## Data Persistence

Beads auto-flushes all mutations to `.beads/issues.jsonl`. This file is committed alongside your code — issues travel with the branch.

For backup and recovery:

```bash
bd backup                   # Export all tables to .beads/backup/
bd backup restore           # Restore from JSONL backup files
bd export -o snapshot.jsonl # Export issues to a standalone file
```

## Recursive skill distillation

- Capture new Beads workflows and edge cases here.
- Split out a new skill when a focused pattern keeps repeating.
- Update the private-eve-dev-skills README and docs/system/skillpacks.md after changes.
