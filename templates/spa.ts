import { Cdk, SPAStack, type SPAProps } from "@thunderso/cdk-spa";

const appStackProps: SPAProps = {
  debug: false,
  
  env: {
    account: 'your-account-id',
    region: 'us-east-1'
  },
  application: 'your-application-id',
  service: 'your-service-id',
  environment: 'production',

  rootDir: '',
  outputDir: 'dist/',
};

new SPAStack(
  new Cdk.App(), 
  `${appStackProps.application}-${appStackProps.service}-${appStackProps.environment}-stack`, 
  appStackProps
);