var request = require('request');
var _ = require('underscore');
var storage = require('node-persist');
storage.initSync();

var minion = function() {

    var config = {
        apiKey: process.env.MEETUP_APIKEY,
        group_id: '7595882', //7595882 = 1.5 Gen; 1556336 = API testing
    }
    var upcomingEvents = {}; // Used for current list of upcoming events and attendees at each event
    var oldUpcomingEvents = storage.getItem('upcomingEvents'); // Load last known list of upcoming events and attendees
    var attendees = storage.getItem('attendees');

    // Get the event ids for all upcoming events for the group
    var getEvents = (function() {
        var upcomingEventsArray = [];
        request('https://api.meetup.com/2/events?&photo-host=public&status=upcoming&group_id=' + config.group_id + '&page=20&only=id,time&key=' + config.apiKey,
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                    upcomingEventsArray = JSON.parse(body).results;
                    for (var i = 0; i < upcomingEventsArray.length; i++) { //adds new events we weren't yet tracking
                        //console.log(upcomingEventsArray[i].id);
                        if (upcomingEvents[upcomingEventsArray[i].id] == undefined) {
                            upcomingEvents[upcomingEventsArray[i].id] = {
                                'startTime': upcomingEventsArray[i].time
                            };
                        }
                    }
                }
                getAttendees(); // Now that we have the list of events, get all the attendees for each event
            });
    })();

    // TODO need a function that periodically cleans the upcomingEvents object of any events that are in the past or cancelled. 

    // TODO Update the list of upcoming events periodically (every day?)

    // For each upcoming event for a group, get the list of attendees and store them in upcomingEvents
    var getAttendees = function() {
        var tempResponse = []; // holds the JSON response of the list of attendees for an event
        var tempAttendees = []; // array placeholder for the list of attendees for an event

        for (var id in upcomingEvents) {
            (function(id) { //passing "id" by value so that when ajax callback tries to reference it, it'll get the right id
                if (upcomingEvents.hasOwnProperty(id)) {
                    //console.log('id = ' + id);
                    request('https://api.meetup.com/2/rsvps?&photo-host=public&rsvp=yes&event_id=' + id + '&page=20&key=' + config.apiKey,
                        function(error, response, body) {
                            if (!error && response.statusCode == 200) {
                                tempResponse = JSON.parse(body).results; // get an array of objects, each containing a member id
                                for (var i = 0; i < tempResponse.length; i++) { // extract the values from the objects and put them in a temp array
                                    //console.log('tempResponse = ' + tempResponse[i].member.member_id);
                                    tempAttendees.push(tempResponse[i].member.member_id);
                                }
                                upcomingEvents[id].attendees = tempAttendees; // map the list of attendees to the corresponding event id
                                tempAttendees = []; // empty the temp array for use for the next event
                            }
                        });
                }
            })(id);
        }
    };

    // Wait for all ajax calls to return
    setTimeout(function() {
        console.log(upcomingEvents);
        storage.setItem('upcomingEvents', upcomingEvents);
        console.log(oldUpcomingEvents);
        getRsvpCancelled();
    }, 5000)

    // Record who dropped out, when, and for what event 
    var logDifference = function(event_id, difference) {
        console.log('event_id: ' + event_id);
        console.log('dropped out attendee: ' + difference);
        if (attendees[difference] == undefined) {
            attendees[difference] = {};
        };
        if (attendees[difference].cancelled == undefined) {
            attendees[difference].cancelled = {};
        };
        attendees[difference].cancelled[event_id] = upcomingEvents[event_id].startTime - _.now();

        console.log(attendees);
        storage.setItem('attendees', attendees);
    }

    // Figure out who has dropped out
    var getRsvpCancelled = function() {
        if (_.isEqual(upcomingEvents, oldUpcomingEvents)) {
            console.log('events are equal!');
            return;
        } // if there are no RSVP changes, do nothing
        for (var event_id in upcomingEvents) {
            if (upcomingEvents.hasOwnProperty(event_id)) {
                var difference = [];
                difference = _.difference(oldUpcomingEvents[event_id].attendees, upcomingEvents[event_id].attendees);
                if (!(_.isEqual(difference, []))) {
                    logDifference(event_id, difference);
                }
            }
        }
    }
};

minion();
setInterval(function(){minion();},300000); // Do this every 5 min 
