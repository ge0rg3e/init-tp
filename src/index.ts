#!/usr/bin/env node
import { name as packageName, version as packageVersion } from '../package.json';
import { execSync } from 'child_process';
import { program } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import axios from 'axios';
import path from 'path';

interface Answers {
	compiler: 'tsc' | 'esbuild' | 'swc';
	projectName: string;
	runInstall: boolean;
}

const isLatestVersion = async () => {
	try {
		const { data } = await axios.get(`https://registry.npmjs.org/${packageName}/latest`);

		if (data.version !== packageVersion) {
			console.warn(
				`\x1b[33mWarning:\x1b[0m You are running version ${packageVersion} but the latest version is ${data.version}. Please update by running:\nnpm install -g ${packageName}@latest\n`
			);
		}
	} catch {}
};

const initProject = async () => {
	const answers = await inquirer.prompt<Answers>([
		{
			type: 'input',
			name: 'projectName',
			message: 'Enter your project name:',
			validate: (input) => {
				if (!input.trim()) return 'Project name cannot be empty.';
				if (!/^[a-z0-9-]+$/.test(input)) return 'Project name must be lowercase, alphanumeric, and may include hyphens.';
				return true;
			}
		},
		{
			type: 'list',
			name: 'compiler',
			message: 'Choose a TypeScript compiler:',
			choices: ['tsc', 'esbuild', 'swc'],
			default: 'tsc'
		},
		{
			type: 'confirm',
			name: 'runInstall',
			message: 'Run npm install?',
			default: true
		}
	]);

	const projectDir = path.join(process.cwd(), answers.projectName);
	const packageJsonPath = path.join(projectDir, 'package.json');
	const tsConfigPath = path.join(projectDir, 'tsconfig.json');
	const srcDir = path.join(projectDir, 'src');
	const indexPath = path.join(srcDir, 'index.ts');
	const gitignorePath = path.join(projectDir, '.gitignore');
	const gitignoreContent = 'node_modules/\ndist/\n.env';

	// Prepare scripts
	const buildScript = answers.compiler === 'tsc' ? 'tsc' : answers.compiler === 'esbuild' ? 'esbuild src/index.ts --bundle --platform=node --outfile=dist/index.js' : 'swc src -d dist';
	const startScript = answers.compiler === 'swc' ? 'node dist/src/index.js' : 'node dist/index.js';
	const devScript = 'tsx watch src/index.ts';

	const packageJson = {
		name: answers.projectName,
		version: '0.0.1',
		main: 'dist/index.js',
		scripts: {
			start: startScript,
			build: buildScript,
			dev: devScript
		},
		dependencies: {},
		devDependencies: {
			...(answers.compiler === 'tsc' ? { typescript: '^5.8.3' } : answers.compiler === 'esbuild' ? { esbuild: '^0.25.5' } : { '@swc/cli': '^0.7.7', '@swc/core': '^1.11.29' }),
			'@types/node': '^18.0.0',
			tsx: '^4.19.4'
		},
		initTp: `v${packageVersion}`
	};

	const tsConfig = {
		compilerOptions: {
			target: 'es6',
			module: 'commonjs',
			outDir: './dist',
			rootDir: './src',
			strict: true,
			esModuleInterop: true,
			skipLibCheck: true
		}
	};

	// Write project files
	await fs.ensureDir(srcDir);
	await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
	await fs.writeJson(tsConfigPath, tsConfig, { spaces: 2 });
	await fs.writeFile(gitignorePath, gitignoreContent);
	await fs.writeFile(indexPath, '// Your TypeScript code here\nconsole.log("Hello, World!");');

	// Install dependencies
	if (answers.runInstall) {
		console.log('Running npm install...');
		try {
			execSync('npm install', { cwd: projectDir, stdio: 'inherit' });
		} catch (error) {
			console.error('Error running npm install:', error);
			process.exit(1);
		}
	}

	console.log(`Project '${answers.projectName}' initialized in ${projectDir} using ${answers.compiler}.`);
};

program
	.version(packageName)
	.description('Quickly set up Node.js projects with TypeScript')
	.action(async () => {
		try {
			await isLatestVersion();
			await initProject();
		} catch (error: any) {
			// Handle user abort on Ctrl+C gracefully
			if (error?.name === 'AbortError' || error?.message?.includes('SIGINT')) {
				console.log('\nProcess aborted by user.');
				process.exit(0);
			}
			console.error('Error initializing project:', error);
			process.exit(1);
		}
	});

program.parse(process.argv);
