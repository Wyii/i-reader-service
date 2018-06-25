const mongoose = require('mongoose');
const mongoConnection = require('../common/MongoConnection');
const FeedSchema = new mongoose.Schema({
    _id: String,
    themes: []
});
// module.exports = mongoose.boomMobileDB.model('User', UserSchema);
module.exports = mongoConnection.getBoomMobileDB().model('Theme', UserSchema);