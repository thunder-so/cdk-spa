import { Construct } from 'constructs';
import { Rule, EventBus } from 'aws-cdk-lib/aws-events';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Role, ServicePrincipal, PolicyDocument, PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { CloudWatchLogGroup, EventBus as EventBusTarget } from 'aws-cdk-lib/aws-events-targets';

export interface EventsProps {
  debug?: boolean;
  resourceIdPrefix: string;
  codePipeline: Pipeline;
  eventTarget: string;
}

export class EventsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: EventsProps) {
    super(scope, id);

    // Create a rule to capture execution events
    const rule = new Rule(this, 'EventsRule', {
      ruleName: `${props.resourceIdPrefix}-events`,
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
        detail: {
          pipeline: [props.codePipeline.pipelineName],
          state: ["STARTED", "SUCCEEDED", "RESUMED", "FAILED", "CANCELED", "SUPERSEDED"],
        },
      }
    });

    if (props.debug) {
      // Create a CloudWatch Log Group for debugging
      const logGroup = new LogGroup(this, 'EventsLogGroup', {
        logGroupName: `/aws/events/${props.resourceIdPrefix}-pipeline`,
        removalPolicy: RemovalPolicy.DESTROY,
        retention: RetentionDays.ONE_YEAR
      });

      // Create IAM role for log group
      const logGroupEventRole = new Role(this, 'LogGroupEventRole', {
        assumedBy: new ServicePrincipal('events.amazonaws.com'),
        roleName: `${props.resourceIdPrefix}-LogGroupEventRole`,
        description: 'Role for EventBridge to write pipeline events to CloudWatch Logs'
      });

      // Grant the role permission to write to the log group
      logGroup.grantWrite(logGroupEventRole);

      // Add the log group as a target
      rule.addTarget(new CloudWatchLogGroup(logGroup));
    }

    // Create IAM role for cross-account event bus access
    const crossAccountEventRole = new Role(this, 'CrossAccountEventRole', {
      assumedBy: new ServicePrincipal('events.amazonaws.com'),
      roleName: `${props.resourceIdPrefix}-CrossAccountEventRole`,
      description: 'Role for EventBridge to write pipeline events to external Event Bus',
      inlinePolicies: {
        AllowPutEvents: new PolicyDocument({
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ['events:PutEvents'],
              resources: [props.eventTarget],
            }),
          ],
        }),
      },
    });

    // add external event bus as target
    const target = EventBus.fromEventBusArn(this, 'CrossAccountEventTarget', props.eventTarget);

    rule.addTarget(new EventBusTarget(target, {
      role: crossAccountEventRole
    }));

  }
}