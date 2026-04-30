# PingUp Deployment Guide

## Recommended Path

Deploy PingUp with the root Docker Compose stack. It builds the React client into the Nginx web container and starts the six Node services plus Redis and RabbitMQ on the same Docker network.

## Prerequisites

- Docker and Docker Compose installed on the target machine.
- A MongoDB instance reachable from the host running the containers.
- Elasticsearch available through the compose stack or an external endpoint.
- Valid ImageKit, SMTP, JWT, Redis, and RabbitMQ settings in each microservice `.env` file.
- A public origin for the deployed app, such as `https://your-domain.com`.

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