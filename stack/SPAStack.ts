import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HostingConstruct, DeployConstruct, PipelineConstruct, EventsConstruct } from '../lib';
import type { SPAProps } from './SPAProps'; 
import { CfnDistribution } from "aws-cdk-lib/aws-cloudfront";
import { CfnBucketPolicy } from "aws-cdk-lib/aws-s3";

export class SPAStack extends Stack {
  constructor(scope: Construct, id: string, props?: SPAProps) {
    super(scope, id, props);

    // Check mandatory properties
    if (!props?.env.account || !props?.env.region) {
      throw new Error('Must provide AWS account and region.');
    }
    if (!props.application || !props.environment || !props.service) {
      throw new Error('Mandatory stack properties missing.');
    }

    /**
     * Hosting the SPA with S3 and CloudFront
     * 
     */
    const hosting = new HostingConstruct(this, 'Hosting', props);

    /**
     * Pipeline disabled, deploy assets directly to S3
     * 
     */
    if (!props?.accessTokenSecretArn) {
      new DeployConstruct(this, 'Deploy', {
        ...props,
        HostingBucket: hosting.hostingBucket,
        Distribution: hosting.distribution,
      });
    }

    /**
     * Pipeline enabled and GitHub access token provided
     * 
     */ 
    else {
      // check for sourceProps
      if (!props.sourceProps?.owner || !props.sourceProps?.repo || !props.sourceProps?.branchOrRef) {
        throw new Error('Missing sourceProps: Github owner, repo and branch/ref required.');
      }

      // check for buildProps
      if (!props.buildProps?.runtime || !props.buildProps?.runtime_version || !props.buildProps?.installcmd || !props.buildProps?.buildcmd) {
        throw new Error('Missing buildProps: runtime, runtime_version, installcmd, buildcmd and outputdir required when pipeline is enabled.');
      }

      const pipeline = new PipelineConstruct(this, 'Pipeline', {
        ...props,
        HostingBucket: hosting.hostingBucket,
        Distribution: hosting.distribution,
      });
    
      // Pipeline events
      if (props.eventTarget) {
        new EventsConstruct(this, 'PipelineEvents', {
          ...props,
          codePipeline: pipeline.codePipeline,
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
