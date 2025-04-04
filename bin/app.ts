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
  sourceProps,
  buildProps,
  githubAccessTokenArn,
  buildEnvironmentVariables,
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
  sourceProps: {
    owner: sourceProps.owner,
    repo: sourceProps.repo,
    branchOrRef: sourceProps.branchOrRef,
    rootdir: sourceProps.rootdir
  },
  buildProps: {
    runtime: buildProps?.runtime as string,
    runtime_version: buildProps?.runtime_version as string,
    installcmd: buildProps?.installcmd as string,
    buildcmd: buildProps?.buildcmd as string,
    outputdir: buildProps?.outputdir as string,
    include: buildProps?.include as string[],
    exclude: buildProps?.exclude as string[]
  },
  githubAccessTokenArn,
  buildEnvironmentVariables,
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