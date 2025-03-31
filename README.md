# CDK-SPA

<p>
    <a href="https://github.com/thunder-so/cdk-spa/actions/workflows/publish.yml"><img alt="Build" src="https://img.shields.io/github/actions/workflow/status/thunder-so/cdk-spa/publish.yml?logo=github" /></a>
    <a href="https://www.npmjs.com/package/@thunderso/cdk-spa"><img alt="Version" src="https://img.shields.io/npm/v/@thunderso/cdk-spa.svg" /></a>
    <a href="https://www.npmjs.com/package/@thunderso/cdk-spa"><img alt="Downloads" src="https://img.shields.io/npm/dm/@thunderso/cdk-spa.svg"></a>
    <a href="https://www.npmjs.com/package/@thunderso/cdk-spa"><img alt="License" src="https://img.shields.io/npm/l/@thunderso/cdk-spa.svg" /></a>
</p>

Deploy any client-side Single Page Application (SPA) on AWS from Github with CI/CD.

Supported frameworks:

- [Astro (SSG mode)](https://astro.build/)
- [Next.js (static output export)](https://nextjs.org/)
- [Vite](https://vite.dev/) 
  - [React](https://vite.new/react), [Vue](https://vite.new/vue), [Svelte](https://vite.new/svelte), [Preact](https://vite.new/preact), [Qwik](https://vite.new/qwik), [Lit](https://vite.new/lit), [Solid](https://vite.new/solid) 
- [Gatsby (static)](https://www.gatsbyjs.com/)
- [React Router (client-side and static prerendering)](https://reactrouter.com/start/framework/rendering)
- Any static site generator (SSG) framework in any language

AWS resources:

- Fast responses from [CloudFront](https://aws.amazon.com/cloudfront/)
- Automatic upload of the build files and static assets to [S3](https://aws.amazon.com/s3/) with optimized caching rules
- Publicly available by a custom domain (or subdomain) via [Route53](https://aws.amazon.com/route53/) and SSL via [Certificate Manager](https://aws.amazon.com/certificate-manager/)
- Custom HTTP response headers, URL Redirects and Rewrites using [Lambda@edge](https://aws.amazon.com/lambda/edge/)
- Build and deploy with [Github Actions](https://docs.github.com/en/actions)
- Optional automatic build and deploy with [CodeBuild](https://aws.amazon.com/codebuild/) and [CodePipeline](https://aws.amazon.com/codepipeline/) from [Github](https://github.com/) repository using Access Token.


## Prerequisites

You need an [AWS account](https://aws.amazon.com/premiumsupport/knowledge-center/create-and-activate-aws-account/) to create and deploy the required resources for the site on AWS.

Before you begin, make sure you have the following:
  - Node.js and npm: Ensure you have Node.js (v18 or later) and npm installed.
  - AWS CLI: Install and configure the AWS Command Line Interface.

  - AWS CDK: Install the AWS CDK globally
```
npm install -g aws-cdk
```

  - Before deploying, bootstrap your AWS environment:
```
cdk bootstrap aws://your-aws-account-id/us-east-1
```


This package uses the `npm` package manager and is an ES6+ Module.


## Installation

Navigate to your project directory and install the package and its required dependencies. 

Your `package.json` must also contain `tsx` and this specific version of `aws-cdk-lib`:

```bash
npm i tsx aws-cdk-lib@2.150.0 @thunderso/cdk-spa --save-dev
```


## Setup

1. Login into the AWS console and note the `Account ID`. You will need it in the configuration step.

2. Run the following command to automatically create the required CDK stack entrypoint at `stack/index.ts`. 

```bash
npx cdk-spa-init 
```

You should adapt the file to your project's needs.


## Configuration

> [!NOTE]
> Use different filenames such as `production.ts` and `testing.ts` for environments.

```ts stack/index.ts
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
    rootdir: '' // supports monorepos. e.g. frontend/
  },

  buildProps: {
    outputdir: 'dist/' // the build output directory with static files and assets
  }
};

new SPAStack(new App(), `${appStackProps.application}-${appStackProps.service}-${appStackProps.environment}-stack`, appStackProps);
```

## Deploy

By running the following script, the CDK stack will be deployed to AWS.

```bash
npx cdk deploy --require-approval never --all --app="npx tsx stack/index.ts" 
```

## Destroy the Stack

If you want to destroy the stack and all its resources (including storage, e.g., access logs), run the following script:

```bash
npx cdk destroy --require-approval never --all --app="npx tsx stack/index.ts" 
```


# Deploy using GitHub Actions

In your GitHub repository, add a new workflow file under `.github/workflows/deploy.yml` with the following content:

```yaml .github/workflows/deploy.yml
name: Deploy SPA to AWS

on:
  push:
    branches:
      - main  # or the branch you want to deploy from

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Deploy to AWS
        run: |
          npx cdk deploy --require-approval never --all --app="npx tsx stack/index.ts"
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: 'us-east-1'  # or your preferred region
```

Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as repository secrets in GitHub. These should be the access key and secret for an IAM user with permissions to deploy your stack.


# Manage Domain with Route53

1. [Create a hosted zone in Route53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/AboutHZWorkingWith.html) for the desired domain, if you don't have one yet.

  This is required to create DNS records for the domain to make the app publicly available on that domain. On the hosted zone details you should see the `Hosted zone ID` of the hosted zone.

2. [Request a public global certificate in the AWS Certificate Manager (ACM)](https://docs.aws.amazon.com/acm/latest/userguide/gs-acm-request-public.html) for the desired domain in `us-east-1` *(global)* and validate it, if you don't have one yet.

  This is required to provide the app via HTTPS on the public internet. Take note of the displayed `ARN` for the certificate. 

> [!IMPORTANT]
> The certificate must be issued in `us-east-1` *(global)* regardless of the region used for the app itself as it will be attached to the CloudFront distribution which works globally.

```ts stack/index.ts
const appStackProps: SPAProps = {
  // ... other props

  // Optional: Domain settings
  // - create a hosted zone for your domain in Route53
  // - issue a global tls certificate in us-east-1 in AWS ACM
  domain: 'sub.example.com',
  hostedZoneId: 'XXXXXXXXXXXXXXX',
  globalCertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abcd1234-abcd-1234-abcd-1234abcd1234',
};
```


# Advanced: Enabling AWS CodePipeline and CodeBuild

If you prefer to use AWS CodePipeline and CodeBuild for automatic deployment instead of Github Actions, you can enable this by providing a GitHub Personal Access Token stored in AWS Secrets Manager.

## 1. Create GitHub Personal Access Token

[Create a Github Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) for your Github account. This token must be kept secure.

Here's how to create a GitHub Personal Access Token (PAT):

  - Go to your GitHub account settings.
  - Navigate to Developer settings > Personal access tokens.
  - Click on Generate new token.
  - Choose Tokens (classic).
  - Give the token a descriptive name.
  - Set the expiration to No expiration (ignore the warning, for now).
   Select the scopes (permissions):
      - `repo`: Full control of private repositories.
      - `admin:repo_hook`: Full control of repository hooks.
  - Click Generate token.

> [!NOTE]
> Copy the token immediately and store it securely. You won't be able to see it again. If you lose it, you'll need to generate a new one.

## 2. Store the Token in AWS Secrets Manager

[Create a Secrets Manager secret](https://docs.aws.amazon.com/secretsmanager/latest/userguide/manage_create-basic-secret.html) as `plaintext` with the Personal Access Token you created earlier. Note the `ARN` of the secret. E.g. `arn:aws:secretsmanager:<REGION_NAME>:<ACCOUNT_ID>:secret:<secret-name>`.

Use the AWS CLI to create a new secret in AWS Secrets Manager:

```bash
aws secretsmanager create-secret --name your-secret-name --secret-string your-token
```

- Replace your-secret-name with a name for your secret.
- Replace your-token with your actual GitHub token.
- The command will return something like this:
```json
{
    "ARN": "arn:aws:secretsmanager:us-east-1:665186350000:secret:your-secret-token-VgnkyF",
    "Name": "your-secret-name",
    "VersionId": "b1a532d2-4434-42a3-9283-41581be07455"
}
```

Take note of the ARN.

> [!IMPORTANT]
> Storing secrets in AWS Secrets Manager will incur a cost (around $0.40 per month).


## 3. Configure stack

```ts stack/index.ts
const appStackProps: SPAProps = {
  // ... other props

  buildProps: {
    runtime: 'nodejs',
    runtime_version: '20',
    installcmd: 'npm ci',
    buildcmd: 'npm run build',
    outputdir: 'dist/',
  },

  githubAccessTokenArn: 'arn:aws:secretsmanager:us-east-1:0123456789000:secret:your-secret-name-XXXXX',
};
```

- When using Pipeline mode, `runtime`, `runtime_version`, `installcmd` and `buildcmd` are mandatory for CodeBuild to function.

- `runtime` and `runtime_version` supports all [CodeBuild runtime versions](https://docs.aws.amazon.com/codebuild/latest/userguide/runtime-versions.html)


## Optional: Buildspec support

If you have a custom CodeBuild [<code>buildspec.yml</code>](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html) file for your app, provide relative path to the file. 

```yml
version: 0.2

phases:
  install:
    commands:
      - npm ci
  build:
    commands:
      - npm run build

artifacts:
  files:
    - '**/*'
  base-directory: 'dist/'
```

```ts stack/index.ts
const appStackProps: SPAProps = {
  // ... other props

  buildSpecFilePath: 'buildspec.yml',

  githubAccessTokenArn: 'arn:aws:secretsmanager:us-east-1:0123456789000:secret:your-secret-name-XXXXX',
};
```

When you have a `buildspec.yml`, the `buildProps` configuration is not required.

## Optional: Build environment variables

When using the Pipeline mode, you can provide build environment variables to AWS CodeBuild.

Create a parameter in SSM Parameter Store:

```bash
aws ssm put-parameter --name "/my-app/API_URL" --type "String" --value "https://api.example.com"

aws ssm put-parameter --name "/my-app/API_KEY" --type "SecureString" --value "your-secret-api-key"
```

Pass environment variables to your build, for example, to inject configuration or secrets. 

```ts stack/index.ts
const appStackProps: SPAProps = {
  // ... other props

  buildEnvironmentVariables: [
    { key: 'API_URL', resource: '/my-app/API_URL' },
    { key: 'API_KEY', resource: '/my-app/API_KEY' },
  ],

  githubAccessTokenArn: 'arn:aws:secretsmanager:us-east-1:0123456789000:secret:your-secret-name-XXXXX',
};
```

The library automatically adds the necessary permissions to the CodeBuild project's role to read parameters from SSM Parameter Store.

> [!NOTE]
> Be cautious when using environment variables. Ensure that any API keys or secrets included are safe to expose publicly.


# Advanced: Configure Redirects and Rewrites

When deploying web applications, especially Single Page Applications (SPAs), configuring URL handling is crucial for both user experience and search engine optimization (SEO). The terms redirect and rewrite refer to different methods of handling HTTP requests.

This library uses [Lambda@edge](https://aws.amazon.com/lambda/edge/) to configure redirects and rewrites.

## Redirect
A redirect is an HTTP response that instructs the client's browser to navigate to a different URL. This involves a round-trip to the server and results in the browser updating the address bar to the new URL.

HTTP Status Codes: This library uses `301 (Moved Permanently)`.

```ts stack/index.ts
const appStackProps: SPAProps = {
  // ... other props

  redirects: [
    { 
      // static
      source: '/home', 
      destination: '/' 
    },
    { 
      // wildcard
      source: '/guide/*', 
      destination: '/docs/*' 
    },
    { 
      // placeholders
      source: '/blog/:year/:month', 
      destination: '/:year/:month' 
    },
  ],

};
```

## Rewrite 
A URL rewrite modifies the URL path internally on the server without changing the URL in the client's browser. The client remains unaware of the rewrite.

```ts stack/index.ts
const appStackProps: SPAProps = {
  // ... other props

  rewrites: [
    {
      source: '/app/*',
      destination: '/index.html',
    },
    {
      source: '/profile/:username',
      destination: '/user/:username',
    },
  ],

};
```

# Advanced: Configure HTTP Response Headers

The header path must be a relative path without the domain. It will be matched with all custom domains attached to your site.

You can use wildcards to match arbitrary request paths.

This library uses [Lambda@edge](https://aws.amazon.com/lambda/edge/) to configure HTTP response headers.


```ts stack/index.ts
const appStackProps: SPAProps = {
  // ... other props

  headers: [
    {
      path: '/*',
      name: 'Cache-Control',
      value: 'public, max-age=864000',
    },
    {
      path: '/api/*',
      name: 'Cache-Control',
      value: 'max-age=0, no-cache, no-store, must-revalidate',
    },
    {
      path: '/blog/*',
      name: 'Cache-Control',
      value: 'public, max-age=31536000',
    },
    {
      path: '/**',
      name: 'Access-Control-Allow-Origin',
      value: 'https://www.foo.com',
    },
    {
      path: '/**',
      name: 'Referrer-Policy',
      value: 'same-origin',
    },
  ],

};
```

## Syntax

The header path must be a relative path without the domain. It will be matched with all custom domains attached to your site.

You can use wildcards to match arbitrary request paths.

| Path               | Effect                                   |
|--------------------|------------------------------------------|
| `/*`               | Only the root directory paths.           |
| `/**`              | All request paths, including the root path and all sub-paths         |
| `/blog/*`          | Matches `/blog/`, `/blog/latest-post/`, and all other paths under `/blog/` |
| `/**/*`	           | Matches `/blog/`, `/assets/`, and all other paths with at least two slashes. |


## Defaults

The CDK-SPA library provides sensible defaults which you can override using the configuration above.

### Default Security Headers

| Header                     | Default Value | 
|----------------------------|-----------------------------------| 
| X-Frame-Options            | `DENY` |  
| Referrer-Policy            | `strict-origin-when-cross-origin` | 
| X-Content-Type-Options     | `nosniff` | 
| Strict-Transport-Security  | `max-age=31536000 includeSubDomains` | 
| Content-Security-Policy    | `default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; `<br/>`style-src 'self' 'unsafe-inline'; font-src 'self' data:` | 
| X-XSS-Protection           | `1; mode=block` |

### Default CORS Headers

| Header | Default Value | 
|---------------------------------|----------------------------| 
| Access-Control-Allow-Origin | * | 
| Access-Control-Allow-Credentials | false | 
| Access-Control-Allow-Methods | GET, HEAD, OPTIONS | 
| Access-Control-Allow-Headers | * | | Access-Control-Max-Age | 600 |

# Troubleshooting

### Deployment Fails with Access Denied:
- Ensure your AWS credentials are properly configured and have the necessary permissions.
- Verify that the IAM user or role you're using has the required policies attached.

### Domain Not Resolving:
- Check your DNS settings in Route53 and confirm that your domain is correctly pointing to your CloudFront distribution.
- Ensure that the hostedZoneId in your configuration matches the one in Route53.

### SSL Certificate Issues:
- Make sure your SSL certificate is issued in the us-east-1 region and the ARN provided matches your certificate.
- Confirm that the domain names in the certificate match your application's domain.

### Build Failures in GitHub Actions:
- Verify that your AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) are set as secrets in your GitHub repository.
- Check that the IAM user associated with these credentials has the necessary permissions.

### CodePipeline Not Triggering:
- If using AWS CodePipeline and it isn't triggering, ensure your GitHub Personal Access Token is valid and has the required scopes (repo, admin:repo_hook).
- Confirm that the token is correctly stored in AWS Secrets Manager and the ARN is accurately referenced.

### Static Assets Not Loading:
- Confirm that your build output directory (`outputdir`) is correctly specified and that all assets are being uploaded to S3.
- Ensure that your application's base URL or public path is correctly configured to load assets from the right location.
- **Monorepo**: If you're using a monorepo, verify that the `rootdir` and `outputdir` are correctly set in your configuration. The library appends `rootdir` and `outputdir` to construct the correct directory path where your static assets are located.

### Lambda@Edge Function Errors:
- Check the Lambda logs in CloudWatch for any errors related to your redirects, rewrites, or headers.
- Validate the syntax and paths specified in your configuration for redirects, rewrites, and headers.

### CORS Issues:
- If encountering Cross-Origin Resource Sharing (CORS) errors, adjust the CORS headers in your configuration.
- Ensure that the Access-Control-Allow-Origin header is set appropriately for your use case.

### Unexpected Redirects or Rewrites:
- Review your redirects and rewrites configuration to ensure there are no conflicting rules.
- Test specific URLs to see how they are being handled and adjust your configurations accordingly.

### Performance Issues:
- Verify that caching is properly configured through the Cache-Control headers.
- Ensure that static assets are being served from CloudFront and not directly from the origin.

### Invalid CloudFront Distribution Configuration:
- If you receive errors related to CloudFront, double-check your domain, certificate ARN, and other related settings.
- Make sure all required resources have been properly provisioned and are active.

For further assistance, consult the AWS documentation or [raise an issue](https://github.com/thunder-so/cdk-spa/issues) in the GitHub repository.