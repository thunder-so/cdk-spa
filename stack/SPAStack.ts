import { Aws, ArnFormat, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApplicationConstruct, EnvironmentConstruct, HostingConstruct, PipelineConstruct } from '../lib';
import type { SPAProps } from './SPAProps'; 
import { PolicyStatement, Effect, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { BuildEnvironmentVariableType } from 'aws-cdk-lib/aws-codebuild';
import { CfnDistribution, CfnOriginAccessControl } from "aws-cdk-lib/aws-cloudfront";
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

    // // Set up the AppConfig application
    // const application = new ApplicationConstruct(this, 'Application', {
    //   applicationName: props.application,
    // });
    
    // // Set up the AppConfig environment and configuration profile
    // const environment = new EnvironmentConstruct(this, 'Environment', {
    //   applicationConstruct: application,
    //   applicationName: props.application,
    //   environmentName: props.environment,
    // });

    const hosting = new HostingConstruct(this, 'Hosting', {
      application: props.application,
      environment: props.environment,
      service: props.service,
      edgeFunctionFilePath: props.edgeFunctionFilePath as string,
      domain: props.domain as string,
      globalCertificateArn: props.globalCertificateArn as string,
      hostedZoneId: props.hostedZoneId as string,
    });

    const pipeline = new PipelineConstruct(this, 'Pipeline', {
      HostingBucket: hosting.hostingBucket,
      Distribution: hosting.distribution,
      application: props.application,
      environment: props.environment,
      service: props.service,
      sourceProps: {
        owner: props.sourceProps?.owner, 
        repo: props.sourceProps?.repo, 
        branchOrRef: props.sourceProps?.branchOrRef, 
        rootdir: props.sourceProps?.rootdir as string
      },
      githubAccessTokenArn: props.githubAccessTokenArn as string,
      buildSpecFilePath: props.buildSpecFilePath as string,
      buildProps: {
        runtime: props.buildProps?.runtime as string,
        runtime_version: props.buildProps?.runtime_version as string,
        installcmd: props.buildProps?.installcmd as string,
        buildcmd: props.buildProps?.buildcmd as string,
        outputdir: props.buildProps?.outputdir as string,
      },
      buildEnvironmentVariables: props.buildEnvironmentVariables as Record<string, { value: string; type: BuildEnvironmentVariableType.PARAMETER_STORE }>,
      eventTarget: props.eventTarget as string,
      environmentId: props.environmentId as string,
      serviceId: props.serviceId as string
    });

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

    // const comS3PolicyOverride = hosting?.hostingBucket.node.findChild("Policy").node.defaultChild as CfnBucketPolicy;
    // const statement = comS3PolicyOverride.policyDocument.statements[1];
    // if (statement["_principal"] && statement["_principal"].CanonicalUser) {
    //   delete statement["_principal"].CanonicalUser;
    // }

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
    }
    // End of OAC patch

  }
}
