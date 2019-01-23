var express = require("express");
var path = require("path");
var helmet = require("helmet");
var engine = require("ejs-locals");
var bodyParser = require("body-parser");
var compression = require("compression");
var session = require("express-session");
var cookieParser = require("cookie-parser");
var config = require("./config");

var app = express();
app.engine("ejs", engine);
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(helmet());
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use("/assets", express.static("assets", {
    maxAge: 24 * 60 * 60
}));
app.use(cookieParser(config.secret.cookie));
app.use(session({
    cookie: {
        maxAge: 1000 * 60 * 60 * 12
    },
    secret: config.secret.session,
    saveUninitialized: true,
    resave: true
}));

app.use("/webhook", require("./routes/bot").router);
app.listen(process.env.PORT || 3000); //監聽3000port
console.log("running on port 3000");