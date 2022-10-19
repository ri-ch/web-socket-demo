# Web Socket Demo

Simple demo of a web socket application using AWS API Gateway. Adapted from tutorial here: https://aws.plainenglish.io/setup-api-gateway-websocket-api-with-cdk-c1e58cf3d2be

## Pre-requisites

* NodeJS v18+
* AWS CLI v2+
* A websocket capable client for usage
  * For NPM `wscat` is a good example

## Setup

* `npm ci`
* `npx cdk deploy` - provide AWS profile as appropriate using the `--profile` flag
* Copy the lambda function name from the `init-function-name` output
* Invoke the init lambda to setup the database `aws lambda invoke <init-function-name>`
  * The database can take up to 30 seconds to start up so this command may fail on first try

## Usage

* Obtain the API URL from the output of the CDK deploy step
* Connect two or more terminal windows to the server
  * `npx wscat -c <websocket-api-url>`
* Send a payload with the following format. The value of the message property can be any string of text
  * `{ "action": "send", "message": "<enter_message_here>" }`
* Other connected clients will receive the value of the `message` property
