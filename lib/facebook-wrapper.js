/**
* Basic interaction with the Facebook API.
* Includes authentication functionality.
*
* Written from scratch to provide a light weight solution, in contrast with
* the encumbered everyauth and several existing Facebook modules.
*
* Partly inspired by the PHP API from Heroku, also written from scratch.
*/

var https = require('https');
var url = require('url');
var crypto = require('crypto');

var facebook_address = 'https://www.facebook.com';
var auth_dialog_path = '/dialog/oauth';
var graph_host = 'graph.facebook.com';
var graph_access_token_path = '/oauth/access_token';
var fql_query_host = 'api.facebook.com';
var fql_query_path = '/method/fql.query';

/**
* Facebook authentication. Provides the acess_token in the request object.
*/
exports.auth = function (options) {
	if (options === undefined) {
		throw Error('No options defined');
	}
	if (options.app_id === undefined) {
		throw Error('No app_id specified');
	}
	if (options.app_secret === undefined) {
		throw Error('No app_secret specified');
	}
	if (options.redirect_uri === undefined) {
		throw Error('No redirect_uri specified');
	}
	if (options.scope === undefined) {
		options.scope = '';
	}

	return function (request, response, next) {
		var error = request.query.error;
		var code = request.query.code; // authorization code
		var received_state = request.query.state; // anti-CSRF protection

		// The user refused to allow access
		if (error !== undefined) {
			var error_obj = Error(decodeURI(request.query.error_description));
			error_obj.error_reason = request.query.error_reason;
			error_obj.error_name = error;
			next(error_obj);

			// The user accepted. Let's get the authorization code.
		} else if (code === undefined) {
			var state = createState();
			request.session.state = state;
			var query = auth_dialog_path + '?client_id=' + options.app_id + '&redirect_uri=' + options.redirect_uri + '&scope=' + options.scope + '&state=' + state;
			var login_dialog = facebook_address + query;
			redirect(response, login_dialog);

			// The redirect URI was called. Let's get the access_token.
		} else if (received_state === request.session.state) {
			var query = graph_access_token_path + '?client_id=' + options.app_id + '&redirect_uri=' + options.redirect_uri + '&client_secret=' + options.app_secret + '&code=' + code;
			var opts = {
				host: graph_host,
				path: query
			};
			https.get(opts, function (res) {
				var token = "";
				res.on('data', function (chunk) {
					token += chunk;
				});
				res.on('end', function () {
					token = parseAccessToken(token);
					request.facebook = new Facebook(token);
					next();
				});
			});

			// Start from scratch to prevent request forgery
		} else {
			redirect(response, options.redirect_uri);
		}
	}
}

function parseAccessToken(token) {
	return url.parse('http://bogus.bog?' + token, true).query.access_token;
}

function createState() {
	var hash = crypto.createHash('md5');
	hash.update((Math.random()*(new Date().getTime())).toString());
	return hash.digest('hex');
}

function redirect(response, address) {
	response.end('<script>top.location.href=\"' + address + '\"</script>');
}

/**
* Interact with the Facebook API.
*
* Will use the Graph API and the FQL.
*
* @param access_token The authenticating access token
*/
function Facebook(access_token) {

	/**
	 * Send the https GET request (similar to curl in the Heroku example).
	 *
	 * @param opts Options for the https.get function
	 * @param callback The callback function
	 */
	function send(opts, callback) {
		https.get(opts, function (res) {
			var data = "";
			res.on('data', function (chunk) { data += chunk; });
			res.on('end', function () { callback(JSON.parse(data)); });
		});
	}

	/**
	* Make a Graph API call.
	*
	* @param target Path to the resource
	* @param callback Function to call when data is retrieved
	*/
	this.graph = function (target, callback) {
		var opts = {
			host: graph_host,
			path: (target + '&access_token=' + access_token)
		};
		send(opts, callback);
	}

	/**
	 * Make a FQL query.
	 *
	 * @param query The FQL query in string form
	 * @param callback Function to call when the data is available
	 */
	this.fql = function (query, callback) {
		var opts = {
			host: fql_query_host,
			path: (fql_query_path + '?query=' + encodeURIComponent(query) + '&format=json&access_token=' + access_token)
		};
		send(opts, callback);
	}
}
