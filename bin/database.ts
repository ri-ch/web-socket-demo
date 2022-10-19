#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { DatabaseStack } from '../lib/database-stack'

const app = new cdk.App()
new DatabaseStack(app, 'DatabaseStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
})
