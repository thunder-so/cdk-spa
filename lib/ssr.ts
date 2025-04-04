import { Aws, Stack, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Function, FunctionUrl, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { join } from 'path';
import { Architecture, Tracing, FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface SSRProps {
  readonly debug?: boolean;
  readonly resourceIdPrefix: string;
  readonly ssrProps?: {
    entrypoint?: string;
    outputdir?: string;
    routes?: string[];
    environmentVariables?: { key: string; resource: string; }[];
    memorySize?: number;
    timeout?: number;
  };
  readonly ssrEnvironmentVariables?: { key: string; resource: string; }[];
}

export class SSRConstruct extends Construct {
  public readonly ssrLambdaFunction: Function;
  public readonly ssrLambdaFunctionUrl: FunctionUrl;

  constructor(scope: Construct, id: string, props: SSRProps) {
    super(scope, id);

    // Create the SSR Lambda function
    this.ssrLambdaFunction = new Function(this, 'SsrLambdaFunction', {
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      handler: props.ssrProps?.entrypoint ?? 'index.handler',
      code: Code.fromAsset(props.ssrProps?.outputdir!, {
        exclude: ['**.svg', '**.ico', '**.png', '**.jpg', '**.js.map'],
      }),
      memorySize: props.ssrProps?.memorySize ?? 1792,
      timeout: Duration.seconds(props.ssrProps?.timeout ?? 10),
      logRetention: RetentionDays.ONE_MONTH,
      allowPublicSubnet: false,
      tracing: props.debug ? Tracing.ACTIVE : Tracing.DISABLED,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    // Add environment variables from ssrEnvironmentVariables
    if (props.ssrEnvironmentVariables && props.ssrEnvironmentVariables.length > 0) {
      for (const envVar of props.ssrEnvironmentVariables) {
        const parameter = StringParameter.fromStringParameterAttributes(this, `EnvVar-${envVar.key}`, {
          parameterName: envVar.resource,
        });
        this.ssrLambdaFunction.addEnvironment(envVar.key, parameter.stringValue);

        // Grant permission to read the parameter
        parameter.grantRead(this.ssrLambdaFunction);
      }
    }

    // Enable a Function URL
    this.ssrLambdaFunctionUrl = this.ssrLambdaFunction.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });

    // Add IAM policy to read parameters
    this.ssrLambdaFunction.addToRolePolicy(new PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: props.ssrEnvironmentVariables?.map(envVar => `arn:aws:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${envVar.resource}`),
    }));

    // Create an output for the Lambda function URL
    new CfnOutput(this, 'ssrFunctionUrl', {
      value: this.ssrLambdaFunctionUrl.url,
      description: 'The URL of the SSR Lambda function',
      exportName: `${props.resourceIdPrefix}-SSRFunctionUrl`,
    });

  }
}