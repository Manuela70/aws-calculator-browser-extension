import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  DeployParamsError,
  Match,
  Template,
  buildBrainApp,
  validateParams,
} from "../../infra/lib/build-app.mjs";
import {
  CostGateError,
  computeTokenCaps,
  loadCostInputs,
  missingInputs,
} from "../../infra/scripts/token-caps.mjs";
import { modelResourceArns } from "../../infra/lib/brain-stack.mjs";

const INFRA = new URL("../../infra/", import.meta.url);
const exampleCosts = () =>
  JSON.parse(readFileSync(new URL("cost-inputs.example.json", INFRA), "utf8"));
const exampleParams = () =>
  JSON.parse(readFileSync(new URL("deploy-params.example.json", INFRA), "utf8"));

let brain;
let bootstrap;

beforeAll(() => {
  const built = buildBrainApp({
    account: "111111111111",
    region: "us-east-1",
    params: exampleParams(),
    costInputs: exampleCosts(),
  });
  brain = Template.fromStack(built.brain);
  bootstrap = Template.fromStack(built.bootstrap);
}, 120_000);

function policyStatements(template) {
  return Object.values(template.findResources("AWS::IAM::Policy")).flatMap(
    (policy) => policy.Properties.PolicyDocument.Statement,
  );
}

function functionNamed(template, name) {
  return Object.values(template.findResources("AWS::Lambda::Function")).find(
    (f) => f.Properties.FunctionName === name,
  );
}

const envNames = (fn) => Object.keys(fn.Properties.Environment.Variables);

