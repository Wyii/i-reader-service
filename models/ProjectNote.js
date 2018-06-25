const mongoose = require('mongoose');
const mongoConnection = require('../common/MongoConnection');
const ProjectNoteSchema = new mongoose.Schema({
    _id: String,
    openId: String,
    pid: String,
    notedDate: Date,
    start: Number,
    end: Number,
    text: String
});

module.exports = mongoConnection.getBoomMobileDB().model('ProjectNote', ProjectCollectSchema);