#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { StaticSiteStack, type StaticSiteProps } from "../../../../stacks/static-site";
// import { StaticSiteStack, type StaticSiteProps } from "@thunderso/stacks/static-site";

const appStackProps: StaticSiteProps = {
  env: {
    account: '665186350589',
    region: 'us-east-1'
  },
  application: 'examples',
  service: 'gatsby',
  environment: 'prod',

  // Your Github repository url contains https://github.com/<owner>/<repo>
  sourceProps: {
    owner: 'thunder-so',
    repo: 'stacks',
    branchOrRef: 'main',
    rootdir: 'examples/gatsby/'
  },

  // Auto deployment
  // - create a Github personal access token
  // - store in Secrets Manager as plaintext
  githubAccessTokenArn: 'arn:aws:secretsmanager:us-east-1:665186350589:secret:githubpat-0abFlT',

  // Either provide a buildspec.yml file OR leave empty and fill out buildProps
  // buildSpecFilePath: '',
  buildProps: {
    runtime: 20, // nodejs version
    installcmd: "npm install",
    buildcmd: "npm run build",
    outputdir: "public/"
  },
  
  // Custom CloudFront Functions for URL rewrite
  edgeFunctionFilePath: 'stack/urlrewrite.js'

};

new StaticSiteStack(new App(), `${appStackProps.application}-${appStackProps.service}-${appStackProps.environment}-stack`, appStackProps);