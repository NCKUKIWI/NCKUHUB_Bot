function fullChar2halfChar (str) {
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

module.exports = {
    fullChar2halfChar: fullChar2halfChar
};