import {type StackProps} from "aws-cdk-lib";

export interface SPAProps extends StackProps {

    /**
     * Debug
     */
    readonly debug: boolean;

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
      owner?: string;
      repo?: string;
      branchOrRef?: string;
      rootdir: string|undefined;
    };
  
    /**
     * If you provide a buildSpec file, skip this.
     */
    readonly buildProps?: {
      runtime?: string;
      runtime_version?: string|number;
      installcmd?: string;
      buildcmd?: string;
      outputdir?: string;
      include?: string[];
      exclude?: string[];
    };

    /**
     * Optinal. Enable Pipeline
     * Provide the ARN to your Secrets Manager secret.
     */
    readonly githubAccessTokenArn?: string;
  
    /**
     * Optional. Works only when githubAccessTokenArn is provided.
     * If you have a custom buildspec.yml file for your app, provide the relative path to the file.
     */
    readonly buildSpecFilePath?: string;

    /**
     * Optional. Works only when githubAccessTokenArn is provided.
     * Create Parameter Store variables as plaintext and use this format:
     * Must be in the same region as your stack.
     * 
     *   buildEnvironmentVariables: [
     *     { key: 'PUBLIC_EXAMPLE', resource: '/path-to/your-parameter' }
     *   ]
     */
    readonly buildEnvironmentVariables?: { key: string; resource: string; }[];
   

    /**
     * Domains with Route53 and ACM
     */

    // Optional. The domain (without the protocol) at which the app shall be publicly available.
    readonly domain?: string;
  
    // Optional. The ARN of the certificate to use on CloudFront for the app to make it accessible via HTTPS.
    readonly globalCertificateArn?: string;
  
    // Optional. The ID of the hosted zone to create a DNS record for the specified domain.
    readonly hostedZoneId?: string;


    /**
     * Lambda@Edge functions
     * - Redirects, rewrites, and custom headers
     */

    // Optional: Array of redirects: source and destination paths
    readonly redirects?: { source: string; destination: string; }[];

    // Optional: Array of rewrites: source and destination paths
    readonly rewrites?: { source: string; destination: string; }[];

    // Optional: Custom headers
    readonly headers?: { path: string; name: string; value: string; }[];

    /**
     * Optional. An array of headers to include in the cache key and pass to the origin on requests.
     * No headers are passed by default.
     */
    readonly allowHeaders?: string[];

    /**
     * Optional. An array of cookies to include in the cache key and pass to the origin on requests.
     * No cookies are passed by default.
     */
    readonly allowCookies?: string[];

    /**
     * Optional. An array of query parameter keys to include in the cache key and pass to the origin on requests.
     * No query parameters are passed by default.
     * You have specific query parameters that alter the content (e.g., ?userId=, ?lang=, etc.).
     * You want to cache different versions of the content based on these parameters.
     */
    readonly allowQueryParams?: string[];

    /**
     * Optional. An array of query param keys to deny passing to the origin on requests.
     * You have query parameters that should be ignored for caching purposes (e.g., tracking parameters like ?utm_source= or ?fbclid=).
     * You want to prevent these parameters from affecting cache performance.
     * Note that this config can not be combined with {@see allowQueryParams}.
     * If both are specified, the {@see denyQueryParams} will be ignored.
     */
    readonly denyQueryParams?: string[];

    /**
     * Enable SSR support.
     */
    readonly ssrProps?: {
      /**
       * The entry point for the Lambda function.
       * For example, 'index.handler'.
       */
      entrypoint?: string;

      /**
       * The directory where the build outputs are located (relative to the project root).
       */
      outputdir?: string;

      /**
       * The URL routes where the behavior is attached.
       * For example, ['/api/*'].
       */
      routes?: string[];

      /**
       * The memory size to allocate to the Lambda function.
       * Defaults to 512 MB.
       */
      memorySize?: number;

      /**
       * The timeout for the Lambda function.
       * Defaults to 10 seconds.
       */
      timeout?: number;
    };

    /**
     * If you have custom environments for the Lambda function, create Parameter Store variables as plaintext and use this format:
     * Must be in the same region as your stack.
     *
     *   environmentVariables: [
     *     { key: 'API_ENDPOINT', resource: '/path-to/your-parameter' }
     *   ]
     */
    readonly ssrEnvironmentVariables?: { key: string; resource: string }[];

    /**
     * Optional. Thunder platform features. 
     * - You can use the stack safely without using these props.
     * - The pipeline events are broadcast using an event bus. Defaults to null.
     */
    readonly eventTarget?: string;

}