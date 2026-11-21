targetScope = 'resourceGroup'

@description('Name of the registry created by foundation.bicep.')
param registryName string

@minLength(64)
@maxLength(64)
@description('SHA-256 hex digest of the PostgreSQL-capable API image in the draconis-api repository.')
param apiImageSha256 string

@minLength(64)
@maxLength(64)
@description('SHA-256 hex digest of the Planner image in the draconis-planner repository.')
param plannerImageSha256 string

@description('PostgreSQL private host output from foundation.bicep.')
param postgresHost string

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: 'cae-draconis-dev'
}

resource registry 'Microsoft.ContainerRegistry/registries@2025-11-01' existing = {
  name: registryName
}

resource apiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: 'id-draconis-api-dev'
}

resource plannerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: 'id-draconis-planner-dev'
}

var tags = {
  project: 'draconis'
  env: 'dev'
  region: 'northeurope'
}

module api './modules/container-app.bicep' = {
  name: 'release-draconis-api'
  params: {
    name: 'draconis-api'
    tags: tags
    environmentId: environment.id
    registryHost: registry.properties.loginServer
    imageSha256: apiImageSha256
    identityId: apiIdentity.id
    appPort: 3001
    reachableFromVirtualNetwork: false
    environmentVariables: [
      {
        name: 'CORS_ORIGIN'
        value: 'https://draconis-planner.${environment.properties.defaultDomain}'
      }
      {
        name: 'PGHOST'
        value: postgresHost
      }
      {
        name: 'PGDATABASE'
        value: 'draconis'
      }
      {
        name: 'PGUSER'
        value: apiIdentity.name
      }
      {
        name: 'PGSSLMODE'
        value: 'verify-full'
      }
      {
        name: 'AZURE_CLIENT_ID'
        value: apiIdentity.properties.clientId
      }
    ]
  }
}

module planner './modules/container-app.bicep' = {
  name: 'release-draconis-planner'
  params: {
    name: 'draconis-planner'
    tags: tags
    environmentId: environment.id
    registryHost: registry.properties.loginServer
    imageSha256: plannerImageSha256
    identityId: plannerIdentity.id
    appPort: 8080
    // This environment has an internal load balancer. Ingress reaches only the VNet.
    reachableFromVirtualNetwork: true
    environmentVariables: [
      {
        name: 'API_UPSTREAM'
        value: 'https://${api.outputs.fqdn}'
      }
    ]
  }
}

output plannerOrigin string = 'https://${planner.outputs.fqdn}'
