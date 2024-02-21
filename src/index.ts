import type {
	AfterSuiteRunMeta,
	CoverageProvider,
	CoverageProviderModule,
	ReportContext,
	ResolvedCoverageOptions,
	Vitest,
} from 'vitest';

import {createAPI} from './utils/index.js';
import {appendLog, resetLog} from './utils/debug.js';
import fs from 'fs';

async function report(instrumentationData: any, config: any) {
	const {api} = createAPI(config);
	api.setInstrumentationData(instrumentationData);

	fs.writeFileSync('.coverage-data.json', JSON.stringify({config, instrumentationData}, null, 2));

	await api.onTestsComplete(config);

	config.matrix ? await api.saveTestMatrix() : await api.report();

	await api.onIstanbulComplete(config);
}

export type InstrumentationData = {
	[key: string]: {
		id: number;
		locationIdx: number;
		type: 'branch' | string;
		contractPath: string;
		hits: number;
	};
};

function merge(dataA: InstrumentationData, dataB: InstrumentationData): InstrumentationData {
	if (!dataA) {
		return dataB;
	}
	if (!dataB) {
		return dataA;
	}
	const newData: InstrumentationData = {...dataA};
	for (const key of Object.keys(dataB)) {
		const b = dataB[key];
		const n = newData[key];
		if (n) {
			n.hits += b.hits;
		} else {
			newData[key] = b;
		}
	}
	return newData;
}

function getNumDiffHits(instrumentationData: any) {
	let count = 0;
	for (const key of Object.keys(instrumentationData)) {
		const v = instrumentationData[key];
		if (v.hits > 0) {
			count++;
		}
	}
	return count;
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
		(globalThis as any).COVERAGE = (globalThis as any).COVERAGE || 0;
		(globalThis as any).COVERAGE++;
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

			appendLog(`numDiffHits ${getNumDiffHits(instrumentationData)}`);
		}
		// now we return the data
		return {instrumentationData, config};
	},

	/**
	 * Executed after all tests have been run in the worker thread.
	 */
	stopCoverage() {
		appendLog(`stopCoverage`);
	},
};

class CustomCoverageProvider implements CoverageProvider {
	private instrumentationData: any | undefined;
	private config: any | undefined;
	private counter: number = 1;
	private suiteCounter = 0;

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
			this.instrumentationData = merge(this.instrumentationData, (meta.coverage as any).instrumentationData);
			this.config = (meta.coverage as any).config;
		}
	}
	async reportCoverage(reportContext?: ReportContext | undefined) {
		appendLog(`reportCoverage`);
		if (this.instrumentationData) {
			const keys = Object.keys(this.instrumentationData);
			appendLog(
				JSON.stringify(
					{
						numkeys: keys.length,
						first: this.instrumentationData[keys[0]],
					},
					null,
					2
				)
			);
		}

		await report(this.instrumentationData, this.config);
	}

	onFileTransform(sourceCode: string, id: string, pluginCtx: any) {
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
