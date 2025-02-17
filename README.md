# CDK-SPA
Install any client-only SPA (single page application) on AWS with automatic deployment.

- Fast responses from [CloudFront](https://aws.amazon.com/cloudfront/)
- Automatic upload of the build files for CSR and static assets to [S3](https://aws.amazon.com/s3/) with optimized caching rules
- Automatic build and deploy with [CodeBuild](https://aws.amazon.com/codebuild/) and [CodePipeline](https://aws.amazon.com/codepipeline/) from [Github](https://github.com/) repository.
- Publicly available by a custom domain (or subdomain) via [Route53](https://aws.amazon.com/route53/)


## Prerequisites

You need an [AWS account](https://aws.amazon.com/premiumsupport/knowledge-center/create-and-activate-aws-account/) to create and deploy the required resources for the site on AWS.

This package uses the `npm` package manager and is an ES6+ Module.

## Installation

Install the package and its required dependencies:

```bash
npm i @thunderso/cdk-spa --save-dev
```

Your `package.json` must also contain `tsx` and this specific version of `aws-cdk-lib` :

```bash
npm i tsx aws-cdk-lib@2.150.0 --save-dev
```

## Setup

1. Login into the AWS console and note the `Account ID`. You will need it in the configuration step.

2. Run the following command to automatically create the required CDK stack entrypoint at `stack/index.ts`. This file defines the config how the app will be deployed via CDK. You should adapt the file to the project's needs, especially the props `env.account` (setup step 1).

```bash
npx cdk-spa-init 
```

### Enable Automatic Deployments

1. [Create a Github Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) for your Github account. This token must be kept secure.

2. [Create a Secrets Manager secret](https://docs.aws.amazon.com/secretsmanager/latest/userguide/manage_create-basic-secret.html) as `plaintext` with the Personal Access Token you created earlier. Note the `ARN` of the secret. E.g. `arn:aws:secretsmanager:<REGION_NAME>:<ACCOUNT_ID>:secret:<secret-name>`.

3. Input the noted `ARN` to the `githubAccessTokenArn` field in your stack.

### Manage Domain with Route53 (Optional)

1. [Create a hosted zone in Route53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/AboutHZWorkingWith.html) for the desired domain, if you don't have one yet.

  This is required to create DNS records for the domain to make the app publicly available on that domain. On the hosted zone details you should see the `Hosted zone ID` of the hosted zone.

2. [Request a public global certificate in the AWS Certificate Manager (ACM)](https://docs.aws.amazon.com/acm/latest/userguide/gs-acm-request-public.html) for the desired domain in `us-east-1` *(global)* and validate it, if you don't have one yet.

  This is required to provide the app via HTTPS on the public internet. Take note of the displayed `ARN` for the certificate. 

> [!IMPORTANT]
> The certificate must be issued in `us-east-1` *(global)* regardless of the region used for the app itself as it will be attached to the CloudFront distribution which works globally.


## Configuration

The `SPAStack` construct can be configured via the following props:

<table width="100%">
  <thead align=left>
    <tr>
      <th width=150>
        name
      </th>
      <th width=70>
        type
      </th>
      <th>
        description
      </th>
    </tr>
  </thead>
  <tbody align=left valign=top>
    <tr>
      <th>
        <code>env</code>
      </th>
      <th>
        <!-- <code>account: string</code>
        <code>region: string</code> -->
      </th>
      <td>
        <strong>Required</strong>. Your account ID and your preferred region.
      </td>
    </tr>
    <tr>
      <th>
        <code>application</code>
      </th>
      <th>
        <code>string</code>
      </th>
      <td>
        <strong>Required</strong>. A string identifier for the project the site is part of. An application might have multiple different services.
      </td>
    </tr>
    <tr>
      <th>
        <code>service</code>
      </th>
      <th>
        <code>string</code>
      </th>
      <td>
        <strong>Required</strong>. A string identifier the site. This can be seen as the name of the site.
      </td>
    </tr>
    <tr id="constructor-option-environment">
      <th>
        <code>environment</code>
      </th>
      <th>
        <code>string</code>
      </th>
      <td><strong>Required</strong>. A string to identify the environment of the app. This enables us to deploy multiple different environments of the same app, e.g., prod, dev.
      </td>
    </tr>
    <tr><td colspan=3><small>Source, build and deploy:</small></td></tr>
    <tr id="constructor-option-deployment">
      <th>
        <code>sourceProps</code>
      </th>
      <th>
      </th>
      <td><strong>Required</strong>. Provide the Github repository details.
        <ul>
          <!-- <li><code>provider: string;</code> E.g. github</li> -->
          <li><code>owner: string;</code></li>
          <li><code>repo: string;</code></li>
          <li><code>branchOrRef: string;</code></li>
          <li><code>rootdir: string;</code></li>
        <ul>
      </td>
    </tr>
    <tr>
      <th>
        <code>githubAccessTokenArn</code>
      </th>
      <th>
        <code>string</code>
      </th>
      <td>
        <!-- <strong>Required</strong>. Create a Github Personal Access Token, save the token as a parameter in AWS Parameter Store. Provide the ARN. Ensure it is <code>SecureString</code>. -->
        <strong>Required</strong>. Create a Github Personal Access Token, save the token as a secret in AWS Secrets Manager. Provide the ARN. Ensure it is <code>plaintext</code>.
      </td>
    </tr>
    <!-- <tr><td colspan=3></td></tr> -->
    <tr id="constructor-option-buildstep">
      <th>
        <code>buildSpecFilePath</code>
      </th>
      <th>
        <code>string</code>
      </th>
      <td><strong>Optional</strong>. If you have a custom CodeBuild Buildspec file for your app, provide relative path to the file. E.g. <code>stack/buildspec.yml</code>
      </td>
    </tr>
    <tr>
      <th>
        <code>buildProps</code>
      </th>
      <th>
      </th>
      <td>
        <strong>Required</strong> if <code>buildSpecFilePath</code> is blank. 
        <ul>
          <li><code>runtime: string;</code></li>
          <li><code>runtime_version: string|number;</code></li>
          <li><code>installcmd: string;</code></li>
          <li><code>buildcmd: string;</code></li>
          <li><code>outputdir: string;</code></li>
        <ul>
      </td>
    </tr>
    <tr><td colspan=3><small>Domain settings:</small></td></tr>
    <tr id="constructor-option-domain">
      <th>
        <code>domain</code>
      </th>
      <th>
        <code>string</code>
      </th>
      <td>
        <strong>Optional</strong>. The domain (without the protocol) at which the app shall be publicly available. A DNS record will be automatically created in Route53 for the domain. This also supports subdomains. Examples: "example.com", "sub.example.com"
      </td>
    </tr>
    <tr>
      <th>
        <code>hostedZoneId</code>
      </th>
      <th>
        <code>string</code>
      </th>
      <td>
        <strong>Optional</strong>. Required when domain is provided. The id of the hosted zone to create a DNS record for the specified domain. 
      </td>
    </tr>
    <tr>
      <th>
        <code>globalCertificateArn</code>
      </th>
      <th>
        <code>string</code>
      </th>
      <td>
        <strong>Optional</strong>. Required when domain is provided. The ARN of the certificate to use on CloudFront for the app to make it accessible via HTTPS. The certificate must be issued for the specified domain in us-east-1 (global) regardless of the region specified via 'env.region' as CloudFront only works globally.
      </td>
    </tr>
  </tbody>
</table>


## Deployment

After the installation and the setup you are already good to go to build the app and to deploy it to AWS with this package by following the steps below:

### 1. Bootstrap CDK

Deploying stacks with the AWS CDK requires dedicated Amazon S3 buckets and other containers to be available to AWS CloudFormation during deployment. Creating these is called bootstrapping and is only required once per account and region. To bootstrap, run the following command:

```
cdk bootstrap aws://ACCOUNT-NUMBER/REGION
```

See https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html for details.

### 2. Build and Deploy

By running the following script, the CDK stack will be deployed to AWS.

```bash
npx cdk deploy --require-approval never --all --app="npx tsx stack/index.ts" 
```

## Destroy the Stack

If you want to destroy the stack and all its resources (including storage, e.g., access logs), run the following script:

```bash
npx cdk destroy --require-approval never --all --app="npx tsx stack/index.ts" 
```

## Reference: Created AWS Resources

In the following, you can find an overview of the AWS resources that will be created by this package for reference.

### SPAStack

This stack is responsible for deploying static sites and dynamic SPA apps to AWS.
The following AWS resources will be created by this stack:

- [CloudFront](https://aws.amazon.com/CloudFront/): A distribution to route incoming requests to the S3 bucket to serve the static assets for the app.

- [S3](https://aws.amazon.com/s3/): A bucket to store the client files and static assets of the build with optimized cache settings.

- [CodeBuild](https://aws.amazon.com/codebuild/): A build project to automatically build and package the static assets from the source code.

- [CodePipeline](https://aws.amazon.com/codepipeline/): A deployment pipeline to automate the release process, integrating with CodeBuild, S3, and other AWS services.

- [Route53](https://aws.amazon.com/route53/): Two DNS records (`A` for IPv4 and `AAAA` for IPv6) in the configured hosted zone to make the app available on the internet via the configured custom domain.


## Manually setting up CDK

You can use `SPAStack` as a CDK construct within your CDK code to seamlessly integrate hosting. Here's an example of how to use it:

Create a `stack` directory in your project root and an empty file `index.ts` and fill in the props accordingly. 

> Use different filenames such as `production.ts` and `testing.ts` for environments.

```ts
import { App } from "aws-cdk-lib";
import { SPAStack, type SPAProps } from "@thunderso/cdk-spa";

const appStackProps: SPAProps = {
  env: {
    account: 'your-account-id',
    region: 'us-east-1'
  },
  application: 'your-application-id',
  service: 'your-service-id',
  environment: 'production',

  // Your Github repository url contains https://github.com/<owner>/<repo>
  sourceProps: {
    owner: 'your-github-username',
    repo: 'your-repo-name',
    branchOrRef: 'main',
    rootdir: ''
  },

  // Build variables for CodeBuild
  // https://docs.aws.amazon.com/codebuild/latest/userguide/available-runtimes.html
  buildProps: {
    runtime: 'nodejs',
    runtime_version: 20,
    installcmd: 'npm ci',
    buildcmd: 'npm run build',
    outputdir: 'dist/'
  },
  // Providing a buildspec.yml will override buildProps and sourceProps.rootdir
  // buildSpecFilePath: 'stack/buildspec.yml',

  // Optional: Domain settings
  // - create a hosted zone for your domain
  // - issue a global tls certificate in us-east-1 
  domain: 'sub.example.com',
  hostedZoneId: 'Z1D633PJRANDOM',
  globalCertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abcd1234-abcd-1234-abcd-1234abcd1234',

  // all resources created in the stack will be tagged
  // tags: {
  //   key: 'value'
  // },
};

new SPAStack(new App(), `${appStackProps.application}-${appStackProps.service}-${appStackProps.environment}-stack`, appStackProps);
```

Run the following command to deploy stack.

```bash
npx cdk deploy --require-approval never --all --app="npx tsx stack/index.ts" 
```

## Advanced

Cloudfront edge functions can be used for URL rewrite, among other use-cases.

> [!NOTE]
> Check out the resources from [aws-samples/amazon-cloudfront-functions](https://github.com/aws-samples/amazon-cloudfront-functions) for examples.


## Useful commands
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
