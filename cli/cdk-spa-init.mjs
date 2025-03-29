import shell from "shelljs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logPrefix = 'CDK SPA';

shell.echo(`${logPrefix}: Initializing CDK stack index file for a dynamic SPA...`);

if (!fs.existsSync('stack')) {
    shell.mkdir('-p', 'stack');
    shell.cp(path.join(__dirname, 'templates/spa.ts'), './stack/index.ts');
    shell.echo(`${logPrefix}: CDK stack index file created. Please adapt the file at 'stack/index.ts' to the project's needs.`);
} else {
    shell.echo(`${logPrefix}: CDK stack folder already exists.`);
}