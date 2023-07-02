import path from 'path';
import fs from 'fs';

import utils from 'solidity-coverage/plugins/resources/plugin.utils.js';
import nomiclabsUtils from 'solidity-coverage/plugins/resources/nomiclabs.utils.js';

import {EthereumProvider, HardhatConfig} from 'hardhat/types';
import {extendEnvironment, subtask, task} from 'hardhat/config.js';
import {
	TASK_COMPILE,
	TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT,
	TASK_COMPILE_SOLIDITY_GET_COMPILATION_JOB_FOR_FILE,
	TASK_COMPILE_SOLIDITY_LOG_COMPILATION_ERRORS,
} from 'hardhat/builtin-tasks/task-names.js';
import {HardhatError} from 'hardhat/internal/core/errors.js';
import {NomiclabsUtilsNormalisedConfig, createAPI} from './utils/index.js';
import {setupProviderWithCoverageSupport} from './provider.js';

const state: {
	measureCoverage: boolean;
	configureYulOptimizer: boolean;
	instrumentedSources?: {[key: string]: string};
	optimizerDetails?: any; // TODO type
} = {
	// Toggled true for `coverage` task only.
	measureCoverage: false,
	configureYulOptimizer: false,
};

subtask(TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT).setAction(async (_, {config}, runSuper) => {
	const solcInput = await runSuper();
	if (state.measureCoverage && state.instrumentedSources) {
		// The source name here is actually the global name in the solc input,
		// but hardhat uses the fully qualified contract names.
		for (const [sourceName, source] of Object.entries(solcInput.sources)) {
			const absolutePath = path.join(config.paths.root, sourceName);
			// Patch in the instrumented source code.
			if (absolutePath in state.instrumentedSources) {
				(source as any).content = state.instrumentedSources[absolutePath];
			}
		}
	}
	return solcInput;
});

// Solidity settings are best set here instead of the TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT task.
subtask(TASK_COMPILE_SOLIDITY_GET_COMPILATION_JOB_FOR_FILE).setAction(async (_, __, runSuper) => {
	const compilationJob = await runSuper();
	if (state.measureCoverage && typeof compilationJob === 'object') {
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
		if (state.configureYulOptimizer) {
			if (state.optimizerDetails === undefined) {
				settings.optimizer.details = {
					yul: true,
					yulDetails: {
						stackAllocation: true,
					},
				};
				// Other configurations may work as well. This loads custom details from .solcoverjs
			} else {
				settings.optimizer.details = state.optimizerDetails;
			}
		}
	}
	return compilationJob;
});

// Suppress compilation warnings because injected trace function triggers
// complaint about unused variable
subtask(TASK_COMPILE_SOLIDITY_LOG_COMPILATION_ERRORS).setAction(async (_, __, runSuper) => {
	const defaultWarn = console.warn;

	if (state.measureCoverage) {
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
task('compile-for-coverage', 'Generates artifacts for coverage').setAction(async function (args, env) {
	let error: any | undefined;

	state.instrumentedSources = {};
	state.measureCoverage = true;
	try {
		const configFromHardhat: HardhatConfig & NomiclabsUtilsNormalisedConfig = nomiclabsUtils.normalizeConfig(
			env.config,
			args || {}
		);
		let config: NomiclabsUtilsNormalisedConfig = {
			workingDir: configFromHardhat.workingDir,
			contractsDir: configFromHardhat.contractsDir,
			testDir: configFromHardhat.testDir,
			artifactsDir: configFromHardhat.artifactsDir,
			logger: configFromHardhat.logger,
			solcoverjs: configFromHardhat.solcoverjs,
			gasReporter: configFromHardhat.gasReporter,
			matrix: configFromHardhat.matrix,
		};

		const {api, skipped, targets} = createAPI(config);

		for (const target of targets) {
			state.instrumentedSources[target.canonicalPath] = target.source;
		}

		utils.reportSkipped(config, skipped);

		state.optimizerDetails = api.solcOptimizerDetails;
		state.configureYulOptimizer = api.config.configureYulOptimizer;
		await env.run(TASK_COMPILE);
		await api.onCompileComplete(config);

		const data = api.getInstrumentationData();
		fs.writeFileSync('coverage-data.json', JSON.stringify({instrumentationData: data, config}, null, 2));
	} catch (e) {
		error = e;
	} finally {
		state.measureCoverage = false;
		state.instrumentedSources = undefined;
	}

	if (error !== undefined) throw new HardhatError(error as any);
});

extendEnvironment((env) => {
	if ((globalThis as any).COVERAGE) {
		const provider = setupProviderWithCoverageSupport(env);
		env.network.provider = provider as EthereumProvider;
	}
});
