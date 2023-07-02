# vitest-solidity-coverage

A vitest coverage provider + hardhat plugin + library code to make solidity-coverage works with vitest

## how it works

it provide a hardhat task `compile-for-coverage` which generate artifact like the default solidity-coverage hardhat plugin do (except it only compiles)

So you call it this way

```bash
hardhat compile-for-coverage
```

It also provide a vitest coverage provider. You use it this way

add a vitest.config.ts

```typescript
import {defineConfig} from 'vitest/config';
export default defineConfig({
	test: {
		coverage: {
			provider: 'custom',
			customProviderModule: 'vitest-solidity-coverage',
		},
	},
});
```

You then need to use a special EIP-1193 provider in your test

You can get via the following

```typescript
import hre from 'hardhat';
import {setupProviderWithCoverageSupport} from 'vitest-solidity-coverage/provider';
const provider = await setupProviderWithCoverageSupport(hre);
```

you can then do:

```bash
vitest --coverage
```
