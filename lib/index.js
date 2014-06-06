
var path    = require('path');
var events  = require('events');
var cp      = require('child_process');
var merge   = require('merge-recursive');
var which   = require('which').sync;

var PATH_SEP = process.platform.match(/^win/) ? ';' : ':';

exports.open = function(dir) {
	return new CommandRunner(dir);
};

exports.writeTo = function(stream) {
	return function(data) {
		stream.write(data);
	};
};

var CommandRunner = exports.CommandRunner = function(dir, env) {
	this.cwd = dir || process.cwd();
	this.env = env || process.env;

	// Add the node_modules/.bin directory to the PATH, unless it is defined manually
	if (! (env && env.PATH)) {
		this.env.PATH = this.env.PATH || process.env.PATH;
		this.env.PATH = path.join('node_modules', '.bin') + PATH_SEP + this.env.PATH;
	}

	this.queue = [ ];
	this.running = false;
	this.stopped = false;  // TODO

	this.lastResult = null;
};

CommandRunner.prototype = new events.EventEmitter();

CommandRunner.prototype.exec = function(cmd, args, opts) {
	this.queue.push({
		type: 'exec',
		cmd: cmd,
		args: args,
		opts: opts
	});
	return this._startQueue();
};

CommandRunner.prototype.chdir = function(dir) {
	this.queue.push({ type: 'chdir', dir: dir });
	return this._startQueue();
};

CommandRunner.prototype.then = function(callback) {
	this.queue.push({ type: 'callback', func: callback });
	return this._startQueue();
};

CommandRunner.prototype._startQueue = function() {
	process.nextTick(this._next.bind(this));
	return this;
};

CommandRunner.prototype._next = function() {
	if (this.queue.length) {
		if (! this.running) {
			this.running = true;
			this._run(this.queue.shift(), this._next.bind(this));
		}
	} else {
		this.running = false;
	}
};

CommandRunner.prototype._run = function(action, callback) {
	callback = async(callback);

	var done = function() {
		this.running = false;
		callback();
	}.bind(this);

	switch (action.type) {
		// Run a callback
		case 'callback':
			// If function takes a callback, run async
			if (action.func.length) {
				action.func.call(this, done);
			}
			// Otherwise, run sync
			else {
				action.func.call(this);
				done();
			}
		break;

		// Change the current working directory
		case 'chdir':
			this.dir = path.resolve(this.dir, action.dir);
			done();
		break;

		// Run a proc.spawn
		case 'exec':
			action.opts = merge.recursive(
				{env: { }},
				{env: this.env, cwd: this.cwd},
				action.opts || { }
			);

			var proc = cp.spawn(which(action.cmd), action.args || [ ], action.opts);

			this.lastPid = proc.pid;

			var output = '';
			var stdout = '';
			var stderr = '';

			proc.stdout.on('data', function(data) {
				stdout += String(data);
				output += String(data);
				this.emit('stdout', data);
			}.bind(this));

			proc.stderr.on('data', function(data) {
				stderr += String(data);
				output += String(data);
				this.emit('stderr', data);
			}.bind(this));

			proc.on('exit', function(code) {
				this.lastOutput = {
					stdout: stdout,
					stderr: stderr,
					output: output
				};
				this.emit('exit', code);
				done();
			}.bind(this));
		break;
	}
};

CommandRunner.prototype._emit = function(event) {
	return function() {
		var args = slice(arguments);
		args.shift(event);
		this.emit.apply(this, event);
	}.bind(this);
};

// ------------------------------------------------------------------

function slice(arr) {
	return Array.prototype.slice.call(arr);
}

function async(func) {
	return function() {
		process.nextTick(func);
	};
}

