import shell from "shelljs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logPrefix = 'CDK SPA';

shell.echo(`${logPrefix}: Destroying SPA stack on AWS via CDK...`);

// Run the destroy command
shell.echo(`${logPrefix}: Destroying stack on AWS via CDK...`);
if (shell.exec('npx cdk destroy --require-approval never --app="npx tsx ./stack/index.ts" ' + process.argv.slice(2)).code !== 0) {
    shell.echo(`${logPrefix} Error: CDK stack destroy failed.`);
    shell.exit(1);
}

shell.echo(`${logPrefix}: Successful destroyed stack.`);
