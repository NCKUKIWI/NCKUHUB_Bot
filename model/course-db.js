var connection = require('./mysql.js');
connection = connection.connection;
var dbsystem = require('../model/dba');
var api = require('./bot-api');
var db = new dbsystem();
var config = require('../config');

const disable = config.bot.disable;
const Feature = {
    NAME: 'name',
	TEACHER: 'teacher',
	PREFIX_HASHTAG: '#',
	PREFIX_AT: '@'
}

exports.init = function init(callback){
	console.log('Init ...');
	db.select().field(["課程名稱", "選課序號"]).from("course_new").where("選課序號!=", "").run(async function (data, err) {
		await callback(data, err)
	});

}

exports.askPlaceOrFollow = function askPlaceOrFollow(recipient, serial) {
	serial = serial.toUpperCase();
	db.select().field(["id", "系所名稱", "課程名稱", "老師", "時間"]).from("course_new").where("選課序號=", serial).run(function (course) {
		if (course.length > 0) {
            course = course[0];
			api.sendGenericTemplate(recipient,
				`你選擇的課程是：\n\n${course.系所名稱.replace(/[A-Z0-9]/g, "")}／${course.課程名稱.replace(/[（|）|\s]/g, "")}／${course.老師.replace(/\s/g, "")}／${course.時間}\n\n`, [{
						"type": "postback",
						"title": "尋找上課地點",
						"payload": api.postback.courseIdInfo.generator(course => course.id)(course)
					}, {
						"type": "postback",
						"title": "追蹤課程餘額",
						"payload": api.postback.courseIdFollow.generator(course => course.id)(course)
					}
				]);
		} else {
            api.sendCourseNotFoundMessage(recipient);
		}
	});
}

exports.sendById = function sendById(feature, recipient, serial) {
	serial = serial.toUpperCase();
	db.select().field(["id"]).from("course_new").where("選課序號=", serial).run(function (course) {
		if (course.length > 0) {
			switch (feature) {
				case Feature.PREFIX_HASHTAG:
					addFollowCourse(recipient, course[0].id);
					break;
				case Feature.PREFIX_AT:
					sendCourseInfo(recipient, course[0].id);
					break;
				default:
					break;
			}
		} else {
            api.sendCourseNotFoundMessage(recipient);
		}
	});
}

exports.sendByName = function sendByName(feature, sender, name, dpt, teacher) {
	let field = []
	let postback = null
	switch (feature) {
		case Feature.PREFIX_HASHTAG:
			field = ["id", "系所名稱", "課程名稱", "時間", "教室"]
			postback = api.postback.courseIdFollow.generator(course => course.id);
			break;
		case Feature.PREFIX_AT:
			field = ["id", "系所名稱", "課程名稱", "時間"]
			postback = 	api.postback.courseIdInfo.generator(course => course.id);
			break;
		default:
			break;
	}

	db.select().field(field).from("course_new").where("課程名稱 LIKE '%" + name + "%'").whereCheck("系所名稱 LIKE '%" + dpt + "%'", dpt).whereCheck("老師 LIKE '%" + teacher + "%'", teacher).run(function (course) {
		if (course.length > 0) {
			var subtitle;
			if (course.length > 30) {
				subtitle = "以下是找到的前 30 筆結果。若要精準搜尋，請輸入 @課程名稱 $系所 %老師名";
			} else {
				subtitle = "哎呀！我找到了這些，請問哪門是你要的呢 😇😇😇";
			}
			api.sendGenericTemplate(sender, subtitle,
				api.buttonsGenerator(course, null, "postback",
					api.courseTitle,
					postback));
		} else {
            api.sendCourseNotFoundMessage(sender);
		}
	});
}


