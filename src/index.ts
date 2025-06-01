#!/usr/bin/env node
import { name as packageName, version as packageVersion } from '../package.json';
import { execSync } from 'child_process';
import { program } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import axios from 'axios';
import path from 'path';

type Compilers = 'tsc' | 'esbuild' | 'swc';

interface Answers {
	compiler: Compilers;
	projectName: string;
	runInstall: boolean;
}

const validCompilers = ['tsc', 'esbuild', 'swc'];

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

const initProject = async (options: Partial<Answers> = {}) => {
	const questions: any[] = [];

	if (!options.projectName) {
		questions.push({
			type: 'input',
			name: 'projectName',
			message: 'Enter your project name:',
			validate: (input: string) => {
				if (!input.trim()) return 'Project name cannot be empty.';
				if (!/^[a-z0-9-]+$/.test(input)) return 'Project name must be lowercase, alphanumeric, and may include hyphens.';
				return true;
			}
		});
	}

	if (!options.compiler) {
		questions.push({
			type: 'list',
			name: 'compiler',
			message: 'Choose a TypeScript compiler:',
			choices: ['tsc', 'esbuild', 'swc'],
			default: 'tsc'
		});
	}

	// Only prompt for runInstall if it is undefined AND projectName or compiler is missing (interactive mode)
	if (options.runInstall === undefined && !(options.projectName && options.compiler)) {
		questions.push({
			type: 'confirm',
			name: 'runInstall',
			message: 'Run npm install?',
			default: true
		});
	}

	const answers = await inquirer.prompt<Answers>(questions);

	const finalAnswers: Answers = {
		projectName: options.projectName ?? answers.projectName!,
		compiler: options.compiler ?? answers.compiler!,
		runInstall: options.runInstall ?? answers.runInstall!
	};

	const projectDir = path.join(process.cwd(), finalAnswers.projectName);
	const packageJsonPath = path.join(projectDir, 'package.json');
	const tsConfigPath = path.join(projectDir, 'tsconfig.json');
	const srcDir = path.join(projectDir, 'src');
	const indexPath = path.join(srcDir, 'index.ts');
	const gitignorePath = path.join(projectDir, '.gitignore');
	const gitignoreContent = 'node_modules/\ndist/\n.env';

	const buildScript = finalAnswers.compiler === 'tsc' ? 'tsc' : finalAnswers.compiler === 'esbuild' ? 'esbuild src/index.ts --bundle --platform=node --outfile=dist/index.js' : 'swc src -d dist';

	const startScript = finalAnswers.compiler === 'swc' ? 'node dist/src/index.js' : 'node dist/index.js';
	const devScript = 'tsx watch src/index.ts';

	const packageJson = {
		name: finalAnswers.projectName,
		version: '0.0.1',
		main: 'dist/index.js',
		scripts: {
			start: startScript,
			build: buildScript,
			dev: devScript
		},
		dependencies: {},
		devDependencies: {
			...(finalAnswers.compiler === 'tsc' ? { typescript: '^5.8.3' } : finalAnswers.compiler === 'esbuild' ? { esbuild: '^0.25.5' } : { '@swc/cli': '^0.7.7', '@swc/core': '^1.11.29' }),
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

	await fs.ensureDir(srcDir);
	await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
	await fs.writeJson(tsConfigPath, tsConfig, { spaces: 2 });
	await fs.writeFile(gitignorePath, gitignoreContent);
	await fs.writeFile(indexPath, '// Your TypeScript code here\nconsole.log("Hello, World!");');

	if (finalAnswers.runInstall) {
		console.log('Running npm install...');
		try {
			execSync('npm install', { cwd: projectDir, stdio: 'inherit' });
		} catch (error) {
			console.error('Error running npm install:', error);
			process.exit(1);
		}
	}

	console.log(`✅ Project '${finalAnswers.projectName}' initialized in ${projectDir} using ${finalAnswers.compiler}.`);
};

program
	.version(packageVersion)
	.description('Quickly set up Node.js projects with TypeScript')
	.argument('[projectName]', 'Name of the project')
	.option('-c, --compiler <compiler>', `Choose TypeScript compiler (${validCompilers.join(', ')})`)
	.option('-i, --install', 'Run npm install after setup')
	.action(async (projectName, options) => {
		try {
			await isLatestVersion();

			if (options.compiler && !validCompilers.includes(options.compiler)) {
				console.error(`\x1b[31mError:\x1b[0m Invalid compiler '${options.compiler}'. Choose one of: ${validCompilers.join(', ')}`);
				process.exit(1);
			}

			const allOptionsProvided = projectName && options.compiler;

			const finalOptions = {
				projectName,
				compiler: options.compiler as Compilers | undefined,
				runInstall: options.install
			};

			if (allOptionsProvided && finalOptions.runInstall === undefined) {
				finalOptions.runInstall = false;
			}

			await initProject(finalOptions);
		} catch (error: any) {
			if (error?.name === 'AbortError' || error?.message?.includes('SIGINT')) {
				console.log('\nProcess aborted by user.');
				process.exit(0);
			}
			console.error('Error initializing project:', error);
			process.exit(1);
		}
	});

program.parse(process.argv);
