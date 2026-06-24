# Rollback Procedure — Production Runbook

## Overview
If a deployment breaks production, rollback must happen in **< 1 minute** with **zero data loss**.

CheckFlow uses Railway's **deployment history** feature for fast rollback.

---

## Prerequisites

- Access to [railway.app](https://railway.app) dashboard
- Production service running (let's call it **CheckFlow Web** and **CheckFlow API**)
- Git history with working previous commits

---

## Quick Rollback (< 1 min)

### Step 1: Identify Bad Deployment
1. Go to [railway.app](https://railway.app) → **CheckFlow** project
2. Click **Web** service → **Deployments** tab
3. Look for the failed deployment (red status or error marker)
4. Note the commit hash and time it deployed

### Step 2: Rollback One Version Back
1. In Deployments tab, find the **last successful deployment** (green status)
2. Click the 3-dot menu (…) on that deployment
3. Click **Deploy** or **Redeploy**
4. Confirm deployment (takes ~30-60s)
5. Watch the health endpoint: `curl https://api.checkflow.digital/health`
   - Wait for `status: "healthy"` response (all checks pass)

### Step 3: Verify Zero Data Loss
```bash
# In production database (Supabase)
SELECT COUNT(*) FROM execucoes; -- Should match count before bad deployment
SELECT COUNT(*) FROM empresas;
SELECT COUNT(*) FROM usuarios;

# Check latest transaction timestamp
SELECT MAX(created_at) FROM execucoes;
```

### Step 4: Alert Team
- Post in Slack: "Rolled back from v[bad] to v[good]. Zero data loss. Investigating [error]."
- Create incident in Linear/GitHub Issues with:
  - Bad commit hash
  - Error from deployment logs
  - Time to rollback
  - Data integrity checks passed ✓

---

## Step-by-Step Rollback Test (for staging)

### Pre-Test Setup
1. Deploy current `main` to **staging** (should be working)
2. Get baseline: `curl https://staging-api.checkflow.digital/health`
3. Get data count: `psql $DATABASE_URL -c "SELECT COUNT(*) FROM execucoes"`

### Test Scenario
1. Deploy a **intentional breaking change** to staging:
   ```bash
   # On a test branch
   git checkout -b test/break-rollback
   # Break something obvious (e.g., comment out a critical route)
   git commit -am "test: intentionally break API"
   git push origin test/break-rollback
   # Trigger deployment to staging
   ```

2. Verify it's broken:
   ```bash
   curl https://staging-api.checkflow.digital/health
   # Should fail or return unhealthy status
   ```

3. **Execute rollback**:
   - Go to Railway staging service → Deployments
   - Click the last **good** deployment (before test/break-rollback)
   - Click "Redeploy"
   - Wait 30-60s for deployment to finish

4. **Verify health**:
   ```bash
   # Endpoint should be healthy
   curl https://staging-api.checkflow.digital/health
   # Status: "healthy", all checks pass
   
   # Data integrity
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM execucoes"
   # Should match baseline
   ```

5. **Verify zero data loss**:
   - Insert a test row before deployment
   - Verify it's still there after rollback
   ```bash
   # Before bad deployment
   INSERT INTO test_rows (data) VALUES ('test-' || now()::text);
   
   # Rollback happens here
   
   # After rollback
   SELECT * FROM test_rows WHERE data LIKE 'test-%';
   # Row should still exist
   ```

6. **Record results**:
   - [ ] Rollback completed in X seconds
   - [ ] Health endpoint returned "healthy" ✓
   - [ ] Database query count unchanged ✓
   - [ ] Test row still exists ✓
   - [ ] No errors in Railway logs ✓

---

## Advanced: Database Rollback (if needed)

⚠️ **Only if data corruption detected during rollback verification.**

### Option A: Point-in-Time Recovery (Supabase)
Supabase maintains **24-hour PITR backups**:

1. Go to [app.supabase.com](https://app.supabase.com) → **CheckFlow** project
2. Click **Settings** → **Backups** tab
3. Look for snapshots before the bad deployment
4. Click **Restore** (⚠️ this is destructive — have approval first)
5. Chose restore time (e.g., 30 min before bad deployment)
6. Confirm (takes 5-10 minutes)
7. Verify: `SELECT COUNT(*) FROM empresas;` — should match previous state

### Option B: Manual Restore from Dump (Advanced)
If PITR fails or is too old:

```bash
# Export current database (for safety)
pg_dump --format=custom \
  postgres://$PROD_DB_USER:$PROD_DB_PASS@$PROD_DB_HOST/checkflow \
  > backup_corrupted_$(date +%s).dump

# Restore from known-good backup (previously saved)
pg_restore -d checkflow \
  /path/to/backup_2026_06_24_clean.dump

# Verify integrity
SELECT * FROM migrations; -- Should be at expected version
SELECT COUNT(*) FROM empresas; -- Should match expected count
```

---

## Rollback Checklist for Prod

**Before rolling back:**
- [ ] Confirmed deployment is broken (not just slow/flaky)
- [ ] Checked `/health` endpoint (unhealthy or unreachable)
- [ ] Checked Railway logs for error (not random blip)
- [ ] Got team approval (Slack/call)

**During rollback:**
- [ ] Found last good deployment in Railway
- [ ] Clicked "Redeploy"
- [ ] Noted time rollback started
- [ ] Watching deployment progress

**After rollback (verifications):**
- [ ] `/health` endpoint responds "healthy" ✓
- [ ] Key tables have expected row counts ✓
- [ ] No new errors in Railway logs ✓
- [ ] Spot-check a few key features work (login, checklist, etc.) ✓
- [ ] Alert team in Slack ✓
- [ ] Create incident post-mortem ✓

---

## Disaster Scenario: Full Database Loss

If somehow both prod and backups are corrupted (extremely unlikely):

1. **Restore from Supabase PITR** (first option)
2. **If PITR unavailable**, contact Supabase support (SLA-based)
3. **Last resort**: Rebuild from git history (migrations can reconstruct schema, but data is gone)

**Mitigation:**
- Ensure nightly backups are exported to separate storage (S3, GCS)
- Monitor backup job success
- Test restore procedure weekly

---

## Testing Rollback in CI

Add to test suite (`pentest/` or `.github/workflows/`):

```bash
#!/bin/bash
# test-rollback.sh

# 1. Deploy v1 to staging
git checkout v1.0.0
git push staging HEAD:main

# 2. Verify v1 is healthy
curl -f https://staging-api.checkflow.digital/health || exit 1

# 3. Deploy v2 (current) to staging
git checkout main
git push staging HEAD:main

# 4. Verify v2 is healthy
curl -f https://staging-api.checkflow.digital/health || exit 1

# 5. Rollback to v1
# (Use Railway API or CLI if available)
railway service rollback --version=v1.0.0

# 6. Verify rollback succeeded
sleep 30
curl -f https://staging-api.checkflow.digital/health || exit 1

echo "✓ Rollback test passed"
```

---

## Tools & Commands

| Task | Command | Time |
|------|---------|------|
| Deploy new version | Railway UI → Redeploy | 30-60s |
| Check health | `curl /health` | <1s |
| View logs | Railway Logs tab | Real-time |
| Database query | `psql $DATABASE_URL -c "..."` | <5s |
| PITR restore | Supabase UI → Backups → Restore | 5-10 min |

---

## Post-Rollback: Root Cause Analysis

After rollback is successful, investigate the bad deployment:

1. **Check deployment logs:**
   ```
   Railway → Logs tab → Filter by deployment ID
   ```

2. **Identify the breaking change:**
   ```bash
   git log --oneline v_good..v_bad
   # Find which commit broke it
   ```

3. **Fix and re-test:**
   ```bash
   git revert <bad-commit>
   git push origin <feature-branch>
   # Re-test in CI before merging back to main
   ```

4. **Add regression test:**
   If it's a logic bug, add a test case to prevent repeat

---

## Next Steps

- [ ] **This week:** Test rollback in staging (full scenario 1 time)
- [ ] **Before next release:** Practice rollback procedure (dry-run on staging)
- [ ] **Monthly:** Verify backups and PITR availability
- [ ] **Quarterly:** Test database restore from S3 backup
