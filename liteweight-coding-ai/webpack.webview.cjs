const path = require("path");

module.exports = {
  mode: "production",
  entry: path.join(__dirname, "webview", "app", "main.js"),
  output: {
    path: path.join(__dirname, "webview", "dist"),
    filename: "webview.js",
    clean: true,
  },
  target: ["web", "es2020"],
  devtool: false,
};
