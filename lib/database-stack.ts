import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { WebSocketApi, WebSocketStage } from '@aws-cdk/aws-apigatewayv2-alpha'
import { WebSocketLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha'
import { SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2'
import { AuroraPostgresEngineVersion, DatabaseClusterEngine, ServerlessCluster } from 'aws-cdk-lib/aws-rds'
import { AssetCode, Function, Runtime } from 'aws-cdk-lib/aws-lambda'
import childProcess = require('child_process')

export class DatabaseStack extends Stack {
  constructor (scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const vpc = new Vpc(this, 'database-vpc', {
      vpcName: 'database-network',
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'subnet1',
          subnetType: SubnetType.PRIVATE_ISOLATED
        }
      ]
    })

    const cluster = new ServerlessCluster(this, 'database-cluster', {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_10_21
      }),
      defaultDatabaseName: 'tsdata',
      vpc,
      vpcSubnets: vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_ISOLATED }),
      enableDataApi: true
    })

    const createFunction = (functionName: string) =>
      new Function(this, `${functionName}.function`, {
        runtime: Runtime.NODEJS_16_X,
        handler: `index.${functionName}`,
        code: AssetCode.fromAsset('function', { bundling: typescriptBundler }),
        environment: {
          CLUSTER_ARN: cluster.clusterArn,
          SECRET_ARN: cluster.secret?.secretArn ?? '',
          DB_NAME: 'tsdata',
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'
        }
      })

    const initFunction = createFunction('init')
    const connectFunction = createFunction('connect')
    const disconnectFunction = createFunction('disconnect')
    const sendFunction = createFunction('send')

    cluster.grantDataApiAccess(initFunction)
    cluster.grantDataApiAccess(connectFunction)
    cluster.grantDataApiAccess(disconnectFunction)
    cluster.grantDataApiAccess(sendFunction)

    const websocketApi = new WebSocketApi(this, 'api', {
      apiName: 'socket-api',
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('connect-integration', connectFunction)
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('disconnect-integration', disconnectFunction)
      }
    })

    websocketApi.addRoute('send', {
      integration: new WebSocketLambdaIntegration('send-integration', sendFunction)
    })

    const stage = new WebSocketStage(this, 'ws-stage', {
      autoDeploy: true,
      webSocketApi: websocketApi,
      stageName: 'dev'
    })

    const connectionsArns = this.formatArn({
      service: 'execute-api',
      resourceName: `${stage.stageName}/POST/*`,
      resource: websocketApi.apiId
    })

    sendFunction.addToRolePolicy(
      new PolicyStatement({ actions: ['execute-api:ManageConnections'], resources: [connectionsArns] })
    )

    new CfnOutput(this, 'init-function-name', {
      value: initFunction.functionName
    })

    new CfnOutput(this, 'url', {
      value: stage.url
    })

    new CfnOutput(this, 'cluster-arn', {
      value: cluster.clusterArn
    })

    new CfnOutput(this, 'secret-arn', {
      value: cluster.secret?.secretArn ?? ''
    })
  }
}

const typescriptBundler = {
  image: Runtime.NODEJS_16_X.bundlingImage,
  local: {
    tryBundle (outputDir: string) {
      const commands = [
        'cd function',
        'rm -rf dist',
        'npm i',
        'npx tsc',
        'cp package*.json ./dist',
        'cd ./dist && npm i --omit dev && cd ..',
        'rm ./dist/package*.json',
        `cp -R ./dist/ ${outputDir}`
      ]

      childProcess.execSync(commands.join(' && '))

      return true
    }
  }
}
