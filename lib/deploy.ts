import { StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BucketDeployment, Source, CacheControl } from 'aws-cdk-lib/aws-s3-deployment';
import { type IBucket } from "aws-cdk-lib/aws-s3";
import { IDistribution } from 'aws-cdk-lib/aws-cloudfront';

export interface DeployProps extends StackProps {
    debug?: boolean;
    resourceIdPrefix: string;

    // Objects from HostingConstruct
    HostingBucket: IBucket;
    Distribution: IDistribution;

    // Directories
    rootDir: string;
    outputDir: string;
  
    // Build
    buildProps?: {
      include?: string[];
      exclude?: string[];
    };
}

export class DeployConstruct extends Construct {
  constructor(scope: Construct, id: string, props: DeployProps) {
    super(scope, id);

    // Construct the full path to the build output directory
    const assetPath = `${props.rootDir || '.'}/${props.outputDir || ''}`;
      
    // Create the S3 deployment
    new BucketDeployment(this, 'DeployAssets', {
      sources: [Source.asset(assetPath)],
      exclude: props.buildProps?.exclude,
      include: props.buildProps?.include,
      destinationBucket: props.HostingBucket,
      prune: false,
      distribution: props.Distribution,
      distributionPaths: ['/**'],
      cacheControl: [
        CacheControl.setPublic(),
        CacheControl.maxAge(Duration.days(365)),
        CacheControl.fromString('immutable'),
      ],
      metadata: {
        revision: new Date().toISOString(),
      },
      memoryLimit: 1792
    });
  }
}
