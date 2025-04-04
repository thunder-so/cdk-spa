import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HostingConstruct, DeployConstruct, PipelineConstruct, EventsConstruct, SSRConstruct } from '../lib';
import type { SPAProps } from './SPAProps'; 
import { CfnDistribution } from "aws-cdk-lib/aws-cloudfront";
import { CfnBucketPolicy } from "aws-cdk-lib/aws-s3";

export class SPAStack extends Stack {
  constructor(scope: Construct, id: string, props?: SPAProps) {
    super(scope, id, props);

    // Check mandatory properties
    if (!props?.env) {
      throw new Error('Must provide AWS account and region.');
    }
    if (!props.application || !props.environment || !props.service) {
      throw new Error('Mandatory stack properties missing.');
    }

    // Set the resource prefix
    const resourceIdPrefix = `${props.application}-${props.service}-${props.environment}`.substring(0, 42);

    // Sanitize paths to remove leading and trailing slashes
    const sanitizePath = (path: string | undefined): string => {
      if (!path) return '';
      return path.replace(/^\/+|\/+$/g, '');
    };

    const rootdir = sanitizePath(props.sourceProps.rootdir);
    const outputdir = sanitizePath(props.buildProps?.outputdir);

    /**
     * Enable SSR if entrypoint and outputdir are provided
     * 
     */
    const enableSSR = props?.ssrProps?.entrypoint && props?.ssrProps?.outputdir
      ? new SSRConstruct(this, 'SSR', {
        debug: props.debug,
        resourceIdPrefix: resourceIdPrefix,
        ssrProps: {
          entrypoint: props.ssrProps.entrypoint,
          outputdir: sanitizePath(props.ssrProps.outputdir),
          routes: props.ssrProps.routes,
          memorySize: props.ssrProps.memorySize,
          timeout: props.ssrProps.timeout,
        },
        ssrEnvironmentVariables: props.ssrEnvironmentVariables,
      })
      : undefined;

    /**
     * Hosting the SPA with S3 and CloudFront
     * 
     */
    const hosting = new HostingConstruct(this, 'Hosting', {
      debug: props.debug,
      resourceIdPrefix: resourceIdPrefix,
      domain: props.domain as string,
      globalCertificateArn: props.globalCertificateArn as string,
      hostedZoneId: props.hostedZoneId as string,
      redirects: props.redirects,
      rewrites: props.rewrites,
      headers: props.headers,
      allowHeaders: props.allowHeaders,
      allowCookies: props.allowCookies,
      allowQueryParams: props.allowQueryParams,
      denyQueryParams: props.denyQueryParams,
      ...(enableSSR 
        ? { 
          ssrProps: {
            routes: props?.ssrProps?.routes,
          },
          ssrLambdaFunction: enableSSR.ssrLambdaFunction, 
          ssrLambdaFunctionUrl: enableSSR.ssrLambdaFunctionUrl
        }
        : {}),
    });

    /**
     * Pipeline disabled, deploy assets directly to S3
     * 
     */
    if (!props.githubAccessTokenArn) {
      const deploy = new DeployConstruct(this, 'Deploy', {
        resourceIdPrefix: resourceIdPrefix,
        HostingBucket: hosting.hostingBucket,
        Distribution: hosting.distribution,
        sourceProps: {
          rootdir: rootdir
        },
        buildProps: {
          outputdir: outputdir,
        }
      });
    }

    /**
     * Pipeline enabled and GitHub access token provided
     * 
     */ 
    else {
      // check for sourceProps
      if (!props.sourceProps.owner || !props.sourceProps.repo || !props.sourceProps.branchOrRef) {
        throw new Error('sourceProps owner, repo and branch/ref required.');
      }

      // check for buildProps
      if (!props.buildProps?.runtime || !props.buildProps?.runtime_version || !props.buildProps?.installcmd || !props.buildProps?.buildcmd || !props.buildProps?.outputdir) {
        throw new Error('buildProps runtime, runtime_version, installcmd, buildcmd and outputdir required when pipeline is enabled.');
      }

      const pipeline = new PipelineConstruct(this, 'Pipeline', {
        debug: props.debug,
        resourceIdPrefix: resourceIdPrefix,
        HostingBucket: hosting.hostingBucket,
        Distribution: hosting.distribution,
        sourceProps: {
          owner: props.sourceProps?.owner, 
          repo: props.sourceProps?.repo, 
          branchOrRef: props.sourceProps?.branchOrRef, 
          rootdir: rootdir
        },
        githubAccessTokenArn: props.githubAccessTokenArn,
        buildSpecFilePath: props.buildSpecFilePath as string,
        buildProps: {
          runtime: props.buildProps?.runtime,
          runtime_version: props.buildProps?.runtime_version,
          installcmd: props.buildProps?.installcmd,
          buildcmd: props.buildProps?.buildcmd,
          outputdir: outputdir,
          include: props.buildProps?.include as string[],
          exclude: props.buildProps?.exclude as string[]
        },
        buildEnvironmentVariables: props.buildEnvironmentVariables as { key: string; resource: string }[]
      });
    
      // Pipeline events
      if (props.eventTarget) {
        new EventsConstruct(this, 'PipelineEvents', {
          debug: props.debug,
          resourceIdPrefix: resourceIdPrefix,
          codePipeline: pipeline.codePipeline,
          eventTarget: props.eventTarget,
        });
      }
    }; // end if

    /**
     * Origin Access Control (OAC) patch
     * Adapted from: https://github.com/awslabs/cloudfront-hosting-toolkit
     * 
     * Patch is needed because no native support from AWS.
     * https://github.com/aws/aws-cdk/issues/21771
     */
    const cfnDistribution = hosting?.distribution.node.defaultChild as CfnDistribution;
    cfnDistribution.addOverride(
      "Properties.DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity",
      ""
    );
    cfnDistribution.addPropertyOverride(
      "DistributionConfig.Origins.0.OriginAccessControlId",
      hosting.originAccessControl?.getAtt("Id")
    );

    // remove the second statement entirely (the one with Principal.CanonicalUser)
    const comS3PolicyOverride = hosting?.hostingBucket.node.findChild("Policy").node.defaultChild as CfnBucketPolicy;
    const statements = comS3PolicyOverride.policyDocument.statements;
    statements.splice(1, 1);

    const s3OriginNode = hosting?.distribution.node
      .findAll()
      .filter((child) => child.node.id === "S3Origin");

    if (s3OriginNode && s3OriginNode.length > 0) {
      const resourceNode = s3OriginNode[0].node.findChild("Resource");
      if (resourceNode) {
        resourceNode.node.tryRemoveChild("Resource")
      }
    };
    // End of OAC patch

  }
}
