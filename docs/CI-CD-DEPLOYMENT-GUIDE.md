# CI/CD Deployment Guide: GitHub Actions → AWS EC2

**Repository:** kr-updates-backend  
**Target:** AWS EC2 (Ubuntu), domain: api.krupdates.in  
**Last updated:** February 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Steps We Followed](#3-steps-we-followed)
4. [Errors Encountered and Solutions](#4-errors-encountered-and-solutions)
5. [Code Reference with Line-by-Line Explanation](#5-code-reference-with-line-by-line-explanation)
6. [Verification and Testing](#6-verification-and-testing)

---

## 1. Overview

We set up a **Continuous Integration and Continuous Deployment (CI/CD)** pipeline so that every push to the `main` branch:

1. **Runs tests** (lint + unit tests) on GitHub-hosted runners.
2. **Deploys** the application to an existing **AWS EC2 Ubuntu** instance via SSH: pull latest code, install dependencies, and restart the app with PM2.

The workflow uses **GitHub Actions** and does not require AWS CodeDeploy or Elastic Beanstalk—only an EC2 instance, SSH access, and GitHub repository secrets.

---

## 2. Prerequisites

| Requirement | Description |
|-------------|-------------|
| **EC2 instance** | Ubuntu (e.g. 24.04 LTS), with Node.js, Git, and PM2 installed. |
| **GitHub repo** | Backend code in a GitHub repository (e.g. `krupdates25-sudo/kr-updates-backend`). |
| **SSH key pair** | A key pair for deploy: private key stored in GitHub Secrets, public key in EC2 `~/.ssh/authorized_keys`. |
| **App directory on EC2** | e.g. `/home/ubuntu/kr-updates-backend` (clone of the repo). |
| **Secrets in GitHub** | `EC2_HOST`, `EC2_USER`, `EC2_SSH_PRIVATE_KEY`, and (if key is passphrase-protected) `EC2_SSH_PASSPHRASE`. |

---

## 3. Steps We Followed

### 3.1 One-time setup on EC2

1. **Install Node.js, Git, and PM2** on the Ubuntu instance.
2. **Clone the repository** into `/home/ubuntu/kr-updates-backend` (or chosen path).
3. **Create `.env`** on the server with production config (e.g. `MONGODB_URI`, `PORT`, `JWT_SECRET`). Do not commit `.env` to the repo.
4. **Add the deploy public key** to `~/.ssh/authorized_keys` for the user used by GitHub Actions (e.g. `ubuntu`).

### 3.2 One-time setup in GitHub

1. **Create repository secrets** (Settings → Secrets and variables → Actions):
   - `EC2_HOST`: EC2 public IP or hostname (e.g. `54.206.110.218`).
   - `EC2_USER`: SSH username (e.g. `ubuntu`).
   - `EC2_SSH_PRIVATE_KEY`: Full contents of the **private** key (OpenSSH or PEM format), including `-----BEGIN ... KEY-----` and `-----END ... KEY-----`.
   - `EC2_SSH_PASSPHRASE`: Passphrase for the private key (if applicable).

2. **Add the workflow file** at `.github/workflows/deploy-backend-ec2.yml` (see [Section 5](#5-code-reference-with-line-by-line-explanation)).

3. **Add `ecosystem.config.js`** in the repo root for PM2 (see [Section 5](#5-code-reference-with-line-by-line-explanation)).

### 3.3 Per-deploy flow (automatic on push to `main`)

1. Developer pushes to `main`.
2. **Test job** runs: checkout → `npm ci` → `npm run lint` → `npm run test:ci`.
3. If the test job succeeds, **Deploy job** runs: SSH into EC2, `git fetch` / `git reset --hard origin/main`, `npm ci --omit=dev`, then `pm2 delete` (if exists) and `pm2 start ecosystem.config.js`, `pm2 save`.
4. The app on EC2 serves the new code.

---

## 4. Errors Encountered and Solutions

### 4.1 Dependencies lock file not found

**Error:**  
`Dependencies lock file is not found in ... Supported file patterns: package-lock.json, npm-shrinkwrap.json, yarn.lock`

**Cause:** `package-lock.json` was listed in `.gitignore`, so it was never committed. The `setup-node` action with `cache: "npm"` expects a lock file.

**Solution:**  
- Removed `package-lock.json` from `.gitignore`.  
- Added and committed `package-lock.json` to the repository.

---

### 4.2 ESLint configuration not found

**Error:**  
`ESLint couldn't find a configuration file. To set up a configuration file for this project, please run: npm init @eslint/config`

**Cause:** The project had a `lint` script and ESLint in `package.json` but no ESLint config file in the repo.

**Solution:**  
- Created `.eslintrc.cjs` with `eslint:recommended`, Node/ES2021 env, and `ignorePatterns` for `node_modules/`, `coverage/`, `.github/`.  
- Did not use `plugin:prettier/recommended` in CI to avoid failing on formatting; Prettier can be run separately.

---

### 4.3 Duplicate key errors in ESLint

**Error:**  
`Duplicate key 'type'` and `Duplicate key 'isVisible'` in `searchController.js`.

**Cause:** Object literals had the same property defined twice; the second overwrites the first and ESLint reports it.

**Solution:**  
- In the announcement mapping: kept a single `type: "announcement"` and removed the duplicate `type: announcement.type`.  
- In the Post find query: removed the duplicate `isVisible: { $ne: false }` line.

---

### 4.4 Test step taking ~5 minutes

**Error:**  
The “Run npm test” step took about 5 minutes and reported “No tests found, exiting with code 0”.

**Cause:** The `test` script in `package.json` used `jest --watchAll --verbose`. In watch mode, Jest stays running and waits for file changes. In CI there is no terminal or file changes, so it sat until it eventually exited.

**Solution:**  
- Added a separate script: `test:ci`: `jest --ci --verbose --passWithNoTests`.  
- In the workflow, use `npm run test:ci` instead of `npm test`.  
- `--ci` runs once and exits; `--passWithNoTests` makes Jest exit with code 0 when no test files exist.

---

### 4.5 No tests found, exiting with code 1

**Error:**  
`No tests found, exiting with code 1` and Jest suggested `--passWithNoTests`.

**Cause:** With `--ci`, Jest exits with code 1 when no tests are found, which failed the pipeline.

**Solution:**  
- Updated `test:ci` to include `--passWithNoTests` so the pipeline passes when the project has no tests yet.

---

### 4.6 SSH: private key is passphrase protected

**Error:**  
`ssh.ParsePrivateKey: ssh: this private key is passphrase protected` and `ssh: handshake failed: ssh: unable to authenticate`

**Cause:** The private key stored in `EC2_SSH_PRIVATE_KEY` was encrypted with a passphrase, but the workflow did not provide it.

**Solution:**  
- Added repository secret `EC2_SSH_PASSPHRASE` with the correct passphrase.  
- In the workflow, set `passphrase: ${{ secrets.EC2_SSH_PASSPHRASE }}` in the `appleboy/ssh-action` step.

---

### 4.7 SSH: unable to authenticate (after adding passphrase)

**Error:**  
`ssh: handshake failed: ssh: unable to authenticate, attempted methods [none publickey]`

**Cause:** Either the passphrase was wrong, or the **public** key on the EC2 instance did not match the **private** key in GitHub (e.g. a different key was in `authorized_keys`).

**Solution:**  
- Ensured the **same key pair** is used: the public key corresponding to `EC2_SSH_PRIVATE_KEY` was appended to `~/.ssh/authorized_keys` on the EC2 instance.  
- Verified passphrase in `EC2_SSH_PASSPHRASE` (exact value, no extra spaces).

---

### 4.8 404 on /api/v1/ci-cd after “successful” deploy

**Error:**  
API returned 404 with message “Can't find /api/v1/ci-cd on this server!”. Stack trace pointed to the catch-all route in `app.js`.

**Cause:**  
- The server had **two** PM2 apps: `kr-backend` (old) and `kr-updates-backend` (new).  
- Traffic (e.g. from nginx or load balancer) was still going to **kr-backend**, which was running older code without the new route.  
- So the deploy updated the repo and started `kr-updates-backend`, but the public URL was still served by the old app.

**Solution:**  
- Stopped and deleted the old app: `pm2 stop kr-backend`, `pm2 delete kr-backend`, `pm2 save`.  
- Ensured only `kr-updates-backend` runs and listens on the port used by the reverse proxy (e.g. 5000).

---

### 4.9 PM2: Process or Namespace kr-updates-backend not found / File ecosystem.config.js not found

**Error:**  
`[ERROR] Process or Namespace kr-updates-backend not found` and `[ERROR] File ecosystem.config.js not found`.

**Cause:**  
- The deploy script used `pm2 restart kr-updates-backend || pm2 start ecosystem.config.js`.  
- `ecosystem.config.js` did not exist in the repository, so after `git pull` the file was not on the server.  
- So the first deploy could not start the app via the config file.

**Solution:**  
- Added `ecosystem.config.js` to the repository (see [Section 5.2](#52-ecosystemconfigjs)) so it is deployed with the rest of the code.  
- After pushing, the deploy could run `pm2 start ecosystem.config.js` successfully.

---

### 4.10 PM2 reload and old code still served

**Error:**  
After deploy, the API still returned 404 for the new route; server was running old code.

**Cause:**  
- Using `pm2 restart kr-updates-backend` did not guarantee the process was the one started from the current repo directory, or an old process was still bound to the port.  
- Another app (`kr-backend`) was still receiving traffic.

**Solution:**  
- Deploy script was changed to: `pm2 delete kr-updates-backend 2>/dev/null || true`, then `pm2 start ecosystem.config.js`, then `pm2 save`.  
- This ensures a **fresh** PM2 process from the current directory and code.  
- On the server, the old app (`kr-backend`) was stopped and deleted so only `kr-updates-backend` serves the API.

---

### 4.11 Error: bind EADDRINUSE null:5000

**Error:**  
`Error: bind EADDRINUSE null:5000` in PM2 logs; `kr-updates-backend` kept restarting and went to “errored” state.

**Cause:**  
- Port 5000 was in use (e.g. by `kr-backend` before it was stopped).  
- In **cluster** mode, PM2 can start multiple workers; if each worker tries to bind to the same port, you get EADDRINUSE when the second worker starts.

**Solution:**  
- Stopped and deleted `kr-backend` so port 5000 was free.  
- In `ecosystem.config.js`, set `exec_mode: "fork"` and `instances: 1` so only **one** Node process runs and binds to the port once, avoiding cluster port conflicts.

---

## 5. Code Reference with Line-by-Line Explanation

### 5.1 GitHub Actions workflow: `.github/workflows/deploy-backend-ec2.yml`

```yaml
# =============================================================================
# Deploy Backend to EC2 - GitHub Actions Workflow
# =============================================================================
# This workflow runs when you push to 'main'. It:
#   1. Runs tests (lint + unit tests)
#   2. If tests pass, SSHs into your EC2 and deploys the latest code
# =============================================================================

name: Deploy Backend to EC2
```
- **name:** Display name of the workflow in the GitHub Actions UI.

```yaml
on:
  push:
    branches: ["main"]
  workflow_dispatch:
```
- **on.push.branches: ["main"]:** Runs automatically on every push to the `main` branch.
- **workflow_dispatch:** Allows manually triggering the workflow from the Actions tab (“Run workflow”).

```yaml
env:
  NODE_VERSION: "18"
```
- **env:** Global environment variables for the workflow. Used by the Test job for the Node version.

```yaml
jobs:
  test:
    name: Test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
```
- **jobs.test:** First job: runs on a GitHub-hosted Ubuntu runner.
- **actions/checkout@v4:** Checks out the repository so subsequent steps have the code.

```yaml
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"
```
- **setup-node:** Installs Node.js (version 18). `cache: "npm"` caches npm dependencies using the lock file (package-lock.json) for faster runs.

```yaml
      - run: npm ci
      - run: npm run lint
      - run: npm run test:ci
```
- **npm ci:** Installs dependencies from package-lock.json (required for a reliable CI install).
- **npm run lint:** Runs ESLint; fails the job if there are lint errors.
- **npm run test:ci:** Runs Jest once without watch mode; passes even when no tests exist (`--passWithNoTests`).

```yaml
  deploy:
    name: Deploy to EC2
    needs: test
    runs-on: ubuntu-latest

    steps:
      - name: Deploy to EC2 via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_PRIVATE_KEY }}
          passphrase: ${{ secrets.EC2_SSH_PASSPHRASE }}
```
- **deploy.needs: test:** Deploy runs only if the Test job succeeds.
- **appleboy/ssh-action:** Connects to the EC2 instance via SSH using the given host, user, private key, and passphrase (from repository secrets).

```yaml
          script: |
            set -e
            cd /home/ubuntu/kr-updates-backend
            git fetch origin main
            git reset --hard origin/main
            git log -1 --oneline
            npm ci --omit=dev
            pm2 delete kr-updates-backend 2>/dev/null || true
            pm2 start ecosystem.config.js
            pm2 save
```
- **script:** Commands run **on the EC2 server** over SSH.
- **set -e:** Exit the script on first command failure.
- **cd /home/ubuntu/kr-updates-backend:** Switch to the app directory (must match where the repo is cloned on the server).
- **git fetch origin main** and **git reset --hard origin/main:** Update the working tree to the latest `main` without leaving the branch.
- **git log -1 --oneline:** Logs the current commit in the Actions log for traceability.
- **npm ci --omit=dev:** Install production dependencies only.
- **pm2 delete kr-updates-backend 2>/dev/null || true:** Remove the existing PM2 app if it exists; ignore errors so the script continues.
- **pm2 start ecosystem.config.js:** Start the app using the config file (fresh process with current code).
- **pm2 save:** Persist the process list so it survives server reboot.

---

### 5.2 ecosystem.config.js

```javascript
/**
 * PM2 ecosystem file for production.
 * Used by CI/CD to start/restart the backend on EC2.
 */
module.exports = {
  apps: [
    {
      name: "kr-updates-backend",
```
- **name:** PM2 app name; used by `pm2 restart/delete kr-updates-backend` and in logs.

```javascript
      cwd: __dirname,
      script: "src/app.js",
```
- **cwd:** Working directory for the process (repo root where ecosystem.config.js lives).
- **script:** Entry point of the Node app (relative to `cwd`).

```javascript
      exec_mode: "fork",
      instances: 1,
```
- **exec_mode: "fork":** Run as a single Node process (no cluster). Avoids multiple workers trying to bind the same port (EADDRINUSE).
- **instances: 1:** One process only.

```javascript
      autorestart: true,
      watch: false,
```
- **autorestart:** Restart the process if it crashes.
- **watch: false:** Do not restart on file changes (production).

```javascript
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
```
- **env:** Environment variables for the process; ensures the app runs in production mode.

---

### 5.3 CI/CD test endpoints in src/app.js

These routes are used to verify that the correct code is running after a deploy (including after fixing the “old app serving traffic” issue).

```javascript
// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
    version: process.env.npm_package_version || "1.0.0",
  });
});
```
- **/health:** Simple health check; returns status, timestamp, uptime, environment, and version. Useful for load balancers or monitoring.

```javascript
// CI/CD test endpoints - verify deploy to EC2 (root and API path)
app.get("/ci-cd", (req, res) => {
  res.status(200).json({
    message: "Hi this is CI CD response",
    deployedAt: new Date().toISOString(),
    environment: config.NODE_ENV,
  });
});
app.get("/api/v1/ci-cd", (req, res) => {
  // ... same payload
});
```
- **/ci-cd** and **/api/v1/ci-cd:** Return a fixed message and `deployedAt` so you can confirm the server is running the app that defines this route (and that the route exists in the deployed code).

```javascript
// CI/CD pipeline test - deployed via GitHub Actions (emoji = pipeline ran)
app.get("/ci-cd-pipeline", (req, res) => {
  res.status(200).json({
    message: "🚀 CI/CD pipeline deployed this!",
    deployedAt: new Date().toISOString(),
    environment: config.NODE_ENV,
    source: "GitHub Actions → EC2",
  });
});
app.get("/api/v1/ci-cd-pipeline", (req, res) => {
  // ... same payload
});
```
- **/ci-cd-pipeline** and **/api/v1/ci-cd-pipeline:** Same idea as above but with a distinct message and `source` field. Used to confirm that a **pipeline** deploy (push → Actions → EC2) has completed and the new code is live.

All of these routes are registered **before** the catch-all `app.all("*", ...)` so that requests to these paths are handled by the route handlers and do not hit the 404 handler.

---

## 6. Verification and Testing

### 6.1 After a push to main

1. Open **GitHub → Actions** and select the latest “Deploy Backend to EC2” run.
2. Confirm both jobs complete successfully:
   - **Test** (checkout, npm ci, lint, test:ci).
   - **Deploy to EC2** (SSH and script).
3. In the Deploy step log, check **git log -1 --oneline** to see which commit was deployed.

### 6.2 API checks

Once the deploy is green and only `kr-updates-backend` is serving traffic:

| Endpoint | Purpose |
|----------|---------|
| `https://api.krupdates.in/health` | Health check. |
| `https://api.krupdates.in/ci-cd` or `https://api.krupdates.in/api/v1/ci-cd` | Confirm app with CI/CD routes is live. |
| `https://api.krupdates.in/ci-cd-pipeline` or `https://api.krupdates.in/api/v1/ci-cd-pipeline` | Confirm pipeline-deployed code (distinct message with emoji). |

Expected response for `/ci-cd-pipeline` (example):

```json
{
  "message": "🚀 CI/CD pipeline deployed this!",
  "deployedAt": "2026-02-26T11:19:08.543Z",
  "environment": "production",
  "source": "GitHub Actions → EC2"
}
```

### 6.3 On the server (optional)

```bash
cd /home/ubuntu/kr-updates-backend
pm2 list
curl -s http://localhost:5000/ci-cd-pipeline
```
- Replace `5000` with the port your app uses (e.g. from `.env` or config).

---

## Summary

We implemented a CI/CD pipeline that runs tests on every push to `main` and, on success, deploys the backend to an existing EC2 instance via SSH. Key pieces are: GitHub Actions workflow (test + deploy jobs), PM2 ecosystem file (fork mode, single instance), repository secrets for SSH, and ensuring only one app (kr-updates-backend) serves the public URL. The documented errors and fixes cover lock file, ESLint, Jest, SSH auth, PM2 config, port conflicts, and traffic going to the wrong process.
