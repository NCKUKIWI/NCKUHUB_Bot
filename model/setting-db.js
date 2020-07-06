var connection = require('./mysql.js');
connection = connection.connection;
var dbsystem = require('./dba');
var db = new dbsystem();

exports.getCrawlerStatus = function getCrawlerStatus(cb){
    db.select().field(["status"]).from("setting").where("id=", 1).run((res, error)=>{
        console.log(res);
        cb(res);
    })
}

exports.setCrawlerStatus = function setCrawlerStatus(stat){
    db.update().table("setting").set({
        status: stat
    }).where("id=", 1).run(function (result) {
    });
    
}