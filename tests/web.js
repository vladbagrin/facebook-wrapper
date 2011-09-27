var facebook = require('../lib/facebook-api');
var express = require('express');
var fs = require('fs');
var config_file = 'config.json';

var options = JSON.parse(fs.readFileSync(config_file));

var server = express.createServer(
	express.logger(),
	express.cookieParser(),
	express.session({ secret: process.env.SESSION_SECRET || 'secret123' }),
	facebook.auth(options)
);

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

console.log('All is well');
