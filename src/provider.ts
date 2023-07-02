import utils from 'solidity-coverage/utils.js';
import {HARDHAT_NETWORK_RESET_EVENT} from 'hardhat/internal/constants.js';
import PluginUI from 'solidity-coverage/plugins/resources/nomiclabs.ui.js';
import nomiclabsUtils from 'solidity-coverage/plugins/resources/nomiclabs.utils.js';

import fs from 'fs';
import type {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {createAPI} from './utils/index.js';

export function setupProviderWithCoverageSupport(env: HardhatRuntimeEnvironment): EIP1193ProviderWithoutEvents {
	const {config} = JSON.parse(fs.readFileSync('coverage-data.json', 'utf-8'));
	const {api} = createAPI(config);
	const ui = new PluginUI(config.logger.log);
	const provider = (() => {
		let actualProvider: EIP1193ProviderWithoutEvents | undefined;
		async function setup() {
			let network = await nomiclabsUtils.setupHardhatNetwork(env, api, ui);

			actualProvider = network.provider;

			const accounts = await utils.getAccountsHardhat(network.provider);
			const nodeInfo = await utils.getNodeInfoHardhat(network.provider);

			// Note: this only works if the reset block number is before any transactions have fired on the fork.
			// e.g you cannot fork at block 1, send some txs (blocks 2,3,4) and reset to block 2
			network.provider.on(HARDHAT_NETWORK_RESET_EVENT, async () => {
				await api.attachToHardhatVM(network.provider);
			});

			await api.attachToHardhatVM(network.provider);

			ui.report('hardhat-network', [nodeInfo.split('/')[1], env.network.name]);

			// Set default account (if not already configured)
			nomiclabsUtils.setNetworkFrom(network.config, accounts);

			// Run post-launch server hook;
			await api.onServerReady(config);

			nomiclabsUtils.collectTestMatrixData(config, env, api);

			return network.provider as EIP1193ProviderWithoutEvents;
		}
		async function request(args: {method: string; params?: any[]}) {
			if (!actualProvider) {
				actualProvider = await setup();
			}
			const result = await actualProvider.request(args);

			const data = api.getInstrumentationData();
			fs.writeFileSync('coverage-data.json', JSON.stringify({instrumentationData: data, config}, null, 2));
			return result;
		}
		return new Proxy(
			{},
			{
				get(target, p) {
					if (p === 'request') {
						return request;
					}
					return (actualProvider as any)[p];
				},
			}
		);
	})();

	return provider as EIP1193ProviderWithoutEvents;
}
