param(
    [string]$DockerHubNamespace = $env:DOCKERHUB_NAMESPACE,
    [string]$DockerHubTag = $env:DOCKERHUB_TAG
)

if (-not $DockerHubNamespace) {
    Write-Error 'Environment variable DOCKERHUB_NAMESPACE must be set. Example: $env:DOCKERHUB_NAMESPACE = "yourhubname"'
    exit 1
}

if (-not $DockerHubTag) {
    $DockerHubTag = 'latest'
}

$services = @(
    'auth-service',
    'user-service',
    'post-service',
    'message-service',
    'search-service',
    'feed-service'
)

foreach ($service in $services) {
    $repo = "$DockerHubNamespace/pingup-$service:$DockerHubTag"
    $context = "./microservices/$service"

    Write-Host "`n=== Building $service => $repo ==="
    docker build -t $repo $context

    Write-Host "=== Pushing $repo ==="
    docker push $repo
}

Write-Host "`nAll microservice images pushed to Docker Hub under $DockerHubNamespace with tag $DockerHubTag."