// infra/lib/brain-stack.mjs — Stack principal `brain` (infrastructure-specification.md,
// monitoring-design.md), rediseñado a Lambda en Deployment Execution por costo
// (decisión del mantenedor: 2 SE y proyecto open source; el costo fijo de ECS + ALB
// era ~USD 57/mes). Un solo entorno (prod) en us-east-1:
// - API: Lambda ARM64 con la imagen del cerebro de ECR y AWS Lambda Web Adapter,
//   expuesta con una Function URL sin autenticación de IAM. La autenticación
//   (token de Cognito), el CORS y los límites por SE los aplica el propio cerebro
//   (AuthFilter y UsageGuard con DynamoDB). Sin VPC, ALB, WAF ni IP públicas.
// - Concurrencia: la de la cuenta (10 en una cuenta nueva) acota las invocaciones
//   simultáneas a Bedrock por debajo del tope de 15 (NFR3.4); no se reserva
//   concurrencia porque una cuenta nueva no lo permite.
// - InventoryJob: Lambda semanal con la misma imagen (EventBridge Scheduler).
// - Cognito (solo el cliente `extension` con PKCE), S3 del inventario y DynamoDB
//   de uso con RETAIN.
// - Disponibilidad con tráfico real (NFR1.4): errores 5xx del cerebro y errores o
//   throttling de la Lambda sobre el total de invocaciones; sin sonda sintética.
// - Roles de IAM de mínimo privilegio, sin comodines (NFR4.1); alarmas, tablero,
//   SNS y AWS Budgets.
// Todos los roles llevan el prefijo `brain-` para encajar en BrainCfnExecutionPolicy.

import { Aws, CfnOutput, Duration, Fn, RemovalPolicy, Stack, Tags } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import {
  API_FUNCTION_NAME,
  ECR_REPOSITORY_NAME,
  JOB_FUNCTION_NAME,
} from "./brain-bootstrap-stack.mjs";

const METRICS_NAMESPACE = "Brain";
// opDeadlineMs de brain/config.json es 25 s; la Lambda corta un poco después.
const API_TIMEOUT = Duration.seconds(35);
const JOB_TIMEOUT = Duration.minutes(15);

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

// Prefijos de los perfiles de inferencia entre regiones de Bedrock (p. ej. "us.").
const INFERENCE_PROFILE_PREFIX = /^(us|eu|apac|global)\./;

// ARN que el rol de la API puede invocar. Un modelo directo da un solo ARN de
// foundation-model; un perfil de inferencia necesita el ARN del perfil y el del
// modelo de destino en las regiones a las que el perfil enruta (deployment-pipeline
// cd-config.md §3.2).
export function modelResourceArns(model, partition = "aws", account = "*") {
  const match = INFERENCE_PROFILE_PREFIX.exec(model.modelId);
  if (!match) {
    return [`arn:${partition}:bedrock:${model.region}::foundation-model/${model.modelId}`];
  }
  const baseModelId = model.modelId.slice(match[0].length);
  return [
    `arn:${partition}:bedrock:${model.region}:${account}:inference-profile/${model.modelId}`,
    `arn:${partition}:bedrock:*::foundation-model/${baseModelId}`,
  ];
}

