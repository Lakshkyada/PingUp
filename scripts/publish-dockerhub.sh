#!/usr/bin/env bash
set -euo pipefail

: "${DOCKERHUB_NAMESPACE:?Environment variable DOCKERHUB_NAMESPACE must be set. Example: export DOCKERHUB_NAMESPACE=yourhubname}"
DOCKERHUB_TAG="${DOCKERHUB_TAG:-latest}"

services=(
  auth-service
  user-service
  post-service
  message-service
  search-service
  feed-service
)

for service in "${services[@]}"; do
  repo="${DOCKERHUB_NAMESPACE}/pingup-${service}:${DOCKERHUB_TAG}"
  context="./microservices/${service}"

  echo "\n=== Building ${service} => ${repo} ==="
  docker build -t "${repo}" "${context}"

  echo "=== Pushing ${repo} ==="
  docker push "${repo}"
done

echo "\nAll microservice images pushed to Docker Hub under ${DOCKERHUB_NAMESPACE} with tag ${DOCKERHUB_TAG}."