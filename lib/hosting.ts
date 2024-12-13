import fs from 'fs';
import { Aws, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from "constructs";
import { Bucket, type IBucket, BlockPublicAccess, ObjectOwnership, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { PolicyStatement, Effect, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { CfnDistribution, Distribution, type IDistribution, CachePolicy, SecurityPolicyProtocol, HttpVersion, PriceClass, ResponseHeadersPolicy, HeadersFrameOption, HeadersReferrerPolicy, type BehaviorOptions, AllowedMethods, ViewerProtocolPolicy, CacheCookieBehavior, CacheHeaderBehavior, CacheQueryStringBehavior, CfnOriginAccessControl, Function as CloudFrontFunction, FunctionCode as CloudFrontFunctionCode, FunctionEventType, OriginAccessIdentity, CachedMethods } from "aws-cdk-lib/aws-cloudfront";
import { AaaaRecord, ARecord, HostedZone, type IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { createCloudFrontDistributionForS3, type CreateCloudFrontDistributionForS3Props, type CreateCloudFrontDistributionForS3Response } from '@aws-solutions-constructs/core'

export interface HostingProps {
    application: string;
    service: string;
    environment: string;
    edgeFunctionFilePath?: string;
    domain?: string;
    globalCertificateArn?: string;
    hostedZoneId?: string;
}

export class HostingConstruct extends Construct {

    private resourceIdPrefix: string;

    /**
     * The S3 bucket where the deployment assets gets stored.
     */
    public hostingBucket: IBucket;

    /**
     * The S3 bucket where the access logs of the CloudFront distribution gets stored.
     */
    public accessLogsBucket: IBucket|undefined;

    /**
     * The CloudFront distribution.
     */
    public distribution:  IDistribution;

    /**
     * The CloudFront distribution origin that routes to S3 HTTP server.
     */
    private s3Origin: S3Origin;

    /**
     * The OAC constructs created for the S3 origin.
     */
    public originAccessControl: CfnOriginAccessControl|undefined;

    /**
     * The CloudFront Edge Functions
     */
    private cloudFrontFunction: CloudFrontFunction;
    private cloudFrontURLRewrite: CloudFrontFunction;
    

    constructor(scope: Construct, id: string, props: HostingProps) {
      super(scope, id);

      this.resourceIdPrefix = `${props.application}-${props.service}-${props.environment}`;

      this.createHostingBucket(props);

      this.cloudFrontURLRewrite = this.createCloudFrontURLRewrite(props);

      if (props.edgeFunctionFilePath) {
        this.cloudFrontFunction = this.createCloudFrontFunction(props);
      }

      this.createCloudfrontDistribution(props);

      if(props.domain && props.globalCertificateArn && props.hostedZoneId) {
        this.createDnsRecords(props);
      }

      // Create an output for the distribution's physical ID
      new CfnOutput(this, 'DistributionId', {
        value: this.distribution.distributionId,
        description: 'The ID of the CloudFront distribution',
        exportName: `${this.resourceIdPrefix}-CloudFrontDistributionId`,
      });

      // Create an output for the distribution's URL
      new CfnOutput(this, 'DistributionUrl', {
        value: `https://${this.distribution.distributionDomainName}`,
        description: 'The URL of the CloudFront distribution',
        exportName: `${this.resourceIdPrefix}-CloudFrontDistributionUrl`,
      });
    }

    /**
     * Create a CloudFront Function from edgeFunctionFilePath
     * @param props HostingProps
     * @returns cloudfront function
     */
    private createCloudFrontFunction(props: HostingProps): CloudFrontFunction {
      let cloudFrontFunctionCode: string;
      try {
        cloudFrontFunctionCode = fs.readFileSync(props.edgeFunctionFilePath as string, "utf8");
      } catch (error) {
        throw new Error(`Failed to read CloudFront function file at ${props.edgeFunctionFilePath}: ${error}`);
      }

      const cloudFrontFunction = new CloudFrontFunction(this, 'CloudFrontFunction', {
        code: CloudFrontFunctionCode.fromInline(cloudFrontFunctionCode),
        comment: `CloudFront Function: ${props.edgeFunctionFilePath}`,
      });

      return cloudFrontFunction;
    }
    
    /**
     * Create a CloudFront Function for SPA URL rewrite
     * @param props HostingProps
     * @returns cloudfront function
     */
    private createCloudFrontURLRewrite(props: HostingProps): CloudFrontFunction {
      const functionCode = `
          function handler(event) {
              var request = event.request;
              var uri = request.uri;
              
              // Check whether the URI is missing a file name.
              if (uri.endsWith('/')) {
                  request.uri += 'index.html';
              } 
              // Check whether the URI is missing a file extension.
              else if (!uri.includes('.')) {
                  request.uri += '/index.html';
              }

              return request;
          }
       `;

       const CloudFrontURLRewrite = new CloudFrontFunction(this, 'URLRewriteFunction', {
        code: CloudFrontFunctionCode.fromInline(functionCode),
        comment: `CloudFront Function: for SPA URL rewrites`,
      });

      return CloudFrontURLRewrite;
    }

    /**
     * Creates the bucket to store the static deployment asset files of your site.
     *
     * @private
     */
    private createHostingBucket(props: HostingProps) {

        // Hosting bucket access log bucket
        const originLogsBucket = new Bucket(this, "OriginLogsBucket", {
            bucketName: `${this.resourceIdPrefix}-origin-logs`,
            encryption: BucketEncryption.S3_MANAGED,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            objectOwnership: ObjectOwnership.OBJECT_WRITER,
            enforceSSL: true,
            removalPolicy: RemovalPolicy.RETAIN
        });

        // primary hosting bucket
        const bucket = new Bucket(this, "HostingBucket", {
            bucketName: `${this.resourceIdPrefix}-hosting`,
            versioned: true,
            serverAccessLogsBucket: originLogsBucket,
            enforceSSL: true,
            encryption: BucketEncryption.S3_MANAGED,
            blockPublicAccess: new BlockPublicAccess({
              blockPublicPolicy: true,
              blockPublicAcls: true,
              ignorePublicAcls: true,
              restrictPublicBuckets: true,
            }),
            removalPolicy: RemovalPolicy.RETAIN
        });

        // Setting the origin to HTTP server
        this.s3Origin = new S3Origin(bucket, {
          connectionAttempts: 2,
          connectionTimeout: Duration.seconds(3)
        });

        this.hostingBucket = bucket;
    }

    /**
     * Create the primary cloudfront distribution
     * @param props 
     * @private
     */
    private createCloudfrontDistribution(props: HostingProps) {

        // access logs bucket
        const accessLogsBucket = new Bucket(this, "AccessLogsBucket", {
            bucketName: `${this.resourceIdPrefix}-access-logs`,
            encryption: BucketEncryption.S3_MANAGED,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            objectOwnership: ObjectOwnership.OBJECT_WRITER,
            enforceSSL: true,
            removalPolicy: RemovalPolicy.RETAIN
        });
        this.accessLogsBucket = accessLogsBucket;

        // defaultCachePolicy
        const defaultCachePolicy = new CachePolicy(this, "DefaultCachePolicy", {
          cachePolicyName: `${this.resourceIdPrefix}-DefaultCachePolicy`, // "CachePolicy" + Aws.STACK_NAME + "-" + Aws.REGION,
          comment: "Default policy - " + Aws.STACK_NAME + "-" + Aws.REGION,
          defaultTtl: Duration.days(365),
          minTtl: Duration.days(365),
          maxTtl: Duration.days(365),
          cookieBehavior: CacheCookieBehavior.none(),
          headerBehavior: CacheHeaderBehavior.none(),
          queryStringBehavior: CacheQueryStringBehavior.none(),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        });
        
        // imgCachePolicy
        const imgCachePolicy = new CachePolicy(this, "ImagesCachePolicy", {
          cachePolicyName: `${this.resourceIdPrefix}-ImagesCachePolicy`, // "ImagesCachePolicy" + Aws.STACK_NAME + "-" + Aws.REGION,
          comment: "Images cache policy - " + Aws.STACK_NAME + "-" + Aws.REGION,
          defaultTtl: Duration.days(365),
          minTtl: Duration.days(365),
          maxTtl: Duration.days(365),
          cookieBehavior: CacheCookieBehavior.none(),
          headerBehavior: CacheHeaderBehavior.none(),
          queryStringBehavior: CacheQueryStringBehavior.none(),
        });
        
        // staticAssetsCachePolicy
        const staticAssetsCachePolicy = new CachePolicy(this, "StaticAssetsCachePolicy", {
          cachePolicyName: `${this.resourceIdPrefix}-StaticAssetsCachePolicy`, // "StaticAssetsCachePolicy" + Aws.STACK_NAME + "-" + Aws.REGION,
          comment: "Static assets cache policy - " + Aws.STACK_NAME + "-" + Aws.REGION,
          defaultTtl: Duration.days(365),
          minTtl: Duration.days(365),
          maxTtl: Duration.days(365),
          cookieBehavior: CacheCookieBehavior.none(),
          headerBehavior: CacheHeaderBehavior.none(),
          queryStringBehavior: CacheQueryStringBehavior.none(),
        });

        // ResponseHeadersPolicy
        const responseHeadersPolicy = new ResponseHeadersPolicy(this, "ResponseHeadersPolicy", {
            responseHeadersPolicyName: `${this.resourceIdPrefix}-ResponseHeadersPolicy`, // "ResponseHeadersPolicy" + Aws.STACK_NAME + "-" + Aws.REGION,
            comment: "ResponseHeadersPolicy" + Aws.STACK_NAME + "-" + Aws.REGION,
            securityHeadersBehavior: {
              contentTypeOptions: { override: true },
              frameOptions: {
                frameOption: HeadersFrameOption.DENY,
                override: true,
              },
              referrerPolicy: {
                referrerPolicy:
                  HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
                override: false,
              },
              strictTransportSecurity: {
                accessControlMaxAge: Duration.seconds(31536000),
                includeSubdomains: true,
                override: true,
              },
              xssProtection: { protection: true, modeBlock: true, override: true },
              
            },
            removeHeaders: ['age' , 'date'],
      });
      
      // defaultBehavior
      const defaultBehavior: BehaviorOptions = {
          origin: this.s3Origin,
          responseHeadersPolicy: responseHeadersPolicy,
          cachePolicy: defaultCachePolicy,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          functionAssociations: [
            ...(this.cloudFrontFunction ? [{
                eventType: FunctionEventType.VIEWER_REQUEST,
                function: this.cloudFrontFunction
            }] : []),
            ...(this.cloudFrontURLRewrite ? [{
                eventType: FunctionEventType.VIEWER_REQUEST,
                function: this.cloudFrontURLRewrite
            }] : [])
          ],
      };

      // imgBehaviour
      const imgBehaviour: BehaviorOptions = {
        origin: this.s3Origin,
        compress: true,
        responseHeadersPolicy: responseHeadersPolicy,
        cachePolicy: imgCachePolicy,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      };

      // staticAssetsBehaviour
      const staticAssetsBehaviour: BehaviorOptions = {
        origin: this.s3Origin,
        compress: true,
        responseHeadersPolicy: responseHeadersPolicy,
        cachePolicy: staticAssetsCachePolicy,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      };

        // finally, create distribution
        const distributionName = `${this.resourceIdPrefix}-cdn`;

        const distributionProps = {
          comment: "Stack name: " + Aws.STACK_NAME,
          enableLogging: true,
          logBucket: this.accessLogsBucket,
          defaultBehavior: defaultBehavior,
          additionalBehaviors: {
            "*.jpg": imgBehaviour,
            "*.jpeg": imgBehaviour,
            "*.png": imgBehaviour,
            "*.gif": imgBehaviour,
            "*.bmp": imgBehaviour,
            "*.tiff": imgBehaviour,
            "*.ico": imgBehaviour,
            "*.js": staticAssetsBehaviour,
            "*.css": staticAssetsBehaviour,
            "*.html": staticAssetsBehaviour,
          },
          responseHeadersPolicy: responseHeadersPolicy,
          httpVersion: HttpVersion.HTTP2_AND_3,
          minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
          defaultRootObject: "index.html",
          errorResponses: [
            {
              httpStatus: 403,
              responseHttpStatus: 200,
              responsePagePath: '/index.html',
            }
          ],
          ...(props.domain && props.globalCertificateArn
            ? {
                domainNames: [props.domain],
                certificate: Certificate.fromCertificateArn(this, `${this.resourceIdPrefix}-global-certificate`, props.globalCertificateArn),
              }
            : {}),
        }

        // Define the CloudFront distribution using `createCloudFrontDistributionForS3`
        const cloudFrontDistributionProps: CreateCloudFrontDistributionForS3Props = {
          sourceBucket: this.hostingBucket,
          cloudFrontDistributionProps: distributionProps,
          httpSecurityHeaders: true
        };

        // Creating CloudFront distribution
        // this.distribution = new Distribution(this, distributionName, distributionProps);
        const cloudFrontDistributionForS3Response: CreateCloudFrontDistributionForS3Response = createCloudFrontDistributionForS3(this, distributionName, cloudFrontDistributionProps);

        this.distribution = cloudFrontDistributionForS3Response.distribution;
        this.originAccessControl = cloudFrontDistributionForS3Response.originAccessControl;

        // Grant CloudFront permission to get the objects from the s3 bucket origin
        this.hostingBucket.addToResourcePolicy(
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['s3:GetObject'], // 's3:ListBucket' slows down deployment
            principals: [new ServicePrincipal('cloudfront.amazonaws.com')],
            resources: [`${this.hostingBucket.bucketArn}/*`],
            conditions: {
              StringEquals: {
                'AWS:SourceArn': `arn:aws:cloudfront::${Aws.ACCOUNT_ID}:distribution/${this.distribution.distributionId}`
              }
            }
          })
        );
    }

    /**
     * Resolves the hosted zone at which the DNS records shall be created to access the app on the internet.
     *
     * @param props
     * @private
     */
    private findHostedZone(props: HostingProps): IHostedZone | void {
        const domainParts = props.domain?.split('.');
        if (!domainParts) return;

        return HostedZone.fromHostedZoneAttributes(this, `${this.resourceIdPrefix}-hosted-zone`, {
            hostedZoneId: props.hostedZoneId as string,
            zoneName: domainParts[domainParts.length - 1] // Support subdomains
        });
    }

    /**
     * Creates the DNS records to access the app on the internet via the custom domain.
     *
     * @param props
     * @private
     */
    private createDnsRecords(props: HostingProps): void {
        const hostedZone = this.findHostedZone(props);
        const dnsTarget = RecordTarget.fromAlias(new CloudFrontTarget(this.distribution));

        // Create a record for IPv4
        new ARecord(this, `${this.resourceIdPrefix}-ipv4-record`, {
            recordName: props.domain,
            zone: hostedZone as IHostedZone,
            target: dnsTarget,
        });

        // Create a record for IPv6
        new AaaaRecord(this, `${this.resourceIdPrefix}-ipv6-record`, {
            recordName: props.domain,
            zone: hostedZone as IHostedZone,
            target: dnsTarget,
        });
    }

}