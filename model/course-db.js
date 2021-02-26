var connection = require('./mysql.js');
connection = connection.connection;
var dbsystem = require('../model/dba');
var api = require('./bot-api');
var db = new dbsystem();
var config = require('../config');
var disableSQL = '';
const disable = config.bot.disable;

const Features = {
	NAME: 'name',
	TEACHER: 'teacher',
}

const Ops = {
	index: {
		FOLLOW: 0,
		INFO: 1,
		CANCEL_FOLLOW: 2,
		ASK_OP: 3,
		FOLLOW_INFO: 4
	},
	func: [{
		name: "courseIdFollow",
		generator: dataGetter => data => `#${dataGetter(data)}`,
		matcher: data => data.match(/^#[0-9]{1,}/i), //抓payload中的 courseId 用來追蹤課程
		replacer: data => data.replace(/#|\s/g, ""),
		do: (sender, courseIdFollow) => addFollowCourse(sender, courseIdFollow)
	}, {
		name: "courseIdInfo",
		generator: dataGetter => data => `@${dataGetter(data)}`,
		matcher: data => data.match(/^@[0-9]{1,}/i), //抓payload中的 courseId 用來傳送單一課程詳細資訊
		replacer: data => data.replace(/@|\s/g, ""),
		do: (sender, courseIdInfo) => sendCourseInfo(sender, courseIdInfo)
	}, {
		name: "courseIdCancel",
		generator: dataGetter => data => `&${dataGetter(data)}`,
		matcher: data => data.match(/^&[0-9]{1,}/i), //抓payload中的 courseId 用來取消追蹤課程
		replacer: data => data.replace(/&|\s/g, ""),
		do: (sender, courseIdCancel) => cancelFollowCourse(sender, courseIdCancel)

	}, {
		name: "courseIdAsk",
		generator: dataGetter => data => `ask${dataGetter(data)}`,
		matcher: data => data.match(/^ask[A-Z]{1,2}[0-9]{1,}/i), //抓payload中的 course.選課序號 用來傳送單一課程詳細資訊
		replacer: data => data.replace(/ask|\s/g, ""),
		do: (sender, courseIdAsk) => sendOpsBtn(sender, courseIdAsk)
	}, {
		name: "followInfo",
		generator: dataGetter => data => `f@${dataGetter(data)}`,
		matcher: data => data.match(/^f@[0-9]{1,}/i), //抓payload中的 course.選課序號 用來傳送單一課程詳細資訊
		replacer: data => data.replace(/f@|\s/g, ""),
		do: (sender, courseId) => sendUnfollowBtn(sender, courseId)
	}]
}

exports.checkCoureseRemain = function checkCoureseRemain() {
	if (disable.length > 0) {
		disableSQL += '系號 NOT IN(';
		for (var i in disable) {
			disableSQL += "\'" + disable[i] + "\'";
			if (i != disable.length - 1) disableSQL += ',';
		}
		disableSQL += ')';
	}
	db.select().field(["f.*", "c.餘額", "c.系號"]).from("follow f").join("course_new c").where("c.id=f.course_id").where(disableSQL).run(function (follow) {
		for (var i in follow) {
			if (follow[i].餘額 != 0 && follow[i].hadNotify == 0) {
				sendNotify(follow[i]);
			} else if (follow[i].餘額 == 0 && follow[i].hadNotify != 0) {
				db.update().table("follow").set({
					hadNotify: 0
				}).where("id=", follow[i].id).run(function (result) {});
			}
		}
	}, true);
}

exports.init = function init(callback) {
	console.log('Init ...');
	db.select().field(["課程名稱", "選課序號"]).from("course_new").where("選課序號!=", "").run(async function (data, err) {
		await callback(data, err)
	});

}

exports.sendFollowList = function sendFollowList(sender) {

	db.select().field(["*"]).from("follow").where("fb_id=", sender).run(function (datas) {
		if (datas.length > 0) {
			api.sendGenericTemplate(sender, "以下是你目前追蹤的課程，請點選要取消追蹤的課", api.getListBtn(datas, Ops.func[Ops.index.FOLLOW_INFO].generator));
		} else {
			var text = "目前沒有追蹤中的課程喔！";
			api.sendTextMessage(sender, text);
			// api.sendGoodbye(sender);
		}
	});
}

exports.getMatchFunc = function getMatchFunc(payload) {
	let purePayload = null
	for (let f of Ops.func) {
		if (f.matcher(payload)) {
			purePayload = f.replacer(f.matcher(payload)[0])
			return [purePayload, f]
		}
	}
	return [null, null];
}


function sendOpsBtn(recipient, serial) {
	serial = serial.toUpperCase();
	db.select().field(["id", "系所名稱", "課程名稱", "老師", "時間"]).from("course_new").where("選課序號=", serial).run(function (course) {
		if (course.length > 0) {
			course = course[0];
			operationsBtn = [{
				"type": "postback",
				"title": "尋找上課地點",
				"payload": Ops.func[Ops.index.INFO].generator(course => course.id)(course)
			}, {
				"type": "postback",
				"title": "追蹤課程餘額",
				"payload": Ops.func[Ops.index.FOLLOW].generator(course => course.id)(course)
			}]
			api.sendGenericTemplate(recipient,
				`你選擇的課程是：\n\n${course.系所名稱.replace(/[A-Z0-9]/g, "")}／${course.課程名稱.replace(/[（|）|\s]/g, "")}／${course.老師.replace(/\s/g, "")}／${course.時間}\n\n`, operationsBtn);
		} else {
			api.sendCourseNotFoundMessage(recipient);
		}
	});
}

exports.sendById = function sendById(index, recipient, serial) {
	serial = serial.toUpperCase();
	db.select().field(["id"]).from("course_new").where("選課序號=", serial).run(function (course) {
		if (course.length > 0) {
			switch (index) {
				case Ops.index.FOLLOW:
					addFollowCourse(recipient, course[0].id);
					break;
				case Ops.index.INFO:
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

exports.sendByName = function sendByName(index, sender, name, dpt, teacher) {
	let field = []
	let postback = null

	switch (index) {
		case Ops.index.FOLLOW:
			field = ["id", "系所名稱", "課程名稱", "時間", "教室"]
			postback = Ops.func[index].generator(course => course.id);
			break;
		case Ops.index.INFO:
			field = ["id", "系所名稱", "課程名稱", "時間"]
			postback = Ops.func[index].generator(course => course.id);
			break;
		default:
			break;
	}

	db.select().field(field).from("course_new").where("課程名稱 LIKE '%" + name + "%'").whereCheck("系所名稱 LIKE '%" + dpt + "%'", dpt).whereCheck("老師 LIKE '%" + teacher + "%'", teacher).run(function (course) {
		console.log(course);

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
	let payload = Ops.func[Ops.index.ASK_OP].generator(course => course.選課序號)

	switch (feature) {
		case Features.NAME:
			condition = "課程名稱 LIKE '%" + featureCondition + "%'"
			break;
		case Features.TEACHER:
			condition = "老師='" + featureCondition + "'"
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
					payload));
		} else {
			api.sendCourseNotFoundMessage(sender);
		}
	});
}
// 把 db 操作跟 sendGeneric 拆開
function sendNotify(course) {
	var text = "餘額通知（" + course.serial + "）！\n\n" + course.content + "／" + course.teacher + "／" + course.time + "\n\n恭喜，這門課出現餘額了！\n趕快去選吧 🏄 🏄";
	api.sendLink(course.fb_id, {
		"description": text,
		"url": "https://goo.gl/o8zPZH",
		"title": "進入選課頁面"
	});
	db.update().table("follow").set({
		hadNotify: 1
	}).where("id=", course.id).run(function (result) {
		//for record
		db.update().table("follow_copy").set({
			hadNotify: 1
		}).where("id=", course.id).run(function (result) {});
	});
}

function checkCoureseRemain() {
	db.select().field(["f.*", "c.餘額", "c.系號"]).from("follow f").join("course_new c").where("c.id=f.course_id").where(disableSQL).run(function (follow, err) {
		for (var i in follow) {
			if (follow[i].餘額 != 0 && follow[i].hadNotify == 0) {
				sendNotify(follow[i]);
			} else if (follow[i].餘額 == 0 && follow[i].hadNotify != 0) {
				db.update().table("follow").set({
					hadNotify: 0
				}).where("id=", follow[i].id).run(function (result) {});
			}
		}
	}, true);
}

function addFollowCourse(sender, courseId) {
	db.select().field(["id", "系所名稱", "系號", "課程名稱", "時間", "餘額", "選課序號", "老師"]).from("course_new").where("id=", courseId).run(function (course) {
		if (disable.indexOf(course[0]['系號']) == -1) {
			const noExtra = (course[0].餘額 > 0 ? "" : "這堂課目前無餘額，");
			db.select().field("*").from("follow").where("course_id=", courseId).where("fb_id=", sender).run(function (follow) {
				var text;
				if (follow.length < 1) {
					text = "你選擇的課程是：\n\n" + course[0].系所名稱.replace(/[A-Z0-9]/g, "") + "／" + course[0].課程名稱.replace(/[（|）|\s]/g, "") + "／" + course[0].老師.replace(/\s/g, "") + "／" + course[0].時間 + "\n\n" + "已為你設定餘額追蹤，有餘額的時候會私訊通知你 👌";
					var data = {
						course_id: courseId,
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
				// api.sendGoodbye(sender);
			});
		} else {
			api.sendDisableMsg(sender, course[0]['系號']);
		}
	});
}

exports.cancelAllFollowCourse = function cancelAllFollowCourse(sender) {
	db.delete().from("follow").where("fb_id=", sender).run(function (result) {
		var text = "沒問題，已經為你取消追蹤囉！";
		api.sendTextMessage(sender, text);
		// sendGoodbye(sender);
	});
}

function cancelFollowCourse(sender, follow_id) {
	db.delete().from("follow").where("fb_id=", sender).where("course_id=", follow_id).run(function (result) {
		text = "已經為你取消追蹤囉 🙂🙂";
		api.sendTextMessage(sender, text);
	});
}


function sendCourseInfo(sender, courseId) {
	db.select().field(["系號", "系所名稱", "課程名稱", "時間", "教室", "老師"]).from("course_new").where("id=", courseId).run(function (course) {
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
		// api.sendGoodbye(sender);
	});
}

function sendUnfollowBtn(sender, courseId) {
	db.select().field(["系號", "系所名稱", "課程名稱", "時間", "教室", "老師"]).from("course_new").where("id=", courseId).run(function (course) {
		course[0].教室 = course[0].教室.replace(/\s/g, "");
		let text = "你選擇的課程是：\n\n" + course[0].系所名稱.replace(/[A-Z0-9]/g, "") + "／" + course[0].課程名稱.replace(/[（|）|\s]/g, "") + "／" + course[0].老師.replace(/\s/g, "") + "／" + course[0].時間;
		text += "\n\n上課地點在「" + course[0].教室.replace(/\s/g, "") + "」唷 🏃🏃";
		unfollowBtn = [{
			"type": "postback",
			"title": "取消追蹤課程",
			"payload": "&" + courseId
		}]
		api.sendGenericTemplate(sender, text, unfollowBtn);
	});

}

exports.remindFollowUser = function remindFollowUser() {
	db.select().field(["fb_id"]).from("follow").run((user, error) => {
		// 使用Set不重複性質篩出不重複userId
		var userSet = new Set();
		user.forEach(i => userSet.add(i.fb_id));
		var userArr = Array.from(userSet);

		// 以每秒一則訊息的速度發送通知
		var i = 0;
		setInterval(function () {
			api.sendLink(userArr[i], {
				description: "提醒你!按讚刷新使用時間~🙂",
				url: "https://reurl.cc/bzDDqE",
				title: "這是什麼?"
			});
			i = i + 1;
			if (i >= userArr.length) {
				clearInterval(this);
			};
		}, 1000);
	});
}


exports.Features = Features
exports.Ops = Ops
exports.sendOpsBtn = sendOpsBtn
