var request = require('request');
var config = require('../config');
var helper = require('../helper');

const apiVersion = "v3.1";
const msg_url = `https://graph.facebook.com/${apiVersion}/me/messages`;
const token = config.fb.token;
const link = helper.verifyDescriptionLink



exports.postback = {
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

exports.sendNotVerify = function sendNotVerify(recipient) {
    sendTextMessage(recipient, "你選擇的功能鎖定中 🔐\n\n欲使用本功能，請在下方文字框輸入你的驗證碼，以進行解鎖唷 🔓🔑\n\n" + link + "提供心得 👉🏻 nckuhub.com");
}

exports.sendLink = function sendLink(sender, link) {
	return sendButtonsMessage(sender, link.description, [{
		"type": "web_url",
		"url": link.url,
		"title": link.title,
		"webview_height_ratio": "tall"
	}]);
}

exports.sendCourseNotFoundMessage = function sendCourseNotFoundMessage(sender) {
    sendTextMessage(sender, "Ooops！找不到這門課，請確認是否依照格式輸入，記得前面要加上 # 或 @ 符號喔 😄\n\n－\n\n" +
        "追蹤餘額格式：\n「#課程名稱」\n「#選課序號」\n「#課程名稱 $系所 %老師」\n\n追蹤餘額範例：\n「#微積分」\n「#H3005」\n「#微積分 $工資 %王哈伯」\n\n－\n\n" +
        "尋找教室格式：\n「@課程名稱」\n「@選課序號」\n「@課程名稱 $系所 %老師」\n\n尋找教室範例：\n「@微積分」\n「@H3005」\n「@微積分 $工資 %王哈伯」\n\n－\n\n" +
        "請依以上格式再次輸入，讓 NCKU HUB 為你追蹤課程餘額、尋找上課教室 🏃🏃🏃");
}

exports.sendGenericTemplate = function sendGenericTemplate(sender, subtitle, buttons) {
	return sendMessage(sender, genericTemplateGenerator(subtitle, buttons));
}



exports.sendImage = function sendImage(recipient, imageUrl) {
	return sendMessage(recipient, {
		"attachment":{
			"type": "image",
			"payload":{
			  "url": imageUrl,
			  "is_reusable":true
			}
		}
	});
}
exports.sendGoodbye = function sendGoodbye(recipient) {
	setTimeout(function () {
		sendTextMessage(recipient, "如需再次使用，請點擊下方選單，選擇你要使用的功能 👇🏻");
	}, 2000);
}

exports.sendDisableMsg = function sendDisableMsg(recipient, dept_no) {
	sendTextMessage(recipient, `很抱歉！此階段 ${dept_no} 課程未開放追蹤餘額！`);
}

exports.sendFuncCloseMsg = function sendFuncCloseMsg(recipient) {
	sendTextMessage(recipient, `💤 目前非選課期間，小幫手沈睡中。本功能將在選課期間重新開放使用唷 ❗️`);
}

exports.courseTitle = function (course) {
    return `${course.系所名稱.replace(/[A-Z0-9]/g, "")} ${course.課程名稱.replace(/[（|）|\s]/g, "")} ${course.時間}`;
}

exports.buttonsGenerator = function buttonsGenerator(dataList, lastButton, buttonType, titleGenerator, payloadGenerator) {
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

function sendMessage(recipient, message) {
	return sendRequest({
		url: msg_url,
		json: {
			recipient: {
				id: recipient
			},
			message: message,
			messaging_type: "RESPONSE"
		}
	}, "POST");
}

function sendTextMessage(recipient, text) {
	return sendMessage(recipient, {
		text: text
	});
}

function sendRequest(option, method, cb) {
	const url = option.url;
	const json = option.json;
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

exports.sendTextMessage = sendTextMessage