import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { WebSocketApi, WebSocketStage } from '@aws-cdk/aws-apigatewayv2-alpha'
import { WebSocketLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Runtime } from 'aws-cdk-lib/aws-lambda'

export class DatabaseStack extends Stack {
  constructor (scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const table = new dynamodb.Table(this, 'WebsocketConnections', {
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    })

    const createFunction = (functionName: string) =>
      new NodejsFunction(this, `${functionName}.function`, {
        runtime: Runtime.NODEJS_16_X,
        entry: './function/src/index.ts',
        handler: functionName,
        environment: {
          TABLE_NAME: table.tableName,
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'
        }
      })

    const initFunction = createFunction('init')
    const connectFunction = createFunction('connect')
    const disconnectFunction = createFunction('disconnect')
    const sendFunction = createFunction('send')

    table.grantReadWriteData(initFunction)
    table.grantReadWriteData(connectFunction)
    table.grantReadWriteData(disconnectFunction)
    table.grantReadWriteData(sendFunction)

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
  }
}
