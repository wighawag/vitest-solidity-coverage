import type {
	AfterSuiteRunMeta,
	CoverageProvider,
	CoverageProviderModule,
	ReportContext,
	ResolvedCoverageOptions,
	Vitest,
} from 'vitest';
import fs from 'fs';

import {createAPI} from './utils/index.js';
import {appendLog, resetLog} from './utils/debug.js';

async function report(instrumentationData: any, config: any) {
	if (!config) {
		const {instrumentationData: instrumentationDataFromFile, config: configFromFile} = JSON.parse(fs.readFileSync('coverage-data.json', 'utf-8'));
		config = configFromFile;
		instrumentationData = instrumentationDataFromFile;
	}
	const {api} = createAPI(config);
	api.setInstrumentationData(instrumentationData);

	await api.onTestsComplete(config);

	config.matrix ? await api.saveTestMatrix() : await api.report();

	await api.onIstanbulComplete(config);
}

const CustomCoverageProviderModule: CoverageProviderModule = {
	/**
	 * Factory for creating a new coverage provider
	 */
	getProvider(): CoverageProvider {
		resetLog();
		return new CustomCoverageProvider();
	},

	/**
	 * Executed before tests are run in the worker thread.
	 */
	startCoverage() {
		appendLog(`startCoverage`);
		// (globalThis as any).COVERAGE++;
	},

	/**
	 * Executed on after each run in the worker thread. Possible to return a payload passed to the provider
	 */
	takeCoverage() {
		appendLog(`takeCoverage`);
		let config;
		let instrumentationData;
		const state = (globalThis as any).COVERAGE_STATE;
		if (state) {
			config = state.config;
			instrumentationData = state.api.getInstrumentationData();
		} else {
			// this case is an error ?
			// no new instrumentationData is available, we take old from coverage-data.json
			const {instrumentationData: instrumentationDataFromFile, config: configFromFile} = JSON.parse(fs.readFileSync('coverage-data.json', 'utf-8'));
			config = configFromFile;
			instrumentationData = instrumentationDataFromFile;
		}


		// we used to write to file
		// fs.writeFileSync('coverage-data.json', JSON.stringify({instrumentationData: data, config}, null, 2));
		// now we return the data
		return {instrumentationData, config};
	},

	/**
	 * Executed after all tests have been run in the worker thread.
	 */
	stopCoverage() {
		appendLog(`stopCoverage`);

		// we used to save data, here we now do in takeCoverage
		// const {config, api} = (globalThis as any).COVERAGE_STATE;
		// const data = api.getInstrumentationData();
		// fs.writeFileSync('coverage-data.json', JSON.stringify({instrumentationData: data, config}, null, 2));
		// return data;
	},
};

class CustomCoverageProvider implements CoverageProvider {
	private instrumentationData: any | undefined;
	private config: any | undefined;
	private counter: number = 1;

	resolveOptions(): ResolvedCoverageOptions {
		appendLog(`resolveOptions`);
		return this.options;
	}
	clean(clean?: boolean | undefined) {
		appendLog(`clean`);
		this.counter++;
	}
	onAfterSuiteRun(meta: AfterSuiteRunMeta) {
		appendLog(`onAfterSuiteRun`);
		if (meta.coverage) {
			// we take data from `takeCoverage`
			this.instrumentationData = (meta.coverage as any).instrumentationData;
			this.config = (meta.coverage as any).config;
		}
	}
	async reportCoverage(reportContext?: ReportContext | undefined) {
		appendLog(`reportCoverage`);
		// appendLog(JSON.stringify(this.instrumentationData, null, 2));

		// we used to read from file
		// const {instrumentationData, config} = JSON.parse(fs.readFileSync('coverage-data.json', 'utf-8'));
		// we now get it from this (see `onAfterSuiteRun`)
		await report(this.instrumentationData, this.config);
	}
	onFileTransform?(sourceCode: string, id: string, pluginCtx: any) {
		// appendLog(`onFileTransform ${id}`);
		return `
		globalThis.COVERAGE=${this.counter};
		${sourceCode}
		`;
	}
	name = 'vitest-solidity-coverage';
	options!: ResolvedCoverageOptions;

	async initialize(ctx: Vitest) {
		appendLog(`initialize`);
		this.options = ctx.config.coverage;
	}
}

export default CustomCoverageProviderModule;
