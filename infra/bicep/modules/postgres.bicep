param serverName string
param location string
param postgresSubnetId string
param networkId string
param adminObjectId string
param adminName string
param tags object

module privateDns './private-dns.bicep' = {
  name: 'postgres-dns'
  params: {
    zoneName: 'dev.postgres.database.azure.com'
    networkId: networkId
    tags: tags
  }
}

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '17'
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Disabled'
      tenantId: tenant().tenantId
    }
    network: {
      delegatedSubnetResourceId: postgresSubnetId
      privateDnsZoneArmResourceId: privateDns.outputs.zoneId
      publicNetworkAccess: 'Disabled'
    }
  }
}

resource admin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = {
  parent: server
  name: adminObjectId
  properties: {
    principalName: adminName
    principalType: 'Group'
    tenantId: tenant().tenantId
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: 'draconis'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

output host string = server.properties.fullyQualifiedDomainName
