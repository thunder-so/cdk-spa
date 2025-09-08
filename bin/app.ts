import { App } from "aws-cdk-lib";
import { SPAStack, type SPAProps } from '../';

const app = new App();

const metadata: SPAProps = app.node.tryGetContext('metadata');

if (!metadata) {
  throw new Error('Context metadata missing!');
}

new SPAStack(app, `${metadata.application}-${metadata.service}-${metadata.environment}-stack`, metadata);

app.synth();