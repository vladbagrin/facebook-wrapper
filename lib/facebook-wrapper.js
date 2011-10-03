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

var options;

/**
* Facebook authentication. Provides the acess_token in the request object.
*/
exports.auth = function (_options) {
	if (_options === undefined) {
		throw Error('No options defined');
	}
	if (_options.app_id === undefined) {
		throw Error('No app_id specified');
	}
	if (_options.app_secret === undefined) {
		throw Error('No app_secret specified');
	}
	if (_options.redirect_uri === undefined) {
		throw Error('No redirect_uri specified');
	}
	if (_options.scope === undefined) {
		_options.scope = '';
	}

	options = _options;
	return authenticate;
}

/**
 * Go through OAuth2 with CSRF and signed_request processing.
 */
function authenticate(request, response, next) {
	parseQuery(request);
	var error = request.query.error;
	var code = request.query.code; // authorization code
	var received_state = request.query.state; // anti-CSRF protection
	var signed_request = getSignedRequest(request);

	if (error !== undefined) { // The user refused to allow access
		var error_obj = Error(decodeURI(request.query.error_description));
		error_obj.error_reason = request.query.error_reason;
		error_obj.error_name = error;
		next(error_obj);
	} else if (signed_request !== null && signed_request['oauth_token'] !== undefined) { // The signed_request was provided
		request.facebook = new Facebook(signed_request['oauth_token']);
		next();
	} else if (code === undefined) { // No signed_request and need to ask for the authorization code
		redirectLoginForm(request, response);
	} else if (received_state === request.session.state) { // Got the code, need to request the access_token now
		getAccessToken(code, request, next);
	} else { // Start from scratch to prevent a request forgery
		redirect(response, options.redirect_uri);
	}
}

/**
* If the user didn't supply the connect.query function, we'll have to parse
* the query parameters ourselves.
*
* @param request The HTTP request
*/
function parseQuery(request) {
	if (request.query === undefined) {
		request.query = url.parse(request.url, true).query || {};
	}
}

/**
* Get the signed_request, if it exists in the HTTP request or the cookies.
*
* @param req The HTTP request
* @return JSON decoded signed_request object
*/
function getSignedRequest(req) {
	var data = null;
	if (req.body !== undefined && req.body['signed_request'] !== undefined) {
		data = req.body['signed_request'];
	} else if (req.cookies != undefined) {
		// I have little to no idea how this cookie will look like
		console.log('Got cookie: ' + JSON.stringify(req.cookie, null, '  '));
	}

	return data == null ? null : parseSignedRequest(data);
}

/**
* Parse a signed_request.
*
* @param data The request as a string
* @return JSON decoded signed request object
*/
function parseSignedRequest(payload_string) {
	payload = payload_string.split('.');
	var sig = payload[0];
	var data = JSON.parse(new Buffer(payload[1], 'base64').toString());

	if (data['algorithm'].toUpperCase() !== 'HMAC-SHA256') {
		console.log('Unknown signed_request hash algorithm: ' + data['algorithm']);
		return null;
	}
	var expected_sig = crypto.createHmac('sha256', options.app_secret);
	expected_sig.update(payload[1]);
	expected_sig = expected_sig.digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
	if (sig !== expected_sig) {
		console.log('Bad signed_request encoding.\n\tExpected: ' + expected_sig + '\n\tGot: ' + sig);
		return null;
	}

	return data;
}

/**
* Redirects the user to the login form.
*
* @param request
* @param response
*/
function redirectLoginForm(request, response) {
	var state = createState();
	request.session.state = state;
	var query = auth_dialog_path + '?client_id=' + options.app_id + '&redirect_uri=' + fullRedirectUri(request) + '&scope=' + options.scope + '&state=' + state;
	var login_dialog = facebook_address + query;
	redirect(response, login_dialog);
}

function redirect(response, address) {
	response.end('<script>top.location.href=\"' + address + '\"</script>');
}

function createState() {
	var hash = crypto.createHash('md5');
	hash.update((Math.random() * (new Date().getTime())).toString());
	return hash.digest('hex');
}

/**
* Get the access_token and call the next function.
*
* @param request
* @param next Jump to the next connect function
*/
function getAccessToken(code, request, next) {
	var query = graph_access_token_path + '?client_id=' + options.app_id + '&redirect_uri=' + fullRedirectUri(request) + '&client_secret=' + options.app_secret + '&code=' + code;
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
			if (res.code == 200) {
				token = parseAccessToken(token);
				request.facebook = new Facebook(token);
				next();
			} else {
				var error_obj = { message: 'Can\'t get access token', type: 'unknown'};
				var error = Error(error_obj.message);
				error.type = error_obj.type;
				next(error);
			}
		});
	});
}

function parseAccessToken(token) {
	return url.parse('http://bogus.bog?' + token, true).query.access_token;
}

function fullRedirectUri(request) {
	return encodeURIComponent(options.redirect_uri);
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
	function get(opts, callback) {
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
		get(opts, callback);
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
		get(opts, callback);
	}
}
