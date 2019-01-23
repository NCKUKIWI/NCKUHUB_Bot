var express = require('express');
var request = require('request');
var dayjs = require('dayjs');
var config = require('../config');
var router = express.Router();
var dbsystem = require('../model/dba');

const host = "https://bot.nckuhub.com";
const apiVersion = "v3.1";
const msg_url = `https://graph.facebook.com/${apiVersion}/me/messages`;
const varifyDescriptionLink = "https://懶人包";
const token = config.fb.token;
const disable = config.bot.disable;
var disableSQL = '';

/**
 * 載入設定 |START|
 */

//取得所有課程資料
var courseNameList = [];
var courseSerialList = [];
//定時通知餘額
var checkCourse;
var checkCourseStatus = 0;
//廣播訊息標籤
var broadcast_label = {};

if (disable.length > 0) {
	disableSQL += '系號 NOT IN(';
	for (var i in disable) {
		disableSQL += "\'" + disable[i] + "\'";
		if (i != disable.length - 1) disableSQL += ',';
	}
	disableSQL += ')';
}

var db = new dbsystem();
db.select().field(["課程名稱", "選課序號"]).from("course_new").where("選課序號!=", "").run(function (data, err) {
	for (var i in data) {
		courseNameList.push(data[i].課程名稱);
		courseSerialList.push(data[i].選課序號);
	}
});
checkCourse = setInterval(function () {
    checkCoureseRemain();
}, 1000 * 10);
// db.select().field("*").from("setting").where("id=", 1).run(function (data, err) {
// 	checkCourseStatus = data[0].status;
// 	if (checkCourseStatus == 1) {
// 		checkCourse = setInterval(function () {
// 			checkCoureseRemain();
// 		}, 1000 * 10);
// 	}
// });
db.select().field("*").from("fb_boardcast_labels").run(function (data, err) {
	data.forEach(aLabel => {
		broadcast_label[aLabel.label_name] = aLabel.label_id;
	});
});
db = null;

/**
 * 載入設定 |END|
 */

/**
 * 餘額通知機器人開關API |START|
 */

router.post('/openbot', function (req, res) {
	/*
	checkCourse = setInterval(function () {
		checkCoureseRemain();
	}, 1000 * 10);
	var db = new dbsystem();
	db.update().table("setting").set({
		status: 1
	}).where("id=", 1).run(function (result) {});
	checkCourseStatus = 1;
	*/
	res.send('ok');
});

router.post('/closebot', function (req, res) {
	clearInterval(checkCourse);
	var db = new dbsystem();
	db.update().table("setting").set({
		status: 0
	}).where("id=", 1).run(function (result) {});
	checkCourseStatus = 0;
	res.send('ok');
});

/**
 * 餘額通知機器人開關API |END|
 */

/**
 * 廣播訊息 |START|
 */

const msg_creative_url = `https://graph.facebook.com/${apiVersion}/me/message_creatives`;
const msg_broadcast_url = `https://graph.facebook.com/${apiVersion}/me/broadcast_messages`;
const subscribe_broadcast_url = label => `https://graph.facebook.com/${apiVersion}/${broadcast_label[label]}/label`;
const toCancelFollow = {
	"messages": [{
		"attachment": {
			"type": "template",
			"payload": {
				"template_type": "button",
				"text": "不想再收到 NCKU HUB 的訊息，請按以下按鈕：",
				"buttons": [{
					"type": "postback",
					"title": "取消訂閱",
					"payload": "cancelBroadcast"
				}]
			}
		}
	}]
};
const broadcastTextMsg = txt => ({
	"messages": [{
		"text": txt
	}]
});
const broadcastLinkMsg = (txt, url, title) => ({
	"messages": [{
		"attachment": {
			"type": "template",
			"payload": {
				"template_type": "button",
				"text": txt,
				"buttons": [{
					"type": "web_url",
					"url": url,
					"title": title,
					"webview_height_ratio": "tall"
				}]
			}
		}
	}]
});
const creativeMsgCb = target_label_id => resBody => {
	sendPostRequest({
		url: msg_broadcast_url,
		json: {
			message_creative_id: resBody.message_creative_id,
			notification_type: "REGULAR",
			messaging_type: "MESSAGE_TAG",
			tag: "NON_PROMOTIONAL_SUBSCRIPTION",
			custom_label_id: target_label_id
		}
	});
};

router.post('/sendmsg', function (req, res) {
	let reqType = {
		msg: req.body.msg || null,
		link: {
			title: req.body.linktitle,
			url: req.body.linkurl,
			description: req.body.linkdescription
		}
	};
	broadcastMsg(reqType, req.body.type);
	res.send('ok');
});

/**
 *
 * @param {Object} msgData {
		msg: String || null,
		link: {
			title: String,
			url: String,
			description: String
		}
	}
 * @param {String} broadcastType
 */
