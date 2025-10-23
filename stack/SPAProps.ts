import { type StackProps } from "aws-cdk-lib";

export interface PipelineProps {
  /**
   * Enable pipeline mode with Github Access Token stored as a secret in SSM Secret Manager.
   * Provide the ARN to your Secrets Manager secret.
   */
  readonly accessTokenSecretArn?: string;

  /**
   * Configure your Github repository
   */
  readonly sourceProps?: {
    readonly owner?: string;
    readonly repo?: string;
    readonly branchOrRef?: string;
  };

  /**
   * The properties for CodeBuild build process.
   */
  readonly buildProps?: {
    readonly runtime?: string;
    readonly runtime_version?: string|number;
    readonly installcmd?: string;
    readonly buildcmd?: string;
    readonly include?: string[];
    readonly exclude?: string[];
    readonly environment?: Array<{ [key: string]: string; }>;
    readonly secrets?: { key: string; resource: string; }[];
    /**
     * Optional. Path to a custom Dockerfile for the build environment.
     * Example: 'runtime/Dockerfile'
     */
    readonly customRuntime?: string;
  };

  /**
   * If you have a custom buildspec.yml file for your app, provide the relative path to the file.
   */
  readonly buildSpecFilePath?: string;

  /**
   * The ARN of the Event Bus.
   * - The pipeline events are broadcast to an event bus. Defaults to null.
   */
  readonly eventTarget?: string;
}

/**
 * Domain and certificate properties
 */
export interface DomainProps {
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
}

export interface EdgeProps {
  /**
   * Optional: Array of redirects: source and destination paths
   */
  readonly redirects?: { source: string; destination: string }[];
  /**
   * Optional: Array of rewrites: source and destination paths
   */
  readonly rewrites?: { source: string; destination: string }[];
  /**
   * Optional: Custom headers
   */
  readonly headers?: { path: string; name: string; value: string }[];
}

export interface CloudFrontProps {
  /**
   * Optional. The path to the error page in the output directory. e.g. /404.html
   * Relative to the output directory.
   * The default error page is /index.html.
   */
  readonly errorPagePath?: string;

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
}

/**
 * Application identity and environment properties
 */
export interface AppProps extends StackProps {
  /**
   * Debug
   */
  readonly debug?: boolean;

  /**
   * The AWS environment (account/region) where this stack will be deployed.
   */
  readonly env: {
    // The ID of your AWS account on which to deploy the stack.
    readonly account: string;

    // The AWS region where to deploy the app.
    readonly region: string;
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
   * The root directory of the app.
   * This is the directory where the app's source code is located.
   */
  readonly rootDir: string;
  
  /**
   * The output directory of the app.
   * This is the directory where the app's build output is located.
   * It is relative to the root directory.
   */
  readonly outputDir: string;
}

export interface SPAProps
  extends PipelineProps,
    DomainProps,
    EdgeProps,
    CloudFrontProps,
    AppProps {}