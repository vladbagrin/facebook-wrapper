About
=====

This is a basic wrapper to the Facebook API, designed to work with Connect and
Express in a simple and straightforward manner. I will hopefully add more
features and make it more robust in time. I will gladly accept contributions.

It was written from scratch, partly inspired by the PHP Facebook API wrapper
written by the developers at Heroku.

The available Node.js modules for Facebook use other oauth modules that do not
work well with a Facebook Application, the main reason I wrote this. For
instance, the redirect is not made with a js script, resulting in an ugly link
in the app canvas. They also seem unnecessarily complex when all we need is a
simple set of functions.

Installing
===============

Install via npm:

```javascript
npm install facebook-wrapper
```

How to use
=============

If using the Connect or Express frameworks, all that needs to be done is add
an authentication function in the server flow. After this function, the request
object will contain an object with a couple of API functions to interact with
the Graph API and FQL. The access_token is provided automatically.

Authentication
--------------

You must include the cookieParser() and session() before the facebook.auth
function, as it uses sessions to prevent a CSRF attack.

For now, the access_token and other data are not kept in the session variables,
for simplicity and redundancy (a good thing in some cases on Facebook).

Also, Facebook now requires all apps to parse the signed_request, so another
important middleware to add before facebook.auth is the bodyParser.

```javascript
var facebook = require('../lib/facebook-wrapper');
var express = require('express');
var options = {
	app_id: "YOUR APP ID",
	app_secret: "YOUR APP PRIVATE KEY",
	redirect_uri: "YOUR APP URL"
};

var server = express.createServer(
	express.logger(),
	express.bodyParser(),
	express.cookieParser(),
	express.session({ secret: 'secret123' }),
	facebook.auth(options)
);
```

Wrapper object
--------------

After the user has successfully authenticated, the request object will
have a "facebook" object.

Currently it has only 2 methods: graph and fql. They can be used given
a string just like using the Graph API explorer or the FQL web interface.

```javascript
server.post('/*', function (req, res) {
	res.writeHead(200, {'Content-Type': 'text/html'});
	req.facebook.graph('/me?fields=id', function (id) {
		id = id.id;
		req.facebook.fql('select name, pic_small from user where uid=me()', function (data) {
			data = data[0];
			res.end('Hello, ' + data.name + ' (' + id + '). Have a picture of yourself: <img src=\"' + data.pic_small + '\" />');
		});
	});
});
server.listen(8000);
```

Licence
=======

Copyright (C) 2011 Vlad Bagrin

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