function broadcastMsg(msgData, broadcastType) {
	let broadcastTag = broadcastType === "broadcast" ? "all_user" : "tester";
	let target_label_id = broadcast_label[broadcastTag];
	console.log(`[廣播訊息] To: 『${broadcastTag}』 Msg: 『${JSON.stringify(msgData)}』`);
	if (msgData.msg) {
		if (msgData.msg == 'cancelBroadcast') {
			sendPostRequest({
				url: msg_creative_url,
				json: toCancelFollow
			}, creativeMsgCb(target_label_id));
		} else {
			sendPostRequest({
				url: msg_creative_url,
				json: broadcastTextMsg(msgData.msg)
			}, creativeMsgCb(target_label_id));
		}
	} else if (msgData.link.title && msgData.link.url) {
		sendPostRequest({
			url: msg_creative_url,
			json: broadcastLinkMsg(msgData.link.description, msgData.link.url, msgData.link.title)
		}, creativeMsgCb(target_label_id));
	}
}

function subscribeBroadcast(sender, isTester) {
	return sendPostRequest({
		url: subscribe_broadcast_url((isTester ? "tester" : "all_user")),
		json: {
			user: sender
		}
	});
}

function unsubscribeBroadcast(sender) {
	sendRequest({
		url: subscribe_broadcast_url(),
		method: "DELETE",
		qs: {
			user: sender
		}
	});
	sendTextMessage(sender, "成功！你以後將不會再收到NCKUHUB的廣播訊息！");
}

/**
 * 廣播訊息 |END|
 */

/**
 * 文章留言回覆相關宣告 |START|
 */

const forbidden_sender_my_page_name = 'NCKU HUB';
const cmt_keyword_helper = /小幫手/;
const cmt_keyword_course_selection = /.*一.*起.*準.*備.*選.*課.*/;

const cmt_reply = text => ({
	"message": text
});
const cmt_private_reply_hot_courses = cmt_reply("哈囉！雙手奉上成大最熱門追蹤的課程，NCKU HUB 祝你/妳選課順利，也歡迎使用我們的服務尋找課程心得唷！\n\n🎈 成大熱門課程：https://goo.gl/vZxsrW\n🎈 查詢選課心得：https://nckuhub.com\n");
const cmt_private_reply_helper = cmt_reply("你好，請再次輸入「小幫手」，以開啟 NCKU HUB 小幫手的功能唷！");
const cmt_random_reply = [
	"已經私訊給你囉，祝選課順利、開學快樂！",
	"已私訊，快去看訊息有沒有收到唷！",
	"去檢查收件夾吧，我們把熱門排行都放在那裡了！"
];

const get_cmt_reply_url = cid => `https://graph.facebook.com/${apiVersion}/${cid}/comments`;
const get_cmt_private_reply_url = cid => `https://graph.facebook.com/${apiVersion}/${cid}/private_replies`;

function cmtReply(response_cmt, cid) {
	return sendPostRequest({
		url: get_cmt_reply_url(cid),
		json: response_cmt
	});
}

function cmtPrivateReply(response_msg, cid) {
	return sendPostRequest({
		url: get_cmt_private_reply_url(cid),
		json: response_msg
	});
}

/**
 * 文章留言回覆相關宣告 |END|
 */

router.get('/', function (req, res) {
	if (req.query['hub.verify_token'] === 'testnckuhub') {
		res.send(req.query['hub.challenge']);
	} else {
		res.send('Error, wrong token');
	}
});

const postback = {
	courseIdFollow: {
		generator: dataGetter => data => `!${dataGetter(data)}`,
		matcher: data => data.match(/^![0-9]{1,}/i), //抓payload中的 course_id 用來追蹤課程
		replacer: data => data.replace(/!|\s/g, "")
	},
	courseIdCancel: {
		generator: dataGetter => data => `&${dataGetter(data)}`,
		matcher: data => data.match(/^&[0-9]{1,}/i), //抓payload中的 course_id 用來取消追蹤課程
		replacer: data => data.replace(/&|\s/g, "")
	},
	courseIdInfo: {
		generator: dataGetter => data => `@${dataGetter(data)}`,
		matcher: data => data.match(/^@[0-9]{1,}/i), //抓payload中的 course_id 用來傳送單一課程詳細資訊
		replacer: data => data.replace(/@|\s/g, "")
	},
	courseIdAsk: {
		generator: dataGetter => data => `ask${dataGetter(data)}`,
		matcher: data => data.match(/^ask[A-Z]{1,2}[0-9]{1,}/i), //抓payload中的 course.選課序號 用來傳送單一課程詳細資訊
		replacer: data => data.replace(/ask|\s/g, "")
	}
};

