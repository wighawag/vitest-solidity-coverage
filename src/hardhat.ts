import path from 'path';
import fs from 'fs';
import PluginUI from 'solidity-coverage/plugins/resources/nomiclabs.ui';

import API from 'solidity-coverage/api';
import utils from 'solidity-coverage/plugins/resources/plugin.utils';
import nomiclabsUtils from 'solidity-coverage/plugins/resources/nomiclabs.utils';

import {subtask, task, types} from 'hardhat/config';
import {
	TASK_COMPILE,
	TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT,
	TASK_COMPILE_SOLIDITY_GET_COMPILATION_JOB_FOR_FILE,
	TASK_COMPILE_SOLIDITY_LOG_COMPILATION_ERRORS,
} from 'hardhat/builtin-tasks/task-names';
import {HardhatError} from 'hardhat/internal/core/errors';


// Toggled true for `coverage` task only.
let measureCoverage = false;
let configureYulOptimizer = false;
let instrumentedSources: any | undefined;
let optimizerDetails: any | undefined;

// UI for the task flags...
const ui = new PluginUI();

subtask(TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT).setAction(async (_, {config}, runSuper) => {
	const solcInput = await runSuper();
	if (measureCoverage) {
		// The source name here is actually the global name in the solc input,
		// but hardhat uses the fully qualified contract names.
		for (const [sourceName, source] of Object.entries(solcInput.sources)) {
			const absolutePath = path.join(config.paths.root, sourceName);
			// Patch in the instrumented source code.
			if (absolutePath in instrumentedSources) {
				(source as any).content = instrumentedSources[absolutePath];
			}
		}
	}
	return solcInput;
});

// Solidity settings are best set here instead of the TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT task.
subtask(TASK_COMPILE_SOLIDITY_GET_COMPILATION_JOB_FOR_FILE).setAction(async (_, __, runSuper) => {
	const compilationJob = await runSuper();
	if (measureCoverage && typeof compilationJob === 'object') {
		if (compilationJob.solidityConfig.settings === undefined) {
			compilationJob.solidityConfig.settings = {};
		}

		const {settings} = compilationJob.solidityConfig;
		if (settings.metadata === undefined) {
			settings.metadata = {};
		}
		if (settings.optimizer === undefined) {
			settings.optimizer = {};
		}
		// Unset useLiteralContent due to solc metadata size restriction
		settings.metadata.useLiteralContent = false;
		// Override optimizer settings for all compilers
		settings.optimizer.enabled = false;

		// This is fixes a stack too deep bug in ABIEncoderV2
		// Experimental because not sure this works as expected across versions....
		if (configureYulOptimizer) {
			if (optimizerDetails === undefined) {
				settings.optimizer.details = {
					yul: true,
					yulDetails: {
						stackAllocation: true,
					},
				};
				// Other configurations may work as well. This loads custom details from .solcoverjs
			} else {
				settings.optimizer.details = optimizerDetails;
			}
		}
	}
	return compilationJob;
});

// Suppress compilation warnings because injected trace function triggers
// complaint about unused variable
subtask(TASK_COMPILE_SOLIDITY_LOG_COMPILATION_ERRORS).setAction(async (_, __, runSuper) => {
	const defaultWarn = console.warn;

	if (measureCoverage) {
		console.warn = () => {};
	}
	await runSuper();
	console.warn = defaultWarn;
});

/**
 * Coverage task implementation
 * @param  {HardhatUserArgs} args
 * @param  {HardhatEnv} env
 */
task('compile-for-coverage', 'Generates artifacts for coverage')
	.addOptionalParam('testfiles', ui.flags.file, '', types.string)
	.addOptionalParam('solcoverjs', ui.flags.solcoverjs, '', types.string)
	.addOptionalParam('temp', ui.flags.temp, '', types.string)
	.addFlag('matrix', ui.flags.testMatrix)
	.addFlag('abi', ui.flags.abi)
	.setAction(async function (args, env) {
		let error;
		let ui;
		let api;
		let config;
		let failedTests = 0;

		instrumentedSources = {};
		measureCoverage = true;
		try {
			config = nomiclabsUtils.normalizeConfig(env.config, args);
			ui = new PluginUI(config.logger.log);
			api = new API(utils.loadSolcoverJS(config));

			optimizerDetails = api.solcOptimizerDetails;

			// Catch interrupt signals
			process.on('SIGINT', nomiclabsUtils.finish.bind(null, config, api, true));

			// Merge non-null flags into hardhatArguments
			const flags: any = {};
			for (const key of Object.keys(args)) {
				if (args[key] && args[key].length) {
					flags[key] = args[key];
				}
			}

			// ================
			// Instrumentation
			// ================

			const skipFiles = api.skipFiles || [];

			let {targets, skipped} = utils.assembleFiles(config, skipFiles);

			targets = api.instrument(targets);
			for (const target of targets) {
				instrumentedSources[target.canonicalPath] = target.source;
			}
			utils.reportSkipped(config, skipped);

			// ==============
			// Compilation
			// ==============
			ui.report('compilation', []);

			config.temp = args.temp;
			configureYulOptimizer = api.config.configureYulOptimizer;

			// With Hardhat >= 2.0.4, everything should automatically recompile
			// after solidity-coverage corrupts the artifacts.
			// Prior to that version, we (try to) save artifacts to a temp folder.
			if (!config.useHardhatDefaultPaths) {
				const {tempArtifactsDir, tempContractsDir} = utils.getTempLocations(config);

				utils.setupTempFolders(config, tempContractsDir, tempArtifactsDir);
				config.paths.artifacts = tempArtifactsDir;
				config.paths.cache = nomiclabsUtils.tempCacheDir(config);
			}

			await env.run(TASK_COMPILE);

			await api.onCompileComplete(config);

			const data = api.getInstrumentationData();
			fs.writeFileSync('coverage-data.json', JSON.stringify(data, null, 2));
		} catch (e) {
			error = e;
		} finally {
			measureCoverage = false;
		}

		await nomiclabsUtils.finish(config, api, false);

		if (error !== undefined) throw new HardhatError(error as any);
		if (failedTests > 0) throw new HardhatError(ui.generate('tests-fail', [failedTests]));
	});
