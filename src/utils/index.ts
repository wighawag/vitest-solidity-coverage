import API from 'solidity-coverage/api.js';
import utils from 'solidity-coverage/plugins/resources/plugin.utils.js';

export type Args = {
	skiptestfilesFiles?: string;
	solcoverjs?: string;
	temp?: string;
	matrix?: boolean;
	abi?: boolean;
};

export type NomiclabsUtilsNormalisedConfig = {
	workingDir: string;
	contractsDir: string;
	testDir: string;
	artifactsDir: string;
	logger: {log: null} | any; // TODO logger = config.logger ? config.logger : {log: null};
	solcoverjs: string;
	gasReporter: {enabled: false};
	matrix?: any; // TODO args.matrix;
};

export function createAPI(config: NomiclabsUtilsNormalisedConfig) {
	const api = new API(utils.loadSolcoverJS(config));

	// TODO skipFiles ?
	const skipFiles = api.skipFiles || [];
	let {targets, skipped} = utils.assembleFiles(config, skipFiles);
	targets = api.instrument(targets);

	return {config, api, skipped, targets};
}
