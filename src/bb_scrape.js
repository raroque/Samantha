var request = require('request');
var cheerio = require('cheerio');
var fs = require('fs');

http://www.bodybuilding.com/fun/arnold-schwarzeneggers-blueprint-to-cut-day-1.html

module.exports.scrape = function scrape(bbURL, cb) {
	
	var exercises = [];
	
	var options = {
        url : bbURL,
        headers:  {
            'User-Agent' : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.153 Safari/537.36'
        }
};

	request(options, function(error, response, body) {
	  if(error) {
	    console.log("Error: " + error);
	  }
	  console.log("Status code: " + response.statusCode);
	
	  var $ = cheerio.load(body);
	
	  $('div#dpg-plan-table > div.dpg-plan-exercises > div.dpgpt-content').each(function( index ) {
	  //  var title = $(this).find('h5.dpg-h5').text().trim();
	    var exercise = $(this).find('h4.dpg-h4').text().trim();
	    exercises.push(exercise);
	    var sets_and_reps = $(this).text().trim().replace(exercise, '');
	    var exercise_link = $(this).find('h4.dpg-h4 > a').attr('href');
	    var exercise_image = $(this).next().find('div.dpgpt-images > a > img').attr('src');
	  //  console.log("Title: " + title);
	    console.log("Exercise: " + exercise);
	    console.log("Sets and Reps: " + sets_and_reps);
	    console.log("Link: " + exercise_link);
	    console.log("image_link: " + exercise_image);
	 //   fs.appendFileSync('bb.txt' + '\n' + first_ex + '\n' + reps + '\n');
	  });
	  console.log("exercises are " + exercises.toString());
	  cb(exercises)
	
	});
}