exports.searchCourseBy = function searchCourseBy(feature, sender, featureCondition) {
	let condition = ''
	let postback = api.postback.courseIdAsk.generator(course => course.選課序號)

    switch (feature) {
        case Feature.NAME:
            condition = "課程名稱 LIKE '%" + featureCondition + "%'"
            break;
        case Feature.TEACHER:
            condition = "老師='"+ featureCondition + "'"
            break;    
        default:
            break;
    }

	db.select().field(["id", "系所名稱", "課程名稱", "時間", "選課序號"]).from("course_new").where(condition).where("選課序號!=", "").run(function (course) {
		if (course.length > 0) {
			var subtitle;
			if (course.length > 30) {
				subtitle = "以下是找到的前 30 筆結果。若要精準搜尋，請輸入 @課程名稱 $系所 %老師名 或 #課程名稱 $系所 %老師名";
			} else {
				subtitle = "哎呀！我找到了這些，請問哪門是你要的呢 😇😇😇";
			}
			api.sendGenericTemplate(sender, subtitle,
				api.buttonsGenerator(course, null, "postback",
					api.courseTitle,
					postback));
		} else {
            api.sendCourseNotFoundMessage(sender);
		}
	});
}
 // 把 db 操作跟 sendGeneric 拆開

function addFollowCourse(sender, course_id) {
	db.select().field(["id", "系所名稱", "系號", "課程名稱", "時間", "餘額", "選課序號", "老師"]).from("course_new").where("id=", course_id).run(function (course) {
		if (disable.indexOf(course[0]['系號']) == -1) {
            const noExtra = (course[0].餘額 > 0 ? "" : "這堂課目前無餘額，");
            db.select().field("*").from("follow").where("course_id=", course_id).where("fb_id=", sender).run(function (follow) {
                var text;
                if (follow.length < 1) {
                    text = "你選擇的課程是：\n\n" + course[0].系所名稱.replace(/[A-Z0-9]/g, "") + "／" + course[0].課程名稱.replace(/[（|）|\s]/g, "") + "／" + course[0].老師.replace(/\s/g, "") + "／" + course[0].時間 + "\n\n" + "已為你設定餘額追蹤，有餘額的時候會私訊通知你 👌";
                    var data = {
                        course_id: course_id,
                        fb_id: sender,
                        content: course[0].系所名稱.replace(/[A-Z0-9]/g, "") + "／" + course[0].課程名稱.replace(/[（|）|\s]/g, ""),
                        time: course[0].時間,
                        serial: (course[0].選課序號) ? course[0].選課序號 : "",
                        teacher: course[0].老師
                    };
                    db.insert().into("follow").set(data).run(function (result) {
                        db.insert().into("follow_copy").set(data).run(function (result) {}); // for record
                    });
                } else {
                    text = "你選擇的課程是：\n\n" + course[0].系所名稱.replace(/[A-Z0-9]/g, "") + "／" + course[0].課程名稱.replace(/[（|）|\s]/g, "") + "／" + course[0].老師.replace(/\s/g, "") + "／" + course[0].時間 + "\n\n" + noExtra + "你已經在追蹤這門課了噢 😎";
                }
                api.sendTextMessage(sender, text);
                api.sendGoodbye(sender);
            });
		} else {
			api.sendDisableMsg(sender, course[0]['系號']);
		}
	});
}

function sendCourseInfo(sender, course_id) {
	db.select().field(["系號", "系所名稱", "課程名稱", "時間", "教室", "老師"]).from("course_new").where("id=", course_id).run(function (course) {
		course[0].教室 = course[0].教室.replace(/\s/g, "");
		var text = "你選擇的課程是：\n\n" + course[0].系所名稱.replace(/[A-Z0-9]/g, "") + "／" + course[0].課程名稱.replace(/[（|）|\s]/g, "") + "／" + course[0].老師.replace(/\s/g, "") + "／" + course[0].時間;
		var url;
		var title;
		if (course[0].教室 == '') {
			url = "http://course-query.acad.ncku.edu.tw/qry/qry001.php?dept_no=" + course[0].系號;
			title = "點我查看上課地點";
		} else {
			text += "\n\n上課地點在「" + course[0].教室.replace(/\s/g, "") + "」唷 🏃🏃";
			url = "http://news.secr.ncku.edu.tw/var/file/37/1037/img/56/168451242.jpg";
			title = "查看成大地圖";
		}
		api.sendLink(sender, {
			description: text,
			url,
			title
		});
		api.sendGoodbye(sender);
	});
}

exports.Feature = Feature
