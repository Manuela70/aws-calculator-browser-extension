// infra/lib/brain-bootstrap-stack.mjs — Stack de arranque `brain-bootstrap`
// (cicd-pipeline.md §3 paso 4). Lo despliega una vez el mantenedor, a mano:
// - proveedor OIDC de GitHub Actions (sin claves de AWS en GitHub, NFR5.1);
// - rol `github-brain-build` (rama main): push a la ECR `brain-api` y lectura
//   de CDK para `cdk diff`;
// - rol `github-brain-deploy` (entorno production): roles de despliegue de CDK,
//   invocar la sonda y describir el servicio ECS para el job `smoke`;
// - la ECR `brain-api` (existe antes del primer push de imagen).

import { Aws, CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";

const GITHUB_OIDC_HOST = "token.actions.githubusercontent.com";
const CDK_QUALIFIER = "hnb659fds";

export const ECR_REPOSITORY_NAME = "brain-api";
export const API_FUNCTION_NAME = "brain-api";
export const JOB_FUNCTION_NAME = "brain-inventory-job";

export class BrainBootstrapStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const {
      githubRepo,
      githubSubjectPrefix,
      bedrockRoleArn,
      reuseGithubOidcProvider = false,
    } = props;
    // Prefijo del claim `sub` del token OIDC. Por defecto `repo:<owner>/<repo>`; un repo
    // con subject inmutable de GitHub usa `repo:<owner>@<id>/<repo>@<id>` (lo informa
    // GET /repos/<owner>/<repo>/actions/oidc/customization/sub).
    const subject = githubSubjectPrefix ?? `repo:${githubRepo}`;
    const account = this.account;
    const region = this.region;

    // Una cuenta admite un solo proveedor OIDC por URL: si ya existe (otro proyecto
    // con GitHub Actions), se reutiliza por su ARN en vez de crearlo.
    const providerArn = reuseGithubOidcProvider
      ? `arn:${Aws.PARTITION}:iam::${account}:oidc-provider/${GITHUB_OIDC_HOST}`
      : new iam.CfnOIDCProvider(this, "GithubOidcProvider", {
          url: `https://${GITHUB_OIDC_HOST}`,
          clientIdList: ["sts.amazonaws.com"],
        }).attrArn;

    const repository = new ecr.Repository(this, "BrainApiRepository", {
      repositoryName: ECR_REPOSITORY_NAME,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ description: "Conserva las últimas 10 imágenes", maxImageCount: 10 }],
    });
    // Las Lambdas del cerebro (brain-*) de esta cuenta descargan la imagen.
    repository.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "LambdaPullBrainFunctions",
        principals: [new iam.ServicePrincipal("lambda.amazonaws.com")],
        actions: ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"],
        conditions: {
          StringLike: {
            "aws:sourceArn": `arn:${Aws.PARTITION}:lambda:${region}:${account}:function:brain-*`,
          },
        },
      }),
    );

    const githubPrincipal = (sub) =>
      new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: {
          [`${GITHUB_OIDC_HOST}:aud`]: "sts.amazonaws.com",
          [`${GITHUB_OIDC_HOST}:sub`]: sub,
        },
      });

    const cdkRoleArn = (kind) =>
      `arn:${Aws.PARTITION}:iam::${account}:role/cdk-${CDK_QUALIFIER}-${kind}-role-${account}-${region}`;

    const buildRole = new iam.Role(this, "GithubBrainBuildRole", {
      roleName: "github-brain-build",
      description: "GitHub Actions (rama main): imagen en ECR y cdk diff",
      assumedBy: githubPrincipal(`${subject}:ref:refs/heads/main`),
      maxSessionDuration: Duration.hours(1),
    });
    // ecr:GetAuthorizationToken no admite un recurso más acotado que "*" (lo exige ECR).
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "EcrLogin",
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"],
      }),
    );
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "EcrPushBrainApi",
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:BatchGetImage",
          "ecr:DescribeImages",
          "ecr:DescribeImageScanFindings",
        ],
        resources: [repository.repositoryArn],
      }),
    );
    // Solo lectura: el job `diff` verifica que el modelo de brain/config.json exista y
    // esté activo antes de la aprobación (deployment-pipeline cd-config.md §3.2).
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "CheckConfiguredModel",
        actions: ["bedrock:GetFoundationModel", "bedrock:GetInferenceProfile"],
        resources: [
          `arn:${Aws.PARTITION}:bedrock:${region}::foundation-model/*`,
          `arn:${Aws.PARTITION}:bedrock:${region}:${account}:inference-profile/*`,
        ],
      }),
    );
    // Bedrock en otra cuenta: el job `diff` asume el rol de esa cuenta solo para
    // verificar el modelo (lectura); el permiso de invocar no se usa desde el pipeline.
    if (bedrockRoleArn) {
      buildRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "AssumeBedrockRoleForModelCheck",
          actions: ["sts:AssumeRole"],
          resources: [bedrockRoleArn],
        }),
      );
    }
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "CdkLookupForDiff",
        actions: ["sts:AssumeRole"],
        resources: [cdkRoleArn("lookup")],
      }),
    );

    const deployRole = new iam.Role(this, "GithubBrainDeployRole", {
      roleName: "github-brain-deploy",
      description: "GitHub Actions (entorno production): cdk deploy y smoke",
      assumedBy: githubPrincipal(`${subject}:environment:production`),
      maxSessionDuration: Duration.hours(1),
    });
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "CdkDeployRoles",
        actions: ["sts:AssumeRole"],
        resources: [
          cdkRoleArn("deploy"),
          cdkRoleArn("file-publishing"),
          cdkRoleArn("image-publishing"),
          cdkRoleArn("lookup"),
        ],
      }),
    );
    const functionArn = (name) =>
      `arn:${Aws.PARTITION}:lambda:${region}:${account}:function:${name}`;
    // Smoke: leer la Function URL del cerebro y, si aún no hay inventario, correr el
    // job una vez (primer despliegue).
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "SmokeReadFunctionUrl",
        actions: ["lambda:GetFunctionUrlConfig"],
        resources: [functionArn(API_FUNCTION_NAME)],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "SmokeRunInventoryJob",
        actions: ["lambda:InvokeFunction"],
        resources: [functionArn(JOB_FUNCTION_NAME)],
      }),
    );

    new CfnOutput(this, "BuildRoleArn", { value: buildRole.roleArn });
    new CfnOutput(this, "DeployRoleArn", { value: deployRole.roleArn });
    new CfnOutput(this, "RepositoryUri", { value: repository.repositoryUri });
  }
}
