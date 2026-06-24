# Deployment Runbook — SplitEasy

This runbook assumes nothing beyond "someone with AWS/GitHub access is
deploying this at 2am." Follow it top to bottom.

## Prerequisites

- AWS CLI v2 installed and configured (or access to a role you can assume)
- Terraform >= 1.5.0
- Access to the GitHub repo with permission to trigger workflow dispatch
- IAM permissions: read-only AWS credentials are enough for the submitted
  plan workflow. A real deployment pipeline would use a separate,
  approval-gated role with write permissions.
- For production use: an encrypted S3 bucket and DynamoDB locking table for
  Terraform remote state. This take-home keeps backend configuration out of
  the repo so `terraform init` can run without a placeholder bucket.

## 1. Planning an environment

### Via GitHub Actions

1. Go to the repo's **Actions** tab → **Terraform Plan** workflow.
2. Click **Run workflow**, choose the target environment (`dev`, `staging`,
   or `prod`).
3. Watch the run logs. The job runs `terraform init`, `terraform validate`,
   `terraform fmt -check`, and `terraform plan` against that environment.
4. Review the plan output in the workflow logs. On pull requests, the workflow
   also posts the plan summary and readable plan output as a PR comment.

### Locally (break-glass / debugging only)

```bash
cd terraform/environments/<env>
terraform init
terraform plan -var-file=<env>.tfvars -out=tfplan
```

This take-home intentionally stops at planning. In a real deployment pipeline,
`terraform apply tfplan` should run only from an approval-gated CI workflow.

## 2. Verifying a deployment

1. **Infra health:**
   ```bash
   terraform output alb_dns_name
   curl -i http://<alb_dns_name>/health
   ```
   Expect `HTTP/1.1 200 OK` and `{"status":"ok"}`.

2. **DB connectivity:**
   ```bash
   curl -i http://<alb_dns_name>/health/deep
   ```
   Expect `{"status":"ok","db":"connected"}`. A `503` here means the app is up
   but can't reach Postgres — go to Troubleshooting → "DB unreachable."

3. **ASG health in AWS Console:** EC2 → Auto Scaling Groups →
   `spliteasy-<env>-asg-*` → Instance refresh / Activity tab should show
   all instances `InService` and passing the ALB health check.

4. **Functional smoke test:** open `http://<alb_dns_name>/` in a browser,
   add a person and an expense, refresh — they should persist (confirms the
   DB write path end to end).

## 3. Rollback

**If the instance refresh is still in progress (bad new instances rolling
out):**
```bash
aws autoscaling cancel-instance-refresh --auto-scaling-group-name <asg-name>
```
This halts the rollout — old, known-good instances are left running for any
that haven't been replaced yet.

**If the bad version is already fully rolled out:**
1. Revert the app code/commit in the source repo to the last known-good
   commit.
2. In a production pipeline, re-run the approval-gated apply workflow for that
   environment. The launch template's `user_data` re-clones the repo at the
   now reverted ref, and the ASG instance refresh replaces instances with the
   rolled-back version.
3. If infra (not app code) caused the issue, use `terraform plan` to confirm
   what a revert-and-reapply would change before applying.

**If RDS is the problem (e.g. bad migration):** restore from the latest
automated snapshot (RDS → Snapshots → Restore) into a new instance, then
update `db_host` and re-point the app — do **not** attempt to "undo" a
migration in place against prod data without a snapshot first.

## 4. Common issues & troubleshooting

| Symptom | Likely cause | What to check |
|---|---|---|
| ALB returns `502`/`503` | No healthy targets | EC2 → Target Groups → check target health; SSM into an instance and `systemctl status spliteasy` |
| `/health` is `200` but `/health/deep` is `503` | App can't reach RDS | Check RDS SG allows the app SG on 5432; check RDS instance status isn't `rebooting`/`failed` |
| New instances never become healthy after a deploy | `user_data` failing (e.g. GitHub unreachable, npm install failing) | SSM into the instance: `sudo journalctl -u spliteasy -n 100` and `cat /var/log/cloud-init-output.log` |
| `terraform apply` hangs on RDS changes | Multi-AZ failover or storage modification in progress | RDS changes that require a reboot can take 5-10+ min; check RDS console "Recent events" |
| GitHub Actions AWS auth fails (`InvalidClientTokenId`/`AccessDenied`) | Repo secret `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` is missing, expired, or rotated | Check Settings → Secrets → Actions; confirm the IAM user behind the key still exists and is active in IAM |
| Secrets Manager fetch fails at boot (`AccessDenied`) | Instance role policy doesn't match the secret ARN exactly | Compare `db_secret_arn` output to the IAM policy `Resource` field — ARNs must match exactly, including the random suffix Secrets Manager appends |

## 5. Access for SSH-less debugging

Instances have no public IP and no SSH key — access is via **SSM Session
Manager** (instance role includes `AmazonSSMManagedInstanceCore`):

```bash
aws ssm start-session --target <instance-id>
```
