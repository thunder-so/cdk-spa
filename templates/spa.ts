import { App } from "aws-cdk-lib";
import { SPAStack, type SPAProps } from "@thunderso/cdk-spa";

const appStackProps: SPAProps = {
  env: {
    account: 'your-account-id',
    region: 'us-east-1'
  },
  application: 'your-application-id',
  service: 'your-service-id',
  environment: 'production',

  // Your Github repository url contains https://github.com/<owner>/<repo>
  sourceProps: {
    owner: 'your-github-username',
    repo: 'your-repo-name',
    branchOrRef: 'main',
    rootdir: ''
  },

  // Build variables for CodeBuild
  // https://docs.aws.amazon.com/codebuild/latest/userguide/available-runtimes.html
  buildProps: {
    runtime: 'nodejs',
    runtime_version: 20,
    installcmd: 'npm ci',
    buildcmd: 'npm run build',
    outputdir: 'dist/'
  },
  // Providing a buildspec.yml will override buildProps and sourceProps.rootdir
  // buildSpecFilePath: 'stack/buildspec.yml',

  // Auto deployment
  // - create a Github personal access token
  // - store in Secrets Manager as plaintext
  githubAccessTokenArn: 'arn:aws:ssm:us-east-1:123456789012:parameter/github-token',

  // Optional: Domain settings
  // - create a hosted zone for your domain
  // - issue a global tls certificate in us-east-1 
  domain: 'example.com',
  hostedZoneId: 'Z1D633PJRANDOM',
  globalCertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abcd1234-abcd-1234-abcd-1234abcd1234',

  // Custom buildtime environment variables
  // buildEnvironmentVariables: [
  //   { key: 'PUBLIC_EXAMPLE', resource: '/path-to/your-parameter' }
  // ]

  // Optional: Redirects and Rewrites
  //  - supports named parameters ":foo" and wildcard "*"
  // "redirects": [
  //   {
  //     "source": "/contact",
  //     "destination": "/"
  //   },
  //   {
  //     "source": "/docs/:bar",
  //     "destination": "/:bar"
  //   },
  //   {
  //     "source": "/guide/*",
  //     "destination": "/blog/*"
  //   }
  // ],

  // "rewrites": [
  //   {
  //     "source": "/test",
  //     "destination": "/about/index.html"
  //   }
  // ],

  // "headers": [
  //     {
  //       "name": "Cache-Control",
  //       "value": "public, max-age=31536000" // one year
  //     }
  // ],

  // Custom Cloudfront Functions
  // edgeFunctionFilePath: 'custom.js',

  // all resources created in the stack will be tagged
  // tags: {
  //   key: 'value'
  // },
};

new SPAStack(new App(), `${appStackProps.application}-${appStackProps.service}-${appStackProps.environment}-stack`, appStackProps);