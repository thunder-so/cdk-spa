import shell from "shelljs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logPrefix = 'CDK SPA';

shell.echo(`${logPrefix}: Deploying SPA to AWS via CDK...`);

// Refresh the cdk output folder to have a clean state and prevent persisting outdated outputs
shell.echo(`${logPrefix}: Deleting outdated CDK files...`);
shell.rm('-rf', 'cdk.out');

// Run the deployment
shell.echo(`${logPrefix}: Deploying to AWS via CDK...`);
if (shell.exec('npx cdk deploy --require-approval never --app="npx tsx ./stack/index.ts" ' + process.argv.slice(2)).code !== 0) {
    shell.echo(`${logPrefix} Error: CDK deployment failed.`);
    shell.exit(1);
}

shell.echo(`${logPrefix}: Deployment successful.`);
