# PingUp Deployment Guide

## Recommended Path

Deploy PingUp with the root Docker Compose stack. It builds the React client into the Nginx web container and starts the six Node services plus Redis and RabbitMQ on the same Docker network.

## Prerequisites

- Docker and Docker Compose installed on the target machine.
- A MongoDB instance reachable from the host running the containers.
- Elasticsearch available through the compose stack or an external endpoint.
- Valid ImageKit, SMTP, JWT, Redis, and RabbitMQ settings in each microservice `.env` file.
- A public origin for the deployed app, such as `https://your-domain.com`.

## Publish microservice images to Docker Hub

1. Create `scripts/publish-dockerhub.sh` or `scripts/publish-dockerhub.ps1` (already included).
2. Set your Docker Hub namespace and optional tag:

```bash
export DOCKERHUB_NAMESPACE=yourhubname
export DOCKERHUB_TAG=latest
```

3. Log in to Docker Hub:

```bash
docker login
```

4. Build and push every microservice image:

```bash
./scripts/publish-dockerhub.sh
```

Or on Windows PowerShell:

```powershell
$env:DOCKERHUB_NAMESPACE = 'yourhubname'
$env:DOCKERHUB_TAG = 'latest'
.\scripts\publish-dockerhub.ps1
```

5. The pushed images will be tagged as:

- `yourhubname/pingup-auth-service:latest`
- `yourhubname/pingup-user-service:latest`
- `yourhubname/pingup-post-service:latest`
- `yourhubname/pingup-message-service:latest`
- `yourhubname/pingup-search-service:latest`
- `yourhubname/pingup-feed-service:latest`

## Deploy using Docker Hub images

If you want Compose to use those Hub images by name, run with the override file:

```bash
docker compose -f docker-compose.yml -f docker-compose.hub.yml up -d
```

## Deploy Frontend to Vercel

1. In Vercel, create a new project and point the root directory to `client`.
2. Use the existing `client/vercel.json` to rewrite routes to `index.html`.
3. Set Vercel environment variables from `client/.env` if needed for the frontend build.
4. Deploy with:

```bash
cd client
vercel --prod
```

## Deploy Nginx to Render

This repo now includes `render.yaml` for a Render Docker web service.
It builds the root `Dockerfile`, serves the built React app, and routes API requests through Nginx.

1. Create a new Render service from the repo, or connect the repo to Render.
2. Render will detect `render.yaml` and create the `pingup-nginx` service.
3. Set `PUBLIC_ORIGIN` to your browser-facing URL in the Render environment variables.

If you prefer to push the image directly to Render's Docker registry, use:

```powershell
$renderRegistry = 'registry.render.com'
$serviceName = 'pingup-nginx'
$tag = 'latest'

docker build -t "$renderRegistry/$serviceName:$tag" .

docker login $renderRegistry

docker push "$renderRegistry/$serviceName:$tag"
```

## Steps

1. Update the service `.env` files under `microservices/*-service/` with production values.
2. Set `PUBLIC_ORIGIN` to the browser-facing URL of the deployment, for example:

```bash
PUBLIC_ORIGIN=https://your-domain.com
```

3. From the repository root, validate the stack:

```bash
docker compose config
```

4. Build and start the application:

```bash
docker compose up --build -d
```

5. Check the containers and health endpoints:

```bash
docker compose ps
```

6. Open the public site through Nginx on port 80 and verify login, feed, post creation, stories, messaging, and search.

## Notes

- The web container serves the React build and proxies API requests to the microservices by service name.
- `PUBLIC_ORIGIN` is used by the backend services for CORS and frontend redirects. Keep it aligned with the real browser URL.
- Search service expects Elasticsearch at `http://elasticsearch:9200` inside Docker Compose.
- If you deploy behind another reverse proxy or on a different domain, update `PUBLIC_ORIGIN` accordingly.