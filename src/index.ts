#!/usr/bin/env node
import { name as packageName, version as packageVersion } from '../package.json';
import { execSync } from 'child_process';
import { program } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';

type Compilers = 'tsc' | 'esbuild' | 'swc';
type PackageManager = 'npm' | 'pnpm';

interface Answers {
	compiler: Compilers;
	projectName: string;
	runInstall: boolean;
	packageManager: PackageManager;
}

const validCompilers = ['tsc', 'esbuild', 'swc'];
const validPackageManagers = ['npm', 'pnpm'];

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

	if (!options.packageManager) {
		questions.push({
			type: 'list',
			name: 'packageManager',
			message: 'Choose a package manager:',
			choices: ['npm', 'pnpm'],
			default: 'npm'
		});
	}

	// Only prompt for runInstall if it is undefined AND projectName or compiler is missing (interactive mode)
	if (options.runInstall === undefined && !(options.projectName && options.compiler)) {
		questions.push({
			type: 'confirm',
			name: 'runInstall',
			message: 'Run package installation?',
			default: true
		});
	}

	const answers = await inquirer.prompt<Answers>(questions);

	const finalAnswers: Answers = {
		projectName: options.projectName ?? answers.projectName!,
		compiler: options.compiler ?? answers.compiler!,
		packageManager: options.packageManager ?? answers.packageManager!,
		runInstall: options.runInstall ?? answers.runInstall!
	};

	const projectDir = path.join(process.cwd(), finalAnswers.projectName);
	const packageJsonPath = path.join(projectDir, 'package.json');
	const tsConfigPath = path.join(projectDir, 'tsconfig.json');
	const srcDir = path.join(projectDir, 'src');
	const indexPath = path.join(srcDir, 'index.ts');
	const gitignorePath = path.join(projectDir, '.gitignore');
	const gitignoreContent = 'node_modules/\ndist/\n.env';
	const readmePath = path.join(projectDir, 'README.md');

	const getNpxCommand = (packageManager: PackageManager) => {
		switch (packageManager) {
			case 'pnpm':
				return 'pnpx init-tp';
			default:
				return 'npx init-tp';
		}
	};

	const readmeContent = `# ${finalAnswers.projectName}

Created using [${getNpxCommand(finalAnswers.packageManager)}](https://github.com/ge0rg3e/init-tp)`;

	const buildScript = finalAnswers.compiler === 'tsc' ? 'tsc' : finalAnswers.compiler === 'esbuild' ? 'esbuild src/index.ts --bundle --platform=node --outfile=dist/index.js' : 'swc src -d dist';

	const startScript = finalAnswers.compiler === 'swc' ? 'node dist/src/index.js' : 'node dist/index.js';
	const devScript = 'tsx watch src/index.ts';

	// Package manager specific configurations
	const getPackageManagerConfig = (pm: PackageManager) => {
		switch (pm) {
			case 'pnpm':
				return {
					packageManager: 'pnpm',
					engines: { node: '>=16.0.0' },
					packageManagerFiles: {
						'.npmrc': 'auto-install-peers=true\nstrict-peer-dependencies=false',
						'pnpm-workspace.yaml': 'packages:\n  - "."'
					}
				};
			default: // npm
				return {
					packageManager: 'npm',
					engines: { node: '>=16.0.0' },
					packageManagerFiles: {}
				};
		}
	};

	const pmConfig = getPackageManagerConfig(finalAnswers.packageManager);

	const packageJson = {
		name: finalAnswers.projectName,
		version: '0.0.1',
		main: 'dist/index.js',
		packageManager: pmConfig.packageManager,
		engines: pmConfig.engines,
		scripts: {
			start: startScript,
			build: buildScript,
			dev: devScript
		},
		dependencies: {},
		devDependencies: {
			...(finalAnswers.compiler === 'tsc' ? { typescript: '^5.8.3' } : finalAnswers.compiler === 'esbuild' ? { esbuild: '^0.25.5' } : { '@swc/cli': '^0.7.7', '@swc/core': '^1.12.9' }),
			'@types/node': '^24.0.10',
			tsx: '^4.20.3'
		},
		initTp: `v${packageVersion}`
	};

	const tsConfig = {
		compilerOptions: {
			target: 'es2017',
			lib: ['es2017', 'dom'],
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
	await fs.writeFile(readmePath, readmeContent);
	await fs.writeFile(indexPath, '// Your TypeScript code here\nconsole.log("Hello, World!");');

	// Create package manager specific files
	for (const [filename, content] of Object.entries(pmConfig.packageManagerFiles)) {
		await fs.writeFile(path.join(projectDir, filename), content);
	}

	if (finalAnswers.runInstall) {
		console.log(`Running ${finalAnswers.packageManager} install...`);
		try {
			const installCommand =
				finalAnswers.packageManager === 'npm'
					? 'npm install'
					: finalAnswers.packageManager === 'pnpm'
						? 'pnpm install'
						: finalAnswers.packageManager === 'yarn'
							? 'yarn install'
							: 'bun install';

			execSync(installCommand, { cwd: projectDir, stdio: 'inherit' });
		} catch (error) {
			console.error(`Error running ${finalAnswers.packageManager} install:`, error);
			process.exit(1);
		}
	}

	console.log(`✅ Project '${finalAnswers.projectName}' initialized in ${projectDir} using ${finalAnswers.compiler} and ${finalAnswers.packageManager}.`);
};

program
	.version(packageVersion)
	.description('Quickly set up Node.js projects with TypeScript')
	.argument('[projectName]', 'Name of the project')
	.option('-c, --compiler <compiler>', `Choose TypeScript compiler (${validCompilers.join(', ')})`)
	.option('-p, --package-manager <packageManager>', `Choose package manager (${validPackageManagers.join(', ')})`)
	.option('-i, --install', 'Run package installation after setup')
	.action(async (projectName: string, options: any) => {
		try {
			if (options.compiler && !validCompilers.includes(options.compiler)) {
				console.error(`\x1b[31mError:\x1b[0m Invalid compiler '${options.compiler}'. Choose one of: ${validCompilers.join(', ')}`);
				process.exit(1);
			}

			if (options.packageManager && !validPackageManagers.includes(options.packageManager)) {
				console.error(`\x1b[31mError:\x1b[0m Invalid package manager '${options.packageManager}'. Choose one of: ${validPackageManagers.join(', ')}`);
				process.exit(1);
			}

			const allOptionsProvided = projectName && options.compiler;

			const finalOptions = {
				projectName,
				compiler: options.compiler as Compilers | undefined,
				packageManager: options.packageManager as PackageManager | undefined,
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
