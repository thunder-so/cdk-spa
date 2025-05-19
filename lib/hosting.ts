import { Aws, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from "constructs";
import { Bucket, type IBucket, BlockPublicAccess, ObjectOwnership, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { Role, PolicyStatement, Effect, ServicePrincipal, AnyPrincipal, ManagedPolicy } from "aws-cdk-lib/aws-iam";
import { Distribution, CachePolicy, SecurityPolicyProtocol, HttpVersion, ResponseHeadersPolicy, HeadersFrameOption, HeadersReferrerPolicy, type BehaviorOptions, AllowedMethods, ViewerProtocolPolicy, CacheCookieBehavior, CacheHeaderBehavior, CacheQueryStringBehavior, CfnOriginAccessControl, CachedMethods, LambdaEdgeEventType, AccessLevel, IOrigin, experimental } from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { AaaaRecord, ARecord, HostedZone, type IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { Runtime, Code } from 'aws-cdk-lib/aws-lambda';

export interface HostingProps {
    readonly debug?: boolean;
    readonly resourceIdPrefix: string;
    readonly domain?: string;
    readonly globalCertificateArn?: string;
    readonly hostedZoneId?: string;
    readonly errorPagePath?: string;
    readonly redirects?: { source: string; destination: string; }[];
    readonly rewrites?: { source: string; destination: string; }[];
    readonly headers?: { path: string; name: string; value: string; }[];
    readonly allowHeaders?: string[];
    readonly allowCookies?: string[];
    readonly allowQueryParams?: string[];
    readonly denyQueryParams?: string[];
}

export class HostingConstruct extends Construct {

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
    public distribution:  Distribution;

    /**
     * The CloudFront distribution origin that routes to S3 HTTP server.
     */
    private s3Origin: IOrigin;

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


    constructor(scope: Construct, id: string, props: HostingProps) {
      super(scope, id);

      // create the S3 bucket for hosting
      this.hostingBucket = this.createHostingBucket(props);

      /**
       * Lambda@edge
       */
      // Create the Lambda@edge role
      this.lambdaEdgeRole = this.createLambdaEdgeRole();

      // Create the redirects and rewrites function
      this.cloudFrontRedirectsRewrites = this.createCloudFrontRedirectsRewrites(props);

      // Create the custom response headers function
      if (props.headers) {
        this.cloudFrontHeaders = this.createCloudFrontHeaders(props);
      }

      /**
       * Create the CDN
       */
      // Create the CloudFront distribution
      this.distribution = this.createCloudfrontDistribution(props);

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
        exportName: `${props.resourceIdPrefix}-CloudFrontDistributionId`,
      });

      // Create an output for the distribution's URL
      new CfnOutput(this, 'DistributionUrl', {
        value: `https://${this.distribution.distributionDomainName}`,
        description: 'The URL of the CloudFront distribution',
        exportName: `${props.resourceIdPrefix}-CloudFrontDistributionUrl`,
      });
    }

    /**
     * Creates the bucket to store the static deployment asset files of your site.
     *
     * @private
     */
    private createHostingBucket(props: HostingProps): Bucket {

        // Hosting bucket access log bucket
        const originLogsBucket = props.debug
          ? new Bucket(this, "OriginLogsBucket", {
            bucketName: `${props.resourceIdPrefix}-origin-logs`,
            encryption: BucketEncryption.S3_MANAGED,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            objectOwnership: ObjectOwnership.OBJECT_WRITER,
            enforceSSL: true,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true
          })
          : undefined;

        // primary hosting bucket
        const bucket = new Bucket(this, "Bucket", {
          bucketName: `${props.resourceIdPrefix}-hosting`,
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
        // this.s3Origin = new S3Origin(bucket, {
        //   connectionAttempts: 2,
        //   connectionTimeout: Duration.seconds(3),
        //   originId: `${props.resourceIdPrefix}-s3origin`
        // });

        // Create the Origin Access Control
        this.originAccessControl = new CfnOriginAccessControl(this, 'CloudFrontOac', {
          originAccessControlConfig: {
            name: `${props.resourceIdPrefix}-OAC`,
            description: `Origin Access Control for ${props.resourceIdPrefix}`,
            originAccessControlOriginType: 's3',
            signingBehavior: 'always',
            signingProtocol: 'sigv4',
          },
        });

        this.s3Origin = S3BucketOrigin.withOriginAccessControl(bucket, {
          originId: `${props.resourceIdPrefix}-s3origin`,
          originAccessLevels: [ AccessLevel.READ ],
          originAccessControlId: this.originAccessControl?.attrId,
        });

        // Update the bucket policy to allow access from CloudFront via OAC
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

        return bucket;
    }

    /**
     * Create Lambda@edge Role
     * @private
     */
    private createLambdaEdgeRole(): Role {
      // Create the execution role for Lambda@Edge
      const lambdaEdgeRole = new Role(this, 'LambdaEdgeExecutionRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      });

      lambdaEdgeRole.assumeRolePolicy?.addStatements(
        new PolicyStatement({
          effect: Effect.ALLOW,
          principals: [new ServicePrincipal('edgelambda.amazonaws.com')],
          actions: ['sts:AssumeRole'],
        })
      );

      lambdaEdgeRole.addManagedPolicy(
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      );

      // Give the edge lambdas permission to access hosting bucket
      lambdaEdgeRole.addToPolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetObject'],
        resources: [`${this.hostingBucket.bucketArn}/*`],
      }));

      return lambdaEdgeRole;
    }

    /**
     * Create a Lambda@Edge Function for Redirects and Rewrites
     * @param props HostingProps
     * 
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
     * Create a Lambda@Edge Function for Custom Headers
     * @param props HostingProps
     * 
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
     * Create the primary cloudfront distribution
     * @param props 
     * @private
     */
    private createCloudfrontDistribution(props: HostingProps): Distribution {

        // access logs bucket
        this.accessLogsBucket = props.debug
          ? new Bucket(this, "AccessLogsBucket", {
            bucketName: `${props.resourceIdPrefix}-access-logs`,
            encryption: BucketEncryption.S3_MANAGED,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            objectOwnership: ObjectOwnership.OBJECT_WRITER,
            enforceSSL: true,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true
          })
          : undefined;

        /**
         * Response Headers Policy
         * This policy is used to set default security headers for the CloudFront distribution.
         */
        const responseHeadersPolicy = new ResponseHeadersPolicy(this, "ResponseHeadersPolicy", {
          responseHeadersPolicyName: `${props.resourceIdPrefix}-ResponseHeadersPolicy`,
          comment: "ResponseHeadersPolicy" + Aws.STACK_NAME + "-" + Aws.REGION,
          securityHeadersBehavior: {              
            contentSecurityPolicy: {
              // contentSecurityPolicy: "default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:",
              contentSecurityPolicy: "default-src 'self'; style-src https: 'unsafe-inline'; script-src https: 'unsafe-inline' 'wasm-unsafe-eval'; font-src https: 'unsafe-inline'; connect-src https: wss: 'unsafe-inline'; img-src https: data:; base-uri 'self'; form-action 'self';",
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

        /**
         * The default cache policy for HTML documents with short TTL.
         * This policy is used for the default behavior of the CloudFront distribution.
         */
        const defaultCachePolicy = new CachePolicy(this, "DefaultCachePolicy", {
          cachePolicyName: `${props.resourceIdPrefix}-DefaultCachePolicy`,
          comment: 'Cache policy for HTML documents with short TTL',
          defaultTtl: Duration.minutes(1),
          minTtl: Duration.seconds(0),
          maxTtl: Duration.minutes(1),
          headerBehavior: props.allowHeaders?.length
            ? CacheHeaderBehavior.allowList(...props.allowHeaders)
            : CacheHeaderBehavior.none(),
          cookieBehavior: props.allowCookies?.length
            ? CacheCookieBehavior.allowList(...props.allowCookies)
            : CacheCookieBehavior.none(),
          queryStringBehavior: props.allowQueryParams?.length 
            ? CacheQueryStringBehavior.allowList(...props.allowQueryParams) 
            : (props.denyQueryParams?.length 
              ? CacheQueryStringBehavior.denyList(...props.denyQueryParams) 
              : CacheQueryStringBehavior.none()),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        });
      
        /**
         * The default behavior for the CloudFront distribution.
         * This behavior is used for the default behavior of the CloudFront distribution.
         */
        const defaultBehavior: BehaviorOptions = {
          origin: this.s3Origin,
          compress: true,
          responseHeadersPolicy: responseHeadersPolicy,
          cachePolicy: defaultCachePolicy,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: CachedMethods.CACHE_GET_HEAD,
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
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

        // Additional behaviors
        const additionalBehaviors: { [pathPattern: string]: BehaviorOptions } = {};

        /**
         * The behavior for static assets.
         * It is configured to cache static assets for a longer period of time.
         * Using a managed cache policy CACHING_OPTIMIZED.
         * Using a managed response headers policy: CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT
         */
        const staticAssetsBehaviour: BehaviorOptions = {
          origin: this.s3Origin,
          compress: true,
          responseHeadersPolicy: ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        };

        // Add static asset behaviors
        const staticAssetPatterns = [
          '*.png',
          '*.jpg',
          '*.jpeg',
          '*.gif',
          '*.ico',
          '*.css',
          '*.js',
        ];
        
        for (const pattern of staticAssetPatterns) {
          additionalBehaviors[pattern] = staticAssetsBehaviour;
        }
    
        /**
         * Create CloudFront Distribution
         * 
         */
        const distributionName = `${props.resourceIdPrefix}-cdn`;

        const distributionProps = {
          comment: "Stack name: " + Aws.STACK_NAME,
          enableLogging: props.debug ? true : false,
          logBucket: props.debug ? this.accessLogsBucket : undefined,
          defaultBehavior: defaultBehavior,
          additionalBehaviors: additionalBehaviors,
          responseHeadersPolicy: responseHeadersPolicy,
          httpVersion: HttpVersion.HTTP3,
          minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
          defaultRootObject: "index.html",
          errorResponses: [
            {
              httpStatus: 404,
              responseHttpStatus: 404,
              ttl: Duration.seconds(0),
              responsePagePath: props.errorPagePath || '/index.html',
            },
          ],
          ...(props.domain && props.globalCertificateArn
            ? {
                domainNames: [props.domain],
                certificate: Certificate.fromCertificateArn(this, `${props.resourceIdPrefix}-global-certificate`, props.globalCertificateArn),
              }
            : {}),
        }

        // Creating CloudFront distribution
        return new Distribution(this, distributionName, distributionProps);
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

        return HostedZone.fromHostedZoneAttributes(this, `${props.resourceIdPrefix}-hosted-zone`, {
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
        new ARecord(this, `${props.resourceIdPrefix}-ipv4-record`, {
            recordName: props.domain,
            zone: hostedZone as IHostedZone,
            target: dnsTarget,
        });

        // Create a record for IPv6
        new AaaaRecord(this, `${props.resourceIdPrefix}-ipv6-record`, {
            recordName: props.domain,
            zone: hostedZone as IHostedZone,
            target: dnsTarget,
        });
    }

}