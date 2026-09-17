'use strict';
'require view';
'require form';
'require rpc';

var callServiceAction = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

return view.extend({
	render: function() {
		var m, s, o;

		m = new form.Map('9router', _('9router AI Gateway - Service Settings'),
			_('Configure background service, authentication, security, and hardware resource limits.'));

		s = m.section(form.NamedSection, 'config', '9router', _('Service Configuration'));
		s.anonymous = true;

		// Enabled
		o = s.option(form.Flag, 'enabled', _('Enable Service'), _('Start 9router service automatically at boot.'));
		o.rmempty = false;
		o.default = '1';

		// Port
		o = s.option(form.Value, 'port', _('Port'), _('HTTP listening port for the AI Gateway (Default: 20128).'));
		o.datatype = 'port';
		o.default = '20128';

		// Bind Host
		o = s.option(form.ListValue, 'bind_host', _('Listen Address'), _('Bind interface. 0.0.0.0 enables LAN/WiFi access.'));
		o.value('0.0.0.0', _('0.0.0.0 (All Interfaces / LAN + WAN)'));
		o.value('127.0.0.1', _('127.0.0.1 (Localhost Only)'));
		o.default = '0.0.0.0';

		// Require Auth
		o = s.option(form.Flag, 'require_auth', _('Require Authentication'), _('Enforce API Key for chat completions and password for dashboard. (Recommended)'));
		o.rmempty = false;
		o.default = '1';

		// API Key
		o = s.option(form.Value, 'api_key', _('Router API Key'), _('API key used by clients (e.g. NextChat, OpenCode, Cline, LibreChat).'));
		o.password = true;
		o.default = 'dsh-local-key';

		// Admin Password
		o = s.option(form.Value, 'admin_password', _('Dashboard Admin Password'), _('Initial password for accessing the 9router dashboard.'));
		o.password = true;
		o.default = 'admin123';

		// Enable UI
		o = s.option(form.Flag, 'enable_ui', _('Full Web Dashboard Active'), _('Keep Next.js Dashboard UI running. Disable if router has very low RAM (<256MB) to run in Ultra-Lite Gateway mode only.'));
		o.rmempty = false;
		o.default = '1';

		// RAM Limit
		o = s.option(form.ListValue, 'ram_limit', _('V8 RAM Memory Limit'), _('Maximum heap memory allocated for Node.js process.'));
		o.value('128', '128 MB (Ultra-Lite for 256MB Routers)');
		o.value('256', '256 MB (Standard Router - Recommended)');
		o.value('512', '512 MB (High-spec x86 / ARM64 Router)');
		o.default = '256';

		return m.render();
	}
});