router.post('/', function (req, res) {
	let body = req.body;
	body.entry.forEach(function (anEntry) {
		if (anEntry.hasOwnProperty('changes')) { // 文章留言
			anEntry.changes.forEach(aChange => {
				if (aChange.field === 'feed' && aChange.value.hasOwnProperty('comment_id') && aChange.value.hasOwnProperty('message')) {
					const msg = aChange.value.message;
					const cid = aChange.value.comment_id;
					const sender = aChange.value.sender_name || aChange.value.from.name;
					if (sender != forbidden_sender_my_page_name) {
						console.log(`[粉專留言] 留言者：『${sender}』訊息：「${msg.replace(/\n/, "\\n")}」`);
						if (cmt_keyword_course_selection.test(msg)) { //留言 一起準備選課囉
							let rdnum = Math.floor(Math.random() * 3);
							let response_cmt = cmt_reply(cmt_random_reply[rdnum]);
							let response_msg = cmt_private_reply_hot_courses;
							cmtReply(response_cmt, cid);
							cmtPrivateReply(response_msg, cid);
						} else if (cmt_keyword_helper.test(msg)) { //留言 小幫手
							let response_msg = cmt_private_reply_helper;
							cmtPrivateReply(response_msg, cid);
						}
					}
				}
			});
		} else if (anEntry.hasOwnProperty('messaging')) { // Messenger
			anEntry.messaging.forEach(event => {
                var isVarify = false;
                var sender = event.sender.id; //使用者messenger id
                var db = new dbsystem();
                //檢查用戶是否通過驗證
                //使用者輸入
                if (event.message && event.message.text && typeof event.message.is_echo === "undefined") {
                    console.log(`[粉專私訊] 私訊者：${sender}`);
                    var text = event.message.text; //用戶傳送的訊息
                    console.log(`訊息：${text.replace(/\n/, "\\n")}`);
                    if (text.indexOf("小幫手") != -1) {
                        sendTextMessage(sender, "如需再次使用小幫手，請點選下方的選單點選你要使用的功能 👇🏻");
                        sendImage(sender, host + "/assets/images/howToUse.png");
                        return;
                    }
                    db.select().field(["id"]).from("messenger_code").where("fb_id=", sender).run(function (code) {
                        if (code.length > 0) {
                            isVarify = true;
                        }
                        console.log("是否解鎖: " + isVarify);
                        //未驗證然後輸入的為驗證碼
                        if (!isVarify && event.message.text.length == 20 && event.message.text.substring(0, 7) == "nckuhub") {
                            //找尋未用的驗證碼
                            db.select().field(["id"]).from("messenger_code").where("is_used=", 0).where("code=", event.message.text).run(function (code) {
                                if (code.length > 0) {
                                    code = code[0];
                                    db.update().table("messenger_code").set({
                                        is_used: 1,
                                        fb_id: sender,
                                        updated_at: dayjs().format('YYYY-MM-DD HH:mm:ss')
                                    }).where("id=", code.id).run(function (result) {
                                        sendTextMessage(sender, "恭喜你成功解鎖小幫手！立即點擊下方選單，選擇你想要使用的服務吧 🙌🏻 🙌🏻 🙌🏻");
                                        sendImage(sender, host + "/assets/images/howToUse.png");
                                    });
                                } else {
                                    sendTextMessage(sender, `Ooops！驗證未成功，會不會是驗證碼輸入錯了呢？\n請再次將你的驗證碼輸入在下方文字框，傳送給我們以進行解鎖唷 🔓🔑\n\n解鎖說明 👉🏻${varifyDescriptionLink}\n提供心得 👉🏻 https://nckuhub.com`);
                                }
                            });
                        } else {
                            var serial = text.replace(/[\s|\-]/g, "").match(/^[a-zA-Z][0-9]{4}/i);
                            if (serial) {
                                if (courseSerialList.indexOf(serial[0].toUpperCase()) !== -1) {
                                    if (! isVarify) {
                                        sendNotVarify(sender, "搜尋課程");
                                        return;
                                    }
                                    askPlaceOrFollow(sender, serial[0]);
                                    return;
                                }
                            } else if (courseNameList.indexOf(text) != -1) {
                                if (! isVarify) {
                                    sendNotVarify(sender, "搜尋課程");
                                    return;
                                }
                                searchCourseByName(sender, text);
                                return;
                            }
                            var teacher = text.match(/[\%|\uff05][\u4e00-\u9fa5]{1,}/i); //檢查 %老師名稱
                            var dpt = text.match(/[\$|\uff04][\u4e00-\u9fa5]{1,}/i); //檢查 $系所名稱
                            if (dpt) {
                                dpt = dpt[0].replace(/[\$|\uff04|\s]/g, ""); //過濾掉不該有的內容
                            }
                            if (teacher) {
                                teacher = teacher[0].replace(/[\%|\uff05|\s]/g, "");
                            }
                            if (text.indexOf('%') == 0) {
                                if (! isVarify) {
                                    sendNotVarify(sender, "搜尋課程");
                                    return;
                                }
                                searchCourseByTeacher(sender, teacher);
                            } else {
                                var courseNamePlace = text.match(/^[\uff20|@][\u4e00-\u9fa5]{1,}/i); //檢查 @課程名稱
                                if (courseNamePlace) {
                                    if (! isVarify) {
                                        sendNotVarify(sender, "尋找上課教室");
                                        return;
                                    }
                                    courseNamePlace = courseNamePlace[0].replace(/[\uff20|@|\s]/g, "");
                                    sendCoursePlaceByName(sender, courseNamePlace, dpt, teacher); //透過課程名稱搜尋並傳送課程地點
                                    return;
                                }
                                var courseSerialPlace = text.match(/^[\uff20|@][a-zA-Z0-9]{5}/i); //檢查 @選課序號
                                if (courseSerialPlace) {
                                    if (! isVarify) {
                                        sendNotVarify(sender, "尋找上課教室");
                                        return;
                                    }
                                    courseSerialPlace = courseSerialPlace[0].replace(/[\uff20|@|\s]/g, "");
                                    sendCoursePlaceById(sender, courseSerialPlace); //透過課程序號搜尋並傳送課程地點
                                    return;
                                }
                                var courseNameFollow = text.match(/^[#|\uff03][\u4e00-\u9fa5]{1,}/i); //檢查 #課程名稱
                                if (courseNameFollow) {
                                    if (! isVarify) {
                                        sendNotVarify(sender, "新增餘額追蹤");
                                        return;
                                    }
                                    courseNameFollow = courseNameFollow[0].replace(/[#|\uff03|\s]/g, "");
                                    sendFollowCourseByName(sender, courseNameFollow, dpt, teacher); //透過課程名稱搜尋並傳送追蹤課程按鈕
                                    return;
                                }
                                var courseSerialFollow = text.match(/^[#|\uff03][a-zA-Z0-9]{5}/i); //檢查 #選課序號
                                if (courseSerialFollow) {
                                    if (! isVarify) {
                                        sendNotVarify(sender, "新增餘額追蹤");
                                        return;
                                    }
                                    courseSerialFollow = courseSerialFollow[0].replace(/[#|\uff03|\s]/g, "");
                                    sendFollowCourseById(sender, courseSerialFollow); //透過選課序號搜尋並傳送追蹤課程按鈕
                                    return;
                                }
                                if (text[0] == "#" || text[0] == "@") {
                                    sendCourseNotFoundMessage(sender);
                                }
                            }
                        }
                    });
                } else if (event.postback) {  //點擊我們提供的按鈕
                    console.log(`[粉專按鈕] 點擊者：${sender}`);
                    console.log("按鈕payload: " + event.postback.payload);
                    db.select().field(["id"]).from("messenger_code").where("fb_id=", sender).run(function (code) {
                        if (code.length > 0) {
                            isVarify = true;
                        }
                        console.log("是否解鎖: " + isVarify);
                        var payload = event.postback.payload;
                        var title = event.postback.title;
                        if (payload == "開始使用") {
                            sendTextMessage(sender, "你好 👋\nNCKU HUB 小幫手的使命是幫助大家處理各種修課上的麻煩事，請點擊下方選單，選擇你需要的服務唷 ❗❗❗", function(){
                                sendTextMessage(sender, `提醒你，為了創造選課環境的正向循環，如欲使用「追蹤課程餘額」、「尋找上課教室」功能，需要請你先於 NCKU HUB 提供三門課程心得、完成小幫手解鎖唷 ❤\n\n解鎖說明 👉🏻${varifyDescriptionLink}\n提供心得 👉🏻 https://nckuhub.com\n\n完成填寫心得、取得驗證碼後，點擊下方選單即可開始使用囉 👇🏻`, function(){
                                    sendImage(sender, host + "/assets/images/howToUse.png");
                                });
                            });
                            return;
                        } else if (payload == "cancelBroadcast") {
                            unsubscribeBroadcast(sender);
                            return;
                        }
                        //以下為需要解鎖功能
                        if (! isVarify) {
                            sendNotVarify(sender, title);
                            return;
                        }
                        var courseIdFollow = postback.courseIdFollow.matcher(event.postback.payload); //抓payload中的 course_id 用來追蹤課程
                        var courseIdCancel = postback.courseIdCancel.matcher(event.postback.payload); //抓payload中的 course_id 用來取消追蹤課程
                        var courseIdInfo = postback.courseIdInfo.matcher(event.postback.payload); //抓payload中的 course_id 用來傳送單一課程詳細資訊
                        var courseIdAsk = postback.courseIdAsk.matcher(event.postback.payload);
                        if (payload == "nckuhubFollow") {
                            sendTextMessage(sender, "馬上為你追蹤課程餘額 👌\n\n請告訴我們課程名稱或選課序號，格式為「#微積分」或「#H3005」\n\n你也可以加上「$系所」、「%老師名」，來精準搜尋課程，例如「#微積分 $工資 %王哈伯」\n\n注意：本功能無法保證 100% 零延遲，NCKU HUB 並不會為各位的選課結果負責。");
                            return;
                        } else if (payload == "nckuhubDeleteFollow") {
                            sendDeleteFollowMenu(sender);
                            return;
                        } else if (payload == "nckuhubFindClassroom") {
                            sendTextMessage(sender, "馬上為你尋找上課教室 👌\n\n請告訴我們課程名稱或選課序號，格式為「@微積分」或「@H3005」\n\n你也可以加上「$系所」、「%老師名」，來精準搜尋課程，例如「@微積分 $工資 %王哈伯」");
                            return;
                        } else if (payload == "thankYou") {
                            sendTextMessage(sender, "不客氣，也謝謝你的使用 🙂");
                        } else if (payload == "cancelall") {
                            cancelAllFollowCourse(sender);
                        } else if (courseIdFollow) {
                            courseIdFollow = postback.courseIdFollow.replacer(courseIdFollow[0]);
                            addFollowCourse(sender, courseIdFollow);
                        } else if (courseIdCancel) {
                            courseIdCancel = postback.courseIdCancel.replacer(courseIdCancel[0]);
                            cancelFollowCourse(sender, courseIdCancel);
                        } else if (courseIdInfo) {
                            courseIdInfo = postback.courseIdInfo.replacer(courseIdInfo[0]);
                            sendCourseInfo(sender, courseIdInfo);
                        } else if (courseIdAsk) {
                            courseIdAsk = postback.courseIdAsk.replacer(courseIdAsk[0]);
                            askPlaceOrFollow(sender, courseIdAsk);
                        } else {
                            sendTextMessage(sender, event.postback.payload);
                        }
                    });
                }
			});
		}
	});
	res.sendStatus(200);
});

const aCourseButtonTitleGenerator = function (course) {
    return `${course.系所名稱.replace(/[A-Z0-9]/g, "")} ${course.課程名稱.replace(/[（|）|\s]/g, "")} ${course.時間}`;
}

function sendCoursePlaceByName(sender, name, dpt, teacher) {
	var db = new dbsystem();
	db.select().field(["id", "系所名稱", "課程名稱", "時間", "教室"]).from("course_new").where("課程名稱 LIKE '%" + name + "%'").whereCheck("系所名稱 LIKE '%" + dpt + "%'", dpt).whereCheck("老師 LIKE '%" + teacher + "%'", teacher).run(function (course) {
		db = null;
		if (course.length > 0) {
			var subtitle;
			if (course.length > 30) {
				subtitle = "以下是找到的前 30 筆結果。若要精準搜尋，請輸入 @課程名稱 $系所 %老師名";
			} else {
				subtitle = "哎呀！我找到了這些，請問哪門是你要的呢 😇😇😇";
			}
			sendGenericTemplate(sender, subtitle,
				buttonsGenerator(course, null, "postback",
					aCourseButtonTitleGenerator,
					postback.courseIdInfo.generator(course => course.id)));
		} else {
            sendCourseNotFoundMessage(sender);
		}
	});
}

function sendCoursePlaceById(sender, serial) {
	serial = serial.toUpperCase();
	var db = new dbsystem();
	db.select().field(["id"]).from("course_new").where("選課序號=", serial).run(function (course) {
		db = null;
		if (course.length > 0) {
			sendCourseInfo(sender, course[0].id);
		} else {
            sendCourseNotFoundMessage(sender);
		}
	});
}

function sendCourseInfo(sender, course_id) {
	var db = new dbsystem();
	db.select().field(["系號", "系所名稱", "課程名稱", "時間", "教室", "老師"]).from("course_new").where("id=", course_id).run(function (course) {
		db = null;
		course[0].教室 = course[0].教室.replace(/\s/g, "");
		var text = "你選擇的課程是：\n\n" + course[0].系所名稱.replace(/[A-Z0-9]/g, "") + "／" + course[0].課程名稱.replace(/[（|）|\s]/g, "") + "／" + course[0].老師.replace(/\s/g, "") + "／" + course[0].時間;
		var url;
		var title;
		if (course[0].教室 == '') {
			url = "http://course-query.acad.ncku.edu.tw/qry/qry001.php?dept_no=" + course[0].系號;
			title = "點我查看上課地點";
		} else {
			text += "\n\n上課地點在「" + course[0].教室.replace(/\s/g, "") + "」唷！";
			url = "http://www.stat.ncku.edu.tw/workshop/information/map_NCKUPlan.asp";
			title = "查看成大地圖";
		}
		sendLink(sender, {
			description: text,
			url,
			title
		});
		sendGoodbye(sender);
	});
}

function sendFollowCourseByName(sender, name, dpt, teacher) {
	var db = new dbsystem();
	db.select().field(["id", "系所名稱", "課程名稱", "時間"]).from("course_new").where("課程名稱 LIKE '%" + name + "%'").whereCheck("系所名稱 LIKE '%" + dpt + "%'", dpt).whereCheck("老師 LIKE '%" + teacher + "%'", teacher).run(function (course) {
		db = null;
		if (course.length > 0) {
			var subtitle;
			if (course.length > 30) {
				subtitle = "以下是找到的前 30 筆結果。若要精準搜尋，請輸入 #課程名稱 $系所 %老師名";
			} else {
				subtitle = "哎呀！我找到了這些，請問哪門是你要的呢 😇😇😇";
			}
			sendGenericTemplate(sender, subtitle,
				buttonsGenerator(course, null, "postback",
					aCourseButtonTitleGenerator,
					postback.courseIdFollow.generator(course => course.id)));
		} else {
            sendCourseNotFoundMessage(sender);
		}
	});
}

function sendFollowCourseById(sender, serial) {
	serial = serial.toUpperCase();
	var db = new dbsystem();
	db.select().field(["id"]).from("course_new").where("選課序號=", serial).run(function (course) {
		if (course.length > 0) {
			addFollowCourse(sender, course[0].id);
		} else {
            sendCourseNotFoundMessage(sender);
		}
	});
}

function addFollowCourse(sender, course_id) {
	var db = new dbsystem();
	db.select().field(["id", "系所名稱", "系號", "課程名稱", "時間", "餘額", "選課序號", "老師"]).from("course_new").where("id=", course_id).run(function (course) {
		if (disable.indexOf(course[0]['系號']) == -1) {
            const noExtra = (course[0].餘額 > 0 ? "" : "這堂課目前無餘額，");
            db.select().field("*").from("follow").where("course_id=", course_id).where("fb_id=", sender).run(function (follow) {
                var text;
                if (follow.length < 1) {
                    text = "你選擇的課程是：\n\n" + course[0].系所名稱.replace(/[A-Z0-9]/g, "") + "／" + course[0].課程名稱.replace(/[（|）|\s]/g, "") + "／" + course[0].老師.replace(/\s/g, "") + "／" + course[0].時間 + "\n\n" + noExtra + "已為你設定追蹤 👌 有餘額的時候會私訊你唷！請抱著既期待又怕受傷害的心情等候 🙌🙌";
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
                    text = "你選擇的課程是：\n\n" + course[0].系所名稱.replace(/[A-Z0-9]/g, "") + "／" + course[0].課程名稱.replace(/[（|）|\s]/g, "") + "／" + course[0].老師.replace(/\s/g, "") + "／" + course[0].時間 + "\n\n" + noExtra + "已經為你設定過追蹤囉！";
                }
                sendTextMessage(sender, text);
                sendGoodbye(sender);
            });
		} else {
			sendDisableMsg(sender, course[0]['系號']);
		}
	});
}

function sendDeleteFollowMenu(sender) {
	var db = new dbsystem();
	db.select().field(["*"]).from("follow").where("fb_id=", sender).run(function (follow) {
		db = null;
		if (follow.length > 0) {
			sendGenericTemplate(sender, "以下是你目前追蹤的課程，請問要取消追蹤哪一個呢？",
				buttonsGenerator(follow, {
						"type": "postback",
						"title": "全部取消追蹤",
						"payload": "cancelall",
					},
					"postback",
					aFollow => `${aFollow.content.replace(/\uff0f/g, " ")} ${aFollow.serial}`,
					postback.courseIdCancel.generator(aFollow => aFollow.id)));
		} else {
			var text = "目前沒有追蹤中的課程喔！";
			sendTextMessage(sender, text);
			sendGoodbye(sender);
		}
	});
}

function cancelFollowCourse(sender, follow_id) {
	var db = new dbsystem();
	db.select().field(["content", "teacher", "time"]).from("follow").where("id=", follow_id).run(function (follow) {
		var text;
		if (follow.length > 0) {
			text = "你選擇的課程是：\n\n" + follow[0].content + "／" + follow[0].teacher + "／" + follow[0].time + "\n\n已經為你取消追蹤囉 🙂🙂";
			db.delete().from("follow").where("id=", follow_id).run(function (result) {});
		} else {
			text = "已經為你取消追蹤囉 🙂🙂";
		}
		sendTextMessage(sender, text);
		sendGoodbye(sender);
	});
}

function cancelAllFollowCourse(sender) {
	var db = new dbsystem();
	db.delete().from("follow").where("fb_id=", sender).run(function (result) {
		var text = "沒問題，已經為你取消追蹤囉！";
		sendTextMessage(sender, text);
		sendGoodbye(sender);
	});
}

function checkCoureseRemain() {
	var db = new dbsystem();
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

function sendNotify(course) {
    var text = "餘額通知（" + course.serial + "）！\n\n" + course.content + "／" + course.teacher + "／" + course.time + "\n\n這門課有餘額了！趕快去選吧 🏄🏄";
    sendLink(course.fb_id, {
        "description": text,
        "url": "https://goo.gl/o8zPZH",
        "title": "進入選課頁面"
    });
	var db = new dbsystem();
	db.update().table("follow").set({
		hadNotify: 1
	}).where("id=", course.id).run(function (result) {
		//for record
		db.update().table("follow_copy").set({
			hadNotify: 1
		}).where("id=", course.id).run(function (result) {
			db = null;
		});
	});
}

function searchCourseByName(sender, name) {
	var db = new dbsystem();
	db.select().field(["id", "系所名稱", "課程名稱", "時間", "選課序號"]).from("course_new").where("課程名稱=", name).where("選課序號!=", "").run(function (course) {
		db = null;
		if (course.length > 0) {
            console.log(course);
			var subtitle;
			if (course.length > 30) {
				subtitle = "以下是找到的前 30 筆結果。若要精準搜尋，請輸入 @課程名稱 $系所 %老師名 或 #課程名稱 $系所 %老師名";
			} else {
				subtitle = "哎呀！我找到了這些，請問哪門是你要的呢 😇😇😇";
			}
			sendGenericTemplate(sender, subtitle,
				buttonsGenerator(course, null, "postback",
					aCourseButtonTitleGenerator,
					postback.courseIdAsk.generator(course => course.選課序號)));
		} else {
            sendCourseNotFoundMessage(sender);
		}
	});
}

function searchCourseByTeacher(sender, teacher) {
	var db = new dbsystem();
	db.select().field(["id", "系所名稱", "課程名稱", "時間", "選課序號"]).from("course_new").where("老師=", teacher).where("選課序號!=", "").run(function (course) {
		db = null;
		if (course.length > 0) {
			var subtitle;
			if (course.length > 30) {
				subtitle = "以下是找到的前 30 筆結果。若要精準搜尋，請輸入 @課程名稱 $系所 %老師名 或 #課程名稱 $系所 %老師名";
			} else {
				subtitle = "哎呀！我找到了這些，請問哪門是你要的呢 😇😇😇";
			}
			sendGenericTemplate(sender, subtitle,
				buttonsGenerator(course, null, "postback",
					aCourseButtonTitleGenerator,
					postback.courseIdAsk.generator(course => course.選課序號)));
		} else {
            sendCourseNotFoundMessage(sender);
		}
	});
}

function askPlaceOrFollow(sender, serial) {
	serial = serial.toUpperCase();
	var db = new dbsystem();
	db.select().field(["id", "系所名稱", "課程名稱", "老師", "時間"]).from("course_new").where("選課序號=", serial).run(function (course) {
		db = null;
		if (course.length > 0) {
            course = course[0];
			sendGenericTemplate(sender,
				`你選擇的課程是：\n\n${course.系所名稱.replace(/[A-Z0-9]/g, "")}／${course.課程名稱.replace(/[（|）|\s]/g, "")}／${course.老師.replace(/\s/g, "")}／${course.時間}\n\n`, [{
						"type": "postback",
						"title": "尋找上課地點",
						"payload": postback.courseIdInfo.generator(course => course.id)
					}, {
						"type": "postback",
						"title": "追蹤課程餘額",
						"payload": postback.courseIdFollow.generator(course => course.id)
					}
				]);
		} else {
            sendCourseNotFoundMessage(sender);
		}
	});
}

function sendHello(sender) {
    const helloMessage = "Hi";
	return sendMessage(sender, helloMessage);
}

function sendGoodbye(sender) {
	setTimeout(function () {
		sendTextMessage(sender, "如需再次使用小幫手，請點選下方選單，選擇你要使用的功能 👇🏻");
	}, 2000);
}

function sendDisableMsg(sender, dept_no) {
	sendTextMessage(sender, `很抱歉！此階段 ${dept_no} 課程未開放追蹤餘額！`);
}

function sendFuncCloseMsg(sender) {
	sendTextMessage(sender, `目前功能正在維護中～ 敬啟期待！`);
}

/**
 *
 * @param {Array} dataList
 * @param {Object} lastButton
 * @param {String} buttonType
 * @param {function} titleGenerator
 * @param {function} payloadGenerator
 */
function buttonsGenerator(dataList, lastButton, buttonType, titleGenerator, payloadGenerator) {
	var buttons = [];
	var aButton;
	dataList = dataList.splice(0, 30);
	if (lastButton && dataList.length === 30) dataList.pop();
	for (var index in dataList) {
		var aData = dataList[index];
		aButton = {
			"type": buttonType,
			"title": titleGenerator(aData),
			"payload": payloadGenerator(aData)
		};
		buttons.push(aButton);
	}
	if (lastButton) buttons.push(lastButton);
	buttons = buttons.splice(0, 30);
	return buttons;
}

/**
 *
 * @param {String} subtitle
 * @param {Array} buttons
 * @returns {Array} elements
 */
function elementsGenerator(subtitle, buttons) {
	var elements = [];
	var thisElement;
	var thisButtons;
	while (buttons.length > 0) {
		thisButtons = buttons.splice(0, 3);
		thisElement = {
			"title": "NCKUHUB",
			"subtitle": subtitle,
			"buttons": thisButtons
		};
		elements.push(thisElement);
	}
	elements = elements.splice(0, 10);
	return elements;
}

/**
 *
 * @param {String} subtitle
 * @param {Array} buttons
 */
function genericTemplateGenerator(subtitle, buttons) {
	return {
		"attachment": {
			"type": "template",
			"payload": {
				"template_type": "generic",
				"elements": elementsGenerator(subtitle, buttons)
			}
		}
	};
}

function sendNotVarify(sender, func) {
    sendTextMessage(sender, "「" + func + `」目前為鎖定狀態 🔐\n請將你的驗證碼輸入在下方文字框，傳送給我們以進行解鎖唷 🔓🔑\n\n解鎖說明 👉🏻${varifyDescriptionLink}\n提供心得 👉🏻 https://nckuhub.com`);
}

function sendCourseNotFoundMessage(sender) {
    sendTextMessage(sender, "Ooops！找不到這門課唷，請再次確認是否依照格式輸入，記得前面要加上 # 或 @ 符號喔 😄\n\n" +
        "追蹤餘額格式：「#課程名稱」\n「#選課序號」\n「#課程名稱（$系所）（%老師名）」\n\n 追蹤餘額範例：「#微積分」\n「#H3005」\n「#微積分 $工資 %王哈伯」\n\n" +
        "尋找教室格式：\n「@課程名稱」\n「@選課序號」\n「@課程名稱（$系所）（%老師名）」\n\n" +
        "尋找教室範例：\n「@微積分」\n「@H3005」\n「@微積分 $工資 %王哈伯」\n\n請依以上格式再次輸入，讓 NCKU HUB為你追蹤課程餘額 / 尋找上課教室 🏃🏃🏃");
}

function sendGenericTemplate(sender, subtitle, buttons) {
	return sendMessage(sender, genericTemplateGenerator(subtitle, buttons));
}

function sendLink(sender, link) {
	return sendButtonsMessage(sender, link.description, [{
		"type": "web_url",
		"url": link.url,
		"title": link.title,
		"webview_height_ratio": "tall"
	}]);
}

function sendButtonsMessage(sender, txt, buttons) {
	return sendMessage(sender, {
		"attachment": {
			"type": "template",
			"payload": {
				"template_type": "button",
				"text": txt,
				"buttons": buttons
			}
		}
	});
}

function sendTextMessage(sender, text, cb) {
	return sendMessage(sender, {
		text: text
	}, cb);
}

function sendImage(sender, imageUrl) {
    return sendMessage(sender, {
        "attachment":{
            "type": "image",
            "payload":{
              "url": imageUrl,
              "is_reusable":true
            }
        }
	});
}

function sendMessage(sender, message, cb) {
	return sendPostRequest({
		url: msg_url,
		json: {
			recipient: {
				id: sender
			},
			message: message,
			messaging_type: "RESPONSE"
		}
	}, cb);
}

function sendPostRequest(option, cb) {
	Object.assign(option, {
		method: "POST"
	});
	return sendRequest(option, cb);
}

function sendRequest(option, cb) {
	const url = option.url;
	const json = option.json;
	const method = option.method;
	let qs = option.qs || {};
	Object.assign(qs, {
		access_token: token
	});
	request({
		url,
		qs,
		method,
		json
	}, (error, response, body) => {
		if (error) {
			console.error('[Error | sending request]: ', error);
		} else if (response.body.error) {
			console.error('[Error | facebook reply]: ', response.body.error);
		} else if (cb) {
			cb(body);
		}
	});
}

module.exports = {
	router,
	broadcastMsg
};