describe("IaC del cerebro (cdk synth)", () => {
  it("la API es una Lambda ARM64 con la imagen de ECR y una Function URL sin IAM", () => {
    const api = functionNamed(brain, "brain-api");
    expect(api.Properties).toMatchObject({
      PackageType: "Image",
      Architectures: ["arm64"],
      MemorySize: 1024,
      Timeout: 35,
    });
    expect(api.Properties.Environment.Variables).toMatchObject({
      AWS_LWA_READINESS_CHECK_PROTOCOL: "tcp",
      ALLOWED_ORIGINS: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    });
    // AWS_REGION es una variable reservada de Lambda: no se define.
    expect(envNames(api)).not.toContain("AWS_REGION");
    brain.hasResourceProperties("AWS::Lambda::Url", { AuthType: "NONE", InvokeMode: "BUFFERED" });
    brain.hasOutput("BrainUrl", {});
  });

  it("no crea VPC, ALB, WAF, ECS ni direcciones públicas: costo fijo casi nulo", () => {
    for (const type of [
      "AWS::EC2::VPC",
      "AWS::EC2::NatGateway",
      "AWS::ElasticLoadBalancingV2::LoadBalancer",
      "AWS::WAFv2::WebACL",
      "AWS::ECS::Cluster",
      "AWS::ECS::Service",
      "AWS::SecretsManager::Secret",
      "AWS::CertificateManager::Certificate",
      "AWS::Route53::RecordSet",
    ]) {
      brain.resourceCountIs(type, 0);
    }
    brain.resourceCountIs("AWS::Lambda::Function", 2);
  });

  it("InventoryJob: Lambda semanal con la misma imagen, entregada por el adaptador a /events", () => {
    const job = functionNamed(brain, "brain-inventory-job");
    expect(job.Properties).toMatchObject({
      PackageType: "Image",
      Architectures: ["arm64"],
      Timeout: 900,
      ImageConfig: { Command: ["node", "jobs/job-server.mjs"] },
    });
    expect(job.Properties.Environment.Variables.AWS_LWA_PASS_THROUGH_PATH).toBe("/events");
    brain.hasResourceProperties("AWS::Scheduler::Schedule", {
      ScheduleExpression: "cron(0 6 ? * MON *)",
      Target: Match.objectLike({ RetryPolicy: { MaximumRetryAttempts: 1 } }),
    });
    brain.hasResourceProperties("AWS::Lambda::EventInvokeConfig", { MaximumRetryAttempts: 0 });
  });

  it("los roles no usan comodines salvo ecr:GetAuthorizationToken, que ECR exige", () => {
    for (const template of [brain, bootstrap]) {
      for (const statement of policyStatements(template)) {
        const actions = [].concat(statement.Action);
        const resources = [].concat(statement.Resource);
        expect(actions.some((a) => a.includes("*"))).toBe(false);
        if (resources.includes("*")) expect(actions).toEqual(["ecr:GetAuthorizationToken"]);
      }
    }
    // El modelo de brain/config.json (directo o perfil de inferencia) queda acotado
    // a ARN concretos de Anthropic, nunca a "*".
    const invoke = policyStatements(brain).find((st) => st.Action === "bedrock:InvokeModel");
    const arns = JSON.stringify([].concat(invoke.Resource));
    expect(arns).toMatch(/foundation-model\/anthropic\./);
    expect([].concat(invoke.Resource)).not.toContain("*");
  });

  it("conserva el bucket del inventario y la tabla de uso (RETAIN)", () => {
    brain.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
    });
    brain.hasResource("AWS::DynamoDB::Table", { DeletionPolicy: "Retain" });
    brain.hasResourceProperties("AWS::S3::Bucket", {
      VersioningConfiguration: { Status: "Enabled" },
      PublicAccessBlockConfiguration: Match.objectLike({ BlockPublicAcls: true }),
    });
    brain.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "brain-usage",
      TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
    });
  });

  it("crea solo las alarmas necesarias, el tablero y el presupuesto", () => {
    const names = Object.values(brain.findResources("AWS::CloudWatch::Alarm")).map(
      (a) => a.Properties.AlarmName,
    );
    expect(names.sort()).toEqual(
      [
        "brain-api-failures",
        "brain-5xx-rate",
        "brain-429-rate",
        "brain-latency-p95",
        "brain-usage-fallback",
        "brain-inventory-reload",
        "brain-inventory-job",
        "brain-inventory-job-errors",
        "brain-inventory-age",
      ].sort(),
    );
    brain.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    brain.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: Match.objectLike({ BudgetLimit: { Amount: 50, Unit: "USD" } }),
    });
  });

  it("mide la disponibilidad con tráfico real: errores y throttling de la Lambda, sin sonda", () => {
    brain.resourceCountIs("AWS::Cognito::UserPoolResourceServer", 0);
    brain.resourceCountIs("AWS::Cognito::UserPoolClient", 1);
    const alarm = Object.values(brain.findResources("AWS::CloudWatch::Alarm")).find(
      (a) => a.Properties.AlarmName === "brain-api-failures",
    );
    const names = alarm.Properties.Metrics.filter((m) => m.MetricStat).map(
      (m) => m.MetricStat.Metric.MetricName,
    );
    expect(names.sort()).toEqual(["Errors", "Throttles"]);
    const api = functionNamed(brain, "brain-api");
    expect(envNames(api).filter((n) => n.startsWith("PROBE_"))).toEqual([]);
  });

  it("entrega los topes de tokens como variables de entorno de la API", () => {
    const caps = computeTokenCaps(exampleCosts());
    expect(functionNamed(brain, "brain-api").Properties.Environment.Variables).toMatchObject({
      DAILY_TOKEN_CAP: String(caps.dailyTokenCap),
      GLOBAL_DAILY_TOKEN_CAP: String(caps.globalDailyTokenCap),
    });
  });

  it("arranque: OIDC con condiciones sub por rama y por entorno, y ECR inmutable", () => {
    const roles = Object.values(bootstrap.findResources("AWS::IAM::Role")).map((r) => ({
      name: r.Properties.RoleName,
      sub: r.Properties.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals[
        "token.actions.githubusercontent.com:sub"
      ],
    }));
    expect(roles).toEqual(
      expect.arrayContaining([
        {
          name: "github-brain-build",
          sub: "repo:example-org/aws-calculator-extension:ref:refs/heads/main",
        },
        {
          name: "github-brain-deploy",
          sub: "repo:example-org/aws-calculator-extension:environment:production",
        },
      ]),
    );
    bootstrap.hasResourceProperties("AWS::ECR::Repository", {
      RepositoryName: "brain-api",
      ImageTagMutability: "IMMUTABLE",
      ImageScanningConfiguration: { ScanOnPush: true },
    });
  });

  it("arranque: solo las Lambdas brain-* descargan la imagen, y el smoke lee la URL y corre el job", () => {
    const repo = Object.values(bootstrap.findResources("AWS::ECR::Repository"))[0];
    const [statement] = repo.Properties.RepositoryPolicyText.Statement;
    expect(statement).toMatchObject({
      Principal: { Service: "lambda.amazonaws.com" },
      Action: ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"],
    });
    expect(JSON.stringify(statement.Condition)).toMatch(/function:brain-\*/);
    const sids = policyStatements(bootstrap).map((s) => s.Sid);
    expect(sids).toEqual(expect.arrayContaining(["SmokeReadFunctionUrl", "SmokeRunInventoryJob"]));
  });
});

