'use strict';
'require view';
'require fs';
'require ui';
'require poll';

return view.extend({
	load: function() {
		return Promise.all([
			fs.read('/var/log/9router.log').catch(function() { return null; }),
			fs.read('/etc/9router-data/service.log').catch(function() { return null; })
		]);
	},

	render: function(data) {
		var logContent = (data[0] && data[0].trim().length > 0) ? data[0] :
		                 ((data[1] && data[1].trim().length > 0) ? data[1] : null);

		var logTextarea = E('pre', {
			'class': 'cbi-input-textarea',
			'style': 'width: 100%; height: 500px; background: #0f172a; color: #38bdf8; font-family: monospace; font-size: 12px; padding: 12px; border-radius: 6px; overflow-y: scroll; white-space: pre-wrap; word-break: break-all; border: 1px solid #334155;'
		}, [ logContent || _('No log output recorded yet. If the service just started, wait a few moments or click Refresh.') ]);

		function updateLog() {
			return Promise.all([
				fs.read('/var/log/9router.log').catch(function() { return null; }),
				fs.read('/etc/9router-data/service.log').catch(function() { return null; })
			]).then(function(res) {
				var content = (res[0] && res[0].trim().length > 0) ? res[0] :
				              ((res[1] && res[1].trim().length > 0) ? res[1] : null);
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
