import type {
	AfterSuiteRunMeta,
	CoverageProvider,
	CoverageProviderModule,
	ReportContext,
	ResolvedCoverageOptions,
	Vitest,
} from 'vitest';
import CoverageAPI from 'solidity-coverage/api';
import utils from 'solidity-coverage/utils';
import env from 'hardhat';
import nomiclabsUtils from 'solidity-coverage/plugins/resources/nomiclabs.utils';
import fs from 'fs';

async function onTestComplete() {
	// TODO args like compile-for-coverage
	const args = {};

	const config = nomiclabsUtils.normalizeConfig(env.config, args);
	const api = new CoverageAPI(config);
	let {targets, skipped} = utils.assembleFiles(config, []);
	targets = api.instrument(targets);

	await api.onTestsComplete(config);

	const data = JSON.parse(fs.readFileSync('coverage-data.json', 'utf-8'));
	api.setInstrumentationData(data);

	// =================================
	// Output (Istanbul or Test Matrix)
	// =================================
	// TODO args
	// args.matrix ? await api.saveTestMatrix() : await api.report();
	await api.report();

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
