import { APIGatewayProxyEvent as ProxyEvent } from 'aws-lambda'
import { ApiGatewayManagementApi, DynamoDB } from 'aws-sdk'

const ddb = new DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION })

interface Connection {
  connectionId: string
}

export const send = async (event: ProxyEvent) => {
  const connectionId = event.requestContext.connectionId

  if (connectionId === undefined) {
    throw new Error('connectionId not specified in process.env.TABLE_NAME')
  }

  const tableName = process.env.TABLE_NAME
  let connectionData

  if (tableName === undefined) {
    throw new Error('tableName not specified in process.env.TABLE_NAME')
  }

  try {
    connectionData = await ddb.scan({ TableName: tableName, ProjectionExpression: 'connectionId' }).promise()
  } catch (e: any) {
    return { statusCode: 500, body: e.stack }
  }

  // Persistent connections maintained here
  const apigwManagementApi = new ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: `${event.requestContext.domainName ?? ''}/${event.requestContext.stage}` // eslint-disable-line
  })

  const message = JSON.parse(event.body ?? '').message

  const sendRequests = (connectionData.Items as Connection[]).filter(connection => connection.connectionId !== connectionId).map(async (connection: any) => await sendRequestToConnection(connection, message, tableName, apigwManagementApi))

  await Promise.all(sendRequests)

  return ({
    statusCode: 200,
    body: 'Message sent.'
  })
}

const sendRequestToConnection = async (
  connection: Connection,
  message: string,
  tableName: string,
  api: ApiGatewayManagementApi
) => {
  try {
    await api.postToConnection({
      ConnectionId: connection.connectionId,
      Data: message
    }).promise()
  } catch (e: any) {
    if (e.statusCode === 410) {
      console.log(`Found stale connection, deleting ${connection.connectionId}`)
      await ddb.delete({ TableName: tableName, Key: { ConnectionId: connection.connectionId } }).promise()
    } else {
      throw e
    }
  }
}
export const connect = async (event: ProxyEvent) => {
  const connectionId = event.requestContext.connectionId

  const tableName = process.env.TABLE_NAME

  if (tableName === undefined) {
    throw new Error('tableName not specified in process.env.TABLE_NAME')
  }

  const putParams = {
    TableName: tableName,
    Item: {
      connectionId
    }
  }

  try {
    await ddb.put(putParams).promise()
  } catch (err) {
    return { statusCode: 500, body: 'Failed to connect: ' + JSON.stringify(err) }
  }

  return ({
    statusCode: 200,
    body: 'Connected.'
  })
}

export const disconnect = async (event: ProxyEvent) => {
  const tableName = process.env.TABLE_NAME

  if (tableName === undefined) {
    throw new Error('tableName not specified in process.env.TABLE_NAME')
  }

  const deleteParams = {
    TableName: tableName,
    Key: {
      connectionId: event.requestContext.connectionId
    }
  }

  try {
    await ddb.delete(deleteParams).promise()
  } catch (err) {
    return { statusCode: 500, body: 'Failed to disconnect: ' + JSON.stringify(err) }
  }

  return { statusCode: 200, body: 'Disconnected.' }
}
