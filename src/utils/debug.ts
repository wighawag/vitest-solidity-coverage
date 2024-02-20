import fs from 'fs';

export function resetLog() {
	if (process.env.COVERAGE_LOG_TXT) {
		fs.writeFileSync('log.txt', '');
	}
}

export function appendLog(msg: string) {
	if (process.env.COVERAGE_LOG_TXT) {
		let content = '';
		try {
			content = fs.readFileSync('log.txt', 'utf-8');
		} catch {}
		fs.writeFileSync('log.txt', content + msg + `\n`);
	}
}
