'use strict';

const apiai = require('apiai');
const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('node-uuid');
const request = require('request');
const JSONbig = require('json-bigint');
const async = require('async');

const REST_PORT = (process.env.PORT || 5000);
const APIAI_ACCESS_TOKEN = process.env.APIAI_ACCESS_TOKEN;
const APIAI_LANG = process.env.APIAI_LANG || 'en';
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const apiAiService = apiai(APIAI_ACCESS_TOKEN, {language: APIAI_LANG, requestSource: "fb"});
const sessionIds = new Map();

var timer = null;

var mongodb = require('mongodb');
var uri = 'mongodb://heroku_pjktj26b:4g8si3lacn97htocjh02snl90s@ds145158.mlab.com:45158/heroku_pjktj26b';

function processEvent(event) {
    var sender = event.sender.id.toString();

    if ((event.message && event.message.text) || (event.postback && event.postback.payload)) {
        var text = event.message ? event.message.text : event.postback.payload;
        // Handle a text message from this sender

        if (!sessionIds.has(sender)) {
            sessionIds.set(sender, uuid.v1());
        }
		
        console.log("Text", text);

        let apiaiRequest = apiAiService.textRequest(text,
            {
                sessionId: sessionIds.get(sender)
            });

        apiaiRequest.on('response', (response) => {
            if (isDefined(response.result)) {
                let responseText = response.result.fulfillment.speech;
                let responseData = response.result.fulfillment.data;
                let action = response.result.action;

                if (isDefined(responseData) && isDefined(responseData.facebook)) {
                    if (!Array.isArray(responseData.facebook)) {
                        try {
                            console.log('Response as formatted message');
                            sendFBMessage(sender, responseData.facebook);
                        } catch (err) {
                            sendFBMessage(sender, {text: err.message});
                        }
                    } else {
                        async.eachSeries(responseData.facebook, (facebookMessage, callback) => {
                            try {
                                if (facebookMessage.sender_action) {
                                    console.log('Response as sender action');
                                    sendFBSenderAction(sender, facebookMessage.sender_action, callback);
                                }
                                else {
                                    console.log('Response as formatted message');
                                    sendFBMessage(sender, facebookMessage, callback);
                                }
                            } catch (err) {
                                sendFBMessage(sender, {text: err.message}, callback);
                            }
                        });
                    }
                } else if (isDefined(responseText)) {
                    console.log('Response as text message');
                    // facebook API limit for text length is 320,
                    // so we must split message if needed
                    
                    if (action == "samantha.list") {
	                    console.log("user asked for list")
	                    mongoFind(function(array) {
		                    console.log("now this array is called");
		                    var splittedText = splitResponse("here is your list: " + array);

	                        async.eachSeries(splittedText, (textPart, callback) => {
	                            sendFBMessage(sender, {text: textPart}, callback);
	                        });
	                    });
                        
                    } else if (action == "samantha.list.modify") {
	                    let list_action = response.result.parameters.list_action;
	                    let item_to_modify = response.result.parameters.item_to_modify;
	                    
	                    if (list_action == "add") {
		                    console.log("action was add " + item_to_modify);
		                    mongoAdd(item_to_modify, function() {
			                    console.log("done adding, sending a message");
			                    var splittedText = splitResponse("Added " + item_to_modify + " to your list!");
	
		                        async.eachSeries(splittedText, (textPart, callback) => {
		                            sendFBMessage(sender, {text: textPart}, callback);
		                        });
		                    });
	                    } else if (list_action == "remove") {
		                    console.log("action was remove");
		                    mongoPull(item_to_modify, function() {
			                    console.log("done removing, sending a message");
			                    var splittedText = splitResponse("Removed " + item_to_modify + " from your list!");
	
		                        async.eachSeries(splittedText, (textPart, callback) => {
		                            sendFBMessage(sender, {text: textPart}, callback);
		                        });
		                    });
	                    } else if (list_action == "read") {
		                    console.log("action was read");
		                    mongoFind(function(array) {
		                    console.log("now this array is called");
		                    var splittedText = splitResponse("here is your list: " + array);

	                        async.eachSeries(splittedText, (textPart, callback) => {
	                            sendFBMessage(sender, {text: textPart}, callback);
	                        });
	                    });
	                    }
                    } else {
	                    var splittedText = splitResponse(responseText);
	                    async.eachSeries(splittedText, (textPart, callback) => {
	                        sendFBMessage(sender, {text: textPart}, callback);
	                    });
                    }
                }
                
                if (action == "samantha.remind") {
	                console.log("reminder executed");
	                setTimeout(function() {
					    var splittedText = splitResponse("20 seconds has passed");

	                        async.eachSeries(splittedText, (textPart, callback) => {
	                            sendFBMessage(sender, {text: textPart}, callback);
	                        });
					}, 20000);
                }
                
                if (action == "samantha.pomo") {
	                let pomo_action = response.result.parameters.pomo_action;
	                let item_to_pomo = response.result.parameters.item_to_pomo;
	                
					if (pomo_action == "start") {
						startPomo(sender, true);
						var splittedText = splitResponse("I've started a timer, I'll message you when you can take a break :)");
			            async.eachSeries(splittedText, (textPart, callback) => {
			                sendFBMessage(sender, {text: textPart}, callback);
					} else if (pomo_action == "stop") {
						clearTimeout(timer);
						var splittedText = splitResponse("I've stopped the timer, hopefully that was helpful :)");
			            async.eachSeries(splittedText, (textPart, callback) => {
			                sendFBMessage(sender, {text: textPart}, callback);
			            });
					} else if (pomo_action == "pause") {
						var splittedText = splitResponse("Sorry, no progress will be made if I let you take a break early. You can only stop completely.");
			            async.eachSeries(splittedText, (textPart, callback) => {
			                sendFBMessage(sender, {text: textPart}, callback);
			            });
					}
	            
                }

            }
        });

        apiaiRequest.on('error', (error) => console.error(error));
        apiaiRequest.end();
    }
}

function createTimer(functoexecute, time) {
	timer = setTimeout(functoexecute, time);
}

function startPomo(sender, start) {
	if (start) {
		createTimer(function() {
		    var splittedText = splitResponse("Time for a break! I'll let you know when to get back to work :)");
			startPomo(sender, false);
            async.eachSeries(splittedText, (textPart, callback) => {
                sendFBMessage(sender, {text: textPart}, callback);
            });
        }, 20000);
	} else {
		createTimer(function() {
		    var splittedText = splitResponse("Time to get to work! I'll let you know when to stop");
			startPomo(sender, true);
            async.eachSeries(splittedText, (textPart, callback) => {
                sendFBMessage(sender, {text: textPart}, callback);
            });
        }, 5000);
	}
}

function mongoFind(cb) {
	var output = ""
	mongodb.MongoClient.connect(uri, function(err, db) {
		if(err) throw err;
		var songs = db.collection('tasks');
		songs.find().toArray(function(err, docs) {
			output = docs[0].todo.join(', ');
			console.log("output is " + output);
		//	output = docs[0].todo.toString();
			cb(output);
		});
	});
	
}

function mongoAdd(field, cb) {
	mongodb.MongoClient.connect(uri, function(err, db) {
		if(err) throw err;
		var tasks = db.collection('tasks');
		tasks.update(
			{ name: "Chris" },
			{ $addToSet: {todo: field} }
		);
		cb();
	});
}

function mongoPull(field, cb) {
	mongodb.MongoClient.connect(uri, function(err, db) {
		if(err) throw err;
		var tasks = db.collection('tasks');
		tasks.update(
			{ name: "Chris" },
			{ $pull: {todo: field} }
		);
		cb();
	});
}

function splitResponse(str) {
    if (str.length <= 320) {
        return [str];
    }

    return chunkString(str, 300);
}

function chunkString(s, len) {
    var curr = len, prev = 0;

    var output = [];

    while (s[curr]) {
        if (s[curr++] == ' ') {
            output.push(s.substring(prev, curr));
            prev = curr;
            curr += len;
        }
        else {
            var currReverse = curr;
            do {
                if (s.substring(currReverse - 1, currReverse) == ' ') {
                    output.push(s.substring(prev, currReverse));
                    prev = currReverse;
                    curr = currReverse + len;
                    break;
                }
                currReverse--;
            } while (currReverse > prev)
        }
    }
    output.push(s.substr(prev));
    return output;
}

function sendFBMessage(sender, messageData, callback) {
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: FB_PAGE_ACCESS_TOKEN},
        method: 'POST',
        json: {
            recipient: {id: sender},
            message: messageData
        }
    }, (error, response, body) => {
        if (error) {
            console.log('Error sending message: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        }

        if (callback) {
	        console.log('message sent: ', messageData.text);
            callback();
        }
    });
}

function sendFBSenderAction(sender, action, callback) {
    setTimeout(() => {
        request({
            url: 'https://graph.facebook.com/v2.6/me/messages',
            qs: {access_token: FB_PAGE_ACCESS_TOKEN},
            method: 'POST',
            json: {
                recipient: {id: sender},
                sender_action: action
            }
        }, (error, response, body) => {
            if (error) {
                console.log('Error sending action: ', error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
            }
            if (callback) {
                callback();
            }
        });
    }, 1000);
}

function doSubscribeRequest() {
    request({
            method: 'POST',
            uri: "https://graph.facebook.com/v2.6/me/subscribed_apps?access_token=" + FB_PAGE_ACCESS_TOKEN
        },
        (error, response, body) => {
            if (error) {
                console.error('Error while subscription: ', error);
            } else {
                console.log('Subscription result: ', response.body);
            }
        });
}

function isDefined(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    if (!obj) {
        return false;
    }

    return obj != null;
}

const app = express();

app.use(bodyParser.text({type: 'application/json'}));

app.get('/webhook/', (req, res) => {
    if (req.query['hub.verify_token'] == FB_VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);

        setTimeout(() => {
            doSubscribeRequest();
        }, 3000);
    } else {
        res.send('Error, wrong validation token');
    }
});

app.post('/webhook/', (req, res) => {
    try {
        var data = JSONbig.parse(req.body);

        if (data.entry) {
            let entries = data.entry;
            entries.forEach((entry) => {
                let messaging_events = entry.messaging;
                if (messaging_events) {
                    messaging_events.forEach((event) => {
                        if (event.message && !event.message.is_echo ||
                            event.postback && event.postback.payload) {
                            processEvent(event);
                        }
                    });
                }
            });
        }

        return res.status(200).json({
            status: "ok"
        });
    } catch (err) {
        return res.status(400).json({
            status: "error",
            error: err
        });
    }

});

app.listen(REST_PORT, () => {
    console.log('Rest service ready on port ' + REST_PORT);
});

doSubscribeRequest();
