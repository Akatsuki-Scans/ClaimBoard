# Deploying ClaimBoard to Railway or Render

ClaimBoard is an enterprise-grade, monorepo-architected manga scanlation operations platform built with Fastify, React (Vite), MongoDB, and Redis.

Production-ready Dockerfiles and deployment blueprints are included:
- `Dockerfile` & `Dockerfile.api` — Production Fastify API backend
- `Dockerfile.bot` — Production Sapphire Discord bot worker
- `Dockerfile.web` — High-performance Nginx static web server with dynamic `$PORT` routing
- `docker-compose.yml` — Full-stack local orchestration (Mongo, Redis, API, Discord Bot, Web)
- `render.yaml` — 1-Click Render Infrastructure-as-Code Blueprint
- `railway.json` — Railway deployment specification

---

## 1. Quick Deploy to Railway

Railway auto-detects Dockerfiles and provides hosted MongoDB and Redis databases out of the box.

### Step 1: Push Repository to GitHub
Push your ClaimBoard repository to GitHub (or GitLab).

### Step 2: Create Railway Project
1. Open [Railway.app](https://railway.app) and click **New Project** -> **Deploy from GitHub repo**.
2. Select your `ClaimBoard` repository.

### Step 3: Add Databases
Inside your Railway project:
1. Click **+ New** -> **Database** -> **Add MongoDB**.
2. Click **+ New** -> **Database** -> **Add Redis**.

### Step 4: Configure Backend Service (`claimboard-api`) — API + Discord Bot Unified
1. Click on the imported repository service (or rename it to `claimboard-api`).
2. Go to **Settings** -> **Build**:
   - **Builder**: `Dockerfile`
   - **Dockerfile Path**: `Dockerfile` (or `Dockerfile.api`)
3. Go to **Variables** and add:
   ```env
   NODE_ENV=production
   MONGODB_URI=${{MongoDB.MONGO_URL}}
   MONGODB_DB_NAME=claimboard
   REDIS_URL=${{Redis.REDIS_URL}}
   JWT_SECRET=generate-a-secure-random-secret-key-min-32-chars
   FRONTEND_URL=https://your-frontend.up.railway.app
   DISCORD_BOT_TOKEN=your_discord_bot_token_here
   DISCORD_CLIENT_ID=your_discord_client_id_here
   DISCORD_CLIENT_SECRET=your_discord_client_secret_here
   BOT_ADMIN_DISCORD_ID=your_discord_user_id_here
   ```
   > [!NOTE]
   > The ClaimBoard API backend automatically launches and manages the Sapphire Discord Bot worker inside the same deployment when `DISCORD_BOT_TOKEN` is present! There is **no need to configure or pay for a separate bot container**.

4. Go to **Settings** -> **Networking** and click **Generate Domain** (e.g. `https://claimboard-api-production.up.railway.app`).

### Step 5: Configure Frontend Service (`claimboard-web`)
1. Click **+ New** -> **GitHub Repo** -> select the same `ClaimBoard` repository.
2. Rename the service to `claimboard-web`.
3. Go to **Settings** -> **Build**:
   - **Builder**: `Dockerfile`
   - **Dockerfile Path**: `Dockerfile.web`  *(Important: change from default `Dockerfile` to `Dockerfile.web`)*
4. Go to **Variables** and add:
   ```env
   VITE_API_URL=https://claimboard-api-production.up.railway.app
   ```
5. Go to **Settings** -> **Networking** and click **Generate Domain**.
6. Update the `FRONTEND_URL` on the backend service to match your frontend domain.

### Step 6: Standalone Discord Bot Worker (Optional)
If you prefer running the bot in a completely isolated worker service instead of unified with the API, set `DISABLE_BOT=true` on the API service, create a new service from the repo, set **Dockerfile Path** to `Dockerfile.bot`, and pass your MongoDB and Discord variables there.

---

## 2. Quick Deploy to Render

### Option A: 1-Click Render Blueprint (Recommended)
1. In Render Dashboard, click **New +** -> **Blueprint**.
2. Connect your GitHub repository.
3. Render reads `render.yaml` and provisions:
   - `claimboard-api` (Fastify Web Service)
   - `claimboard-web` (Nginx Web Service)
4. Set the `MONGODB_URI` and `REDIS_URL` in the Render dashboard.

### Option B: Manual Setup on Render
#### Backend Service
- **Type**: Web Service
- **Runtime**: Docker
- **Dockerfile Path**: `Dockerfile.api`
- **Context**: `.`
- **Environment Variables**:
  - `NODE_ENV`: `production`
  - `PORT`: `10000` (Render default)
  - `MONGODB_URI`: Your MongoDB Atlas or Render MongoDB URL
  - `REDIS_URL`: Your Upstash or Render Redis URL
  - `JWT_SECRET`: Random 32+ character string
  - `FRONTEND_URL`: URL of your frontend service

#### Frontend Service
- **Type**: Web Service
- **Runtime**: Docker
- **Dockerfile Path**: `Dockerfile.web`
- **Context**: `.`
- **Environment Variables**:
  - `PORT`: `10000` (Render will map to Nginx automatically via `nginx.conf.template`)
  - `VITE_API_URL`: URL of your backend service

---

## 3. Local Full-Stack Docker Compose

To test the entire production topology locally:

```bash
# Build and start all 4 services (Mongo, Redis, Fastify API, Nginx Web)
docker compose up --build

# Once initialized:
# Frontend Web:  http://localhost:3000
# Backend API:   http://localhost:4000
# Health check:  http://localhost:4000/health
```

To stop containers:
```bash
docker compose down
```

---

## 4. Production Environment Variables Reference

| Variable | Description | Example |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | Listening port (injected by host) | `4000` or `10000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://...` |
| `REDIS_URL` | Redis connection URL | `redis://...` |
| `JWT_SECRET` | Secret token signing key | `9f3c7...` |
| `FRONTEND_URL` | CORS authorized client origin | `https://claimboard.app` |
| `VITE_API_URL` | Browser API target address | `https://api.claimboard.app` |
| `DISCORD_BOT_TOKEN` | Discord Bot Token | *(Optional)* |
| `DISCORD_CLIENT_ID` | Discord OAuth Client ID | *(Optional)* |
| `DISCORD_CLIENT_SECRET` | Discord OAuth Secret | *(Optional)* |

