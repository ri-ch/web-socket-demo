import { APIGatewayProxyEvent as ProxyEvent } from 'aws-lambda'
import { ApiGatewayManagementApi } from 'aws-sdk'
import Client = require('data-api-client')

const db = Client({
  secretArn: process.env.SECRET_ARN ?? 'UNDEFINED',
  resourceArn: process.env.CLUSTER_ARN ?? 'UNDEFINED',
  database: process.env.DB_NAME
})

export const init = async () => {
  const queries = [
    'CREATE TABLE IF NOT EXISTS connections ( connectionId varchar(100) );'
  ]

  await db.query(queries.join('\n'))
  return 'OK'
}

interface Connection {
  connectionid: string
}

export const send = async (event: ProxyEvent) => {
  const connectionId = event.requestContext.connectionId

  const query = 'SELECT * FROM connections WHERE connectionId != :connectionId'
  const connections = await db.query(query, { connectionId })

  // Persistent connections maintained here
  const apigwManagementApi = new ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: `${event.requestContext.domainName ?? ''}/${event.requestContext.stage}`
  })

  const message = JSON.parse(event.body ?? '').message

  const sendRequests = connections.records.map(async (connection: any) => await sendRequestToConnection(connection, message, apigwManagementApi))

  await Promise.all(sendRequests)

  return ({
    statusCode: 200,
    body: 'Message sent.'
  })
}

const sendRequestToConnection = async (
  connection: Connection,
  message: string,
  api: ApiGatewayManagementApi
) => {
  try {
    await api.postToConnection({
      ConnectionId: connection.connectionid,
      Data: message
    }).promise()
  } catch (e: any) {
    if (e.statusCode === 410) {
      console.log(`Found stale connection, deleting ${connection.connectionid}`)
      await db.query('DELETE FROM connections WHERE connectionId = :connectionId', { connectionId: connection.connectionid })
    } else {
      throw e
    }
  }
}

export const connect = async (event: ProxyEvent) => {
  const connectionId = event.requestContext.connectionId

  await db.query('INSERT INTO connections (connectionId) VALUES (:connectionId)', { connectionId })

  console.log('Client Connected')

  return ({
    statusCode: 200,
    body: 'Connected.'
  })
}

export const disconnect = async (event: ProxyEvent) => {
  const connectionId = event.requestContext.connectionId

  await db.query('DELETE FROM connections WHERE connectionId = :connectionId', { connectionId })

  console.log('Client Disconnected')

  return ({
    statusCode: 200,
    body: 'Disconnected.'
  })
}

export const authorize = async () => {

}
