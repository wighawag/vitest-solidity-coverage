# vitest-solidity-coverage

A vitest coverage provider + hardhat plugin to make solidity-coverage works with vitest

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

you can then do:

```bash
vitest run --coverage
```

Note we use `run` as this package does not support live-reload probably due to some race condition when using vitest threading.

If you want live reload of coverage you can run vitest this way

```bash
vitest --coverage --no-threads
```
