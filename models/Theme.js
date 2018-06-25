const mongoose = require('mongoose');
const mongoConnection = require('../common/MongoConnection');
const ThemeSchema = new mongoose.Schema({
    name: String,
    image: String
});
// module.exports = mongoose.boomMobileDB.model('User', UserSchema);
module.exports = mongoConnection.getBoomMobileDB().model('Theme', UserSchema);