import fs from 'fs';
import yaml from "yaml";
import { Construct } from "constructs";
import { Aws, Duration, RemovalPolicy, CfnOutput, SecretValue, CfnParameter } from 'aws-cdk-lib';
import { PolicyStatement, Effect, ArnPrincipal, Role, ServicePrincipal, PolicyDocument } from 'aws-cdk-lib/aws-iam';
import { Bucket, type IBucket, BlockPublicAccess, ObjectOwnership, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { Project, PipelineProject, LinuxBuildImage, ComputeType, Source, BuildSpec, BuildEnvironmentVariable, BuildEnvironmentVariableType } from "aws-cdk-lib/aws-codebuild";
import { Artifact, Pipeline, PipelineType, Variable } from 'aws-cdk-lib/aws-codepipeline';
import { GitHubSourceAction, GitHubTrigger, CodeBuildAction, S3DeployAction, LambdaInvokeAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import { EventBus, Rule, type IRuleTarget, RuleTargetInput, EventField, Connection, Authorization, ApiDestination, HttpMethod } from 'aws-cdk-lib/aws-events';
import { LambdaFunction as LambdaFunctionTarget, CloudWatchLogGroup, EventBus as EventBusTarget, ApiDestination as ApiDestinationTarget } from 'aws-cdk-lib/aws-events-targets';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';

export interface PipelineProps {
  HostingBucket: IBucket;
  Distribution: IDistribution;

  application: string;
  service: string;
  environment: string;

  // source
  sourceProps: {
    owner: string;
    repo: string;
    branchOrRef: string;
    rootdir: string;
  };
  githubAccessTokenArn: string;

  // build
  buildSpecFilePath?: string;
  buildProps?: {
    runtime: number;
    installcmd: string;
    buildcmd: string;
    outputdir: string;
  };
  buildEnvironmentVariables?: Record<string, { value: string; type: BuildEnvironmentVariableType.PARAMETER_STORE }>;

  // events
  eventTarget: string;
  serviceId: string;
  environmentId: string;
}

export class PipelineConstruct extends Construct {

  private resourceIdPrefix: string;

  /**
   * The buildstep
   */
  public codeBuildProject: Project;

  /**
   * The CodePipeline pipeline
   */
  public codePipeline: Pipeline;

  /**
   * Deployment action as a CodeBuild Project
   */
  private syncAction: Project;

  /**
   * The Pipeline SourceAction commit hash
   */
  private commitId: string;

  /**
   * The Pipeline BuildAction id
   */
  private buildId: string;

  /**
   * The build output bucket
   */
  public buildOutputBucket: IBucket;


  constructor(scope: Construct, id: string, props: PipelineProps) {
    super(scope, id);

    this.resourceIdPrefix = `${props.application}-${props.service}-${props.environment}`;

    // output bucket
    this.buildOutputBucket = new Bucket(this, "BuildOutputBucket", {
      bucketName: `${this.resourceIdPrefix}-output`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // create build project
    this.codeBuildProject = this.createBuildProject(props);
  
    // create pipeline
    this.codePipeline = this.createPipeline(props);

    // Check if event params are provided and create events broadcast
    if (props.serviceId && props.environmentId && props.eventTarget) {
      this.createEventsBroadcast(props);
    }

    // Create an output for the pipeline's name
    new CfnOutput(this, 'PipelineName', {
      value: this.codePipeline.pipelineName,
      description: 'The name of the CodePipeline pipeline',
      exportName: `${this.resourceIdPrefix}-CodePipelineName`,
    });

  }


  /**
   * Configure a codebuild project to run a shell command 
   * @param props 
   * 
   */
  private setupSyncAction(props: PipelineProps): Project {

    // set up role for project
    const syncActionRole = new Role(this, 'SyncActionRole', {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
    });

    // allow role to create cloudfront invalidations
    syncActionRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['cloudfront:CreateInvalidation'],
        resources: [`arn:aws:cloudfront::${props.Distribution.stack.account}:distribution/${props.Distribution.distributionId}`],
      })
    );

    // codebuild project to run shell commands
    const buildSpec = BuildSpec.fromObject({
      version: '0.2',
      phases: {
        build: {
          commands: [
            // 'echo "Commit ID: $COMMIT_ID"',
            // 'echo "Build ID: $BUILD_ID"',
            // 'echo "Output Bucket: $OUTPUT_BUCKET"',
            // 'echo "Hosting Bucket: $HOSTING_BUCKET"',
            'aws s3 cp s3://$OUTPUT_BUCKET/$COMMIT_ID/ s3://$HOSTING_BUCKET/ --recursive --metadata revision=$COMMIT_ID',
            'aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*"'
          ],
        },
      },
    });
    
    const project = new PipelineProject(this, 'SyncActionProject', {
      projectName: `${this.resourceIdPrefix}-syncActionProject`,
      buildSpec: buildSpec,
      environment: {
        buildImage: LinuxBuildImage.STANDARD_5_0,
        computeType: ComputeType.SMALL,
      },
      role: syncActionRole,
      environmentVariables: {
        CLOUDFRONT_DISTRIBUTION_ID: { value: props.Distribution.distributionId },
        HOSTING_BUCKET: { value: props.HostingBucket.bucketName },
        OUTPUT_BUCKET: { value: this.buildOutputBucket.bucketName },
        COMMIT_ID: { value: this.commitId },
        BUILD_ID: { value: this.buildId }
      },
    });

    // Allow project to read from the output bucket
    project.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["s3:ListBucket", "s3:GetObject", "s3:PutObject"],
        resources: [
          this.buildOutputBucket.bucketArn,
          `${this.buildOutputBucket.bucketArn}/*`
        ],
      })
    );

    this.buildOutputBucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ArnPrincipal(project.role?.roleArn as string)],
        actions: ["s3:ListBucket", "s3:GetObject", "s3:PutObject"],
        resources: [
          this.buildOutputBucket.bucketArn,
          `${this.buildOutputBucket.bucketArn}/*`
        ],
      })
    );

    // Allow project to write to the hosting bucket
    project.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["s3:ListBucket", "s3:GetObject", "s3:PutObject"],
        resources: [
          props.HostingBucket.bucketArn,
          `${props.HostingBucket.bucketArn}/*`
        ],
      })
    );

    // Grant project read/write permissions on hosting bucket
    props.HostingBucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ArnPrincipal(project.role?.roleArn as string)],
        actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
        resources: [
          props.HostingBucket.bucketArn,
          `${props.HostingBucket.bucketArn}/*`
        ],
      })
    );

    return project;
  }
  
  /**
   * Create CodeBuild Project
   * @param props 
   * @returns project
   */
  private createBuildProject(props: PipelineProps): Project {

    // build logs bucket
    const buildLogsBucket = new Bucket(this, "BuildLogsBucket", {
      bucketName: `${this.resourceIdPrefix}-build-logs`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Read the buildspec.yml file
    let buildSpecYaml;
    if (props.buildSpecFilePath) {
      let buildSpecFile;
      try {
        buildSpecFile = fs.readFileSync(props.buildSpecFilePath, "utf8");
      } catch (error) {
        throw new Error(`Failed to read build spec file at ${props.buildSpecFilePath}: ${error}`);
      }
      const yamlFile = yaml.parse(buildSpecFile);
      buildSpecYaml = BuildSpec.fromObject(yamlFile);
    } else {
      buildSpecYaml = BuildSpec.fromObject({
        version: '0.2',
        env: {
          'exported-variables': ['CODEBUILD_BUILD_ID']
        },
        phases: {
            install: {
                'runtime-versions': {
                    nodejs: props.buildProps?.runtime || '20'
                },
                commands: [ 
                  `cd ${props.sourceProps?.rootdir || './'}`,
                  props.buildProps?.installcmd || 'npm install'
                ]
            },
            build: {
                commands: [ props.buildProps?.buildcmd || 'npm run build'],
            },
        },
        artifacts: {
            files: ['**/*'],
            'base-directory': `${props.sourceProps.rootdir}${props.buildProps?.outputdir}` 
        }
      })
    }

    // environment variables
    const buildEnvironmentVariables = Object.entries(props.buildEnvironmentVariables || {}).reduce(
      (acc, [name, { value }]) => {
        if (typeof value === 'string') {
          acc[name] = { value, type: BuildEnvironmentVariableType.PARAMETER_STORE };
        }
        return acc;
      },
      {} as Record<string, { value: string; type: BuildEnvironmentVariableType.PARAMETER_STORE }>
    );
    
    // create the cloudbuild project
    const project = new PipelineProject(this, "CodeBuildProject", {
      projectName: `${this.resourceIdPrefix}-buildproject`,
      buildSpec: buildSpecYaml,
      timeout: Duration.minutes(10),
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        computeType: ComputeType.MEDIUM,
        privileged: true,
      },
      environmentVariables: buildEnvironmentVariables,
      logging: {
        s3: {
          bucket: buildLogsBucket
        }
      }
    });

    // allow project to get secrets
    project.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [props.githubAccessTokenArn]
      })
    );

    // allow project to get SSM parameters
    project.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ssm:GetParameters"],
        resources: ["arn:aws:ssm:*:*:parameter/*"]
      })
    );

    // Grant project permission to write files in output bucket
    this.buildOutputBucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["s3:PutObject"],
        resources: [`${this.buildOutputBucket.bucketArn}/*`],
        principals: [new ArnPrincipal(project.role?.roleArn!)],
      })
    );

    // Grant project read/write permissions on hosting bucket
    props.HostingBucket.grantReadWrite(project.grantPrincipal);

    return project;
  }

  /**
   * Create the CodePipeline
   * @param props 
   * @returns pipeline
   */
  private createPipeline(props: PipelineProps): Pipeline {

    // build artifact bucket
    const artifactBucket = new Bucket(this, "ArtifactBucket", {
      bucketName: `${this.resourceIdPrefix}-artifacts`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // setup the pipeline
    const pipeline = new Pipeline(this, "Pipeline", {
      artifactBucket: artifactBucket,
      pipelineName: `${this.resourceIdPrefix}-pipeline`,
      crossAccountKeys: false,
      pipelineType: PipelineType.V2
    });

    // Allow pipeline to read secrets
    pipeline.role.addToPrincipalPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [props.githubAccessTokenArn]
      })
    );

    // Allow pipeline to read from the artifact bucket
    artifactBucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["s3:GetObject"],
        resources: [`${artifactBucket.bucketArn}/*`],
        principals: [new ArnPrincipal(pipeline.role.roleArn)],
      })
    );

    // Allow pipeline to write to the build output bucket
    this.buildOutputBucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["s3:PutObject"],
        resources: [`${this.buildOutputBucket.bucketArn}/*`],
        principals: [new ArnPrincipal(pipeline.role.roleArn)],
      })
    );

    // Allow pipeline to write to the hosting bucket
    props.HostingBucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["s3:PutObject"],
        resources: [`${props.HostingBucket.bucketArn}/*`],
        principals: [new ArnPrincipal(pipeline.role.roleArn)],
      })
    );

    // Source Step
    const sourceOutput = new Artifact();
    const buildOutput = new Artifact();

    const sourceAction = new GitHubSourceAction({
      actionName: 'GithubSourceAction',
      owner: props.sourceProps.owner,
      repo: props.sourceProps.repo,
      branch: props.sourceProps.branchOrRef,
      oauthToken: SecretValue.secretsManager(props.githubAccessTokenArn),
      output: sourceOutput,
      trigger: GitHubTrigger.WEBHOOK
    });
    
    pipeline.addStage({
      stageName: "Source",
      actions: [sourceAction],
    });

    // extract the commitId from the sourceAction
    this.commitId = sourceAction.variables.commitId as string;

    // Build Step
    const buildAction = new CodeBuildAction({
      actionName: 'BuildAction',
      project: this.codeBuildProject,
      input: sourceOutput,
      outputs: [buildOutput],
      runOrder: 2,
    });

    pipeline.addStage({
      stageName: "Build",
      actions: [buildAction],
    });

    // extract the buildId from the buildAction
    this.buildId = buildAction.variable('CODEBUILD_BUILD_ID');

    // Deploy Step
    const deployAction = new S3DeployAction({
      actionName: 'DeployAction',
      input: buildOutput,
      bucket: this.buildOutputBucket,
      objectKey: this.commitId, // store in commit hash directories
      runOrder: 3,
    });

    // Deploy directly to Hosting Bucket
    // const deployAction = new S3DeployAction({
    //   actionName: 'DeployAction',
    //   input: buildOutput,
    //   bucket: props.HostingBucket,
    //   runOrder: 3,
    // });

    this.syncAction = this.setupSyncAction(props);

    // Post deploy: sync, invalidate
    const syncAction = new CodeBuildAction({
      actionName: 'SyncAction',
      project: this.syncAction,
      input: buildOutput,
      runOrder: 4,
      environmentVariables: {
        COMMIT_ID: { value: this.commitId },
        BUILD_ID: { value: this.buildId }
      }
    });

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [deployAction, syncAction]
    });

    // return our pipeline
    return pipeline;
  }


  /**
   * Create Events Broadcast
   * @param eventTarget 
   */
  private createEventsBroadcast(props: PipelineProps) {
    // Create a CloudWatch Log Group for debugging
    const logGroup = new LogGroup(this, 'EventsLogGroup', {
      logGroupName: `/aws/events/${this.resourceIdPrefix}-pipeline`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_YEAR
    });

    // Create IAM role for EventBridge
    const eventRuleRole = new Role(this, 'EventsRuleRole', {
      assumedBy: new ServicePrincipal('events.amazonaws.com'),
      description: 'Role for EventBridge to write pipeline events to CloudWatch Logs'
    });

    // Grant the role permission to write to the log group
    logGroup.grantWrite(eventRuleRole);

    // Create a rule to capture execution events
    const rule = new Rule(this, 'EventsRule', {
      ruleName: `${this.resourceIdPrefix}-events`,
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
        detail: {
          pipeline: [this.codePipeline.pipelineName],
          state: ["STARTED", "SUCCEEDED", "RESUMED", "FAILED", "CANCELED", "SUPERSEDED"],
        },
      }
    });

    // Add the log group as a target
    rule.addTarget(new CloudWatchLogGroup(logGroup));

    // // Create a connection with target
    // const connection = new Connection(this, 'EventsConnection', {
    //   authorization: Authorization.basic(props.environmentId, SecretValue.secretsManager(props.githubAccessTokenArn)),
    //   description: 'Connection for API Destination with credentials',
    // });

    // // Create the API destination
    // const apiDestination = new ApiDestination(this, 'EventsAPI', {
    //   connection,
    //   endpoint: props.eventTarget,
    //   httpMethod: HttpMethod.POST
    // });

    // const eventTransformer = RuleTargetInput.fromObject({
    //   environmentId: props.environmentId,
    //   serviceId: props.serviceId,
    //   metadata: EventField.fromPath('$')
    // })

    // // Add the API destination as a target
    // rule.addTarget(new ApiDestinationTarget(apiDestination, {
    //   event: eventTransformer,
    //   retryAttempts: 0
    // }));

  }
}