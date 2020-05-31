var connection = require('./mysql.js');
connection = connection.connection;
var dbsystem = require('../model/dba');
var db = new dbsystem();
var dayjs = require('dayjs');
var api = require('./bot-api');
var helper = require('../helper');

const link = helper.verifyDescriptionLink
const host = "https://bot.nckuhub.com";

exports.verify = function verify(id, callback){
    let isVerify = false;
    db.select().field(["id"]).from("messenger_code").where("fb_id=", id).run((code, error)=>{
        if(error) console.log('messenger code error');
        if (code.length) 
            isVerify = true
        else
            isVerify = false
        
        console.log("是否解鎖: "+ isVerify);
        callback(isVerify)
    })
}

exports.checkCode = function checkCode(receiverId, input){
    db.select().field(["id"]).from("messenger_code").where("code=", input).run(function (code) {
        if (code.length > 0) {
            code = code[0];
            db.update().table("messenger_code").set({
                fb_id: receiverId,
                updated_at: dayjs().format('YYYY-MM-DD HH:mm:ss')
            }).where("id=", code.id).run(function (result) {
                api.sendTextMessage(receiverId, "恭喜你成功解鎖小幫手！立即點擊下方選單，選擇你想要使用的服務吧 🙌🏻 🙌🏻 🙌🏻");
                api.sendImage(receiverId, host + "/assets/images/howToUse.png");
            });
        } else {
            api.sendTextMessage(receiverId, `Ooops！驗證未成功，會不會是驗證碼輸入錯了呢？\n請再次將你的驗證碼輸入在下方文字框，傳送給我們以進行解鎖唷 🔓🔑\n\n${link}提供心得 👉🏻 nckuhub.com`);
        }
    });
}