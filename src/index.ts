import fs from 'fs';

import type {
	AfterSuiteRunMeta,
	CoverageProvider,
	CoverageProviderModule,
	ReportContext,
	ResolvedCoverageOptions,
	Vitest,
} from 'vitest';

import {createAPI} from './utils/index.js';

async function onTestComplete() {
	const {instrumentationData, config} = JSON.parse(fs.readFileSync('coverage-data.json', 'utf-8'));
	const {api} = createAPI(config);
	api.setInstrumentationData(instrumentationData);

	await api.onTestsComplete(config);

	config.matrix ? await api.saveTestMatrix() : await api.report();

	await api.onIstanbulComplete(config);
}

const CustomCoverageProviderModule: CoverageProviderModule = {
	getProvider(): CoverageProvider {
		return new CustomCoverageProvider();
	},
	startCoverage() {},
	stopCoverage() {},
	takeCoverage() {},
};

class CustomCoverageProvider implements CoverageProvider {
	resolveOptions(): ResolvedCoverageOptions {
		// TODO ?
		return {} as any;
	}
	clean(clean?: boolean | undefined) {}
	onAfterSuiteRun(meta: AfterSuiteRunMeta) {}
	async reportCoverage(reportContext?: ReportContext | undefined) {
		await onTestComplete();
	}
	onFileTransform?(sourceCode: string, id: string, pluginCtx: any) {}
	name = 'custom-coverage-provider';
	options!: ResolvedCoverageOptions;

	async initialize(ctx: Vitest) {
		this.options = ctx.config.coverage;
	}
}

export default CustomCoverageProviderModule;
