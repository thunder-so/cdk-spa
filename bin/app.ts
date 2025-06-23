import { App } from "aws-cdk-lib";
import { SPAStack, type SPAProps } from '../';

const app = new App();

const metadata: SPAProps = app.node.tryGetContext('metadata');

if (!metadata) {
  throw new Error('Context metadata missing!');
}

const {
  debug,
  env,
  application,
  service,
  environment,
  rootDir,
  outputDir,
  sourceProps,
  buildProps,
  githubAccessTokenArn,
  domain,
  globalCertificateArn,
  hostedZoneId,
  redirects,
  rewrites,
  headers,
  allowHeaders,
  allowCookies,
  allowQueryParams,
  denyQueryParams,
  eventTarget
} = metadata;

const appStackProps: SPAProps = {
  debug,
  env: {
    account: env.account,
    region: env.region
  },
  application,
  service,
  environment,
  rootDir: rootDir,
  outputDir: outputDir,
  sourceProps: {
    owner: sourceProps?.owner,
    repo: sourceProps?.repo,
    branchOrRef: sourceProps?.branchOrRef,
  },
  buildProps: {
    runtime: buildProps?.runtime,
    runtime_version: buildProps?.runtime_version,
    installcmd: buildProps?.installcmd,
    buildcmd: buildProps?.buildcmd,
    include: buildProps?.include,
    exclude: buildProps?.exclude,
    environment: buildProps?.environment,
    secrets: buildProps?.secrets,
  },
  githubAccessTokenArn,
  domain,
  globalCertificateArn,
  hostedZoneId,
  redirects,
  rewrites,
  headers,
  allowHeaders,
  allowCookies,
  allowQueryParams,
  denyQueryParams,
  eventTarget
};

new SPAStack(new App(), `${appStackProps.application}-${appStackProps.service}-${appStackProps.environment}-stack`, appStackProps);

app.synth();