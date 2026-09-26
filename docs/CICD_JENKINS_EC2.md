# CI/CD with Jenkins on AWS EC2

This guide sets up a single EC2 instance that runs **Jenkins** and the **production app** (Postgres + API/Socket.io + web). Every push to GitHub triggers a build. Every push to `main` is also deployed automatically.

```
 git push ──► GitHub ──webhook──► Jenkins (EC2 :8080)
                                     │
                                     ├─ 1. Prepare           image tag = <build#>-<git sha>
                                     ├─ 2. Build & Typecheck docker build (pnpm install, turbo build, tsc)
                                     ├─ 3. Integration Tests throwaway Postgres + 4 reservation/feed checks
                                     ├─ 4. Deploy       (main only) docker compose up -d
                                     └─ 5. Smoke Test   (main only) /health, /api/v1/drops, index.html
                                                   │
                  Browser ──► EC2 :80 ──► nginx (web container)
                                            ├─ /            → React build (static)
                                            ├─ /api/*       → server:5000
                                            └─ /socket.io/* → server:5000 (websocket)
                                                               └─► postgres (volume: inventory_pgdata)
```

## Files involved

| File | Purpose |
| --- | --- |
| [`Jenkinsfile`](../Jenkinsfile) | Pipeline definition |
| [`Dockerfile`](../Dockerfile) | Multi-stage build with three targets: `build` (also the CI test runner), `server`, `web` |
| [`docker-compose.ci.yml`](../docker-compose.ci.yml) | Throwaway Postgres (tmpfs) plus the integration test run |
| [`docker-compose.prod.yml`](../docker-compose.prod.yml) | Production stack |
| [`deploy/nginx.conf`](../deploy/nginx.conf) | Static hosting, API proxy, websocket proxy |
| [`deploy/server-entrypoint.sh`](../deploy/server-entrypoint.sh) | Runs `prisma migrate deploy`, optionally seeds, then starts the server |
| [`deploy/.env.prod.example`](../deploy/.env.prod.example) | Template for production secrets (stored in Jenkins, not in git) |

