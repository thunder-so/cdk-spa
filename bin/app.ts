import { App } from "aws-cdk-lib";
import { SPAStack, type SPAProps } from '../';

const app = new App();

const metadata: SPAProps = app.node.tryGetContext('metadata');

if (!metadata) {
  throw new Error('Context metadata missing!');
}

const {
  env,
  application,
  service,
  environment,
  sourceProps,
  githubAccessTokenArn,
  buildProps,
  buildEnvironmentVariables,
  domain,
  globalCertificateArn,
  hostedZoneId,
  eventTarget,
  environmentId,
  serviceId
} = metadata;

const appStackProps: SPAProps = {
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
  githubAccessTokenArn,
  buildProps: {
    runtime: buildProps?.runtime as string,
    runtime_version: buildProps?.runtime_version as string,
    installcmd: buildProps?.installcmd as string,
    buildcmd: buildProps?.buildcmd as string,
    outputdir: buildProps?.outputdir as string
  },
  buildEnvironmentVariables,
  domain,
  globalCertificateArn,
  hostedZoneId,
  eventTarget,
  environmentId,
  serviceId
};

new SPAStack(new App(), `${appStackProps.application}-${appStackProps.service}-${appStackProps.environment}-stack`, appStackProps);

app.synth();