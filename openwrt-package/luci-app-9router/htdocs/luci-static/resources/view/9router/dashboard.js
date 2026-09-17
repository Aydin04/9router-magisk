'use strict';
'require view';
'require uci';
'require form';

return view.extend({
	render: function() {
		var port = uci.get('9router', 'config', 'port') || '20128';
		var host = window.location.hostname;
		var routerUrl = 'http://' + host + ':' + port;

		return E('div', { class: 'cbi-map' }, [
			E('h2', {}, [ _('9router AI Gateway Dashboard') ]),
			E('div', { class: 'cbi-map-descr' }, [
				_('Control and configure 385+ AI providers, models, combos, and API keys directly inside LuCI.'),
				E('span', { style: 'float: right;' }, [
					E('a', {
						class: 'btn cbi-button cbi-button-action',
						href: routerUrl,
						target: '_blank'
					}, [ _('Open Standalone Web UI ↗') ])
				])
			]),
			E('div', {
				style: 'width: 100%; height: calc(100vh - 190px); min-height: 650px; background: #0f172a; border-radius: 8px; overflow: hidden; border: 1px solid #334155; margin-top: 15px; position: relative;'
			}, [
				E('iframe', {
					src: routerUrl,
					style: 'width: 100%; height: 100%; border: none; display: block;',
					allow: 'clipboard-read; clipboard-write;'
				})
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
