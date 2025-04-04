import { StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { type IBucket } from "aws-cdk-lib/aws-s3";
import { IDistribution } from 'aws-cdk-lib/aws-cloudfront';

export interface DeployProps extends StackProps {
    debug?: boolean;
    resourceIdPrefix: string;

    // Objects from HostingConstruct
    HostingBucket: IBucket;
    Distribution: IDistribution;
  
    // source
    sourceProps: {
      rootdir: string;
    };
  
    // build
    buildProps?: {
      outputdir: string;
      include?: string[];
      exclude?: string[];
    };
}

export class DeployConstruct extends Construct {
  constructor(scope: Construct, id: string, props: DeployProps) {
    super(scope, id);

    // Construct the full path to the build output directory
    const assetPath = props.sourceProps.rootdir
      ? `${props.sourceProps.rootdir}/${props.buildProps?.outputdir}`
      : props.buildProps?.outputdir || '.';
      
    // Create the S3 deployment
    new BucketDeployment(this, 'DeployAssets', {
      sources: [Source.asset(assetPath)],
      exclude: props.buildProps?.exclude,
      include: props.buildProps?.include,
      destinationBucket: props.HostingBucket,
      prune: false,
      distribution: props.Distribution,
      distributionPaths: ['/*'],
      // metadata: {
      //   revision: this.deploymentRevision,
      // },
      memoryLimit: 1792
    });
  }
}