You can reproduce the whole pipeline locally before using Jenkins. See [Step 0](#step-0--optional-dry-run-on-your-machine).

---

## Step 0 — (Optional) Dry run on your machine

Requires Docker with the compose plugin.

```bash
export IMAGE_TAG=0-local
docker build --target build  -t inventory-build:$IMAGE_TAG  .
docker build --target server -t inventory-server:$IMAGE_TAG .
docker build --target web    -t inventory-web:$IMAGE_TAG    .

# Integration tests (exit code 0 = pass)
docker compose -f docker-compose.ci.yml -p inventory-ci-local up --abort-on-container-exit --exit-code-from tests
docker compose -f docker-compose.ci.yml -p inventory-ci-local down -v

# Production stack on port 8088
cp deploy/.env.prod.example .env.prod   # set CLIENT_ORIGIN=http://localhost:8088, WEB_PORT=8088
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-build --wait
curl http://localhost:8088/health        # {"ok":true}
docker compose -f docker-compose.prod.yml --env-file .env.prod down      # add -v to wipe the DB
```

> If the tests fail with `P3015 Could not find the migration file`, you have an **empty folder** in `apps/server/prisma/migrations/`. Delete it. Git does not track empty folders, so Jenkins never sees it.

---

## Step 1 — Launch the EC2 instance

AWS Console → **EC2 → Launch instance**:

| Setting | Value |
| --- | --- |
| Name | `inventory-jenkins` |
| AMI | **Ubuntu Server 24.04 LTS** (x86_64) |
| Instance type | **t3.medium** (2 vCPU / 4 GB) minimum. `t3.small` runs out of memory during Jenkins + Vite/tsc builds |
| Key pair | Create one or reuse one, and download the `.pem` |
| Storage | **30 GB gp3** (Docker images and Jenkins workspaces use disk quickly) |

**Security group (inbound rules):**

| Type | Port | Source | Why |
| --- | --- | --- | --- |
| SSH | 22 | *My IP* | Admin access |
| Custom TCP | 8080 | *My IP* **plus** GitHub webhook ranges (or `0.0.0.0/0`, see note) | Jenkins UI + webhook |
| HTTP | 80 | `0.0.0.0/0` | The app |

> **Note on port 8080:** GitHub must reach `http://<IP>:8080/github-webhook/`. The simplest option is to open 8080 to `0.0.0.0/0` and rely on Jenkins login. A tighter option is to allow only your IP plus GitHub's `hooks` ranges from <https://api.github.com/meta>. A third option is to skip webhooks and use polling (Step 9, option B), keeping 8080 limited to your IP.

**Elastic IP (recommended):** EC2 → Elastic IPs → Allocate → Associate with the instance. Without one, the public IP changes each time you stop the instance, which breaks the webhook and `CLIENT_ORIGIN`.

Below, `EC2_IP` means this public IP.

---

## Step 2 — Connect and prepare the server

```bash
chmod 400 ~/Downloads/your-key.pem
ssh -i ~/Downloads/your-key.pem ubuntu@EC2_IP

sudo apt-get update && sudo apt-get -y upgrade
sudo timedatectl set-timezone UTC

# 2 GB swap: protects builds from out-of-memory kills
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

---

## Step 3 — Install Docker Engine + compose plugin

```bash
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo systemctl enable --now docker
docker --version && docker compose version
```

---

## Step 4 — Install Jenkins (LTS)

```bash
# Java 21 (required by current Jenkins LTS)
sudo apt-get install -y fontconfig openjdk-21-jre
java -version

# Jenkins apt repo
sudo wget -O /etc/apt/keyrings/jenkins-keyring.asc \
  https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key
echo "deb [signed-by=/etc/apt/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" \
  | sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt-get update
sudo apt-get install -y jenkins
sudo systemctl enable --now jenkins
```

> If `apt-get update` shows a `NO_PUBKEY` error for the Jenkins repo, the signing key has been rotated. Get the current key URL from <https://www.jenkins.io/doc/book/installing/linux/#debianubuntu> and repeat the `wget` line.

---

## Step 5 — Let Jenkins use Docker

The pipeline calls `docker` directly, so the `jenkins` user needs access to the Docker socket:

```bash
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins

# Verify: must print Docker info with no "permission denied"
sudo -u jenkins docker ps
sudo -u jenkins docker compose version
```

> Membership in the `docker` group is effectively root on this machine. That is acceptable for a single-purpose CI/deploy box. Do not do it on a shared server.

---

## Step 6 — First-time Jenkins setup

1. Open `http://EC2_IP:8080`.
2. Get the unlock password:
   ```bash
   sudo cat /var/lib/jenkins/secrets/initialAdminPassword
   ```
3. Choose **Install suggested plugins**. This includes Pipeline, Git, GitHub, Credentials Binding and Timestamper, which is everything the `Jenkinsfile` uses.
4. Create your admin user. Do not keep using `admin` with the initial password.
5. **Jenkins URL:** set it to `http://EC2_IP:8080/`.

Verify the plugins: **Manage Jenkins → Plugins → Installed** should list *Pipeline*, *Git*, *GitHub*, *Credentials Binding* and *Timestamper*. Install any that are missing from **Available plugins**.

---

## Step 7 — Store production secrets in Jenkins

The production `.env` never lives in git. Jenkins keeps it as a secret file and passes it to `docker compose` only during the Deploy stage.

1. On your laptop, copy [`deploy/.env.prod.example`](../deploy/.env.prod.example) to a new file and fill it in:
   ```dotenv
   POSTGRES_USER=inventory
   POSTGRES_PASSWORD=<long random letters+digits>   # e.g. output of: openssl rand -hex 24
   POSTGRES_DB=inventory
   CLIENT_ORIGIN=http://EC2_IP                      # exactly what users type in the browser
   RUN_SEED=true                                    # demo users alice/bob/carol + sample drop
   WEB_PORT=80
   ```
   Use **only letters and digits** in the password, because it is embedded in `DATABASE_URL`.
2. Jenkins → **Manage Jenkins → Credentials → System → Global credentials → Add Credentials**:
   - Kind: **Secret file**
   - File: upload the file from step 1
   - **ID: `inventory-prod-env`** (must match exactly; the `Jenkinsfile` refers to it)
   - Description: `Inventory production env`
3. Delete the local copy, or keep it somewhere safe such as a password manager.

To change a value later, open that credential, choose **Update**, upload the new file, and re-run the job.

---

## Step 8 — Create the pipeline job

1. Jenkins → **New Item** → name `inventory-system` → **Pipeline** → OK.
2. **General**
   - ☑ *GitHub project*, URL: `https://github.com/Hazrat16/real-time-high-trafic-inventory/`
3. **Triggers**
   - ☑ *GitHub hook trigger for GITScm polling* (for the webhook in Step 9)
4. **Pipeline**
   - Definition: **Pipeline script from SCM**
   - SCM: **Git**
   - Repository URL: `https://github.com/Hazrat16/real-time-high-trafic-inventory.git`
   - Credentials:
     - **Public repo:** leave as *none*.
     - **Private repo:** *Add → Jenkins → Username with password*, where Username is your GitHub username and Password is a **fine-grained personal access token** with *Contents: Read-only* on this repo (GitHub → Settings → Developer settings → Personal access tokens).
   - Branch Specifier: `*/main`
   - Script Path: `Jenkinsfile`
   - ☑ *Lightweight checkout*
5. **Save**.

---

## Step 9 — Trigger builds automatically on push

### Option A — GitHub webhook (instant, recommended)

GitHub repo → **Settings → Webhooks → Add webhook**:

| Field | Value |
| --- | --- |
| Payload URL | `http://EC2_IP:8080/github-webhook/` (the trailing slash matters) |
| Content type | `application/json` |
| Secret | leave empty |
| Events | *Just the push event* |

Save. GitHub sends a ping, and **Recent Deliveries** should show a green ✓ (HTTP 200). A red ✗ usually means the security group is blocking 8080 from GitHub (see Step 1).

### Option B — Polling (no inbound access needed)

In the job: **Configure → Triggers → ☑ Poll SCM**, schedule `H/2 * * * *`, which checks GitHub every ~2 minutes. Use this when port 8080 must stay private.

---

## Step 10 — First run

1. Open the job and click **Build Now**. The first build takes about 5–8 minutes (base images, pnpm install). Later builds use the Docker layer cache and are much faster.
2. Watch **Console Output**. A healthy run shows:
   - `Build & Typecheck` completes all three `docker build` targets
   - `Integration Tests` prints `success: 1 … failed: 99`, then the expiry, purchase and feed checks, then `All integration checks passed.`
   - `Deploy` shows `inventory-postgres-1`, `inventory-server-1` and `inventory-web-1` as **Up (healthy)**
   - `Smoke Test` prints `Smoke test passed: http://localhost:80`
3. Open `http://EC2_IP` in a browser, pick **alice**, and reserve an item. Open a second tab as **bob** and confirm the stock count updates live (Socket.io).
4. Test the automation: push a small commit to `main` and check that a build starts on its own within seconds (webhook) or about 2 minutes (polling).

---

## How the pipeline behaves

| Situation | What happens |
| --- | --- |
| Push to `main` | Build → Test → **Deploy** → Smoke test |
| Integration test fails | Pipeline stops red and **nothing is deployed**. The running app is untouched |
| Build on a non-`main` branch | Build + test only (Deploy and Smoke Test are skipped) |
| Two pushes in quick succession | `disableConcurrentBuilds()` queues the second build |
| Server container starts | `prisma migrate deploy` runs first, then the idempotent seed (if `RUN_SEED=true`), then the API |
| Database data | Lives in the Docker volume `inventory_pgdata`. It survives every deploy and reboot |
| Disk usage | After each build, only the newest 3 image tags per image are kept |

**CI on every branch or PR (optional):** create a **Multibranch Pipeline** job instead of the Pipeline job in Step 8, using the same repo and the same `Jenkinsfile`. Every branch and PR then gets build + test, and only `main` deploys. The `Jenkinsfile` already handles both job types.

---

## Day-2 operations

SSH into the instance, then:

```bash
# Status and logs
docker compose -p inventory ps
docker compose -p inventory logs -f server
docker compose -p inventory logs -f web

# Restart only the API
docker compose -p inventory restart server

# DB shell
docker exec -it inventory-postgres-1 psql -U inventory -d inventory
```

### Rollback

The last 3 image tags stay on the box. Tags look like `<build#>-<sha>` and match the Jenkins build names.

```bash
docker images inventory-server          # pick the previous tag, e.g. 41-a1b2c3d
sudo cp /path/to/your/prod.env /tmp/prod.env   # the same values you uploaded to Jenkins
cd /var/lib/jenkins/workspace/inventory-system
IMAGE_TAG=41-a1b2c3d docker compose -f docker-compose.prod.yml --env-file /tmp/prod.env up -d --no-build
rm /tmp/prod.env
```

The cleaner, permanent fix is to `git revert` the bad commit and push, which lets the pipeline redeploy.
Migrations only move forward. If the bad release added a migration, rolling back the image does not undo it.

### Database backups (recommended)

```bash
sudo mkdir -p /var/backups/inventory
sudo crontab -e
# add this line: daily dump at 03:00, keep 7 days
0 3 * * * docker exec inventory-postgres-1 pg_dump -U inventory inventory | gzip > /var/backups/inventory/$(date +\%F).sql.gz && find /var/backups/inventory -mtime +7 -delete
```

For off-box safety, sync `/var/backups/inventory` to S3 (`aws s3 sync`), or enable EBS snapshots through AWS Data Lifecycle Manager.

Restore:
```bash
gunzip -c /var/backups/inventory/2026-09-26.sql.gz | docker exec -i inventory-postgres-1 psql -U inventory -d inventory
```

---

## Troubleshooting

| Symptom | Cause / Fix |
| --- | --- |
| `permission denied while trying to connect to the Docker daemon socket` | Step 5 not done, or Jenkins was not restarted afterwards: `sudo usermod -aG docker jenkins && sudo systemctl restart jenkins` |
| `docker: 'compose' is not a docker command` | Install `docker-compose-plugin` (Step 3) |
| `ERROR: inventory-prod-env` / `Could not find credentials entry` | The credential ID in Step 7 must be exactly `inventory-prod-env` |
| `POSTGRES_PASSWORD is required` (or another variable) | A line is missing from the secret env file. Update the credential |
| Build killed / `exit code 137` / Jenkins becomes unresponsive | Out of memory. Use t3.medium or larger and add swap (Step 2) |
| `P3015 Could not find the migration file` | An empty or incomplete folder under `apps/server/prisma/migrations/` was committed. Every migration folder needs its `migration.sql` |
| Deploy stage: `Bind for 0.0.0.0:80 failed: port is already allocated` | Something else is on port 80 (`sudo ss -ltnp \| grep :80`, often apache2/nginx on the host). Stop it or set `WEB_PORT` to another port |
| Page loads but shows no drops / API 502 | `docker compose -p inventory logs server`. Usually a DB connection error: check the password (letters and digits only) |
| Stock does not update live across tabs | Websocket blocked. Make sure you open the app via nginx (port 80), not port 5000, and that `CLIENT_ORIGIN` matches the browser URL |
| Webhook shows red ✗ in GitHub | Port 8080 not reachable from GitHub (security group), or the URL is missing the trailing `/github-webhook/` |
| Push does not trigger a build even though the webhook is green | In the job, *GitHub hook trigger for GITScm polling* is unchecked, or the job has never been built once manually (Jenkins needs one build to register the repo) |
| Disk full | `docker system df`, then `docker system prune -af` (running containers are not affected), and grow the EBS volume |
| Public IP changed after stop/start | Attach an Elastic IP, then update the webhook URL, the Jenkins URL and `CLIENT_ORIGIN` |

---

## Hardening checklist (after it works)

- [ ] **HTTPS with a domain:** point an A record at the Elastic IP, put Caddy or certbot in front of port 80/443, then update `CLIENT_ORIGIN=https://your-domain` in the Jenkins credential.
- [ ] Restrict port 8080 to your IP plus GitHub hook ranges, or put Jenkins behind the same HTTPS proxy.
- [ ] Jenkins → *Manage Jenkins → Security*: disable sign-up and keep plugins updated.
- [ ] Enable daily DB backups and EBS snapshots (above).
- [ ] Set up a CloudWatch alarm on CPU and disk, or a free uptime monitor on `http://EC2_IP/health`.
- [ ] Later, to scale: push images to **Amazon ECR** and deploy to a separate app instance over SSH, so Jenkins and production no longer share a box.
