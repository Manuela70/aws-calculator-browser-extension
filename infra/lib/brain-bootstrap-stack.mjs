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
export const PROBE_FUNCTION_NAME = "brain-probe";
export const CLUSTER_NAME = "brain";
export const SERVICE_NAME = "brain-api";

export class BrainBootstrapStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const { githubRepo } = props;
    const account = this.account;
    const region = this.region;

    const provider = new iam.CfnOIDCProvider(this, "GithubOidcProvider", {
      url: `https://${GITHUB_OIDC_HOST}`,
      clientIdList: ["sts.amazonaws.com"],
    });

    const repository = new ecr.Repository(this, "BrainApiRepository", {
      repositoryName: ECR_REPOSITORY_NAME,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ description: "Conserva las últimas 10 imágenes", maxImageCount: 10 }],
    });

    const githubPrincipal = (sub) =>
      new iam.WebIdentityPrincipal(provider.attrArn, {
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
      assumedBy: githubPrincipal(`repo:${githubRepo}:ref:refs/heads/main`),
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
      assumedBy: githubPrincipal(`repo:${githubRepo}:environment:production`),
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
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "SmokeInvokeProbe",
        actions: ["lambda:InvokeFunction"],
        resources: [
          `arn:${Aws.PARTITION}:lambda:${region}:${account}:function:${PROBE_FUNCTION_NAME}`,
        ],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "SmokeDescribeService",
        actions: ["ecs:DescribeServices"],
        resources: [
          `arn:${Aws.PARTITION}:ecs:${region}:${account}:service/${CLUSTER_NAME}/${SERVICE_NAME}`,
        ],
      }),
    );

    new CfnOutput(this, "BuildRoleArn", { value: buildRole.roleArn });
    new CfnOutput(this, "DeployRoleArn", { value: deployRole.roleArn });
    new CfnOutput(this, "RepositoryUri", { value: repository.repositoryUri });
  }
}
