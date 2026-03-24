# Beads Quick Reference

## Session Start
```bash
bd sync && bd ready
```

## Find Next Work
```bash
bd list --status=in_progress   # Continue existing?
bd ready                       # Find new work
bd show <id>                   # Read details
bd update <id> --status=in_progress  # Claim it
```

## During Work
```bash
bd comment <id> "note"         # Progress update
bd create --title="..." --type=task  # Discovered work
```

## Complete Work
```bash
bd close <id>                  # Done
bd sync                        # Push to team
```

## Health Check
```bash
bd doctor && bd doctor --fix
```

## Priority: P0 (critical) → P4 (backlog)
## Types: epic, task, bug, feature
