# command

A Node.js chainable, promise-based utility for running commands with child_process.spawn

## Install

```bash
$ npm install command
```

## Usage

```javascript
var command = require('command');

command.open('/some/directory/path')
	.on('stdout', command.writeTo(process.stdout))
	.on('stderr', command.writeTo(process.stderr))
	.chdir('..')
	.exec('ls')
	.then(function() {
		var stdout = this.lastOutput.stdout;
		if (! stdout.trim().length) {
			console.warn('No files found!');
		}
	});
```

