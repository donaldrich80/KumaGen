# Publishing Docker Images

KumaGen uses a GitHub Actions workflow to automatically build and publish multi-arch Docker images (`linux/amd64` + `linux/arm64`) to two registries whenever you push to `master` or create a version tag.

| Registry | Image |
|----------|-------|
| GitHub Container Registry | `ghcr.io/donaldrich80/kumagen` |
| Docker Hub | `donaldrich/kumagen` |

---

## Tags produced

| Trigger | Tags |
|---------|------|
| Push to `master` | `edge`, `sha-<short-sha>` |
| Tag `v1.2.3` | `1.2.3`, `1.2`, `1`, `sha-<short-sha>` |
| Pull request | Image is built but **not pushed** (verification only) |

---

## One-time setup

### 1. GitHub Container Registry (GHCR)

GHCR is authenticated automatically using the built-in `GITHUB_TOKEN`. No additional setup is needed — the workflow already has `packages: write` permission.

After the first push, the package will be listed at:
`https://github.com/donaldrich?tab=packages`

To make it public (recommended for open-source):
1. Go to the package page on GitHub
2. Click **Package settings**
3. Scroll to **Danger Zone** → **Change visibility** → Public

---

### 2. Docker Hub

#### 2a. Create a Docker Hub access token

1. Log in to [hub.docker.com](https://hub.docker.com)
2. Go to **Account Settings** → **Security** → **New Access Token**
3. Name it `kumagen-github-actions`
4. Set permissions to **Read & Write**
5. Copy the token — you won't see it again

#### 2b. Create the Docker Hub repository

1. On Docker Hub, click **Create Repository**
2. Name it `kumagen`
3. Set visibility to **Public**

#### 2c. Add secrets and variables to the GitHub repo

Go to **github.com/donaldrich/KumaGen** → **Settings** → **Secrets and variables** → **Actions**

Add one **secret**:

| Name | Value |
|------|-------|
| `DOCKERHUB_TOKEN` | The access token from step 2a |

Add one **variable** (not a secret — it's not sensitive):

| Name | Value |
|------|-------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username (e.g. `donaldrich`) |

> **Variables vs Secrets:** Variables are for non-sensitive config (`vars.DOCKERHUB_USERNAME`). Secrets are encrypted and masked in logs (`secrets.DOCKERHUB_TOKEN`).

---

### 3. Publish a release

Push a tag to trigger a versioned image:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This will produce `1.0.0`, `1.0`, `1`, and `sha-<sha>` tags on both registries.

---

## Verifying a build

1. Go to **github.com/donaldrich/KumaGen** → **Actions**
2. Click the most recent **Build and Publish Docker Image** run
3. Expand the **Build and push** step to see which tags were pushed

You can also pull and verify locally:

```bash
docker pull ghcr.io/donaldrich80/kumagen:edge
docker pull donaldrich/kumagen:edge
```

---

## Caching

The workflow uses GitHub Actions cache (`type=gha`) for Docker layer caching. This significantly speeds up subsequent builds by reusing unchanged layers. Cache is stored per branch and is evicted after 7 days of inactivity.

---

## Multi-arch builds

Images are built for both `linux/amd64` (x86 servers) and `linux/arm64` (Raspberry Pi, Apple Silicon hosts). Docker will automatically pull the correct variant for the host architecture.
