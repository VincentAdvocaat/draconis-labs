targetScope = 'resourceGroup'

@allowed(['northeurope'])
param location string = 'northeurope'

@description('Existing Microsoft Entra group for PostgreSQL administration.')
param postgresAdminObjectId string
param postgresAdminName string

var suffix = uniqueString(resourceGroup().id)
var tags = {
  project: 'draconis'
  env: 'dev'
  region: location
}

resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-draconis-dev'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: ['10.71.0.0/16']
    }
  }
}

resource appsSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: network
  name: 'container-apps'
  properties: {
    addressPrefix: '10.71.0.0/24'
    delegations: [
      {
        name: 'container-apps'
        properties: {
          serviceName: 'Microsoft.App/environments'
        }
      }
    ]
  }
}

resource postgresSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: network
  name: 'postgres'
  properties: {
    addressPrefix: '10.71.1.0/28'
    delegations: [
      {
        name: 'postgres'
        properties: {
          serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
        }
      }
    ]
  }
  // Azure serializes subnet changes on the same VNet.
  dependsOn: [appsSubnet]
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-draconis-dev'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      dailyQuotaGb: 1
    }
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-draconis-dev'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-draconis-dev'
  location: location
  tags: tags
  properties: {
    vnetConfiguration: {
      infrastructureSubnetId: appsSubnet.id
      internal: true
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    daprAIConnectionString: insights.properties.ConnectionString
  }
  dependsOn: [postgresSubnet]
}

module appsDns './modules/private-dns.bicep' = {
  name: 'container-apps-dns'
  params: {
    zoneName: environment.properties.defaultDomain
    networkId: network.id
    address: environment.properties.staticIp
    tags: tags
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2025-11-01' = {
  name: 'acrdraconisdev${suffix}'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    roleAssignmentMode: 'LegacyRegistryPermissions'
    policies: {
      azureADAuthenticationAsArmPolicy: {
        status: 'enabled'
      }
    }
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-drac-dev-${suffix}'
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 7
    sku: {
      family: 'A'
      name: 'standard'
    }
  }
}

var apps = ['draconis-api', 'draconis-planner']
resource identities 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = [for app in apps: {
  name: 'id-${app}-dev'
  location: location
  tags: tags
}]

var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (app, i) in apps: {
  name: guid(registry.id, identities[i].id, acrPullRoleId)
  scope: registry
  properties: {
    principalId: identities[i].properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}]

var secretsUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
resource apiSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, identities[0].id, secretsUserRoleId)
  scope: vault
  properties: {
    principalId: identities[0].properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: secretsUserRoleId
  }
}

module postgres './modules/postgres.bicep' = {
  name: 'postgres-dev'
  params: {
    location: location
    serverName: 'pg-draconis-dev-${suffix}'
    postgresSubnetId: postgresSubnet.id
    networkId: network.id
    adminObjectId: postgresAdminObjectId
    adminName: postgresAdminName
    tags: tags
  }
}

output registryName string = registry.name
output apiIdentityName string = identities[0].name
output postgresHost string = postgres.outputs.host
output vaultName string = vault.name