describe("arranque con un proveedor OIDC de GitHub ya existente", () => {
  it("lo reutiliza por ARN y no crea otro", () => {
    const built = buildBrainApp({
      account: "111111111111",
      region: "us-east-1",
      params: { ...exampleParams(), reuseGithubOidcProvider: "true" },
      costInputs: exampleCosts(),
    });
    const template = Template.fromStack(built.bootstrap);
    template.resourceCountIs("AWS::IAM::OIDCProvider", 0);
    const role = Object.values(template.findResources("AWS::IAM::Role"))[0];
    expect(JSON.stringify(role.Properties.AssumeRolePolicyDocument)).toMatch(
      /oidc-provider\/token\.actions\.githubusercontent\.com/,
    );
  }, 120_000);
});

describe("subject inmutable de GitHub (githubSubjectPrefix)", () => {
  it("usa el prefijo para la rama main y el entorno production, y rechaza uno inválido", () => {
    const prefix = "repo:example-org@123/aws-calculator-extension@456";
    const built = buildBrainApp({
      account: "111111111111",
      region: "us-east-1",
      params: { ...exampleParams(), githubSubjectPrefix: prefix },
      costInputs: exampleCosts(),
    });
    const subs = Object.values(Template.fromStack(built.bootstrap).findResources("AWS::IAM::Role"))
      .map(
        (r) =>
          r.Properties.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals[
            "token.actions.githubusercontent.com:sub"
          ],
      )
      .sort();
    expect(subs).toEqual([`${prefix}:environment:production`, `${prefix}:ref:refs/heads/main`]);
    expect(() => validateParams({ ...exampleParams(), githubSubjectPrefix: "repo:*" })).toThrow(
      /githubSubjectPrefix/,
    );
  }, 120_000);
});

describe("parámetros de despliegue (R3)", () => {
  it("falla con un mensaje claro si falta un parámetro o si el formato es inválido", () => {
    const params = exampleParams();
    delete params.alarmEmail;
    delete params.extensionId;
    expect(() => validateParams(params)).toThrow(DeployParamsError);
    expect(() => validateParams(params)).toThrow(/alarmEmail, extensionId/);
    expect(() => validateParams({ ...exampleParams(), extensionId: "XYZ" })).toThrow(/extensionId/);
    expect(() =>
      buildBrainApp({ account: undefined, params: exampleParams(), costInputs: exampleCosts() }),
    ).toThrow(/cuenta/);
  });
});

describe("token-caps.mjs (compuerta de costo)", () => {
  it("calcula los topes con entradas completas", () => {
    const caps = computeTokenCaps(exampleCosts());
    // 6 componentes de 1 USD; 50 × 0,8 − 6 = 34 USD; 1 USD por millón de tokens.
    expect(caps).toEqual({
      fixedMonthly: 6,
      tokenBudgetMonthly: 34,
      globalDailyTokenCap: 1_133_333,
      dailyTokenCap: 113_333,
    });
  });

  it("falla si cost-inputs está incompleto o no existe, indicando qué falta", () => {
    const inputs = exampleCosts();
    delete inputs.fixedMonthlyUsd.lambda;
    inputs.seCount = 0;
    expect(missingInputs(inputs)).toEqual(["fixedMonthlyUsd.lambda", "seCount"]);
    expect(() => computeTokenCaps(inputs)).toThrow(CostGateError);
    expect(() => computeTokenCaps(inputs)).toThrow(/fixedMonthlyUsd\.lambda/);
    expect(missingInputs(null)).toEqual(["cost-inputs"]);
    expect(() => loadCostInputs("no-existe.json")).toThrow(/cost-inputs\.example\.json/);
  });

  it("falla si el costo fijo alcanza la mitad del presupuesto (USD 25)", () => {
    const inputs = exampleCosts();
    inputs.fixedMonthlyUsd.cloudwatch = 20; // 5 + 20 = 25
    expect(() => computeTokenCaps(inputs)).toThrow(/mitad del presupuesto/);
  });

  it("falla si el tope por SE resulta en 0 tokens", () => {
    const inputs = exampleCosts();
    inputs.inputPricePerMillionTokensUsd = 1e12;
    inputs.outputPricePerMillionTokensUsd = 1e12;
    expect(() => computeTokenCaps(inputs)).toThrow(/0 tokens/);
  });

  it("el cost-inputs.json real pasa la compuerta", () => {
    const real = JSON.parse(readFileSync(new URL("cost-inputs.json", INFRA), "utf8"));
    const caps = computeTokenCaps(real);
    expect(caps.fixedMonthly).toBeLessThan(real.monthlyBudgetUsd / 2);
    expect(caps.dailyTokenCap).toBeGreaterThan(0);
  });
});

