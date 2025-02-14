import fs from 'fs';
import { Aws, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from "constructs";
import { Bucket, type IBucket, BlockPublicAccess, ObjectOwnership, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { Role, PolicyStatement, Effect, ServicePrincipal, AnyPrincipal, ManagedPolicy } from "aws-cdk-lib/aws-iam";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Distribution, type IDistribution, CachePolicy, SecurityPolicyProtocol, HttpVersion, ResponseHeadersPolicy, HeadersFrameOption, HeadersReferrerPolicy, type BehaviorOptions, AllowedMethods, ViewerProtocolPolicy, CacheCookieBehavior, CacheHeaderBehavior, CacheQueryStringBehavior, CfnOriginAccessControl, Function as CloudFrontFunction, FunctionCode as CloudFrontFunctionCode, FunctionEventType, OriginAccessIdentity, CachedMethods, FunctionRuntime, LambdaEdgeEventType, experimental } from "aws-cdk-lib/aws-cloudfront";
import { AaaaRecord, ARecord, HostedZone, type IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { Runtime, Code } from 'aws-cdk-lib/aws-lambda';

export interface HostingProps {
    application: string;
    service: string;
    environment: string;
    domain?: string;
    globalCertificateArn?: string;
    hostedZoneId?: string;
    redirects?: { source: string; destination: string; }[];
    rewrites?: { source: string; destination: string; }[];
    headers?: { path: string; name: string; value: string; }[];
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
     * Lambda@edge Role
     */
    private lambdaEdgeRole: Role;

    /**
     * Redirects and Rewrites CloudFront Function
     */
    private cloudFrontRedirectsRewrites: experimental.EdgeFunction;

    /**
     * Headers CloudFront Function
     */
    private cloudFrontHeaders: experimental.EdgeFunction;

    /**
     * The custom CloudFront Functions file provided
     */
    // private cloudFrontFunction: CloudFrontFunction;

    constructor(scope: Construct, id: string, props: HostingProps) {
      super(scope, id);

      this.resourceIdPrefix = `${props.application}-${props.service}-${props.environment}`.substring(0, 42);

      // Create the Origin Access Control
      this.originAccessControl = new CfnOriginAccessControl(this, 'CloudFrontOac', {
        originAccessControlConfig: {
          name: `${this.resourceIdPrefix}-OAC`,
          description: `Origin Access Control for ${this.resourceIdPrefix}`,
          originAccessControlOriginType: 's3',
          signingBehavior: 'always',
          signingProtocol: 'sigv4',
        },
      });

      /**
       * Lambda@edge
       */
      // Create the execution role for Lambda@Edge
      this.lambdaEdgeRole = new Role(this, 'LambdaEdgeExecutionRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      });

      this.lambdaEdgeRole.assumeRolePolicy?.addStatements(
        new PolicyStatement({
          effect: Effect.ALLOW,
          principals: [new ServicePrincipal('edgelambda.amazonaws.com')],
          actions: ['sts:AssumeRole'],
        })
      );

      this.lambdaEdgeRole.addManagedPolicy(
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      );

      // Create the redirects and rewrites function
      this.cloudFrontRedirectsRewrites = this.createCloudFrontRedirectsRewrites(props);

      // Create the custom response headers function
      if (props.headers) {
        this.cloudFrontHeaders = this.createCloudFrontHeaders(props);
      }

      /**
       * Create the infrastructure
       */
      // create the S3 bucket for hosting
      this.createHostingBucket(props);

      // Create the CloudFront distribution
      this.createCloudfrontDistribution(props);

      // Set the domains with Route53
      if(props.domain && props.globalCertificateArn && props.hostedZoneId) {
        this.createDnsRecords(props);
      }

      /**
       * Outputs
       */
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
     * Create a CloudFront Function for Redirects and Rewrites
     * @param props HostingProps
     * @returns cloudfront function
     */
    // Helper function to escape special regex characters
    private escapeRegex = (string: string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    private createCloudFrontRedirectsRewrites(props: HostingProps): experimental.EdgeFunction {
      const redirects = props.redirects || [];
      const rewrites = props.rewrites || [];

      // Generate redirects code
      const redirectsCode = redirects.map((rule) => {
        const params: string[] = [];

        const source = this.escapeRegex(rule.source)
          .replace(/:[^/]+/g, (match) => {
            params.push(match.substring(1));
            return '([^/]+)';
          })
          .replace(/\\\*/g, '(.*)');

        const destination = rule.destination.replace(/:[^/]+/g, (match) => {
          const paramName = match.substring(1);
          const position = params.indexOf(paramName) + 1;
          return `$${position}`;
        }).replace(/\*/g, '$1');

        return `
            if (uri.match(new RegExp('^${source}$'))) {
              console.log("Matched redirect rule: ${source} -> ${destination}");
              const response = {
                status: '301',
                statusDescription: 'Moved Permanently',
                headers: {
                  'location': [{
                    key: 'Location',
                    value: 'https://' + host + uri.replace(new RegExp('^${source}$'), '${destination}')
                  }]
                },
              };

              callback(null, response);
              return;
            }
        `;
      }).join('\n');

      // Generate rewrites code
      const rewritesCode = rewrites.map((rule) => {
        const params: string[] = [];

        const source = this.escapeRegex(rule.source)
          .replace(/:[^/]+/g, (match) => {
            params.push(match.substring(1));
            return '([^/]+)';
          })
          .replace(/\\\*/g, '(.*)');

        const destination = rule.destination.replace(/:[^/]+/g, (match) => {
          const paramName = match.substring(1);
          const position = params.indexOf(paramName) + 1;
          return `$${position}`;
        }).replace(/\*/g, '$1');
        
        return `
          if (uri.match(new RegExp('^${source}$'))) {
            request.uri = uri.replace(new RegExp('^${source}$'), '${destination}');
          }
        `;
      }).join('\n');

      const functionCode = `
        'use strict';

        exports.handler = (event, context, callback) => {
          const request = event.Records[0].cf.request;
          var uri = request.uri;
          var host = request.headers.host[0].value;

          // Handle redirects
          ${redirectsCode}
          
          // Handle rewrites
          ${rewritesCode}
          
          // Check whether the URI is missing a file name.
          if (request.uri.endsWith('/')) {
              request.uri += 'index.html';
          } 
          // Check whether the URI is missing a file extension.
          else if (!request.uri.includes('.')) {
              request.uri += '/index.html';
          }

          callback(null, request);
        };
      `;

      const cloudFrontRedirectsRewrites = new experimental.EdgeFunction(this, 'RedirectRewriteFunction', {
        code: Code.fromInline(functionCode),
        runtime: Runtime.NODEJS_18_X,
        handler: 'index.handler',
        role: this.lambdaEdgeRole
      });

      return cloudFrontRedirectsRewrites;
    }

    /**
     * Create a CloudFront Function for Custom Headers
     * @param props HostingProps
     * @returns cloudfront function
     */
    private createCloudFrontHeaders(props: HostingProps): experimental.EdgeFunction {
      const headers = props.headers || [];
    
      // Generate the Lambda function code with the headers embedded
      const functionCode = `
        exports.handler = async (event) => {
          const { request, response } = event.Records[0].cf;
          const uri = request.uri;

          const headersConfig = ${JSON.stringify(headers)};

          const convertPathToRegex = (pattern) => {
            // First handle the file extension pattern with braces
            let regex = pattern.replace(/{([^}]+)}/g, (match, group) => {
              return '(' + group.split(',').join('|') + ')';
            });
            
            // Replace * with non-greedy match that doesn't include slashes
            regex = regex.replace(/\\*/g, '[^/]*');
            
            // Escape special characters in the pattern, preserving forward slashes
            regex = regex.split('/').map(part => 
              part.replace(/[.+^$()|\[\]]/g, '\\$&')
            ).join('/');
            
            return regex;
          };

          headersConfig.forEach((header) => {
            const regex = new RegExp(convertPathToRegex(header.path));
            if (regex.test(uri)) {
              const headerName = header.name.toLowerCase();
              const headerValue = header.value;
              response.headers[headerName] = [{ key: header.name, value: headerValue }];
            }
          });

          return response;
        };
      `;
    
      // Create and return the Edge Function
      const cloudFrontHeadersFunction = new experimental.EdgeFunction(this, 'HeadersFunction', {
        code: Code.fromInline(functionCode),
        runtime: Runtime.NODEJS_18_X,
        handler: 'index.handler',
        role: this.lambdaEdgeRole
      });

      // Create a version for Lambda@Edge
      return cloudFrontHeadersFunction;
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
          removalPolicy: RemovalPolicy.DESTROY,
          autoDeleteObjects: true
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
          connectionTimeout: Duration.seconds(3),
          originId: `${this.resourceIdPrefix}-s3origin`
        });

        // Update the bucket policy to allow access from the OAC
        bucket.addToResourcePolicy(
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['s3:GetObject'],
            principals: [new AnyPrincipal()],
            resources: [`${bucket.bucketArn}/*`],
            conditions: {
              StringEquals: {
                'AWS:SourceArn': `arn:aws:cloudfront::${Aws.ACCOUNT_ID}:origin-access-control/${this.originAccessControl?.attrId}`,
                'aws:SourceAccount': Aws.ACCOUNT_ID,
              },
            },
          })
        );

        // Give the edge lambdas permission to access hosting bucket
        this.lambdaEdgeRole.addToPolicy(new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['s3:GetObject'],
          resources: [`${bucket.bucketArn}/*`],
        }));

        this.hostingBucket = bucket;
    }

    /**
     * Create the primary cloudfront distribution
     * @param props 
     * @private
     */
    private createCloudfrontDistribution(props: HostingProps) {

        // access logs bucket
        this.accessLogsBucket = new Bucket(this, "AccessLogsBucket", {
          bucketName: `${this.resourceIdPrefix}-access-logs`,
          encryption: BucketEncryption.S3_MANAGED,
          blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
          objectOwnership: ObjectOwnership.OBJECT_WRITER,
          enforceSSL: true,
          removalPolicy: RemovalPolicy.DESTROY,
          autoDeleteObjects: true
        });

        // defaultCachePolicy
        const defaultCachePolicy = new CachePolicy(this, "DefaultCachePolicy", {
          cachePolicyName: `${this.resourceIdPrefix}-DefaultCachePolicy`,
          comment: 'Cache policy for HTML documents with short TTL',
          defaultTtl: Duration.minutes(1),
          minTtl: Duration.seconds(0),
          maxTtl: Duration.minutes(1),
          headerBehavior: CacheHeaderBehavior.none(),
          cookieBehavior: CacheCookieBehavior.none(),
          queryStringBehavior: CacheQueryStringBehavior.none(),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        });
        
        const staticAssetsCachePolicy = new CachePolicy(this, 'StaticAssetsCachePolicy', {
          cachePolicyName: `${this.resourceIdPrefix}-StaticAssetsCachePolicy`,
          comment: 'Cache policy for static assets with long TTL',
          defaultTtl: Duration.days(365),
          minTtl: Duration.days(1),
          maxTtl: Duration.days(365),
          headerBehavior: CacheHeaderBehavior.none(),
          cookieBehavior: CacheCookieBehavior.none(),
          queryStringBehavior: CacheQueryStringBehavior.none(),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        });

        // ResponseHeadersPolicy
        const responseHeadersPolicy = new ResponseHeadersPolicy(this, "ResponseHeadersPolicy", {
          responseHeadersPolicyName: `${this.resourceIdPrefix}-ResponseHeadersPolicy`,
          comment: "ResponseHeadersPolicy" + Aws.STACK_NAME + "-" + Aws.REGION,
          securityHeadersBehavior: {              
            contentSecurityPolicy: {
              contentSecurityPolicy: "default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
              override: true,
            },
            strictTransportSecurity: {
              accessControlMaxAge: Duration.days(365),
              includeSubdomains: true,
              preload: true,
              override: true,
            },
            contentTypeOptions: {
              override: true,
            },
            referrerPolicy: {
              referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
              override: true,
            },
            frameOptions: {
              frameOption: HeadersFrameOption.DENY,
              override: true,
            },
            xssProtection: { 
              protection: true, 
              modeBlock: true, 
              override: true 
            }
          },
          corsBehavior: {
            accessControlAllowCredentials: false,
            accessControlAllowHeaders: ['*'],
            accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS'],
            accessControlAllowOrigins: ['*'],
            accessControlExposeHeaders: [],
            accessControlMaxAge: Duration.seconds(600),
            originOverride: true,
          },
          customHeadersBehavior: {
            customHeaders: []
          },
          removeHeaders: ['server', 'age' , 'date'],
        });
      
        // defaultBehavior
        const defaultBehavior: BehaviorOptions = {
          origin: this.s3Origin,
          compress: true,
          responseHeadersPolicy: responseHeadersPolicy,
          cachePolicy: defaultCachePolicy,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          edgeLambdas: [
            ...(this.cloudFrontRedirectsRewrites ? [{
              eventType: LambdaEdgeEventType.VIEWER_REQUEST,
              functionVersion: this.cloudFrontRedirectsRewrites.currentVersion,
            }] : []),
            ...(this.cloudFrontHeaders ? [{
              eventType: LambdaEdgeEventType.VIEWER_RESPONSE,
              functionVersion: this.cloudFrontHeaders.currentVersion,
            }] : []),
          ],
        };

        // staticAssetsBehaviour
        const staticAssetsBehaviour: BehaviorOptions = {
          origin: this.s3Origin,
          compress: true,
          responseHeadersPolicy: responseHeadersPolicy,
          cachePolicy: staticAssetsCachePolicy,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        };

        // finally, create distribution
        const distributionName = `${this.resourceIdPrefix}-cdn`;

        const distributionProps = {
          comment: "Stack name: " + Aws.STACK_NAME,
          enableLogging: true,
          logBucket: this.accessLogsBucket,
          defaultBehavior: defaultBehavior,
          additionalBehaviors: {
            "*.jpg": staticAssetsBehaviour,
            "*.jpeg": staticAssetsBehaviour,
            "*.png": staticAssetsBehaviour,
            "*.gif": staticAssetsBehaviour,
            "*.bmp": staticAssetsBehaviour,
            "*.tiff": staticAssetsBehaviour,
            "*.ico": staticAssetsBehaviour,
            "*.js": staticAssetsBehaviour,
            "*.css": staticAssetsBehaviour
          },
          responseHeadersPolicy: responseHeadersPolicy,
          httpVersion: HttpVersion.HTTP2_AND_3,
          minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
          defaultRootObject: "index.html",
          errorResponses: [
            {
              httpStatus: 403,
              responseHttpStatus: 200,
              ttl: Duration.seconds(0),
              responsePagePath: '/index.html',
            },
            {
              httpStatus: 404,
              responseHttpStatus: 200,
              ttl: Duration.seconds(0),
              responsePagePath: '/index.html',
            },
          ],
          ...(props.domain && props.globalCertificateArn
            ? {
                domainNames: [props.domain],
                certificate: Certificate.fromCertificateArn(this, `${this.resourceIdPrefix}-global-certificate`, props.globalCertificateArn),
              }
            : {}),
        }

        // Creating CloudFront distribution
        this.distribution = new Distribution(this, distributionName, distributionProps);

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