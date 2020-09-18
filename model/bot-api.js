var request = require('request');
var config = require('../config');
var helper = require('../helper');
var courseDB = require('./course-db');

const apiVersion = "v3.1";
const msg_url = `https://graph.facebook.com/${apiVersion}/me/messages`;
const token = config.fb.token;
var link = "解鎖說明 👉🏻 https://reurl.cc/6mnrb\n"
const fixMsg = "同學你好 👋\n\n我們正在準備全新的官網跟功能，所以小幫手會晚一點跟大家見面（ 希望是在這週啦～）\n\n嶄新的小幫手會與官網的功能串連，採取 ＃互助機制：你需要先至「 nckuhub.com 」 ＃填寫三篇課程心得，小幫手才會為你開放功能，讓你追蹤課程餘額更方便。\n\n－\n\n所以在等待上線的這些期間，請大家先用原本的方式選課，沒有餘額追蹤日子一樣可以過。\n\n＃習慣免費好用的服務？那請先填寫心得，所有的校園改善都需要我們一起貢獻。\n\n一旦我們把功能都修復完成，會在第一時間 ＃於粉專公告，大家可以設個「搶先看」就不會漏掉了。\n\n立即填心得，為成大環境努力 👉🏻 https://nckuhub.com";


const Ops = {
	index:{
        LIST: 0,
        FOLLOW_HINT: 1,
        PLACE_HINT: 2
	},
	func:[
		{
			name: "followList",
			generator: dataGetter => data => `L${dataGetter(receiver)}`,
			matcher: data => data.match(/^L/i), //抓payload中的 course_id 用來追蹤課程
			replacer: data => data.replace(/L|\s/g, ""),
			do: (receiver) => courseDB.sendFollowList(receiver) 
		},{
			name: "followHint",
			generator: dataGetter => data => `listHint`,
			matcher: data => data.match(/followHint/i), //抓payload中的 course_id 用來傳送單一課程詳細資訊
			do: (receiver) => sendTextMessage(receiver, helper.followHint)
		},{
			name: "placeHint",
			generator: dataGetter => data => `placeHint`,
			matcher: data => data.match(/placeHint/i), //抓payload中的 course_id 用來取消追蹤課程
			do: (receiver) =>  sendTextMessage(receiver, helper.placeHint)
		},{
			name: "cancelfollow",
			generator: dataGetter => data => `cancelfollow`,
			matcher: data => data.match(/cancelfollow/i), //抓payload中的 course_id 用來取消追蹤課程
			do: (receiver) =>  courseDB.sendFollowList(receiver) 
		}

	]
}

exports.helpBtn = function helpBtn(payload, receiver){
	for (let f of Ops.func) {
		if(f.matcher(payload)){
            f.do(receiver)
            return true;
		}
	}
	return null;
}

exports.sendNotVerify = function sendNotVerify(recipient) {
	console.log(link);
	
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

exports.sendFixMsg = function sendFixMsg(recipient) {
	sendTextMessage(recipient, fixMsg);
}

exports.sendHelp = function sendHelp(recipient){
	helpBtn = [
		{
			"type": "postback",
			"title": "追蹤課程餘額",
			"payload": "followHint"
		},
		{
		"type": "postback",
		"title": "取消追蹤課程",
		"payload": "L"+recipient
	},{
		"type": "postback",
		"title": "尋找上課地點",
		"payload": "placeHint"
	}
	]
	sendGenericTemplate(recipient, "您好！\n需要幫忙嗎？",helpBtn);
}

exports.sendCourseNotFoundMessage = function sendCourseNotFoundMessage(sender) {
	sendTextMessage(sender, "Ooops！找不到這門課，請確認是否依照格式輸入，記得前面要加上 # 或 @ 符號喔 😄\n\n－\n\n" +
		helper.followHint +
		helper.placeHint +
		"請依以上格式再次輸入，讓 NCKU HUB 為你追蹤課程餘額、尋找上課教室 🏃🏃🏃");
}


exports.sendImage = function sendImage(recipient, imageUrl) {
	return sendMessage(recipient, {
		"attachment": {
			"type": "image",
			"payload": {
				"url": imageUrl,
				"is_reusable": true
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

exports.getListBtn = function getListBtn(dataList, payloadGenerator) {
	let buttons = [];
	let lastBtn = {
		"type": "postback",
		"title": "全部取消追蹤",
		"payload": "cancelall",
	}
	
	dataList = dataList.splice(0, 30);
	if (lastBtn && dataList.length === 30) dataList.pop();
	
	for (let index in dataList) {
		let data = dataList[index];
		let btn = {
			"type": "postback",
			"title": `${data.content.replace(/\uff0f/g, " ")} ${data.serial}`,
			"payload": payloadGenerator(data => data.course_id)(data)
		};
		buttons.push(btn);
	}
	buttons.push(lastBtn);
	buttons = buttons.splice(0, 30);
	return buttons;
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
			"title": "NCKU HUB",
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

function sendGenericTemplate(sender, subtitle, buttons) {
	return sendMessage(sender, genericTemplateGenerator(subtitle, buttons));
}

exports.sendTextMessage = sendTextMessage
exports.sendGenericTemplate = sendGenericTemplate