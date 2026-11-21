param name string
param tags object
param environmentId string
param registryHost string
param imageSha256 string
param identityId string
param appPort int
param reachableFromVirtualNetwork bool
param environmentVariables array

var healthProbes = [for probe in ['Startup', 'Readiness', 'Liveness']: {
  type: probe
  httpGet: {
    path: '/health'
    port: appPort
    scheme: 'HTTP'
  }
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: probe == 'Startup' ? 12 : 3
}]

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: 'northeurope'
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    environmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: reachableFromVirtualNetwork
        targetPort: appPort
        transport: 'http'
      }
      registries: [
        {
          server: registryHost
          identity: identityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: name
          image: '${registryHost}/${name}@sha256:${imageSha256}'
          env: environmentVariables
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          probes: healthProbes
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

output fqdn string = app.properties.configuration.ingress.fqdn
