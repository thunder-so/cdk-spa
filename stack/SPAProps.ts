import {type StackProps} from "aws-cdk-lib";

export interface SPAProps extends StackProps {
    /**
     * The AWS environment (account/region) where this stack will be deployed.
     */
    readonly env: {
      // The ID of your AWS account on which to deploy the stack.
      account: string;
  
      // The AWS region where to deploy the app.
      region: string;
    };
  
    /**
     * A string identifier for the project the app is part of.
     */
    readonly application: string;
  
    /**
     * A string identifier for the project's service the app is created for.
     */
    readonly service: string;
  
    /**
     * A string to identify the environment of the app.
     */
    readonly environment: string;
  
    /**
     * Configure your Github repository
     */
    readonly sourceProps: {
      owner: string;
      repo: string;
      branchOrRef: string;
      rootdir: string|undefined;
    };

    /**
     * Provide the ARN to your Secrets Manager secret.
     */
    readonly githubAccessTokenArn: string;
  
    /**
     * If you have a custom buildspec.yml file for your app, provide the relative path to the file.
     */
    readonly buildSpecFilePath?: string;
  
    /**
     * If you provide a buildSpec file, skip this.
     */
    readonly buildProps?: {
      runtime: string;
      runtime_version: string;
      installcmd: string;
      buildcmd: string;
      outputdir: string;
    };

    /**
     * If you have custom environments for build step, create Parameter Store variables as plaintext and use this format:
     * Must be in the same region as your stack.
     * 
     *   buildEnvironmentVariables: [
     *     { key: 'PUBLIC_EXAMPLE', resource: '/path-to/your-parameter' }
     *   ]
     */
    readonly buildEnvironmentVariables?: { key: string; resource: string; }[];

    /**
     * Optional. If you have a custom CloudFront Functions file for your app, provide the relative path to the file.
     */
    readonly edgeFunctionFilePath?: string;
   
    /**
     * Optional. The domain (without the protocol) at which the app shall be publicly available.
     */
    readonly domain?: string;
  
    /**
     * Optional. The ARN of the certificate to use on CloudFront for the app to make it accessible via HTTPS.
     */
    readonly globalCertificateArn?: string;
  
    /**
     * Optional. The ID of the hosted zone to create a DNS record for the specified domain.
     */
    readonly hostedZoneId?: string;

    /**
     * Optional: Array of redirects: source and destination paths
     */
    readonly redirects?: { source: string; destination: string; }[];

    /**
     * Optional: Array of rewrites: source and destination paths
     */
    readonly rewrites?: { source: string; destination: string; }[];

    /**
     * Thunder.so platform features. 
     * You can use the stack safely without using these props.
     * - The pipeline events are broadcast using an event bus. Defaults to null.
     */
    readonly eventTarget?: string;

}
  