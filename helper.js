var api = require('./model/bot-api');
const host = "https://bot.nckuhub.com";
const verifyDescriptionLink = "解鎖說明 👉🏻 https://reurl.cc/6mnrb\n";

exports.verifyDescriptionLink = verifyDescriptionLink
exports.fullChar2halfChar = function fullChar2halfChar (str) {
    var result = '';
    for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code >= 65281 && code <= 65373) {
            result += String.fromCharCode(str.charCodeAt(i) - 65248);
        } else if (code == 12288) {
            result += String.fromCharCode(str.charCodeAt(i) - 12288 + 32);
        } else {
            result += str.charAt(i);
        }
    }
    return result;
}

exports.handleKeyword = function handleKeyword(text, receiverId){
    
    if (text.indexOf("小幫手") != -1) {
        api.sendTextMessage(receiverId, "[Debug] 如需再次使用小幫手，請點選下方的選單點選你要使用的功能 👇🏻");
        api.sendImage(receiverId, host + "/assets/images/howToUse.png");
        return;
    } else if (text == "新增餘額追蹤") {
        if(config.status == 0){
            api.sendFuncCloseMsg(receiverId);
            return;
        } // 未開放情況
        api.sendTextMessage(receiverId, "馬上為你追蹤課程餘額 👌\n\n請輸入「完整課程名稱」或「選課序號」，格式為「#微積分」或「#H3005」\n\n你也可以加上「$系所」、「%老師名」，來精準搜尋課程，例如「#微積分 $工資 %王哈伯」\n\n－\n\n⚠️ 本功能無法保證 100% 零延遲，NCKU HUB 並不會為各位的選課結果負責。");
        return;
    } else if (text == "尋找上課教室") {
        api.sendTextMessage(receiverId, "馬上為你尋找上課教室 👌\n\n請輸入「完整課程名稱」或「選課序號」，格式為「@微積分」或「@H3005」\n\n你也可以加上「$系所」、「%老師名」，來精準搜尋課程，例如「@微積分 $工資 %王哈伯」");
        return;
    }
}