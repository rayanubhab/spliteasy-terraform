# Team Update — Sample Slack Message

Posted to `#deploys` (or `#eng-announcements` for prod):

---

**🚀 Deploying: SplitEasy → `staging`**

**What/why:** Rolling out the new SplitEasy service (API + frontend) to
staging ahead of the prod cutover. New infra: ALB + auto-scaling EC2 fleet +
RDS Postgres, all in private subnets.

**Impact:** No impact to existing services — this is a new service, nothing
else is touched. Staging URL will be live at the link below once the rollout
finishes.

**Timeline:** Deploying now via GitHub Actions, ~10 min (instance refresh +
health checks). Will post here when it's done.

**Links:**
- PR: `<link to PR>`
- Architecture & decisions: [README.md](./README.md)
- Deploy/rollback steps: [RUNBOOK.md](./RUNBOOK.md)
- Workflow run: `<link to GitHub Actions run>`
- Dashboards: *not yet wired up — tracked in `<ticket link>`*

**Risks/concerns:**
- No HTTPS yet on this environment (HTTP only) — fine for staging, blocking
  item before prod.
- No alerting configured yet — if something breaks, we'll find out from
  `/health` checks or user reports, not paging. Tracked in `<ticket link>`.

**Contact:** ping me (@anubhab) here or in `#deploys` if anything looks off.

---

### Notes on why it's written this way

- **Leads with what/why in one line** — a PM or support engineer scanning
  Slack shouldn't need to open a doc to know what's happening.
- **Risks are stated plainly, not buried** — "no HTTPS, no alerting yet" is
  the kind of thing someone on support needs to know *before* a customer
  reports it, not after.
- **Links instead of inline detail** — anyone who wants the "why" behind a
  decision clicks through to the README; anyone who just needs to know
  "is this going to break my thing" gets the answer in the message itself.
- **No jargon-heavy infra detail in the headline** — "auto-scaling EC2
  fleet" is mentioned once for context, not explained; engineers can ask,
  non-engineers don't need it to understand the impact.
