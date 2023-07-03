import fs from 'fs';

export function resetLog() {
	// fs.writeFileSync('log.txt', '');
}

export function appendLog(msg: string) {
	// let content = '';
	// try {
	// 	content = fs.readFileSync('log.txt', 'utf-8');
	// } catch {}
	// fs.writeFileSync('log.txt', content + msg + `\n`);
}
