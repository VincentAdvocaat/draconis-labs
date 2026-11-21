param zoneName string
param networkId string
param tags object
param address string = ''

resource zone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: zoneName
  location: 'global'
  tags: tags
}

resource link 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: zone
  name: 'draconis-dev'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: networkId
    }
  }
}

resource wildcard 'Microsoft.Network/privateDnsZones/A@2020-06-01' = if (!empty(address)) {
  parent: zone
  name: '*'
  properties: {
    ttl: 60
    aRecords: [
      {
        ipv4Address: address
      }
    ]
  }
}

output zoneId string = zone.id
