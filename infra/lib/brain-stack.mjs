// infra/lib/brain-stack.mjs — Stack principal `brain` (infrastructure-specification.md,
// monitoring-design.md). Un solo entorno (prod) en us-east-1 (Q2):
// - VPC con 2 subredes públicas, sin NAT Gateway, con gateway endpoints de S3 y
//   DynamoDB; security groups con salida solo TCP 443 (riesgo R4);
// - ALB HTTPS (TLS 1.2+) con ACM, idle 35 s, /health; WAF con regla por IP de
//   1 000 peticiones por minuto;
// - ECS Fargate ARM64 con 2 tareas fijas (minimumHealthyPercent 50,
//   maximumPercent 100, circuit breaker con rollback): nunca más de 2 tareas,
//   así el tope global de 15 invocaciones (2 × 7) se mantiene (NFR3.4);
// - Cognito (cliente `extension` con PKCE y cliente de máquina `probe`), S3 del
//   inventario y DynamoDB de uso con RETAIN, secreto de la sonda;
// - EventBridge Scheduler para InventoryJob (semanal) y Probe (cada minuto);
// - roles de IAM de mínimo privilegio, sin comodines (NFR4.1);
// - alarmas, regla de EventBridge, tablero, SNS y AWS Budgets.
// Todos los roles llevan el prefijo `brain-` para encajar en BrainCfnExecutionPolicy.

import { fileURLToPath } from "node:url";
import { Aws, CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, Tags } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as events from "aws-cdk-lib/aws-events";
import * as eventTargets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import {
  CLUSTER_NAME,
  ECR_REPOSITORY_NAME,
  PROBE_FUNCTION_NAME,
  SERVICE_NAME,
} from "./brain-bootstrap-stack.mjs";

const PROBE_ASSET_DIR = fileURLToPath(new URL("../../brain/probe", import.meta.url));
const APP_PORT = 8080;
const METRICS_NAMESPACE = "Brain";
const TASK_COUNT = 2; // MAX_INSTANCES = 2 (NFR3.3); cambiarlo obliga a recalcular el semáforo

function serviceRole(scope, id, roleName, servicePrincipal, description) {
  return new iam.Role(scope, id, {
    roleName,
    description,
    assumedBy: new iam.ServicePrincipal(servicePrincipal),
  });
}

function allow(sid, actions, resources) {
  return new iam.PolicyStatement({ sid, actions, resources });
}

export class BrainStack extends Stack {
  // Zonas fijas: la síntesis no consulta la cuenta (sin lookups ni credenciales).
  get availabilityZones() {
    return [`${this.region}a`, `${this.region}b`];
  }

