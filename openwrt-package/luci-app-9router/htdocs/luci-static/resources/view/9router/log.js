'use strict';
'require view';
'require fs';
'require ui';
'require poll';
'require rpc';

var callLogRead = rpc.declare({
	object: 'log',
	method: 'read',
	params: [ 'lines', 'stream' ],
	expect: { log: [] }
});

return view.extend({
	load: function() {
		return Promise.all([
			fs.read('/var/log/9router.log').catch(function() { return null; }),
			fs.read('/etc/9router-data/service.log').catch(function() { return null; }),
			callLogRead(100).catch(function() { return []; })
		]);
	},

	render: function(data) {
		function filterSyslog(entries) {
			if (!Array.isArray(entries)) return '';
			var lines = [];
			for (var i = 0; i < entries.length; i++) {
				var msg = entries[i].msg || '';
				if (msg.indexOf('9router') !== -1 || msg.indexOf('node') !== -1) {
					lines.push(msg);
				}
			}
			return lines.join('\n');
		}

		var fileLog = (data[0] && data[0].trim().length > 0) ? data[0] :
		              ((data[1] && data[1].trim().length > 0) ? data[1] : null);
		var sysLog = filterSyslog(data[2]);
		var logContent = fileLog || (sysLog.length > 0 ? sysLog : null);

		var logTextarea = E('pre', {
			'class': 'cbi-input-textarea',
			'style': 'width: 100%; height: 500px; background: #0f172a; color: #38bdf8; font-family: monospace; font-size: 12px; padding: 12px; border-radius: 6px; overflow-y: scroll; white-space: pre-wrap; word-break: break-all; border: 1px solid #334155;'
		}, [ logContent || _('Waiting for 9router service output... (If service just started, click Refresh)') ]);

		function updateLog() {
			return Promise.all([
				fs.read('/var/log/9router.log').catch(function() { return null; }),
				fs.read('/etc/9router-data/service.log').catch(function() { return null; }),
				callLogRead(100).catch(function() { return []; })
			]).then(function(res) {
				var fLog = (res[0] && res[0].trim().length > 0) ? res[0] :
				           ((res[1] && res[1].trim().length > 0) ? res[1] : null);
				var sLog = filterSyslog(res[2]);
				var content = fLog || (sLog.length > 0 ? sLog : null);
				logTextarea.textContent = content || _('No log output recorded yet.');
				logTextarea.scrollTop = logTextarea.scrollHeight;
			});
		}

		poll.add(updateLog, 3);

		return E('div', { class: 'cbi-map' }, [
			E('h2', {}, [ _('9router AI Gateway - Service Logs') ]),
			E('div', { class: 'cbi-map-descr' }, [
				_('Live execution log from 9router Node.js background process (auto-refreshes every 3 seconds).'),
				E('span', { style: 'float: right;' }, [
					E('button', {
						class: 'btn cbi-button cbi-button-action',
						click: function() {
							return updateLog().then(function() {
								ui.addNotification(null, E('p', _('Log refreshed successfully.')), 'info');
							});
						}
					}, [ _('Refresh Log') ]),
					' ',
					E('button', {
						class: 'btn cbi-button cbi-button-reset',
						click: function() {
							return fs.exec('/usr/bin/truncate', ['-s', '0', '/var/log/9router.log'])
								.catch(function() {
									return fs.write('/var/log/9router.log', '');
								})
								.then(function() {
									logTextarea.textContent = _('Log cleared.');
									ui.addNotification(null, E('p', _('Log cleared.')), 'info');
								});
						}
					}, [ _('Clear Log') ])
				])
			]),
			E('div', { style: 'margin-top: 15px;' }, [
				logTextarea
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
