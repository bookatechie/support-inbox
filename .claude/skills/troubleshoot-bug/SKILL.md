---
name: troubleshoot-bug
description: Systematically troubleshoot bugs by tracing data flow through code, comparing expected vs actual behavior. Use when investigating why stored data differs from expected values, or when a feature works in one code path but not another.
argument-hint: [ticket-id or bug description]
allowed-tools: Read, Grep, Glob, Bash(psql:*), Bash(git:*)
---

# Bug Troubleshooting Workflow

When troubleshooting a bug, follow this systematic approach:

## 1. Gather Evidence

Start by understanding what the user is seeing vs what they expect:

- **Read the .env file** to get PostgreSQL credentials
- **Query the database directly** using psql with credentials from .env
- **Check the actual output** (email sent, API response, UI display)
- **Compare** stored data vs what was sent/displayed
- Document the discrepancy clearly

Example:
```bash
# Read credentials from .env and query directly
PGPASSWORD='<from .env>' psql -h <POSTGRES_HOST> -p <POSTGRES_PORT> -U <POSTGRES_USER> -d <POSTGRES_DB> --set=sslmode=require -c "SELECT id, sender_email, sender_name FROM messages WHERE ticket_id = 123;"
```

## 2. Find Recent Changes

Check if this area was recently modified:

```bash
# Find recent commits that touched relevant files
git log --oneline -10 -- <file>

# Show what changed in a specific commit
git show <commit-hash> -p
```

Look for:
- New parameters added but not fully integrated
- Refactors that may have missed edge cases
- Features that work for immediate actions but not deferred ones (scheduled jobs, webhooks)

## 3. Trace the Data Flow

Follow the code path from input to output:

1. **Entry point**: Find where data enters (API route, form handler)
2. **Processing**: Follow through business logic, transformations
3. **Storage**: Check what gets saved to database
4. **Output**: Check what gets sent/displayed

For each step, verify the value is what you expect. The bug is where expected != actual.

## 4. Identify the Root Cause

Common patterns:
- **New parameter not propagated**: Added to one place but not all code paths
- **Fallback masking the issue**: Default value hides missing data
- **Scheduled/async code diverged**: Immediate path works, deferred path doesn't
- **Type mismatch**: JSON string vs array, null vs undefined

## 5. Check for Similar Issues

Once you find the bug, search for the same pattern elsewhere:

```bash
# Find similar code that might have the same issue
grep -r "similar_pattern" src/
```

Pay special attention to:
- Scheduled jobs / background workers
- Webhook handlers
- Batch processing code
- Any code that was copy-pasted from the buggy code

## 6. Fix and Verify

- Fix the root cause, not just the symptom
- If you find related issues, fix them too
- Ensure the fix works for all code paths (immediate AND deferred)

## 7. Document Findings

Summarize:
- What was the bug?
- Why did it happen?
- What was the fix?
- Were there related issues?