describe("Modelo (deployment-pipeline cd-config.md §3)", () => {
  it("modelo directo: un solo ARN de foundation-model", () => {
    const arns = modelResourceArns(
      { modelId: "anthropic.claude-test-v1:0", region: "us-east-1" },
      "aws",
      "111111111111",
    );
    expect(arns).toEqual([
      "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-test-v1:0",
    ]);
  });

  it("perfil de inferencia: ARN del perfil y del modelo de destino, sin comodín de acción", () => {
    const arns = modelResourceArns(
      { modelId: "us.anthropic.claude-test-v1:0", region: "us-east-1" },
      "aws",
      "111111111111",
    );
    expect(arns).toEqual([
      "arn:aws:bedrock:us-east-1:111111111111:inference-profile/us.anthropic.claude-test-v1:0",
      "arn:aws:bedrock:*::foundation-model/anthropic.claude-test-v1:0",
    ]);
  });

  it("el rol github-brain-build puede leer el modelo, solo con acciones de lectura", () => {
    bootstrap.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: "CheckConfiguredModel",
            Action: ["bedrock:GetFoundationModel", "bedrock:GetInferenceProfile"],
          }),
        ]),
      },
    });
  });
});

describe("Bedrock en otra cuenta (bedrockRoleArn)", () => {
  const ROLE = "arn:aws:iam::222222222222:role/brain-bedrock-invoke";
  let crossBrain;
  let crossBootstrap;

  beforeAll(() => {
    const built = buildBrainApp({
      account: "111111111111",
      region: "us-east-1",
      params: { ...exampleParams(), bedrockRoleArn: ROLE },
      costInputs: exampleCosts(),
    });
    crossBrain = Template.fromStack(built.brain);
    crossBootstrap = Template.fromStack(built.bootstrap);
  }, 120_000);

  it("la API solo puede asumir el rol de la otra cuenta y ya no invoca Bedrock local", () => {
    const statements = policyStatements(crossBrain);
    expect(statements.some((s) => s.Action === "sts:AssumeRole" && s.Resource === ROLE)).toBe(true);
    expect(statements.some((s) => [].concat(s.Action).includes("bedrock:InvokeModel"))).toBe(false);
  });

  it("el rol de la API conserva el nombre brain-api-task, en el que confía la otra cuenta", () => {
    crossBrain.hasResourceProperties("AWS::IAM::Role", {
      RoleName: "brain-api-task",
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [Match.objectLike({ Principal: { Service: "lambda.amazonaws.com" } })],
      }),
    });
  });

  it("la API recibe BEDROCK_ROLE_ARN y github-brain-build puede asumir el rol para verificar el modelo", () => {
    expect(functionNamed(crossBrain, "brain-api").Properties.Environment.Variables).toMatchObject({
      BEDROCK_ROLE_ARN: ROLE,
    });
    expect(
      policyStatements(crossBootstrap).some(
        (s) => s.Sid === "AssumeBedrockRoleForModelCheck" && s.Resource === ROLE,
      ),
    ).toBe(true);
  });

  it("rechaza un bedrockRoleArn que no es un ARN de rol", () => {
    expect(() =>
      validateParams({ ...exampleParams(), bedrockRoleArn: "brain-bedrock-invoke" }),
    ).toThrow(DeployParamsError);
  });
});