  constructor(scope, id, props) {
    super(scope, id, props);
    const { params, caps, model } = props;
    const region = this.region;
    Tags.of(this).add("Project", "brain");

    // ---------------------------------------------------------------- red
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }],
      gatewayEndpoints: {
        S3: { service: ec2.GatewayVpcEndpointAwsService.S3 },
        DynamoDB: { service: ec2.GatewayVpcEndpointAwsService.DYNAMODB },
      },
      restrictDefaultSecurityGroup: false,
    });
    const publicSubnets = { subnetType: ec2.SubnetType.PUBLIC };

    const albSg = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc,
      allowAllOutbound: false,
      description: "ALB del cerebro: HTTPS publico; redireccion HTTP",
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Redireccion a HTTPS");

    const apiSg = new ec2.SecurityGroup(this, "ApiSecurityGroup", {
      vpc,
      allowAllOutbound: false,
      description: "brain-api: entrada solo desde el ALB; salida solo TCP 443",
    });
    apiSg.addIngressRule(albSg, ec2.Port.tcp(APP_PORT), "Solo desde el ALB");
    // Salida 443: Bedrock, ECR, Cognito (JWKS) y los gateway endpoints de S3/DynamoDB.
    apiSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS de salida");
    albSg.addEgressRule(apiSg, ec2.Port.tcp(APP_PORT), "Hacia las tareas");

    const jobSg = new ec2.SecurityGroup(this, "InventoryJobSecurityGroup", {
      vpc,
      allowAllOutbound: false,
      description: "InventoryJob: sin entrada; salida solo TCP 443",
    });
    jobSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS de salida");

    // --------------------------------------------------------- datos
    const bucket = new s3.Bucket(this, "InventoryBucket", {
      bucketName: `brain-inventory-${this.account}`,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const inventoryObjects = [bucket.arnForObjects("versions/*"), bucket.arnForObjects("active")];

    const usageTable = new dynamodb.Table(this, "UsageTable", {
      tableName: "brain-usage",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // -------------------------------------------------------- identidad
    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "brain-users",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      passwordPolicy: { minLength: 12, requireSymbols: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const cognitoDomain = userPool.addDomain("Domain", {
      cognitoDomain: { domainPrefix: params.cognitoDomainPrefix },
    });
    const probeScope = new cognito.ResourceServerScope({
      scopeName: "probe",
      scopeDescription: "Sonda sintetica del SLI",
    });
    const resourceServer = userPool.addResourceServer("BrainResourceServer", {
      identifier: "brain",
      scopes: [probeScope],
    });
    const extensionClient = userPool.addClient("ExtensionClient", {
      userPoolClientName: "extension",
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: [`https://${params.extensionId}.chromiumapp.org/`],
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.minutes(60),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
    });
    const probeClient = userPool.addClient("ProbeClient", {
      userPoolClientName: "probe",
      generateSecret: true,
      oAuth: {
        flows: { clientCredentials: true },
        scopes: [cognito.OAuthScope.resourceServer(resourceServer, probeScope)],
      },
      accessTokenValidity: Duration.hours(1),
    });
    probeClient.node.addDependency(resourceServer);

    const probeSecret = new secretsmanager.Secret(this, "ProbeClientSecret", {
      secretName: "brain/probe-client",
      description: "Credenciales del cliente de maquina de la sonda (solo las lee brain-probe)",
      secretObjectValue: {
        clientId: SecretValue.unsafePlainText(probeClient.userPoolClientId),
        clientSecret: probeClient.userPoolClientSecret,
      },
    });

    // ------------------------------------------------------------ cómputo
    const cluster = new ecs.Cluster(this, "Cluster", { vpc, clusterName: CLUSTER_NAME });
    const repository = ecr.Repository.fromRepositoryName(this, "Repository", ECR_REPOSITORY_NAME);
    const image = ecs.ContainerImage.fromEcrRepository(repository, params.imageTag);
    const runtimePlatform = {
      cpuArchitecture: ecs.CpuArchitecture.ARM64,
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
    };

    const apiLogs = new logs.LogGroup(this, "ApiLogs", {
      logGroupName: "/brain/api",
      retention: logs.RetentionDays.ONE_MONTH,
    });
    const jobLogs = new logs.LogGroup(this, "InventoryJobLogs", {
      logGroupName: "/brain/inventory-job",
      retention: logs.RetentionDays.ONE_MONTH,
    });
    const probeLogs = new logs.LogGroup(this, "ProbeLogs", {
      logGroupName: "/brain/probe",
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const modelArn = `arn:${Aws.PARTITION}:bedrock:${model.region}::foundation-model/${model.modelId}`;
    const apiTaskRole = serviceRole(
      this,
      "ApiTaskRole",
      "brain-api-task",
      "ecs-tasks.amazonaws.com",
      "Tarea brain-api",
    );
    apiTaskRole.addToPolicy(allow("InvokeConfiguredModel", ["bedrock:InvokeModel"], [modelArn]));
    apiTaskRole.addToPolicy(allow("ReadInventory", ["s3:GetObject"], inventoryObjects));
    apiTaskRole.addToPolicy(
      allow("UsageCounters", ["dynamodb:GetItem", "dynamodb:UpdateItem"], [usageTable.tableArn]),
    );
    const apiExecutionRole = serviceRole(
      this,
      "ApiExecutionRole",
      "brain-api-execution",
      "ecs-tasks.amazonaws.com",
      "Ejecucion de brain-api: extraer imagen y escribir registros",
    );

    const apiTaskDefinition = new ecs.FargateTaskDefinition(this, "ApiTaskDefinition", {
      family: "brain-api",
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform,
      taskRole: apiTaskRole,
      executionRole: apiExecutionRole,
    });
    apiTaskDefinition.addContainer("api", {
      image,
      portMappings: [{ containerPort: APP_PORT }],
      readonlyRootFilesystem: true,
      logging: ecs.LogDrivers.awsLogs({ logGroup: apiLogs, streamPrefix: "api" }),
      environment: {
        PORT: String(APP_PORT),
        AWS_REGION: region,
        ALLOWED_ORIGINS: `chrome-extension://${params.extensionId}`,
        ALLOWED_CLIENT_IDS: `${extensionClient.userPoolClientId},${probeClient.userPoolClientId}`,
        PROBE_CLIENT_ID: probeClient.userPoolClientId,
        COGNITO_ISSUER: userPool.userPoolProviderUrl,
        INVENTORY_BUCKET: bucket.bucketName,
        USAGE_TABLE: usageTable.tableName,
        DAILY_TOKEN_CAP: String(caps.dailyTokenCap),
        GLOBAL_DAILY_TOKEN_CAP: String(caps.globalDailyTokenCap),
        PROBE_DAILY_TOKEN_CAP: String(caps.probeDailyTokenCap),
        SE_HASH_SALT: Aws.STACK_ID,
      },
    });

    const apiService = new ecs.FargateService(this, "ApiService", {
      cluster,
      serviceName: SERVICE_NAME,
      taskDefinition: apiTaskDefinition,
      desiredCount: TASK_COUNT,
      minHealthyPercent: 50,
      maxHealthyPercent: 100,
      circuitBreaker: { rollback: true },
      assignPublicIp: true,
      vpcSubnets: publicSubnets,
      securityGroups: [apiSg],
      healthCheckGracePeriod: Duration.seconds(180),
    });

    // ------------------------------------------------------------ entrada
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
      hostedZoneId: params.hostedZoneId,
      zoneName: params.hostedZoneName,
    });
    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: params.brainDomain,
      validation: acm.CertificateValidation.fromDns(zone),
    });
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: publicSubnets,
      idleTimeout: Duration.seconds(35),
    });
    const httpsListener = alb.addListener("Https", {
      port: 443,
      open: false,
      certificates: [certificate],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
    });
    const targetGroup = httpsListener.addTargets("Api", {
      port: APP_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [apiService],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        path: "/health",
        healthyHttpCodes: "200",
        interval: Duration.seconds(15),
        unhealthyThresholdCount: 3,
        healthyThresholdCount: 2,
      },
    });
    alb.addListener("Http", {
      port: 80,
      open: false,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
        permanent: true,
      }),
    });
    new route53.ARecord(this, "BrainAlias", {
      zone,
      recordName: params.brainDomain,
      target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(alb)),
    });

    const webAcl = new wafv2.CfnWebACL(this, "WebAcl", {
      name: "brain-web-acl",
      scope: "REGIONAL",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "brain-web-acl",
        sampledRequestsEnabled: false,
      },
      rules: [
        {
          name: "rate-per-ip",
          priority: 0,
          action: { block: {} },
          statement: {
            rateBasedStatement: { limit: 1000, aggregateKeyType: "IP", evaluationWindowSec: 60 },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "brain-rate-per-ip",
            sampledRequestsEnabled: false,
          },
        },
      ],
    });
    new wafv2.CfnWebACLAssociation(this, "WebAclAssociation", {
      resourceArn: alb.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    });

    // ------------------------------------------------------ InventoryJob
    const jobTaskRole = serviceRole(
      this,
      "InventoryJobTaskRole",
      "brain-inventory-job-task",
      "ecs-tasks.amazonaws.com",
      "InventoryJob: publica versiones y el puntero active",
    );
    // Lee la versión activa para la comparación del 10 % y publica la nueva.
    jobTaskRole.addToPolicy(
      allow("PublishInventory", ["s3:GetObject", "s3:PutObject"], inventoryObjects),
    );
    const jobExecutionRole = serviceRole(
      this,
      "InventoryJobExecutionRole",
      "brain-inventory-job-execution",
      "ecs-tasks.amazonaws.com",
      "Ejecucion de InventoryJob",
    );
    const jobTaskDefinition = new ecs.FargateTaskDefinition(this, "InventoryJobTaskDefinition", {
      family: "brain-inventory-job",
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform,
      taskRole: jobTaskRole,
      executionRole: jobExecutionRole,
    });
    jobTaskDefinition.addContainer("job", {
      image,
      command: ["node", "jobs/build-inventory.mjs", "run"],
      readonlyRootFilesystem: true,
      logging: ecs.LogDrivers.awsLogs({ logGroup: jobLogs, streamPrefix: "job" }),
      environment: { AWS_REGION: region, INVENTORY_BUCKET: bucket.bucketName },
    });

    const inventorySchedulerRole = serviceRole(
      this,
      "InventorySchedulerRole",
      "brain-scheduler-inventory",
      "scheduler.amazonaws.com",
      "Calendario semanal de InventoryJob",
    );
    inventorySchedulerRole.addToPolicy(
      allow("RunInventoryJob", ["ecs:RunTask"], [jobTaskDefinition.taskDefinitionArn]),
    );
    inventorySchedulerRole.addToPolicy(
      allow(
        "PassInventoryJobRoles",
        ["iam:PassRole"],
        [jobTaskRole.roleArn, jobExecutionRole.roleArn],
      ),
    );
    new scheduler.CfnSchedule(this, "InventorySchedule", {
      name: "brain-inventory-weekly",
      scheduleExpression: "cron(0 6 ? * MON *)",
      scheduleExpressionTimezone: "America/Lima",
      flexibleTimeWindow: { mode: "OFF" },
      target: {
        arn: cluster.clusterArn,
        roleArn: inventorySchedulerRole.roleArn,
        retryPolicy: { maximumRetryAttempts: 1 },
        ecsParameters: {
          taskDefinitionArn: jobTaskDefinition.taskDefinitionArn,
          launchType: "FARGATE",
          taskCount: 1,
          networkConfiguration: {
            awsvpcConfiguration: {
              subnets: vpc.publicSubnets.map((s) => s.subnetId),
              securityGroups: [jobSg.securityGroupId],
              assignPublicIp: "ENABLED",
            },
          },
        },
      },
    });

    // ------------------------------------------------------------- Probe
    const probeRole = serviceRole(
      this,
      "ProbeRole",
      "brain-probe",
      "lambda.amazonaws.com",
      "Lambda Probe",
    );
    probeRole.addToPolicy(
      allow("ReadProbeSecret", ["secretsmanager:GetSecretValue"], [probeSecret.secretArn]),
    );
    probeRole.addToPolicy(
      allow("ProbeLogs", ["logs:CreateLogStream", "logs:PutLogEvents"], [probeLogs.logGroupArn]),
    );
    const probeFunction = new lambda.Function(this, "ProbeFunction", {
      functionName: PROBE_FUNCTION_NAME,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: Duration.seconds(40),
      handler: "handler.handler",
      code: lambda.Code.fromAsset(PROBE_ASSET_DIR),
      role: probeRole,
      logGroup: probeLogs,
      environment: {
        BRAIN_URL: `https://${params.brainDomain}`,
        TOKEN_URL: `${cognitoDomain.baseUrl()}/oauth2/token`,
        PROBE_SECRET_ARN: probeSecret.secretArn,
        PROBE_SCOPE: "brain/probe",
      },
    });
    const probeSchedulerRole = serviceRole(
      this,
      "ProbeSchedulerRole",
      "brain-scheduler-probe",
      "scheduler.amazonaws.com",
      "Calendario por minuto de Probe",
    );
    probeSchedulerRole.addToPolicy(
      allow("InvokeProbe", ["lambda:InvokeFunction"], [probeFunction.functionArn]),
    );
    new scheduler.CfnSchedule(this, "ProbeSchedule", {
      name: "brain-probe-every-minute",
      scheduleExpression: "rate(1 minute)",
      flexibleTimeWindow: { mode: "OFF" },
      target: {
        arn: probeFunction.functionArn,
        roleArn: probeSchedulerRole.roleArn,
        retryPolicy: { maximumRetryAttempts: 0 },
      },
    });

    // ------------------------------------------------------ avisos y alarmas
    const alarmTopic = new sns.Topic(this, "AlarmTopic", { topicName: "brain-alarms" });
    alarmTopic.addSubscription(new subscriptions.EmailSubscription(params.alarmEmail));
    const notify = new cwActions.SnsAction(alarmTopic);

    new events.Rule(this, "InventoryJobExitRule", {
      ruleName: "brain-inventory-job-exit",
      description: "InventoryJob termino con codigo distinto de 0",
      eventPattern: {
        source: ["aws.ecs"],
        detailType: ["ECS Task State Change"],
        detail: {
          clusterArn: [cluster.clusterArn],
          group: ["family:brain-inventory-job"],
          lastStatus: ["STOPPED"],
          containers: { exitCode: [{ "anything-but": 0 }] },
        },
      },
      targets: [new eventTargets.SnsTopic(alarmTopic)],
    });

    const metric = (metricName, statistic, period, dimensionsMap) =>
      new cw.Metric({ namespace: METRICS_NAMESPACE, metricName, statistic, period, dimensionsMap });
    const rateAlarm = (id, alarmName, errorsMetric, minutes, threshold) =>
      new cw.MathExpression({
        expression: "IF(r >= 20, e / r, 0)",
        usingMetrics: {
          r: metric("Requests", "Sum", Duration.minutes(minutes)),
          e: metric(errorsMetric, "Sum", Duration.minutes(minutes)),
        },
        period: Duration.minutes(minutes),
      }).createAlarm(this, id, {
        alarmName,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      });

    const alarms = [
      rateAlarm("Alarm5xxRate", "brain-5xx-rate", "Errors5xx", 5, 0.05),
      rateAlarm("Alarm429Rate", "brain-429-rate", "Errors429", 15, 0.1),
      new cw.MathExpression({
        expression: "IF(r >= 20, p, 0)",
        usingMetrics: {
          r: metric("Requests", "Sum", Duration.minutes(15)),
          p: metric("Latency", "p95", Duration.minutes(15)),
        },
        period: Duration.minutes(15),
      }).createAlarm(this, "AlarmLatencyP95", {
        alarmName: "brain-latency-p95",
        threshold: 20_000,
        evaluationPeriods: 1,
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      }),
      metric("ProbeSuccess", "Minimum", Duration.minutes(1)).createAlarm(this, "AlarmProbe", {
        alarmName: "brain-probe-failed",
        threshold: 1,
        evaluationPeriods: 3,
        datapointsToAlarm: 3,
        comparisonOperator: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
        treatMissingData: cw.TreatMissingData.BREACHING,
      }),
      metric("UsageGuardFallback", "Sum", Duration.minutes(5)).createAlarm(
        this,
        "AlarmUsageFallback",
        {
          alarmName: "brain-usage-fallback",
          threshold: 0,
          evaluationPeriods: 1,
          comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        },
      ),
      metric("InventoryReloadFailed", "Sum", Duration.minutes(15)).createAlarm(
        this,
        "AlarmInventoryReload",
        {
          alarmName: "brain-inventory-reload",
          threshold: 0,
          evaluationPeriods: 1,
          comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        },
      ),
      metric("InventoryJobFailed", "Maximum", Duration.hours(1)).createAlarm(
        this,
        "AlarmInventoryJob",
        {
          alarmName: "brain-inventory-job",
          threshold: 0,
          evaluationPeriods: 1,
          comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        },
      ),
      metric("InventoryAgeDays", "Maximum", Duration.hours(1)).createAlarm(
        this,
        "AlarmInventoryAge",
        {
          alarmName: "brain-inventory-age",
          threshold: 14,
          evaluationPeriods: 1,
          comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cw.TreatMissingData.BREACHING,
        },
      ),
      targetGroup.metrics
        .healthyHostCount({ period: Duration.minutes(1), statistic: "Minimum" })
        .createAlarm(this, "AlarmHealthyHosts", {
          alarmName: "brain-healthy-hosts",
          threshold: TASK_COUNT,
          evaluationPeriods: 15,
          comparisonOperator: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
          treatMissingData: cw.TreatMissingData.BREACHING,
        }),
      targetGroup.metrics
        .healthyHostCount({ period: Duration.minutes(1), statistic: "Minimum" })
        .createAlarm(this, "AlarmNoHosts", {
          alarmName: "brain-no-hosts",
          threshold: 1,
          evaluationPeriods: 2,
          comparisonOperator: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
          treatMissingData: cw.TreatMissingData.BREACHING,
        }),
    ];
    for (const alarm of alarms) alarm.addAlarmAction(notify);

    // ---------------------------------------------------------------- tablero
    const operations = ["interpret", "map_residue", "waf_pre_fill", "waf_post_fill"];
    new cw.Dashboard(this, "Dashboard", {
      dashboardName: "Brain",
      widgets: [
        [
          new cw.GraphWidget({
            title: "Disponibilidad (ProbeSuccess, media por hora)",
            left: [metric("ProbeSuccess", "Average", Duration.hours(1))],
            width: 12,
          }),
          new cw.GraphWidget({
            title: "Latencia p95 por operación (ms)",
            left: operations.map((op) =>
              metric("Latency", "p95", Duration.minutes(5), { operation: op }),
            ),
            width: 12,
          }),
        ],
        [
          new cw.GraphWidget({
            title: "Errores por código",
            left: [
              new cw.MathExpression({
                expression: `SEARCH('{${METRICS_NAMESPACE},operation,code} MetricName="Errors"', 'Sum', 300)`,
                label: "Errors",
                period: Duration.minutes(5),
              }),
            ],
            width: 12,
          }),
          new cw.GraphWidget({
            title: "Tokens por día (indicador adelantado del gasto)",
            left: [
              metric("InputTokens", "Sum", Duration.days(1)),
              metric("OutputTokens", "Sum", Duration.days(1)),
            ],
            width: 12,
          }),
        ],
        [
          new cw.SingleValueWidget({
            title: "Antigüedad del inventario (días)",
            metrics: [metric("InventoryAgeDays", "Maximum", Duration.hours(1))],
            width: 8,
          }),
          new cw.GraphWidget({
            title: "Tareas sanas",
            left: [targetGroup.metrics.healthyHostCount({ statistic: "Minimum" })],
            width: 8,
          }),
          new cw.GraphWidget({
            title: "Peticiones bloqueadas por el WAF",
            left: [
              new cw.Metric({
                namespace: "AWS/WAFV2",
                metricName: "BlockedRequests",
                statistic: "Sum",
                dimensionsMap: { WebACL: "brain-web-acl", Rule: "rate-per-ip", Region: region },
              }),
            ],
            width: 8,
          }),
        ],
      ],
    });

    // ------------------------------------------------------------ presupuesto
    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: "brain-monthly",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: params.monthlyBudgetUsd, unit: "USD" },
        costFilters: { TagKeyValue: ["user:Project$brain"] },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 80,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{ subscriptionType: "EMAIL", address: params.alarmEmail }],
        },
        {
          notification: {
            notificationType: "FORECASTED",
            comparisonOperator: "GREATER_THAN",
            threshold: 100,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{ subscriptionType: "EMAIL", address: params.alarmEmail }],
        },
      ],
    });

    // ------------------------------------------------------------- salidas (u7)
    new CfnOutput(this, "BrainUrl", { value: `https://${params.brainDomain}` });
    new CfnOutput(this, "CognitoDomain", { value: cognitoDomain.baseUrl() });
    new CfnOutput(this, "ExtensionClientId", { value: extensionClient.userPoolClientId });
    new CfnOutput(this, "InventoryBucketName", { value: bucket.bucketName });
  }
}