export class BrainStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const { params, caps, model } = props;
    Tags.of(this).add("Project", "brain");

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

    // ------------------------------------------------------------ cómputo
    const repository = ecr.Repository.fromRepositoryName(this, "Repository", ECR_REPOSITORY_NAME);
    const apiLogs = new logs.LogGroup(this, "ApiLogs", {
      logGroupName: "/brain/api",
      retention: logs.RetentionDays.ONE_MONTH,
    });
    const jobLogs = new logs.LogGroup(this, "InventoryJobLogs", {
      logGroupName: "/brain/inventory-job",
      retention: logs.RetentionDays.ONE_MONTH,
    });

    // El nombre brain-api-task se conserva: el rol de Bedrock de la otra cuenta
    // confía en él por nombre (infra/cross-account/bedrock-invoke-role.yaml).
    const apiRole = serviceRole(
      this,
      "ApiTaskRole",
      "brain-api-task",
      "lambda.amazonaws.com",
      "Lambda brain-api",
    );
    // Bedrock en otra cuenta: la API solo puede asumir ese rol, y el permiso de
    // invocar el modelo vive en la otra cuenta (infra/cross-account/). Sin rol,
    // invoca el modelo en esta cuenta.
    if (params.bedrockRoleArn) {
      apiRole.addToPolicy(
        allow("AssumeBedrockInvokeRole", ["sts:AssumeRole"], [params.bedrockRoleArn]),
      );
    } else {
      apiRole.addToPolicy(
        allow(
          "InvokeConfiguredModel",
          ["bedrock:InvokeModel"],
          modelResourceArns(model, Aws.PARTITION, Aws.ACCOUNT_ID),
        ),
      );
    }
    // Sin s3:ListBucket, S3 responde 403 (no 404) a un objeto que no existe, y el
    // puntero `active` ausente del primer despliegue parecería un error de acceso.
    const listInventory = allow("ListInventoryBucket", ["s3:ListBucket"], [bucket.bucketArn]);
    apiRole.addToPolicy(allow("ReadInventory", ["s3:GetObject"], inventoryObjects));
    apiRole.addToPolicy(listInventory);
    apiRole.addToPolicy(
      allow("UsageCounters", ["dynamodb:GetItem", "dynamodb:UpdateItem"], [usageTable.tableArn]),
    );
    apiRole.addToPolicy(
      allow("ApiLogs", ["logs:CreateLogStream", "logs:PutLogEvents"], [apiLogs.logGroupArn]),
    );

    // AWS Lambda Web Adapter (en la imagen) arranca el servidor HTTP del cerebro y
    // le pasa cada petición de la Function URL. Queda listo en cuanto el puerto
    // escucha; el propio cerebro espera el inventario hasta initDeadlineMs.
    const lwaEnv = {
      PORT: "8080",
      AWS_LWA_PORT: "8080",
      AWS_LWA_READINESS_CHECK_PROTOCOL: "tcp",
    };
    const apiFunction = new lambda.DockerImageFunction(this, "ApiFunction", {
      functionName: API_FUNCTION_NAME,
      description: "Cerebro de la extension AWS Calculator (HTTP via Function URL)",
      code: lambda.DockerImageCode.fromEcr(repository, { tagOrDigest: params.imageTag }),
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: API_TIMEOUT,
      role: apiRole,
      logGroup: apiLogs,
      environment: {
        ...lwaEnv,
        ALLOWED_ORIGINS: `chrome-extension://${params.extensionId}`,
        ALLOWED_CLIENT_IDS: extensionClient.userPoolClientId,
        COGNITO_ISSUER: userPool.userPoolProviderUrl,
        INVENTORY_BUCKET: bucket.bucketName,
        USAGE_TABLE: usageTable.tableName,
        DAILY_TOKEN_CAP: String(caps.dailyTokenCap),
        GLOBAL_DAILY_TOKEN_CAP: String(caps.globalDailyTokenCap),
        SE_HASH_SALT: Aws.STACK_ID,
        ...(params.bedrockRoleArn ? { BEDROCK_ROLE_ARN: params.bedrockRoleArn } : {}),
      },
    });
    const apiUrl = apiFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });

    // ------------------------------------------------------ InventoryJob
    const jobRole = serviceRole(
      this,
      "InventoryJobTaskRole",
      "brain-inventory-job-task",
      "lambda.amazonaws.com",
      "InventoryJob: publica versiones y el puntero active",
    );
    // Lee la versión activa para la comparación del 10 % y publica la nueva.
    jobRole.addToPolicy(
      allow("PublishInventory", ["s3:GetObject", "s3:PutObject"], inventoryObjects),
    );
    jobRole.addToPolicy(listInventory);
    jobRole.addToPolicy(
      allow("JobLogs", ["logs:CreateLogStream", "logs:PutLogEvents"], [jobLogs.logGroupArn]),
    );
    // Misma imagen; el adaptador entrega el evento del calendario a POST /events de
    // jobs/job-server.mjs, que corre el job y responde 500 si falla.
    const jobFunction = new lambda.DockerImageFunction(this, "InventoryJobFunction", {
      functionName: JOB_FUNCTION_NAME,
      description: "InventoryJob semanal del cerebro",
      code: lambda.DockerImageCode.fromEcr(repository, {
        tagOrDigest: params.imageTag,
        cmd: ["node", "jobs/job-server.mjs"],
      }),
      architecture: lambda.Architecture.ARM_64,
      memorySize: 2048,
      timeout: JOB_TIMEOUT,
      retryAttempts: 0,
      role: jobRole,
      logGroup: jobLogs,
      environment: {
        ...lwaEnv,
        AWS_LWA_PASS_THROUGH_PATH: "/events",
        INVENTORY_BUCKET: bucket.bucketName,
      },
    });

    const inventorySchedulerRole = serviceRole(
      this,
      "InventorySchedulerRole",
      "brain-scheduler-inventory",
      "scheduler.amazonaws.com",
      "Calendario semanal de InventoryJob",
    );
    inventorySchedulerRole.addToPolicy(
      allow("RunInventoryJob", ["lambda:InvokeFunction"], [jobFunction.functionArn]),
    );
    new scheduler.CfnSchedule(this, "InventorySchedule", {
      name: "brain-inventory-weekly",
      scheduleExpression: "cron(0 6 ? * MON *)",
      scheduleExpressionTimezone: "America/Lima",
      flexibleTimeWindow: { mode: "OFF" },
      target: {
        arn: jobFunction.functionArn,
        roleArn: inventorySchedulerRole.roleArn,
        retryPolicy: { maximumRetryAttempts: 1 },
      },
    });

    // ------------------------------------------------------ avisos y alarmas
    const alarmTopic = new sns.Topic(this, "AlarmTopic", { topicName: "brain-alarms" });
    alarmTopic.addSubscription(new subscriptions.EmailSubscription(params.alarmEmail));
    const notify = new cwActions.SnsAction(alarmTopic);

    const minutes = (n) => Duration.minutes(n);
    const metric = (metricName, statistic, period) =>
      new cw.Metric({ namespace: METRICS_NAMESPACE, metricName, statistic, period });
    const alarmOn = (id, alarmName, source, threshold) =>
      source.createAlarm(this, id, {
        alarmName,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      });
    const rateOf = (errorsMetric, mins) =>
      new cw.MathExpression({
        expression: "IF(r >= 20, e / r, 0)",
        usingMetrics: {
          r: metric("Requests", "Sum", minutes(mins)),
          e: metric(errorsMetric, "Sum", minutes(mins)),
        },
        period: minutes(mins),
      });

    // Fallas que el cerebro no llega a contar: excepción, timeout o throttling de la
    // Lambda (la Function URL responde 5xx sin pasar por el código).
    const lambdaFailures = (period) =>
      new cw.MathExpression({
        expression: "FILL(e, 0) + FILL(t, 0)",
        usingMetrics: {
          e: apiFunction.metricErrors({ period, statistic: "Sum" }),
          t: apiFunction.metricThrottles({ period, statistic: "Sum" }),
        },
        period,
        label: "Errores y throttling de la Lambda",
      });
    // Disponibilidad con tráfico real (NFR1.4), por hora.
    const hour = Duration.hours(1);
    const availability = new cw.MathExpression({
      expression: "IF(i > 0, 100 * (1 - (FILL(x, 0) + FILL(e, 0) + FILL(t, 0)) / i), 100)",
      usingMetrics: {
        i: apiFunction.metricInvocations({ period: hour, statistic: "Sum" }),
        x: metric("Errors5xx", "Sum", hour),
        e: apiFunction.metricErrors({ period: hour, statistic: "Sum" }),
        t: apiFunction.metricThrottles({ period: hour, statistic: "Sum" }),
      },
      period: hour,
      label: "Disponibilidad (%)",
    });

    const alarms = [
      alarmOn("AlarmApiFailures", "brain-api-failures", lambdaFailures(minutes(15)), 2),
      alarmOn("Alarm5xxRate", "brain-5xx-rate", rateOf("Errors5xx", 5), 0.05),
      alarmOn("Alarm429Rate", "brain-429-rate", rateOf("Errors429", 15), 0.1),
      alarmOn(
        "AlarmLatencyP95",
        "brain-latency-p95",
        new cw.MathExpression({
          expression: "IF(r >= 20, p, 0)",
          usingMetrics: {
            r: metric("Requests", "Sum", minutes(15)),
            p: metric("Latency", "p95", minutes(15)),
          },
          period: minutes(15),
        }),
        20_000,
      ),
      alarmOn(
        "AlarmUsageFallback",
        "brain-usage-fallback",
        metric("UsageGuardFallback", "Sum", minutes(5)),
        0,
      ),
      alarmOn(
        "AlarmInventoryReload",
        "brain-inventory-reload",
        metric("InventoryReloadFailed", "Sum", minutes(15)),
        0,
      ),
      alarmOn(
        "AlarmInventoryJob",
        "brain-inventory-job",
        metric("InventoryJobFailed", "Maximum", hour),
        0,
      ),
      alarmOn(
        "AlarmInventoryJobErrors",
        "brain-inventory-job-errors",
        jobFunction.metricErrors({ period: hour, statistic: "Sum" }),
        0,
      ),
      // Sin tráfico no hay dato de antigüedad: no cuenta como falla; el job tiene
      // sus propias alarmas.
      alarmOn(
        "AlarmInventoryAge",
        "brain-inventory-age",
        metric("InventoryAgeDays", "Maximum", hour),
        14,
      ),
    ];
    for (const alarm of alarms) alarm.addAlarmAction(notify);

    // ---------------------------------------------------------------- tablero
    new cw.Dashboard(this, "Dashboard", {
      dashboardName: "Brain",
      widgets: [
        [
          new cw.GraphWidget({
            title: "Disponibilidad con tráfico real (% por hora)",
            left: [availability],
            leftYAxis: { min: 0, max: 100 },
            width: 12,
          }),
          new cw.GraphWidget({
            title: "Latencia p95 (ms)",
            left: [metric("Latency", "p95", minutes(5))],
            width: 12,
          }),
        ],
        [
          new cw.GraphWidget({
            title: "Errores (el detalle por código está en los logs)",
            left: [
              metric("Errors5xx", "Sum", minutes(5)),
              metric("Errors429", "Sum", minutes(5)),
              lambdaFailures(minutes(5)),
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
            metrics: [metric("InventoryAgeDays", "Maximum", hour)],
            width: 12,
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
    // La Function URL termina en "/"; sync-brain-config.js espera un origen https.
    new CfnOutput(this, "BrainUrl", {
      value: Fn.join("", ["https://", Fn.select(2, Fn.split("/", apiUrl.url))]),
    });
    new CfnOutput(this, "CognitoDomain", { value: cognitoDomain.baseUrl() });
    new CfnOutput(this, "ExtensionClientId", { value: extensionClient.userPoolClientId });
    new CfnOutput(this, "InventoryBucketName", { value: bucket.bucketName });
  }
}
