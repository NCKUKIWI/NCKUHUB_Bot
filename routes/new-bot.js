var express = require('express');
var helpler = require('../helper');
var config = require('../config');
var router = express.Router();
var api = require('../model/bot-api');
var userDB = require('../model/user-db');
var courseDB = require('../model/course-db');


const HOST = "https://bot.nckuhub.com";
const API_VERSION = "v3.1";
const MSG_URL = `https://graph.facebook.com/${API_VERSION}/me/messages`;
const FIXING_MSG = "同學你好，NCKU HUB 小幫手服務目前正在進行維修，歡迎密切關注粉專或設定搶先看，我們會在重新上線時發文公告 🙌🏻\n\n再次感謝對我們的支持 🙏🏻 如果有任何問題也可以直接回覆在此，我們會儘速為你解答 🚶🚶🚶";


const disable = config.bot.disable;
const dev = config.bot.dev;
var disableSQL = '';


///
var fix = false

///

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

courseDB.init((data, err) => {
    for (let i in data) {
        let courseNameTypeOne = data[i].課程名稱.replace(/一|二|三|四|五|六|七|八|九|\(|\)|\（|\）|\s/g, "");
        let courseNameTypeTwo = data[i].課程名稱.replace(/\(|\)|\（|\）|\s/g, "");
        if (courseNameList.indexOf(courseNameTypeOne) == -1) {
            courseNameList.push(courseNameTypeOne);
        }
        if (courseNameList.indexOf(courseNameTypeTwo) == -1) {
            courseNameList.push(courseNameTypeTwo);
        }
        courseSerialList.push(data[i].選課序號);
    }
    console.log('Finish init\n');
})


router.get('/', function (req, res) {
    if (req.query['hub.verify_token'] === config.fb.webhook) {
        res.send(req.query['hub.challenge']);
    } else {
        res.send('Error, wrong token');
    }
});

router.post('/', function (req, res) {
    let entries = req.body.entry;
    entries.forEach((entry) => {
        if (entry.hasOwnProperty('messaging')) {
            entry.messaging.forEach(event => {

                let isVerify = false;
                let sender = event.sender.id; //使用者messenger id
                let Feature = courseDB.Feature

                if (event.message && event.message.text && !event.message.is_echo) {
                    var text = helpler.fullChar2halfChar(event.message.text); //用戶傳送的訊息

                    console.log(`[粉專私訊] 私訊者：${sender}`);
                    console.log(`訊息：${text.replace(/\n/, "\\n")}`);

                    helpler.handleKeyword(text, sender)

                    userDB.verify(sender, (isVerify) => {
                        if (isVerify || dev) {
                            
                            let serial = text.replace(/[\s|\-]/g, "").match(/^[a-zA-Z][0-9]{4}/i);
                            let dpt = text.match(/[\$|\uff04][\u4e00-\u9fa5]{1,}/i); //檢查 $系所名稱
                            let teacher = text.match(/[\%|\uff05][\u4e00-\u9fa5]{1,}/i); //檢查 %老師名稱
                            text = text.replace(/一|二|三|四|五|六|七|八|九|\(|\)|\（|\）|\s/g, "");

                            // delete dep, teacher prefix
                            if (dpt) 
                                dpt = dpt[0].replace(/[\$|\uff04|\s]/g, "");
                            if (teacher)
                                teacher = teacher[0].replace(/[\%|\uff05|\s]/g, "");

                            /// Without prefix
                            if (serial && (courseSerialList.indexOf(serial[0].toUpperCase()) !== -1)) {
                                courseDB.askPlaceOrFollow(sender, serial[0]);
                                return;
                            } else if (courseNameList.indexOf(text.replace(/\s/g, "")) != -1) { // 輸入課名
                                // debug here
                                courseDB.searchCourseBy(Feature.NAME, sender, text);
                                return;
                            } else if (text.match(/^[\%|\uff05][\u4e00-\u9fa5]{1,}/i)) {
                                // debug here
                                courseDB.searchCourseBy(Feature.TEACHER, sender, teacher);
                                return;
                            }

                            /// With prefix
                            let placePrefix = text.match(/^[\uff20|@]/i)
                            let followPrefix = text.match(/^[\uff03|#]/i)
                            let courseName = text.match(/[\u4e00-\u9fa5]{1,}/i); //檢查 課程名稱
                            let courseSerial = text.match(/[a-zA-Z0-9]{5}/i); //檢查 選課序號

                            if (placePrefix) {
                                if (courseName) {
                                    courseName = courseName[0].replace(/[\uff20|@|\s]/g, "");
                                    courseDB.sendByName(Feature.PREFIX_AT, sender, courseName, dpt, teacher); 
                                } else if (courseSerial) {
                                    courseSerial = courseSerial[0].replace(/[\uff20|@|\s]/g, "");
                                    courseDB.sendById(Feature.PREFIX_AT, sender, courseSerial);
                                }else{
                                    api.sendCourseNotFoundMessage(sender);
                                }
                            } else if (followPrefix) {
                                if (courseName) {
                                    courseName = courseName[0].replace(/[#|\uff03|\s]/g, "");
                                    courseDB.sendByName(Feature.PREFIX_HASHTAG, sender, courseName, dpt, teacher); 
                                }
                                else if (courseSerial) {
                                    courseSerial = courseSerial[0].replace(/[#|\uff03|\s]/g, "");
                                    courseDB.sendById(Feature.PREFIX_HASHTAG, sender, courseSerial); 
                                }else{
                                    api.sendCourseNotFoundMessage(sender);
                                }
                            } else{
                                api.sendCourseNotFoundMessage(sender);
                            }
                        } else if (!isVerify && text.length > 15 && text.substring(0, 7) == "nckuhub") {
                            userDB.checkCode(sender, text)
                        } else {
                            api.sendNotVerify(sender);
                            return;
                            // not been verified
                        }
                    })
                }else if (event.postback) {  //點擊我們提供的按鈕
                    console.log(`[粉專按鈕] 點擊者：${sender}`);
                    console.log("按鈕payload: " + event.postback.payload);
                } 
            })
        }
    })
    res.sendStatus(200);
})



module.exports = {
    router,
};