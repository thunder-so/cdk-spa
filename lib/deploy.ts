import * as path from 'path';
import { StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BucketDeployment, Source, CacheControl } from 'aws-cdk-lib/aws-s3-deployment';
import { type IBucket } from "aws-cdk-lib/aws-s3";
import { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import { SPAProps } from '../stack/SPAProps';

export interface DeployProps extends SPAProps {
    HostingBucket: IBucket;
    Distribution: IDistribution;
}

export class DeployConstruct extends Construct {
  constructor(scope: Construct, id: string, props: DeployProps) {
    super(scope, id);

    // Construct the full path to the build output directory
    const assetPath = path.join(props.rootDir || '.', props.outputDir || '');
      
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
