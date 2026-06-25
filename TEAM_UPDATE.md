# Team Update — Sample Slack Message

Posted to `#devops-support` (or `#devops-support-prod` for prod):

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
- Workflow run: `https://github.com/rayanubhab/spliteasy-terraform/actions/runs/<run-id>`


**Risks/concerns:**
- No alerting configured yet — if something breaks, we'll find out from
  `/health` checks or user reports.

**Contact:** ping me (Anubhab) here or in `#devops-support` if anything looks off.

---


