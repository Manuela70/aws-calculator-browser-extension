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

describe("IaC del cerebro (cdk synth)", () => {
  it("ECS Fargate con 2 tareas fijas, maximumPercent 100, minimumHealthyPercent 50 y rollback", () => {
    brain.hasResourceProperties("AWS::ECS::Service", {
      DesiredCount: 2,
      DeploymentConfiguration: {
        MaximumPercent: 100,
        MinimumHealthyPercent: 50,
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      },
      HealthCheckGracePeriodSeconds: 180,
    });
    brain.hasResourceProperties("AWS::ECS::TaskDefinition", {
      Family: "brain-api",
      Cpu: "512",
      Memory: "1024",
      RuntimePlatform: { CpuArchitecture: "ARM64", OperatingSystemFamily: "LINUX" },
    });
    brain.resourceCountIs("AWS::ApplicationAutoScaling::ScalableTarget", 0);
  });

  it("no crea NAT Gateway y usa gateway endpoints de S3 y DynamoDB", () => {
    brain.resourceCountIs("AWS::EC2::NatGateway", 0);
    brain.resourceCountIs("AWS::EC2::VPCEndpoint", 2);
    brain.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: Match.stringLikeRegexp("brain-api"),
      SecurityGroupEgress: [Match.objectLike({ IpProtocol: "tcp", FromPort: 443, ToPort: 443 })],
    });
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
    brain.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "bedrock:InvokeModel",
            Resource: Match.objectLike({
              "Fn::Join": Match.arrayWith([
                Match.arrayWith([Match.stringLikeRegexp("foundation-model/anthropic")]),
              ]),
            }),
          }),
        ]),
      },
    });
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

  it("aplica la regla de WAF por IP de 1 000 por minuto en el ALB HTTPS", () => {
    brain.hasResourceProperties("AWS::WAFv2::WebACL", {
      Scope: "REGIONAL",
      Rules: [
        Match.objectLike({
          Action: { Block: {} },
          Statement: {
            RateBasedStatement: { Limit: 1000, AggregateKeyType: "IP", EvaluationWindowSec: 60 },
          },
        }),
      ],
    });
    brain.resourceCountIs("AWS::WAFv2::WebACLAssociation", 1);
    brain.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      Port: 443,
      SslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
    });
    brain.hasResourceProperties("AWS::ElasticLoadBalancingV2::LoadBalancer", {
      LoadBalancerAttributes: Match.arrayWith([
        { Key: "idle_timeout.timeout_seconds", Value: "35" },
      ]),
    });
    brain.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      HealthCheckPath: "/health",
      HealthCheckIntervalSeconds: 15,
    });
  });

  it("crea las alarmas, la regla de EventBridge, el tablero y el presupuesto", () => {
    const names = Object.values(brain.findResources("AWS::CloudWatch::Alarm")).map(
      (a) => a.Properties.AlarmName,
    );
    expect(names.sort()).toEqual(
      [
        "brain-5xx-rate",
        "brain-429-rate",
        "brain-latency-p95",
        "brain-probe-failed",
        "brain-usage-fallback",
        "brain-inventory-reload",
        "brain-inventory-job",
        "brain-inventory-age",
        "brain-healthy-hosts",
        "brain-no-hosts",
      ].sort(),
    );
    brain.hasResourceProperties("AWS::Events::Rule", {
      EventPattern: Match.objectLike({ "detail-type": ["ECS Task State Change"] }),
    });
    brain.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    brain.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: Match.objectLike({ BudgetLimit: { Amount: 50, Unit: "USD" } }),
    });
  });

  it("entrega los topes de tokens como variables de entorno de la tarea", () => {
    const caps = computeTokenCaps(exampleCosts());
    brain.hasResourceProperties("AWS::ECS::TaskDefinition", {
      ContainerDefinitions: [
        Match.objectLike({
          Environment: Match.arrayWith([
            { Name: "DAILY_TOKEN_CAP", Value: String(caps.dailyTokenCap) },
            { Name: "GLOBAL_DAILY_TOKEN_CAP", Value: String(caps.globalDailyTokenCap) },
            { Name: "PROBE_DAILY_TOKEN_CAP", Value: String(caps.probeDailyTokenCap) },
          ]),
        }),
      ],
    });
    brain.hasResourceProperties("AWS::Scheduler::Schedule", {
      ScheduleExpression: "rate(1 minute)",
    });
    brain.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "brain-probe",
      Architectures: ["arm64"],
      MemorySize: 128,
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
});

describe("parámetros de despliegue (R3)", () => {
  it("falla con un mensaje claro si falta el dominio o la hosted zone, o si el formato es inválido", () => {
    const params = exampleParams();
    delete params.brainDomain;
    delete params.hostedZoneId;
    expect(() => validateParams(params)).toThrow(DeployParamsError);
    expect(() => validateParams(params)).toThrow(/brainDomain, hostedZoneId/);
    expect(() => validateParams({ ...exampleParams(), extensionId: "XYZ" })).toThrow(/extensionId/);
    expect(() =>
      buildBrainApp({ account: undefined, params: exampleParams(), costInputs: exampleCosts() }),
    ).toThrow(/cuenta/);
  });
});

describe("token-caps.mjs (compuerta de costo)", () => {
  it("calcula los topes con entradas completas", () => {
    const caps = computeTokenCaps(exampleCosts());
    // 13 componentes de 1 USD; 50 × 0,8 − 13 = 27 USD; 1 USD por millón de tokens.
    expect(caps).toEqual({
      fixedMonthly: 13,
      tokenBudgetMonthly: 27,
      globalDailyTokenCap: 900_000,
      dailyTokenCap: 90_000,
      probeDailyTokenCap: 1_728_000,
    });
  });

  it("falla si cost-inputs está incompleto o no existe, indicando qué falta", () => {
    const inputs = exampleCosts();
    delete inputs.fixedMonthlyUsd.waf;
    inputs.seCount = 0;
    expect(missingInputs(inputs)).toEqual(["fixedMonthlyUsd.waf", "seCount"]);
    expect(() => computeTokenCaps(inputs)).toThrow(CostGateError);
    expect(() => computeTokenCaps(inputs)).toThrow(/fixedMonthlyUsd\.waf/);
    expect(missingInputs(null)).toEqual(["cost-inputs"]);
    expect(() => loadCostInputs("no-existe.json")).toThrow(/cost-inputs\.example\.json/);
  });

  it("falla si el costo fijo alcanza la mitad del presupuesto (USD 25)", () => {
    const inputs = exampleCosts();
    inputs.fixedMonthlyUsd.alb = 13; // 12 + 13 = 25
    expect(() => computeTokenCaps(inputs)).toThrow(/mitad del presupuesto/);
  });

  it("falla si el tope por SE resulta en 0 tokens", () => {
    const inputs = exampleCosts();
    inputs.inputPricePerMillionTokensUsd = 1e12;
    inputs.outputPricePerMillionTokensUsd = 1e12;
    expect(() => computeTokenCaps(inputs)).toThrow(/0 tokens/);
  });
});
